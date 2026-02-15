# douban-sync-skill

[![ClawHub](https://img.shields.io/badge/ClawHub-douban--sync--skill-blue?logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K)](https://clawhub.ai/skills/douban-sync-skill)
[![ClawHub version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fclawhub.ai%2Fapi%2Fv1%2Fskills%2Fdouban-sync-skill&query=%24.skill.tags.latest&label=clawhub&prefix=v&color=blue)](https://clawhub.ai/skills/douban-sync-skill)
[![ClawHub downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fclawhub.ai%2Fapi%2Fv1%2Fskills%2Fdouban-sync-skill&query=%24.skill.stats.downloads&label=clawhub%20downloads&color=blue)](https://clawhub.ai/skills/douban-sync-skill)
[![GitHub stars](https://img.shields.io/github/stars/cosformula/douban-sync-skill?style=flat&logo=github)](https://github.com/cosformula/douban-sync-skill)
[![License](https://img.shields.io/github/license/cosformula/douban-sync-skill)](./LICENSE)
[![CI](https://github.com/cosformula/douban-sync-skill/actions/workflows/ci.yml/badge.svg)](https://github.com/cosformula/douban-sync-skill/actions/workflows/ci.yml)
[![Publish to ClawHub](https://github.com/cosformula/douban-sync-skill/actions/workflows/clawhub-publish.yml/badge.svg)](https://github.com/cosformula/douban-sync-skill/actions/workflows/clawhub-publish.yml)

豆瓣书影音游戏标记数据导出与增量同步工具。支持全量导出和 RSS 增量同步，输出 CSV 格式。

可作为 [OpenClaw](https://github.com/openclaw/openclaw) / [AgentSkills](https://agentskills.io) 的 skill 使用，也可独立运行。

## 功能

- **全量导出**：抓取豆瓣个人主页的所有标记数据（书、影视、音乐、游戏）
- **增量同步**：通过 RSS 每日同步新标记，无需登录
- **CSV 输出**：结构化数据，方便导入 Excel/Obsidian/数据库
- **多用户支持**：按用户 ID 分目录存储
- **去重**：按 URL 去重，多次运行安全

## 输出格式

```
douban-sync/
└── {user_id}/
    ├── 书.csv
    ├── 影视.csv
    ├── 音乐.csv
    └── 游戏.csv
```

CSV 列：`title,url,date,rating,status,comment`

## 安装

### Via npx skills (any agent)

```bash
npx skills add cosformula/douban-sync-skill
```

### Via ClawHub (OpenClaw)

```bash
clawhub install douban-sync-skill
```

### Manual

```bash
git clone https://github.com/cosformula/douban-sync-skill.git
```

## 使用

### 增量同步（推荐日常使用）

```bash
DOUBAN_USER=your_douban_id node scripts/douban-rss-sync.mjs
```

环境变量：
- `DOUBAN_USER`（必填）：豆瓣用户 ID
- `DOUBAN_OUTPUT_DIR`（可选）：输出根目录，默认 `~/douban-sync`。文件会写入 `$DOUBAN_OUTPUT_DIR/$DOUBAN_USER/` 下

### 全量导出

```bash
# HTTP 直接抓取（可能被限速）
DOUBAN_USER=your_douban_id node scripts/douban-scraper.mjs

# 通过浏览器 CDP 抓取（需要 puppeteer-core + 已登录的浏览器）
DOUBAN_USER=your_douban_id node scripts/douban-browser-scraper.mjs
```

### 从 Markdown 迁移到 CSV

如果之前用的是 Markdown 格式的导出数据：

```bash
DOUBAN_USER=your_douban_id node scripts/migrate-md-to-csv.mjs
```

## 安全注意事项

- `douban-browser-scraper.mjs` 通过 CDP 连接本地浏览器（默认 `http://127.0.0.1:18800`），仅在你自己启动的本地浏览器上使用，不要暴露调试端口到网络
- 如果只需要增量同步，`douban-rss-sync.mjs` 不需要登录，风险最低

## 作为 OpenClaw Skill 使用

将此目录放在 OpenClaw workspace 的 `skills/` 下即可自动识别。

## License

MIT
