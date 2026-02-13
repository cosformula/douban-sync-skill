#!/usr/bin/env node
// Migrate existing Douban Markdown files to CSV format
// Handles both formats:
//   1. Full export: ### Title\n- 作者：...\n- 我的评分：...\n- 标记日期：...\n- 短评：...\n- 链接：...
//   2. RSS incremental: - [Title](url) | date | rating | "comment"

const fs = require('fs');
const path = require('path');

const DOUBAN_DIR = process.env.OBSIDIAN_DIR || path.join(process.env.HOME, 'obsidian-vault/豆瓣');
const CSV_HEADER = 'title,url,date,rating,status,comment\n';

const FILE_MAP = [
  { md: '读过的书.md', csv: '书.csv', status: '读过' },
  { md: '在读的书.md', csv: '书.csv', status: '在读' },
  { md: '想读的书.md', csv: '书.csv', status: '想读' },
  { md: '看过的影视.md', csv: '影视.csv', status: '看过' },
  { md: '在看的影视.md', csv: '影视.csv', status: '在看' },
  { md: '想看的影视.md', csv: '影视.csv', status: '想看' },
  { md: '听过的音乐.md', csv: '音乐.csv', status: '听过' },
  { md: '在听的音乐.md', csv: '音乐.csv', status: '在听' },
  { md: '想听的音乐.md', csv: '音乐.csv', status: '想听' },
];

function csvEscape(str) {
  if (!str) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function emojiToStars(emoji) {
  if (!emoji) return '';
  const count = (emoji.match(/⭐/g) || []).length;
  if (count > 0) return '★'.repeat(count);
  // Already ★ format
  const starCount = (emoji.match(/★/g) || []).length;
  if (starCount > 0) return emoji;
  return '';
}

function parseMdFile(filePath, status) {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const items = [];

  let currentItem = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Format 2: RSS single-line - [Title](url) | date | rating | "comment"
    const rssMatch = line.match(/^- \[(.+?)\]\((https?:\/\/[^\)]+)\)\s*(?:\|\s*(\S+))?\s*(?:\|\s*(★+))?\s*(?:\|\s*"(.+?)")?$/);
    if (rssMatch) {
      items.push({
        title: rssMatch[1],
        url: rssMatch[2],
        date: rssMatch[3] || '',
        rating: rssMatch[4] || '',
        status,
        comment: rssMatch[5] || '',
      });
      continue;
    }

    // Format 1: Full export ### Title
    if (line.startsWith('### ')) {
      // Save previous item
      if (currentItem && currentItem.url) {
        items.push(currentItem);
      }
      currentItem = { title: line.slice(4).trim(), url: '', date: '', rating: '', status, comment: '' };
      continue;
    }

    if (currentItem) {
      if (line.startsWith('- 链接：')) {
        currentItem.url = line.slice(5).trim();
      } else if (line.startsWith('- 标记日期：')) {
        currentItem.date = line.slice(7).trim();
      } else if (line.startsWith('- 我的评分：')) {
        const raw = line.slice(7).trim();
        if (raw !== '未评分') currentItem.rating = emojiToStars(raw);
      } else if (line.startsWith('- 短评：')) {
        currentItem.comment = line.slice(5).trim();
      }
      // Also handle inline link format in full export: - [Title](url) | date | rating
      const inlineMatch = line.match(/^- \[(.+?)\]\((https?:\/\/[^\)]+)\)/);
      if (inlineMatch && !currentItem.url) {
        currentItem.url = inlineMatch[2];
      }
    }
  }

  // Don't forget last item
  if (currentItem && currentItem.url) {
    items.push(currentItem);
  }

  return items;
}

function main() {
  const csvData = {}; // file -> lines[]

  for (const mapping of FILE_MAP) {
    const mdPath = path.join(DOUBAN_DIR, mapping.md);
    if (!fs.existsSync(mdPath)) {
      console.log(`Skipping ${mapping.md} (not found)`);
      continue;
    }

    const items = parseMdFile(mdPath, mapping.status);
    console.log(`${mapping.md}: ${items.length} items → ${mapping.csv}`);

    if (!csvData[mapping.csv]) csvData[mapping.csv] = [];

    for (const item of items) {
      csvData[mapping.csv].push([
        csvEscape(item.title),
        csvEscape(item.url),
        csvEscape(item.date),
        csvEscape(item.rating),
        csvEscape(item.status),
        csvEscape(item.comment),
      ].join(','));
    }
  }

  // Deduplicate by URL within each file
  for (const [file, lines] of Object.entries(csvData)) {
    const seen = new Set();
    const deduped = [];
    for (const line of lines) {
      const url = line.split(',')[1]; // second column is URL
      if (seen.has(url)) continue;
      seen.add(url);
      deduped.push(line);
    }

    const filePath = path.join(DOUBAN_DIR, file);
    fs.writeFileSync(filePath, CSV_HEADER + deduped.join('\n') + '\n', 'utf8');
    console.log(`Written ${deduped.length} rows to ${filePath} (deduped from ${lines.length})`);
  }

  console.log('\nMigration complete!');
  console.log('You can now delete the old .md files if the CSV data looks correct.');
}

main();
