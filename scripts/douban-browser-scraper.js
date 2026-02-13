#!/usr/bin/env node
// Douban full export via CDP browser — outputs CSV
// Connects to an existing browser session (e.g. opened with --remote-debugging-port)

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:18800';
const USER = process.env.DOUBAN_USER;
if (!USER) { console.error('Error: DOUBAN_USER env var is required'); process.exit(1); }
const BASE_DIR = process.env.OBSIDIAN_DIR || path.join(process.env.HOME, 'obsidian-vault/豆瓣');
const OUTPUT_DIR = path.join(BASE_DIR, USER);

const CSV_HEADER = 'title,url,date,rating,status,comment\n';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function csvEscape(str) {
  if (!str) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function ratingStars(rating) {
  if (!rating || rating === 0) return '';
  return '★'.repeat(rating);
}

const parseScript = `
() => {
  const items = document.querySelectorAll('.list-view .item');
  const results = [];
  for (const item of items) {
    const t = item.querySelector('.title a');
    const title = t ? t.textContent.trim() : '';
    const link = t ? t.getAttribute('href') : '';
    const d = item.querySelector('.date');
    let date = '', rating = 0;
    if (d) {
      const r = d.querySelector('span[class*="rating"]');
      if (r) { const m = r.className.match(/rating(\\d+)-t/); if (m) rating = parseInt(m[1]); }
      const dm = d.textContent.match(/(\\d{4}-\\d{2}-\\d{2})/);
      if (dm) date = dm[1];
    }
    const c = item.querySelector('.comment');
    results.push({ title, link, date, rating, comment: c ? c.textContent.trim() : '' });
  }
  return results;
}
`;

const categories = [
  { base: 'https://book.douban.com', path: 'collect', status: '读过', file: '书.csv', type: 'book' },
  { base: 'https://book.douban.com', path: 'do', status: '在读', file: '书.csv', type: 'book' },
  { base: 'https://book.douban.com', path: 'wish', status: '想读', file: '书.csv', type: 'book' },
  { base: 'https://movie.douban.com', path: 'collect', status: '看过', file: '影视.csv', type: 'movie' },
  { base: 'https://movie.douban.com', path: 'do', status: '在看', file: '影视.csv', type: 'movie' },
  { base: 'https://movie.douban.com', path: 'wish', status: '想看', file: '影视.csv', type: 'movie' },
];

async function scrapeCategory(browser, cat) {
  console.log(`\n=== ${cat.status} (${cat.type}) ===`);
  const page = await browser.newPage();
  const allItems = [];

  try {
    let start = 0;
    while (true) {
      const url = `${cat.base}/people/${USER}/${cat.path}?start=${start}&sort=time&rating=all&filter=all&mode=list`;
      console.log(`  Fetching start=${start}...`);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(1000);

      const items = await page.evaluate(new Function('return (' + parseScript + ')()'));
      if (!items || items.length === 0) { console.log('  No items, stopping.'); break; }

      console.log(`  Got ${items.length} items`);
      allItems.push(...items);

      if (items.length < 30) break;
      start += 30;
      await sleep(2000);
    }
  } catch (err) {
    console.error(`  Error: ${err.message}`);
  } finally {
    await page.close();
  }

  console.log(`  Total: ${allItems.length} items`);
  return allItems;
}

function itemToCsvLine(item, status) {
  return [
    csvEscape(item.title),
    csvEscape(item.link),
    csvEscape(item.date),
    csvEscape(ratingStars(item.rating)),
    csvEscape(status),
    csvEscape(item.comment),
  ].join(',');
}

async function main() {
  console.log('Connecting to browser...');
  const browser = await puppeteer.connect({ browserURL: BROWSER_URL });
  console.log('Connected!');

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const fileData = {};

  for (const cat of categories) {
    const items = await scrapeCategory(browser, cat);
    if (!fileData[cat.file]) fileData[cat.file] = [];
    for (const item of items) {
      fileData[cat.file].push(itemToCsvLine(item, cat.status));
    }
    await sleep(3000);
  }

  for (const [file, lines] of Object.entries(fileData)) {
    const filePath = path.join(OUTPUT_DIR, file);
    fs.writeFileSync(filePath, CSV_HEADER + lines.join('\n') + '\n', 'utf8');
    console.log(`Written ${lines.length} rows to ${filePath}`);
  }

  console.log('\n✅ All done!');
  browser.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
