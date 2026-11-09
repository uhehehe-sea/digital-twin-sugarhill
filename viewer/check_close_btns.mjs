import fs from 'fs';

const html = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/index_v2.html', 'utf8');

const regex = /<button[^>]*class="[^"]*close[^"]*"[^>]*>[\s\S]*?<\/button>/gi;
const matches = html.match(regex);
console.log('Close buttons found:', matches);
