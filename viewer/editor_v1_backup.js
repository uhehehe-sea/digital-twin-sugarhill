// ============================================================================
// SolidCraft Digital Twin Spatial Editor (v0.30.1 Rust CAD × Unreal/Blender UI)
// - UE5 / Omniverse RTX Grade PBR Pipeline (PMREM Studio IBL + Real SimReady ORM/Normal Maps)
// - Real-Time Planar Epoxy Floor Reflection (THREE.Reflector) + Contact AO Shadows
// - ACES Filmic Tone Mapping + UnrealBloom Post-Processing + Physical High-Bay LEDs
// - WASD + QE Camera Fly Navigation + Drag-and-Drop Asset Browser + Transform Gizmos
// ============================================================================

let scene, camera, renderer, controls, transformControl;
let composer, bloomPass, floorReflector, gridHelper;
let factoryMeshGroup, splatPointsGroup, placedAssetsGroup, floorHitPlane, highBayLightsGroup;

let isWireframe = false;
let isXRay = false; // 실내 뷰에서는 실제 벽체/라이너 패널 불투명 렌더링 기본값
let isSplatVisible = false;
let isPhotorealPBR = true;
let isFloorReflective = true;
let isCadEdgesVisible = false; // 스케치업 스타일 검은 외곽선 기본 OFF

let isGridSnap = true;
let gridSnapStep = 100; // mm
let rotSnapStepDeg = 15; // deg

let raycaster, mouse;
const meshesByName = {};
const placedObjects = [];
let selectedObject = null;
let selectBoxHelper = null;
let ghostPreviewGroup = null;
let draggingAssetDef = null;
const undoStack = [];
const pbrTextures = {};

// WASD Navigation State
const moveKeys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, KeyQ: false, KeyE: false, ShiftLeft: false, ShiftRight: false };
let lastFrameTime = performance.now();

// ============================================================================
// 1. 엔지니어링 메테리얼 데이터베이스 (PP, FKM/FPM, SUS 304/306/316L, SUS 314)
// ============================================================================
const INDUSTRIAL_MATERIALS = {
  PP_Natural_SealGrade: {
    id: 'PP_Natural_SealGrade',
    name: 'PP 내추럴 (씰 등급)',
    sub: 'Polypropylene · 0.905 g/cm³',
    colorHex: '#ecece6',
    roughness: 0.24,
    metalness: 0.0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.25,
    opacity: 0.96,
    texType: 'plastic',
    densityKgM3: 905,
    hardness: '72 Shore D (E=1.45 GPa)',
    tempRange: '-10 ~ +100°C (융점 165°C)',
    ior: '1.490 (반투명 유백색 SSS)',
    friction: 'μs=0.32 / μd=0.26'
  },
  PP_GF30_Structural_Grey: {
    id: 'PP_GF30_Structural_Grey',
    name: 'PP-GF30 (유리섬유 강화)',
    sub: 'PP + 30% GF · 1.14 g/cm³',
    colorHex: '#525860',
    roughness: 0.42,
    metalness: 0.05,
    clearcoat: 0.15,
    clearcoatRoughness: 0.4,
    opacity: 1.0,
    texType: 'plastic',
    densityKgM3: 1140,
    hardness: '78 Shore D (E=6.20 GPa)',
    tempRange: '-20 ~ +130°C',
    ior: '1.510',
    friction: 'μs=0.38 / μd=0.32'
  },
  FKM_FPM_Viton_Black_85A: {
    id: 'FKM_FPM_Viton_Black_85A',
    name: 'FKM/FPM 불소고무 (블랙)',
    sub: 'Viton 85A · 1.85 g/cm³',
    colorHex: '#181a1d',
    roughness: 0.68,
    metalness: 0.02,
    clearcoat: 0.18,
    clearcoatRoughness: 0.55,
    opacity: 1.0,
    texType: 'rubber',
    densityKgM3: 1850,
    hardness: '85 ± 5 Shore A',
    tempRange: '-25 ~ +210°C (단기 250°C)',
    ior: '1.512 (ASTM D1418 FKM)',
    friction: 'μs=0.82 / μd=0.76 (반발 0.65)'
  },
  FKM_FPM_Viton_Brown_80A: {
    id: 'FKM_FPM_Viton_Brown_80A',
    name: 'FKM/FPM 불소고무 (브라운)',
    sub: 'SKF Ecofkm 80A · 1.86 g/cm³',
    colorHex: '#5a2b15',
    roughness: 0.64,
    metalness: 0.02,
    clearcoat: 0.22,
    clearcoatRoughness: 0.50,
    opacity: 1.0,
    texType: 'rubber',
    densityKgM3: 1860,
    hardness: '80 ± 5 Shore A',
    tempRange: '-25 ~ +215°C',
    ior: '1.512 (ISO 1629 FPM)',
    friction: 'μs=0.85 / μd=0.78'
  },
  FKM_FPM_Viton_Green_75A: {
    id: 'FKM_FPM_Viton_Green_75A',
    name: 'FKM/FPM 불소고무 (그린)',
    sub: '내화학 O-링 75A · 1.84 g/cm³',
    colorHex: '#14532d',
    roughness: 0.66,
    metalness: 0.02,
    clearcoat: 0.20,
    clearcoatRoughness: 0.50,
    opacity: 1.0,
    texType: 'rubber',
    densityKgM3: 1840,
    hardness: '75 ± 5 Shore A',
    tempRange: '-25 ~ +205°C',
    ior: '1.510',
    friction: 'μs=0.85 / μd=0.80'
  },
  SUS_304_306_Brushed_2B: {
    id: 'SUS_304_306_Brushed_2B',
    name: 'SUS 304 / 306 (브러시드)',
    sub: '18Cr-8Ni / 306계열 · 7.93 g/cm³',
    colorHex: '#d4d8de',
    roughness: 0.24,
    metalness: 0.94,
    clearcoat: 0.25,
    clearcoatRoughness: 0.20,
    opacity: 1.0,
    texType: 'brushed_steel',
    densityKgM3: 7930,
    hardness: '88 HRB (E=193 GPa)',
    tempRange: '-196 ~ +870°C',
    ior: 'n=(2.76,2.51,2.26), k=(3.79,3.43,3.03)',
    friction: 'μs=0.30 / μd=0.30'
  },
  SUS_316L_SLM_3DPrinted_AsBuilt: {
    id: 'SUS_316L_SLM_3DPrinted_AsBuilt',
    name: 'SUS 316L (3D프린팅 적층면)',
    sub: 'LPBF/SLM As-Built · 7.97 g/cm³',
    colorHex: '#b4bcc6',
    roughness: 0.44,
    metalness: 0.90,
    clearcoat: 0.10,
    clearcoatRoughness: 0.45,
    opacity: 1.0,
    texType: 'slm_steel',
    densityKgM3: 7970,
    hardness: '220 HV (Ra=12.5 µm)',
    tempRange: '-196 ~ +925°C (융점 1390°C)',
    ior: 'UNS S31673 / EN 1.4404',
    friction: 'μs=0.42 / μd=0.36'
  },
  SUS_316L_Electropolished: {
    id: 'SUS_316L_Electropolished',
    name: 'SUS 316L (전해연마 미러)',
    sub: '#8 Mirror · 7.99 g/cm³',
    colorHex: '#eef2f6',
    roughness: 0.06,
    metalness: 0.99,
    clearcoat: 0.60,
    clearcoatRoughness: 0.05,
    opacity: 1.0,
    texType: 'mirror_steel',
    densityKgM3: 7990,
    hardness: '85 HRB (Ra < 0.08 µm)',
    tempRange: '-196 ~ +925°C',
    ior: 'ASTM B912 Electropolished',
    friction: 'μs=0.22 / μd=0.18'
  },
  SUS_314_HeatResistant_Wrought: {
    id: 'SUS_314_HeatResistant_Wrought',
    name: 'SUS 314 (초내열 스테인리스)',
    sub: '25Cr-20Ni-2Si · 7.80 g/cm³',
    colorHex: '#ddd6c7',
    roughness: 0.28,
    metalness: 0.92,
    clearcoat: 0.20,
    clearcoatRoughness: 0.25,
    opacity: 1.0,
    texType: 'brushed_steel',
    densityKgM3: 7800,
    hardness: '85 HRB (E=200 GPa)',
    tempRange: '연속 1,150°C 고온 내산화 (UNS S31400)',
    ior: 'n=(2.82,2.55,2.22) 샴페인 실버톤',
    friction: 'μs=0.32 / μd=0.30'
  },
  SUS_314_HeatOxidized_Scale: {
    id: 'SUS_314_HeatOxidized_Scale',
    name: 'SUS 314 (고온 산화피막)',
    sub: 'Cr2O3-SiO2 Scale · 7.80 g/cm³',
    colorHex: '#8d8478',
    roughness: 0.52,
    metalness: 0.80,
    clearcoat: 0.35,
    clearcoatRoughness: 0.40,
    opacity: 1.0,
    texType: 'slm_steel',
    densityKgM3: 7800,
    hardness: '180 HB (EN 1.4841 열처리면)',
    tempRange: '연속 1,150°C 열처리 스케일',
    ior: 'Coat IOR=1.75',
    friction: 'μs=0.45 / μd=0.38'
  }
};

// ============================================================================
// 2. 에셋 브라우저 카탈로그 정의 (20종: CNC, 금속 3D 프린터, 사무실 용품, 안전/설비)
// ============================================================================
const ASSET_CATALOG = [
  {
    assetId: 'cnc_sealjet_630pro',
    category: 'CNC_3DP',
    icon: '🎛️',
    badge: 'CNC (PP·FKM)',
    title: 'SKF Seal-Jet 630 PRO CNC',
    sub: 'PP · FKM · FPM 무금형 씰 전용 CNC 선반',
    dims: [2450, 1480, 1820],
    defaultMaterial: 'SUS_304_306_Brushed_2B',
    usdPath: 'industrial_cnc_and_3dprinter.obj#CNC_SealJet'
  },
  {
    assetId: 'cnc_sealjet_200pro',
    category: 'CNC_3DP',
    icon: '⚙️',
    badge: '소형 CNC',
    title: 'SKF Seal-Jet 200 PRO',
    sub: '소구경 FKM/PP 정밀 오일씰 고속 CNC',
    dims: [1520, 1050, 1650],
    defaultMaterial: 'SUS_304_306_Brushed_2B',
    usdPath: 'industrial_cnc_and_3dprinter.obj#CNC_SealJet_200'
  },
  {
    assetId: 'slm_eos_m290',
    category: 'CNC_3DP',
    icon: '🖨️',
    badge: '금속 3D프린터',
    title: 'EOS M 290 스테인리스 3D프린터',
    sub: 'SUS 316L · 304 · 314 LPBF 금속 3D프린터',
    dims: [2500, 1300, 2190],
    defaultMaterial: 'SUS_316L_SLM_3DPrinted_AsBuilt',
    usdPath: 'nvidia_isaac_assets/equipment_3d_printer_a01/sm_equipment_3d_printer_a01_01.usd'
  },
  {
    assetId: 'slm_trumpf_truprint3000',
    category: 'CNC_3DP',
    icon: '🔬',
    badge: '멀티레이저 3DP',
    title: 'TRUMPF TruPrint 3000',
    sub: 'SUS 316L/314 듀얼 500W 레이저 3D프린터',
    dims: [3235, 1465, 2225],
    defaultMaterial: 'SUS_314_HeatResistant_Wrought',
    usdPath: 'nvidia_isaac_assets/equipment_3d_printer_b01/sm_equipment_3d_printer_b01_01.usd'
  },
  {
    assetId: 'argon_filter_station',
    category: 'CNC_3DP',
    icon: '🧪',
    badge: '3DP 보조설비',
    title: '아르곤 가스 순환 필터 & 탱크',
    sub: '금속 3D프린터 불활성 가스 정화 유닛',
    dims: [1150, 950, 1780],
    defaultMaterial: 'SUS_304_306_Brushed_2B',
    usdPath: 'industrial_cnc_and_3dprinter.obj#Argon_Unit'
  },
  {
    assetId: 'cnc_machine_vise',
    category: 'CNC_3DP',
    icon: '🗜️',
    badge: 'SimReady USD',
    title: 'CNC 정밀 클램핑 바이스',
    sub: '스테인리스/플라스틱 후가공 지그 바이스',
    dims: [480, 260, 220],
    defaultMaterial: 'SUS_304_306_Brushed_2B',
    usdPath: 'nvidia_isaac_assets/equipment_machine_vise_c01/sm_equipment_machine_vise_c01_01.usd'
  },
  {
    assetId: 'fkm_fpm_seal_set',
    category: 'CNC_3DP',
    icon: '⭕',
    badge: 'FKM / FPM',
    title: 'FKM/FPM 불소고무 오일씰 세트',
    sub: '85 Shore A 블랙 & 80A 브라운 씰 빌렛',
    dims: [650, 450, 320],
    defaultMaterial: 'FKM_FPM_Viton_Black_85A',
    usdPath: 'nvidia_isaac_assets/consumable_oil_seal_large_b01/sm_consumable_oil_seal_large_b01_01.usd'
  },
  {
    assetId: 'pp_seal_billet_set',
    category: 'CNC_3DP',
    icon: '⚪',
    badge: 'PP 폴리프로필렌',
    title: 'PP 백업링 & 가이드링 빌렛',
    sub: 'ISO 1873 유백색 호모폴리머 PP 중공관',
    dims: [600, 420, 340],
    defaultMaterial: 'PP_Natural_SealGrade',
    usdPath: 'nvidia_isaac_assets/consumable_oil_seal_large_b01/sm_consumable_oil_seal_large_b01_01.usd'
  },
  {
    assetId: 'office_desk_a01',
    category: 'OFFICE',
    icon: '🪑',
    badge: 'SimReady USD',
    title: '오피스 표준 데스크 (Desk A01)',
    sub: '1,600×800mm 사무실/연구실 표준 책상',
    dims: [1600, 800, 750],
    defaultMaterial: 'SUS_304_306_Brushed_2B',
    usdPath: 'nvidia_isaac_assets/desk_a01/sm_desk_a01_01.usd'
  },
  {
    assetId: 'office_manager_chair',
    category: 'OFFICE',
    icon: '💺',
    badge: 'SimReady USD',
    title: '매니저용 하이백 오피스 체어',
    sub: '인체공학 회전식 패브릭 매니저 의자',
    dims: [660, 660, 1080],
    defaultMaterial: 'FKM_FPM_Viton_Black_85A',
    usdPath: 'nvidia_isaac_assets/sm_fabricmanagerschair_a01_01/sm_fabricmanagerschair_a01_01.usd'
  },
  {
    assetId: 'office_task_chair',
    category: 'OFFICE',
    icon: '🪑',
    badge: 'SimReady USD',
    title: '실무자용 블랙 오피스 체어',
    sub: '메자닌/사무실 표준 회전 의자',
    dims: [600, 600, 940],
    defaultMaterial: 'FKM_FPM_Viton_Black_85A',
    usdPath: 'nvidia_isaac_assets/sm_officechairamf_a01_black_01/sm_officechairamf_a01_black_01.usd'
  },
  {
    assetId: 'office_pc_workstation_set',
    category: 'OFFICE',
    icon: '🖥️',
    badge: 'SimReady USD',
    title: 'CAD/CAM 모니터·키보드·PC 세트',
    sub: '27인치 모니터 + 키보드 + 마우스 + 워크스테이션',
    dims: [780, 520, 540],
    defaultMaterial: 'PP_GF30_Structural_Grey',
    usdPath: 'nvidia_isaac_assets/sm_officemonitor_a01_01/sm_officemonitor_a01_01.usd'
  },
  {
    assetId: 'office_laser_printer',
    category: 'OFFICE',
    icon: '📠',
    badge: 'SimReady USD',
    title: '사무실 레이저 복합기/프린터',
    sub: '네트워크 A3/A4 레이저 프린터 & 급지대',
    dims: [560, 540, 520],
    defaultMaterial: 'PP_Natural_SealGrade',
    usdPath: 'nvidia_isaac_assets/sm_officeprinter_a01_01/sm_officeprinter_a01_01.usd'
  },
  {
    assetId: 'office_file_cabinet',
    category: 'OFFICE',
    icon: '🗄️',
    badge: 'SimReady USD',
    title: '철제 4단 서류 파일 캐비닛',
    sub: '도면 및 품질 보증 문서 보관 캐비닛',
    dims: [480, 620, 1340],
    defaultMaterial: 'SUS_304_306_Brushed_2B',
    usdPath: 'nvidia_isaac_assets/cabinet_file_a01/sm_cabinet_file_a01_01.usd'
  },
  {
    assetId: 'office_trash_and_paper',
    category: 'OFFICE',
    icon: '🗑️',
    badge: 'SimReady USD',
    title: '사무실 휴지통 & A4 용지팩',
    sub: '블랙 오피스 휴지통 및 A4 복사용지 묶음',
    dims: [360, 320, 420],
    defaultMaterial: 'PP_GF30_Structural_Grey',
    usdPath: 'nvidia_isaac_assets/SM_OfficeTrashCan_A03_Black_01/SM_OfficeTrashCan_A03_Black_01.usd'
  },
  {
    assetId: 'stainless_worktable_sus316',
    category: 'INDUSTRIAL',
    icon: '🛠️',
    badge: 'SUS 304 / 316',
    title: '스테인리스 정밀 작업대 (A03)',
    sub: 'SUS 316 전해연마 상판 후처리·측정 테이블',
    dims: [1800, 900, 860],
    defaultMaterial: 'SUS_316L_Electropolished',
    usdPath: 'nvidia_isaac_assets/SM_MetalStainlessTable_A03_01/SM_MetalStainlessTable_A03_01.usd'
  },
  {
    assetId: 'stainless_ibc_tank',
    category: 'INDUSTRIAL',
    icon: '🛢️',
    badge: 'SUS 316L',
    title: '스테인리스 316L IBC 화학 탱크',
    sub: '1,000L 스테인리스 스틸 액체/세척액 저장조',
    dims: [1200, 1000, 1160],
    defaultMaterial: 'SUS_316L_Electropolished',
    usdPath: 'nvidia_isaac_assets/SM_StainlessSteelIBCTank_A01_01/SM_StainlessSteelIBCTank_A01_01.usd'
  },
  {
    assetId: 'operator_computer_cart',
    category: 'INDUSTRIAL',
    icon: '🛒',
    badge: 'SimReady USD',
    title: '현장 제어용 모바일 컴퓨터 카트',
    sub: 'CNC·3D프린터 연동 이동식 HMI 터미널 카트',
    dims: [680, 620, 1180],
    defaultMaterial: 'SUS_304_306_Brushed_2B',
    usdPath: 'nvidia_isaac_assets/SM_ComputerCart_A01_01/SM_ComputerCart_A01_01.usd'
  },
  {
    assetId: 'flammable_safety_cabinet',
    category: 'INDUSTRIAL',
    icon: '⚠️',
    badge: 'SimReady USD',
    title: '황색 방폭 위험물 안전 캐비닛',
    sub: '세척 용제 및 금속 분말 방폭 보관함',
    dims: [1090, 460, 1120],
    defaultMaterial: 'SUS_304_306_Brushed_2B',
    usdPath: 'nvidia_isaac_assets/SM_FlammableDrumCabinet_A02_01/SM_FlammableDrumCabinet_A02_01.usd'
  },
  {
    assetId: 'safety_guardrail_a09',
    category: 'INDUSTRIAL',
    icon: '🚧',
    badge: 'SimReady USD',
    title: '공장 안전 가드레일 (A09)',
    sub: '설비 구획 보호용 황색 강관 가드레일',
    dims: [2000, 220, 1050],
    defaultMaterial: 'SUS_304_306_Brushed_2B',
    usdPath: 'nvidia_isaac_assets/SM_GuardRail_A09_01/SM_GuardRail_A09_01.usd'
  }
];

// ============================================================================
// 2.5 UE5 / Omniverse 급 PBR 텍스처 합성기, UV 생성기 및 Studio HDRI 환경맵
// ============================================================================
function ensureWorldBoxUVs(geometry, tileSizeMM = 2000) {
  if (!geometry || !geometry.attributes || !geometry.attributes.position) return;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();

  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  const count = pos.count;
  const uvs = new Float32Array(count * 2);

  for (let i = 0; i < count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(norm.getX(i)), ny = Math.abs(norm.getY(i)), nz = Math.abs(norm.getZ(i));
    let u, v;
    if (nz >= nx && nz >= ny) {
      u = x / tileSizeMM;
      v = y / tileSizeMM;
    } else if (nx >= ny && nx >= nz) {
      u = y / tileSizeMM;
      v = z / tileSizeMM;
    } else {
      u = x / tileSizeMM;
      v = z / tileSizeMM;
    }
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('uv2', new THREE.BufferAttribute(uvs, 2));
}

function buildIndustrialHDRIEnvironment(rendererInstance) {
  const pmremGenerator = new THREE.PMREMGenerator(rendererInstance);
  pmremGenerator.compileCubemapShader();

  const envScene = new THREE.Scene();
  // 깊은 다크 인더스트리얼 앰비언트 돔 (암부 대비 극대화)
  envScene.background = new THREE.Color(0x080c12);

  // 바닥 다크 바운스
  const floorBounce = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.08, 0.11), side: THREE.DoubleSide })
  );
  floorBounce.position.set(0, 0, -45);
  envScene.add(floorBounce);

  // 날카로운 금속 스페큘러 하이라이트용 슬림 LED 스트립 (확산광 과포화 방지)
  const ledStripGeo = new THREE.PlaneGeometry(8, 2.2);
  const ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.4, 2.8), side: THREE.DoubleSide });
  for (let ix = -2; ix <= 2; ix++) {
    for (let iy = -1; iy <= 1; iy++) {
      const strip = new THREE.Mesh(ledStripGeo, ledMat);
      strip.position.set(ix * 30, iy * 34, 48);
      envScene.add(strip);
    }
  }

  // 북측 채광창 소프트 림라이트 반사 패널
  const skyPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.85, 1.15, 1.65), side: THREE.DoubleSide })
  );
  skyPanel.position.set(0, 90, 22);
  skyPanel.rotation.x = Math.PI / 2;
  envScene.add(skyPanel);

  // 측면 웜톤 포인트 반사광
  const warmPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.72, 0.48), side: THREE.DoubleSide })
  );
  warmPanel.position.set(90, 0, 12);
  warmPanel.rotation.y = Math.PI / 2;
  envScene.add(warmPanel);

  const envRT = pmremGenerator.fromScene(envScene, 0.025);
  pmremGenerator.dispose();
  return envRT.texture;
}

function initPBRTextures() {
  const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 8;
  const texLoader = new THREE.TextureLoader();

  function loadSimReadyTex(url, repeatX = 2, repeatY = 2, isSRGB = false) {
    const t = texLoader.load(url);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    t.anisotropy = maxAniso;
    if (isSRGB) t.encoding = THREE.sRGBEncoding;
    return t;
  }

  // 1) NVIDIA SimReady 실제 로컬 PBR 텍스처 로드
  pbrTextures.steelAlbedo = loadSimReadyTex('/assets/nvidia_material_library/Metal/Textures/T_Steel_A1_Albedo.png', 2, 2, true);
  pbrTextures.steelNormal = loadSimReadyTex('/assets/nvidia_material_library/Metal/Textures/T_Steel_A1_Normal.png', 2, 2, false);
  pbrTextures.steelORM = loadSimReadyTex('/assets/nvidia_material_library/Metal/Textures/T_Steel_A1_ORM.png', 2, 2, false);

  pbrTextures.chromeNormal = loadSimReadyTex('/assets/nvidia_material_library/Metal/Textures/T_Metal_Chrome_A_Normal.png', 2, 2, false);
  pbrTextures.chromeORM = loadSimReadyTex('/assets/nvidia_material_library/Metal/Textures/T_Metal_Chrome_A_ORM.png', 2, 2, false);

  pbrTextures.roughMetalNormal = loadSimReadyTex('/assets/nvidia_material_library/Metal/Textures/T_Metal_Rough_A_Normal.png', 3, 3, false);
  pbrTextures.roughMetalORM = loadSimReadyTex('/assets/nvidia_material_library/Metal/Textures/T_Metal_Rough_A_ORM.png', 3, 3, false);

  pbrTextures.rubberNormal = loadSimReadyTex('/assets/nvidia_material_library/Rubber/Textures/T_Rubber_Black_Glossy_A_Normal.png', 3, 3, false);
  pbrTextures.rubberORM = loadSimReadyTex('/assets/nvidia_material_library/Rubber/Textures/T_Rubber_Black_Glossy_A_ORM.png', 3, 3, false);

  // 2) 폴리싱 에폭시 콘크리트 바닥 PBR 맵 (Albedo + Roughness 편차 + 타일/크랙 Normal)
  {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#4e5968';
    ctx.fillRect(0, 0, 512, 512);

    // 미세 골재 스펙클 및 웨더링 패치
    for (let i = 0; i < 6500; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const v = 65 + Math.floor(Math.random() * 36);
      ctx.fillStyle = `rgb(${v},${v + 5},${v + 12})`;
      ctx.fillRect(x, y, 2, 2);
    }
    // 팽창 줄눈 그리드 라인
    ctx.strokeStyle = '#2d3540';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, 509, 509);
    ctx.strokeStyle = '#3d4654';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(256, 0); ctx.lineTo(256, 512);
    ctx.moveTo(0, 256); ctx.lineTo(512, 256);
    ctx.stroke();

    const floorAlb = new THREE.CanvasTexture(c);
    floorAlb.wrapS = THREE.RepeatWrapping;
    floorAlb.wrapT = THREE.RepeatWrapping;
    floorAlb.encoding = THREE.sRGBEncoding;
    floorAlb.anisotropy = maxAniso;
    pbrTextures.epoxyFloorAlbedo = floorAlb;

    // 바닥 Roughness 맵 (광택 에폭시 코팅 얼룩 효과)
    const cr = document.createElement('canvas');
    cr.width = 512; cr.height = 512;
    const rctx = cr.getContext('2d');
    rctx.fillStyle = '#484848'; // 평균 roughness ~ 0.28
    rctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 45; i++) {
      const gx = Math.random() * 512, gy = Math.random() * 512, gr = 30 + Math.random() * 80;
      const grad = rctx.createRadialGradient(gx, gy, 4, gx, gy, gr);
      const val = Math.random() > 0.5 ? 32 : 115;
      grad.addColorStop(0, `rgba(${val},${val},${val},0.35)`);
      grad.addColorStop(1, 'rgba(72,72,72,0)');
      rctx.fillStyle = grad;
      rctx.beginPath(); rctx.arc(gx, gy, gr, 0, Math.PI * 2); rctx.fill();
    }
    const floorRough = new THREE.CanvasTexture(cr);
    floorRough.wrapS = THREE.RepeatWrapping;
    floorRough.wrapT = THREE.RepeatWrapping;
    floorRough.anisotropy = maxAniso;
    pbrTextures.epoxyFloorRoughness = floorRough;
  }

  // 3) 골강판(Corrugated Trapezoidal Siding) 탄젠트 노멀맵
  {
    const cn = document.createElement('canvas');
    cn.width = 256; cn.height = 256;
    const nctx = cn.getContext('2d');
    const img = nctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const phase = (x % 32) / 32;
        let nx = 128;
        if (phase < 0.2) nx = 195;
        else if (phase > 0.5 && phase < 0.7) nx = 60;
        const idx = (y * 256 + x) * 4;
        img.data[idx] = nx;
        img.data[idx + 1] = 128;
        img.data[idx + 2] = 255;
        img.data[idx + 3] = 255;
      }
    }
    nctx.putImageData(img, 0, 0);
    const corrNorm = new THREE.CanvasTexture(cn);
    corrNorm.wrapS = THREE.RepeatWrapping;
    corrNorm.wrapT = THREE.RepeatWrapping;
    corrNorm.anisotropy = maxAniso;
    pbrTextures.corrugatedNormal = corrNorm;
  }

  // 4) 스테인리스 304/306/314 헤어라인 브러시드 노멀맵
  {
    const bn = document.createElement('canvas');
    bn.width = 256; bn.height = 256;
    const bctx = bn.getContext('2d');
    bctx.fillStyle = 'rgb(128,128,255)';
    bctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y++) {
      const dy = 112 + Math.floor(Math.random() * 32);
      bctx.fillStyle = `rgb(128,${dy},255)`;
      bctx.fillRect(0, y, 256, 1);
    }
    const brushNorm = new THREE.CanvasTexture(bn);
    brushNorm.wrapS = THREE.RepeatWrapping;
    brushNorm.wrapT = THREE.RepeatWrapping;
    brushNorm.anisotropy = maxAniso;
    pbrTextures.brushedNormal = brushNorm;
  }

  // 5) 오크/월넛 원목 데스크 상판 텍스처
  {
    const wc = document.createElement('canvas');
    wc.width = 512; wc.height = 512;
    const wctx = wc.getContext('2d');
    wctx.fillStyle = '#b68656';
    wctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y++) {
      const wave = Math.sin(y * 0.06) * 8 + (Math.random() - 0.5) * 10;
      const r = Math.min(255, Math.max(0, 178 + wave));
      const g = Math.min(255, Math.max(0, 128 + wave * 0.8));
      const b = Math.min(255, Math.max(0, 82 + wave * 0.6));
      wctx.fillStyle = `rgb(${r},${g},${b})`;
      wctx.fillRect(0, y, 512, 1);
    }
    const woodTex = new THREE.CanvasTexture(wc);
    woodTex.wrapS = THREE.RepeatWrapping;
    woodTex.wrapT = THREE.RepeatWrapping;
    woodTex.encoding = THREE.sRGBEncoding;
    woodTex.anisotropy = maxAniso;
    pbrTextures.woodAlbedo = woodTex;
  }

  // 6) CNC / 3D프린터 / CAD 워크스테이션 발광 디스플레이 UI 텍스처
  {
    const sc = document.createElement('canvas');
    sc.width = 512; sc.height = 384;
    const sctx = sc.getContext('2d');
    sctx.fillStyle = '#071324';
    sctx.fillRect(0, 0, 512, 384);
    sctx.strokeStyle = '#0ea5e9';
    sctx.lineWidth = 4;
    sctx.strokeRect(8, 8, 496, 368);
    sctx.fillStyle = '#0284c7';
    sctx.fillRect(14, 14, 484, 38);
    sctx.fillStyle = '#ffffff';
    sctx.font = 'bold 20px monospace';
    sctx.fillText('SOLIDCRAFT × SIEMENS SINUMERIK HMI', 26, 40);
    // 3D 씰 단면 그래프 및 G-code 파형
    sctx.strokeStyle = '#38bdf8';
    sctx.lineWidth = 2;
    sctx.strokeRect(24, 70, 280, 220);
    sctx.beginPath();
    sctx.arc(164, 180, 72, 0, Math.PI * 2);
    sctx.arc(164, 180, 46, 0, Math.PI * 2);
    sctx.stroke();
    sctx.fillStyle = '#22c55e';
    sctx.font = 'bold 17px monospace';
    sctx.fillText('SPINDLE: 2,850 RPM', 320, 98);
    sctx.fillText('LASER:   400 W (Ar)', 320, 130);
    sctx.fillText('MAT:     FKM / SUS316L', 320, 162);
    sctx.fillStyle = '#facc15';
    sctx.fillText('POS X: +142.850 mm', 320, 210);
    sctx.fillText('POS Z:  -18.400 mm', 320, 240);
    sctx.fillStyle = '#38bdf8';
    sctx.fillRect(24, 312, 464, 44);
    sctx.fillStyle = '#040d1a';
    sctx.fillText('STATUS: PRODUCTION ACTIVE [100% READY]', 38, 340);

    const screenTex = new THREE.CanvasTexture(sc);
    screenTex.encoding = THREE.sRGBEncoding;
    pbrTextures.hmiScreenTex = screenTex;
  }
}

// ============================================================================
// 3. 멀티파트 하이디테일 PBR 3D 에셋 지오메트리 빌더
// ============================================================================
function makePart(geo, colorHex, roughness = 0.3, metalness = 0.6, opacity = 1.0, tag = 'body') {
  ensureWorldBoxUVs(geo, 800);

  const isScreen = tag === 'screen';
  const isBeacon = tag === 'beacon';
  const isGlass = tag === 'glass';
  const isWood = tag === 'wood_top';

  const matParams = {
    color: new THREE.Color(colorHex),
    roughness: isGlass ? 0.06 : roughness,
    metalness: isGlass ? 0.1 : metalness,
    clearcoat: isGlass ? 1.0 : (metalness > 0.6 ? 0.35 : 0.15),
    clearcoatRoughness: 0.20,
    transparent: opacity < 1.0,
    opacity,
    envMapIntensity: isPhotorealPBR ? (metalness > 0.5 ? 0.95 : 0.35) : 0.2
  };

  if (isScreen && pbrTextures.hmiScreenTex) {
    matParams.map = pbrTextures.hmiScreenTex;
    matParams.emissive = new THREE.Color(0x0ea5e9);
    matParams.emissiveMap = pbrTextures.hmiScreenTex;
    matParams.emissiveIntensity = 0.65;
  } else if (isBeacon) {
    matParams.emissive = new THREE.Color(colorHex);
    matParams.emissiveIntensity = 0.85;
  } else if (isWood && pbrTextures.woodAlbedo) {
    matParams.map = pbrTextures.woodAlbedo;
    matParams.clearcoat = 0.35;
  } else if (metalness >= 0.7 && pbrTextures.brushedNormal) {
    matParams.normalMap = pbrTextures.brushedNormal;
    matParams.normalScale = new THREE.Vector2(0.22, 0.22);
  }

  const mat = new THREE.MeshPhysicalMaterial(matParams);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = !isGlass;
  mesh.receiveShadow = true;
  mesh.userData.partTag = tag;

  // 미세 패널 유격(Micro-Seam Crease) 라인 — 만화 같은 두꺼운 검은 선이 아닌 실제 파츠 유격 표현
  const edges = new THREE.EdgesGeometry(geo, 28);
  const line = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({
      color: 0x090d14,
      transparent: true,
      opacity: isCadEdgesVisible ? 0.75 : 0.22
    })
  );
  line.userData.isCadEdge = true;
  mesh.add(line);
  return mesh;
}

// 바닥 접촉 앰비언트 오클루전(AO) 소프트 그림자 패드 (공중에 떠 보이는 현상 제거)
function addContactShadowPad(group, W, D) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 18, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.68)');
  grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const tex = new THREE.CanvasTexture(c);
  const padGeo = new THREE.PlaneGeometry(W * 1.18, D * 1.18);
  const padMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1
  });
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.position.set(0, 0, 2);
  pad.userData.isContactShadow = true;
  group.add(pad);
}

function addBoxPart(group, x, y, z, dx, dy, dz, colorHex, roughness = 0.3, metalness = 0.6, opacity = 1.0, tag = 'primary') {
  const geo = new THREE.BoxGeometry(dx, dy, dz);
  geo.translate(x + dx / 2, y + dy / 2, z + dz / 2);
  const m = makePart(geo, colorHex, roughness, metalness, opacity, tag);
  group.add(m);
  return m;
}

function addCylPartZ(group, cx, cy, z, r, h, colorHex, roughness = 0.25, metalness = 0.75, tag = 'primary') {
  const geo = new THREE.CylinderGeometry(r, r, h, 32);
  geo.rotateX(Math.PI / 2);
  geo.translate(cx, cy, z + h / 2);
  const m = makePart(geo, colorHex, roughness, metalness, 1.0, tag);
  group.add(m);
  return m;
}

function addCylPartX(group, x, cy, cz, r, dx, colorHex, roughness = 0.25, metalness = 0.75, tag = 'primary') {
  const geo = new THREE.CylinderGeometry(r, r, dx, 32);
  geo.rotateZ(Math.PI / 2);
  geo.translate(x + dx / 2, cy, cz);
  const m = makePart(geo, colorHex, roughness, metalness, 1.0, tag);
  group.add(m);
  return m;
}

function buildAssetMeshGroup(assetDef) {
  const g = new THREE.Group();
  const [W, D, H] = assetDef.dims;
  const cx = -W / 2;
  const cy = -D / 2;

  addContactShadowPad(g, W, D);

  switch (assetDef.assetId) {
    case 'cnc_sealjet_630pro':
    case 'cnc_sealjet_200pro': {
      // SKF Seal-Jet CNC Lathe — Heavy Cast Base, Stainless Chip Pan, SKF Blue Enclosure, Chuck + Jaws, Turret, Swivel HMI, Stack Light
      addBoxPart(g, cx, cy, 0, W, D, H * 0.36, '#1e293b', 0.38, 0.75, 1.0, 'frame');
      addBoxPart(g, cx + 25, cy - 12, 40, W - 50, 24, H * 0.30, '#0f172a', 0.32, 0.80, 1.0, 'frame');
      addBoxPart(g, cx + 40, cy + 40, H * 0.36, W * 0.76, D - 80, 50, '#d4d8de', 0.18, 0.94, 1.0, 'primary');
      // Left Spindle Headstock Housing (SKF Industrial Blue Metallic)
      addBoxPart(g, cx, cy, H * 0.36, W * 0.29, D, H * 0.64, '#0284c7', 0.24, 0.65, 1.0, 'accent');
      addBoxPart(g, cx - 10, cy + D * 0.15, H * 0.48, 20, D * 0.7, H * 0.42, '#0f172a', 0.4, 0.8, 1.0, 'frame');
      // Rear & Right Brushed Stainless Enclosure
      addBoxPart(g, cx + W * 0.29, cy + D * 0.42, H * 0.36, W * 0.51, D * 0.58, H * 0.64, '#e2e8f0', 0.24, 0.92, 1.0, 'primary');
      addBoxPart(g, cx + W * 0.80, cy, H * 0.36, W * 0.20, D, H * 0.64, '#e2e8f0', 0.24, 0.92, 1.0, 'primary');
      // Sliding Safety Door + Bezel + Polycarbonate Safety Glass
      addBoxPart(g, cx + W * 0.29, cy + 16, H * 0.40, W * 0.49, 42, H * 0.56, '#0284c7', 0.22, 0.65, 1.0, 'accent');
      addBoxPart(g, cx + W * 0.32, cy + 12, H * 0.45, W * 0.42, 48, H * 0.44, '#0f172a', 0.3, 0.8, 1.0, 'frame');
      addBoxPart(g, cx + W * 0.33, cy + 22, H * 0.47, W * 0.40, 18, H * 0.40, '#bae6fd', 0.05, 0.1, 0.32, 'glass');
      // Stainless Handle Bar
      addCylPartX(g, cx + W * 0.74, cy - 8, H * 0.62, 12, 35, '#f8fafc', 0.1, 0.98, 'primary');
      // 3-Jaw Precision Chuck + FKM Black + FKM Brown + PP White Seal Billets
      addCylPartX(g, cx + W * 0.29, 0, H * 0.66, D * 0.15, W * 0.08, '#e2e8f0', 0.14, 0.96, 'primary');
      addCylPartX(g, cx + W * 0.37, 0, H * 0.66, D * 0.105, W * 0.10, '#18181b', 0.68, 0.05, 'fkm_black');
      addCylPartX(g, cx + W * 0.47, 0, H * 0.66, D * 0.095, W * 0.06, '#5c2d16', 0.64, 0.05, 'fkm_brown');
      addCylPartX(g, cx + W * 0.53, 0, H * 0.66, D * 0.09, W * 0.055, '#f1f5f9', 0.22, 0.0, 'pp_white');
      // 8-Station CNC Tool Turret + Swivel HMI Pendant + 3-Color Status Tower
      addCylPartX(g, cx + W * 0.62, D * 0.12, H * 0.72, D * 0.12, 120, '#334155', 0.28, 0.85, 'frame');
      addBoxPart(g, cx + W * 0.75, cy - 140, H * 0.56, 390, 95, 480, '#0f172a', 0.25, 0.75, 1.0, 'frame');
      addBoxPart(g, cx + W * 0.77, cy - 146, H * 0.62, 330, 12, 280, '#38bdf8', 0.1, 0.1, 1.0, 'screen');
      addCylPartZ(g, cx + W * 0.88, cy + 120, H, 28, 220, '#10b981', 0.15, 0.2, 'beacon');
      break;
    }
    case 'slm_eos_m290':
    case 'slm_trumpf_truprint3000': {
      // Stainless Steel Metal 3D Printer (LPBF / SLM) — Brushed Stainless Body, Laser Chamber, Build Plate, Gloves, HMI
      addBoxPart(g, cx, cy, 0, W, D, H * 0.38, '#1e293b', 0.35, 0.78, 1.0, 'frame');
      addBoxPart(g, cx, cy + 30, H * 0.38, W * 0.58, D - 30, H * 0.53, '#d4d8de', 0.22, 0.94, 1.0, 'primary');
      addBoxPart(g, cx + W * 0.58, cy, H * 0.38, W * 0.42, D, H * 0.53, '#e2e8f0', 0.28, 0.85, 1.0, 'frame');
      addBoxPart(g, cx + W * 0.04, cy + 90, H * 0.91, W * 0.50, D * 0.76, H * 0.09, '#0f172a', 0.3, 0.82, 1.0, 'frame');
      // Laser Shield Green Viewing Window + Dark Frame + Build Plate + Printed SUS 316L/314 Parts
      addBoxPart(g, cx + W * 0.09, cy + 12, H * 0.46, W * 0.38, 36, H * 0.34, '#0f172a', 0.28, 0.85, 1.0, 'frame');
      addBoxPart(g, cx + W * 0.11, cy + 18, H * 0.48, W * 0.34, 20, H * 0.30, '#10b981', 0.06, 0.2, 0.42, 'glass');
      addCylPartZ(g, cx + W * 0.28, 0, H * 0.42, 145, 45, '#94a3b8', 0.3, 0.9, 'primary');
      addCylPartZ(g, cx + W * 0.23, -30, H * 0.44, 52, 125, '#cbd5e1', 0.44, 0.92, 'primary');
      addCylPartZ(g, cx + W * 0.33, 35, H * 0.44, 48, 140, '#ddd6c7', 0.28, 0.94, 'sus314');
      // Status Beacon & HMI Touchscreen
      addCylPartZ(g, cx + W * 0.29, 0, H, 42, 160, '#f59e0b', 0.15, 0.2, 'beacon');
      addBoxPart(g, cx + W * 0.65, cy - 16, H * 0.53, 360, 24, 440, '#0f172a', 0.25, 0.8, 1.0, 'frame');
      addBoxPart(g, cx + W * 0.665, cy - 20, H * 0.56, 330, 12, 320, '#38bdf8', 0.1, 0.1, 1.0, 'screen');
      break;
    }
    case 'argon_filter_station': {
      addBoxPart(g, cx, cy, 0, W * 0.66, D, H, '#475569', 0.32, 0.78, 1.0, 'primary');
      addBoxPart(g, cx + 30, cy - 15, H * 0.55, W * 0.52, 20, 320, '#0f172a', 0.3, 0.8, 1.0, 'frame');
      addCylPartZ(g, cx + W * 0.84, -D * 0.20, 0, 120, H * 0.86, '#0d9488', 0.24, 0.72, 'accent');
      addCylPartZ(g, cx + W * 0.84, D * 0.20, 0, 120, H * 0.86, '#0d9488', 0.24, 0.72, 'accent');
      addCylPartZ(g, cx + W * 0.84, -D * 0.20, H * 0.86, 45, 110, '#d4af37', 0.2, 0.95, 'primary');
      addCylPartZ(g, cx + W * 0.84, D * 0.20, H * 0.86, 45, 110, '#d4af37', 0.2, 0.95, 'primary');
      break;
    }
    case 'cnc_machine_vise': {
      addBoxPart(g, cx, cy, 0, W, D, H * 0.35, '#334155', 0.28, 0.88, 1.0, 'primary');
      addBoxPart(g, cx + 30, cy + 20, H * 0.35, W * 0.28, D - 40, H * 0.65, '#e2e8f0', 0.18, 0.95, 1.0, 'primary');
      addBoxPart(g, cx + W * 0.55, cy + 20, H * 0.35, W * 0.28, D - 40, H * 0.65, '#e2e8f0', 0.18, 0.95, 1.0, 'primary');
      addCylPartX(g, cx - 60, 0, H * 0.55, 28, W + 120, '#cbd5e1', 0.15, 0.95, 'primary');
      break;
    }
    case 'fkm_fpm_seal_set': {
      addBoxPart(g, cx, cy, 0, W, D, 36, '#1e293b', 0.3, 0.8, 1.0, 'tray');
      addCylPartZ(g, -W * 0.24, -D * 0.12, 36, 112, H - 36, '#18191c', 0.68, 0.02, 'primary');
      addCylPartZ(g, W * 0.08, -D * 0.10, 36, 96, (H - 36) * 0.85, '#5a2b15', 0.64, 0.02, 'fkm_brown');
      addCylPartZ(g, W * 0.28, D * 0.15, 36, 86, (H - 36) * 0.7, '#14532d', 0.66, 0.02, 'fkm_green');
      break;
    }
    case 'pp_seal_billet_set': {
      addBoxPart(g, cx, cy, 0, W, D, 36, '#1e293b', 0.3, 0.8, 1.0, 'tray');
      addCylPartZ(g, -W * 0.20, 0, 36, 116, H - 36, '#ecece6', 0.22, 0.0, 'primary');
      addCylPartZ(g, W * 0.20, 0, 36, 96, (H - 36) * 0.8, '#ecece6', 0.22, 0.0, 'primary');
      break;
    }
    case 'office_desk_a01': {
      // Warm Oak Veneer Top + Brushed Steel C-Frame Legs + Modesty Panel + Cable Grommet
      addBoxPart(g, cx, cy, H - 42, W, D, 42, '#c89666', 0.34, 0.05, 1.0, 'wood_top');
      addBoxPart(g, cx + 45, cy + 45, 0, 55, D - 90, 40, '#1e293b', 0.25, 0.85, 1.0, 'primary');
      addBoxPart(g, cx + W - 100, cy + 45, 0, 55, D - 90, 40, '#1e293b', 0.25, 0.85, 1.0, 'primary');
      addBoxPart(g, cx + 45, cy + D * 0.35, 40, 55, 90, H - 82, '#334155', 0.25, 0.85, 1.0, 'primary');
      addBoxPart(g, cx + W - 100, cy + D * 0.35, 40, 55, 90, H - 82, '#334155', 0.25, 0.85, 1.0, 'primary');
      addBoxPart(g, cx + 100, cy + D - 130, H * 0.38, W - 200, 24, H * 0.52, '#1e293b', 0.35, 0.7, 1.0, 'primary');
      break;
    }
    case 'office_manager_chair':
    case 'office_task_chair': {
      // 5-Star Base + Chrome Gas Lift + Ergonomic Seat & Backrest + Armrests
      addCylPartZ(g, 0, 0, 0, W * 0.44, 48, '#0f172a', 0.28, 0.82, 'frame');
      addCylPartZ(g, 0, 0, 48, 32, H * 0.38, '#e2e8f0', 0.08, 0.98, 'frame');
      addBoxPart(g, -W * 0.38, -D * 0.38, H * 0.42, W * 0.76, D * 0.76, 85, '#18191c', 0.68, 0.05, 1.0, 'primary');
      addBoxPart(g, -W * 0.36, D * 0.24, H * 0.48, W * 0.72, 85, H * 0.50, '#18191c', 0.68, 0.05, 1.0, 'primary');
      addBoxPart(g, -W * 0.44, -D * 0.18, H * 0.46, 36, D * 0.48, 190, '#334155', 0.3, 0.75, 1.0, 'frame');
      addBoxPart(g, W * 0.44 - 36, -D * 0.18, H * 0.46, 36, D * 0.48, 190, '#334155', 0.3, 0.75, 1.0, 'frame');
      break;
    }
    case 'office_pc_workstation_set': {
      // Monitor + Aluminum Stand + Glowing CAD UI Screen + Keyboard + Mouse + Brushed Workstation Tower
      addBoxPart(g, -330, 35, 0, 240, 170, 16, '#94a3b8', 0.22, 0.9, 1.0, 'frame');
      addBoxPart(g, -238, 95, 16, 56, 42, 135, '#94a3b8', 0.22, 0.9, 1.0, 'frame');
      addBoxPart(g, -400, 78, 135, 560, 32, 345, '#0f172a', 0.22, 0.7, 1.0, 'primary');
      addBoxPart(g, -386, 72, 148, 532, 8, 318, '#38bdf8', 0.08, 0.1, 1.0, 'screen');
      addBoxPart(g, -320, -185, 0, 390, 145, 20, '#1e293b', 0.35, 0.5, 1.0, 'primary');
      addBoxPart(g, 115, -165, 0, 72, 115, 30, '#0f172a', 0.3, 0.5, 1.0, 'primary');
      addBoxPart(g, 185, -130, 0, 210, 430, 470, '#1e293b', 0.25, 0.82, 1.0, 'primary');
      addBoxPart(g, 195, -134, 380, 190, 8, 45, '#38bdf8', 0.1, 0.2, 1.0, 'beacon');
      break;
    }
    case 'office_laser_printer': {
      addBoxPart(g, cx, cy, 0, W, D, H * 0.76, '#f1f5f9', 0.28, 0.12, 1.0, 'primary');
      addBoxPart(g, cx + 24, cy + 24, H * 0.76, W - 48, D - 48, H * 0.24, '#cbd5e1', 0.32, 0.2, 1.0, 'primary');
      addBoxPart(g, cx + 70, cy - 45, H * 0.36, W - 140, 65, 22, '#475569', 0.28, 0.5, 1.0, 'tray');
      addBoxPart(g, cx + W - 150, cy + 20, H * 0.78, 110, 80, 35, '#38bdf8', 0.1, 0.1, 1.0, 'screen');
      break;
    }
    case 'office_file_cabinet': {
      addBoxPart(g, cx, cy, 0, W, D, H, '#94a3b8', 0.28, 0.78, 1.0, 'primary');
      for (let i = 0; i < 4; i++) {
        const dz = 40 + i * (H * 0.23);
        addBoxPart(g, cx + 22, cy - 14, dz, W - 44, 18, H * 0.20, '#cbd5e1', 0.24, 0.85, 1.0, 'drawer');
        addBoxPart(g, -65, cy - 24, dz + H * 0.10, 130, 12, 18, '#f8fafc', 0.12, 0.96, 1.0, 'primary');
      }
      break;
    }
    case 'stainless_worktable_sus316': {
      // Electropolished SUS 316 Mirror Top + Brushed Lower Shelf + 4 Tubular Legs with Leveling Feet
      addBoxPart(g, cx, cy, H - 55, W, D, 55, '#eef2f6', 0.06, 0.99, 1.0, 'primary');
      addBoxPart(g, cx + 45, cy + 45, 200, W - 90, D - 90, 35, '#d4d8de', 0.18, 0.94, 1.0, 'primary');
      const legOffsets = [[70, 70], [W - 70, 70], [70, D - 70], [W - 70, D - 70]];
      for (const [lx, ly] of legOffsets) {
        addCylPartZ(g, cx + lx, cy + ly, 0, 28, H - 55, '#e2e8f0', 0.12, 0.96, 'primary');
      }
      break;
    }
    case 'stainless_ibc_tank': {
      addBoxPart(g, cx, cy, 0, W, D, 145, '#334155', 0.32, 0.85, 1.0, 'frame');
      addBoxPart(g, cx + 35, cy + 35, 145, W - 70, D - 70, H - 205, '#eef2f6', 0.08, 0.98, 1.0, 'primary');
      addCylPartZ(g, 0, 0, H - 60, 115, 60, '#1d4ed8', 0.25, 0.3, 'cap');
      break;
    }
    case 'flammable_safety_cabinet': {
      addBoxPart(g, cx, cy, 0, W, D, H, '#eab308', 0.26, 0.55, 1.0, 'primary');
      addBoxPart(g, cx + 80, cy - 12, H * 0.55, W - 160, 16, 180, '#dc2626', 0.25, 0.2, 1.0, 'warning');
      break;
    }
    default: {
      addBoxPart(g, cx, cy, 0, W, D, H, '#cbd5e1', 0.26, 0.82, 1.0, 'primary');
      break;
    }
  }

  return g;
}

// ============================================================================
// 4. 초기 공장 배치 프리셋 (CNC + 스테인리스 3D 프린터 + 스테인리스 작업대 + 1F 사무실 용품)
// ============================================================================
const DEFAULT_SCENE_PLACEMENTS = [
  // 중앙 메인 홀 제조 셀 (전면 도어·척·레이저 챔버·HMI 터치스크린이 작업자 통로 +Y 방향을 향하도록 180° 배치)
  { assetId: 'cnc_sealjet_630pro', name: 'CNC_SealJet_630PRO_01', pos: [4500, 9200, 0], rot: [0, 0, 180], scale: [1, 1, 1], materialId: 'SUS_304_306_Brushed_2B' },
  { assetId: 'slm_eos_m290', name: 'EOS_M290_Stainless3DP_01', pos: [7800, 9200, 0], rot: [0, 0, 180], scale: [1, 1, 1], materialId: 'SUS_316L_SLM_3DPrinted_AsBuilt' },
  { assetId: 'argon_filter_station', name: 'Argon_Filter_Unit_01', pos: [9950, 9200, 0], rot: [0, 0, 180], scale: [1, 1, 1], materialId: 'SUS_304_306_Brushed_2B' },
  { assetId: 'slm_trumpf_truprint3000', name: 'TRUMPF_TruPrint3000_SUS314', pos: [12600, 9200, 0], rot: [0, 0, 180], scale: [1, 1, 1], materialId: 'SUS_314_HeatResistant_Wrought' },

  { assetId: 'stainless_worktable_sus316', name: 'SUS316_Worktable_01', pos: [7800, 12100, 0], rot: [0, 0, 0], scale: [1, 1, 1], materialId: 'SUS_316L_Electropolished' },
  { assetId: 'cnc_machine_vise', name: 'CNC_Vise_OnTable_01', pos: [7350, 12100, 860], rot: [0, 0, 0], scale: [1, 1, 1], materialId: 'SUS_304_306_Brushed_2B' },
  { assetId: 'fkm_fpm_seal_set', name: 'FKM_FPM_Viton_Seals_01', pos: [7950, 12100, 860], rot: [0, 0, 0], scale: [1, 1, 1], materialId: 'FKM_FPM_Viton_Black_85A' },
  { assetId: 'pp_seal_billet_set', name: 'PP_Seal_Billets_01', pos: [8450, 12100, 860], rot: [0, 0, 0], scale: [1, 1, 1], materialId: 'PP_Natural_SealGrade' },
  { assetId: 'operator_computer_cart', name: 'CNC_Operator_Cart_01', pos: [5800, 12100, 0], rot: [0, 0, 180], scale: [1, 1, 1], materialId: 'SUS_304_306_Brushed_2B' },
  { assetId: 'stainless_ibc_tank', name: 'SUS316L_IBC_Tank_01', pos: [15800, 9200, 0], rot: [0, 0, 180], scale: [1, 1, 1], materialId: 'SUS_316L_Electropolished' },

  // 1층 사무실 용품 세트 (전면 모니터/프린터/서랍장이 카메라를 향하도록 배치)
  { assetId: 'office_desk_a01', name: 'Office1F_Desk_01', pos: [16200, 3100, 0], rot: [0, 0, 180], scale: [1, 1, 1], materialId: 'SUS_304_306_Brushed_2B' },
  { assetId: 'office_manager_chair', name: 'Office1F_ManagerChair_01', pos: [16200, 4050, 0], rot: [0, 0, 180], scale: [1, 1, 1], materialId: 'FKM_FPM_Viton_Black_85A' },
  { assetId: 'office_pc_workstation_set', name: 'Office1F_CAD_Workstation_01', pos: [16200, 3050, 750], rot: [0, 0, 180], scale: [1, 1, 1], materialId: 'PP_GF30_Structural_Grey' },
  { assetId: 'office_laser_printer', name: 'Office1F_LaserPrinter_01', pos: [14800, 3100, 0], rot: [0, 0, 180], scale: [1, 1, 1], materialId: 'PP_Natural_SealGrade' },
  { assetId: 'office_file_cabinet', name: 'Office1F_FileCabinet_01', pos: [17600, 3100, 0], rot: [0, 0, 180], scale: [1, 1, 1], materialId: 'SUS_304_306_Brushed_2B' }
];

// ============================================================================
// 5. 3D 씬 초기화 (UE5 ACES Filmic + Studio IBL + Reflector + UnrealBloom)
// ============================================================================
function init3D() {
  const container = document.getElementById('viewport-container');
  const canvas = document.getElementById('canvas3d');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b101b);
  scene.fog = new THREE.FogExp2(0x0b101b, 0.000008);

  camera = new THREE.PerspectiveCamera(42, container.clientWidth / container.clientHeight, 60, 300000);
  camera.up.set(0, 0, 1);
  camera.position.set(22000, -16000, 14500);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;

  // Studio HDRI IBL 환경 반사맵 생성 & PBR 텍스처 뱅크 초기화
  initPBRTextures();
  scene.environment = buildIndustrialHDRIEnvironment(renderer);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(10500, 6800, 2200);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.01;

  // TransformControls (Blender / Unreal Engine 3D Gizmo)
  transformControl = new THREE.TransformControls(camera, renderer.domElement);
  transformControl.setSize(0.75);
  transformControl.setTranslationSnap(gridSnapStep);
  transformControl.setRotationSnap(THREE.MathUtils.degToRad(rotSnapStepDeg));
  if (transformControl._plane) {
    transformControl._plane.visible = false;
    if (transformControl._plane.material) transformControl._plane.material.opacity = 0;
  }
  transformControl.addEventListener('dragging-changed', (event) => {
    controls.enabled = !event.value;
    if (!event.value && selectedObject) {
      pushUndoState();
      syncInspectorFromSelected();
    }
  });
  transformControl.addEventListener('change', () => {
    if (selectedObject) {
      if (selectBoxHelper) selectBoxHelper.update();
      syncInspectorFromSelected();
    }
  });
  scene.add(transformControl);

  // =========================================================================
  // 물리 기반 다중 조명 시스템 (Hemisphere + Sun Shadow + 실내 High-Bay 포인트 광원)
  // =========================================================================
  const hemiLight = new THREE.HemisphereLight(0xcbd5e1, 0x0f172a, 0.45);
  hemiLight.position.set(12000, 8000, 30000);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfffbeb, 0.92);
  dirLight.position.set(18000, -14000, 28000);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.bias = -0.0004;
  dirLight.shadow.camera.near = 1000;
  dirLight.shadow.camera.far = 85000;
  const d = 24000;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  scene.add(dirLight);

  // 실내 천장 하이베이(High-Bay) 물리 조명군 & 제조셀/사무실 집중 키라이트
  highBayLightsGroup = new THREE.Group();
  const cellLight1 = new THREE.PointLight(0xe0f2fe, 0.85, 16000, 1.6);
  cellLight1.position.set(6000, 10500, 5200);
  cellLight1.castShadow = true;
  highBayLightsGroup.add(cellLight1);

  const cellLight2 = new THREE.PointLight(0xe0f2fe, 0.80, 16000, 1.6);
  cellLight2.position.set(12500, 10500, 5200);
  highBayLightsGroup.add(cellLight2);

  const officeLight = new THREE.PointLight(0xffedd5, 0.78, 11000, 1.5);
  officeLight.position.set(16200, 3200, 2950);
  highBayLightsGroup.add(officeLight);

  const loungeLight = new THREE.PointLight(0xfef3c7, 0.72, 11000, 1.5);
  loungeLight.position.set(4500, 3500, 2950);
  highBayLightsGroup.add(loungeLight);

  scene.add(highBayLightsGroup);

  // =========================================================================
  // 에폭시 콘크리트 바닥 실시간 평면 반사판 (THREE.Reflector)
  // =========================================================================
  if (THREE.Reflector) {
    const reflGeo = new THREE.PlaneGeometry(24000, 16000);
    floorReflector = new THREE.Reflector(reflGeo, {
      clipBias: 0.003,
      textureWidth: 1024,
      textureHeight: 1024,
      color: 0x161f2c
    });
    floorReflector.position.set(12000, 8000, -4);
    scene.add(floorReflector);
  }

  // 서브틀 바닥 편집 그리드 (실사감을 해치지 않도록 투명도 낮춤)
  gridHelper = new THREE.GridHelper(32000, 32, 0x38bdf8, 0x1e293b);
  gridHelper.rotation.x = Math.PI / 2;
  gridHelper.position.set(12000, 8000, 3);
  if (gridHelper.material) {
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.18;
  }
  scene.add(gridHelper);

  const planeGeo = new THREE.PlaneGeometry(80000, 80000);
  const planeMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  floorHitPlane = new THREE.Mesh(planeGeo, planeMat);
  floorHitPlane.position.set(12000, 8000, 0);
  scene.add(floorHitPlane);

  placedAssetsGroup = new THREE.Group();
  placedAssetsGroup.name = 'Placed_Digital_Twin_Assets';
  scene.add(placedAssetsGroup);

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // UI 초기화
  renderAssetDrawer('ALL');
  renderMaterialStudio();
  setupInteractions(container);

  loadPrecisionModel();
  loadGaussianSplats();
  loadInitialSceneLayout();

  window.addEventListener('resize', onWindowResize);
  animate();

  log('[UE5 PBR ENGINE] Studio HDRI IBL + Real SimReady ORM Maps + Epoxy Floor SSR + ACES Filmic + UnrealBloom 활성화.');
}

// ============================================================================
// 6. 에셋 브라우저 렌더링 & 드래그 앤 드롭 배치
// ============================================================================
let currentCategoryFilter = 'ALL';
let currentSearchQuery = '';

function renderAssetDrawer(category = 'ALL', btnEl = null) {
  currentCategoryFilter = category;
  if (btnEl) {
    document.querySelectorAll('.drawer-tab').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
  }

  const container = document.getElementById('asset-grid-container');
  container.innerHTML = '';

  const filtered = ASSET_CATALOG.filter(a => {
    const matchCat = category === 'ALL' || a.category === category;
    const q = currentSearchQuery.trim().toLowerCase();
    const matchQ = !q || a.title.toLowerCase().includes(q) || a.sub.toLowerCase().includes(q) || a.badge.toLowerCase().includes(q);
    return matchCat && matchQ;
  });

  filtered.forEach(asset => {
    const card = document.createElement('div');
    card.className = 'asset-card';
    card.draggable = true;
    card.innerHTML = `
      <div>
        <div class="asset-icon-row">
          <span class="asset-icon">${asset.icon}</span>
          <span class="asset-badge">${asset.badge}</span>
        </div>
        <div class="asset-title">${asset.title}</div>
        <div class="asset-sub">${asset.sub}</div>
      </div>
      <div class="asset-dim">
        <span>${asset.dims[0]}×${asset.dims[1]}×${asset.dims[2]}</span>
        <span style="color:#58a6ff;">+드래그/클릭</span>
      </div>
    `;

    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', asset.assetId);
      startDraggingAsset(asset);
    });
    card.addEventListener('dragend', () => {
      stopDraggingAsset();
    });

    card.addEventListener('click', () => {
      const targetPos = [
        Math.round(controls.target.x / gridSnapStep) * gridSnapStep,
        Math.round(controls.target.y / gridSnapStep) * gridSnapStep,
        0
      ];
      spawnAssetInstance(asset.assetId, null, targetPos, [0, 0, 0], [1, 1, 1], asset.defaultMaterial, true);
    });

    container.appendChild(card);
  });
}

function filterAssetDrawer(category, btnEl) {
  renderAssetDrawer(category, btnEl);
}

function onSearchAssets(val) {
  currentSearchQuery = val;
  renderAssetDrawer(currentCategoryFilter);
}

function toggleDrawerCollapse() {
  const drawer = document.getElementById('asset-drawer');
  const btn = document.getElementById('btn-drawer-toggle');
  drawer.classList.toggle('collapsed');
  btn.innerText = drawer.classList.contains('collapsed') ? '▲ 에셋창 펼치기' : '▼ 접기';
  setTimeout(onWindowResize, 220);
}

function startDraggingAsset(assetDef) {
  draggingAssetDef = assetDef;
  document.getElementById('drop-banner').style.display = 'block';

  if (ghostPreviewGroup) scene.remove(ghostPreviewGroup);
  ghostPreviewGroup = buildAssetMeshGroup(assetDef);
  ghostPreviewGroup.traverse(c => {
    if (c.isMesh) {
      c.material = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.48,
        roughness: 0.2
      });
    }
  });
  ghostPreviewGroup.visible = false;
  scene.add(ghostPreviewGroup);
}

function stopDraggingAsset() {
  draggingAssetDef = null;
  document.getElementById('drop-banner').style.display = 'none';
  if (ghostPreviewGroup) {
    scene.remove(ghostPreviewGroup);
    ghostPreviewGroup = null;
  }
}

function computeDropPointFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const surfaceTargets = [floorHitPlane];
  placedObjects.forEach(obj => {
    if (obj !== selectedObject) surfaceTargets.push(obj);
  });
  if (factoryMeshGroup) {
    factoryMeshGroup.traverse(c => {
      if (c.isMesh && (c.name.includes('Floor') || c.name.includes('Mezzanine_Slab'))) {
        surfaceTargets.push(c);
      }
    });
  }

  const hits = raycaster.intersectObjects(surfaceTargets, true);
  if (hits.length > 0) {
    const p = hits[0].point;
    const sx = isGridSnap ? Math.round(p.x / gridSnapStep) * gridSnapStep : Math.round(p.x);
    const sy = isGridSnap ? Math.round(p.y / gridSnapStep) * gridSnapStep : Math.round(p.y);
    const sz = Math.max(0, Math.round(p.z / 10) * 10);
    return [sx, sy, sz];
  }
  return [12000, 8000, 0];
}

// ============================================================================
// 7. 에셋 스폰, 선택, 복제, 삭제, 실행취소(Undo) 및 메테리얼 적용
// ============================================================================
let instanceCounter = 1;

function spawnAssetInstance(assetId, customName = null, pos = [10000, 7000, 0], rotDeg = [0, 0, 0], scale = [1, 1, 1], materialId = null, selectNow = true) {
  const assetDef = ASSET_CATALOG.find(a => a.assetId === assetId);
  if (!assetDef) return null;

  const group = buildAssetMeshGroup(assetDef);
  const instName = customName || `${assetDef.assetId}_${String(instanceCounter++).padStart(2, '0')}`;
  group.name = instName;
  group.position.set(pos[0], pos[1], pos[2]);
  group.rotation.set(
    THREE.MathUtils.degToRad(rotDeg[0]),
    THREE.MathUtils.degToRad(rotDeg[1]),
    THREE.MathUtils.degToRad(rotDeg[2])
  );
  group.scale.set(scale[0], scale[1], scale[2]);

  const matKey = materialId || assetDef.defaultMaterial || 'SUS_304_306_Brushed_2B';
  group.userData = {
    isEditableAsset: true,
    instanceId: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    assetId: assetDef.assetId,
    title: assetDef.title,
    baseDims: [...assetDef.dims],
    materialId: matKey,
    usdPath: assetDef.usdPath
  };

  applyIndustrialMaterialToGroup(group, matKey, false);

  placedAssetsGroup.add(group);
  placedObjects.push(group);

  updateOutlinerUI();
  if (selectNow) {
    pushUndoState();
    selectAssetObject(group);
    log(`[SPAWN] '${instName}' (${assetDef.title}) 배치 완료 @ (${pos[0]}, ${pos[1]}, ${pos[2]}) mm`);
  }
  return group;
}

function selectAssetObject(obj) {
  selectedObject = obj;
  if (selectBoxHelper) {
    scene.remove(selectBoxHelper);
    selectBoxHelper = null;
  }

  if (obj) {
    transformControl.attach(obj);
    selectBoxHelper = new THREE.BoxHelper(obj, 0xf59e0b); // Unreal Engine 스타일 오렌지 골드 선택 박스
    scene.add(selectBoxHelper);
    document.getElementById('sel-obj-badge').innerText = obj.name;
    syncInspectorFromSelected();
    highlightSelectedMaterialSwatch(obj.userData.materialId);
  } else {
    transformControl.detach();
    document.getElementById('sel-obj-badge').innerText = '선택 없음';
    document.getElementById('sel-bbox-dim').innerText = '- × - × - mm';
    document.getElementById('val-selected-mass').innerText = '- kg';
  }
  updateOutlinerUI();
}

function syncInspectorFromSelected() {
  if (!selectedObject) return;
  const p = selectedObject.position;
  const r = selectedObject.rotation;
  const s = selectedObject.scale;

  document.getElementById('inp-pos-x').value = Math.round(p.x);
  document.getElementById('inp-pos-y').value = Math.round(p.y);
  document.getElementById('inp-pos-z').value = Math.round(p.z);

  document.getElementById('inp-rot-x').value = Math.round(THREE.MathUtils.radToDeg(r.x));
  document.getElementById('inp-rot-y').value = Math.round(THREE.MathUtils.radToDeg(r.y));
  document.getElementById('inp-rot-z').value = Math.round(THREE.MathUtils.radToDeg(r.z));

  document.getElementById('inp-scl-x').value = Number(s.x.toFixed(2));
  document.getElementById('inp-scl-y').value = Number(s.y.toFixed(2));
  document.getElementById('inp-scl-z').value = Number(s.z.toFixed(2));

  const baseDims = selectedObject.userData.baseDims || [1000, 1000, 1000];
  const wx = Math.round(baseDims[0] * s.x);
  const wy = Math.round(baseDims[1] * s.y);
  const wz = Math.round(baseDims[2] * s.z);
  document.getElementById('sel-bbox-dim').innerText = `${wx.toLocaleString()} × ${wy.toLocaleString()} × ${wz.toLocaleString()} mm`;

  const matSpec = INDUSTRIAL_MATERIALS[selectedObject.userData.materialId] || INDUSTRIAL_MATERIALS.SUS_304_306_Brushed_2B;
  const volM3 = (wx / 1000) * (wy / 1000) * (wz / 1000) * 0.28;
  const massKg = (volM3 * matSpec.densityKgM3).toFixed(1);
  document.getElementById('val-selected-mass').innerText = `${Number(massKg).toLocaleString()} kg`;
}

function applyNumericTransform() {
  if (!selectedObject) return;
  pushUndoState();
  const px = parseFloat(document.getElementById('inp-pos-x').value) || 0;
  const py = parseFloat(document.getElementById('inp-pos-y').value) || 0;
  const pz = parseFloat(document.getElementById('inp-pos-z').value) || 0;

  const rx = parseFloat(document.getElementById('inp-rot-x').value) || 0;
  const ry = parseFloat(document.getElementById('inp-rot-y').value) || 0;
  const rz = parseFloat(document.getElementById('inp-rot-z').value) || 0;

  const sx = Math.max(0.05, parseFloat(document.getElementById('inp-scl-x').value) || 1);
  const sy = Math.max(0.05, parseFloat(document.getElementById('inp-scl-y').value) || 1);
  const sz = Math.max(0.05, parseFloat(document.getElementById('inp-scl-z').value) || 1);

  selectedObject.position.set(px, py, pz);
  selectedObject.rotation.set(
    THREE.MathUtils.degToRad(rx),
    THREE.MathUtils.degToRad(ry),
    THREE.MathUtils.degToRad(rz)
  );
  selectedObject.scale.set(sx, sy, sz);
  if (selectBoxHelper) selectBoxHelper.update();
  syncInspectorFromSelected();
}

function scaleSelectedUniform(factor) {
  if (!selectedObject) return;
  pushUndoState();
  selectedObject.scale.multiplyScalar(factor);
  if (selectBoxHelper) selectBoxHelper.update();
  syncInspectorFromSelected();
  log(`[SCALE] '${selectedObject.name}' 크기 조절: ×${factor}`);
}

function resetSelectedTransform() {
  if (!selectedObject) return;
  pushUndoState();
  selectedObject.scale.set(1, 1, 1);
  selectedObject.rotation.set(0, 0, 0);
  if (selectBoxHelper) selectBoxHelper.update();
  syncInspectorFromSelected();
}

function snapSelectedToFloor() {
  if (!selectedObject) return;
  pushUndoState();
  selectedObject.position.z = 0;
  if (selectBoxHelper) selectBoxHelper.update();
  syncInspectorFromSelected();
  log(`[SNAP] '${selectedObject.name}' 바닥면(Z=0mm) 밀착 완료`);
}

function duplicateSelected() {
  if (!selectedObject) return;
  const u = selectedObject.userData;
  const p = selectedObject.position;
  const r = selectedObject.rotation;
  const s = selectedObject.scale;
  spawnAssetInstance(
    u.assetId,
    null,
    [p.x + 600, p.y + 600, p.z],
    [THREE.MathUtils.radToDeg(r.x), THREE.MathUtils.radToDeg(r.y), THREE.MathUtils.radToDeg(r.z)],
    [s.x, s.y, s.z],
    u.materialId,
    true
  );
}

function deleteSelected() {
  if (!selectedObject) return;
  pushUndoState();
  const name = selectedObject.name;
  transformControl.detach();
  if (selectBoxHelper) {
    scene.remove(selectBoxHelper);
    selectBoxHelper = null;
  }
  placedAssetsGroup.remove(selectedObject);
  const idx = placedObjects.indexOf(selectedObject);
  if (idx !== -1) placedObjects.splice(idx, 1);
  selectedObject = null;
  selectAssetObject(null);
  log(`[DELETE] '${name}' 에셋 삭제 완료`);
}

function focusSelected() {
  if (!selectedObject) return;
  const p = selectedObject.position;
  controls.target.set(p.x, p.y, p.z + 600);
  camera.position.set(p.x + 3800, p.y - 3800, p.z + 2600);
  controls.update();
  log(`[FOCUS] '${selectedObject.name}' 포커스 이동`);
}

function setTransformMode(mode) {
  transformControl.setMode(mode);
  document.getElementById('btn-mode-translate').classList.toggle('active', mode === 'translate');
  document.getElementById('btn-mode-rotate').classList.toggle('active', mode === 'rotate');
  document.getElementById('btn-mode-scale').classList.toggle('active', mode === 'scale');
}

function toggleTransformSpace() {
  const next = transformControl.space === 'world' ? 'local' : 'world';
  transformControl.setSpace(next);
  document.getElementById('btn-space-toggle').innerText = next === 'world' ? '🌐 World' : '📦 Local';
}

function toggleGridSnap() {
  isGridSnap = !isGridSnap;
  const btn = document.getElementById('btn-snap-toggle');
  btn.classList.toggle('active', isGridSnap);
  btn.innerText = isGridSnap ? '🧲 그리드 스냅 ON' : '🧲 그리드 스냅 OFF';
  updateSnapSettings();
}

function updateSnapSettings() {
  gridSnapStep = parseInt(document.getElementById('sel-grid-snap').value, 10) || 100;
  rotSnapStepDeg = parseInt(document.getElementById('sel-rot-snap').value, 10) || 15;
  transformControl.setTranslationSnap(isGridSnap ? gridSnapStep : null);
  transformControl.setRotationSnap(isGridSnap ? THREE.MathUtils.degToRad(rotSnapStepDeg) : null);
}

// ============================================================================
// 8. 엔지니어링 메테리얼 스튜디오 (실제 NVIDIA SimReady 노멀/ORM 텍스처 연동)
// ============================================================================
function renderMaterialStudio() {
  const container = document.getElementById('material-swatch-grid');
  container.innerHTML = '';

  Object.values(INDUSTRIAL_MATERIALS).forEach(mat => {
    const btn = document.createElement('button');
    btn.className = 'mat-swatch-btn';
    btn.dataset.matId = mat.id;
    btn.innerHTML = `
      <span class="swatch-sphere" style="background:${mat.colorHex};"></span>
      <div>
        <div class="mat-info-title">${mat.name}</div>
        <div class="mat-info-sub">${mat.sub}</div>
      </div>
    `;
    btn.onclick = () => {
      if (selectedObject) {
        pushUndoState();
        applyIndustrialMaterialToGroup(selectedObject, mat.id, true);
        syncInspectorFromSelected();
      }
      highlightSelectedMaterialSwatch(mat.id);
    };
    container.appendChild(btn);
  });
}

function applyIndustrialMaterialToGroup(group, matId, logChange = true) {
  const matSpec = INDUSTRIAL_MATERIALS[matId];
  if (!matSpec) return;
  group.userData.materialId = matId;

  group.traverse(child => {
    if (child.isMesh && child.userData.partTag === 'primary') {
      child.material.color.set(matSpec.colorHex);
      child.material.roughness = matSpec.roughness;
      child.material.metalness = matSpec.metalness;
      child.material.clearcoat = matSpec.clearcoat || 0.2;
      child.material.clearcoatRoughness = matSpec.clearcoatRoughness || 0.25;
      child.material.transparent = matSpec.opacity < 1.0;
      child.material.opacity = matSpec.opacity;

      // 소재 유형별 NVIDIA SimReady / Procedural 노멀 & 거칠기 맵 연결
      if (matSpec.texType === 'brushed_steel') {
        child.material.normalMap = pbrTextures.steelNormal || pbrTextures.brushedNormal;
        child.material.roughnessMap = pbrTextures.steelORM || null;
        child.material.normalScale = new THREE.Vector2(0.25, 0.25);
      } else if (matSpec.texType === 'slm_steel') {
        child.material.normalMap = pbrTextures.roughMetalNormal || pbrTextures.brushedNormal;
        child.material.roughnessMap = pbrTextures.roughMetalORM || null;
        child.material.normalScale = new THREE.Vector2(0.42, 0.42);
      } else if (matSpec.texType === 'mirror_steel') {
        child.material.normalMap = pbrTextures.chromeNormal || null;
        child.material.roughnessMap = null;
        child.material.normalScale = new THREE.Vector2(0.05, 0.05);
      } else if (matSpec.texType === 'rubber') {
        child.material.normalMap = pbrTextures.rubberNormal || null;
        child.material.roughnessMap = pbrTextures.rubberORM || null;
        child.material.normalScale = new THREE.Vector2(0.35, 0.35);
      }
      child.material.needsUpdate = true;
    }
  });

  if (logChange) {
    log(`[MATERIAL] '${group.name}' -> [${matSpec.name}] OmniPBR 셰이더 적용 (밀도 ${matSpec.densityKgM3} kg/m³)`);
  }
}

function highlightSelectedMaterialSwatch(matId) {
  document.querySelectorAll('.mat-swatch-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.matId === matId);
  });
  const m = INDUSTRIAL_MATERIALS[matId];
  if (m) {
    document.getElementById('mat-physics-readout').innerHTML = `
      <b style="color:#58a6ff;">[${m.name}]</b> (${m.sub})<br>
      • 경도/탄성: <b>${m.hardness}</b> | 내열 온도: <b>${m.tempRange}</b><br>
      • 광학/굴절률: <b>${m.ior}</b> | 마찰계수: <b>${m.friction}</b>
    `;
  }
}

// ============================================================================
// 9. 아웃라이너, Undo/Redo, 레이아웃 서버 동기화 저장
// ============================================================================
function updateOutlinerUI() {
  const list = document.getElementById('outliner-list');
  list.innerHTML = '';
  document.getElementById('placed-count-badge').innerText = `${placedObjects.length} EA`;
  document.getElementById('val-body-count').innerText = `226 + ${placedObjects.length} EA`;

  placedObjects.forEach(obj => {
    const row = document.createElement('div');
    row.className = 'outliner-item' + (obj === selectedObject ? ' selected' : '');
    row.innerHTML = `
      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        ${obj.visible ? '🟢' : '⚫'} <b>${obj.name}</b> <span style="color:#8b949e; font-size:10px;">(${obj.userData.materialId})</span>
      </span>
      <div class="outliner-actions">
        <button class="icon-btn" title="표시/숨김">👁️</button>
        <button class="icon-btn" title="포커스">🎯</button>
      </div>
    `;
    row.onclick = (e) => {
      if (e.target.tagName === 'BUTTON') return;
      selectAssetObject(obj);
    };
    const btns = row.querySelectorAll('.icon-btn');
    btns[0].onclick = () => {
      obj.visible = !obj.visible;
      updateOutlinerUI();
    };
    btns[1].onclick = () => {
      selectAssetObject(obj);
      focusSelected();
    };
    list.appendChild(row);
  });
}

function serializeCurrentScene() {
  return placedObjects.map(o => ({
    assetId: o.userData.assetId,
    name: o.name,
    pos: [Math.round(o.position.x), Math.round(o.position.y), Math.round(o.position.z)],
    rot: [
      Math.round(THREE.MathUtils.radToDeg(o.rotation.x)),
      Math.round(THREE.MathUtils.radToDeg(o.rotation.y)),
      Math.round(THREE.MathUtils.radToDeg(o.rotation.z))
    ],
    scale: [Number(o.scale.x.toFixed(3)), Number(o.scale.y.toFixed(3)), Number(o.scale.z.toFixed(3))],
    materialId: o.userData.materialId,
    usdPath: o.userData.usdPath
  }));
}

function pushUndoState() {
  undoStack.push(JSON.stringify(serializeCurrentScene()));
  if (undoStack.length > 25) undoStack.shift();
}

function undoLastAction() {
  if (undoStack.length === 0) {
    log('[UNDO] 더 이상 실행 취소할 이력이 없습니다.');
    return;
  }
  const prev = JSON.parse(undoStack.pop());
  rebuildPlacedAssetsFromList(prev);
  log('[UNDO] 이전 배치 상태로 복원되었습니다.');
}

function rebuildPlacedAssetsFromList(list) {
  selectAssetObject(null);
  while (placedAssetsGroup.children.length > 0) {
    placedAssetsGroup.remove(placedAssetsGroup.children[0]);
  }
  placedObjects.length = 0;
  instanceCounter = 1;
  list.forEach(item => {
    spawnAssetInstance(item.assetId, item.name, item.pos, item.rot, item.scale || [1, 1, 1], item.materialId, false);
  });
  updateOutlinerUI();
}

function loadInitialSceneLayout() {
  fetch('/api/layout')
    .then(r => r.json())
    .then(data => {
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        rebuildPlacedAssetsFromList(data.items);
        log(`[LAYOUT] 저장된 씬 레이아웃(${data.items.length}개 에셋) 로드 완료.`);
      } else {
        rebuildPlacedAssetsFromList(DEFAULT_SCENE_PLACEMENTS);
        log(`[LAYOUT] 기본 제조 셀(CNC/3D프린터/스테인리스 작업대) 및 1층 사무실 에셋 15종 자동 배치 완료.`);
      }
      const params = new URLSearchParams(window.location.search);
      const urlView = params.get('view') || 'cnc_cell';
      const urlMode = params.get('mode');
      setView(urlView);
      if (urlMode) setTransformMode(urlMode);
      if (placedObjects.length > 0) {
        if (urlView === 'office') {
          const desk = placedObjects.find(o => o.name.includes('Office1F_Desk')) || placedObjects[0];
          selectAssetObject(desk);
        } else {
          selectAssetObject(placedObjects[0]);
        }
      }
    })
    .catch(() => {
      rebuildPlacedAssetsFromList(DEFAULT_SCENE_PLACEMENTS);
    });
}

function saveSceneLayoutToServer() {
  const payload = {
    updatedAt: new Date().toISOString(),
    coordinateSystem: 'Right-Handed Z-Up (mm)',
    items: serializeCurrentScene()
  };
  fetch('/api/layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        log(`[SAVED] 총 ${res.count}개 에셋의 공간 배치 및 메테리얼이 서버(scene_layout.json)에 저장되었습니다.`);
        const badge = document.getElementById('solver-badge');
        badge.innerText = 'SYNC SAVED ✓';
      }
    })
    .catch(err => log('[ERROR] 저장 실패: ' + err));
}

function exportSceneJSON() {
  const payload = {
    updatedAt: new Date().toISOString(),
    items: serializeCurrentScene()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sugarhill_digital_twin_layout.json';
  a.click();
  log('[EXPORT] sugarhill_digital_twin_layout.json 다운로드 완료.');
}

// ============================================================================
// 10. 키보드(WASD 이동 + G/R/T 기즈모) 및 마우스 레이캐스트 인터랙션
// ============================================================================
function setupInteractions(container) {
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (draggingAssetDef && ghostPreviewGroup) {
      const pt = computeDropPointFromEvent(e);
      ghostPreviewGroup.position.set(pt[0], pt[1], pt[2]);
      ghostPreviewGroup.visible = true;
    }
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const assetId = e.dataTransfer.getData('text/plain') || (draggingAssetDef && draggingAssetDef.assetId);
    if (assetId) {
      const pt = computeDropPointFromEvent(e);
      const def = ASSET_CATALOG.find(a => a.assetId === assetId);
      spawnAssetInstance(assetId, null, pt, [0, 0, 0], [1, 1, 1], def ? def.defaultMaterial : null, true);
    }
    stopDraggingAsset();
  });

  let downPos = { x: 0, y: 0 };
  container.addEventListener('pointerdown', (e) => {
    downPos = { x: e.clientX, y: e.clientY };
  });

  container.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    if (dist > 5) return;

    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const hits = raycaster.intersectObjects(placedAssetsGroup.children, true);
    if (hits.length > 0) {
      let curr = hits[0].object;
      while (curr && curr.parent !== placedAssetsGroup) {
        curr = curr.parent;
      }
      if (curr && curr.userData && curr.userData.isEditableAsset) {
        selectAssetObject(curr);
        return;
      }
    }
  });

  container.addEventListener('mousemove', onMouseMove);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    if (e.code in moveKeys) {
      moveKeys[e.code] = true;
    }

    if (e.ctrlKey && e.code === 'KeyZ') {
      e.preventDefault();
      undoLastAction();
      return;
    }
    if (e.shiftKey && e.code === 'KeyD') {
      e.preventDefault();
      duplicateSelected();
      return;
    }

    switch (e.code) {
      case 'KeyG':
      case 'Digit1':
        setTransformMode('translate');
        break;
      case 'KeyR':
      case 'Digit2':
        setTransformMode('rotate');
        break;
      case 'KeyT':
      case 'Digit3':
        setTransformMode('scale');
        break;
      case 'KeyF':
        focusSelected();
        break;
      case 'End':
        snapSelectedToFloor();
        break;
      case 'Delete':
      case 'Backspace':
        deleteSelected();
        break;
      case 'Escape':
        stopDraggingAsset();
        selectAssetObject(null);
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code in moveKeys) {
      moveKeys[e.code] = false;
    }
  });
}

function updateWASDCameraMovement(dt) {
  const isMoving = moveKeys.KeyW || moveKeys.KeyA || moveKeys.KeyS || moveKeys.KeyD || moveKeys.KeyQ || moveKeys.KeyE;
  if (!isMoving) return;

  const mult = (moveKeys.ShiftLeft || moveKeys.ShiftRight) ? 3.0 : 1.0;
  const speed = 7500 * mult * dt;
  document.getElementById('hud-speed').innerText = `${mult.toFixed(1)}x`;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.z = 0;
  if (forward.lengthSq() > 0.0001) forward.normalize();

  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 0, 1)).normalize();
  const delta = new THREE.Vector3();

  if (moveKeys.KeyW) delta.addScaledVector(forward, speed);
  if (moveKeys.KeyS) delta.addScaledVector(forward, -speed);
  if (moveKeys.KeyD) delta.addScaledVector(right, speed);
  if (moveKeys.KeyA) delta.addScaledVector(right, -speed);
  if (moveKeys.KeyE) delta.z += speed * 0.75;
  if (moveKeys.KeyQ) delta.z -= speed * 0.75;

  camera.position.add(delta);
  controls.target.add(delta);
  if (camera.position.z < 250) camera.position.z = 250;
}

// ============================================================================
// 11. 클린 건축 쉘(factory_precision.obj) 로드 — 실사 PBR 재질 & 바닥 SSR 적용
// ============================================================================
function loadPrecisionModel() {
  const loader = new THREE.OBJLoader();
  loader.load('/model.obj', (obj) => {
    if (factoryMeshGroup) scene.remove(factoryMeshGroup);
    factoryMeshGroup = obj;

    obj.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const name = child.name || '';
        meshesByName[name] = child;

        // 모든 B-Rep 메쉬에 월드 스케일 기반 UV/UV2 자동 생성
        const isFloor = name.includes('Floor_Slab');
        ensureWorldBoxUVs(child.geometry, isFloor ? 2500 : 1800);

        const isCladding = name.includes('Wall_South') || name.includes('Wall_North') || name.includes('Wall_East') || name.includes('Wall_West') || name.includes('Roof_Gable_Cladding');
        const isDarkBrownSteel = name.includes('Col_') || name.includes('HBeam') || name.includes('Roof_Gable_Rafter') || name.includes('Roof_Purlin') || name.includes('Girt_') || name.includes('Mezzanine_Beam') || name.includes('Mezzanine_Post');

        if (isDarkBrownSteel) {
          child.material = new THREE.MeshPhysicalMaterial({
            color: 0x432a23,
            roughness: 0.34,
            metalness: 0.78,
            clearcoat: 0.25,
            envMapIntensity: 0.85,
            normalMap: pbrTextures.roughMetalNormal || null,
            normalScale: new THREE.Vector2(0.25, 0.25)
          });
        } else if (isFloor) {
          // 폴리싱 에폭시 콘크리트 바닥 (하단 Reflector 반사 투과 + 웨더링 Albedo/Roughness)
          child.material = new THREE.MeshPhysicalMaterial({
            color: 0x475569,
            map: pbrTextures.epoxyFloorAlbedo || null,
            roughnessMap: pbrTextures.epoxyFloorRoughness || null,
            roughness: 0.28,
            metalness: 0.06,
            clearcoat: 0.85,
            clearcoatRoughness: 0.16,
            envMapIntensity: 0.45,
            transparent: isFloorReflective,
            opacity: isFloorReflective ? 0.86 : 1.0
          });
        } else if (name.includes('Joint_')) {
          child.material = new THREE.MeshStandardMaterial({ color: 0x1e2530, roughness: 0.6, metalness: 0.2, envMapIntensity: 0.25 });
        } else if (name.includes('SafetyLine_') || name.includes('Notice_Board_Yellow')) {
          child.material = new THREE.MeshPhysicalMaterial({
            color: 0xeab308,
            roughness: 0.24,
            metalness: 0.08,
            clearcoat: 0.5,
            envMapIntensity: 0.35,
            emissive: 0x1f1600
          });
        } else if (name.includes('Floor_Stop_Decal_Red') || name.includes('Exit_Sign_') || name.includes('Fire_Extinguisher_') || name.includes('FirstAid_')) {
          child.material = new THREE.MeshPhysicalMaterial({
            color: 0xdc2626,
            roughness: 0.25,
            metalness: 0.2,
            clearcoat: 0.5,
            envMapIntensity: 0.35,
            emissive: name.includes('Exit_Sign_') ? 0xdc2626 : 0x1a0303,
            emissiveIntensity: name.includes('Exit_Sign_') ? 0.9 : 0.2
          });
        } else if (
          name.includes('Stair_WhiteWall_') || name.includes('Mezz_Upper_Wall_') || name.includes('Restroom_Box_') ||
          name.includes('Restroom_Toilet_White') || name.includes('Restroom_Sink_White') || name.includes('Office_Enclosed_Wall_') ||
          name.includes('LinerPanel_') || name.includes('Exit_Door_') || name.includes('Door_Sectional_BottomWhite') || name.includes('Lounge_Table_WhiteTop')
        ) {
          child.material = new THREE.MeshPhysicalMaterial({
            color: 0xdbe2ea,
            roughness: 0.38,
            metalness: 0.06,
            clearcoat: 0.15,
            envMapIntensity: 0.25,
            normalMap: name.includes('LinerPanel_') ? pbrTextures.corrugatedNormal : null,
            normalScale: new THREE.Vector2(0.22, 0.22)
          });
        } else if (name.includes('Stair_Black') || name.includes('Mezz_Joist_Black_') || name.includes('Door_Sectional_HoistMotor_Black') || name.includes('Entry_Floor_Mat_Dark')) {
          child.material = new THREE.MeshPhysicalMaterial({ color: 0x18202c, roughness: 0.30, metalness: 0.72, clearcoat: 0.2, envMapIntensity: 0.65 });
        } else if (name.includes('Lounge_Booth1_Orange') || name.includes('Lounge_Booth2_Orange')) {
          child.material = new THREE.MeshPhysicalMaterial({ color: 0xd9460f, roughness: 0.42, metalness: 0.05, clearcoat: 0.25, envMapIntensity: 0.3 });
        } else if (name.includes('Lounge_Booth1_GreyShell') || name.includes('Lounge_Booth2_GreyShell') || name.includes('Office_Cubicle_')) {
          child.material = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.72, metalness: 0.05, envMapIntensity: 0.25 });
        } else if (name.includes('Plywood_') || name.includes('Wood_Guardrail_')) {
          child.material = new THREE.MeshPhysicalMaterial({
            color: 0xc28e5c,
            map: pbrTextures.woodAlbedo || null,
            roughness: 0.42,
            metalness: 0.05,
            clearcoat: 0.3,
            envMapIntensity: 0.3
          });
        } else if (name.includes('Office_Door_Brown')) {
          child.material = new THREE.MeshPhysicalMaterial({
            color: 0x6e4d36,
            map: pbrTextures.woodAlbedo || null,
            roughness: 0.38,
            metalness: 0.1,
            clearcoat: 0.35,
            envMapIntensity: 0.3
          });
        } else if (name.includes('Cage_Mesh_') || name.includes('Cage_Gate_Door')) {
          child.material = new THREE.MeshPhysicalMaterial({ color: 0x94a3b8, roughness: 0.22, metalness: 0.85, transparent: true, opacity: 0.32, envMapIntensity: 0.6 });
        } else if (name.includes('Window_Frame_') || name.includes('Main_Glass_Entry_')) {
          child.material = new THREE.MeshPhysicalMaterial({ color: 0x7dd3fc, roughness: 0.06, metalness: 0.2, clearcoat: 1.0, transparent: true, opacity: 0.42, envMapIntensity: 0.9 });
        } else if (name.includes('Door_Rollup_') || name.includes('Door_Sectional_')) {
          child.material = new THREE.MeshPhysicalMaterial({
            color: 0xcbd5e1,
            roughness: 0.28,
            metalness: 0.78,
            clearcoat: 0.25,
            envMapIntensity: 0.65,
            normalMap: pbrTextures.corrugatedNormal || null,
            normalScale: new THREE.Vector2(0.28, 0.28)
          });
        } else if (name.includes('Shutter_Fan_') || name.includes('WallVent_')) {
          child.material = new THREE.MeshPhysicalMaterial({ color: 0x334155, roughness: 0.28, metalness: 0.82, envMapIntensity: 0.65 });
        } else if (name.includes('Ceiling_Gas_UnitHeater') || name.includes('WaterFountain_')) {
          child.material = new THREE.MeshPhysicalMaterial({ color: 0xcbd5e1, roughness: 0.20, metalness: 0.90, envMapIntensity: 0.75 });
        } else if (name.includes('HighBay_LED_')) {
          child.material = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xbae6fd,
            emissiveIntensity: 1.4,
            roughness: 0.1,
            metalness: 0.1
          });
        } else if (isCladding) {
          child.material = new THREE.MeshPhysicalMaterial({
            color: name.includes('Roof_Gable_Cladding') ? 0x334155 : 0x94a3b8,
            roughness: 0.38,
            metalness: 0.52,
            envMapIntensity: 0.45,
            normalMap: pbrTextures.corrugatedNormal || null,
            normalScale: new THREE.Vector2(0.32, 0.32),
            transparent: isXRay,
            opacity: isXRay ? 0.15 : 1.0,
            depthWrite: !isXRay
          });
        } else {
          child.material = new THREE.MeshPhysicalMaterial({ color: 0x64748b, roughness: 0.34, metalness: 0.60, envMapIntensity: 0.45 });
        }

        // 미세 구조 심(Micro-Seam) 라인 (기본 0.16 투명도, CAD 외곽선 ON 시 0.7)
        const edgesGeo = new THREE.EdgesGeometry(child.geometry, 24);
        const edgeMat = new THREE.LineBasicMaterial({
          color: 0x090d14,
          transparent: true,
          opacity: isCadEdgesVisible ? 0.7 : 0.16
        });
        const edgeLine = new THREE.LineSegments(edgesGeo, edgeMat);
        edgeLine.userData.isCadEdge = true;
        child.add(edgeLine);
      }
    });

    scene.add(obj);
    const urlView = new URLSearchParams(window.location.search).get('view');
    if (urlView) setView(urlView);
    log('[CAD+PBR] 226개 B-Rep 건축 쉘에 실사 골강판 노멀맵, 에폭시 바닥 반사 및 H-빔 스틸 셰이더 적용 완료.');
  });
}

// ============================================================================
// 12. 뷰포트 그래픽 옵션 토글 (UE5 실사 PBR / 바닥 반사 / CAD 외곽선 / X-Ray)
// ============================================================================
function togglePhotorealMode() {
  isPhotorealPBR = !isPhotorealPBR;
  const btn = document.getElementById('btn-pbr-mode');
  if (btn) {
    btn.classList.toggle('active', isPhotorealPBR);
    btn.style.background = isPhotorealPBR ? '#7c3aed' : '#171e2b';
    btn.innerText = isPhotorealPBR ? '⚡ UE5 실사 PBR (IBL+Bloom+SSR ON)' : '⚡ 기본 셰이딩 모드';
  }
  renderer.toneMappingExposure = isPhotorealPBR ? 1.18 : 0.95;
  scene.traverse(c => {
    if (c.isMesh && c.material && 'envMapIntensity' in c.material) {
      c.material.envMapIntensity = isPhotorealPBR ? 1.45 : 0.25;
      c.material.needsUpdate = true;
    }
  });
  log(isPhotorealPBR ? '[RENDER] UE5 실사 PBR (HDRI IBL + UnrealBloom + ACES Filmic) 활성화' : '[RENDER] 기본 셰이딩 모드로 전환');
}

function toggleFloorReflection() {
  isFloorReflective = !isFloorReflective;
  const btn = document.getElementById('btn-floor-refl');
  if (btn) {
    btn.classList.toggle('active', isFloorReflective);
    btn.innerText = isFloorReflective ? '🪞 에폭시 바닥 반사 ON' : '🪞 에폭시 바닥 반사 OFF';
  }
  if (floorReflector) floorReflector.visible = isFloorReflective;
  const floorMesh = meshesByName['Floor_Slab'];
  if (floorMesh && floorMesh.material) {
    floorMesh.material.transparent = isFloorReflective;
    floorMesh.material.opacity = isFloorReflective ? 0.84 : 1.0;
    floorMesh.material.needsUpdate = true;
  }
}

function toggleCadEdges() {
  isCadEdgesVisible = !isCadEdgesVisible;
  const btn = document.getElementById('btn-cad-edges');
  if (btn) {
    btn.classList.toggle('active', isCadEdgesVisible);
    btn.innerText = isCadEdgesVisible ? '📐 CAD 외곽선 ON' : '📐 CAD 외곽선 OFF';
  }
  scene.traverse(c => {
    if (c.userData && c.userData.isCadEdge && c.material) {
      c.material.opacity = isCadEdgesVisible ? 0.72 : 0.18;
      c.material.needsUpdate = true;
    }
  });
}

function toggleXRay(forceVal = null) {
  isXRay = typeof forceVal === 'boolean' ? forceVal : !isXRay;
  const btn = document.getElementById('btn-xray');
  if (btn) {
    btn.innerText = isXRay ? '내부 투시 (X-Ray ON)' : '외벽 불투명 (실사 실내)';
    btn.classList.toggle('active', isXRay);
  }
  if (factoryMeshGroup) {
    factoryMeshGroup.traverse(child => {
      if (child.isMesh && (child.name.includes('Wall_') || child.name.includes('Roof_Gable_Cladding'))) {
        child.material.transparent = isXRay;
        child.material.opacity = isXRay ? 0.16 : 1.0;
        child.material.depthWrite = !isXRay;
        child.material.needsUpdate = true;
      }
    });
  }
}

function toggleWireframe() {
  isWireframe = !isWireframe;
  const btn = document.getElementById('btn-wireframe');
  if (btn) btn.classList.toggle('active', isWireframe);
  scene.traverse(c => {
    if (c.isMesh && c.material && c !== floorHitPlane) {
      c.material.wireframe = isWireframe;
    }
  });
}

function loadGaussianSplats() {
  fetch('/true_3dgs.bin')
    .then(res => res.arrayBuffer())
    .then(buf => {
      const floats = new Float32Array(buf);
      const count = floats.length / 13;
      const positions = new Float32Array(count * 4 * 3);
      const colors = new Float32Array(count * 4 * 3);
      const uvs = new Float32Array(count * 4 * 2);
      const alphas = new Float32Array(count * 4);
      const indices = new Uint32Array(count * 6);

      for (let i = 0; i < count; i++) {
        const o = i * 13;
        const wx = floats[o], wy = floats[o + 1], wz = floats[o + 2];
        const r = floats[o + 3], g = floats[o + 4], b = floats[o + 5], alpha = floats[o + 6];
        const ux = floats[o + 7], uy = floats[o + 8], uz = floats[o + 9];
        const vx = floats[o + 10], vy = floats[o + 11], vz = floats[o + 12];
        const corners = [
          [wx - ux - vx, wy - uy - vy, wz - uz - vz, -1, -1],
          [wx + ux - vx, wy + uy - vy, wz + uz - vz,  1, -1],
          [wx + ux + vx, wy + uy + vy, wz + uz + vz,  1,  1],
          [wx - ux + vx, wy - uy + vy, wz - uz + vz, -1,  1]
        ];
        for (let c = 0; c < 4; c++) {
          const vIdx = i * 4 + c;
          positions[vIdx * 3] = corners[c][0];
          positions[vIdx * 3 + 1] = corners[c][1];
          positions[vIdx * 3 + 2] = corners[c][2];
          colors[vIdx * 3] = r;
          colors[vIdx * 3 + 1] = g;
          colors[vIdx * 3 + 2] = b;
          uvs[vIdx * 2] = corners[c][3];
          uvs[vIdx * 2 + 1] = corners[c][4];
          alphas[vIdx] = alpha;
        }
        const baseV = i * 4;
        indices.set([baseV, baseV + 1, baseV + 2, baseV, baseV + 2, baseV + 3], i * 6);
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));

      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexColors: true,
        vertexShader: `
          attribute float alpha; varying vec3 vColor; varying vec2 vUv; varying float vAlpha;
          void main() { vColor = color; vUv = uv; vAlpha = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: `
          varying vec3 vColor; varying vec2 vUv; varying float vAlpha;
          void main() { float r2 = dot(vUv, vUv); if (r2 > 1.0) discard; gl_FragColor = vec4(vColor, vAlpha * exp(-r2 * 2.5) * 0.45); }
        `
      });
      splatPointsGroup = new THREE.Mesh(geo, mat);
      splatPointsGroup.visible = isSplatVisible;
      scene.add(splatPointsGroup);
    })
    .catch(() => {});
}

function toggleGaussianSplats() {
  isSplatVisible = !isSplatVisible;
  if (splatPointsGroup) splatPointsGroup.visible = isSplatVisible;
  document.getElementById('btn-splat').classList.toggle('active', isSplatVisible);
}

function setView(mode) {
  if (mode === 'iso') {
    toggleXRay(true); // 조감도에서만 외벽 투시
    camera.position.set(25000, -18000, 16500);
    controls.target.set(11000, 7500, 2500);
  } else {
    toggleXRay(false); // 실내 뷰에서는 불투명 실사 벽체
    if (mode === 'cnc_cell') {
      camera.position.set(2400, 14600, 3200);
      controls.target.set(8200, 10200, 950);
    } else if (mode === 'office') {
      camera.position.set(15700, 6500, 2500);
      controls.target.set(16200, 3150, 820);
    } else if (mode === 'mezzanine') {
      camera.position.set(22500, 12800, 4600);
      controls.target.set(11500, 3200, 2600);
    } else if (mode === 'lounge') {
      camera.position.set(11500, 10800, 2600);
      controls.target.set(3500, 3600, 1200);
    } else if (mode === 'doors') {
      camera.position.set(16500, 3200, 3600);
      controls.target.set(13500, 15200, 2600);
    }
  }
  controls.update();
  log(`[CAMERA] '${mode.toUpperCase()}' 시점으로 이동`);
}

function onMouseMove(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const tooltip = document.getElementById('tooltip');
  const hits = raycaster.intersectObjects(placedAssetsGroup.children, true);
  if (hits.length > 0) {
    let curr = hits[0].object;
    while (curr && curr.parent !== placedAssetsGroup) curr = curr.parent;
    if (curr && curr.userData && curr.userData.isEditableAsset) {
      tooltip.style.display = 'block';
      tooltip.style.left = (event.clientX + 14) + 'px';
      tooltip.style.top = (event.clientY + 14) + 'px';
      tooltip.innerHTML = `<b>${curr.name}</b> (${curr.userData.title})<br><span style="color:#38bdf8;">Material: ${curr.userData.materialId}</span>`;
      return;
    }
  }
  tooltip.style.display = 'none';
}

function log(msg) {
  const box = document.getElementById('console-log');
  if (!box) return;
  const time = new Date().toTimeString().split(' ')[0];
  const line = document.createElement('div');
  line.innerHTML = `<span class="log-time">[${time}]</span> ${msg}`;
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
}

function onWindowResize() {
  const container = document.getElementById('viewport-container');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
  if (composer) composer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  updateWASDCameraMovement(dt);
  controls.update();

  const p = camera.position;
  const hudCoords = document.getElementById('hud-coords');
  if (hudCoords) {
    hudCoords.innerText = `X: ${Math.round(p.x).toLocaleString()}, Y: ${Math.round(p.y).toLocaleString()}, Z: ${Math.round(p.z).toLocaleString()} mm`;
  }

  renderer.render(scene, camera);
}

window.onload = init3D;
