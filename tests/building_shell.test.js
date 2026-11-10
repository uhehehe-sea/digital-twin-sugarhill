// Parametric building generator (tools/build_factory_shell.mjs).  Run: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'build_factory_shell.mjs');

function build(cfg) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'twin-shell-'));
  const cfgFile = path.join(tmp, 'cfg.json'), obj = path.join(tmp, 'out.obj');
  fs.writeFileSync(cfgFile, JSON.stringify(cfg));
  execFileSync(process.execPath, [TOOL, cfgFile, obj], { stdio: 'pipe' });
  const text = fs.readFileSync(obj, 'utf8'), meta = JSON.parse(fs.readFileSync(path.join(tmp, 'building_meta.json'), 'utf8'));
  const parts = new Map(); let cur = null; const V = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('o ')) { cur = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], faces: 0, noNormal: 0 }; parts.set(line.slice(2), cur); }
    else if (line.startsWith('v ')) { const p = line.slice(2).split(' ').map(Number); V.push(p); }
    else if (line.startsWith('f ') && cur) {
      cur.faces++;
      for (const tok of line.slice(2).split(' ')) {
        const [vi, , ni] = tok.split('/'); if (!ni) cur.noNormal++;
        const p = V[parseInt(vi, 10) - 1];
        for (let k = 0; k < 3; k++) { cur.min[k] = Math.min(cur.min[k], p[k]); cur.max[k] = Math.max(cur.max[k], p[k]); }
      }
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return { parts, meta, text };
}
const names = (b, re) => [...b.parts.keys()].filter(n => re.test(n));

test('shell: floor, frames, posts and skin follow the configured size', () => {
  const b = build({ lengthM: 30, widthM: 20, eaveM: 5, roofSlope: 0.1, bayM: 6, postLinesM: [10], wainscotM: 2.4, girtsM: [2.4], door: { centerXM: 9 } });
  const floor = b.parts.get('Floor_Slab');
  assert.deepEqual(floor.min, [0, 0, -200]); assert.deepEqual(floor.max, [30000, 20000, 0]);
  assert.equal(b.meta.bays, 5); assert.equal(b.meta.bay, 6000); assert.equal(b.meta.ridge, 6000);      // 5 m + 0.1 x 10 m
  assert.equal(names(b, /^Col_HBeam_\d+_Web$/).length, 12, '6 frames x 2 side walls');
  assert.equal(names(b, /^Col_Interior_Slender_\d+$/).length, 4, 'posts under the 4 inner frames');
  assert.equal(names(b, /^Roof_Gable_Rafter_X\d+_[SN]$/).length, 12);
  const post = b.parts.get('Col_Interior_Slender_1');
  assert.ok(post.max[2] > 5000 && post.max[2] < 6000, `post top ${post.max[2]} sits under the rafter at mid-span`);
  assert.equal(b.parts.get('Wall_East').min[0], 30000);
  assert.equal(b.parts.get('Wall_West_Gable_Peak').max[2], 6000);
  assert.equal(b.parts.get('LinerPanel_South').max[2], 2400);
  for (const [n, p] of b.parts) assert.equal(p.noNormal, 0, `${n} has faces without normals (the viewer needs them for UVs)`);
});

test('shell: door opening matches building_meta.json, gate parts are copied, floor lines exist', () => {
  const b = build({ lengthM: 60.96, widthM: 45.72, eaveM: 6.1, roofSlope: 0.0833, bayM: 7.62, postLinesM: [15.24, 30.48], girtsM: [2.4, 4.0], door: { centerXM: 36 } });
  const d = b.meta.door;
  assert.equal(d.centerX, 36000); assert.equal(d.x1 - d.x0, 3800); assert.equal(d.legacyCenterX, 14500);
  assert.equal(b.parts.get('Wall_North_WestSeg').max[0], d.x0);
  assert.equal(b.parts.get('Wall_North_EastSeg').min[0], d.x1);
  assert.equal(b.parts.get('Wall_North_TopDoor1').min[2], d.top);
  assert.ok(b.parts.get('Girt_North_Low_W') && b.parts.get('Girt_North_Low_E'), 'girts below the door top stop at the opening');
  assert.ok(names(b, /^Door_Sectional_/).length >= 5, 'animated gate parts copied from the legacy model');
  assert.equal(names(b, /^SafetyLine_Border_/).length, 4);
  assert.equal(names(b, /^SafetyLine_Aisle_/).length, 2);
  assert.equal(names(b, /^HighBay_LED_Row\d+_X\d+$/).length, 24, '3 rows x 8 bays');
  assert.equal(b.meta.bays, 8);
  // every name the viewer keeps in the default empty shell is produced, and nothing else needs removing
  const keep = /^(Floor_Slab|Joint_|Col_|Roof_|Girt_|Wall_|LinerPanel_|HighBay_|SafetyLine_|Door_Sectional)/;
  assert.deepEqual([...b.parts.keys()].filter(n => !keep.test(n)), []);
});
