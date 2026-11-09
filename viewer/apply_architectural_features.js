import fs from 'fs';
import path from 'path';

const basePath = 'C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer';
const editorPath = path.join(basePath, 'editor_v2.js');

let js = fs.readFileSync(editorPath, 'utf8');

const targetStr = "log(`[CAD+PBR] 226개 B-Rep 부재가 ${baseControllableObjects.length}개 컨트롤러블 오브제로 패키징 완료.`);";

const insertionCode = `
    // =========================================================================
    // 1. 사용자 피드백 반영: 현대식 듀얼 도어 화장실 포드 (남/여 2문 구조)
    // =========================================================================
    const rrPodGroup = new THREE.Group();
    rrPodGroup.name = '🚻 모듈형 듀얼도어 화장실 포드 (남/여 2문)';
    
    const rrWallMat = new THREE.MeshStandardMaterial({ color: 0x1e2736, roughness: 0.35, metalness: 0.15 });
    const rrDoorMatMen = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.3, metalness: 0.2 });
    const rrDoorMatWomen = new THREE.MeshStandardMaterial({ color: 0xbe185d, roughness: 0.3, metalness: 0.2 });
    const rrSteelMat = materials.STAINLESS_304;

    // 중앙 칸막이 및 전면 벽체 (X: 13500 ~ 15900, Y: 0 ~ 2640, Z: 0 ~ 3050)
    addBoxPart(rrPodGroup, [2400, 100, 3050], [14700, 2600, 1525], rrWallMat);
    addBoxPart(rrPodGroup, [100, 2600, 3050], [14700, 1300, 1525], rrWallMat); // 남/여 분리벽

    // 문 1: 남성용 도어 (Restroom_Door_01_Men)
    addBoxPart(rrPodGroup, [950, 60, 2150], [14100, 2620, 1075], rrDoorMatMen);
    addBoxPart(rrPodGroup, [30, 80, 280], [14500, 2660, 1050], rrSteelMat);
    addBoxPart(rrPodGroup, [120, 10, 120], [14100, 2660, 1600], new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));

    // 문 2: 여성용 도어 (Restroom_Door_02_Women)
    addBoxPart(rrPodGroup, [950, 60, 2150], [15300, 2620, 1075], rrDoorMatWomen);
    addBoxPart(rrPodGroup, [30, 80, 280], [14900, 2660, 1050], rrSteelMat);
    addBoxPart(rrPodGroup, [120, 10, 120], [15300, 2660, 1600], new THREE.MeshBasicMaterial({ color: 0xf472b6 }));

    rrPodGroup.userData = {
      isEditableAsset: true,
      isBaseObject: true,
      originalKey: 'Restroom_Dual_Pod_Unit',
      displayName: '🚻 모듈형 듀얼도어 화장실 포드 (남/여 2문)',
      category: 'STRUCTURE'
    };
    scene.add(rrPodGroup);
    baseControllableObjects.push(rrPodGroup);

    // =========================================================================
    // 2. 사용자 피드백 반영: 전면 입구측 추가 계단 (Staircase_Entrance_East_02)
    // =========================================================================
    const entranceStairGroup = new THREE.Group();
    entranceStairGroup.name = '🪜 전면 입구측 보조 계단 (OSHA 안전 옐로우)';

    const stSteelMat = materials.STAINLESS_304;
    const stTreadMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.65 });
    const stYellowMat = materials.SAFETY_YELLOW;

    // 동측 전면 입구 계단 (X: 22000, Y: 1800 ~ 4600, Z: 0 ~ 2800)
    const numSteps = 14;
    const stepRise = 200;
    const stepRun = 200;
    for (let i = 0; i < numSteps; i++) {
      const sy = 1800 + i * stepRun;
      const sz = (i + 1) * stepRise;
      addBoxPart(entranceStairGroup, [1100, stepRun + 20, 45], [22000, sy, sz], stTreadMat);
    }
    addBoxPart(entranceStairGroup, [60, 3100, 220], [22550, 3100, 1400], stSteelMat);
    addBoxPart(entranceStairGroup, [60, 3100, 220], [21450, 3100, 1400], stSteelMat);

    for (let i = 0; i < 4; i++) {
      const py = 1800 + i * 900;
      const pz = (i * 4.5) * stepRise + 450;
      addBoxPart(entranceStairGroup, [40, 40, 950], [22550, py, pz], stYellowMat);
      addBoxPart(entranceStairGroup, [40, 40, 950], [21450, py, pz], stYellowMat);
    }
    addBoxPart(entranceStairGroup, [40, 3200, 40], [22550, 3100, 2350], stYellowMat);
    addBoxPart(entranceStairGroup, [40, 3200, 40], [21450, 3100, 2350], stYellowMat);

    entranceStairGroup.userData = {
      isEditableAsset: true,
      isBaseObject: true,
      originalKey: 'Staircase_Entrance_East_02',
      displayName: '🪜 전면 입구측 보조 계단 (OSHA 안전 옐로우)',
      category: 'STRUCTURE'
    };
    scene.add(entranceStairGroup);
    baseControllableObjects.push(entranceStairGroup);

    // =========================================================================
    // 3. 사용자 피드백 반영: 화물칸 해저드 사선 마킹 & 고무 도크 범퍼
    // =========================================================================
    const dockBayGroup = new THREE.Group();
    dockBayGroup.name = '⚠️ 화물 하차 도크 해저드 마킹 & 도크 범퍼';

    const hazardTexCanvas = document.createElement('canvas');
    hazardTexCanvas.width = 512;
    hazardTexCanvas.height = 128;
    const hctx = hazardTexCanvas.getContext('2d');
    hctx.fillStyle = '#facc15';
    hctx.fillRect(0, 0, 512, 128);
    hctx.fillStyle = '#111827';
    for (let x = -128; x < 640; x += 64) {
      hctx.beginPath();
      hctx.moveTo(x, 0);
      hctx.lineTo(x + 48, 0);
      hctx.lineTo(x + 48 - 64, 128);
      hctx.lineTo(x - 64, 128);
      hctx.closePath();
      hctx.fill();
    }
    const hazardTex = new THREE.CanvasTexture(hazardTexCanvas);
    hazardTex.wrapS = THREE.RepeatWrapping;
    hazardTex.repeat.set(4, 1);
    const hazardMat = new THREE.MeshBasicMaterial({ map: hazardTex });

    const apronGeo = new THREE.PlaneGeometry(4400, 600);
    const apronMesh = new THREE.Mesh(apronGeo, hazardMat);
    apronMesh.position.set(14500, 15650, 6);
    dockBayGroup.add(apronMesh);

    const bumperRubberMat = materials.FKM_FLUOROELASTOMER;
    const bumperFaceMat = materials.STAINLESS_304;
    addBoxPart(dockBayGroup, [250, 350, 600], [12350, 16100, 350], bumperRubberMat);
    addBoxPart(dockBayGroup, [250, 20, 600], [12350, 15915, 350], bumperFaceMat);
    addBoxPart(dockBayGroup, [250, 350, 600], [16650, 16100, 350], bumperRubberMat);
    addBoxPart(dockBayGroup, [250, 20, 600], [16650, 15915, 350], bumperFaceMat);

    dockBayGroup.userData = {
      isEditableAsset: true,
      isBaseObject: true,
      originalKey: 'Dock_Bay_Safety_Structure',
      displayName: '⚠️ 화물 하차 도크 해저드 마킹 & 도크 범퍼',
      category: 'STRUCTURE'
    };
    scene.add(dockBayGroup);
    baseControllableObjects.push(dockBayGroup);

    // =========================================================================
    // 4. 화물문 우측 벽면 3D 인더스트리얼 푸시버튼 제어 스테이션
    // =========================================================================
    const buttonStationGroup = new THREE.Group();
    buttonStationGroup.name = '🎛️ 화물게이트 3D 푸시버튼 스위치 스테이션';
    buttonStationGroup.position.set(16900, 15850, 1400);

    const stationBoxMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.6 });
    addBoxPart(buttonStationGroup, [180, 90, 360], [0, 0, 0], stationBoxMat);
    addBoxPart(buttonStationGroup, [160, 10, 340], [0, -48, 0], materials.SAFETY_YELLOW);

    const btnOpenMesh = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 20, 24), new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.2, emissive: 0x059669 }));
    btnOpenMesh.rotation.x = Math.PI / 2;
    btnOpenMesh.position.set(0, -60, 90);
    btnOpenMesh.userData = { isGateBtn: true, action: 'OPEN' };
    buttonStationGroup.add(btnOpenMesh);

    const btnStopMesh = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 25, 24), new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.2, emissive: 0xb91c1c }));
    btnStopMesh.rotation.x = Math.PI / 2;
    btnStopMesh.position.set(0, -62, 0);
    btnStopMesh.userData = { isGateBtn: true, action: 'STOP' };
    buttonStationGroup.add(btnStopMesh);

    const btnCloseMesh = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 20, 24), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, emissive: 0xd97706 }));
    btnCloseMesh.rotation.x = Math.PI / 2;
    btnCloseMesh.position.set(0, -60, -90);
    btnCloseMesh.userData = { isGateBtn: true, action: 'CLOSE' };
    buttonStationGroup.add(btnCloseMesh);

    buttonStationGroup.userData = {
      isEditableAsset: true,
      isBaseObject: true,
      originalKey: 'Gate_Control_Station_3D',
      displayName: '🎛️ 화물게이트 3D 푸시버튼 스위치 스테이션',
      category: 'ELECTRICAL'
    };
    scene.add(buttonStationGroup);
    baseControllableObjects.push(buttonStationGroup);
    gateButtonStationMesh = buttonStationGroup;

    // =========================================================================
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
    gateWarningLight = strobeMesh;

    // =========================================================================
    // 6. 스크린샷의 떠있는 라운지 부스 바닥(Z=0) 완전 착지 보정
    // =========================================================================
    baseControllableObjects.forEach(obj => {
      if (obj.userData && obj.userData.originalKey && obj.userData.originalKey.startsWith('Lounge_Booth_')) {
        obj.position.z = 675; // Z=0 착지 (기존 150mm 공중 부양 높이 보정)
      }
    });
`;

if (js.includes(targetStr)) {
  js = js.replace(targetStr, `${insertionCode}\n    ${targetStr}`);
  fs.writeFileSync(editorPath, js, 'utf8');
  console.log('Successfully inserted architectural and gate features!');
} else {
  console.error('Target string not found!');
}
