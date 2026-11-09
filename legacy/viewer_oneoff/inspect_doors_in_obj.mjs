import fs from 'fs';

const objContent = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/factory_precision.obj', 'utf8');
const lines = objContent.split('\n');

let curObj = null;
let objVerts = {};

for (const line of lines) {
  if (line.startsWith('o ')) {
    curObj = line.trim().substring(2);
    objVerts[curObj] = [];
  } else if (line.startsWith('v ') && curObj) {
    const parts = line.trim().split(/\s+/).slice(1).map(Number);
    objVerts[curObj].push(parts);
  }
}

for (const [name, verts] of Object.entries(objVerts)) {
  if (name.includes('Door') || name.includes('Gate') || name.includes('Dock') || name.includes('Cargo')) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const v of verts) {
      if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0];
      if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1];
      if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2];
    }
    console.log(name, 
      'X:', Math.round(minX), '~', Math.round(maxX), 
      'Y:', Math.round(minY), '~', Math.round(maxY), 
      'Z:', Math.round(minZ), '~', Math.round(maxZ)
    );
  }
}
