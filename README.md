# 云端备份插件（backup）

> 给 [BG-QQagent](https://github.com/BG-QQagent) 插件内核用：把云端的数据定时打包，留在服务器上，需要的时候取到电脑。

插件跑在服务器上，**碰不到你电脑的硬盘**。所以它分成两半：云端负责打包和保留，电脑那头负责取走。

## 装

把 `backup/` 整个目录放进程序的 `plugins/` 下，重启，面板会多一个「备份」页签。

需要内核 `apiVersion: 1`。

**注意**：`manifest.json` 里只写 `"ui": "ui.js"` 是不够的，还必须写 `uiTab`——内核只从「已注册页签」里找界面文件。

## 它做什么

- 每天 4 点（可改）把 `data/` `diary/` `plugins/` 打成一个 zip
- 只留最近 7 份（可改），旧的自动删
- `backups/latest.zip` 永远指向最新那份，方便脚本直接拉
- 面板里能立即备份、下载、删除

## 拿到电脑上

**手动**：面板点文件右边的「下载」。

**半自动**：服务器上永远有一个 `latest.zip`，一条 scp 就够：

```bash
scp root@你的服务器:/opt/qq-agent-bg/backups/latest.zip ./
```

Windows 上可以配个计划任务每天拉一次，或者双击一个 bat。

## 配置项

| 键 | 默认 | 说明 |
|:--|:--|:--|
| `dir` | `backups` | 备份放哪，相对程序根目录 |
| `sources` | `["data","diary","plugins"]` | 备份哪些目录，不存在的会跳过 |
| `keep` | `7` | 留几份，1~60 |
| `autoDaily` | `true` | 每天自动备份 |
| `autoHour` | `4` | 几点打（0~23） |
| `format` | `zip` | `zip` 或 `tar.gz`；没有 zip 命令时自动退到 tar.gz |

## 两个提醒

1. **备份里有 API key**：`data/config.json` 是明文，里面有模型密钥。备份别外发。
2. 备份不含 `node_modules`，恢复后要重新 `npm install`。恢复是手动动作：解压，把 `data/` `diary/` `plugins/` 放回程序目录，重启。插件故意不做「一键恢复」——那个点错了代价太大。

## 结构

```
backups/
  luoluo-20261025-040000.zip
  luoluo-20261024-040000.zip
  latest.zip -> luoluo-20261025-040000.zip
```

更细的说明（结构、命名、为什么这么拆）在 [backup/README.md](backup/README.md)。

## 许可证

MIT
