#!/usr/bin/env node
// Douban RSS → CSV incremental sync
// Pulls RSS feed, parses new entries, appends to corresponding CSV files

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DOUBAN_USER = process.env.DOUBAN_USER;
if (!DOUBAN_USER) { console.error('Error: DOUBAN_USER env var is required'); process.exit(1); }
const OBSIDIAN_DIR = process.env.OBSIDIAN_DIR || path.join(process.env.HOME, 'obsidian-vault/豆瓣');
const STATE_FILE = process.env.STATE_FILE || path.join(OBSIDIAN_DIR, '.douban-rss-state.json');
const RSS_URL = `https://www.douban.com/feed/people/${DOUBAN_USER}/interests`;

// Map RSS title patterns to files + status
const CATEGORY_MAP = [
  { pattern: /^读过/, file: '书.csv', status: '读过', type: 'book' },
  { pattern: /^在读/, file: '书.csv', status: '在读', type: 'book' },
  { pattern: /^想读/, file: '书.csv', status: '想读', type: 'book' },
  { pattern: /^看过/, file: '影视.csv', status: '看过', type: 'movie' },
  { pattern: /^在看/, file: '影视.csv', status: '在看', type: 'movie' },
  { pattern: /^想看/, file: '影视.csv', status: '想看', type: 'movie' },
  { pattern: /^听过/, file: '音乐.csv', status: '听过', type: 'music' },
  { pattern: /^在听/, file: '音乐.csv', status: '在听', type: 'music' },
  { pattern: /^想听/, file: '音乐.csv', status: '想听', type: 'music' },
];

const CSV_HEADER = 'title,url,date,rating,status,comment\n';

const RATING_MAP = {
  '力荐': '★★★★★',
  '推荐': '★★★★',
  '还行': '★★★',
  '较差': '★★',
  '很差': '★',
};

function fetch(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetch(res.headers.location).then(resolve, reject);
      }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function csvEscape(str) {
  if (!str) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function parseItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = tag => {
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`));
      return m ? m[1].trim() : '';
    };
    const title = get('title');
    const link = get('link');
    const guid = get('guid');
    const pubDate = get('pubDate');
    const desc = get('description');

    const ratingMatch = desc.match(/推荐:\s*(力荐|推荐|还行|较差|很差)/);
    const rating = ratingMatch ? RATING_MAP[ratingMatch[1]] || '' : '';

    const commentMatch = desc.match(/短评:\s*([^<]+)/);
    const comment = commentMatch ? commentMatch[1].trim() : '';

    items.push({ title, link, guid, pubDate, rating, comment });
  }
  return items;
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastSyncGuids: [] };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function extractName(title) {
  for (const { pattern } of CATEGORY_MAP) {
    if (pattern.test(title)) {
      return title.replace(pattern, '');
    }
  }
  return title;
}

function isAlreadyInFile(filePath, link) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.includes(link);
  } catch {
    return false;
  }
}

function formatDate(pubDateStr) {
  try {
    const d = new Date(pubDateStr);
    return d.toISOString().split('T')[0];
  } catch {
    return '';
  }
}

function ensureCsvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, CSV_HEADER);
  }
}

function appendToCsv(filePath, entry, status) {
  ensureCsvFile(filePath);
  const name = extractName(entry.title);
  const date = formatDate(entry.pubDate);
  const line = [
    csvEscape(name),
    csvEscape(entry.link),
    csvEscape(date),
    csvEscape(entry.rating),
    csvEscape(status),
    csvEscape(entry.comment),
  ].join(',') + '\n';
  fs.appendFileSync(filePath, line);
}

async function main() {
  console.log('Fetching Douban RSS...');
  const xml = await fetch(RSS_URL);
  const items = parseItems(xml);
  console.log(`Found ${items.length} items in RSS feed`);

  const state = loadState();
  const knownGuids = new Set(state.lastSyncGuids || []);
  let newCount = 0;

  for (const item of items) {
    if (knownGuids.has(item.guid)) continue;

    const cat = CATEGORY_MAP.find(c => c.pattern.test(item.title));
    if (!cat) {
      console.log(`  Skipping unknown category: ${item.title}`);
      continue;
    }

    const filePath = path.join(OBSIDIAN_DIR, cat.file);

    if (isAlreadyInFile(filePath, item.link)) {
      console.log(`  Already exists: ${item.title}`);
      continue;
    }

    console.log(`  Adding: ${item.title} → ${cat.file}`);
    appendToCsv(filePath, item, cat.status);
    newCount++;
  }

  state.lastSyncGuids = items.map(i => i.guid);
  state.lastSync = new Date().toISOString();
  saveState(state);

  console.log(`Done. ${newCount} new entries added.`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
