import fs from 'fs';
import path from 'path';

const basePath = (process.env.TWIN_ROOT || '.') + '/viewer';

// --------------------------------------------------------------------
// 1. UPDATE index_v2.html TO RESTORE ALL 16 EXPECTED DOM IDs
// --------------------------------------------------------------------
let html = fs.readFileSync(path.join(basePath, 'index_v2.html'), 'utf8');

// Toolbar IDs
html = html.replace('id="btn-mode-trans"', 'id="btn-mode-translate"');
html = html.replace('id="btn-mode-rot"', 'id="btn-mode-rotate"');
html = html.replace('id="btn-space"', 'id="btn-space-toggle"');
html = html.replace('id="btn-snap"', 'id="btn-snap-toggle"');
html = html.replace('id="sel-snap-dist"', 'id="sel-grid-snap"');

// Add sel-rot-snap in snap tb-group if missing
if (!html.includes('id="sel-rot-snap"')) {
  html = html.replace(
    '</select>',
    `</select>
      <select id="sel-rot-snap" onchange="updateSnapSettings()" style="background:#171e2b; color:#c9d1d9; border:1px solid #293447; border-radius:4px; font-size:11px; padding:3px 5px;">
        <option value="5">5°</option>
        <option value="15" selected>15°</option>
        <option value="45">45°</option>
        <option value="90">90°</option>
      </select>`
  );
}

// Add hud-speed into #hud-info
if (!html.includes('id="hud-speed"')) {
  html = html.replace(
    '</span>',
    '</span> | 이동 속도: <span id="hud-speed" style="color:#facc15; font-weight:700;">1.0x</span>'
  );
}

// Add val-selected-mass, badge-ktx2-status, val-body-count, placed-count-badge into Inspector
if (!html.includes('id="val-selected-mass"')) {
  html = html.replace(
    '<span id="sel-bbox-dim"',
    '<span id="badge-ktx2-status" style="display:none;"></span><span id="placed-count-badge" style="display:none;"></span><span id="val-body-count" style="display:none;"></span><span id="val-selected-mass" style="display:none;"></span>\n          <span id="sel-bbox-dim"'
  );
}

// Add material-swatch-grid and mat-physics-readout
if (!html.includes('id="material-swatch-grid"')) {
  html = html.replace(
    '<div class="mat-grid" id="mat-grid"></div>',
    '<div class="mat-grid" id="mat-grid"></div>\n        <div id="material-swatch-grid" style="display:none;"></div>\n        <div id="mat-physics-readout" style="display:none;"></div>'
  );
}

// Add btn-wireframe to camera pills
if (!html.includes('id="btn-wireframe"')) {
  html = html.replace(
    '<button class="btn-cam" id="btn-splat"',
    '<button class="btn-cam" id="btn-wireframe" onclick="toggleWireframe()">🩻 와이어프레임</button>\n        <button class="btn-cam" id="btn-splat"'
  );
}

// Support both win-assets and asset-drawer ID
html = html.replace('id="win-assets" class="floating-win"', 'id="win-assets" data-drawer="true" class="floating-win"');

fs.writeFileSync(path.join(basePath, 'index_v2.html'), html, 'utf8');
console.log('index_v2.html updated with expected IDs!');

// --------------------------------------------------------------------
// 2. DEFENSIVE CODING IN editor_v2.js (NEVER CRASH ON NULL)
// --------------------------------------------------------------------
let js = fs.readFileSync(path.join(basePath, 'editor_v2.js'), 'utf8');

// Replace any risky document.getElementById(...) accesses with safe null-checking
js = js.replace(/document\.getElementById\('asset-drawer'\)/g, "(document.getElementById('win-assets') || document.getElementById('asset-drawer'))");
js = js.replace(/document\.getElementById\('sel-grid-snap'\)\.value/g, "(document.getElementById('sel-grid-snap')?.value || '100')");
js = js.replace(/document\.getElementById\('sel-rot-snap'\)\.value/g, "(document.getElementById('sel-rot-snap')?.value || '15')");

// Safe textContent/innerText assignments
js = js.replace(/document\.getElementById\('val-selected-mass'\)\.innerText =/g, "const _vsm = document.getElementById('val-selected-mass'); if (_vsm) _vsm.innerText =");
js = js.replace(/document\.getElementById\('hud-speed'\)\.innerText =/g, "const _hs = document.getElementById('hud-speed'); if (_hs) _hs.innerText =");
js = js.replace(/document\.getElementById\('mat-physics-readout'\)\.innerHTML =/g, "const _mpr = document.getElementById('mat-physics-readout'); if (_mpr) _mpr.innerHTML =");
js = js.replace(/document\.getElementById\('badge-ktx2-status'\)\.innerText =/g, "const _bks = document.getElementById('badge-ktx2-status'); if (_bks) _bks.innerText =");
js = js.replace(/document\.getElementById\('val-body-count'\)\.innerText =/g, "const _vbc = document.getElementById('val-body-count'); if (_vbc) _vbc.innerText =");
js = js.replace(/document\.getElementById\('placed-count-badge'\)\.innerText =/g, "const _pcb = document.getElementById('placed-count-badge'); if (_pcb) _pcb.innerText =");

// Safe classList toggles
js = js.replace(/document\.getElementById\('btn-mode-translate'\)\.classList/g, "document.getElementById('btn-mode-translate')?.classList");
js = js.replace(/document\.getElementById\('btn-mode-rotate'\)\.classList/g, "document.getElementById('btn-mode-rotate')?.classList");
js = js.replace(/document\.getElementById\('btn-mode-scale'\)\.classList/g, "document.getElementById('btn-mode-scale')?.classList");
js = js.replace(/document\.getElementById\('btn-snap-toggle'\)\.classList/g, "document.getElementById('btn-snap-toggle')?.classList");
js = js.replace(/document\.getElementById\('btn-space-toggle'\)\.innerText =/g, "const _bst = document.getElementById('btn-space-toggle'); if (_bst) _bst.innerText =");

fs.writeFileSync(path.join(basePath, 'editor_v2.js'), js, 'utf8');
console.log('editor_v2.js patched with defensive null-checks!');
