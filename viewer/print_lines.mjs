import fs from 'fs';

const html = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/index_v2.html', 'utf8');
const lines = html.split('\n');

console.log(lines.slice(1045, 1185).join('\n'));
