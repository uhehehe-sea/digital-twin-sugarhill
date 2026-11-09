import fs from 'fs';
import path from 'path';

const basePath = (process.env.TWIN_ROOT || '.') + '/viewer';

// ---------------------------------------------------------------------
// 1. UPDATE index_v2.html: Add Resizers & Cargo Wall Presets UI
// ---------------------------------------------------------------------
let html = fs.readFileSync(path.join(basePath, 'index_v2.html'), 'utf8');

// A. CSS for 3-way resizers (Right border, Bottom border, Corner grip)
const resizerCSS = `
    /* 3방향 고성능 윈도우 리사이저 (우측변, 하단변, 대각 모서리) */
    .win-resize-r {
      position: absolute;
      top: 0;
      right: 0;
      width: 8px;
      height: calc(100% - 24px);
      cursor: ew-resize;
      z-index: 160;
      transition: background 0.15s;
    }
    .win-resize-r:hover, .win-resize-r.active {
      background: rgba(56, 189, 248, 0.5);
    }
    .win-resize-b {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 8px;
      width: calc(100% - 24px);
      cursor: ns-resize;
      z-index: 160;
      transition: background 0.15s;
    }
    .win-resize-b:hover, .win-resize-b.active {
      background: rgba(56, 189, 248, 0.5);
    }
    .win-corner-grip {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 26px;
      height: 26px;
      cursor: nwse-resize;
      z-index: 200 !important;
      background: linear-gradient(135deg, transparent 40%, rgba(56, 189, 248, 0.5) 40%, #00e5ff 100%);
      border-bottom-right-radius: 7px;
      transition: background 0.15s ease, width 0.15s ease, height 0.15s ease;
      pointer-events: auto !important;
    }
    .win-corner-grip:hover {
      background: linear-gradient(135deg, transparent 30%, rgba(56, 189, 248, 0.9) 30%, #38bdf8 100%);
      width: 30px;
      height: 30px;
    }
`;

// Insert resizer CSS before </style>
html = html.replace('</style>', `${resizerCSS}\n  </style>`);

// Add bottom padding to .panel-body to prevent scrollbar collision with corner grip
html = html.replace(
  'padding: 10px 12px;\n      overflow-y: auto;\n      display: flex;\n      flex-direction: column;\n      gap: 10px;',
  'padding: 10px 12px 28px 12px;\n      overflow-y: auto;\n      display: flex;\n      flex-direction: column;\n      gap: 10px;'
);

// Add .win-resize-r and .win-resize-b to all 4 floating windows
const winIds = ['win-inspector', 'win-assets', 'win-gate-anim', 'win-plc'];
winIds.forEach(id => {
  const winTag = `<div id="${id}"`;
  const idx = html.indexOf(winTag);
  if (idx !== -1) {
    const endGrip = html.indexOf('<div class="win-corner-grip"', idx);
    if (endGrip !== -1) {
      const alreadyHas = html.substring(idx, endGrip).includes('class="win-resize-r"');
      if (!alreadyHas) {
        html = html.substring(0, endGrip) +
          `<div class="win-resize-r" title="가로 크기 조절 (드래그)"></div>\n    <div class="win-resize-b" title="세로 크기 조절 (드래그)"></div>\n    ` +
          html.substring(endGrip);
      }
    }
  }
});

// B. Add Cargo Door Wall Location Selector UI to #win-gate-anim
const wallLocationUI = `
        <!-- 화물문 설치 벽면 선택기 (남측/북측/서측/동측 원클릭 이동) -->
        <div style="background:#0c121d; border:1px solid #202d42; border-radius:6px; padding:8px 10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <b style="color:#38bdf8; font-size:11px;">📍 화물 게이트 설치 벽면 (Wall Position)</b>
            <span id="label-gate-wall" style="font-size:10px; color:#10b981; font-weight:700;">남측 벽면 [반대편]</span>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:4px;">
            <button class="btn-tb active-green" id="btn-wall-south" onclick="relocateCargoGate('SOUTH')" title="남측 벽면으로 이동 (반대편)">
              남측 (Y=0)
            </button>
            <button class="btn-tb" id="btn-wall-north" onclick="relocateCargoGate('NORTH')" title="북측 벽면으로 이동 (기존)">
              북측 (Y=16m)
            </button>
            <button class="btn-tb" id="btn-wall-west" onclick="relocateCargoGate('WEST')" title="서측 벽면으로 이동">
              서측 (X=0)
            </button>
            <button class="btn-tb" id="btn-wall-east" onclick="relocateCargoGate('EAST')" title="동측 벽면으로 이동">
              동측 (X=24m)
            </button>
          </div>
          <div style="font-size:10px; color:#64748b; margin-top:4px;">
            * 또는 3D 화면에서 화물문을 클릭 후 <b>G(이동) · R(회전)</b>으로 원하는 벽면에 정확히 맞추세요.
          </div>
        </div>
`;

html = html.replace(
  '<div class="gate-status-row">',
  `${wallLocationUI}\n      <div class="gate-status-row">`
);

fs.writeFileSync(path.join(basePath, 'index_v2.html'), html, 'utf8');
console.log('Successfully updated index_v2.html with 3-way resizers and wall relocation UI!');

// ---------------------------------------------------------------------
// 2. UPDATE editor_v2.js: Gate Animation, Assembly Master, & Resizing
// ---------------------------------------------------------------------
let js = fs.readFileSync(path.join(basePath, 'editor_v2.js'), 'utf8');

// Declare master variables at top scope
const masterGateVars = `
// ============================================================================
// 🚪 화물 적재 도어 마스터 어셈블리 및 리프팅 애니메이션 상태
// ============================================================================
let cargoGateMasterAssembly = null;  // 전체 화물문 + 트랙 + 샤프트 + 모터 + 버튼 + 범퍼 일체형 어셈블리
let gatePanelsGroup = null;          // 상하 리프팅 가동 패널 7개 그룹
let gateShaftGroup = null;           // 회전하는 상부 토션 스프링 샤프트
let gateWarningLight = null;         // 상부 스트로보 경광등
let gateButtonStationMesh = null;    // 벽면 3D 푸시버튼 제어기
let currentGateWall = 'SOUTH';       // 기본: 남측 벽면 (반대편)

let gateState = {
  status: 'CLOSED',
  progress: 0.0,
  targetProgress: 0.0,
  speed: 0.45
};
`;

// Insert masterGateVars before loadPrecisionModel
js = js.replace('function loadPrecisionModel() {', `${masterGateVars}\nfunction loadPrecisionModel() {`);

// Remove any duplicate redeclarations of gateState/gatePanelsGroup
js = js.replace(
  /let gateState = \{[\s\S]*?\};\s*let gatePanelsGroup = null;\s*let gateShaftGroup = null;\s*let gateWarningLight = null;\s*let gateButtonStationMesh = null;/g,
  '// (Gate state declared at top scope)'
);

// B. Overhaul Gate Mesh Assembly inside loadPrecisionModel()
const oldGatePopulate = `    // =========================================================================
    // 5. 화물 게이트 리프팅 가동부(Moving Panels) 분리 연결
    // =========================================================================
    gatePanelsGroup = new THREE.Group();
    gatePanelsGroup.name = 'Gate_Moving_Panels';
    scene.add(gatePanelsGroup);

    const doorMeshNames = ['Door_Sectional_Logistics', 'Door_Sectional_BottomWhite', 'Door_Sectional_Stile_L', 'Door_Sectional_Stile_R'];
    doorMeshNames.forEach(mName => {
      const m = meshesByName[mName];
      if (m) {
        gatePanelsGroup.attach(m);
      }
    });

    gateShaftGroup = meshesByName['Door_Sectional_TorsionShaft'];

    const strobeMesh = new THREE.Mesh(new THREE.CylinderGeometry(60, 80, 100, 16), new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xd97706, roughness: 0.1 }));
    strobeMesh.position.set(14500, 15900, 4400);
    scene.add(strobeMesh);
    gateWarningLight = strobeMesh;`;

const newGatePopulate = `    // =========================================================================
    // 5. 화물 게이트 마스터 어셈블리 (모든 부품 일체형 캡슐화 & 벽면 자유 이동 보장)
    // =========================================================================
    cargoGateMasterAssembly = new THREE.Group();
    cargoGateMasterAssembly.name = '🚪 화물 적재 도어 & 하역장 일체형 어셈블리';

    // 1) 리프팅 가동 패널 7종 결합
    gatePanelsGroup = new THREE.Group();
    gatePanelsGroup.name = 'Gate_Moving_Panels';
    cargoGateMasterAssembly.add(gatePanelsGroup);

    const panelMeshNames = [
      'Door_Sectional_Logistics',
      'Door_Sectional_BottomWhite',
      'Door_Sectional_Stile_X12600',
      'Door_Sectional_Stile_X13550',
      'Door_Sectional_Stile_X14500',
      'Door_Sectional_Stile_X15450',
      'Door_Sectional_Stile_X16340'
    ];

    panelMeshNames.forEach(mName => {
      const m = meshesByName[mName];
      if (m) {
        gatePanelsGroup.add(m);
      }
    });

    // 2) 고정 트랙, 모터, 회전 샤프트 결합
    const trackL = meshesByName['Door_Sectional_Track_L'];
    const trackR = meshesByName['Door_Sectional_Track_R'];
    const motor = meshesByName['Door_Sectional_HoistMotor_Black'];
    gateShaftGroup = meshesByName['Door_Sectional_TorsionShaft'];

    if (trackL) cargoGateMasterAssembly.add(trackL);
    if (trackR) cargoGateMasterAssembly.add(trackR);
    if (motor) cargoGateMasterAssembly.add(motor);
    if (gateShaftGroup) cargoGateMasterAssembly.add(gateShaftGroup);

    // 3) 상부 경광등 결합
    const strobeMesh = new THREE.Mesh(new THREE.CylinderGeometry(60, 80, 100, 16), new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xd97706, roughness: 0.1 }));
    strobeMesh.position.set(14500, 15900, 4400);
    cargoGateMasterAssembly.add(strobeMesh);
    gateWarningLight = strobeMesh;

    // 4) 3D 푸시버튼 및 바닥 도크 범퍼 결합
    if (buttonStationGroup) cargoGateMasterAssembly.add(buttonStationGroup);
    if (dockBayGroup) cargoGateMasterAssembly.add(dockBayGroup);

    // 원점을 도어 중심(X:14500, Y:15900)으로 피벗 캘리브레이션
    cargoGateMasterAssembly.position.set(0, 0, 0);

    scene.add(cargoGateMasterAssembly);
    baseControllableObjects.push(cargoGateMasterAssembly);

    // 사용자 요청 반영: 반대편(남측 벽면)으로 즉시 기본 배치
    relocateCargoGate('SOUTH', false);`;

js = js.replace(oldGatePopulate, newGatePopulate);

// C. Insert Gate Animation Interpolation Loop into animate()
const animHookTarget = "updateWASDCameraMovement(dt);";
const gateAnimLoopCode = `  // 🚪 화물 게이트 4.1m 리프팅 물리 애니메이션 루프
  if (gateState.progress !== gateState.targetProgress) {
    const dir = Math.sign(gateState.targetProgress - gateState.progress);
    const step = gateState.speed * dt;
    if (Math.abs(gateState.targetProgress - gateState.progress) <= step) {
      gateState.progress = gateState.targetProgress;
      if (gateState.progress >= 0.99) gateState.status = 'OPEN';
      else if (gateState.progress <= 0.01) gateState.status = 'CLOSED';
    } else {
      gateState.progress += dir * step;
      gateState.status = dir > 0 ? 'OPENING' : 'CLOSING';
    }

    // 도어 7개 패널 일괄 수직 상승 & 천장 곡선 레일 틸트
    if (gatePanelsGroup) {
      gatePanelsGroup.position.z = gateState.progress * 4100;
      gatePanelsGroup.position.y = -Math.pow(gateState.progress, 2) * 850;
    }

    // 토션 스프링 샤프트 고속 회전 (16파이)
    if (gateShaftGroup) {
      gateShaftGroup.rotation.x = gateState.progress * Math.PI * 16;
    }

    // 상부 황색 경광등 점멸 (Strobe Pulse)
    if (gateWarningLight && gateWarningLight.material) {
      const flash = Math.sin(Date.now() * 0.02) > 0;
      gateWarningLight.material.emissiveIntensity = flash ? 3.0 : 0.2;
    }

    updateGateUI();
  }
`;

js = js.replace(animHookTarget, `${gateAnimLoopCode}\n  ${animHookTarget}`);

// D. Add relocateCargoGate function
const relocateCargoGateCode = `
// ============================================================================
// 🚪 화물문 4개 벽면 (남측/북측/서측/동측) 원클릭 프리셋 이동 함수
// ============================================================================
function relocateCargoGate(wall, showLog = true) {
  if (!cargoGateMasterAssembly) return;
  currentGateWall = wall;

  // 모든 벽면 버튼 스타일 동기화
  ['south', 'north', 'west', 'east'].forEach(w => {
    const btn = document.getElementById(\`btn-wall-\${w}\`);
    if (btn) btn.classList.remove('active-green');
  });
  const activeBtn = document.getElementById(\`btn-wall-\${wall.toLowerCase()}\`);
  if (activeBtn) activeBtn.classList.add('active-green');

  const label = document.getElementById('label-gate-wall');

  if (wall === 'SOUTH') {
    // 반대편 남측 벽면: 메자닌 반대편 넓은 작업장 구역 (X: 18000, Y: 100)
    // 북측(14500, 15900) 기준 오프셋 이동 및 180도 회전
    cargoGateMasterAssembly.position.set(3500, -15800, 0);
    cargoGateMasterAssembly.rotation.z = Math.PI;
    if (label) label.innerText = '남측 벽면 [반대편]';
    if (showLog) log('🚪 [위치 변경] 화물 게이트를 사용자가 요청한 [반대편 남측 벽면(Y=0)]으로 재배치했습니다.');
  } else if (wall === 'NORTH') {
    // 북측 벽면 (원래 위치)
    cargoGateMasterAssembly.position.set(0, 0, 0);
    cargoGateMasterAssembly.rotation.z = 0;
    if (label) label.innerText = '북측 벽면 (Y=16m)';
    if (showLog) log('🚪 [위치 변경] 화물 게이트를 [북측 벽면(Y=16m)]으로 배치했습니다.');
  } else if (wall === 'WEST') {
    // 서측 벽면
    cargoGateMasterAssembly.position.set(-14400, -5400, 0);
    cargoGateMasterAssembly.rotation.z = -Math.PI / 2;
    if (label) label.innerText = '서측 벽면 (X=0)';
    if (showLog) log('🚪 [위치 변경] 화물 게이트를 [서측 벽면(X=0)]으로 배치했습니다.');
  } else if (wall === 'EAST') {
    // 동측 벽면
    cargoGateMasterAssembly.position.set(9400, -7900, 0);
    cargoGateMasterAssembly.rotation.z = Math.PI / 2;
    if (label) label.innerText = '동측 벽면 (X=24m)';
    if (showLog) log('🚪 [위치 변경] 화물 게이트를 [동측 벽면(X=24m)]으로 배치했습니다.');
  }

  syncInspectorFromSelected();
}
window.relocateCargoGate = relocateCargoGate;
`;

js += `\n${relocateCargoGateCode}\n`;

// E. Overhaul initFloatingWindows with Pointer-Captured 3-Way Resizing
const targetInitFloat = 'function initFloatingWindows() {';
const endInitFloat = 'function toggleWinCollapse(winId) {';
const floatStartIdx = js.indexOf(targetInitFloat);
const floatEndIdx = js.indexOf(endInitFloat);

const newFloatingWindowsManager = `function initFloatingWindows() {
  const winIds = ['win-inspector', 'win-assets', 'win-gate-anim', 'win-plc'];

  winIds.forEach(id => {
    const win = document.getElementById(id);
    if (!win) return;

    // 초기 렌더링 시점에 윈도우의 fixed 좌표를 left/top 픽셀 좌표로 앵커링 변환
    const initRect = win.getBoundingClientRect();
    if (!win.style.left || win.style.left === 'auto') {
      win.style.left = initRect.left + 'px';
      win.style.top = initRect.top + 'px';
      win.style.width = initRect.width + 'px';
      win.style.height = initRect.height + 'px';
      win.style.right = 'auto';
      win.style.bottom = 'auto';
    }

    // 1. 클릭 시 포커스 및 최상위 레이어 전환
    win.addEventListener('pointerdown', () => {
      activeZIndex += 2;
      win.style.zIndex = activeZIndex;
      winIds.forEach(otherId => {
        const other = document.getElementById(otherId);
        if (other && other !== win) other.classList.remove('active-focus');
      });
      win.classList.add('active-focus');
    }, { passive: true });

    // 2. 창 제어 버튼 직접 바인딩 (닫기, 최소화, 복원)
    const closeBtn = win.querySelector('.win-btn.close');
    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        win.classList.add('win-hidden');
      };
    }
    const collapseBtn = win.querySelector('.win-btn:not(.close)');
    if (collapseBtn) {
      collapseBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        win.classList.toggle('collapsed');
      };
    }

    // 3. 타이틀바 드래그 이동 (window 레벨 이벤트 추적)
    const titlebar = win.querySelector('.win-titlebar');
    if (titlebar) {
      let isDragging = false;
      let startMouseX = 0, startMouseY = 0;
      let startWinLeft = 0, startWinTop = 0;

      titlebar.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.win-controls') || e.target.tagName === 'BUTTON') return;
        isDragging = true;
        activeZIndex += 2;
        win.style.zIndex = activeZIndex;

        const rect = win.getBoundingClientRect();
        startMouseX = e.clientX;
        startMouseY = e.clientY;
        startWinLeft = rect.left;
        startWinTop = rect.top;

        win.style.right = 'auto';
        win.style.bottom = 'auto';
        win.style.left = startWinLeft + 'px';
        win.style.top = startWinTop + 'px';

        document.body.style.userSelect = 'none';

        const onPointerMove = (ev) => {
          if (!isDragging) return;
          const dx = ev.clientX - startMouseX;
          const dy = ev.clientY - startMouseY;
          let newLeft = Math.max(0, Math.min(window.innerWidth - 80, startWinLeft + dx));
          let newTop = Math.max(46, Math.min(window.innerHeight - 40, startWinTop + dy));
          win.style.left = newLeft + 'px';
          win.style.top = newTop + 'px';
        };

        const onPointerUp = () => {
          if (isDragging) {
            isDragging = false;
            document.body.style.userSelect = '';
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
          }
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
      });
    }

    // 4. 고성능 3방향 리사이저 (우측변, 하단변, 대각 코너 그립)
    const setupResizeHandle = (el, resizeX, resizeY) => {
      if (!el) return;
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch(err) {}

        activeZIndex += 2;
        win.style.zIndex = activeZIndex;

        const rect = win.getBoundingClientRect();
        win.style.right = 'auto';
        win.style.bottom = 'auto';
        win.style.left = rect.left + 'px';
        win.style.top = rect.top + 'px';

        const startX = e.clientX;
        const startY = e.clientY;
        const startW = rect.width;
        const startH = rect.height;

        document.body.style.userSelect = 'none';

        const onMove = (ev) => {
          const dw = ev.clientX - startX;
          const dh = ev.clientY - startY;

          const minW = id === 'win-inspector' ? 300 : (id === 'win-assets' ? 360 : 260);
          const minH = id === 'win-inspector' ? 200 : (id === 'win-assets' ? 140 : 140);

          if (resizeX) {
            const newW = Math.max(minW, Math.min(window.innerWidth - 20, startW + dw));
            win.style.width = newW + 'px';
          }
          if (resizeY) {
            const newH = Math.max(minH, Math.min(window.innerHeight - 50, startH + dh));
            win.style.height = newH + 'px';
          }
        };

        const onUp = (ev) => {
          try { el.releasePointerCapture(ev.pointerId); } catch(err) {}
          document.body.style.userSelect = '';
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onUp);
          el.removeEventListener('pointercancel', onUp);
        };

        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onUp);
      });
    };

    setupResizeHandle(win.querySelector('.win-corner-grip'), true, true);
    setupResizeHandle(win.querySelector('.win-resize-r'), true, false);
    setupResizeHandle(win.querySelector('.win-resize-b'), false, true);
  });
}
`;

js = js.substring(0, floatStartIdx) + newFloatingWindowsManager + '\n' + js.substring(floatEndIdx);

fs.writeFileSync(path.join(basePath, 'editor_v2.js'), js, 'utf8');
console.log('Successfully updated editor_v2.js with all complete fixes!');
