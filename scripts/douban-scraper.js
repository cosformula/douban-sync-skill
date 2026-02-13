const fs = require('fs');
const path = require('path');

const BASE_BOOK = 'https://book.douban.com';
const BASE_MOVIE = 'https://movie.douban.com';
const USER = 'cosineformula';

const categories = [
  { base: BASE_BOOK, type: 'book', status: 'collect', label: '读过的书', file: '读过的书.md' },
  { base: BASE_BOOK, type: 'book', status: 'do', label: '在读的书', file: '在读的书.md' },
  { base: BASE_BOOK, type: 'book', status: 'wish', label: '想读的书', file: '想读的书.md' },
  { base: BASE_MOVIE, type: 'movie', status: 'collect', label: '看过的影视', file: '看过的影视.md' },
  { base: BASE_MOVIE, type: 'movie', status: 'do', label: '在看的影视', file: '在看的影视.md' },
  { base: BASE_MOVIE, type: 'movie', status: 'wish', label: '想看的影视', file: '想看的影视.md' },
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseListPage(html, type) {
  const items = [];
  // Match each list item block
  const itemRegex = /<li class="list-item"[\s\S]*?<\/li>/g;
  
  // Alternative: parse using the .item divs in list view
  // The list mode has a different structure
  // Let's use a more robust approach
  
  // For list mode, items are in .list-view .item
  const titleRegex = /<a[^>]*href="(https:\/\/(?:book|movie)\.douban\.com\/subject\/\d+\/)"[^>]*>\s*([\s\S]*?)\s*<\/a>/g;
  const dateRegex = /(\d{4}-\d{2}-\d{2})/;
  const ratingRegex = /rating(\d+)-t/;
  const commentRegex = /<span class="comment">([\s\S]*?)<\/span>/;
  
  // Split by item boundaries
  const itemBlocks = html.split(/<div class="item">/);
  
  for (let i = 1; i < itemBlocks.length; i++) {
    const block = itemBlocks[i];
    const endIdx = block.indexOf('</div>');
    const itemHtml = block;
    
    // Extract title and link
    const titleMatch = itemHtml.match(/<a[^>]*href="(https:\/\/(?:book|movie)\.douban\.com\/subject\/\d+\/)"[^>]*class="title"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) {
      const altMatch = itemHtml.match(/<a[^>]*class="title"[^>]*href="(https:\/\/(?:book|movie)\.douban\.com\/subject\/\d+\/)"[^>]*>([\s\S]*?)<\/a>/);
      if (!altMatch) {
        // Try any link with subject URL
        const anyMatch = itemHtml.match(/<a[^>]*href="(https:\/\/(?:book|movie)\.douban\.com\/subject\/\d+\/)"[^>]*>([\s\S]*?)<\/a>/);
        if (!anyMatch) continue;
        var link = anyMatch[1];
        var title = anyMatch[2].replace(/<[^>]+>/g, '').trim();
      } else {
        var link = altMatch[1];
        var title = altMatch[2].replace(/<[^>]+>/g, '').trim();
      }
    } else {
      var link = titleMatch[1];
      var title = titleMatch[2].replace(/<[^>]+>/g, '').trim();
    }
    
    // Extract date
    const dateMatch = itemHtml.match(/<span class="date">([\s\S]*?)<\/span>/);
    let date = '';
    let rating = 0;
    if (dateMatch) {
      const dateContent = dateMatch[1];
      const dm = dateContent.match(/(\d{4}-\d{2}-\d{2})/);
      if (dm) date = dm[1];
      const rm = dateContent.match(/rating(\d+)-t/);
      if (rm) rating = parseInt(rm[1]);
    }
    
    // Extract intro
    const introMatch = itemHtml.match(/<span class="intro">([\s\S]*?)<\/span>/);
    const intro = introMatch ? introMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    
    // Extract comment
    const commentMatch = itemHtml.match(/<span class="comment">([\s\S]*?)<\/span>/);
    const comment = commentMatch ? commentMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    
    // Parse intro to get author/director
    let author = '';
    if (type === 'book') {
      // Book intro format: "Author / Publisher / Year / Price"
      const parts = intro.split('/').map(s => s.trim());
      if (parts.length > 0) author = parts[0];
    } else {
      // Movie intro has release dates first, then cast, then country, director...
      // Too complex to reliably parse, skip for now
    }
    
    items.push({ title, link, date, rating, intro, comment, author });
  }
  
  return items;
}

function ratingStars(rating) {
  if (!rating || rating === 0) return '未评分';
  const stars = '⭐'.repeat(rating);
  return stars;
}

function generateMarkdown(items, label, type) {
  let md = `# ${label}\n\n`;
  md += `> 共 ${items.length} 条记录，导出于 ${new Date().toISOString().split('T')[0]}\n\n`;
  
  for (const item of items) {
    // Clean title - remove extra slashes for display
    const displayTitle = item.title.split('/')[0].trim();
    md += `### ${item.title}\n\n`;
    
    if (type === 'book' && item.author) {
      md += `- 作者：${item.author}\n`;
    }
    md += `- 我的评分：${ratingStars(item.rating)}\n`;
    if (item.date) {
      md += `- 标记日期：${item.date}\n`;
    }
    if (item.comment) {
      md += `- 短评：${item.comment}\n`;
    }
    md += `- 链接：${item.link}\n`;
    md += `\n---\n\n`;
  }
  
  return md;
}

async function fetchPage(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }
  return await resp.text();
}

async function fetchAllItems(base, status, type) {
  const allItems = [];
  let start = 0;
  const pageSize = 30;
  
  while (true) {
    const url = `${base}/people/${USER}/${status}?start=${start}&sort=time&rating=all&filter=all&mode=list`;
    console.log(`Fetching: ${url}`);
    
    try {
      const html = await fetchPage(url);
      const items = parseListPage(html, type);
      
      if (items.length === 0) {
        console.log(`  No items found, stopping.`);
        break;
      }
      
      console.log(`  Found ${items.length} items`);
      allItems.push(...items);
      
      if (items.length < pageSize) {
        console.log(`  Last page (${items.length} < ${pageSize})`);
        break;
      }
      
      start += pageSize;
      // Polite delay
      await sleep(2000);
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      if (err.message.includes('403') || err.message.includes('418')) {
        console.log('  Rate limited, waiting 10s...');
        await sleep(10000);
        continue;
      }
      break;
    }
  }
  
  return allItems;
}

async function main() {
  const outputDir = '/Users/zhaoyiqun/clawd/obsidian-vault/豆瓣';
  
  // Create output directory
  fs.mkdirSync(outputDir, { recursive: true });
  
  for (const cat of categories) {
    console.log(`\n=== ${cat.label} ===`);
    const items = await fetchAllItems(cat.base, cat.status, cat.type);
    console.log(`Total: ${items.length} items for ${cat.label}`);
    
    const md = generateMarkdown(items, cat.label, cat.type);
    const filePath = path.join(outputDir, cat.file);
    fs.writeFileSync(filePath, md, 'utf8');
    console.log(`Written to: ${filePath}`);
    
    // Delay between categories
    await sleep(3000);
  }
  
  console.log('\nDone!');
}

main().catch(console.error);
