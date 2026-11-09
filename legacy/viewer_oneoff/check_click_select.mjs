import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

const sIdx = js.indexOf('container.addEventListener(\'pointerup\'');
console.log(js.substring(sIdx, sIdx + 1200));
