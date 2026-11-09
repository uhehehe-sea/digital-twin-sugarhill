import fs from 'fs';

const html = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/index_v2.html', 'utf8');

const regex = /<button[^>]*class="[^"]*close[^"]*"[^>]*>[\s\S]*?<\/button>/gi;
const matches = html.match(regex);
console.log('Close buttons found:', matches);
