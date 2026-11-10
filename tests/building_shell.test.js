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
  assert.equal(b.parts.get('Wall_North_Seg1').max[0], d.x0);
  assert.equal(b.parts.get('Wall_North_Seg2').min[0], d.x1);
  assert.equal(b.parts.get('Wall_North_TopDoor1').min[2], d.top);
  assert.ok(b.parts.get('Girt_North_Low_1') && b.parts.get('Girt_North_Low_2'), 'girts below the door top stop at the opening');
  assert.ok(names(b, /^Door_Sectional_/).length >= 5, 'animated gate parts copied from the legacy model');
  assert.equal(names(b, /^SafetyLine_Border_/).length, 4);
  assert.equal(names(b, /^SafetyLine_Aisle_/).length, 2);
  assert.equal(names(b, /^HighBay_LED_Row\d+_X\d+$/).length, 24, '3 rows x 8 bays');
  assert.equal(b.meta.bays, 8);
  // every name the viewer keeps in the default empty shell is produced, and nothing else needs removing
  const keep = /^(Floor_Slab|Joint_|Col_|Roof_|Girt_|Wall_|LinerPanel_|HighBay_|SafetyLine_|Door_Sectional)/;
  assert.deepEqual([...b.parts.keys()].filter(n => !keep.test(n)), []);
});

test('structures: entrance, restrooms, stair and mezzanine are separate parts at the configured places', () => {
  const b = build({
    lengthM: 60.96, widthM: 30.48, eaveM: 6.1, roofSlope: 0.0833, bayM: 7.62, postLinesM: [15.24], girtsM: [2.4, 4.0], door: { centerXM: 36 },
    structures: {
      mezzanine: { x0M: 42, depthM: 15.24, deckM: 3.05, officeWallM: 2.7 },
      stair: { xM: 40.5, widthM: 1.4, footYM: 12.2, risers: 17, treadM: 0.28 },
      restrooms: { x0M: 40.5, x1M: 44.5, depthYM: 6, heightM: 2.9, doorsYM: [0.9, 3.6], doorWidthM: 0.9, doorHeightM: 2.1 },
      entrance: { x0M: 38.3, widthM: 1.8, heightM: 2.2 }
    }
  });
  // entrance: the wall is open exactly where the glass door stands
  assert.equal(b.parts.get('Wall_South_Seg1').max[0], 38300);
  assert.equal(b.parts.get('Wall_South_Seg2').min[0], 40100);
  assert.equal(b.parts.get('Wall_South_TopEntry').min[2], 2200);
  assert.equal(names(b, /^Main_Glass_Entry_Panel_/).length, 2);
  // mezzanine: deck at 3.05 m from x = 42 m to the end wall, half the width deep; office walls above, cage below
  const slab = b.parts.get('Mezzanine_Slab');
  assert.deepEqual([slab.min[0], slab.max[0], slab.max[1], slab.max[2]], [42000, 60960, 15240, 3050]);
  assert.equal(b.parts.get('Mezz_Upper_Wall_North').max[2], 5750);
  assert.ok(b.parts.get('Cage_Mesh_North_Panel').max[2] < slab.min[2], 'cage stops under the deck beams');
  assert.equal(names(b, /^Mezz_Upper_Window_N\d$/).length, 3);
  // stair: 16 treads rise evenly to the landing at deck level, foot 12.2 m from the entrance wall, rising toward it
  const steps = names(b, /^Stair_BlackStep_\d+$/).map(n => b.parts.get(n));
  assert.equal(steps.length, 16);
  assert.equal(b.parts.get('Stair_BlackStep_1').max[1], 12200);
  assert.ok(Math.abs(b.parts.get('Stair_BlackStep_16').max[2] - 16 * 3050 / 17) < 0.2);
  assert.ok(b.parts.get('Stair_BlackStep_16').min[1] < b.parts.get('Stair_BlackStep_1').min[1], 'higher steps are nearer the entrance wall');
  assert.equal(b.parts.get('Stair_BlackLanding_Deck').max[2], 3050);
  const panel = b.parts.get('Stair_WhiteWall_West');
  assert.deepEqual([panel.min[0], panel.min[1], panel.max[1], panel.max[2]], [40500, 6000, 12200, 4050]);
  // restrooms: two door openings in the hall-side wall, each with a header and a door leaf
  assert.equal(names(b, /^Restroom_Box_Wall_West_Header\d$/).length, 2);
  assert.equal(names(b, /^Restroom_OpenDoor_Grey_\d$/).length, 2);
  assert.equal(b.parts.get('Restroom_Box_Wall_West_Header1').min[2], 2100);
  assert.equal(b.parts.get('Restroom_Box_Roof').max[2], 3050, 'restroom roof is level with the stair landing');
  for (const [n, p] of b.parts) assert.equal(p.noNormal, 0, n);
  // the viewer's default keep-list covers every generated part
  const keep = /^(Floor_Slab|Joint_|Col_|Roof_|Girt_|Wall_|LinerPanel_|HighBay_|SafetyLine_|Door_Sectional|Exit_|Main_Glass_Entry_|Mezzanine_|Mezz_|Stair_|Restroom_|Cage_|Wood_Guardrail_)/;
  assert.deepEqual([...b.parts.keys()].filter(n => !keep.test(n)), []);
});

test('fixed items: the shipped config puts the glass entrance in the office-end wall and adds doors, fans, heaters, round lights, east stair', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'building.config.json'), 'utf8'));
  const b = build(cfg), S = cfg.structures, LX = cfg.lengthM * 1000, WY = cfg.widthM * 1000;
  // entrance: east wall is open exactly at the door, the south wall is whole again
  const top = b.parts.get('Wall_East_TopEntry');
  assert.deepEqual([top.min[1], top.max[1], top.min[2]], [S.entrance.startM * 1000, (S.entrance.startM + S.entrance.widthM) * 1000, S.entrance.heightM * 1000]);
  assert.equal(b.parts.get('Main_Glass_Entry_Panel_L').min[0] >= LX, true, 'glass sits in the east wall thickness');
  assert.ok(!b.parts.has('Wall_South_TopEntry'));
  // cargo wall, west to east: sectional gate, exit door, roll-up door — three openings, four solid stretches
  assert.equal(names(b, /^Wall_North_Seg\d$/).length, 4);
  const gate = b.meta.door, exit = b.parts.get('Wall_North_TopExit1'), ru = b.parts.get('Wall_North_TopRollup');
  assert.ok(gate.x1 < exit.min[0] && exit.max[0] < ru.min[0], 'gate, then exit door, then roll-up door');
  assert.equal(ru.min[2], S.rollup.heightM * 1000);
  assert.equal(b.parts.get('RollUp_Door_Curtain').max[2], S.rollup.heightM * 1000);
  assert.ok(b.parts.get('RollUp_Door_Curtain').min[1] >= WY, 'curtain closes the opening inside the wall thickness');
  // girts stop at the tall openings but run over the man doors
  assert.equal(names(b, /^Girt_North_Low_\d$/).length, 3);            // 2.4 m: cut by gate and roll-up (exit door is 2.13 m)
  assert.ok(b.parts.get('Girt_West_Low') && b.parts.get('Girt_East_Low'));
  assert.equal(names(b, /^Exit_Door_\d_Leaf$/).length, 3);
  assert.equal(names(b, /^Exit_Sign_\d_Red$/).length, 3);
  assert.equal(names(b, /^Shutter_Fan_\d+_Frame$/).length, 5);
  assert.equal(names(b, /^WallVent_Louver_\d+_Frame$/).length, 4);
  assert.equal(names(b, /^Ceiling_Gas_UnitHeater_\d$/).length, 3);
  // round lights: 12-sided discs (14 faces), 2 rows x 8 bays
  const lights = names(b, /^HighBay_LED_Row\d+_X\d+$/);
  assert.equal(lights.length, 16);
  assert.equal(b.parts.get(lights[0]).faces, 14);
  // east stair (assumed shape): 16 treads up to deck level along the mezzanine's hall face
  assert.equal(names(b, /^Stair_BlackStep_E\d+$/).length, 16);
  assert.equal(b.parts.get('Stair_BlackLanding_Deck_E').max[2], S.mezzanine.deckM * 1000);
  assert.equal(b.parts.get('Stair_BlackStep_E1').min[1] >= S.mezzanine.depthM * 1000, true);
  for (const [n, p] of b.parts) assert.equal(p.noNormal, 0, n);
  const keep = /^(Floor_Slab|Joint_|Col_|Roof_|Girt_|Wall_|LinerPanel_|HighBay_|SafetyLine_|Floor_Stop_Decal|Door_Sectional|RollUp_Door_|Exit_|Shutter_Fan|WallVent_|Main_Glass_Entry_|Ceiling_Gas_UnitHeater|Mezzanine_|Mezz_|Stair_|Restroom_|Cage_|Wood_Guardrail_)/;
  assert.deepEqual([...b.parts.keys()].filter(n => !keep.test(n)), []);
});
