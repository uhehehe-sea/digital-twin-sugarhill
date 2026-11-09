import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

const matches = [];
let idx = 0;
while ((idx = js.indexOf('gatePanelsGroup', idx)) !== -1) {
  matches.push(idx);
  idx += 15;
}

console.log('Matches for gatePanelsGroup:', matches);
matches.forEach(m => {
  console.log(js.substring(m - 80, m + 200));
  console.log('---');
});
