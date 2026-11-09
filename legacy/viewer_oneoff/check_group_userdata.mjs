import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

const sIdx = js.indexOf('function createControllableGroup');
console.log(js.substring(sIdx + 600, sIdx + 1300));
