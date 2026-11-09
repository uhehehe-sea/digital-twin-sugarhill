import fs from 'fs';
import path from 'path';

const basePath = 'C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer';

// ---------------------------------------------------------------------
// 1. UPDATE index_v2.html: Add Resizers & Cargo Wall Presets UI
// ---------------------------------------------------------------------
let html = fs.readFileSync(path.join(basePath, 'index_v2.html'), 'utf8');

// Ensure CSS for 3-way resizers exists
if (!html.includes('.win-resize-r {')) {
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
      width: calc(100% - 24px);
      height: 8px;
      cursor: ns-resize;
      z-index: 160;
      transition: background 0.15s;
    }
    .win-resize-b:hover, .win-resize-b.active {
      background: rgba(56, 189, 248, 0.5);
    }
    .win-corner-grip {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 20px;
      height: 20px;
      cursor: nwse-resize;
      z-index: 170;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .win-corner-grip svg {
      width: 14px;
      height: 14px;
      opacity: 0.45;
      transition: opacity 0.2s, transform 0.2s;
    }
    .win-corner-grip:hover svg, .win-corner-grip.active svg {
      opacity: 1.0;
      transform: scale(1.15);
      stroke: #38bdf8;
    }
  `;
  html = html.replace('</style>', `${resizerCSS}\n  </style>`);
}

// Add padding to .panel-body so scrollbars don't cover the corner grip
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

// Cargo Door Wall Location Selector UI
if (!html.includes('id="label-gate-wall"')) {
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
}

fs.writeFileSync(path.join(basePath, 'index_v2.html'), html, 'utf8');
console.log('Successfully updated index_v2.html!');

// ---------------------------------------------------------------------
// 2. UPDATE editor_v2.js
// ---------------------------------------------------------------------
let js = fs.readFileSync(path.join(basePath, 'editor_v2.js'), 'utf8');

// 2-A: Inject Gate Interpolation in animate()
const oldAnimate = `function animate() {
  requestAnimationFrame(animate);

  // 가상 산업용 PLC 스캔 주기 실행 (50Hz / 20ms)
  executePLCScanCycle();

  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  updateWASDCameraMovement(dt);
  controls.update();`;

const newAnimate = `function animate() {
  requestAnimationFrame(animate);

  // 가상 산업용 PLC 스캔 주기 실행 (50Hz / 20ms)
  executePLCScanCycle();

  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  // 🚪 화물 적재 도어 실시간 물리 보간 루프
  if (gatePanelsGroup && Math.abs(gateState.progress - gateState.targetProgress) > 0.0001) {
    const dir = gateState.targetProgress > gateState.progress ? 1 : -1;
    gateState.progress += dir * gateState.speed * dt;
    if ((dir > 0 && gateState.progress > gateState.targetProgress) ||
        (dir < 0 && gateState.progress < gateState.targetProgress)) {
      gateState.progress = gateState.targetProgress;
      if (gateState.progress >= 0.99) {
        gateState.status = 'OPEN';
        if (typeof virtualPLC !== 'undefined') {
          virtualPLC.inputs.DI_GATE_LS_UP = true;
          virtualPLC.inputs.DI_GATE_LS_DOWN = false;
          virtualPLC.outputs.DO_GATE_MTR_OPEN = false;
          virtualPLC.analogs.AO_GATE_HERTZ = 0.0;
        }
      } else if (gateState.progress <= 0.01) {
        gateState.status = 'CLOSED';
        if (typeof virtualPLC !== 'undefined') {
          virtualPLC.inputs.DI_GATE_LS_DOWN = true;
          virtualPLC.inputs.DI_GATE_LS_UP = false;
          virtualPLC.outputs.DO_GATE_MTR_CLOSE = false;
          virtualPLC.analogs.AO_GATE_HERTZ = 0.0;
        }
      }
    }

    // 7개 패널 일괄 4.1m 수직 틸트 리프팅
    gatePanelsGroup.position.z = gateState.progress * 4100;

    // 상부 모터 토션 샤프트 회전
    if (gateShaftGroup) {
      gateShaftGroup.rotation.x = gateState.progress * Math.PI * 4;
    }

    // 상부 스트로보 경광등 점멸 (0.15초 주기)
    if (gateWarningLight) {
      const flash = Math.sin(now * 0.015) > 0;
      gateWarningLight.intensity = flash ? 3.0 : 0.2;
    }

    updateGateUI();
  } else if (gateWarningLight && (gateState.progress <= 0.01 || gateState.progress >= 0.99)) {
    gateWarningLight.intensity = 0.0;
  }

  updateWASDCameraMovement(dt);
  controls.update();`;

if (js.includes(oldAnimate)) {
  js = js.replace(oldAnimate, newAnimate);
  console.log('Successfully injected gate interpolation loop into animate()!');
} else {
  console.log('Notice: animate() already contains custom loop or differs.');
}

// 2-B: Overhaul Floating Window Manager with 3-Way Resizing & Pointer Capture
const oldFloatStart = js.indexOf('function initFloatingWindows() {');
const oldFloatEnd = js.indexOf('function resetFloatingWindows() {');
const floatClosingBrace = js.indexOf('}\n', oldFloatEnd);

if (oldFloatStart !== -1 && oldFloatEnd !== -1) {
  const floatReplacement = `function initFloatingWindows() {
  const winIds = ['win-inspector', 'win-assets', 'win-gate-anim', 'win-plc'];

  winIds.forEach(id => {
    const win = document.getElementById(id);
    if (!win) return;

    // 초기 렌더링 시점에 윈도우의 fixed 좌표를 left/top 픽셀 좌표로 앵커링 변환 (자유로운 크기 조절 보장)
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
        win.style.display = 'none';
      };
    }
    const collapseBtn = win.querySelector('.win-btn:not(.close)');
    if (collapseBtn) {
      collapseBtn.onclick = (e) => {
        e.stopPropagation();
        win.classList.toggle('collapsed');
      };
    }

    // 3. 타이틀바 드래그 이동 (전역 포인터 추적)
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

    // 4. 고성능 3방향 리사이저 (우측변, 하단변, 대각 코너 그립 - setPointerCapture 적용)
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

function toggleWinCollapse(winId) {
  const win = document.getElementById(winId);
  if (!win) return;
  win.classList.toggle('collapsed');
}

function toggleWinVisibility(winId) {
  const win = document.getElementById(winId);
  if (!win) return;
  const isHidden = win.style.display === 'none' || getComputedStyle(win).display === 'none';
  if (isHidden) {
    win.style.display = 'flex';
    activeZIndex += 2;
    win.style.zIndex = activeZIndex;
  } else {
    win.style.display = 'none';
  }
}

function resetWinPosition(winId) {
  const win = document.getElementById(winId);
  if (!win) return;
  win.classList.remove('collapsed');
  win.style.display = 'flex';
  
  if (winId === 'win-inspector') {
    win.style.left = (window.innerWidth - 460) + 'px';
    win.style.right = 'auto';
    win.style.top = '58px';
    win.style.bottom = 'auto';
    win.style.width = '440px';
    win.style.height = (window.innerHeight - 78) + 'px';
  } else if (winId === 'win-assets') {
    win.style.left = '18px';
    win.style.right = 'auto';
    win.style.top = (window.innerHeight - 350) + 'px';
    win.style.bottom = 'auto';
    win.style.width = '820px';
    win.style.height = '330px';
  } else if (winId === 'win-gate-anim') {
    win.style.left = '18px';
    win.style.right = 'auto';
    win.style.top = '58px';
    win.style.bottom = 'auto';
    win.style.width = '370px';
    win.style.height = '270px';
  } else if (winId === 'win-plc') {
    win.style.left = '420px';
    win.style.right = 'auto';
    win.style.top = '58px';
    win.style.bottom = 'auto';
    win.style.width = '480px';
    win.style.height = '370px';
  }
}

function resetFloatingWindows() {
  ['win-inspector', 'win-assets', 'win-gate-anim', 'win-plc'].forEach(resetWinPosition);
  log('🪟 모든 호버링 윈도우의 위치와 크기가 최적 기본값으로 초기화되었습니다.');
}`;

  js = js.substring(0, oldFloatStart) + floatReplacement + '\n' + js.substring(floatClosingBrace + 2);
  console.log('Successfully updated FloatingWindowManager in editor_v2.js!');
}

// 2-C: Add Cargo Gate Assembly and Relocation Functions
const cargoGateLogic = `
// ============================================================================
// 🚪 화물 적재 도어 마스터 어셈블리 및 4개 벽면 원클릭 재배치 시스템
// ============================================================================
let cargoGateMasterAssembly = null;
let currentGateWall = 'SOUTH'; // 기본: 남측 벽면 (반대편)

function setupCargoGateAssembly(parentObj) {
  cargoGateMasterAssembly = new THREE.Group();
  cargoGateMasterAssembly.name = 'CargoGate_Master_Assembly';
  cargoGateMasterAssembly.userData = {
    name: '화물 적재 게이트 마스터 어셈블리',
    isSelectable: true,
    isCargoGateMaster: true
  };

  gatePanelsGroup = new THREE.Group();
  gatePanelsGroup.name = 'Gate_Panels_Lifting_Group';

  gateShaftGroup = new THREE.Group();
  gateShaftGroup.name = 'Gate_Shaft_Torsion_Group';

  // 1. OBJ에서 화물문 부재들을 추출하여 마스터 어셈블리로 편입
  const doorMeshes = [];
  parentObj.traverse(child => {
    if (child.isMesh && child.name && child.name.includes('Door_Sectional_')) {
      doorMeshes.push(child);
    }
  });

  doorMeshes.forEach(mesh => {
    const n = mesh.name;
    if (n.includes('Track_') || n.includes('HoistMotor_')) {
      cargoGateMasterAssembly.add(mesh);
    } else if (n.includes('TorsionShaft')) {
      gateShaftGroup.add(mesh);
    } else {
      gatePanelsGroup.add(mesh);
    }
  });

  cargoGateMasterAssembly.add(gatePanelsGroup);
  cargoGateMasterAssembly.add(gateShaftGroup);

  // 2. 도크 범퍼 & 세이프티 해저드 라인 추가
  const bumperMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
  const bumperGeo = new THREE.BoxGeometry(220, 320, 600);
  const bumpL = new THREE.Mesh(bumperGeo, bumperMat);
  bumpL.position.set(12250, 15950, 300);
  const bumpR = new THREE.Mesh(bumperGeo, bumperMat);
  bumpR.position.set(16650, 15950, 300);
  cargoGateMasterAssembly.add(bumpL);
  cargoGateMasterAssembly.add(bumpR);

  // 3. 상부 스트로보 경광등 (호이스트 모터 상단)
  gateWarningLight = new THREE.PointLight(0xf59e0b, 0, 8000, 1.2);
  gateWarningLight.position.set(14500, 15850, 4800);
  cargoGateMasterAssembly.add(gateWarningLight);

  const strobeMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(80, 80, 140, 16),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.8 })
  );
  strobeMesh.position.set(14500, 15850, 4800);
  cargoGateMasterAssembly.add(strobeMesh);

  // 4. 벽면 3D 스위치 스테이션 (UP / STOP / DOWN)
  gateButtonStationMesh = new THREE.Group();
  gateButtonStationMesh.name = 'Gate_Button_Station';
  const boxMesh = new THREE.Mesh(
    new THREE.BoxGeometry(140, 70, 260),
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 })
  );
  boxMesh.position.set(16800, 15850, 1400);
  gateButtonStationMesh.add(boxMesh);

  const btnMatUp = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3 });
  const btnMatStop = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
  const btnMatDown = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.3 });
  const btnGeo = new THREE.CylinderGeometry(25, 25, 30, 16);
  btnGeo.rotateX(Math.PI / 2);

  const btnUp = new THREE.Mesh(btnGeo, btnMatUp);
  btnUp.position.set(16800, 15810, 1480);
  btnUp.userData = { isGateBtn: true, action: 'OPEN' };
  gateButtonStationMesh.add(btnUp);

  const btnStop = new THREE.Mesh(btnGeo, btnMatStop);
  btnStop.position.set(16800, 15810, 1400);
  btnStop.userData = { isGateBtn: true, action: 'STOP' };
  gateButtonStationMesh.add(btnStop);

  const btnDown = new THREE.Mesh(btnGeo, btnMatDown);
  btnDown.position.set(16800, 15810, 1320);
  btnDown.userData = { isGateBtn: true, action: 'CLOSE' };
  gateButtonStationMesh.add(btnDown);

  cargoGateMasterAssembly.add(gateButtonStationMesh);

  // 씬에 등록 및 컨트롤러 선택 가능 목록에 추가
  scene.add(cargoGateMasterAssembly);
  if (typeof baseControllableObjects !== 'undefined') {
    baseControllableObjects.push(cargoGateMasterAssembly);
  }

  // 사용자가 요청한 "반대편"(남측 벽면)으로 기본 재배치
  relocateCargoGate('SOUTH', false);
  console.log('CargoGateMasterAssembly successfully assembled and set to SOUTH wall.');
}

function relocateCargoGate(wall, showLog = true) {
  if (!cargoGateMasterAssembly) return;
  currentGateWall = wall;

  ['btn-wall-south', 'btn-wall-north', 'btn-wall-west', 'btn-wall-east'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.classList.remove('active-green');
  });

  const activeBtn = document.getElementById('btn-wall-' + wall.toLowerCase());
  if (activeBtn) activeBtn.classList.add('active-green');

  const label = document.getElementById('label-gate-wall');

  if (wall === 'SOUTH') {
    // 남측 벽면 (Y=0, 사용자가 요청한 반대편)
    cargoGateMasterAssembly.position.set(3500, -15800, 0);
    cargoGateMasterAssembly.rotation.z = Math.PI;
    if (label) label.innerText = '남측 벽면 [반대편]';
    if (showLog) log('🚪 [위치 변경] 화물 게이트를 [남측 벽면(반대편 - Y=0)]으로 재배치했습니다.');
  } else if (wall === 'NORTH') {
    // 북측 벽면 (Y=16m, 원본 좌표)
    cargoGateMasterAssembly.position.set(0, 0, 0);
    cargoGateMasterAssembly.rotation.z = 0;
    if (label) label.innerText = '북측 벽면 (Y=16m)';
    if (showLog) log('🚪 [위치 변경] 화물 게이트를 [북측 벽면(Y=16m)]으로 배치했습니다.');
  } else if (wall === 'WEST') {
    // 서측 벽면
    cargoGateMasterAssembly.position.set(-14500, -7900, 0);
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

  if (typeof syncInspectorFromSelected === 'function') syncInspectorFromSelected();
}
window.relocateCargoGate = relocateCargoGate;
`;

// Insert cargoGateLogic right before triggerGateAction
js = js.replace(
  'function triggerGateAction(action) {',
  `${cargoGateLogic}\nfunction triggerGateAction(action) {`
);

// Call setupCargoGateAssembly right after scene.add(obj) in OBJLoader
js = js.replace(
  'scene.add(obj);\n    const urlView = new URLSearchParams(window.location.search).get(\'view\');',
  'scene.add(obj);\n    setupCargoGateAssembly(obj);\n    const urlView = new URLSearchParams(window.location.search).get(\'view\');'
);

fs.writeFileSync(path.join(basePath, 'editor_v2.js'), js, 'utf8');
console.log('Successfully injected cargo gate assembly and relocation logic into editor_v2.js!');
