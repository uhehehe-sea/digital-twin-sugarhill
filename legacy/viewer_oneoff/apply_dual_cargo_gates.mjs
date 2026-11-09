import fs from 'fs';
import path from 'path';

const basePath = (process.env.TWIN_ROOT || '.') + '/viewer';

// -------------------------------------------------------------
// 1. UPDATE index_v2.html: Add Dual Gate Controls & Progress
// -------------------------------------------------------------
let html = fs.readFileSync(path.join(basePath, 'index_v2.html'), 'utf8');

// Replace the inside of #win-gate-anim with Dual Gate UI
const oldGateWinStart = '<div id="win-gate-anim" class="floating-win">';
const oldGateWinEnd = '<!-- 창 4: 산업용 가상 PLC';
const gateWinIdx = html.indexOf(oldGateWinStart);
const gateWinEndIdx = html.indexOf(oldGateWinEnd);

const dualGateWinHTML = `<div id="win-gate-anim" class="floating-win">
    <div class="win-titlebar" id="win-gate-anim-bar">
      <div class="win-title">
        <span>🚪 화물 적재 게이트 듀얼 시스템 (Sectional + Roll-Up Shutter)</span>
        <span class="win-badge-pill" id="gate-state-pill" style="color:#10b981; border-color:#10b981;">CLOSED</span>
      </div>
      <div class="win-controls">
        <button class="win-btn" onclick="toggleWinCollapse('win-gate-anim')" title="접기/펼치기">─</button>
        <button class="win-btn" onclick="resetWinPosition('win-gate-anim')" title="크기/위치 리셋">□</button>
        <button class="win-btn close" onclick="toggleWinVisibility('win-gate-anim')" title="닫기">✕</button>
      </div>
    </div>
    <div class="win-gate-body">
      
      <!-- 1. 제어 대상 게이트 선택 탭 (동시 제어 vs 개별 제어) -->
      <div style="background:#0c121d; border:1px solid #202d42; border-radius:6px; padding:6px 8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
          <b style="color:#38bdf8; font-size:11px;">🎮 제어 대상 선택 (Target Gate)</b>
          <span id="label-active-gate" style="font-size:10px; color:#facc15; font-weight:700;">듀얼 동시 가동 (Gate 1 + 2)</span>
        </div>
        <div style="display:grid; grid-template-columns:1.2fr 1fr 1fr; gap:4px;">
          <button class="btn-tb active-green" id="btn-gate-target-both" onclick="setActiveGateTarget('BOTH')" title="게이트 1과 2를 동시에 개폐 (단축키: Space)">
            ⚡ 듀얼 동시 가동
          </button>
          <button class="btn-tb" id="btn-gate-target-g1" onclick="setActiveGateTarget('GATE1')" title="게이트 1 (오버헤드 섹셔널 도어) 단독 제어">
            1️⃣ 게이트 1 (섹셔널)
          </button>
          <button class="btn-tb" id="btn-gate-target-g2" onclick="setActiveGateTarget('GATE2')" title="게이트 2 (고속 롤업 셔터 도어) 단독 제어">
            2️⃣ 게이트 2 (롤업)
          </button>
        </div>
      </div>

      <!-- 2. 게이트 1 (섹셔널 도어 X:12.6m~16.4m) 상태 & 프로그레스 -->
      <div class="gate-status-row" style="padding:6px 10px;">
        <div>
          <div style="font-weight:700; color:#f1f5f9; font-size:11px;">1️⃣ 게이트 1 (오버헤드 섹셔널 도어)</div>
          <div style="font-size:10px; color:#94a3b8;" id="gate1-detail-text">닫힘 상태 (높이: 0.0m / 4.1m)</div>
        </div>
        <span id="gate1-percent-text" style="font-weight:800; font-family:ui-monospace,monospace; color:#38bdf8;">0%</span>
      </div>
      <div class="gate-progress-track" style="height:8px;">
        <div class="gate-progress-bar" id="gate1-progress-bar" style="width:0%;"></div>
      </div>

      <!-- 3. 게이트 2 (고속 롤업 도어 X:18.4m~22.4m) 상태 & 프로그레스 -->
      <div class="gate-status-row" style="padding:6px 10px;">
        <div>
          <div style="font-weight:700; color:#f1f5f9; font-size:11px;">2️⃣ 게이트 2 (고속 롤업 셔터 도어)</div>
          <div style="font-size:10px; color:#94a3b8;" id="gate2-detail-text">닫힘 상태 (높이: 0.0m / 4.1m)</div>
        </div>
        <span id="gate2-percent-text" style="font-weight:800; font-family:ui-monospace,monospace; color:#a78bfa;">0%</span>
      </div>
      <div class="gate-progress-track" style="height:8px;">
        <div class="gate-progress-bar" id="gate2-progress-bar" style="width:0%; background:linear-gradient(90deg, #8b5cf6, #ec4899);"></div>
      </div>

      <!-- 4. 작동 제어 버튼군 (Space 키 및 3D 스위치 박스와 연동) -->
      <div class="gate-btn-group" style="margin-top:2px;">
        <button class="btn-gate open" onclick="triggerGateAction('OPEN')">
          <span>🟢 열기 (OPEN)</span>
        </button>
        <button class="btn-gate stop" onclick="triggerGateAction('STOP')">
          <span>🔴 정지 (STOP)</span>
        </button>
        <button class="btn-gate close-act" onclick="triggerGateAction('CLOSE')">
          <span>🟡 닫기 (CLOSE)</span>
        </button>
      </div>

      <!-- 5. 화물문 설치 벽면 선택기 (남측/북측/서측/동측 원클릭 이동) -->
      <div style="background:#0c121d; border:1px solid #202d42; border-radius:6px; padding:6px 8px; margin-top:2px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
          <b style="color:#38bdf8; font-size:11px;">📍 듀얼 게이트 설치 벽면 (Wall Position)</b>
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
      </div>

    </div>
    <div class="win-resize-r" title="가로 크기 조절 (드래그)"></div>
    <div class="win-resize-b" title="세로 크기 조절 (드래그)"></div>
    <div class="win-corner-grip" title="가로/세로 동시 조절 (드래그)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15L15 21M21 9L9 21M21 3L3 21"/></svg>
    </div>
  </div>\n\n  `;

if (gateWinIdx !== -1 && gateWinEndIdx !== -1) {
  html = html.substring(0, gateWinIdx) + dualGateWinHTML + html.substring(gateWinEndIdx);
  fs.writeFileSync(path.join(basePath, 'index_v2.html'), html, 'utf8');
  console.log('Successfully updated index_v2.html with Dual Gate UI!');
} else {
  console.error('Could not find #win-gate-anim in index_v2.html');
}

// -------------------------------------------------------------
// 2. UPDATE editor_v2.js: Dual Gate Assembly & Animation
// -------------------------------------------------------------
let js = fs.readFileSync(path.join(basePath, 'editor_v2.js'), 'utf8');

const dualGateLogic = `
// ============================================================================
// 🚪 듀얼 화물 게이트 (Gate 1 섹셔널 + Gate 2 고속 롤업) 상태 & 마스터 어셈블리
// ============================================================================
let cargoGateMasterAssembly = null;

// Gate 1: 오버헤드 섹셔널 도어 (X: 12.6m ~ 16.4m)
let gatePanelsGroup = null;          // 섹셔널 패널 7개 그룹
let gateShaftGroup = null;           // 상부 토션 샤프트
let gateWarningLight = null;         // 게이트 1 스트로보 경광등
let gateButtonStationMesh = null;    // 게이트 1 3D 스위치 스테이션

let gate1State = {
  status: 'CLOSED', // 'CLOSED', 'OPENING', 'OPEN', 'CLOSING', 'STOPPED'
  progress: 0.0,
  targetProgress: 0.0,
  speed: 0.35
};

// Gate 2: 고속 롤업 셔터 도어 (X: 18.4m ~ 22.4m)
let gate2PanelsGroup = null;         // 롤업 셔터 커튼 메쉬 그룹
let gate2DrumGroup = null;           // 상부 롤업 권취 드럼 후드 실린더
let gateWarningLight2 = null;        // 게이트 2 스트로보 경광등
let gate2ButtonStationMesh = null;   // 게이트 2 3D 스위치 스테이션

let gate2State = {
  status: 'CLOSED',
  progress: 0.0,
  targetProgress: 0.0,
  speed: 0.45 // 롤업 셔터는 고속 구동
};

// 하위 호환용 gateState 프록시
let gateState = gate1State;
let activeGateTarget = 'BOTH'; // 'BOTH', 'GATE1', 'GATE2'
let currentGateWall = 'SOUTH'; // 기본: 남측 벽면 (반대편)

function setActiveGateTarget(target) {
  activeGateTarget = target;
  ['btn-gate-target-both', 'btn-gate-target-g1', 'btn-gate-target-g2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active-green');
  });

  const activeBtnId = target === 'BOTH' ? 'btn-gate-target-both' : (target === 'GATE1' ? 'btn-gate-target-g1' : 'btn-gate-target-g2');
  const btn = document.getElementById(activeBtnId);
  if (btn) btn.classList.add('active-green');

  const lbl = document.getElementById('label-active-gate');
  if (lbl) {
    lbl.innerText = target === 'BOTH' ? '듀얼 동시 가동 (Gate 1 + 2)' : (target === 'GATE1' ? '게이트 1 (섹셔널) 단독' : '게이트 2 (고속 롤업) 단독');
    lbl.style.color = target === 'BOTH' ? '#facc15' : (target === 'GATE1' ? '#38bdf8' : '#a78bfa');
  }

  log(\`🎮 [게이트 선택] 제어 대상이 [\${lbl ? lbl.innerText : target}]으로 변경되었습니다.\`);
}
window.setActiveGateTarget = setActiveGateTarget;

function setupCargoGateAssembly(parentObj) {
  cargoGateMasterAssembly = new THREE.Group();
  cargoGateMasterAssembly.name = 'CargoGate_Master_Assembly';
  cargoGateMasterAssembly.userData = {
    name: '화물 적재 듀얼 게이트 마스터 어셈블리',
    isSelectable: true,
    isCargoGateMaster: true
  };

  // Gate 1 그룹들
  gatePanelsGroup = new THREE.Group();
  gatePanelsGroup.name = 'Gate1_Panels_Group';
  gateShaftGroup = new THREE.Group();
  gateShaftGroup.name = 'Gate1_Shaft_Group';

  // Gate 2 그룹들
  gate2PanelsGroup = new THREE.Group();
  gate2PanelsGroup.name = 'Gate2_Rollup_Panels_Group';
  gate2DrumGroup = new THREE.Group();
  gate2DrumGroup.name = 'Gate2_Drum_Group';

  // 1. OBJ에서 두 화물문(Gate 1 & Gate 2)의 모든 부재 추출
  const gate1Meshes = [];
  const gate2Meshes = [];

  parentObj.traverse(child => {
    if (child.isMesh && child.name) {
      if (child.name.includes('Door_Sectional_')) {
        gate1Meshes.push(child);
      } else if (child.name.includes('Door_Rollup_')) {
        gate2Meshes.push(child);
      }
    }
  });

  // Gate 1 (섹셔널 도어) 메쉬 편성
  gate1Meshes.forEach(mesh => {
    const n = mesh.name;
    if (n.includes('Track_') || n.includes('HoistMotor_')) {
      cargoGateMasterAssembly.add(mesh);
    } else if (n.includes('TorsionShaft')) {
      gateShaftGroup.add(mesh);
    } else {
      gatePanelsGroup.add(mesh);
    }
  });

  // Gate 2 (롤업 도어) 메쉬 편성
  gate2Meshes.forEach(mesh => {
    const n = mesh.name;
    if (n.includes('DrumHood_Cylinder')) {
      gate2DrumGroup.add(mesh);
    } else {
      gate2PanelsGroup.add(mesh);
    }
  });

  cargoGateMasterAssembly.add(gatePanelsGroup);
  cargoGateMasterAssembly.add(gateShaftGroup);
  cargoGateMasterAssembly.add(gate2PanelsGroup);
  cargoGateMasterAssembly.add(gate2DrumGroup);

  // 2. 도크 범퍼 & 세이프티 해저드 라인
  const bumperMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
  const bumperGeo = new THREE.BoxGeometry(220, 320, 600);
  
  // Gate 1 범퍼
  const bump1L = new THREE.Mesh(bumperGeo, bumperMat); bump1L.position.set(12250, 15950, 300);
  const bump1R = new THREE.Mesh(bumperGeo, bumperMat); bump1R.position.set(16650, 15950, 300);
  cargoGateMasterAssembly.add(bump1L); cargoGateMasterAssembly.add(bump1R);

  // Gate 2 범퍼
  const bump2L = new THREE.Mesh(bumperGeo, bumperMat); bump2L.position.set(18150, 15950, 300);
  const bump2R = new THREE.Mesh(bumperGeo, bumperMat); bump2R.position.set(22650, 15950, 300);
  cargoGateMasterAssembly.add(bump2L); cargoGateMasterAssembly.add(bump2R);

  // 3. 상부 스트로보 경광등 (Gate 1 & Gate 2 각각 장착)
  gateWarningLight = new THREE.PointLight(0xf59e0b, 0, 8000, 1.2);
  gateWarningLight.position.set(14500, 15850, 4800);
  cargoGateMasterAssembly.add(gateWarningLight);

  const strobe1Mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(80, 80, 140, 16),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.8 })
  );
  strobe1Mesh.position.set(14500, 15850, 4800);
  cargoGateMasterAssembly.add(strobe1Mesh);

  gateWarningLight2 = new THREE.PointLight(0xa855f7, 0, 8000, 1.2);
  gateWarningLight2.position.set(20400, 15850, 4800);
  cargoGateMasterAssembly.add(gateWarningLight2);

  const strobe2Mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(80, 80, 140, 16),
    new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0xa855f7, emissiveIntensity: 0.8 })
  );
  strobe2Mesh.position.set(20400, 15850, 4800);
  cargoGateMasterAssembly.add(strobe2Mesh);

  // 4. 벽면 3D 스위치 스테이션 (Gate 1 & Gate 2 각각 설치)
  const createSwitchBox = (posX, posY, posZ, gateTarget) => {
    const stGroup = new THREE.Group();
    stGroup.name = 'Gate_Button_Station_' + gateTarget;
    const boxMesh = new THREE.Mesh(
      new THREE.BoxGeometry(140, 70, 260),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4 })
    );
    boxMesh.position.set(posX, posY, posZ);
    stGroup.add(boxMesh);

    const btnMatUp = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3 });
    const btnMatStop = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
    const btnMatDown = new THREE.MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.3 });
    const btnGeo = new THREE.CylinderGeometry(25, 25, 30, 16);
    btnGeo.rotateX(Math.PI / 2);

    const btnUp = new THREE.Mesh(btnGeo, btnMatUp);
    btnUp.position.set(posX, posY - 40, posZ + 80);
    btnUp.userData = { isGateBtn: true, action: 'OPEN', targetGate: gateTarget };
    stGroup.add(btnUp);

    const btnStop = new THREE.Mesh(btnGeo, btnMatStop);
    btnStop.position.set(posX, posY - 40, posZ);
    btnStop.userData = { isGateBtn: true, action: 'STOP', targetGate: gateTarget };
    stGroup.add(btnStop);

    const btnDown = new THREE.Mesh(btnGeo, btnMatDown);
    btnDown.position.set(posX, posY - 40, posZ - 80);
    btnDown.userData = { isGateBtn: true, action: 'CLOSE', targetGate: gateTarget };
    stGroup.add(btnDown);

    return stGroup;
  };

  gateButtonStationMesh = createSwitchBox(16800, 15850, 1400, 'GATE1');
  cargoGateMasterAssembly.add(gateButtonStationMesh);

  gate2ButtonStationMesh = createSwitchBox(22700, 15850, 1400, 'GATE2');
  cargoGateMasterAssembly.add(gate2ButtonStationMesh);

  scene.add(cargoGateMasterAssembly);

  // 기본 남측 벽면(반대편 Y=0)으로 두 게이트 일체 정합 이동
  relocateCargoGate('SOUTH', false);
  console.log('Dual Cargo Gates successfully assembled and set to SOUTH wall.');
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
    // 남측 벽면 (Y=0, 사용자가 요청한 반대편 정합)
    cargoGateMasterAssembly.position.set(0, -15900, 0);
    cargoGateMasterAssembly.rotation.z = 0;
    if (label) label.innerText = '남측 벽면 [반대편]';
    if (showLog) log('🚪 [위치 변경] 화물 게이트 2종(섹셔널+롤업)을 [남측 벽면(반대편 - Y=0)]으로 나란히 정합 배치했습니다.');
  } else if (wall === 'NORTH') {
    // 북측 벽면 (Y=16m, 원본 좌표)
    cargoGateMasterAssembly.position.set(0, 0, 0);
    cargoGateMasterAssembly.rotation.z = 0;
    if (label) label.innerText = '북측 벽면 (Y=16m)';
    if (showLog) log('🚪 [위치 변경] 화물 게이트 2종을 [북측 벽면(Y=16m)]으로 배치했습니다.');
  } else if (wall === 'WEST') {
    cargoGateMasterAssembly.position.set(-14500, -7900, 0);
    cargoGateMasterAssembly.rotation.z = -Math.PI / 2;
    if (label) label.innerText = '서측 벽면 (X=0)';
    if (showLog) log('🚪 [위치 변경] 화물 게이트 2종을 [서측 벽면(X=0)]으로 배치했습니다.');
  } else if (wall === 'EAST') {
    cargoGateMasterAssembly.position.set(9400, -7900, 0);
    cargoGateMasterAssembly.rotation.z = Math.PI / 2;
    if (label) label.innerText = '동측 벽면 (X=24m)';
    if (showLog) log('🚪 [위치 변경] 화물 게이트 2종을 [동측 벽면(X=24m)]으로 배치했습니다.');
  }

  if (typeof syncInspectorFromSelected === 'function') syncInspectorFromSelected();
}
window.relocateCargoGate = relocateCargoGate;

function triggerGateAction(action, forceTarget = null) {
  const target = forceTarget || activeGateTarget;

  const applyActionToGate = (gState, gName) => {
    if (action === 'OPEN') {
      gState.targetProgress = 1.0;
      gState.status = 'OPENING';
      log(\`🚪 [\${gName}] [열기] 시퀀스가 시작되었습니다. (천장 4.1m 틸트/롤업 상승)\`);
    } else if (action === 'CLOSE') {
      gState.targetProgress = 0.0;
      gState.status = 'CLOSING';
      log(\`🚪 [\${gName}] [닫기] 시퀀스가 시작되었습니다.\`);
    } else if (action === 'STOP') {
      gState.targetProgress = gState.progress;
      gState.status = 'STOPPED';
      log(\`🛑 [\${gName}] 작동이 정지되었습니다.\`);
    } else if (action === 'TOGGLE') {
      if (gState.targetProgress > 0.5) {
        applyActionToGate(gState, gName, 'CLOSE');
      } else {
        applyActionToGate(gState, gName, 'OPEN');
      }
    }
  };

  if (target === 'BOTH') {
    if (action === 'TOGGLE') {
      const anyOpen = (gate1State.targetProgress > 0.5 || gate2State.targetProgress > 0.5);
      triggerGateAction(anyOpen ? 'CLOSE' : 'OPEN', 'BOTH');
      return;
    }
    applyActionToGate(gate1State, '게이트 1(섹셔널)');
    applyActionToGate(gate2State, '게이트 2(고속 롤업)');
  } else if (target === 'GATE1') {
    applyActionToGate(gate1State, '게이트 1(섹셔널)');
  } else if (target === 'GATE2') {
    applyActionToGate(gate2State, '게이트 2(고속 롤업)');
  }

  updateGateUI();
}
window.triggerGateAction = triggerGateAction;

function updateGateUI() {
  // Gate 1 동기화
  const p1 = Math.round(gate1State.progress * 100);
  const bar1 = document.getElementById('gate1-progress-bar') || document.getElementById('gate-progress-bar');
  const percentText1 = document.getElementById('gate1-percent-text') || document.getElementById('gate-percent-text');
  const detailText1 = document.getElementById('gate1-detail-text') || document.getElementById('gate-detail-text');
  if (percentText1) percentText1.textContent = p1 + '%';
  if (bar1) bar1.style.width = p1 + '%';
  const curH1 = (gate1State.progress * 4.1).toFixed(2);
  if (detailText1) {
    if (gate1State.status === 'OPENING') detailText1.textContent = \`상승 중... (높이: \${curH1}m / 4.1m)\`;
    else if (gate1State.status === 'CLOSING') detailText1.textContent = \`하강 중... (높이: \${curH1}m / 4.1m)\`;
    else if (gate1State.progress >= 0.99) detailText1.textContent = '완전 개방 (4.1m 적재 가능)';
    else if (gate1State.progress <= 0.01) detailText1.textContent = '닫힘 상태 (높이: 0.0m)';
    else detailText1.textContent = \`정지됨 (높이: \${curH1}m)\`;
  }

  // Gate 2 동기화
  const p2 = Math.round(gate2State.progress * 100);
  const bar2 = document.getElementById('gate2-progress-bar');
  const percentText2 = document.getElementById('gate2-percent-text');
  const detailText2 = document.getElementById('gate2-detail-text');
  if (percentText2) percentText2.textContent = p2 + '%';
  if (bar2) bar2.style.width = p2 + '%';
  const curH2 = (gate2State.progress * 4.1).toFixed(2);
  if (detailText2) {
    if (gate2State.status === 'OPENING') detailText2.textContent = \`고속 권취 상승 중... (\${curH2}m / 4.1m)\`;
    else if (gate2State.status === 'CLOSING') detailText2.textContent = \`하강 중... (\${curH2}m / 4.1m)\`;
    else if (gate2State.progress >= 0.99) detailText2.textContent = '완전 개방 (4.1m 롤업 완료)';
    else if (gate2State.progress <= 0.01) detailText2.textContent = '닫힘 상태 (높이: 0.0m)';
    else detailText2.textContent = \`정지됨 (\${curH2}m)\`;
  }

  // 상단 뱃지 동기화
  const pill = document.getElementById('gate-state-pill');
  if (pill) {
    if (gate1State.status === 'OPENING' || gate2State.status === 'OPENING') {
      pill.textContent = 'OPENING...'; pill.style.color = '#38bdf8'; pill.style.borderColor = '#38bdf8';
    } else if (gate1State.status === 'CLOSING' || gate2State.status === 'CLOSING') {
      pill.textContent = 'CLOSING...'; pill.style.color = '#f59e0b'; pill.style.borderColor = '#f59e0b';
    } else if (gate1State.progress >= 0.99 && gate2State.progress >= 0.99) {
      pill.textContent = 'ALL OPEN'; pill.style.color = '#34d399'; pill.style.borderColor = '#34d399';
    } else if (gate1State.progress <= 0.01 && gate2State.progress <= 0.01) {
      pill.textContent = 'CLOSED'; pill.style.color = '#10b981'; pill.style.borderColor = '#10b981';
    } else {
      pill.textContent = 'ACTIVE'; pill.style.color = '#a78bfa'; pill.style.borderColor = '#a78bfa';
    }
  }

  const tbBtn = document.getElementById('btn-tb-gate-toggle');
  if (tbBtn) {
    const isAnyOpen = (gate1State.progress > 0.5 || gate2State.progress > 0.5);
    tbBtn.textContent = isAnyOpen ? '🚪 게이트 닫기 (Space)' : '🚪 게이트 열기 (Space)';
  }
}
window.updateGateUI = updateGateUI;
`;

// Replace old cargoGateLogic in editor_v2.js
const oldGateLogicStart = '// ============================================================================ \n// 🚪 화물 적재 도어 마스터 어셈블리';
const startIdx = js.indexOf('// 🚪 화물 적재 도어 마스터 어셈블리');
const endIdx = js.indexOf('// 3D 뷰포트 내 화물 게이트 푸시버튼 클릭 감지');

if (startIdx !== -1 && endIdx !== -1) {
  js = js.substring(0, startIdx) + dualGateLogic + '\n\n  ' + js.substring(endIdx);
  console.log('Successfully replaced gate logic with Dual Gate System in editor_v2.js!');
} else {
  console.error('Could not find gate logic boundary in editor_v2.js');
}

// Update the 3D click raycaster to support both Gate 1 and Gate 2 switch boxes
const oldPointerRaycast = `    if (gateButtonStationMesh) {
      const hits = raycaster.intersectObjects(gateButtonStationMesh.children, true);
      if (hits.length > 0 && hits[0].object.userData.isGateBtn) {
        const action = hits[0].object.userData.action;
        triggerGateAction(action);
        e.stopPropagation();
      }
    }`;

const newPointerRaycast = `    const checkStationClick = (stMesh) => {
      if (!stMesh) return false;
      const hits = raycaster.intersectObjects(stMesh.children, true);
      if (hits.length > 0 && hits[0].object.userData.isGateBtn) {
        const u = hits[0].object.userData;
        triggerGateAction(u.action, u.targetGate);
        return true;
      }
      return false;
    };
    if (checkStationClick(gateButtonStationMesh) || checkStationClick(gate2ButtonStationMesh)) {
      e.stopPropagation();
    }`;

js = js.replace(oldPointerRaycast, newPointerRaycast);

// Update animate() loop to interpolate BOTH Gate 1 and Gate 2
const oldGateAnimInLoop = `  // 🚪 화물 적재 도어 실시간 물리 보간 루프
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
  }`;

const newGateAnimInLoop = `  // 🚪 [Gate 1] 오버헤드 섹셔널 도어 물리 보간 루프
  if (gatePanelsGroup && Math.abs(gate1State.progress - gate1State.targetProgress) > 0.0001) {
    const dir = gate1State.targetProgress > gate1State.progress ? 1 : -1;
    gate1State.progress += dir * gate1State.speed * dt;
    if ((dir > 0 && gate1State.progress > gate1State.targetProgress) ||
        (dir < 0 && gate1State.progress < gate1State.targetProgress)) {
      gate1State.progress = gate1State.targetProgress;
      if (gate1State.progress >= 0.99) gate1State.status = 'OPEN';
      else if (gate1State.progress <= 0.01) gate1State.status = 'CLOSED';
    }
    gatePanelsGroup.position.z = gate1State.progress * 4100;
    if (gateShaftGroup) gateShaftGroup.rotation.x = gate1State.progress * Math.PI * 4;
    if (gateWarningLight) {
      const flash = Math.sin(now * 0.015) > 0;
      gateWarningLight.intensity = flash ? 3.0 : 0.2;
    }
    updateGateUI();
  } else if (gateWarningLight && (gate1State.progress <= 0.01 || gate1State.progress >= 0.99)) {
    gateWarningLight.intensity = 0.0;
  }

  // 🚪 [Gate 2] 고속 롤업 셔터 도어 물리 보간 루프
  if (gate2PanelsGroup && Math.abs(gate2State.progress - gate2State.targetProgress) > 0.0001) {
    const dir = gate2State.targetProgress > gate2State.progress ? 1 : -1;
    gate2State.progress += dir * gate2State.speed * dt;
    if ((dir > 0 && gate2State.progress > gate2State.targetProgress) ||
        (dir < 0 && gate2State.progress < gate2State.targetProgress)) {
      gate2State.progress = gate2State.targetProgress;
      if (gate2State.progress >= 0.99) gate2State.status = 'OPEN';
      else if (gate2State.progress <= 0.01) gate2State.status = 'CLOSED';
    }
    // 셔터 패널 4.1m 권취 상승
    gate2PanelsGroup.position.z = gate2State.progress * 4100;
    // 상부 드럼 회전
    if (gate2DrumGroup) gate2DrumGroup.rotation.x = gate2State.progress * Math.PI * 6;
    if (gateWarningLight2) {
      const flash = Math.sin(now * 0.015) > 0;
      gateWarningLight2.intensity = flash ? 3.0 : 0.2;
    }
    updateGateUI();
  } else if (gateWarningLight2 && (gate2State.progress <= 0.01 || gate2State.progress >= 0.99)) {
    gateWarningLight2.intensity = 0.0;
  }`;

js = js.replace(oldGateAnimInLoop, newGateAnimInLoop);

fs.writeFileSync(path.join(basePath, 'editor_v2.js'), js, 'utf8');
console.log('Successfully updated editor_v2.js with Dual Cargo Gate Animation!');
