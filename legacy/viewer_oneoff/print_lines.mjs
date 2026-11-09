import fs from 'fs';

const html = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/index_v2.html', 'utf8');
const lines = html.split('\n');

console.log(lines.slice(1045, 1185).join('\n'));
