import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

const target = 'gatePanelsGroup = new THREE.Group();';
const idx = js.indexOf(target);
console.log('Index of gatePanelsGroup assignment:', idx);
if (idx !== -1) {
  console.log(js.substring(idx - 100, idx + 800));
}
