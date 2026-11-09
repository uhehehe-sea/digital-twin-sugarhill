import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

const regex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
let match;
const allIds = new Set();
while ((match = regex.exec(js)) !== null) {
  allIds.add(match[1]);
}

console.log('Total unique getElementById in editor_v2.js:', allIds.size);
console.log([...allIds].sort());
