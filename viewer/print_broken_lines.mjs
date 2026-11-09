import fs from 'fs';

const html = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/index_v2.html', 'utf8');

const sStart = html.indexOf('<style>');
const sEnd = html.indexOf('</style>');
const css = html.substring(sStart + 7, sEnd);

const lines = css.split('\n');
console.log('--- Lines 295 to 355:');
console.log(lines.slice(295, 355).join('\n'));

console.log('--- Lines 765 to 785:');
console.log(lines.slice(765, 785).join('\n'));
