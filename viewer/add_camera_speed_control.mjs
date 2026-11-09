import fs from 'fs';
import path from 'path';

const basePath = 'C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer';

// -------------------------------------------------------------
// 1. UPDATE index_v2.html
// -------------------------------------------------------------
let html = fs.readFileSync(path.join(basePath, 'index_v2.html'), 'utf8');

const camSpeedToolbarHTML = `
    <div class="tb-group">
      <span class="tb-label">카메라 속도</span>
      <input type="range" id="slider-cam-speed" min="0.2" max="5.0" step="0.1" value="1.0" oninput="setCameraSpeedMultiplier(this.value)" style="width:75px; accent-color:#38bdf8; cursor:pointer;" title="카메라 이동 속도 조절 (0.2x ~ 5.0x / 단축키: [ 및 ])">
      <span id="label-cam-speed" style="font-size:11px; font-weight:700; color:#38bdf8; min-width:32px; font-family:ui-monospace,monospace;">1.0x</span>
      <button class="btn-tb" onclick="setCameraSpeedMultiplier(0.5)" title="저속 정밀 뷰잉 (0.5x - 3.75 m/s)" style="padding:4px 6px;">0.5x</button>
      <button class="btn-tb" onclick="setCameraSpeedMultiplier(1.0)" title="표준 속도 (1.0x - 7.5 m/s)" style="padding:4px 6px;">1.0x</button>
      <button class="btn-tb" onclick="setCameraSpeedMultiplier(2.5)" title="고속 공장 순회 (2.5x - 18.75 m/s)" style="padding:4px 6px;">2.5x</button>
    </div>
`;

// Insert camera speed group right after snap group
const snapTarget = '</select>\n    </div>\n\n    <div class="tb-group">\n      <span class="tb-label">화물 게이트</span>';
html = html.replace(snapTarget, `</select>\n    </div>\n${camSpeedToolbarHTML}\n    <div class="tb-group">\n      <span class="tb-label">화물 게이트</span>`);

// Update HUD text to mention [ / ] camera speed hotkeys
html = html.replace(
  '| 이동 속도: <span id="hud-speed"',
  '| 카메라 속도: <span id="hud-speed"'
);
html = html.replace(
  'W·A·S·D</b> 이동 | <b style="color:#facc15;">Q·E</b> 하강/상승 | <b>Shift</b> 가속(3x)',
  'W·A·S·D</b> 이동 | <b style="color:#facc15;">Q·E</b> 하강/상승 | <b>Shift</b> 부스트(3x) | <b style="color:#38bdf8;">[ / ]</b> 속도 조절'
);

fs.writeFileSync(path.join(basePath, 'index_v2.html'), html, 'utf8');
console.log('Successfully updated index_v2.html with camera speed controls!');

// -------------------------------------------------------------
// 2. UPDATE editor_v2.js
// -------------------------------------------------------------
let js = fs.readFileSync(path.join(basePath, 'editor_v2.js'), 'utf8');

// Declare cameraSpeedScalar and setCameraSpeedMultiplier
const camSpeedLogic = `
// ============================================================================
// 카메라 이동 속도 제어 시스템 (Base: 7,500 mm/s × Scalar × Shift Sprint)
// ============================================================================
let baseCameraSpeed = 7500;     // 기본 속도: 7.5 m/s (7,500 mm/s)
let cameraSpeedScalar = 1.0;    // 사용자 조절 스칼라 (0.1x ~ 10.0x)

function setCameraSpeedMultiplier(val, showLog = true) {
  val = Math.max(0.1, Math.min(10.0, parseFloat(val) || 1.0));
  cameraSpeedScalar = Math.round(val * 10) / 10;

  const slider = document.getElementById('slider-cam-speed');
  if (slider) slider.value = cameraSpeedScalar;

  const label = document.getElementById('label-cam-speed');
  if (label) label.innerText = \`\${cameraSpeedScalar.toFixed(1)}x\`;

  const hud = document.getElementById('hud-speed');
  if (hud) {
    const curMps = ((baseCameraSpeed * cameraSpeedScalar) / 1000).toFixed(1);
    hud.innerText = \`\${cameraSpeedScalar.toFixed(1)}x (\${curMps} m/s)\`;
  }

  if (controls) {
    controls.panSpeed = 1.0 * Math.max(0.5, Math.min(2.5, cameraSpeedScalar));
  }

  if (showLog) {
    const mps = ((baseCameraSpeed * cameraSpeedScalar) / 1000).toFixed(1);
    log(\`🏃 카메라 이동 속도 조절: \${cameraSpeedScalar.toFixed(1)}x (\${mps} m/s, \${(baseCameraSpeed * cameraSpeedScalar).toLocaleString()} mm/s)\`);
  }
}
window.setCameraSpeedMultiplier = setCameraSpeedMultiplier;
`;

// Insert camSpeedLogic before updateWASDCameraMovement
js = js.replace(
  'function updateWASDCameraMovement(dt) {',
  `${camSpeedLogic}\nfunction updateWASDCameraMovement(dt) {`
);

// Update updateWASDCameraMovement to use cameraSpeedScalar
const oldWASDLogic = `  const mult = (moveKeys.ShiftLeft || moveKeys.ShiftRight) ? 3.0 : 1.0;
  const speed = 7500 * mult * dt;
  const _hs = document.getElementById('hud-speed'); if (_hs) _hs.innerText = \`\${mult.toFixed(1)}x\`;`;

const newWASDLogic = `  const sprint = (moveKeys.ShiftLeft || moveKeys.ShiftRight) ? 3.0 : 1.0;
  const effectiveMult = cameraSpeedScalar * sprint;
  const speed = baseCameraSpeed * effectiveMult * dt;
  const _hs = document.getElementById('hud-speed');
  if (_hs) {
    const curMps = ((baseCameraSpeed * effectiveMult) / 1000).toFixed(1);
    _hs.innerText = \`\${effectiveMult.toFixed(1)}x (\${curMps} m/s)\${sprint > 1 ? ' [부스트 ⚡]' : ''}\`;
  }`;

js = js.replace(oldWASDLogic, newWASDLogic);

// Add hotkeys '[' and ']' in keydown listener
const hotkeyInsertion = `    // 카메라 속도 단축키: [ (감속), ] (가속)
    if (e.code === 'BracketLeft') {
      setCameraSpeedMultiplier(cameraSpeedScalar - 0.2);
    } else if (e.code === 'BracketRight') {
      setCameraSpeedMultiplier(cameraSpeedScalar + 0.2);
    }
`;

js = js.replace(
  "if (e.code === 'KeyG') {",
  `${hotkeyInsertion}\n    if (e.code === 'KeyG') {`
);

fs.writeFileSync(path.join(basePath, 'editor_v2.js'), js, 'utf8');
console.log('Successfully updated editor_v2.js with camera speed controls!');
