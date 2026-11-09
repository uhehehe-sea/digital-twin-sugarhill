import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

const startIdx = js.indexOf('function init3D()');
const sub = js.substring(startIdx + 2800, startIdx + 6000);
console.log(sub);
