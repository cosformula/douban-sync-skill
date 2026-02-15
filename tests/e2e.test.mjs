import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { csvEscape, parseItems, matchCategory } from '../scripts/lib.mjs';

// ── Fixtures ───────────────────────────────────────────────

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>testuser的豆瓣</title>
    <item>
      <title><![CDATA[读过测试书籍A]]></title>
      <link>https://book.douban.com/subject/1000001/</link>
      <guid>https://book.douban.com/subject/1000001/</guid>
      <pubDate>Mon, 10 Feb 2026 12:00:00 GMT</pubDate>
      <description><![CDATA[推荐: 力荐 短评: 非常好看]]></description>
    </item>
    <item>
      <title><![CDATA[看过测试电影B]]></title>
      <link>https://movie.douban.com/subject/2000001/</link>
      <guid>https://movie.douban.com/subject/2000001/</guid>
      <pubDate>Tue, 11 Feb 2026 08:30:00 GMT</pubDate>
      <description><![CDATA[推荐: 推荐 短评: 值得一看]]></description>
    </item>
    <item>
      <title><![CDATA[想读测试书籍C]]></title>
      <link>https://book.douban.com/subject/1000002/</link>
      <guid>https://book.douban.com/subject/1000002/</guid>
      <pubDate>Wed, 12 Feb 2026 10:00:00 GMT</pubDate>
      <description><![CDATA[标记了想读]]></description>
    </item>
    <item>
      <title><![CDATA[听过测试专辑D]]></title>
      <link>https://music.douban.com/subject/3000001/</link>
      <guid>https://music.douban.com/subject/3000001/</guid>
      <pubDate>Thu, 13 Feb 2026 14:00:00 GMT</pubDate>
      <description><![CDATA[推荐: 还行]]></description>
    </item>
    <item>
      <title><![CDATA[玩过测试游戏E]]></title>
      <link>https://www.douban.com/game/4000001/</link>
      <guid>https://www.douban.com/game/4000001/</guid>
      <pubDate>Fri, 14 Feb 2026 09:00:00 GMT</pubDate>
      <description><![CDATA[推荐: 力荐 短评: 超好玩]]></description>
    </item>
  </channel>
</rss>`;

const CSV_HEADER = 'title,url,date,rating,status,comment\n';

// ── Helper: simulate the sync pipeline ─────────────────────

function syncPipeline(xml, outputDir) {
  const items = parseItems(xml);
  const fileBuffers = {}; // filename → rows[]

  for (const item of items) {
    const cat = matchCategory(item.title);
    if (!cat) continue;

    // Extract clean title (remove status prefix like "读过", "看过" etc)
    const cleanTitle = item.title.replace(cat.pattern, '').trim();
    const dateStr = item.pubDate ? new Date(item.pubDate).toISOString().slice(0, 10) : '';

    const row = [
      csvEscape(cleanTitle),
      csvEscape(item.link),
      csvEscape(dateStr),
      csvEscape(item.rating),
      csvEscape(cat.status),
      csvEscape(item.comment),
    ].join(',');

    if (!fileBuffers[cat.file]) fileBuffers[cat.file] = [];
    fileBuffers[cat.file].push(row);
  }

  return fileBuffers;
}

async function writeFiles(fileBuffers, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  for (const [filename, rows] of Object.entries(fileBuffers)) {
    const filePath = path.join(outputDir, filename);
    let existing = '';
    try {
      existing = await fs.readFile(filePath, 'utf8');
    } catch { /* new file */ }

    if (!existing) existing = CSV_HEADER;

    // Dedup by URL (column 2)
    const existingUrls = new Set(
      existing.split('\n').slice(1).filter(Boolean).map(line => {
        const parts = line.match(/,([^,]+),/);
        return parts ? parts[1] : '';
      })
    );

    const newRows = rows.filter(row => {
      const urlMatch = row.match(/,([^,]+),/);
      const url = urlMatch ? urlMatch[1] : '';
      return !existingUrls.has(url);
    });

    if (newRows.length > 0) {
      const content = existing.trimEnd() + '\n' + newRows.join('\n') + '\n';
      await fs.writeFile(filePath, content, 'utf8');
    }
  }
}

// ── E2E Tests ──────────────────────────────────────────────

describe('E2E: RSS XML → parse → categorize → CSV files', () => {
  let tmpDir;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'douban-e2e-'));
  });

  after(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true });
  });

  it('should parse all 5 items from fixture RSS', () => {
    const items = parseItems(RSS_FIXTURE);
    assert.equal(items.length, 5);
  });

  it('should categorize items into correct files', () => {
    const fileBuffers = syncPipeline(RSS_FIXTURE, tmpDir);

    assert.ok(fileBuffers['书.csv'], 'should have 书.csv');
    assert.ok(fileBuffers['影视.csv'], 'should have 影视.csv');
    assert.ok(fileBuffers['音乐.csv'], 'should have 音乐.csv');
    assert.ok(fileBuffers['游戏.csv'], 'should have 游戏.csv');

    // 书: 读过测试书籍A + 想读测试书籍C = 2 rows
    assert.equal(fileBuffers['书.csv'].length, 2);
    // 影视: 看过测试电影B = 1 row
    assert.equal(fileBuffers['影视.csv'].length, 1);
    // 音乐: 听过某专辑 = 1 row
    assert.equal(fileBuffers['音乐.csv'].length, 1);
    // 游戏: 玩过测试游戏E = 1 row
    assert.equal(fileBuffers['游戏.csv'].length, 1);
  });

  it('should write correct CSV files to disk', async () => {
    const fileBuffers = syncPipeline(RSS_FIXTURE, tmpDir);
    await writeFiles(fileBuffers, tmpDir);

    // Verify 书.csv
    const bookContent = await fs.readFile(path.join(tmpDir, '书.csv'), 'utf8');
    assert.ok(bookContent.startsWith('title,url,date,rating,status,comment'));
    assert.ok(bookContent.includes('测试书籍A'));
    assert.ok(bookContent.includes('测试书籍C'));
    assert.ok(bookContent.includes('★★★★★')); // 力荐
    assert.ok(bookContent.includes('读过'));
    assert.ok(bookContent.includes('想读'));

    // Verify 影视.csv
    const movieContent = await fs.readFile(path.join(tmpDir, '影视.csv'), 'utf8');
    assert.ok(movieContent.includes('测试电影B'));
    assert.ok(movieContent.includes('★★★★')); // 推荐
    assert.ok(movieContent.includes('值得一看'));

    // Verify 游戏.csv
    const gameContent = await fs.readFile(path.join(tmpDir, '游戏.csv'), 'utf8');
    assert.ok(gameContent.includes('测试游戏E'));
    assert.ok(gameContent.includes('超好玩'));
  });

  it('should extract correct ratings', () => {
    const items = parseItems(RSS_FIXTURE);
    assert.equal(items[0].rating, '★★★★★'); // 力荐
    assert.equal(items[1].rating, '★★★★');   // 推荐
    assert.equal(items[2].rating, '');          // 想读, no rating
    assert.equal(items[3].rating, '★★★');     // 还行
    assert.equal(items[4].rating, '★★★★★'); // 力荐
  });

  it('should extract correct comments', () => {
    const items = parseItems(RSS_FIXTURE);
    assert.equal(items[0].comment, '非常好看');
    assert.equal(items[1].comment, '值得一看');
    assert.equal(items[2].comment, '');  // no comment
    assert.equal(items[3].comment, '');  // no comment
    assert.equal(items[4].comment, '超好玩');
  });

  it('should deduplicate when running twice', async () => {
    const dedupeDir = path.join(tmpDir, 'dedup-test');
    const fileBuffers = syncPipeline(RSS_FIXTURE, dedupeDir);

    // Write twice
    await writeFiles(fileBuffers, dedupeDir);
    await writeFiles(fileBuffers, dedupeDir);

    const bookContent = await fs.readFile(path.join(dedupeDir, '书.csv'), 'utf8');
    const dataLines = bookContent.trim().split('\n').slice(1); // skip header
    assert.equal(dataLines.length, 2, 'should still have exactly 2 book entries after double write');
  });

  it('should handle empty RSS gracefully', () => {
    const items = parseItems('<rss><channel></channel></rss>');
    const fileBuffers = syncPipeline('<rss><channel></channel></rss>', tmpDir);
    assert.equal(items.length, 0);
    assert.deepEqual(fileBuffers, {});
  });

  it('should handle special characters in titles and comments', () => {
    const xml = `
      <item>
        <title><![CDATA[读过"引号,逗号"测试]]></title>
        <link>https://book.douban.com/subject/test/</link>
        <guid>https://book.douban.com/subject/test/</guid>
        <pubDate>Mon, 10 Feb 2026 12:00:00 GMT</pubDate>
        <description><![CDATA[推荐: 力荐 短评: 包含"引号"和,逗号]]></description>
      </item>
    `;
    const items = parseItems(xml);
    assert.equal(items.length, 1);
    assert.ok(items[0].title.includes('引号'));
    assert.ok(items[0].comment.includes('引号'));

    // CSV escape should handle these
    const escaped = csvEscape(items[0].comment);
    assert.ok(escaped.startsWith('"'), 'should be quoted due to comma/quotes');
  });
});
