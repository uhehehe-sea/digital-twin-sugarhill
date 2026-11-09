import fs from 'fs';

const html = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/index_v2.html', 'utf8');

const sIdx = html.indexOf('#win-inspector');
console.log(html.substring(sIdx, sIdx + 1200));
