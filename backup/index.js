/**
 * 备份：把云端的数据打包，留在服务器上。
 *
 * 插件跑在云端，碰不到你电脑的硬盘——所以它负责「打包 + 保留 + 给下载」，
 * 电脑那边负责「取走」：面板里点下载，或者用配套的 bat 拉 latest。
 *
 * 目录结构（默认）：
 *   <root>/backups/luoluo-20261025-040000.zip
 *   <root>/backups/latest.zip          ← 指向最新一份，方便脚本直接拉
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

const DEFAULTS = {
  dir: 'backups',
  sources: ['data', 'diary', 'plugins'],
  keep: 7,
  autoDaily: true,
  autoHour: 4,
  format: 'zip'
}

function pad(n) {
  return String(n).padStart(2, '0')
}

function stamp(d = new Date()) {
  // 带毫秒：连续点两次也不会撞名
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-'
    + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
    + '-' + String(d.getMilliseconds()).padStart(3, '0')
}

function ymd(d = new Date()) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function humanSize(n) {
  const b = Number(n) || 0
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1024 / 1024).toFixed(2) + ' MB'
}

export async function activate(ctx) {
  const root = ctx.root
  const loadCfg = () => ({ ...DEFAULTS, ...(ctx.config?.get?.() || {}) })

  function backupDir() {
    const d = String(loadCfg().dir || DEFAULTS.dir)
    return path.isAbsolute(d) ? d : path.join(root, d)
  }

  // ── 这台机器能打包吗 ──
  let hasZip = false
  let hasTar = false
  try {
    await run('sh', ['-c', 'command -v zip'], { timeout: 5000 })
    hasZip = true
  } catch { /* 没有 zip */ }
  try {
    await run('sh', ['-c', 'command -v tar'], { timeout: 5000 })
    hasTar = true
  } catch { /* 没有 tar */ }

  let running = false

  function listFiles() {
    const dir = backupDir()
    try {
      return fs.readdirSync(dir)
        .filter((f) => /\.(zip|tar\.gz)$/.test(f) && !f.startsWith('latest'))
        .map((f) => {
          const st = fs.statSync(path.join(dir, f))
          return { name: f, size: st.size, sizeText: humanSize(st.size), mtime: st.mtimeMs, timeText: new Date(st.mtimeMs).toLocaleString('zh-CN') }
        })
        .sort((a, b) => b.mtime - a.mtime)
    } catch {
      return []
    }
  }

  function pickFormat() {
    const want = String(loadCfg().format || 'zip')
    if (want === 'tar.gz') return hasTar ? 'tar.gz' : (hasZip ? 'zip' : '')
    return hasZip ? 'zip' : (hasTar ? 'tar.gz' : '')
  }

  async function doBackup(reason = 'manual') {
    if (running) return { ok: false, error: '正在打包，等这一份结束' }
    const cfg = loadCfg()
    const dir = backupDir()
    const fmt = pickFormat()
    if (!fmt) return { ok: false, error: '这台机器既没有 zip 也没有 tar，打不了包' }

    const wanted = Array.isArray(cfg.sources) ? cfg.sources : DEFAULTS.sources
    const sources = wanted
      .map((s) => String(s).trim())
      .filter(Boolean)
      .filter((s) => {
        try {
          return fs.existsSync(path.join(root, s))
        } catch {
          return false
        }
      })
    if (!sources.length) return { ok: false, error: '配置里没有一个存在的目录可以备份' }

    running = true
    const startedAt = Date.now()
    const name = `luoluo-${stamp()}.${fmt}`
    const tmp = path.join(dir, `.${name}.part`)
    try {
      fs.mkdirSync(dir, { recursive: true })

      if (fmt === 'zip') {
        await run('zip', ['-r', '-q', tmp, ...sources, '-x', '*/node_modules/*', '-x', '*.part'], {
          cwd: root,
          timeout: 180000,
          maxBuffer: 16 * 1024 * 1024
        })
      } else {
        await run('tar', ['-czf', tmp, '--exclude=node_modules', '--exclude=backups', '-C', root, ...sources], {
          timeout: 180000,
          maxBuffer: 16 * 1024 * 1024
        })
      }

      const out = path.join(dir, name)
      fs.renameSync(tmp, out)

      // latest：先尽量软链，不行就复制
      const latest = path.join(dir, `latest.${fmt}`)
      try { fs.unlinkSync(latest) } catch { /* 没有旧的 */ }
      try {
        fs.symlinkSync(name, latest)
      } catch {
        try { fs.copyFileSync(out, latest) } catch { /* 复制失败也不影响主文件 */ }
      }

      // 清掉超过保留数的旧包
      const keep = Math.max(1, Math.min(60, Number(cfg.keep) || DEFAULTS.keep))
      for (const f of listFiles().slice(keep)) {
        try { fs.unlinkSync(path.join(dir, f.name)) } catch { /* 删不掉就算了 */ }
      }

      const st = fs.statSync(out)
      const info = {
        ok: true,
        name,
        size: st.size,
        sizeText: humanSize(st.size),
        seconds: ((Date.now() - startedAt) / 1000).toFixed(1),
        reason,
        sources,
        format: fmt
      }
      ctx.state.set('last', { ...info, at: Date.now(), timeText: new Date().toLocaleString('zh-CN') })
      ctx.log(`备份完成：${name}（${humanSize(st.size)}，${info.seconds}s，${reason}）`)
      return info
    } catch (error) {
      try { fs.unlinkSync(tmp) } catch { /* 半成品删掉 */ }
      const message = String(error?.message ?? error)
      ctx.state.set('last', { ok: false, error: message, at: Date.now(), reason })
      ctx.log('备份失败：' + message)
      return { ok: false, error: message }
    } finally {
      running = false
    }
  }

  // ── 每天自动打一份 ──
  async function autoTick() {
    if (!loadCfg().autoDaily) return
    const cfg = loadCfg()
    const hour = Math.max(0, Math.min(23, Number(cfg.autoHour) ?? DEFAULTS.autoHour))
    const now = new Date()
    if (now.getHours() < hour) return
    const today = ymd(now)
    const mark = ctx.state.get('auto') || {}
    if (mark.lastDay === today) return
    const out = await doBackup('auto')
    if (out.ok) ctx.state.set('auto', { lastDay: today, at: Date.now(), name: out.name })
  }

  ctx.scheduler.every(30 * 60 * 1000, autoTick)
  setTimeout(autoTick, 60 * 1000).unref?.()

  // ── 给面板的接口 ──
  ctx.http.route('GET', '/status', () => {
    const cfg = loadCfg()
    return {
      ok: true,
      config: cfg,
      dir: backupDir(),
      format: pickFormat(),
      tools: { zip: hasZip, tar: hasTar },
      running,
      last: ctx.state.get('last') || null,
      files: listFiles()
    }
  })

  ctx.http.route('POST', '/run', async () => {
    const out = await doBackup('manual')
    return { ...out, files: listFiles() }
  })

  ctx.http.route('POST', '/delete', (req, body) => {
    const name = String(body?.name || '')
    if (!name || /[\\/]/.test(name) || name.includes('..')) return { ok: false, error: '文件名不合法' }
    if (!/\.(zip|tar\.gz)$/.test(name)) return { ok: false, error: '只能删备份文件' }
    try {
      fs.unlinkSync(path.join(backupDir(), name))
      return { ok: true, files: listFiles() }
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) }
    }
  })

  ctx.http.route('GET', '/file', (req, body, url) => {
    const name = String(url?.searchParams?.get('name') || '')
    if (!name || /[\\/]/.test(name) || name.includes('..')) return { ok: false, error: '文件名不合法' }
    const p = path.join(backupDir(), name)
    if (!fs.existsSync(p)) return { ok: false, error: '没有这一份' }
    return {
      __raw: true,
      buffer: fs.readFileSync(p),
      filename: name,
      contentType: name.endsWith('.zip') ? 'application/zip' : 'application/gzip'
    }
  })

  ctx.log(`备份已就绪：放在 ${backupDir()}，每天 ${loadCfg().autoHour} 点打一份，留 ${loadCfg().keep} 份`)
  return { dispose() {} }
}
