import fs from 'fs';

const html = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/index_v2.html', 'utf8');
const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

// Check script tag in html
console.log('Script tags in html:', html.match(/<script[^>]*>[\s\S]*?<\/script>/gi));

// Check any reference in editor_v2.js to missing DOM IDs!
const idMatches = js.match(/document\.getElementById\(['"]([^'"]+)['"]\)/g);
const ids = idMatches ? idMatches.map(m => m.match(/['"]([^'"]+)['"]/)[1]) : [];
const uniqueIds = [...new Set(ids)];
console.log('Unique getElementById count:', uniqueIds.length);

const missingIds = [];
uniqueIds.forEach(id => {
  if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
    missingIds.push(id);
  }
});
console.log('Missing IDs referenced by JS in HTML:', missingIds);
