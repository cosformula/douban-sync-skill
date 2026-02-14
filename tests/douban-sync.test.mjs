import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { csvEscape, parseItems, matchCategory, RATING_MAP } = require('../scripts/lib.js');

// ── csvEscape ──────────────────────────────────────────────

describe('csvEscape', () => {
  it('should return empty string for falsy input', () => {
    assert.equal(csvEscape(''), '');
    assert.equal(csvEscape(null), '');
    assert.equal(csvEscape(undefined), '');
  });

  it('should pass through simple strings', () => {
    assert.equal(csvEscape('hello'), 'hello');
    assert.equal(csvEscape('测试'), '测试');
  });

  it('should quote strings containing commas', () => {
    assert.equal(csvEscape('a,b'), '"a,b"');
  });

  it('should escape double quotes', () => {
    assert.equal(csvEscape('say "hi"'), '"say ""hi"""');
  });

  it('should quote strings with newlines', () => {
    assert.equal(csvEscape('line1\nline2'), '"line1\nline2"');
  });
});

// ── RATING_MAP ─────────────────────────────────────────────

describe('RATING_MAP', () => {
  it('should map Chinese rating keywords to stars', () => {
    assert.equal(RATING_MAP['力荐'], '★★★★★');
    assert.equal(RATING_MAP['推荐'], '★★★★');
    assert.equal(RATING_MAP['还行'], '★★★');
    assert.equal(RATING_MAP['较差'], '★★');
    assert.equal(RATING_MAP['很差'], '★');
  });
});

// ── matchCategory ──────────────────────────────────────────

describe('matchCategory', () => {
  it('should match book categories', () => {
    const cat = matchCategory('读过《某本书》');
    assert.equal(cat.file, '书.csv');
    assert.equal(cat.status, '读过');
    assert.equal(cat.type, 'book');
  });

  it('should match "在读" and "最近在读"', () => {
    assert.equal(matchCategory('在读《测试书A》').status, '在读');
    assert.equal(matchCategory('最近在读《测试书B》').status, '在读');
  });

  it('should match movie categories', () => {
    assert.equal(matchCategory('看过测试电影A').file, '影视.csv');
    assert.equal(matchCategory('想看测试电影B').status, '想看');
  });

  it('should match music categories', () => {
    assert.equal(matchCategory('听过测试专辑').file, '音乐.csv');
    assert.equal(matchCategory('想听测试歌曲').status, '想听');
  });

  it('should match game categories', () => {
    assert.equal(matchCategory('玩过测试游戏A').file, '游戏.csv');
    assert.equal(matchCategory('在玩测试游戏B').status, '在玩');
  });

  it('should return null for unmatched titles', () => {
    assert.equal(matchCategory('随便写点什么'), null);
    assert.equal(matchCategory(''), null);
  });
});

// ── parseItems ─────────────────────────────────────────────

describe('parseItems', () => {
  const sampleXml = `
    <rss>
      <channel>
        <item>
          <title><![CDATA[读过测试书X]]></title>
          <link>https://book.douban.com/subject/1000001/</link>
          <guid>https://book.douban.com/subject/1000001/</guid>
          <pubDate>Mon, 10 Feb 2026 12:00:00 GMT</pubDate>
          <description><![CDATA[推荐: 力荐 短评: 好书]]></description>
        </item>
        <item>
          <title><![CDATA[看过测试电影Y]]></title>
          <link>https://movie.douban.com/subject/2000001/</link>
          <guid>https://movie.douban.com/subject/2000001/</guid>
          <pubDate>Tue, 11 Feb 2026 12:00:00 GMT</pubDate>
          <description><![CDATA[推荐: 推荐]]></description>
        </item>
      </channel>
    </rss>
  `;

  it('should parse all items from XML', () => {
    const items = parseItems(sampleXml);
    assert.equal(items.length, 2);
  });

  it('should extract title correctly', () => {
    const items = parseItems(sampleXml);
    assert.equal(items[0].title, '读过测试书X');
    assert.equal(items[1].title, '看过测试电影Y');
  });

  it('should extract link/guid', () => {
    const items = parseItems(sampleXml);
    assert.equal(items[0].link, 'https://book.douban.com/subject/1000001/');
    assert.equal(items[0].guid, 'https://book.douban.com/subject/1000001/');
  });

  it('should extract rating from description', () => {
    const items = parseItems(sampleXml);
    assert.equal(items[0].rating, '★★★★★'); // 力荐
    assert.equal(items[1].rating, '★★★★');   // 推荐
  });

  it('should extract comment from description', () => {
    const items = parseItems(sampleXml);
    assert.equal(items[0].comment, '好书');
    assert.equal(items[1].comment, ''); // no comment
  });

  it('should handle empty XML', () => {
    const items = parseItems('<rss></rss>');
    assert.equal(items.length, 0);
  });

  it('should handle items without rating or comment', () => {
    const xml = `
      <item>
        <title>想读某本书</title>
        <link>https://book.douban.com/subject/999/</link>
        <guid>https://book.douban.com/subject/999/</guid>
        <pubDate>Wed, 12 Feb 2026 12:00:00 GMT</pubDate>
        <description>标记了想读</description>
      </item>
    `;
    const items = parseItems(xml);
    assert.equal(items.length, 1);
    assert.equal(items[0].rating, '');
    assert.equal(items[0].comment, '');
  });
});
