import fs from 'fs';
import path from 'path';

const basePath = 'C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer';

// -----------------------------------------------------------------
// 1. FIX CSS IN index_v2.html
// -----------------------------------------------------------------
let html = fs.readFileSync(path.join(basePath, 'index_v2.html'), 'utf8');

// Fix broken selectors
html = html.replace('#win-inspector .panel-', `#win-inspector .panel-body {
      flex: 1;
      padding: 10px 12px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }`);

html = html.replace('.win-gate-\n    .gate-status-row', `.win-gate-body {
      flex: 1;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-size: 11.5px;
      overflow-y: auto;
    }
    .gate-status-row`);

html = html.replace('.panel-\n    .card', `.panel-body {
      flex: 1;
      overflow-y: auto;
    }
    .card`);

// Remove display: flex !important from .floating-win and add .win-hidden
html = html.replace('display: flex !important;', 'display: flex;');
html = html.replace('resize: both !important;', 'resize: both;');
html = html.replace('overflow: hidden !important;', 'overflow: hidden;');

if (!html.includes('.floating-win.win-hidden')) {
  html = html.replace(
    '.floating-win.collapsed {',
    `.floating-win.win-hidden {
      display: none !important;
    }
    .floating-win.collapsed {`
  );
}

// Enhance .win-corner-grip CSS styling
const newGripCSS = `
    .win-corner-grip {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 24px;
      height: 24px;
      cursor: nwse-resize;
      z-index: 120;
      background: linear-gradient(135deg, transparent 45%, rgba(88, 166, 255, 0.45) 45%, #38bdf8 100%);
      border-bottom-right-radius: 7px;
      transition: background 0.15s ease, width 0.15s ease, height 0.15s ease;
    }
    .win-corner-grip:hover {
      background: linear-gradient(135deg, transparent 35%, rgba(56, 189, 248, 0.8) 35%, #00e5ff 100%);
      width: 28px;
      height: 28px;
    }
`;

html = html.replace(/\.win-corner-grip\s*\{[^}]*\}\s*\.win-corner-grip:hover\s*\{[^}]*\}/, newGripCSS.trim());

// Update delete button in Inspector to have explicit id and clear hover styling
html = html.replace(
  'onclick="deleteSelected()">🗑️ 삭제 (Del)</button>',
  'id="btn-delete-selected" onclick="deleteSelected()" style="flex:1; justify-content:center; color:#f85149; border-color:#da3633; background:rgba(218,54,51,0.15); font-weight:700;">🗑️ 선택 삭제 (Del)</button>'
);

fs.writeFileSync(path.join(basePath, 'index_v2.html'), html, 'utf8');
console.log('Fixed index_v2.html CSS and buttons!');

// -----------------------------------------------------------------
// 2. FIX editor_v2.js (toggleWinVisibility, deleteSelected, resize)
// -----------------------------------------------------------------
let js = fs.readFileSync(path.join(basePath, 'editor_v2.js'), 'utf8');

// Replace deleteSelected with robust version that alerts if nothing selected and deletes any object
const robustDeleteSelected = `function deleteSelected() {
  if (!selectedObject) {
    log('⚠️ 삭제할 오브제를 3D 화면에서 먼저 클릭하여 선택하세요. (또는 아웃라이너에서 선택)');
    return;
  }
  pushUndoState();
  const obj = selectedObject;
  const name = obj.name || obj.userData?.displayName || '선택 오브제';

  transformControl.detach();
  if (selectBoxHelper) {
    scene.remove(selectBoxHelper);
    selectBoxHelper = null;
  }

  // 1. 씬 및 부모 그룹에서 완전 분리
  if (obj.parent) {
    obj.parent.remove(obj);
  }
  scene.remove(obj);
  if (controllableBaseGroup) controllableBaseGroup.remove(obj);
  if (placedAssetsGroup) placedAssetsGroup.remove(obj);

  // 2. 고유 키 기록 (저장 시 영구 삭제 반영)
  const baseKey = obj.userData?.baseKey || obj.userData?.originalKey || obj.name;
  if (baseKey) deletedBaseObjects.add(baseKey);

  const bIdx = baseControllableObjects.indexOf(obj);
  if (bIdx !== -1) baseControllableObjects.splice(bIdx, 1);

  const pIdx = placedAssets.indexOf(obj);
  if (pIdx !== -1) placedAssets.splice(pIdx, 1);

  selectAssetObject(null);
  updateOutlinerUI();
  log(\`🗑️ '\${name}' 오브제가 성공적으로 삭제되었습니다.\`);
}`;

const delStart = js.indexOf('function deleteSelected() {');
const delEnd = js.indexOf('function focusSelected() {');
if (delStart !== -1 && delEnd !== -1) {
  js = js.substring(0, delStart) + robustDeleteSelected + '\n\n' + js.substring(delEnd);
}

// Replace toggleWinVisibility with classList win-hidden toggle
js = js.replace(
  /function toggleWinVisibility\(winId\) \{[\s\S]*?\n\}/,
  `function toggleWinVisibility(winId) {
  const win = document.getElementById(winId);
  if (!win) return;
  win.classList.toggle('win-hidden');
  if (!win.classList.contains('win-hidden')) {
    activeZIndex += 2;
    win.style.zIndex = activeZIndex;
  }
}`
);

// Replace close buttons in initFloatingWindows
js = js.replace(
  /closeBtn\.onclick = \(e\) => \{[\s\S]*?\};/,
  `closeBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        win.classList.add('win-hidden');
      };`
);

// In syncInspectorFromSelected, update delete button state visually
const syncStart = js.indexOf('function syncInspectorFromSelected() {');
if (syncStart !== -1) {
  const syncSub = js.substring(syncStart, syncStart + 1500);
  if (!syncSub.includes('btn-delete-selected')) {
    js = js.replace(
      "document.getElementById('sel-obj-badge').innerText = displayName;",
      `document.getElementById('sel-obj-badge').innerText = displayName;
  const delBtn = document.getElementById('btn-delete-selected');
  if (delBtn) {
    delBtn.style.opacity = '1.0';
    delBtn.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.4)';
  }`
    );
    js = js.replace(
      "document.getElementById('sel-obj-badge').innerText = '선택 없음';",
      `document.getElementById('sel-obj-badge').innerText = '선택 없음';
  const delBtn = document.getElementById('btn-delete-selected');
  if (delBtn) {
    delBtn.style.opacity = '0.6';
    delBtn.style.boxShadow = 'none';
  }`
    );
  }
}

// Ensure controllableBaseGroup contains all custom architectural groups for 100% selectability
js = js.replace(
  "scene.add(rrPodGroup);\n    baseControllableObjects.push(rrPodGroup);",
  "if (controllableBaseGroup) controllableBaseGroup.add(rrPodGroup); else scene.add(rrPodGroup);\n    baseControllableObjects.push(rrPodGroup);"
);
js = js.replace(
  "scene.add(entranceStairGroup);\n    baseControllableObjects.push(entranceStairGroup);",
  "if (controllableBaseGroup) controllableBaseGroup.add(entranceStairGroup); else scene.add(entranceStairGroup);\n    baseControllableObjects.push(entranceStairGroup);"
);
js = js.replace(
  "scene.add(dockBayGroup);\n    baseControllableObjects.push(dockBayGroup);",
  "if (controllableBaseGroup) controllableBaseGroup.add(dockBayGroup); else scene.add(dockBayGroup);\n    baseControllableObjects.push(dockBayGroup);"
);
js = js.replace(
  "scene.add(buttonStationGroup);\n    baseControllableObjects.push(buttonStationGroup);",
  "if (controllableBaseGroup) controllableBaseGroup.add(buttonStationGroup); else scene.add(buttonStationGroup);\n    baseControllableObjects.push(buttonStationGroup);"
);

fs.writeFileSync(path.join(basePath, 'editor_v2.js'), js, 'utf8');
console.log('Successfully updated editor_v2.js!');
