// This script runs in Node.js and writes the extraction JS to be used in browser evaluate
// It generates the extraction function

const extractionScript = `
async function extractAllPages(baseUrl, totalExpected) {
  const perPage = 30; // list mode
  const results = [];
  const maxPages = Math.ceil(totalExpected / perPage) + 1;
  
  for (let page = 0; page < maxPages; page++) {
    const start = page * perPage;
    const url = baseUrl + '?start=' + start + '&sort=time&rating=all&filter=all&mode=list';
    
    try {
      const resp = await fetch(url);
      const html = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const items = doc.querySelectorAll('.list-view .item');
      
      if (items.length === 0) break;
      
      for (const item of items) {
        const titleEl = item.querySelector('.title a');
        const title = titleEl ? titleEl.textContent.trim() : '';
        const link = titleEl ? titleEl.getAttribute('href') : '';
        
        const dateDiv = item.querySelector('.date');
        let dateText = '';
        let rating = 0;
        if (dateDiv) {
          const ratingSpan = dateDiv.querySelector('span[class*="rating"]');
          if (ratingSpan) {
            const match = ratingSpan.className.match(/rating(\\d+)-t/);
            if (match) rating = parseInt(match[1]);
          }
          dateText = dateDiv.textContent.trim().replace(/\\s+/g, ' ');
          // Extract just the date
          const dateMatch = dateText.match(/(\\d{4}-\\d{2}-\\d{2})/);
          if (dateMatch) dateText = dateMatch[1];
        }
        
        const introEl = item.querySelector('.intro');
        const intro = introEl ? introEl.textContent.trim() : '';
        
        // Check for comment in grid-date area or comment-item
        const commentItem = item.querySelector('.comment-item');
        let comment = '';
        if (commentItem) {
          const pComment = commentItem.querySelector('p.comment');
          if (pComment) comment = pComment.textContent.trim();
          // Also check for standalone text nodes
          if (!comment) {
            const allText = commentItem.textContent;
            // Try to find comment text after the intro
          }
        }
        
        results.push({ title, link, date: dateText, rating, intro, comment });
      }
      
      // Delay to avoid rate limiting
      if (page < maxPages - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (e) {
      console.error('Error fetching page', start, e);
      break;
    }
  }
  
  return results;
}
`;

console.log(extractionScript);
