// Connect to existing browser via CDP and scrape all douban data
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BROWSER_URL = 'http://127.0.0.1:18800';
const USER = 'cosineformula';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
    const i = item.querySelector('.intro');
    const c = item.querySelector('.comment');
    results.push({ title, link, date, rating, intro: i ? i.textContent.trim() : '', comment: c ? c.textContent.trim() : '' });
  }
  return results;
}
`;

async function scrapeCategory(browser, baseUrl, userPath, label) {
  console.log(`\n=== ${label} ===`);
  const page = await browser.newPage();
  const allItems = [];
  
  try {
    let start = 0;
    while (true) {
      const url = `${baseUrl}/people/${USER}/${userPath}?start=${start}&sort=time&rating=all&filter=all&mode=list`;
      console.log(`  Fetching start=${start}...`);
      
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(1000);
      
      const items = await page.evaluate(new Function('return (' + parseScript + ')()'));
      
      if (!items || items.length === 0) {
        console.log(`  No items, stopping.`);
        break;
      }
      
      console.log(`  Got ${items.length} items`);
      allItems.push(...items);
      
      if (items.length < 30) break;
      start += 30;
      await sleep(2000); // polite delay
    }
  } catch (err) {
    console.error(`  Error: ${err.message}`);
  } finally {
    await page.close();
  }
  
  console.log(`  Total: ${allItems.length} items`);
  return allItems;
}

function ratingStars(rating) {
  if (!rating || rating === 0) return '未评分';
  return '⭐'.repeat(rating);
}

function generateMarkdown(items, label, type) {
  let md = `# ${label}\n\n`;
  md += `> 共 ${items.length} 条记录，导出于 ${new Date().toISOString().split('T')[0]}\n\n`;
  
  for (const item of items) {
    md += `### ${item.title}\n\n`;
    if (type === 'book' && item.intro) {
      const parts = item.intro.split('/').map(s => s.trim());
      if (parts.length > 0 && parts[0]) {
        md += `- 作者：${parts[0]}\n`;
      }
    }
    md += `- 我的评分：${ratingStars(item.rating)}\n`;
    if (item.date) md += `- 标记日期：${item.date}\n`;
    if (item.comment) md += `- 短评：${item.comment}\n`;
    md += `- 链接：${item.link}\n`;
    md += `\n---\n\n`;
  }
  return md;
}

async function main() {
  console.log('Connecting to browser...');
  const browser = await puppeteer.connect({ browserURL: BROWSER_URL });
  console.log('Connected!');
  
  const outputDir = '/Users/zhaoyiqun/clawd/obsidian-vault/豆瓣';
  fs.mkdirSync(outputDir, { recursive: true });
  
  const categories = [
    { base: 'https://book.douban.com', path: 'collect', label: '读过的书', file: '读过的书.md', type: 'book' },
    { base: 'https://book.douban.com', path: 'do', label: '在读的书', file: '在读的书.md', type: 'book' },
    { base: 'https://book.douban.com', path: 'wish', label: '想读的书', file: '想读的书.md', type: 'book' },
    { base: 'https://movie.douban.com', path: 'collect', label: '看过的影视', file: '看过的影视.md', type: 'movie' },
    { base: 'https://movie.douban.com', path: 'do', label: '在看的影视', file: '在看的影视.md', type: 'movie' },
    { base: 'https://movie.douban.com', path: 'wish', label: '想看的影视', file: '想看的影视.md', type: 'movie' },
  ];
  
  for (const cat of categories) {
    const items = await scrapeCategory(browser, cat.base, cat.path, cat.label);
    const md = generateMarkdown(items, cat.label, cat.type);
    const filePath = path.join(outputDir, cat.file);
    fs.writeFileSync(filePath, md, 'utf8');
    console.log(`  Written to: ${filePath}`);
    await sleep(3000);
  }
  
  console.log('\n✅ All done!');
  browser.disconnect();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
