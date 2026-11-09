import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

const sIdx = js.indexOf('function renderMaterialStudio');
console.log('renderMaterialStudio:\n' + js.substring(sIdx, sIdx + 1200));

const iIdx = js.indexOf('function setupInteractions');
console.log('setupInteractions:\n' + js.substring(iIdx, iIdx + 1200));
