import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

const startIdx = js.indexOf('function init3D()');
const sub = js.substring(startIdx + 5800, startIdx + 8500);
console.log(sub);
