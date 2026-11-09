import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

const regex = /materials\.[a-zA-Z0-9_]+/g;
let match;
const usages = [];
while ((match = regex.exec(js)) !== null) {
  usages.push({ text: match[0], index: match.index });
}

console.log('Total usages of materials.*:', usages.length);
usages.forEach(u => {
  console.log(u.index, u.text);
});
