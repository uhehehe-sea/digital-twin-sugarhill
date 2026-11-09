import fs from 'fs';

const html = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/index_v2.html', 'utf8');

const matches = [];
let idx = 0;
while ((idx = html.indexOf('win-corner-grip', idx)) !== -1) {
  matches.push(idx);
  idx += 15;
}

console.log('Corner grips found at:', matches);
matches.forEach(m => {
  console.log(html.substring(m - 80, m + 80));
});
