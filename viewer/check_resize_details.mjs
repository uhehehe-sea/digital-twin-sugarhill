import fs from 'fs';

const html = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/index_v2.html', 'utf8');
const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');

// Check corner grip in html
console.log('Corner grip in html count:', (html.match(/win-corner-grip/g) || []).length);

// Check corner grip in js
const cgIdx = js.indexOf('cornerGrip.addEventListener');
console.log('Corner grip in js found:', cgIdx !== -1);
if (cgIdx !== -1) {
  console.log(js.substring(cgIdx - 50, cgIdx + 800));
}
