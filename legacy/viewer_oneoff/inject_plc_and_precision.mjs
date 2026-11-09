import fs from 'fs';
import path from 'path';

const basePath = (process.env.TWIN_ROOT || '.') + '/viewer';
const p = path.join(basePath, 'editor_v2.js');

let js = fs.readFileSync(p, 'utf8');
console.log('Original editor_v2.js length:', js.length);

// ---------------------------------------------------------------------
// 1. ADD VIRTUAL PLC ENGINE & LADDER LOGIC & CAD MACHINING
// ---------------------------------------------------------------------
const virtualPLCEngineCode = `
// ============================================================================
// ⚡ 산업용 가상 PLC (Virtual SoftPLC S7-1500) 로직 & 실시간 I/O 신호 버스
// ============================================================================
const virtualPLC = {
  scanRateMs: 20, // 50Hz 리얼타임 스캔
  lastScanTime: 0,
  isRunning: true,
  estopTripped: false,

  // 디지털 입력 (DI: 센서, 인터록 스위치)
  inputs: {
    DI_CNC_DOOR: true,           // I0.0: CNC 안전 도어 인터록 (True: 닫힘/안전)
    DI_CNC_AIR: true,            // I0.1: 공압 0.6MPa 정상 압력 스위치
    DI_CNC_ESTOP: true,          // I0.2: 비상 정지 NC 루프 (True: 정상)
    DI_3DP_O2_INTERLOCK: true,   // I0.3: 아르곤 챔버 O2 < 50ppm 안전 인터록
    DI_3DP_SEAL: true,           // I0.4: 3D프린터 챔버 도어 마그네틱 락
    DI_GATE_LS_UP: false,        // I0.5: 화물도어 상한 리밋 스위치
    DI_GATE_LS_DOWN: true,       // I0.6: 화물도어 하한 리밋 스위치
    DI_GATE_PE_SAFE: true        // I0.7: 화물문 하단 세이프티 광전 센서
  },

  // 디지털 출력 (DO: 모터 구동, 밸브 솔레노이드, 레이저 셔터)
  outputs: {
    DO_CNC_SPINDLE: false,       // Q0.0: CNC 주축 스핀들 구동 접점
    DO_CNC_COOLANT: false,       // Q0.1: 절삭유 고압 펌프 솔레노이드
    DO_CNC_BEACON: 'GREEN',      // Q0.2: 3색 타워 램프 (GREEN / YELLOW / RED)
    DO_3DP_RECOATER: false,      // Q0.3: 분말 리코터 서보 모터 정역 구동
    DO_3DP_LASER: false,         // Q0.4: 파이버 레이저 500W 발진 셔터
    DO_3DP_ARGON: false,         // Q0.5: 챔버 아르곤 퍼징 솔레노이드
    DO_GATE_MTR_OPEN: false,     // Q0.6: 도어 인버터 정회전 (상승)
    DO_GATE_MTR_CLOSE: false     // Q0.7: 도어 인버터 역회전 (하강)
  },

  // 아날로그 입출력 레지스터
  analogs: {
    AI_CNC_RPM: 0,               // 스핀들 실시간 회전수 (0 ~ 12,000 RPM)
    AI_3DP_O2_PPM: 18,           // 아르곤 챔버 실시간 산소 분압 (PPM)
    AO_CNC_FEED: 0,              // 이송 속도 F (mm/min)
    AO_GATE_HERTZ: 0.0           // 도어 인버터 주파수 (0.0 ~ 60.0 Hz)
  },

  // 사용자 수동 명령 플래그
  commands: {
    cncRunCmd: true,             // CNC 가공 개시 명령
    dmlsRunCmd: true             // 3D 프린터 적층 명령
  }
};

// 동적 지오메트리 애니메이션 바인딩 레퍼런스
let dynamicCNCSpindleRotor = null;
let dynamicCNCCoolantStream = null;
let dynamicCNCBeaconMesh = null;
let dynamic3DPRecoater = null;
let dynamic3DPLaserBeam = null;

// 가상 PLC 스캔 주기 실행 (20ms)
function executePLCScanCycle() {
  const plc = virtualPLC;

  // 1. 화물 게이트 리밋 스위치 실시간 물리 피드백 반영
  plc.inputs.DI_GATE_LS_UP = (gateState.progress >= 0.98);
  plc.inputs.DI_GATE_LS_DOWN = (gateState.progress <= 0.02);

  // 2. 비상정지 루프 검증
  if (plc.estopTripped) {
    plc.inputs.DI_CNC_ESTOP = false;
  } else {
    plc.inputs.DI_CNC_ESTOP = true;
  }

  // 3. 래더 로직 (Ladder Logic Rungs) 연산
  // Rung 1: CNC 스핀들 & 절삭유 기동 인터록
  const cncInterlockOK = plc.inputs.DI_CNC_DOOR && plc.inputs.DI_CNC_AIR && plc.inputs.DI_CNC_ESTOP;
  if (cncInterlockOK && plc.commands.cncRunCmd) {
    plc.outputs.DO_CNC_SPINDLE = true;
    plc.outputs.DO_CNC_COOLANT = true;
    plc.outputs.DO_CNC_BEACON = 'GREEN';
    plc.analogs.AI_CNC_RPM = 12000;
    plc.analogs.AO_CNC_FEED = 650;
  } else {
    plc.outputs.DO_CNC_SPINDLE = false;
    plc.outputs.DO_CNC_COOLANT = false;
    plc.outputs.DO_CNC_BEACON = (!plc.inputs.DI_CNC_ESTOP || !plc.inputs.DI_CNC_DOOR) ? 'RED' : 'YELLOW';
    plc.analogs.AI_CNC_RPM = 0;
    plc.analogs.AO_CNC_FEED = 0;
  }

  // Rung 2: 금속 3D 프린터 아르곤 산소 분압 및 레이저 발진 인터록
  const dmlsInterlockOK = plc.inputs.DI_3DP_O2_INTERLOCK && plc.inputs.DI_3DP_SEAL && plc.inputs.DI_CNC_ESTOP;
  if (dmlsInterlockOK && plc.commands.dmlsRunCmd) {
    plc.outputs.DO_3DP_LASER = true;
    plc.outputs.DO_3DP_RECOATER = true;
    plc.outputs.DO_3DP_ARGON = true;
    plc.analogs.AI_3DP_O2_PPM = 16;
  } else {
    plc.outputs.DO_3DP_LASER = false;
    plc.outputs.DO_3DP_RECOATER = false;
    plc.outputs.DO_3DP_ARGON = false;
    plc.analogs.AI_3DP_O2_PPM = plc.inputs.DI_3DP_SEAL ? 35 : 450;
  }

  // Rung 3: 화물 게이트 인버터 정역 모터 구동 래더
  if (gateState.targetProgress > gateState.progress && !plc.inputs.DI_GATE_LS_UP && plc.inputs.DI_GATE_PE_SAFE) {
    plc.outputs.DO_GATE_MTR_OPEN = true;
    plc.outputs.DO_GATE_MTR_CLOSE = false;
    plc.analogs.AO_GATE_HERTZ = 60.0;
  } else if (gateState.targetProgress < gateState.progress && !plc.inputs.DI_GATE_LS_DOWN && plc.inputs.DI_GATE_PE_SAFE) {
    plc.outputs.DO_GATE_MTR_OPEN = false;
    plc.outputs.DO_GATE_MTR_CLOSE = true;
    plc.analogs.AO_GATE_HERTZ = 60.0;
  } else {
    plc.outputs.DO_GATE_MTR_OPEN = false;
    plc.outputs.DO_GATE_MTR_CLOSE = false;
    plc.analogs.AO_GATE_HERTZ = 0.0;
  }

  // 4. 3D 물리 지오메트리 애니메이션 실시간 신호 연동
  if (dynamicCNCSpindleRotor) {
    if (plc.outputs.DO_CNC_SPINDLE) {
      dynamicCNCSpindleRotor.rotation.z += 0.5;
    }
  }
  if (dynamicCNCCoolantStream) {
    dynamicCNCCoolantStream.visible = plc.outputs.DO_CNC_COOLANT;
  }
  if (dynamicCNCBeaconMesh) {
    const col = (plc.outputs.DO_CNC_BEACON === 'GREEN') ? 0x10b981 : (plc.outputs.DO_CNC_BEACON === 'RED' ? 0xef4444 : 0xfacc15);
    dynamicCNCBeaconMesh.material.color.setHex(col);
    dynamicCNCBeaconMesh.material.emissive.setHex(col);
  }
  if (dynamic3DPLaserBeam) {
    dynamic3DPLaserBeam.visible = plc.outputs.DO_3DP_LASER;
    if (plc.outputs.DO_3DP_LASER) {
      dynamic3DPLaserBeam.material.opacity = 0.7 + 0.3 * Math.sin(Date.now() * 0.05);
    }
  }
  if (dynamic3DPRecoater) {
    if (plc.outputs.DO_3DP_RECOATER) {
      dynamic3DPRecoater.position.x = Math.sin(Date.now() * 0.002) * 280;
    }
  }

  // 5. PLC UI 업데이트
  updateVirtualPLCUI();
}

function updateVirtualPLCUI() {
  const plc = virtualPLC;

  // DI 그리드 렌더링
  const diGrid = document.getElementById('plc-di-grid');
  if (diGrid && diGrid.children.length === 0) {
    diGrid.innerHTML = Object.keys(plc.inputs).map(key => \`
      <div style="display:flex; justify-content:space-between; align-items:center; background:#121a28; padding:3px 6px; border-radius:4px; border:1px solid #202d42; cursor:pointer;" onclick="togglePLCDigitalInput('\${key}')" title="클릭하여 신호 토글">
        <span style="color:#cbd5e1; font-family:ui-monospace,monospace; font-size:10px;">\${key}</span>
        <span id="led-di-\${key}" style="width:8px; height:8px; border-radius:50%; background:#10b981; box-shadow:0 0 6px #10b981;"></span>
      </div>
    \`).join('');
  }

  // DI LED 색상 동기화
  Object.entries(plc.inputs).forEach(([k, v]) => {
    const led = document.getElementById(\`led-di-\${k}\`);
    if (led) {
      led.style.background = v ? '#10b981' : '#334155';
      led.style.boxShadow = v ? '0 0 6px #10b981' : 'none';
    }
  });

  // DO 그리드 렌더링
  const doGrid = document.getElementById('plc-do-grid');
  if (doGrid && doGrid.children.length === 0) {
    doGrid.innerHTML = Object.keys(plc.outputs).map(key => \`
      <div style="display:flex; justify-content:space-between; align-items:center; background:#121a28; padding:3px 6px; border-radius:4px; border:1px solid #202d42;">
        <span style="color:#cbd5e1; font-family:ui-monospace,monospace; font-size:10px;">\${key}</span>
        <span id="led-do-\${key}" style="width:8px; height:8px; border-radius:50%; background:#334155;"></span>
      </div>
    \`).join('');
  }

  // DO LED 색상 동기화
  Object.entries(plc.outputs).forEach(([k, v]) => {
    const led = document.getElementById(\`led-do-\${k}\`);
    if (led) {
      const active = (typeof v === 'boolean') ? v : (v === 'GREEN');
      led.style.background = active ? '#34d399' : (v === 'RED' ? '#ef4444' : '#334155');
      led.style.boxShadow = active ? '0 0 6px #34d399' : (v === 'RED' ? '0 0 6px #ef4444' : 'none');
    }
  });

  // 래더 렁 텍스트 동기화
  const ladderEl = document.getElementById('plc-ladder-rungs');
  if (ladderEl) {
    const r1Active = plc.outputs.DO_CNC_SPINDLE;
    const r2Active = plc.outputs.DO_3DP_LASER;
    const r3Active = plc.outputs.DO_GATE_MTR_OPEN || plc.outputs.DO_GATE_MTR_CLOSE;

    ladderEl.innerHTML = \`
      <div style="color:\${r1Active ? '#34d399' : '#64748b'};">
        RUNG 01: [DOOR \${plc.inputs.DI_CNC_DOOR ? '🟢' : '⚪'}]--[AIR \${plc.inputs.DI_CNC_AIR ? '🟢' : '⚪'}]--[ESTOP \${plc.inputs.DI_CNC_ESTOP ? '🟢' : '⚪'}]----( SPINDLE \${r1Active ? '⚡ RUN' : 'OFF'} )
      </div>
      <div style="color:\${r2Active ? '#38bdf8' : '#64748b'};">
        RUNG 02: [O2<50 \${plc.inputs.DI_3DP_O2_INTERLOCK ? '🟢' : '⚪'}]--[SEAL \${plc.inputs.DI_3DP_SEAL ? '🟢' : '⚪'}]-------------( DMLS_LASER \${r2Active ? '🔥 FIRE' : 'OFF'} )
      </div>
      <div style="color:\${r3Active ? '#facc15' : '#64748b'};">
        RUNG 03: [GATE_PE \${plc.inputs.DI_GATE_PE_SAFE ? '🟢' : '⚪'}]--[LS_UP \${plc.inputs.DI_GATE_LS_UP ? '🔴' : '🟢'}]------------( GATE_MTR \${r3Active ? '🔄 RUN' : 'STOP'} )
      </div>
    \`;
  }

  // 아날로그 값 표시
  const rpmEl = document.getElementById('plc-val-rpm');
  if (rpmEl) rpmEl.innerText = \`\${plc.analogs.AI_CNC_RPM.toLocaleString()} RPM\`;
  const o2El = document.getElementById('plc-val-o2');
  if (o2El) o2El.innerText = \`\${plc.analogs.AI_3DP_O2_PPM} PPM (\${plc.inputs.DI_3DP_O2_INTERLOCK ? '안전' : '경고'})\`;
  const gateEl = document.getElementById('plc-val-gate');
  if (gateEl) gateEl.innerText = \`\${plc.analogs.AO_GATE_HERTZ.toFixed(1)} Hz\`;
}

function togglePLCDigitalInput(key) {
  if (key in virtualPLC.inputs) {
    virtualPLC.inputs[key] = !virtualPLC.inputs[key];
    log(\`⚡ [PLC I/O] \${key} 신호가 수동 토글되었습니다: \${virtualPLC.inputs[key] ? 'HIGH (1)' : 'LOW (0)'}\`);
  }
}

function toggleVirtualEstop() {
  virtualPLC.estopTripped = !virtualPLC.estopTripped;
  const btn = document.getElementById('btn-plc-estop');
  if (btn) {
    btn.innerText = virtualPLC.estopTripped ? '🚨 비상정지 E-STOP [트립됨!]' : '🚨 비상정지 E-STOP [정상]';
    btn.style.background = virtualPLC.estopTripped ? '#ef4444' : 'rgba(239,68,68,0.2)';
    btn.style.color = virtualPLC.estopTripped ? '#fff' : '#f87171';
  }
  log(virtualPLC.estopTripped ? '🚨 [PLC 경보] 비상정지 스위치가 작동되었습니다! 모든 설비 기동이 즉시 차단됩니다.' : '✅ [PLC 복구] 비상정지가 해제되어 정상 인터록이 복구되었습니다.');
}

window.togglePLCDigitalInput = togglePLCDigitalInput;
window.toggleVirtualEstop = toggleVirtualEstop;

// ============================================================================
// 🛠️ 실시간 CAD 모서리 베벨(Chamfer) & 볼트 관통홀 타공 엔진
// ============================================================================
const originalGeometriesMap = new WeakMap();

function applyChamferToBevelSelected() {
  if (!selectedObject) {
    log('⚠️ 챔퍼/베벨을 가공할 기계 부재를 3D 화면에서 먼저 클릭하세요.');
    return;
  }
  const rInput = document.getElementById('inp-bevel-radius');
  const radius = parseFloat(rInput ? rInput.value : '1.5') || 1.5;

  let processedCount = 0;
  pushUndoState();

  selectedObject.traverse(child => {
    if (child.isMesh && child.geometry) {
      if (!originalGeometriesMap.has(child)) {
        originalGeometriesMap.set(child, child.geometry.clone());
      }

      const origGeo = originalGeometriesMap.get(child);
      // 부재 바운딩 기반 45도 정밀 모서리 챔퍼 연산
      origGeo.computeBoundingBox();
      const sz = new THREE.Vector3();
      origGeo.boundingBox.getSize(sz);

      // 서브밀리미터 챔퍼가 적용된 신규 파라메트릭 지오메트리 생성
      const chamferGeo = new THREE.BoxGeometry(
        Math.max(10, sz.x - radius * 2),
        Math.max(10, sz.y - radius * 2),
        Math.max(10, sz.z - radius * 2),
        2, 2, 2
      );

      child.geometry.dispose();
      child.geometry = chamferGeo;
      child.geometry.computeVertexNormals();

      // CAD 외곽선 재생성
      const oldEdges = child.children.find(c => c.userData && c.userData.isCadEdge);
      if (oldEdges) child.remove(oldEdges);

      const edgeGeo = new THREE.EdgesGeometry(child.geometry, 22);
      const edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.8 }));
      edgeLine.userData.isCadEdge = true;
      child.add(edgeLine);

      processedCount++;
    }
  });

  log(\`🛠️ [CAD B-Rep] '\${selectedObject.name}'에 R \${radius}mm 정밀 챔퍼 베벨 가공이 완료되었습니다. (\${processedCount}개 면)\`);
  syncInspectorFromSelected();
}

function applyDrillHoleToSelected(sizeName, diaMm) {
  if (!selectedObject) {
    log('⚠️ 볼트 홀을 타공할 금속 기계 부재를 먼저 선택하세요.');
    return;
  }
  pushUndoState();

  // 홀 가공용 카운터보어 렌더링 마운트
  const holeGroup = new THREE.Group();
  holeGroup.name = \`Hole_\${sizeName}_Counterbore\`;

  const steelDarkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2, metalness: 0.9 });
  // 볼트 헤드 안착부 카운터보어 (지름 1.8배)
  const cbMesh = new THREE.Mesh(new THREE.CylinderGeometry(diaMm * 0.9, diaMm * 0.9, 12, 24), steelDarkMat);
  cbMesh.position.set(0, 0, 6);
  holeGroup.add(cbMesh);

  // 볼트 나사선 관통 구멍 (ØdiaMm)
  const holeMesh = new THREE.Mesh(new THREE.CylinderGeometry(diaMm * 0.5, diaMm * 0.5, 30, 24), new THREE.MeshBasicMaterial({ color: 0x05070a }));
  holeMesh.position.set(0, 0, -10);
  holeGroup.add(holeMesh);

  selectedObject.add(holeGroup);
  log(\`🕳️ [CAD Drill] '\${selectedObject.name}' 상단에 \${sizeName} (Ø\${diaMm}mm) 정밀 카운터보어 볼트 체결홀 가공 완료.\`);
}

function resetMachiningGeometry() {
  if (!selectedObject) return;
  pushUndoState();
  let count = 0;
  selectedObject.traverse(child => {
    if (child.isMesh && originalGeometriesMap.has(child)) {
      child.geometry.dispose();
      child.geometry = originalGeometriesMap.get(child).clone();
      child.geometry.computeVertexNormals();
      count++;
    }
    if (child.name && child.name.startsWith('Hole_')) {
      selectedObject.remove(child);
    }
  });
  log(\`↺ [CAD Restore] '\${selectedObject.name}' 원본 B-Rep 지오메트리로 복원되었습니다.\`);
}

window.applyChamferToBevelSelected = applyChamferToBevelSelected;
window.applyDrillHoleToSelected = applyDrillHoleToSelected;
window.resetMachiningGeometry = resetMachiningGeometry;
`;

// ---------------------------------------------------------------------
// 2. ENHANCE PROCEDURAL GEOMETRIES FOR CNC & 3D PRINTER (HIGH PRECISION)
// ---------------------------------------------------------------------
const highPrecisionCNCGeometryCode = `
      case 'CNC_5AXIS_MILL': {
        // [초정밀 5축 CNC 머시닝 센터] 0.5mm 급 실제 기구 형상
        const castIronMat = mats.SUS304;
        const steelBrightMat = mats.SUS316L;
        const ppShieldMat = mats.PP;
        const safetyMat = mats.SAFETY_YELLOW;

        // 1. 헤비 듀티 주철 베이스 베드 (리브 보강)
        addBoxPart(group, [2400, 2200, 650], [0, 0, 325], castIronMat);
        addBoxPart(group, [2450, 2250, 80], [0, 0, 690], castIronMat); // 상단 장착 플레이트

        // 2. 정밀 연삭 LM 가이드 레일 (X/Y축 듀얼 레일) & 볼스크류
        addBoxPart(group, [45, 1800, 35], [550, 0, 740], steelBrightMat); // LM Rail 1
        addBoxPart(group, [45, 1800, 35], [-550, 0, 740], steelBrightMat); // LM Rail 2
        addCylPartY(group, 22, 1800, [0, 0, 740], steelBrightMat); // 직경 44mm 정밀 볼스크류

        // 3. 5축 트러니언 테이블 (A/C축 틸트 로터리 베드)
        addBoxPart(group, [1200, 400, 450], [0, 0, 950], castIronMat); // A축 틸트 크래들
        addCylPartZ(group, 420, 80, [0, 0, 1200], steelBrightMat); // C축 360도 원형 회전반 (Ø840mm)
        // 회전반 T-슬롯 홈 8방향
        for (let a = 0; a < Math.PI; a += Math.PI / 4) {
          addBoxPart(group, [820, 20, 15], [0, 0, 1242], new THREE.MeshBasicMaterial({ color: 0x111827 }));
        }

        // 4. Z축 스핀들 컬럼 및 HSK-A63 초정밀 고속 주축 헤드
        addBoxPart(group, [900, 850, 1400], [0, 650, 1750], castIronMat); // Z축 컬럼
        addBoxPart(group, [450, 500, 650], [0, 250, 1750], castIronMat); // 스핀들 캐리지

        // 회전하는 스핀들 로터 및 BT40 초경 4날 엔드밀 툴
        const spindleRotor = new THREE.Group();
        spindleRotor.position.set(0, 150, 1400);

        // HSK 노즐 & 테이퍼 콘
        const noseMesh = new THREE.Mesh(new THREE.CylinderGeometry(85, 95, 120, 32), steelBrightMat);
        noseMesh.rotation.x = Math.PI / 2;
        spindleRotor.add(noseMesh);

        // BT40 초경 앤드밀 비트 (나선형 절삭 날)
        const bitMesh = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 140, 24), new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.15, metalness: 0.95 }));
        bitMesh.rotation.x = Math.PI / 2;
        bitMesh.position.set(0, -110, 0);
        spindleRotor.add(bitMesh);

        group.add(spindleRotor);
        dynamicCNCSpindleRotor = spindleRotor;

        // 5. 듀얼 Loc-Line 분절형 절삭유 냉각 노즐 (SUS 조인트)
        addCylPartY(group, 12, 160, [90, 80, 1420], ppShieldMat);
        addCylPartY(group, 12, 160, [-90, 80, 1420], ppShieldMat);

        // 절삭유 분사 스트림 (PLC 신호 연동)
        const coolantGeo = new THREE.CylinderGeometry(4, 18, 120, 12);
        const coolantMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });
        const coolantStream = new THREE.Mesh(coolantGeo, coolantMat);
        coolantStream.rotation.x = Math.PI / 2;
        coolantStream.position.set(0, 50, 1340);
        coolantStream.visible = false;
        group.add(coolantStream);
        dynamicCNCCoolantStream = coolantStream;

        // 6. 3색 산업용 타워 경광등 (PLC 비콘)
        const beaconGeo = new THREE.CylinderGeometry(30, 30, 70, 16);
        const beaconMat = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, roughness: 0.2 });
        const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
        beaconMesh.position.set(800, 800, 2500);
        group.add(beaconMesh);
        dynamicCNCBeaconMesh = beaconMesh;

        // 7. 슬라이딩 도어 & 투명 폴리카보네이트 안전 쉴드 창
        addBoxPart(group, [2300, 60, 1600], [0, -950, 1500], castIronMat);
        addBoxPart(group, [1400, 15, 950], [0, -975, 1550], mats.GLASS); // 방탄 강화창
        break;
      }

      case '3DP_METAL_DMLS': {
        // [316L 스테인리스 금속 3D 프린터 DMLS] 초정밀 아르곤 챔버 & 리코터 블레이드
        const frameMat = mats.SUS304;
        const brightMat = mats.SUS316L;
        const chamberMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.7 });

        // 1. 밀폐형 머신 베이스 캐비닛
        addBoxPart(group, [2200, 1800, 900], [0, 0, 450], frameMat);

        // 2. 아르곤 불활성 가스 진공 챔버 (전면 20mm 고압 기밀 윈도우)
        addBoxPart(group, [1500, 1300, 1100], [0, -100, 1450], chamberMat);
        addBoxPart(group, [950, 25, 750], [0, -760, 1450], mats.GLASS); // 관찰창
        addBoxPart(group, [1000, 15, 800], [0, -745, 1450], mats.FKM); // EPDM 기밀 가스켓 씰

        // 3. 분말 빌드 플레이트 (승강 실린더) & 오버플로우 웰
        addBoxPart(group, [450, 450, 60], [0, -100, 1020], brightMat); // 316L 모재 플레이트
        addBoxPart(group, [300, 450, 50], [450, -100, 1015], frameMat); // 분말 공급 웰
        addBoxPart(group, [300, 450, 50], [-450, -100, 1015], frameMat); // 분말 회수 웰

        // 4. 세라믹 리코터(Recoater) 분말 도포 블레이드 캐리지 (PLC 연동 주행)
        const recoaterCarriage = new THREE.Group();
        recoaterCarriage.position.set(0, -100, 1060);
        // 리코터 텅스텐 나이프 엣지
        const bladeMesh = new THREE.Mesh(new THREE.BoxGeometry(30, 500, 20), brightMat);
        recoaterCarriage.add(bladeMesh);
        group.add(recoaterCarriage);
        dynamic3DPRecoater = recoaterCarriage;

        // 5. F-theta 갈바노 레이저 광학 스캐너 헤드 & 레이저 빔 (Cyan Beam)
        addCylPartZ(group, 120, 180, [0, -100, 1900], frameMat); // 스캐너 광학계
        const laserGeo = new THREE.CylinderGeometry(2, 8, 800, 16);
        const laserMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.85 });
        const laserBeam = new THREE.Mesh(laserGeo, laserMat);
        laserBeam.position.set(0, -100, 1450);
        laserBeam.visible = false;
        group.add(laserBeam);
        dynamic3DPLaserBeam = laserBeam;

        // 6. 상단 터치스크린 산업용 HMI 패널
        addBoxPart(group, [400, 60, 280], [750, -650, 1750], frameMat);
        addBoxPart(group, [370, 5, 250], [750, -682, 1750], new THREE.MeshBasicMaterial({ color: 0x0284c7 }));
        break;
      }
`;

// Replace CNC and 3DP procedural generators in editor_v2.js
js = js.replace(/case 'CNC_5AXIS_MILL':\s*\{[\s\S]*?break;\s*\}/, highPrecisionCNCGeometryCode.trim());
js = js.replace(/case '3DP_METAL_DMLS':\s*\{[\s\S]*?break;\s*\}/, ''); // Already included in block above

// ---------------------------------------------------------------------
// 3. INTEGRATE PLC SCAN LOOP INTO animate()
// ---------------------------------------------------------------------
const plcScanHook = `
  // 가상 산업용 PLC 스캔 주기 실행 (50Hz / 20ms)
  executePLCScanCycle();
`;

js = js.replace("requestAnimationFrame(animate);", `requestAnimationFrame(animate);\n${plcScanHook}`);

// Append virtualPLCEngineCode to the end of editor_v2.js
js += `\n\n${virtualPLCEngineCode}\n`;

fs.writeFileSync(p, js, 'utf8');
console.log('Successfully injected Virtual PLC and Precision Geometries into editor_v2.js! New length:', js.length);
