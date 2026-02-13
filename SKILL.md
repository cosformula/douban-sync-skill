---
name: douban-sync
description: Export and sync Douban (豆瓣) book/movie/music collections to local Markdown files (Obsidian-compatible). Use when the user wants to export their Douban reading/watching/listening history, set up incremental sync via RSS, or manage their Douban data locally.
---

# Douban Sync

Export Douban collections (books, movies, music) to Markdown and keep them in sync via RSS.

## Two Modes

### 1. Full Export (first time)

Use the browser tool to scrape all collection pages. Requires the user to be logged into Douban.

```
browser → douban.com/people/{USER_ID}/{category}?start=0&sort=time&mode=list
```

Categories and URL paths:
- Books: `book.douban.com/people/{ID}/collect` (读过), `/do` (在读), `/wish` (想读)
- Movies: `movie.douban.com/people/{ID}/collect` (看过), `/do` (在看), `/wish` (想看)
- Music: `music.douban.com/people/{ID}/collect` (听过), `/do` (在听), `/wish` (想听)

Each page shows 30 items in list mode. Paginate with `?start=0,30,60...` until no items returned.

**Rate limiting:** Wait 2-3 seconds between pages. If blocked, wait 30 seconds and retry.

**Parse each item:**
- Title + link from `.title a`
- Rating from `span[class*="rating"]` (rating1-5 → ★-★★★★★)
- Date from `.date` text (YYYY-MM-DD)
- Short comment from `.comment`

### 2. Incremental Sync (daily, via RSS)

Run `scripts/douban-rss-sync.js` — no login needed.

```bash
node scripts/douban-rss-sync.js
```

**Setup:** Set environment variables or edit the script constants:
- `DOUBAN_USER`: Douban user ID (default: read from script)
- `OBSIDIAN_DIR`: Output directory for Markdown files

**Recommended:** Add a daily cron job for automatic sync.

## Output Format

One Markdown file per category in the output directory:

```
豆瓣/
├── 读过的书.md
├── 在读的书.md
├── 想读的书.md
├── 看过的影视.md
├── 在看的影视.md
├── 想看的影视.md
├── 听过的音乐.md
├── 在听的音乐.md
└── 想听的音乐.md
```

Each entry is one line:
```markdown
- [书名](https://book.douban.com/subject/12345/) | 2026-01-15 | ★★★★★ | "短评内容"
```

## Deduplication

Both full export and RSS sync deduplicate by Douban URL — safe to run multiple times.
