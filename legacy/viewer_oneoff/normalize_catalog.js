import fs from 'fs';
import path from 'path';

const p = (process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js';
let js = fs.readFileSync(p, 'utf8');

const target = 'const filtered = ASSET_CATALOG.filter(a => {';
const replacement = `ASSET_CATALOG.forEach(a => {
    if (!a.assetId) a.assetId = a.id;
    if (!a.title) a.title = a.name;
    if (!a.sub) a.sub = a.desc;
    if (!a.badge) a.badge = a.tag;
    if (!a.dims) a.dims = a.sizeMm;
  });
  const filtered = ASSET_CATALOG.filter(a => {`;

js = js.replace(target, replacement);
fs.writeFileSync(p, js, 'utf8');
console.log('Normalized ASSET_CATALOG!');
