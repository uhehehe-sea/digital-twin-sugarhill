import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

const sIdx = js.indexOf('function loadPrecisionModel');
const sub = js.substring(sIdx + 3000, sIdx + 7000);
console.log(sub.substring(sub.length - 1500));
