import fs from 'fs';

const html = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/index_v2.html', 'utf8');

const sStart = html.indexOf('<style>');
const sEnd = html.indexOf('</style>');
const css = html.substring(sStart + 7, sEnd);

const lines = css.split('\n');
lines.forEach((l, i) => {
  if (l.trim().endsWith('-') || l.trim().endsWith('.panel-') || (l.includes('{') && !l.includes('}') && l.trim().startsWith('-'))) {
    console.log(`${i}: ${l}`);
  }
});
