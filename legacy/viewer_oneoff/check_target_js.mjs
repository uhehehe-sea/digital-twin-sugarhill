import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

const targetStr = `let activeZIndex = 50;

function initFloatingWindows() {`;

const idx = js.indexOf(targetStr);
console.log('Found initFloatingWindows at index:', idx);
