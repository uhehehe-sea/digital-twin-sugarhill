import fs from 'fs';

const html = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/index_v2.html', 'utf8');

const sStart = html.indexOf('<style>');
const sEnd = html.indexOf('</style>');
const css = html.substring(sStart + 7, sEnd);

console.log('CSS length:', css.length);

// Check for any unclosed braces or broken selectors
let openCount = 0;
for (let i = 0; i < css.length; i++) {
  if (css[i] === '{') openCount++;
  if (css[i] === '}') openCount--;
}
console.log('Brace balance (should be 0):', openCount);
