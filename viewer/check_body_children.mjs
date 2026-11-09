import fs from 'fs';

const html = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/index_v2.html', 'utf8');

// Check direct children of body in index_v2.html
const bodyContent = html.substring(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const tagMatches = bodyContent.match(/<div id="[^"]+"/g);
console.log('Top-level IDs in body:', tagMatches);
