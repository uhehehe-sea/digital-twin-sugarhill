import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

const kIdx = js.indexOf("window.addEventListener('keydown'");
console.log(js.substring(kIdx, kIdx + 600));
