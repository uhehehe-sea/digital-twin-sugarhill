import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');
const lines = js.split('\n');

console.log(lines.slice(3725, 3810).join('\n'));
