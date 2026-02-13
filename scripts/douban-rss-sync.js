#!/usr/bin/env node
// Douban RSS → Obsidian incremental sync
// Pulls RSS feed, parses new entries, appends to corresponding md files

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DOUBAN_USER = process.env.DOUBAN_USER || 'cosineformula';
const OBSIDIAN_DIR = process.env.OBSIDIAN_DIR || path.join(process.env.HOME, 'obsidian-vault/豆瓣');
const STATE_FILE = process.env.STATE_FILE || path.join(OBSIDIAN_DIR, '.douban-rss-state.json');
const RSS_URL = `https://www.douban.com/feed/people/${DOUBAN_USER}/interests`;

// Map RSS title patterns to files
const CATEGORY_MAP = [
  { pattern: /^读过/, file: '读过的书.md', type: 'book' },
  { pattern: /^在读/, file: '在读的书.md', type: 'book' },
  { pattern: /^想读/, file: '想读的书.md', type: 'book' },
  { pattern: /^看过/, file: '看过的影视.md', type: 'movie' },
  { pattern: /^在看/, file: '在看的影视.md', type: 'movie' },
  { pattern: /^想看/, file: '想看的影视.md', type: 'movie' },
  { pattern: /^听过/, file: '听过的音乐.md', type: 'music' },
  { pattern: /^在听/, file: '在听的音乐.md', type: 'music' },
  { pattern: /^想听/, file: '想听的音乐.md', type: 'music' },
];

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

    // Extract rating from description
    const ratingMatch = desc.match(/推荐:\s*(力荐|推荐|还行|较差|很差)/);
    const rating = ratingMatch ? RATING_MAP[ratingMatch[1]] || '' : '';

    // Extract comment if any
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
  // "读过必然" → "必然", "看过极限审判" → "极限审判"
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

function appendToFile(filePath, entry) {
  const name = extractName(entry.title);
  const date = formatDate(entry.pubDate);
  const parts = [`- [${name}](${entry.link})`];
  if (date) parts.push(date);
  if (entry.rating) parts.push(entry.rating);
  if (entry.comment) parts.push(`"${entry.comment}"`);
  const line = parts.join(' | ') + '\n';

  if (!fs.existsSync(filePath)) {
    const cat = CATEGORY_MAP.find(c => filePath.endsWith(c.file));
    const header = cat ? `# ${cat.file.replace('.md', '')}\n\n` : '';
    fs.writeFileSync(filePath, header + line);
  } else {
    // Append after the header/count line
    const content = fs.readFileSync(filePath, 'utf8');
    // Insert at the top of the list (after header lines)
    const lines = content.split('\n');
    let insertIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('#') || lines[i].startsWith('>') || lines[i].trim() === '') {
        insertIdx = i + 1;
      } else {
        break;
      }
    }
    lines.splice(insertIdx, 0, line.trimEnd());
    fs.writeFileSync(filePath, lines.join('\n'));
  }
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
    // Skip if already synced
    if (knownGuids.has(item.guid)) continue;

    // Find category
    const cat = CATEGORY_MAP.find(c => c.pattern.test(item.title));
    if (!cat) {
      console.log(`  Skipping unknown category: ${item.title}`);
      continue;
    }

    const filePath = path.join(OBSIDIAN_DIR, cat.file);

    // Skip if link already in file (dedup)
    if (isAlreadyInFile(filePath, item.link)) {
      console.log(`  Already exists: ${item.title}`);
      continue;
    }

    console.log(`  Adding: ${item.title} → ${cat.file}`);
    appendToFile(filePath, item);
    newCount++;
  }

  // Save all current guids
  state.lastSyncGuids = items.map(i => i.guid);
  state.lastSync = new Date().toISOString();
  saveState(state);

  console.log(`Done. ${newCount} new entries added.`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
