import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

const aIdx = js.indexOf('function animate()');
console.log(js.substring(aIdx, aIdx + 1500));
