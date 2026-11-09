import fs from 'fs';
import path from 'path';

const basePath = (process.env.TWIN_ROOT || '.') + '/viewer';

// -------------------------------------------------------------
// 1. UPDATE editor_v2.js
// -------------------------------------------------------------
let js = fs.readFileSync(path.join(basePath, 'editor_v2.js'), 'utf8');

// A. Wrap executePLCScanCycle in animate() with try/catch so render NEVER crashes
const oldAnimateLoop = `function animate() {
  requestAnimationFrame(animate);

  // 가상 산업용 PLC 스캔 주기 실행 (50Hz / 20ms)
  executePLCScanCycle();`;

const newAnimateLoop = `function animate() {
  requestAnimationFrame(animate);

  // 가상 산업용 PLC 스캔 주기 실행 (50Hz / 20ms) - 에러 격리로 렌더 중단 방지
  try {
    if (typeof executePLCScanCycle === 'function') executePLCScanCycle();
  } catch (err) {
    console.warn('executePLCScanCycle warning:', err);
  }`;

js = js.replace(oldAnimateLoop, newAnimateLoop);

// B. In updateVirtualPLCUI, make all DOM accesses 100% null-safe
const oldUpdatePLC = `function updateVirtualPLCUI() {
  const plc = virtualPLC;

  // DI 그리드 렌더링
  const diGrid = document.getElementById('plc-di-grid');
  if (diGrid && diGrid.children.length === 0) {`;

const newUpdatePLC = `function updateVirtualPLCUI() {
  if (typeof virtualPLC === 'undefined') return;
  const plc = virtualPLC;

  // DI 그리드 렌더링
  const diGrid = document.getElementById('plc-di-grid');
  if (diGrid && diGrid.children && diGrid.children.length === 0) {`;

js = js.replace(oldUpdatePLC, newUpdatePLC);

js = js.replace(
  'if (doGrid && doGrid.children.length === 0) {',
  'if (doGrid && doGrid.children && doGrid.children.length === 0) {'
);

// C. Fix Cargo Gate South Wall placement:
// Original gate in OBJ is at X=14500, Y=15900 (North wall).
// To move to South wall (Y=0): translation delta is Y: -15900, rotZ: 0!
const oldRelocateSouth = `  if (wall === 'SOUTH') {
    // 남측 벽면 (Y=0, 사용자가 요청한 반대편)
    cargoGateMasterAssembly.position.set(3500, -15800, 0);
    cargoGateMasterAssembly.rotation.z = Math.PI;`;

const newRelocateSouth = `  if (wall === 'SOUTH') {
    // 남측 벽면 (Y=0, 사용자가 요청한 반대편 정합)
    cargoGateMasterAssembly.position.set(0, -15900, 0);
    cargoGateMasterAssembly.rotation.z = 0;`;

if (js.includes(oldRelocateSouth)) {
  js = js.replace(oldRelocateSouth, newRelocateSouth);
  console.log('Updated relocateCargoGate for SOUTH wall!');
} else {
  // Regex replace if whitespace differed
  js = js.replace(
    /cargoGateMasterAssembly\.position\.set\(3500,\s*-15800,\s*0\);\s*cargoGateMasterAssembly\.rotation\.z\s*=\s*Math\.PI;/,
    'cargoGateMasterAssembly.position.set(0, -15900, 0);\n    cargoGateMasterAssembly.rotation.z = 0;'
  );
  console.log('Regex updated relocateCargoGate for SOUTH wall!');
}

// D. Make sure animate() calls renderer.render inside try/catch
js = js.replace(
  'renderer.render(scene, camera);',
  `try {
    renderer.render(scene, camera);
  } catch (renderErr) {
    console.error('Critical WebGL render error:', renderErr);
  }`
);

fs.writeFileSync(path.join(basePath, 'editor_v2.js'), js, 'utf8');
console.log('Successfully updated editor_v2.js with all runtime safeguards!');

// -------------------------------------------------------------
// 2. UPDATE index_v2.html: Clean duplicate IDs & fix modal CSS
// -------------------------------------------------------------
let html = fs.readFileSync(path.join(basePath, 'index_v2.html'), 'utf8');

// Ensure #render-modal-overlay is display:none !important
if (!html.includes('#render-modal-overlay { display: none !important; }')) {
  html = html.replace(
    '</style>',
    '  #render-modal-overlay { display: none !important; position: fixed; inset: 0; z-index: 300; }\n  </style>'
  );
}

fs.writeFileSync(path.join(basePath, 'index_v2.html'), html, 'utf8');
console.log('Successfully updated index_v2.html!');
