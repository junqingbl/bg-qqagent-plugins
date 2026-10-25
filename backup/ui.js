/**
 * 备份 · 设置页
 * 看云端有几份、立即打一份、点下载存到电脑。
 */
const ID = 'backup'

const FIELDS = [
  { key: 'sources', label: '备份哪些目录', type: 'list', hint: '逗号分隔，相对程序根目录。默认 data,diary,plugins' },
  { key: 'keep', label: '保留几份', type: 'number', hint: '超出的自动删最旧的，1~60' },
  { key: 'autoDaily', label: '每天自动备份', type: 'bool', hint: '服务开着就会在设定时间打一份' },
  { key: 'autoHour', label: '几点打（0~23）', type: 'number', hint: '默认 4 点，这时候一般没人聊天' },
  { key: 'dir', label: '存放目录', type: 'text', hint: '相对程序根目录，默认 backups' },
  { key: 'format', label: '格式', type: 'select', options: [['zip', 'zip（Windows 双击能开）'], ['tar.gz', 'tar.gz（小一点）']] }
]

const esc0 = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export async function mount(root, ctx) {
  const esc = ctx?.esc || esc0
  const toast = ctx?.toast || (() => {})

  let st = null
  async function refresh() {
    try {
      const r = await fetch('/api/plugins/' + ID + '/status')
      st = await r.json()
    } catch {
      st = null
    }
  }

  async function loadConfig() {
    try {
      const r = await fetch('/api/plugins')
      const j = await r.json()
      const list = j.plugins || j.items || []
      const me = list.find((p) => p.id === ID)
      return (me && me.config) || {}
    } catch {
      return {}
    }
  }

  async function save(patch) {
    const r = await fetch('/api/plugins/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ID, patch })
    })
    const j = await r.json().catch(() => ({}))
    if (j && j.ok === false) throw new Error(j.error || '保存失败')
    return j
  }

  await refresh()
  const cfg = await loadConfig()

  function fileRows() {
    const files = st?.files || []
    if (!files.length) return '<div class="muted" style="padding:10px 0">还没有备份。点上面的「立即备份」先打一份。</div>'
    return files.map((f) => {
      const url = '/api/plugins/' + ID + '/file?name=' + encodeURIComponent(f.name)
      return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border,#3333)">'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:13px;word-break:break-all">' + esc(f.name) + '</div>'
        + '<div class="muted" style="font-size:12px">' + esc(f.sizeText) + ' · ' + esc(f.timeText) + '</div>'
        + '</div>'
        + '<a href="' + url + '" download="' + esc(f.name) + '" style="text-decoration:none"><button type="button">下载</button></a>'
        + '<button type="button" data-del="' + esc(f.name) + '" class="muted">删</button>'
        + '</div>'
    }).join('')
  }

  function rows() {
    return FIELDS.map((f) => {
      const v = cfg[f.key]
      if (f.type === 'bool') {
        return '<div style="display:flex;align-items:center;gap:10px;margin:10px 0">'
          + '<label style="flex:1">' + esc(f.label) + '</label>'
          + '<input type="checkbox" data-k="' + f.key + '" data-t="bool"' + (v ? ' checked' : '') + '>'
          + '</div>'
      }
      if (f.type === 'select') {
        return '<div style="margin:10px 0">'
          + '<label style="display:block;margin-bottom:4px">' + esc(f.label) + '</label>'
          + '<select data-k="' + f.key + '" data-t="str">'
          + (f.options || []).map(([val, label]) => '<option value="' + esc(val) + '"' + (String(v) === val ? ' selected' : '') + '>' + esc(label) + '</option>').join('')
          + '</select>'
          + (f.hint ? '<div class="muted" style="font-size:12px;margin-top:4px">' + esc(f.hint) + '</div>' : '')
          + '</div>'
      }
      const isList = f.type === 'list'
      const val = isList ? (Array.isArray(v) ? v.join(',') : String(v || '')) : (v === undefined || v === null ? '' : v)
      return '<div style="margin:10px 0">'
        + '<label style="display:block;margin-bottom:4px">' + esc(f.label) + '</label>'
        + '<input type="' + (f.type === 'number' ? 'number' : 'text') + '" data-k="' + f.key + '" data-t="' + (isList ? 'list' : f.type === 'number' ? 'num' : 'str') + '" value="' + esc(val) + '" style="width:100%">'
        + (f.hint ? '<div class="muted" style="font-size:12px;margin-top:4px">' + esc(f.hint) + '</div>' : '')
        + '</div>'
    }).join('')
  }

  const last = st?.last
  const lastLine = !last
    ? '还没跑过'
    : last.ok
      ? '上次 ' + esc(last.timeText || '') + ' · ' + esc(last.sizeText || '') + ' · ' + esc(last.reason === 'auto' ? '自动' : '手动')
      : '上次失败了：' + esc(last.error || '')

  root.innerHTML = ''
    + '<div style="padding:4px 2px">'
    + '<h3 style="margin:0 0 10px">备份</h3>'
    + '<div class="muted" style="font-size:13px;margin-bottom:12px">插件在云端打包，打包完留在这台服务器上。要拿到电脑上，点下面文件右边的「下载」。</div>'

    + '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:12px">'
    + '<div><div class="muted" style="font-size:12px">上次</div><div style="font-size:13px">' + lastLine + '</div></div>'
    + '<div><div class="muted" style="font-size:12px">云端现有</div><div style="font-size:13px">' + (st?.files?.length || 0) + ' 份</div></div>'
    + '<div><div class="muted" style="font-size:12px">格式</div><div style="font-size:13px">' + esc(st?.format || '?') + '</div></div>'
    + '<button id="bk-run" type="button" style="margin-left:auto">立即备份</button>'
    + '</div>'

    + '<div id="bk-list">' + fileRows() + '</div>'

    + '<div style="border-top:1px solid var(--border,#3333);margin:16px 0;padding-top:12px">'
    + '<div style="font-weight:600;margin-bottom:4px">设置</div>'
    + rows()
    + '<div style="display:flex;gap:8px;margin-top:12px">'
    + '<button id="bk-save" type="button">保存</button>'
    + '</div>'
    + '</div>'

    + '<div style="border-top:1px solid var(--border,#3333);margin:16px 0;padding-top:12px">'
    + '<div class="muted" style="font-size:12px;line-height:1.7">'
    + '· 备份里含 <code>data/config.json</code>，里面有 API key，<b>别把备份发给别人</b>。<br>'
    + '· 恢复到电脑：解压后把 data / diary / plugins 放回程序目录即可。<br>'
    + '· 想每天自动取到电脑，用配套的「备份到电脑.bat」拉 latest。'
    + '</div>'
    + '</div>'
    + '</div>'

  const $ = (s) => root.querySelector(s)

  $('#bk-run')?.addEventListener('click', async () => {
    const btn = $('#bk-run')
    if (btn) { btn.disabled = true; btn.textContent = '打包中…' }
    try {
      const r = await fetch('/api/plugins/' + ID + '/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const j = await r.json()
      if (j.ok) toast('打好了：' + j.name)
      else toast('没打上：' + (j.error || '未知'))
      await refresh()
      $('#bk-list').innerHTML = fileRows()
      bindDelete()
    } catch (e) {
      toast('出错：' + (e?.message || e))
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '立即备份' }
    }
  })

  function bindDelete() {
    root.querySelectorAll('button[data-del]').forEach((b) => {
      b.addEventListener('click', async () => {
        const name = b.dataset.del
        if (!confirm('删掉 ' + name + '？')) return
        try {
          const r = await fetch('/api/plugins/' + ID + '/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
          })
          const j = await r.json()
          if (j.ok) {
            toast('删了')
            await refresh()
            $('#bk-list').innerHTML = fileRows()
            bindDelete()
          } else {
            toast('没删掉：' + (j.error || '未知'))
          }
        } catch (e) {
          toast('出错：' + (e?.message || e))
        }
      })
    })
  }

  $('#bk-save')?.addEventListener('click', async () => {
    const patch = {}
    root.querySelectorAll('[data-k]').forEach((el) => {
      const k = el.dataset.k
      const t = el.dataset.t
      if (t === 'bool') patch[k] = el.checked
      else if (t === 'num') patch[k] = Number(el.value)
      else if (t === 'list') patch[k] = el.value.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean)
      else patch[k] = el.value.trim()
    })
    try {
      await save(patch)
      toast('存好了')
      await refresh()
    } catch (e) {
      toast('没存上：' + (e?.message || e))
    }
  })

  bindDelete()
}
