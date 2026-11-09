import fs from 'fs';

const html = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/index_v2.html', 'utf8');

const sIdx = html.indexOf('<div class="tb-group">\n      <span class="tb-label">화물 게이트</span>');
console.log(html.substring(sIdx - 100, sIdx + 400));
