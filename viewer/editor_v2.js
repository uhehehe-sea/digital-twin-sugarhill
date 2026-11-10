
// ============================================================================
// Exterior Wall Transparency & Cladding State (View Inside Factory from Afar)
// ============================================================================
let exteriorWallOpacity = 0.35; // Default 35% translucent so interior is clearly visible from afar
const exteriorCladdingMeshes = [];

function setExteriorWallOpacity(val, showLog = false) {
  val = Math.max(0.0, Math.min(1.0, parseFloat(val)));
  if (isNaN(val)) val = 0.35;
  exteriorWallOpacity = val;

  const slider = document.getElementById('slider-wall-opacity');
  if (slider) slider.value = Math.round(val * 100);

  const label = document.getElementById('label-wall-opacity');
  if (label) label.innerText = `${Math.round(val * 100)}%`;

  exteriorCladdingMeshes.forEach(mesh => {
    if (mesh && mesh.material) {
      mesh.material.transparent = val < 0.98;
      mesh.material.opacity = val;
      mesh.material.depthWrite = val > 0.55;
      mesh.material.needsUpdate = true;
    }
  });

  if (showLog) {
    const desc = val <= 0.05 ? '완전 투명' : (val < 0.25 ? '투명 X-Ray' : (val < 0.85 ? '반투명 고스트' : '불투명 외벽'));
    log(`🏛️ 외벽 투명도: ${Math.round(val * 100)}% (${desc}) - 멀리서도 내부 투과 조망`);
  }
}
window.setExteriorWallOpacity = setExteriorWallOpacity;
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

function getIndustrialMaterial(matId) {
  const spec = (typeof INDUSTRIAL_MATERIALS !== 'undefined' && INDUSTRIAL_MATERIALS[matId]) 
    || (typeof INDUSTRIAL_MATERIALS !== 'undefined' && INDUSTRIAL_MATERIALS['SUS_304_306_Brushed_2B']) 
    || { colorHex: '#8899aa', roughness: 0.35, metalness: 0.8, clearcoat: 0.1, clearcoatRoughness: 0.2, opacity: 1.0 };
  
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(spec.colorHex || '#8899aa'),
    roughness: spec.roughness ?? 0.35,
    metalness: spec.metalness ?? 0.8,
    clearcoat: spec.clearcoat ?? 0.1,
    clearcoatRoughness: spec.clearcoatRoughness ?? 0.2,
    transparent: (spec.opacity ?? 1.0) < 1.0,
    opacity: spec.opacity ?? 1.0
  });

  if (typeof pbrTextures !== 'undefined') {
    if (spec.texType === 'brushed_steel' && pbrTextures.steelNormal) {
      mat.normalMap = pbrTextures.steelNormal;
      mat.roughnessMap = pbrTextures.steelORM || null;
      mat.normalScale = new THREE.Vector2(0.25, 0.25);
    } else if (spec.texType === 'slm_steel' && pbrTextures.roughMetalNormal) {
      mat.normalMap = pbrTextures.roughMetalNormal;
      mat.roughnessMap = pbrTextures.roughMetalORM || null;
      mat.normalScale = new THREE.Vector2(0.42, 0.42);
    } else if (spec.texType === 'mirror_steel' && pbrTextures.chromeNormal) {
      mat.normalMap = pbrTextures.chromeNormal;
      mat.normalScale = new THREE.Vector2(0.05, 0.05);
    } else if (spec.texType === 'rubber' && pbrTextures.rubberNormal) {
      mat.normalMap = pbrTextures.rubberNormal;
      mat.roughnessMap = pbrTextures.rubberORM || null;
      mat.normalScale = new THREE.Vector2(0.35, 0.35);
    }
  }
  return mat;
}
window.getIndustrialMaterial = getIndustrialMaterial;

// ============================================================================
// 2. 에셋 브라우저 카탈로그 정의 (20종: CNC, 금속 3D 프린터, 사무실 용품, 안전/설비)
// ============================================================================

const ASSET_CATALOG = [
  // 1. CNC 머시닝 & 3D 프린터 (정밀 가공 & 금속 적층)
  {
    id: 'CNC_5AXIS_MILL',
    name: '5축 CNC 머시닝 센터 (PP/FKM 내화학 진공 블록 밀링)',
    category: 'CNC_3DP',
    materialHint: 'PP_POLYPROPYLENE',
    desc: '폴리프로필렌(PP) 및 불소고무(FKM) 내화학 진공 밸브/매니폴드 5축 동시 초정밀 가공기',
    sizeMm: [2600, 2400, 2500],
    color: '#0284c7',
    icon: '🏭',
    tag: '5-Axis Milling'
  },
  {
    id: '3DP_METAL_DMLS',
    name: '316L 스테인리스 금속 3D 프린터 (DMLS 듀얼 레이저)',
    category: 'CNC_3DP',
    materialHint: 'STAINLESS_316L',
    desc: 'SUS316L 분말 기반 정밀 산업용 금속 적층제조기. 아르곤 밀폐 챔버 & 산소 분압 제어',
    sizeMm: [2400, 1900, 2300],
    color: '#94a3b8',
    icon: '🖨️',
    tag: 'Metal DMLS'
  },
  {
    id: '3DP_WIRE_WAAM',
    name: '대형 304 스테인리스 와이어 아크 3D 프린터 (WAAM 6축)',
    category: 'CNC_3DP',
    materialHint: 'STAINLESS_304',
    desc: 'SUS304 용접 와이어를 아크 방전으로 고속 증착하는 6축 로봇 암 기반 대형 메탈 적층 시스템',
    sizeMm: [3200, 2800, 2800],
    color: '#64748b',
    icon: '🦾',
    tag: 'Wire Arc WAAM'
  },
  {
    id: 'FKM_GASKET_PUNCH',
    name: 'FKM 불소고무 정밀 가스켓 펀칭 & 슬리터기',
    category: 'CNC_3DP',
    materialHint: 'FKM_FLUOROELASTOMER',
    desc: '고온·강산 내화학 FKM 75 Durometer 시트 고속 자동 펀칭 커터',
    sizeMm: [1800, 1400, 1600],
    color: '#1e293b',
    icon: '✂️',
    tag: 'FKM Cutting'
  },
  {
    id: 'ULTRASONIC_CLEANER',
    name: '스테인리스 316 부품 초음파 침적 탈지 & 세척기',
    category: 'CNC_3DP',
    materialHint: 'STAINLESS_316L',
    desc: '316L/304 절삭 가공 잔류 유분 및 미세 버(Burr) 제거용 40kHz 다조식 세척 시스템',
    sizeMm: [1600, 1000, 1200],
    color: '#38bdf8',
    icon: '🫧',
    tag: 'Cleaning'
  },
  {
    id: 'CMM_3AXIS_LASER',
    name: '초정밀 3축 CMM 3차원 광학 레이저 측정기',
    category: 'CNC_3DP',
    materialHint: 'STAINLESS_304',
    desc: '가공 정밀도 ±0.8μm 검증 화강암 정반 & 갠트리 브릿지 레이저 프로브 스테이션',
    sizeMm: [1900, 1700, 2200],
    color: '#cbd5e1',
    icon: '📏',
    tag: 'QC CMM'
  },
  {
    id: 'VACUUM_DRY_OVEN',
    name: '고진공 시료 건조 오븐 챔버 (250°C 탈기)',
    category: 'CNC_3DP',
    materialHint: 'STAINLESS_304',
    desc: 'FKM 수지 가황 및 금속 분말 잔류 수분 제거 진공 가열 챔버',
    sizeMm: [1200, 1000, 1700],
    color: '#f97316',
    icon: '🔥',
    tag: 'Vacuum Oven'
  },
  {
    id: 'POWDER_SIEVING_STATION',
    name: '금속 분말 회수 및 진동 체가름(Sieving) 스테이션',
    category: 'CNC_3DP',
    materialHint: 'STAINLESS_316L',
    desc: 'SUS316L 15-45μm 미사용 분말 초음파 진동 회수 리사이클 밀폐 시스템',
    sizeMm: [1100, 1100, 1800],
    color: '#94a3b8',
    icon: '🌪️',
    tag: 'Powder Recycle'
  },

  // 2. 물류 & 자율주행 AMR (Logistics & Robotics)
  {
    id: 'AMR_CARTER_V2',
    name: 'NVIDIA Isaac AMR Carter v2 자율주행 물류 로봇',
    category: 'LOGISTICS',
    materialHint: 'PP_POLYPROPYLENE',
    desc: 'NVIDIA Jetson Orin 구동 듀얼 3D LiDAR & 스테레오 슬램 자율 반송 로봇',
    sizeMm: [850, 650, 480],
    color: '#76b900',
    icon: '🤖',
    tag: 'NVIDIA Isaac'
  },
  {
    id: 'FORKLIFT_REACH_TRUCK',
    name: '전동 입승식 하이 리치 지게차 (Electric Reach Truck 2.0t)',
    category: 'LOGISTICS',
    materialHint: 'SAFETY_YELLOW',
    desc: '6.5m 고단 랙 적재용 전동 마스트 리치 트럭. 고정밀 틸트 캐리지 & 비상 감응 센서',
    sizeMm: [2200, 1250, 2700],
    color: '#eab308',
    icon: '🚜',
    tag: 'Reach Truck'
  },
  {
    id: 'PALLET_JACK_MANUAL_RED',
    name: '유압식 핸드 팔레트 트럭 (2.5t Red)',
    category: 'LOGISTICS',
    materialHint: 'SAFETY_YELLOW',
    desc: '우레탄 탠덤 휠 & 크롬 도금 유압 실린더 중하중 수동 팔레트 트럭',
    sizeMm: [1550, 685, 1200],
    color: '#ef4444',
    icon: '🛒',
    tag: 'Hand Jack'
  },
  {
    id: 'SCISSOR_LIFT_AERIAL',
    name: '산업용 전동 시저 리프트 (Aerial Scissor Lift 8m)',
    category: 'LOGISTICS',
    materialHint: 'SAFETY_YELLOW',
    desc: '공장 천장 배관·조명 유지보수용 전동 유압 시저 승강 작업대',
    sizeMm: [2100, 1150, 1900],
    color: '#facc15',
    icon: '🪜',
    tag: 'Scissor Lift'
  },
  {
    id: 'ROLLER_CONVEYOR_STATION',
    name: '무동력 롤러 컨베이어 검수 작업대',
    category: 'LOGISTICS',
    materialHint: 'STAINLESS_304',
    desc: 'SUS304 스테인리스 롤러 & 스톱퍼가 장착된 박스 출하 검수 라인',
    sizeMm: [3000, 800, 900],
    color: '#94a3b8',
    icon: '🛤️',
    tag: 'Conveyor'
  },
  {
    id: 'AGV_TUG_ROBOT',
    name: '자기 테이프 유도형 AGV 견인 로봇',
    category: 'LOGISTICS',
    materialHint: 'SAFETY_YELLOW',
    desc: '최대 1,500kg 카트 연속 자동 견인용 산업용 무인 운반차',
    sizeMm: [1100, 600, 380],
    color: '#f59e0b',
    icon: '🚜',
    tag: 'AGV Tugger'
  },

  // 3. 중량랙 & 보관 (Storage & Heavy Racks)
  {
    id: 'PALLET_RACK_HEAVY_4TIER',
    name: '4단 오렌지·블루 고하중 팔레트 보관 랙',
    category: 'STORAGE',
    materialHint: 'SAFETY_YELLOW',
    desc: '단당 2,500kg 적재 강철 기둥 & 세이프티 핀 와이어 메쉬 데킹 랙 시스템',
    sizeMm: [2700, 1100, 4200],
    color: '#3b82f6',
    icon: '🪜',
    tag: 'Heavy Rack'
  },
  {
    id: 'SPILL_PALLET_CHEMICAL',
    name: '내화학 유해물질 누출 방지 드럼통 팔레트 (Spill Pallet)',
    category: 'STORAGE',
    materialHint: 'PP_POLYPROPYLENE',
    desc: '고밀도 폴리에틸렌/PP 재질 4-드럼 방폭 누출 방지 오일 수거 팔레트',
    sizeMm: [1320, 1320, 380],
    color: '#eab308',
    icon: '🛢️',
    tag: 'Spill Containment'
  },
  {
    id: 'POWDER_LOCKER_STAINLESS',
    name: '스테인리스 316L 분말 보관 드럼 & 락커',
    category: 'STORAGE',
    materialHint: 'STAINLESS_316L',
    desc: '금속 3D 프린터용 분말 불활성 가스 퍼징 보관 캐비닛',
    sizeMm: [1200, 600, 1850],
    color: '#64748b',
    icon: '🗄️',
    tag: 'Powder Locker'
  },
  {
    id: 'CANTILEVER_PIPE_RACK',
    name: '중량물 강철 캔틸레버 파이프 & 원자재 랙',
    category: 'STORAGE',
    materialHint: 'SAFETY_YELLOW',
    desc: '스테인리스 파이프 및 PP 봉재 장척물 전용 외팔보 보관대',
    sizeMm: [2500, 1400, 2800],
    color: '#d97706',
    icon: '🏗️',
    tag: 'Cantilever'
  },
  {
    id: 'EXPLOSION_PROOF_CABINET',
    name: '밀폐형 방폭 화학물질 안전 보관 캐비닛 (Yellow)',
    category: 'STORAGE',
    materialHint: 'SAFETY_YELLOW',
    desc: '이중 강판 3점 잠금 구조 NFPA/OSHA 규격 가연성 용제 보관함',
    sizeMm: [1090, 460, 1650],
    color: '#eab308',
    icon: '⚠️',
    tag: 'Safety Cabinet'
  },

  // 4. 사무실 & 오피스 가구 (Office Furniture)
  {
    id: 'WORKSTATION_CAD_DUAL',
    name: '듀얼 모니터 엔지니어링 CAD 워크스테이션 데스크',
    category: 'OFFICE',
    materialHint: 'PP_POLYPROPYLENE',
    desc: '곡면 듀얼 모니터 암 & 메쉬 에르고노믹 의자가 포함된 개발자 업무 데스크',
    sizeMm: [1800, 900, 1250],
    color: '#334155',
    icon: '🖥️',
    tag: 'CAD Desk'
  },
  {
    id: 'OFFICE_EXECUTIVE_L_DESK',
    name: 'L자형 임원용 모던 워크스테이션 데스크 & 에르고 의자',
    category: 'OFFICE',
    materialHint: 'PP_POLYPROPYLENE',
    desc: '다크 월넛 우드 상판 & 스틸 프레임 일체형 서랍 L자 오피스 데스크',
    sizeMm: [2000, 1800, 750],
    color: '#1e293b',
    icon: '💼',
    tag: 'L-Desk'
  },
  {
    id: 'CONFERENCE_TABLE_6P',
    name: '6인용 모던 회의용 테이블 & 패브릭 체어',
    category: 'OFFICE',
    materialHint: 'PP_POLYPROPYLENE',
    desc: '케이블 매니지먼트 덕트가 내장된 화이트 상판 & 회의용 암체어 6세트',
    sizeMm: [2400, 1100, 750],
    color: '#e2e8f0',
    icon: '👥',
    tag: 'Meeting Table'
  },
  {
    id: 'PLOTTER_PRINTER_STATION',
    name: '복합기 & 도면 플로터 대형 출력 센터',
    category: 'OFFICE',
    materialHint: 'PP_POLYPROPYLENE',
    desc: 'A0 대형 공장 도면 롤 플로터 및 레이저 멀티 복합기',
    sizeMm: [1500, 850, 1150],
    color: '#0f172a',
    icon: '📠',
    tag: 'Plotter'
  },
  {
    id: 'OFFICE_PANTRY_BAR',
    name: '오피스 음료 바 & 캡슐 커피 머신 카운터',
    category: 'OFFICE',
    materialHint: 'PP_POLYPROPYLENE',
    desc: '상업용 에스프레소 머신, 언더카운터 냉장고, 싱크대 일체형 팬트리',
    sizeMm: [2200, 700, 1050],
    color: '#475569',
    icon: '☕',
    tag: 'Coffee Bar'
  },
  {
    id: 'FILE_CABINET_MOBILE',
    name: '서류 보관 3단 모바일 페디스털 서랍장',
    category: 'OFFICE',
    materialHint: 'STAINLESS_304',
    desc: '시건장치와 우레탄 바퀴가 달린 스틸 분체도장 서류함',
    sizeMm: [400, 550, 620],
    color: '#94a3b8',
    icon: '🗄️',
    tag: 'Pedestal'
  },

  // 5. 안전 시설 & 품질 관리 (Safety & QC)
  {
    id: 'SAFETY_SHOWER_EYEWASH',
    name: '긴급 세안 및 전신 안전 샤워 부스 (OSHA Green)',
    category: 'SAFETY',
    materialHint: 'STAINLESS_304',
    desc: 'SUS304 파이프 & 황색 풀로드 일체형 화학 실험실 긴급 세안 설비',
    sizeMm: [800, 900, 2300],
    color: '#15803d',
    icon: '🚿',
    tag: 'Emergency Shower'
  },
  {
    id: 'TOOL_CHEST_HEAVY_CABINET',
    name: '헤비 듀티 정비 공구함 캐비닛 (Red Ball-Bearing)',
    category: 'SAFETY',
    materialHint: 'SAFETY_YELLOW',
    desc: '상부 목재 작업대 & 12단 볼베어링 레일 고중량 공구 툴체스트',
    sizeMm: [1400, 650, 1050],
    color: '#dc2626',
    icon: '🧰',
    tag: 'Tool Cabinet'
  },
  {
    id: 'INTERLOCK_SAFETY_FENCE',
    name: '안전 펜스 & 인터록 접근 제어 도어 게이트',
    category: 'SAFETY',
    materialHint: 'SAFETY_YELLOW',
    desc: '로봇 자동화 구역 출입 통제용 안전 센서 스위치 도어 펜스 모듈',
    sizeMm: [2000, 100, 2100],
    color: '#facc15',
    icon: '🚧',
    tag: 'Safety Fence'
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

  switch (ASSET_BUILDER_ALIAS[assetDef.assetId] || assetDef.assetId) {
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
    case 'cnc_router_3axis': {
      // 3-axis gantry CNC router for flat panels — open frame so the moving axes stay visible.
      // Moving groups (gantry X / carriage Y / spindle Z) are exposed in g.userData.rig for twin_live.js.
      const tableZ = 820;
      addBoxPart(g, cx, cy, 0, W, D, 760, '#1e293b', 0.38, 0.75, 1.0, 'frame');                    // welded base
      addBoxPart(g, cx + 140, cy + 140, 760, W - 280, D - 280, 60, '#475569', 0.6, 0.4, 1.0, 'frame'); // table frame
      addBoxPart(g, cx + 160, cy + 160, tableZ - 40, W - 320, D - 320, 40, '#3f3f46', 0.85, 0.05, 1.0, 'primary'); // vacuum spoilboard
      addBoxPart(g, cx, cy + 30, 760, W, 80, 90, '#cbd5e1', 0.22, 0.92, 1.0, 'primary');           // X rail (front)
      addBoxPart(g, cx, cy + D - 110, 760, W, 80, 90, '#cbd5e1', 0.22, 0.92, 1.0, 'primary');      // X rail (rear)
      addBoxPart(g, cx + W - 90, cy + D - 520, 900, 80, 380, 520, '#0f172a', 0.25, 0.8, 1.0, 'frame'); // control cabinet
      addBoxPart(g, cx + W - 96, cy + D - 480, 1040, 8, 300, 220, '#38bdf8', 0.1, 0.1, 1.0, 'screen');
      addCylPartZ(g, cx + W - 50, cy + D - 330, 1420, 26, 200, '#10b981', 0.15, 0.2, 'beacon');
      const gantry = new THREE.Group(); g.add(gantry);
      addBoxPart(gantry, -110, cy + 20, 850, 220, 160, 900, '#e2e8f0', 0.25, 0.85, 1.0, 'accent');      // left upright
      addBoxPart(gantry, -110, cy + D - 180, 850, 220, 160, 900, '#e2e8f0', 0.25, 0.85, 1.0, 'accent'); // right upright
      addBoxPart(gantry, -130, cy + 20, 1750, 260, D - 40, 240, '#e2e8f0', 0.25, 0.85, 1.0, 'accent');  // bridge beam
      addBoxPart(gantry, 130, cy + 60, 1800, 30, D - 120, 40, '#94a3b8', 0.2, 0.95, 1.0, 'primary');    // Y rail
      const carriage = new THREE.Group(); gantry.add(carriage);
      addBoxPart(carriage, 160, -170, 1450, 70, 340, 520, '#0284c7', 0.24, 0.65, 1.0, 'accent');        // Y carriage plate
      const spindle = new THREE.Group(); carriage.add(spindle);
      addBoxPart(spindle, 230, -80, 1230, 160, 160, 420, '#0f172a', 0.3, 0.8, 1.0, 'frame');           // Z slide
      addCylPartZ(spindle, 310, 0, 1060, 75, 360, '#cbd5e1', 0.2, 0.95, 'primary');                    // spindle motor
      addCylPartZ(spindle, 310, 0, 990, 30, 70, '#475569', 0.3, 0.9, 'primary');                       // collet nut
      addCylPartZ(spindle, 310, 0, 900, 6, 90, '#f8fafc', 0.1, 0.98, 'tool');                          // end mill (tip z = 900)
      // non-enumerable: keeps Object3D.clone()/JSON from walking the THREE objects (circular)
      Object.defineProperty(g.userData, 'rig', { value: { gantry, carriage, spindle, tableZ, toolOffsetX: 310, toolTipZ: 900 }, enumerable: false, writable: true, configurable: true });
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
    
      // --- 신규 15종 에셋 고정밀 지오메트리 빌더 ---
      case 'AMR_CARTER_V2': {
        // NVIDIA Isaac AMR Carter v2 자율주행 물류 로봇
        const chassisMat = mats.PP;
        const wheelMat = mats.FKM;
        const accentMat = mats.SAFETY_YELLOW;
        const metalMat = mats.SUS304;

        // 메인 로우프로파일 차체
        addBoxPart(group, [750, 560, 220], [0, 0, 160], chassisMat);
        addBoxPart(group, [800, 520, 60], [0, 0, 280], accentMat); // 상단 마운트 데크

        // 좌우 구동 휠 & 전후 캐스터
        addCylPartX(group, 90, 60, [0, 290, 90], wheelMat);
        addCylPartX(group, 90, 60, [0, -290, 90], wheelMat);
        addCylPartZ(group, 45, 80, [300, 0, 55], wheelMat);
        addCylPartZ(group, 45, 80, [-300, 0, 55], wheelMat);

        // 3D 라이다 센서 퍽 (전후 듀얼)
        addCylPartZ(group, 50, 70, [340, 0, 315], chassisMat);
        addCylPartZ(group, 35, 30, [340, 0, 350], new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x0088cc, roughness: 0.1 }));
        addCylPartZ(group, 50, 70, [-340, 0, 315], chassisMat);

        // 상태 LED 링 (NVIDIA Green)
        const ledRingMat = new THREE.MeshBasicMaterial({ color: 0x76b900 });
        addBoxPart(group, [720, 15, 12], [0, 275, 230], ledRingMat);
        addBoxPart(group, [720, 15, 12], [0, -275, 230], ledRingMat);
        break;
      }

      case 'FORKLIFT_REACH_TRUCK': {
        // 전동 입승식 하이 리치 지게차
        const bodyMat = mats.SAFETY_YELLOW;
        const mastMat = mats.SUS304;
        const tireMat = mats.FKM;

        // 베이스 섀시 및 카운터웨이트
        addBoxPart(group, [1400, 1100, 650], [-200, 0, 380], bodyMat);
        addBoxPart(group, [400, 1050, 800], [-700, 0, 700], bodyMat); // 후면 배터리 구획

        // 운전석 오버헤드 가드 프레임
        addBoxPart(group, [60, 60, 1500], [-600, 480, 1400], mastMat);
        addBoxPart(group, [60, 60, 1500], [-600, -480, 1400], mastMat);
        addBoxPart(group, [60, 60, 1500], [200, 480, 1400], mastMat);
        addBoxPart(group, [60, 60, 1500], [200, -480, 1400], mastMat);
        addBoxPart(group, [900, 1050, 40], [-200, 0, 2150], mastMat); // 루프 가드

        // 2단 텔레스코픽 마스트 & 포크 틴
        addBoxPart(group, [80, 120, 2600], [600, 350, 1300], mastMat);
        addBoxPart(group, [80, 120, 2600], [600, -350, 1300], mastMat);
        addBoxPart(group, [50, 820, 100], [650, 0, 300], mastMat); // 포크 캐리지
        addBoxPart(group, [1100, 100, 45], [1150, 220, 70], mastMat); // 포크 발 L
        addBoxPart(group, [1100, 100, 45], [1150, -220, 70], mastMat); // 포크 발 R

        // 솔리드 러버 휠
        addCylPartX(group, 150, 120, [-500, 480, 150], tireMat);
        addCylPartX(group, 150, 120, [-500, -480, 150], tireMat);
        addCylPartX(group, 120, 100, [600, 450, 120], tireMat);
        addCylPartX(group, 120, 100, [600, -450, 120], tireMat);
        break;
      }

      case 'PALLET_JACK_MANUAL_RED': {
        // 유압 핸드 팔레트 트럭
        const redMat = new THREE.MeshStandardMaterial({ color: 0xd92626, roughness: 0.35, metalness: 0.4 });
        const steelMat = mats.SUS304;
        const wheelMat = mats.FKM;

        // 포크 블레이드 한 쌍
        addBoxPart(group, [1150, 160, 55], [450, 220, 85], redMat);
        addBoxPart(group, [1150, 160, 55], [450, -220, 85], redMat);
        addBoxPart(group, [160, 600, 350], [-100, 0, 240], redMat); // A-프레임 연결부

        // 유압 실린더 및 틸트 핸들 바
        addCylPartZ(group, 60, 320, [-120, 0, 220], steelMat);
        addBoxPart(group, [40, 40, 800], [-350, 0, 680], steelMat); // 핸들 기둥
        addBoxPart(group, [40, 380, 40], [-450, 0, 1050], redMat); // 손잡이 루프

        // 바퀴들
        addCylPartX(group, 90, 50, [-120, 120, 90], wheelMat);
        addCylPartX(group, 90, 50, [-120, -120, 90], wheelMat);
        addCylPartX(group, 40, 60, [950, 220, 40], wheelMat);
        addCylPartX(group, 40, 60, [950, -220, 40], wheelMat);
        break;
      }

      case 'SCISSOR_LIFT_AERIAL': {
        // 산업용 전동 시저 리프트
        const yellowMat = mats.SAFETY_YELLOW;
        const steelMat = mats.SUS304;
        const wheelMat = mats.FKM;

        // 베이스 캐비닛
        addBoxPart(group, [1900, 1000, 400], [0, 0, 320], yellowMat);
        // 시저 링크 암 (X자 교차)
        addBoxPart(group, [1600, 40, 60], [0, 380, 650], steelMat);
        addBoxPart(group, [1600, 40, 60], [0, -380, 650], steelMat);
        addBoxPart(group, [1600, 40, 60], [0, 380, 950], steelMat);
        addBoxPart(group, [1600, 40, 60], [0, -380, 950], steelMat);
        // 작업대 데크 및 안전 난간
        addBoxPart(group, [2000, 1100, 80], [0, 0, 1250], steelMat);
        addBoxPart(group, [40, 40, 900], [950, 500, 1700], yellowMat);
        addBoxPart(group, [40, 40, 900], [950, -500, 1700], yellowMat);
        addBoxPart(group, [40, 40, 900], [-950, 500, 1700], yellowMat);
        addBoxPart(group, [40, 40, 900], [-950, -500, 1700], yellowMat);
        addBoxPart(group, [1950, 40, 40], [0, 500, 2100], yellowMat); // 핸드레일
        addBoxPart(group, [1950, 40, 40], [0, -500, 2100], yellowMat);
        // 휠 4개
        addCylPartX(group, 130, 80, [750, 450, 130], wheelMat);
        addCylPartX(group, 130, 80, [750, -450, 130], wheelMat);
        addCylPartX(group, 130, 80, [-750, 450, 130], wheelMat);
        addCylPartX(group, 130, 80, [-750, -450, 130], wheelMat);
        break;
      }

      case 'PALLET_RACK_HEAVY_4TIER': {
        // 4단 오렌지·블루 고하중 팔레트 보관 랙
        const blueColMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.4, metalness: 0.3 });
        const orangeBeamMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.35, metalness: 0.2 });
        const palletWoodMat = mats.PP;

        // 수직 기둥 (Blue Uprights)
        addBoxPart(group, [90, 90, 4000], [1300, 500, 2000], blueColMat);
        addBoxPart(group, [90, 90, 4000], [1300, -500, 2000], blueColMat);
        addBoxPart(group, [90, 90, 4000], [-1300, 500, 2000], blueColMat);
        addBoxPart(group, [90, 90, 4000], [-1300, -500, 2000], blueColMat);

        // 4단 가로 빔 (Orange Load Beams) & 적재 팔레트
        const heights = [400, 1500, 2600, 3700];
        for (const h of heights) {
          addBoxPart(group, [2600, 60, 120], [0, 500, h], orangeBeamMat);
          addBoxPart(group, [2600, 60, 120], [0, -500, h], orangeBeamMat);
          // 데크 위 적재된 유로 팔레트 2개 & 화물 박스
          addBoxPart(group, [1200, 800, 140], [-600, 0, h + 90], palletWoodMat);
          addBoxPart(group, [1100, 750, 600], [-600, 0, h + 450], mats.PP); // 박스
          addBoxPart(group, [1200, 800, 140], [600, 0, h + 90], palletWoodMat);
          addBoxPart(group, [1100, 750, 750], [600, 0, h + 520], mats.SUS304); // 금속 드럼/박스
        }
        break;
      }

      case 'SPILL_PALLET_CHEMICAL': {
        // 내화학 유해물질 누출 방지 드럼통 팔레트
        const yellowPEMat = mats.SAFETY_YELLOW;
        const blackGrateMat = mats.FKM;
        const drumMat = mats.SUS316L;

        // 누출 수거 섬프 베이스 (Sump Basin)
        addBoxPart(group, [1300, 1300, 320], [0, 0, 160], yellowPEMat);
        // 격자 그레이팅 상판
        addBoxPart(group, [1240, 1240, 40], [0, 0, 320], blackGrateMat);

        // 4개의 200L 드럼통 적재
        const offsets = [[-320, -320], [320, -320], [-320, 320], [320, 320]];
        for (const [dx, dy] of offsets) {
          addCylPartZ(group, 270, 880, [dx, dy, 780], drumMat);
          addCylPartZ(group, 280, 20, [dx, dy, 1220], yellowPEMat); // 상단 림
        }
        break;
      }

      case 'CMM_3AXIS_LASER': {
        // 초정밀 3축 CMM 3차원 광학 레이저 측정기
        const graniteMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.15, metalness: 0.1 });
        const portalMat = mats.SUS304;
        const probeMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.2, metalness: 0.8 });

        // 화강암 정반 베이스
        addBoxPart(group, [1600, 1400, 350], [0, 0, 750], graniteMat);
        addBoxPart(group, [1400, 1200, 600], [0, 0, 300], mats.SUS304); // 하부 방진 마운트

        // 갠트리 브릿지 컬럼 및 크로스 빔
        addBoxPart(group, [200, 300, 1200], [0, 600, 1500], portalMat);
        addBoxPart(group, [200, 300, 1200], [0, -600, 1500], portalMat);
        addBoxPart(group, [220, 1500, 240], [0, 0, 2050], portalMat); // 크로스 빔

        // Z축 퀼(Quill) & 레이저 측정 프로브
        addBoxPart(group, [90, 90, 600], [0, 0, 1650], portalMat);
        addCylPartZ(group, 20, 120, [0, 0, 1300], probeMat);
        addCylPartZ(group, 5, 80, [0, 0, 1200], probeMat); // 스타일러스 루비 팁
        break;
      }

      case 'VACUUM_DRY_OVEN': {
        // 고진공 시료 건조 오븐 챔버
        const bodyMat = mats.SUS304;
        const doorMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.25, metalness: 0.6 });
        const orangeMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.3 });

        addBoxPart(group, [950, 850, 1500], [0, 0, 850], bodyMat);
        addBoxPart(group, [40, 750, 900], [480, 0, 950], doorMat); // 전면 도어
        addBoxPart(group, [10, 400, 450], [500, 0, 950], mats.GLASS); // 검사창
        addBoxPart(group, [200, 600, 150], [0, 0, 1550], orangeMat); // 상단 진공 게이지 패널
        break;
      }

      case 'WORKSTATION_CAD_DUAL': {
        // 듀얼 모니터 엔지니어링 CAD 워크스테이션 데스크
        const topMat = mats.PP;
        const frameMat = mats.SUS304;
        const screenMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.3 });
        const emitScreen = new THREE.MeshBasicMaterial({ color: 0x1e3a8a });

        // 데스크 상판 및 스틸 레그
        addBoxPart(group, [1700, 850, 35], [0, 0, 730], topMat);
        addBoxPart(group, [60, 60, 710], [780, 360, 355], frameMat);
        addBoxPart(group, [60, 60, 710], [780, -360, 355], frameMat);
        addBoxPart(group, [60, 60, 710], [-780, 360, 355], frameMat);
        addBoxPart(group, [60, 60, 710], [-780, -360, 355], frameMat);

        // 듀얼 커브드 모니터 2대
        addBoxPart(group, [600, 25, 380], [-340, 250, 1050], screenMat);
        addBoxPart(group, [580, 5, 360], [-340, 235, 1050], emitScreen);
        addBoxPart(group, [600, 25, 380], [340, 250, 1050], screenMat);
        addBoxPart(group, [580, 5, 360], [340, 235, 1050], emitScreen);

        // 모니터 암 & 키보드/마우스
        addCylPartZ(group, 25, 350, [0, 320, 920], frameMat);
        addBoxPart(group, [440, 140, 12], [0, -50, 755], screenMat); // 키보드
        break;
      }

      case 'SAFETY_SHOWER_EYEWASH': {
        // 긴급 세안 및 전신 안전 샤워 부스
        const pipeMat = mats.SUS304;
        const greenMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.3, metalness: 0.2 });
        const yellowMat = mats.SAFETY_YELLOW;

        // 메인 수직 급수관
        addCylPartZ(group, 30, 2250, [0, 0, 1125], pipeMat);
        // 상단 샤워 헤드
        addCylPartZ(group, 150, 60, [0, 450, 2200], greenMat);
        addCylPartX(group, 25, 450, [0, 225, 2230], pipeMat);
        // 비상 풀 로드 (Pull Rod)
        addCylPartZ(group, 8, 800, [0, 350, 1750], yellowMat);

        // 세안기 보울 (Eyewash Bowl) & 노즐
        addCylPartZ(group, 180, 100, [0, 350, 1050], greenMat);
        addCylPartZ(group, 15, 60, [70, 350, 1120], yellowMat);
        addCylPartZ(group, 15, 60, [-70, 350, 1120], yellowMat);
        // 발판 페달 (Foot Treadle)
        addBoxPart(group, [250, 200, 30], [0, 250, 40], yellowMat);
        break;
      }

      case 'TOOL_CHEST_HEAVY_CABINET': {
        // 헤비 듀티 정비 공구함 캐비닛
        const redMat = new THREE.MeshStandardMaterial({ color: 0xbe123c, roughness: 0.35, metalness: 0.3 });
        const handleMat = mats.SUS304;
        const woodMat = mats.PP;

        addBoxPart(group, [1300, 620, 900], [0, 0, 520], redMat);
        addBoxPart(group, [1320, 640, 45], [0, 0, 990], woodMat); // 상단 목재 작업대

        // 전면 서랍 손잡이 레일 6단
        for (let i = 0; i < 6; i++) {
          const zh = 180 + i * 130;
          addBoxPart(group, [10, 1100, 18], [320, 0, zh], handleMat);
        }
        // 사이드 핸들 & 우레탄 캐스터
        addBoxPart(group, [100, 40, 400], [0, 330, 800], handleMat);
        addCylPartX(group, 60, 60, [500, 250, 60], mats.FKM);
        addCylPartX(group, 60, 60, [500, -250, 60], mats.FKM);
        addCylPartX(group, 60, 60, [-500, 250, 60], mats.FKM);
        addCylPartX(group, 60, 60, [-500, -250, 60], mats.FKM);
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
  // 판재 가공용 3축 CNC 라우터 (빠른 스케치 부품의 가공 설비) — 위치는 가정값
  { assetId: 'cnc_router_3axis', name: 'CNC_Router_3Axis_01', pos: [11800, 13300, 0], rot: [0, 0, 0], scale: [1, 1, 1], materialId: 'SUS_304_306_Brushed_2B' },
  // CNC 선반 (전면 도어·척이 작업자 통로 +Y 방향을 향하도록 180° 배치)
  { assetId: 'cnc_sealjet_630pro', name: 'CNC_SealJet_630PRO_01', pos: [4500, 9200, 0], rot: [0, 0, 180], scale: [1, 1, 1], materialId: 'SUS_304_306_Brushed_2B' }
  // 2026-11-09 사용자 요청: 기본 화면은 CNC 장비만. 금속 3D 프린터 2대·아르곤 필터·작업대(바이스·씰·빌렛)·
  // 작업자 카트·IBC 탱크·1층 사무실 세트(책상·의자·PC·프린터·서랍장)는 기본 배치에서 뺐습니다.
  // 필요하면 콘텐츠 드로어(Ctrl+Space)에서 다시 끌어다 놓을 수 있습니다.
];

// 기본 화면의 건물: 바닥·벽·지붕·철골·천장등·문과 노란 바닥선, 그리고 영상에서 확인한 큰 구조물
// (2층 사무실 메자닌·계단·화장실·출입문 — tools/build_factory_shell.mjs가 생성). 그 밖의 내부 물건은 뺍니다.
// 아래 정규식에 맞는 이름만 남습니다. 저장된 건물 편집 상태(scene_layout.json의 building)가 있으면 그것이 우선합니다.
const DEFAULT_SHELL_KEEP = /^(Floor_Slab|Joint_|Col_|Roof_|Girt_|Wall_|LinerPanel_|HighBay_|SafetyLine_|Floor_Stop_Decal|Door_Sectional|Door_Rollup|Exit_|Fire_Extinguisher|Shutter_Fan|WallVent_|Window_Frame|Main_Glass_Entry_|Ceiling_Gas_UnitHeater|Mezzanine_|Mezz_|Stair_|Restroom_|Cage_|Wood_Guardrail_)/;
const DEFAULT_BUILDING_REMOVED = 'DEFAULT_EMPTY_SHELL';   // resolved in applyBuildingState once the part list is known
// v1 catalog entries restored verbatim from editor_v1_backup.js.
// The v2 upgrade replaced ASSET_CATALOG and dropped these, so every DEFAULT_SCENE_PLACEMENTS
// item (Seal-Jet CNC, EOS / TRUMPF metal printers, worktable, office set ...) failed to spawn.
const LEGACY_V1_ASSETS = [
  {
    "assetId": "cnc_sealjet_630pro",
    "category": "CNC_3DP",
    "icon": "🎛️",
    "badge": "CNC (PP·FKM)",
    "title": "SKF Seal-Jet 630 PRO CNC",
    "sub": "PP · FKM · FPM 무금형 씰 전용 CNC 선반",
    "dims": [
      2450,
      1480,
      1820
    ],
    "defaultMaterial": "SUS_304_306_Brushed_2B",
    "usdPath": "industrial_cnc_and_3dprinter.obj#CNC_SealJet"
  },
  {
    "assetId": "cnc_sealjet_200pro",
    "category": "CNC_3DP",
    "icon": "⚙️",
    "badge": "소형 CNC",
    "title": "SKF Seal-Jet 200 PRO",
    "sub": "소구경 FKM/PP 정밀 오일씰 고속 CNC",
    "dims": [
      1520,
      1050,
      1650
    ],
    "defaultMaterial": "SUS_304_306_Brushed_2B",
    "usdPath": "industrial_cnc_and_3dprinter.obj#CNC_SealJet_200"
  },
  {
    "assetId": "slm_eos_m290",
    "category": "CNC_3DP",
    "icon": "🖨️",
    "badge": "금속 3D프린터",
    "title": "EOS M 290 스테인리스 3D프린터",
    "sub": "SUS 316L · 304 · 314 LPBF 금속 3D프린터",
    "dims": [
      2500,
      1300,
      2190
    ],
    "defaultMaterial": "SUS_316L_SLM_3DPrinted_AsBuilt",
    "usdPath": "nvidia_isaac_assets/equipment_3d_printer_a01/sm_equipment_3d_printer_a01_01.usd"
  },
  {
    "assetId": "slm_trumpf_truprint3000",
    "category": "CNC_3DP",
    "icon": "🔬",
    "badge": "멀티레이저 3DP",
    "title": "TRUMPF TruPrint 3000",
    "sub": "SUS 316L/314 듀얼 500W 레이저 3D프린터",
    "dims": [
      3235,
      1465,
      2225
    ],
    "defaultMaterial": "SUS_314_HeatResistant_Wrought",
    "usdPath": "nvidia_isaac_assets/equipment_3d_printer_b01/sm_equipment_3d_printer_b01_01.usd"
  },
  {
    "assetId": "argon_filter_station",
    "category": "CNC_3DP",
    "icon": "🧪",
    "badge": "3DP 보조설비",
    "title": "아르곤 가스 순환 필터 & 탱크",
    "sub": "금속 3D프린터 불활성 가스 정화 유닛",
    "dims": [
      1150,
      950,
      1780
    ],
    "defaultMaterial": "SUS_304_306_Brushed_2B",
    "usdPath": "industrial_cnc_and_3dprinter.obj#Argon_Unit"
  },
  {
    "assetId": "cnc_machine_vise",
    "category": "CNC_3DP",
    "icon": "🗜️",
    "badge": "SimReady USD",
    "title": "CNC 정밀 클램핑 바이스",
    "sub": "스테인리스/플라스틱 후가공 지그 바이스",
    "dims": [
      480,
      260,
      220
    ],
    "defaultMaterial": "SUS_304_306_Brushed_2B",
    "usdPath": "nvidia_isaac_assets/equipment_machine_vise_c01/sm_equipment_machine_vise_c01_01.usd"
  },
  {
    "assetId": "fkm_fpm_seal_set",
    "category": "CNC_3DP",
    "icon": "⭕",
    "badge": "FKM / FPM",
    "title": "FKM/FPM 불소고무 오일씰 세트",
    "sub": "85 Shore A 블랙 & 80A 브라운 씰 빌렛",
    "dims": [
      650,
      450,
      320
    ],
    "defaultMaterial": "FKM_FPM_Viton_Black_85A",
    "usdPath": "nvidia_isaac_assets/consumable_oil_seal_large_b01/sm_consumable_oil_seal_large_b01_01.usd"
  },
  {
    "assetId": "pp_seal_billet_set",
    "category": "CNC_3DP",
    "icon": "⚪",
    "badge": "PP 폴리프로필렌",
    "title": "PP 백업링 & 가이드링 빌렛",
    "sub": "ISO 1873 유백색 호모폴리머 PP 중공관",
    "dims": [
      600,
      420,
      340
    ],
    "defaultMaterial": "PP_Natural_SealGrade",
    "usdPath": "nvidia_isaac_assets/consumable_oil_seal_large_b01/sm_consumable_oil_seal_large_b01_01.usd"
  },
  {
    "assetId": "office_desk_a01",
    "category": "OFFICE",
    "icon": "🪑",
    "badge": "SimReady USD",
    "title": "오피스 표준 데스크 (Desk A01)",
    "sub": "1,600×800mm 사무실/연구실 표준 책상",
    "dims": [
      1600,
      800,
      750
    ],
    "defaultMaterial": "SUS_304_306_Brushed_2B",
    "usdPath": "nvidia_isaac_assets/desk_a01/sm_desk_a01_01.usd"
  },
  {
    "assetId": "office_manager_chair",
    "category": "OFFICE",
    "icon": "💺",
    "badge": "SimReady USD",
    "title": "매니저용 하이백 오피스 체어",
    "sub": "인체공학 회전식 패브릭 매니저 의자",
    "dims": [
      660,
      660,
      1080
    ],
    "defaultMaterial": "FKM_FPM_Viton_Black_85A",
    "usdPath": "nvidia_isaac_assets/sm_fabricmanagerschair_a01_01/sm_fabricmanagerschair_a01_01.usd"
  },
  {
    "assetId": "office_task_chair",
    "category": "OFFICE",
    "icon": "🪑",
    "badge": "SimReady USD",
    "title": "실무자용 블랙 오피스 체어",
    "sub": "메자닌/사무실 표준 회전 의자",
    "dims": [
      600,
      600,
      940
    ],
    "defaultMaterial": "FKM_FPM_Viton_Black_85A",
    "usdPath": "nvidia_isaac_assets/sm_officechairamf_a01_black_01/sm_officechairamf_a01_black_01.usd"
  },
  {
    "assetId": "office_pc_workstation_set",
    "category": "OFFICE",
    "icon": "🖥️",
    "badge": "SimReady USD",
    "title": "CAD/CAM 모니터·키보드·PC 세트",
    "sub": "27인치 모니터 + 키보드 + 마우스 + 워크스테이션",
    "dims": [
      780,
      520,
      540
    ],
    "defaultMaterial": "PP_GF30_Structural_Grey",
    "usdPath": "nvidia_isaac_assets/sm_officemonitor_a01_01/sm_officemonitor_a01_01.usd"
  },
  {
    "assetId": "office_laser_printer",
    "category": "OFFICE",
    "icon": "📠",
    "badge": "SimReady USD",
    "title": "사무실 레이저 복합기/프린터",
    "sub": "네트워크 A3/A4 레이저 프린터 & 급지대",
    "dims": [
      560,
      540,
      520
    ],
    "defaultMaterial": "PP_Natural_SealGrade",
    "usdPath": "nvidia_isaac_assets/sm_officeprinter_a01_01/sm_officeprinter_a01_01.usd"
  },
  {
    "assetId": "office_file_cabinet",
    "category": "OFFICE",
    "icon": "🗄️",
    "badge": "SimReady USD",
    "title": "철제 4단 서류 파일 캐비닛",
    "sub": "도면 및 품질 보증 문서 보관 캐비닛",
    "dims": [
      480,
      620,
      1340
    ],
    "defaultMaterial": "SUS_304_306_Brushed_2B",
    "usdPath": "nvidia_isaac_assets/cabinet_file_a01/sm_cabinet_file_a01_01.usd"
  },
  {
    "assetId": "office_trash_and_paper",
    "category": "OFFICE",
    "icon": "🗑️",
    "badge": "SimReady USD",
    "title": "사무실 휴지통 & A4 용지팩",
    "sub": "블랙 오피스 휴지통 및 A4 복사용지 묶음",
    "dims": [
      360,
      320,
      420
    ],
    "defaultMaterial": "PP_GF30_Structural_Grey",
    "usdPath": "nvidia_isaac_assets/SM_OfficeTrashCan_A03_Black_01/SM_OfficeTrashCan_A03_Black_01.usd"
  },
  {
    "assetId": "stainless_worktable_sus316",
    "category": "INDUSTRIAL",
    "icon": "🛠️",
    "badge": "SUS 304 / 316",
    "title": "스테인리스 정밀 작업대 (A03)",
    "sub": "SUS 316 전해연마 상판 후처리·측정 테이블",
    "dims": [
      1800,
      900,
      860
    ],
    "defaultMaterial": "SUS_316L_Electropolished",
    "usdPath": "nvidia_isaac_assets/SM_MetalStainlessTable_A03_01/SM_MetalStainlessTable_A03_01.usd"
  },
  {
    "assetId": "stainless_ibc_tank",
    "category": "INDUSTRIAL",
    "icon": "🛢️",
    "badge": "SUS 316L",
    "title": "스테인리스 316L IBC 화학 탱크",
    "sub": "1,000L 스테인리스 스틸 액체/세척액 저장조",
    "dims": [
      1200,
      1000,
      1160
    ],
    "defaultMaterial": "SUS_316L_Electropolished",
    "usdPath": "nvidia_isaac_assets/SM_StainlessSteelIBCTank_A01_01/SM_StainlessSteelIBCTank_A01_01.usd"
  },
  {
    "assetId": "operator_computer_cart",
    "category": "INDUSTRIAL",
    "icon": "🛒",
    "badge": "SimReady USD",
    "title": "현장 제어용 모바일 컴퓨터 카트",
    "sub": "CNC·3D프린터 연동 이동식 HMI 터미널 카트",
    "dims": [
      680,
      620,
      1180
    ],
    "defaultMaterial": "SUS_304_306_Brushed_2B",
    "usdPath": "nvidia_isaac_assets/SM_ComputerCart_A01_01/SM_ComputerCart_A01_01.usd"
  },
  {
    "assetId": "flammable_safety_cabinet",
    "category": "INDUSTRIAL",
    "icon": "⚠️",
    "badge": "SimReady USD",
    "title": "황색 방폭 위험물 안전 캐비닛",
    "sub": "세척 용제 및 금속 분말 방폭 보관함",
    "dims": [
      1090,
      460,
      1120
    ],
    "defaultMaterial": "SUS_304_306_Brushed_2B",
    "usdPath": "nvidia_isaac_assets/SM_FlammableDrumCabinet_A02_01/SM_FlammableDrumCabinet_A02_01.usd"
  },
  {
    "assetId": "safety_guardrail_a09",
    "category": "INDUSTRIAL",
    "icon": "🚧",
    "badge": "SimReady USD",
    "title": "공장 안전 가드레일 (A09)",
    "sub": "설비 구획 보호용 황색 강관 가드레일",
    "dims": [
      2000,
      220,
      1050
    ],
    "defaultMaterial": "SUS_304_306_Brushed_2B",
    "usdPath": "nvidia_isaac_assets/SM_GuardRail_A09_01/SM_GuardRail_A09_01.usd"
  }
];
LEGACY_V1_ASSETS.forEach(a => {
  if (!ASSET_CATALOG.some(b => (b.assetId || b.id) === a.assetId)) ASSET_CATALOG.push(a);
});
// Catalog items that have no model of their own reuse the realistic model of the same machine type.
const ASSET_BUILDER_ALIAS = { '3DP_METAL_DMLS': 'slm_eos_m290', CNC_5AXIS_MILL: 'cnc_router_3axis' };
ASSET_CATALOG.unshift({
  assetId: 'cnc_router_3axis', category: 'CNC_3DP', icon: '🛠️', badge: 'CNC Router (판재)',
  name: '3축 CNC 라우터 (판재 가공)', desc: '갠트리형 판재 가공기 — 빠른 스케치 부품을 실제 공구 경로로 가공 (치수·속도 가정값)',
  dims: [3600, 2100, 2000], defaultMaterial: 'PP_GF30_Structural_Grey', color: '#0284c7'
});
// ASSET_CATALOG 스키마 정규화 (dims <-> sizeMm, title <-> name, assetId <-> id 완벽 호환)
ASSET_CATALOG.forEach(item => {
  item.assetId = item.assetId || item.id;
  item.id = item.id || item.assetId;
  item.title = item.title || item.name || item.assetId;
  item.name = item.name || item.title;
  item.sub = item.sub || item.desc || '';
  item.desc = item.desc || item.sub;
  item.dims = item.dims || item.sizeMm || [1200, 1000, 1200];
  item.sizeMm = item.sizeMm || item.dims;
  item.badge = item.badge || item.tag || 'Standard';
  item.tag = item.tag || item.badge;
  item.defaultMaterial = item.defaultMaterial || item.materialHint || 'PP_POLYPROPYLENE';
  item.icon = item.icon || '📦';
  item.color = item.color || '#38bdf8';
});


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
  camera.position.set(22000, -16000, 14500);   // provisional; setView() places it from the building size once the layout loads

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
  initOrbitPivot();

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
    // undo snapshot is taken when the drag STARTS (it used to be taken at the end, so Ctrl+Z restored
    // the already-moved state and seemed to do nothing)
    if (event.value && selectedObject) pushUndoState();
    if (!event.value && selectedObject) syncInspectorFromSelected();
  });
  transformControl.addEventListener('change', () => {
    if (selectedObject) {
      if (selectBoxHelper) selectBoxHelper.update();
      syncInspectorFromSelected();
    }
  });
  // three r169+: TransformControls is a controller, its visible gizmo is getHelper()
  scene.add(transformControl.getHelper ? transformControl.getHelper() : transformControl);

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

  // UI 초기화 (에러 격리)
  try {
    if (typeof initFloatingWindows === 'function') initFloatingWindows();
  } catch (e) {
    console.warn('initFloatingWindows warning:', e);
  }

  try {
    renderAssetDrawer('ALL');
  } catch (e) {
    console.warn('renderAssetDrawer warning:', e);
  }

  try {
    renderMaterialStudio();
  } catch (e) {
    console.warn('renderMaterialStudio warning:', e);
  }

  try {
    setupInteractions(container);
  } catch (e) {
    console.warn('setupInteractions warning:', e);
  }

  // 아코디언 카드 접기/펼치기 이벤트 바인딩 (사이드바 카드 모듈식 접기/펼치기 지원)
  try {
    document.querySelectorAll('.sb-card-title').forEach(titleEl => {
      titleEl.addEventListener('click', () => {
        const card = titleEl.closest('.sb-card');
        if (card) card.classList.toggle('collapsed');
      });
    });
  } catch (e) {
    console.warn('accordion init warning:', e);
  }

  // 3D 씬 부재 & 모델 로드 & 애니메이션 루프 시작 (절대 중단되지 않음)
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
    document.querySelectorAll('.drawer-cats .btn-tb, .drawer-tab').forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
  }

  const container = document.getElementById('asset-drawer-cards') || document.getElementById('asset-grid-container');
  if (!container) return;
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
        <span>${(asset.dims || asset.sizeMm || [0,0,0])[0]}×${(asset.dims || asset.sizeMm || [0,0,0])[1]}×${(asset.dims || asset.sizeMm || [0,0,0])[2]}</span>
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
    if (isLaserMeasureActive) {
      const hits = raycaster.intersectObjects(scene.children, true);
      if (hits.length > 0) {
        handleLaserMeasurementClick(hits[0].point);
        e.stopPropagation();
        return;
      }
    }

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
  const rig = group.userData.rig;               // moving-axis groups from the builder (if any)
  group.userData = {
    isEditableAsset: true,
    instanceId: `inst_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    assetId: assetDef.assetId,
    title: assetDef.title,
    baseDims: [...assetDef.dims],
    materialId: matKey,
    usdPath: assetDef.usdPath
  };
  if (rig) Object.defineProperty(group.userData, 'rig', { value: rig, enumerable: false, writable: true, configurable: true });

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
    document.getElementById('sel-obj-badge').innerText = (isBuildingPart(obj) ? '🏗 ' : '') + obj.name;
    syncInspectorFromSelected();
    highlightSelectedMaterialSwatch(obj.userData.materialId);
  } else {
    transformControl.detach();
    document.getElementById('sel-obj-badge').innerText = '선택 없음';
    const bDim = document.getElementById('sel-bbox-dim'); if (bDim) bDim.innerText = '- × - × - mm';
    const sMass = document.getElementById('val-selected-mass'); if (sMass) sMass.innerText = '- kg';
  }
  updateOutlinerUI();
}
window.selectAssetObject = selectAssetObject;
window.selectObject = selectAssetObject;

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
  const bDim = document.getElementById('sel-bbox-dim'); if (bDim) bDim.innerText = `${wx.toLocaleString()} × ${wy.toLocaleString()} × ${wz.toLocaleString()} mm`;
  if (isBuildingPart(selectedObject)) {
    const sMass = document.getElementById('val-selected-mass'); if (sMass) sMass.innerText = '건물 부재';
    return;
  }

  const matSpec = INDUSTRIAL_MATERIALS[selectedObject.userData.materialId] || INDUSTRIAL_MATERIALS.SUS_304_306_Brushed_2B;
  const volM3 = (wx / 1000) * (wy / 1000) * (wz / 1000) * 0.28;
  const massKg = (volM3 * matSpec.densityKgM3).toFixed(1);
  const sMass = document.getElementById('val-selected-mass'); if (sMass) sMass.innerText = `${Number(massKg).toLocaleString()} kg`;
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
  const orig = isBuildingPart(selectedObject) && buildingOriginals.get(selectedObject.userData.cloneOf || selectedObject.name);
  if (orig && !selectedObject.userData.cloneOf) {             // building part: back to where it was drawn
    selectedObject.position.copy(orig.pos); selectedObject.quaternion.copy(orig.quat); selectedObject.scale.copy(orig.scale);
  } else {
    selectedObject.scale.set(1, 1, 1);
    selectedObject.rotation.set(0, 0, 0);
  }
  if (selectBoxHelper) selectBoxHelper.update();
  syncInspectorFromSelected();
}

function snapSelectedToFloor() {
  if (!selectedObject) return;
  pushUndoState();
  if (isBuildingPart(selectedObject)) {
    // origin is the part centre: lift/lower so the bottom of the part touches Z = 0
    selectedObject.updateMatrixWorld(true);
    selectedObject.position.z -= new THREE.Box3().setFromObject(selectedObject).min.z;
  } else selectedObject.position.z = 0;
  if (selectBoxHelper) selectBoxHelper.update();
  syncInspectorFromSelected();
  log(`[SNAP] '${selectedObject.name}' 바닥면(Z=0mm) 밀착 완료`);
}

function duplicateSelected() {
  if (!selectedObject) return;
  if (isBuildingPart(selectedObject)) {
    pushUndoState();
    const src = selectedObject.userData.cloneOf || selectedObject.name;
    const m = makeBuildingClone(src);
    if (!m) return;
    setXform(m, xformOf(selectedObject));
    m.position.x += 600; m.position.y += 600;
    selectAssetObject(m);
    log(`[DUPLICATE] 건물 부재 '${src}' → '${m.name}' 복제`);
    return;
  }
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
  if (isBuildingPart(selectedObject)) {
    const m = selectedObject;
    selectAssetObject(null);
    if (m.parent) m.parent.remove(m);
    log(`[DELETE] 건물 부재 '${name}' 삭제 (Ctrl+Z로 복원, 레이아웃 저장 시 유지)`);
    return;
  }
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

// ----------------------------------------------------------------------------
// Orbit around selection: when the user starts rotating the view (drag with the rotate button) while an
// object is selected, the orbit pivot glides (a pan, ~0.25 s) to the selection's bounding-box centre, so the
// camera revolves around that object. Selecting alone never moves the camera (gizmo editing is undisturbed);
// pan / wheel / WASD still move freely, and the next rotate re-centres on the selection.
// ----------------------------------------------------------------------------
const orbitPivot = { enabled: true, armed: false, x: 0, y: 0, button: -1, mod: false, glide: null };
function selectionCenter(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  return box.isEmpty() ? obj.getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
}
function initOrbitPivot() {
  // capture phase on window: runs before OrbitControls' own pointerdown handler
  window.addEventListener('pointerdown', e => {
    if (e.target !== renderer.domElement) return;
    orbitPivot.button = e.button; orbitPivot.x = e.clientX; orbitPivot.y = e.clientY;
    orbitPivot.mod = e.ctrlKey || e.metaKey || e.shiftKey;      // OrbitControls turns modifier+rotate into pan
  }, true);
  controls.addEventListener('start', () => { orbitPivot.armed = true; });
  controls.addEventListener('end', () => { orbitPivot.armed = false; });
  window.addEventListener('pointermove', e => {
    if (!orbitPivot.armed) return;
    if (Math.hypot(e.clientX - orbitPivot.x, e.clientY - orbitPivot.y) < 4) return;   // a click, not a drag
    orbitPivot.armed = false;
    const mb = controls.mouseButtons;
    const action = orbitPivot.button === 0 ? mb.LEFT : orbitPivot.button === 1 ? mb.MIDDLE : orbitPivot.button === 2 ? mb.RIGHT : -1;
    if (action !== THREE.MOUSE.ROTATE || orbitPivot.mod) return;
    if (!orbitPivot.enabled || !selectedObject || !selectedObject.parent) return;
    const c = selectionCenter(selectedObject);
    if (c.distanceTo(controls.target) > 1) orbitPivot.glide = { to: c };
  });
}
function updateOrbitPivot(dt) {
  const g = orbitPivot.glide;
  if (!g) return;
  const rest = g.to.clone().sub(controls.target);
  const step = rest.length() < 1 ? rest : rest.multiplyScalar(1 - Math.exp(-dt / 0.06));
  controls.target.add(step);
  camera.position.add(step);                       // pan: the view keeps its angle and distance
  if (g.to.distanceTo(controls.target) < 1) orbitPivot.glide = null;
}
window.orbitPivot = orbitPivot;

// ----------------------------------------------------------------------------
// Building parts (architecture shell from factory_precision.obj / model.obj): select each part, move it,
// delete it, duplicate it. Edits are kept as { removed, moved, clones } in scene_layout.json ("building")
// and in the undo stack. The floor slab and floor joints stay locked so a click on the floor selects nothing.
// ----------------------------------------------------------------------------
const BUILDING_LOCKED = /^(Floor_Slab|Joint_[XY]_)/;
const buildingOriginals = new Map();   // name -> { mesh, pos, quat, scale }
const buildingClones = new Map();      // name -> mesh
let pendingBuildingState = null;
let buildingCloneSeq = 1;

function isBuildingPart(o) { return !!(o && o.isMesh && o.userData && o.userData.isBuildingPart); }

/** Move a mesh's origin to its geometry centre without moving it in the world (gizmo appears on the part). */
function repivotMesh(m) {
  m.geometry.computeBoundingBox();
  const c = m.geometry.boundingBox.getCenter(new THREE.Vector3());
  if (c.lengthSq() < 1) return;
  m.geometry.translate(-c.x, -c.y, -c.z);
  m.children.forEach(k => { if (k.geometry) k.geometry.translate(-c.x, -c.y, -c.z); });
  m.position.add(c.clone().multiply(m.scale).applyQuaternion(m.quaternion));
  m.updateMatrixWorld(true);
}

function initBuildingParts(group) {
  group.children.slice().forEach(m => {
    if (!m.isMesh || !m.name || BUILDING_LOCKED.test(m.name) || buildingOriginals.has(m.name)) return;
    repivotMesh(m);
    m.geometry.computeBoundingBox();
    const s = m.geometry.boundingBox.getSize(new THREE.Vector3());
    m.userData.isBuildingPart = true;
    m.userData.baseDims = [Math.round(s.x), Math.round(s.y), Math.round(s.z)];
    buildingOriginals.set(m.name, { mesh: m, pos: m.position.clone(), quat: m.quaternion.clone(), scale: m.scale.clone() });
  });
  if (pendingBuildingState) { const st = pendingBuildingState; pendingBuildingState = null; applyBuildingState(st); }
  log(`[BUILDING] 건물 부재 ${buildingOriginals.size}개 선택·이동·삭제·복제 가능 (바닥 슬래브는 고정)`);
}

const xformOf = m => ({
  pos: m.position.toArray().map(v => Math.round(v * 10) / 10),
  rot: [m.rotation.x, m.rotation.y, m.rotation.z].map(r => Math.round(THREE.MathUtils.radToDeg(r) * 100) / 100),
  scale: m.scale.toArray().map(v => Number(v.toFixed(4)))
});
function setXform(m, t) {
  if (t.pos) m.position.fromArray(t.pos);
  if (t.rot) m.rotation.set(...t.rot.map(d => THREE.MathUtils.degToRad(d)));
  if (t.scale) m.scale.fromArray(t.scale);
}

function serializeBuilding() {
  const removed = [], moved = {}, clones = [];
  buildingOriginals.forEach((o, name) => {
    if (!o.mesh.parent) { removed.push(name); return; }
    const m = o.mesh;
    if (m.position.distanceTo(o.pos) > 0.05 || Math.abs(m.quaternion.angleTo(o.quat)) > 1e-5 || m.scale.distanceTo(o.scale) > 1e-5) moved[name] = xformOf(m);
  });
  buildingClones.forEach((m, name) => { if (m.parent) clones.push(Object.assign({ name, source: m.userData.cloneOf }, xformOf(m))); });
  return { removed, moved, clones };
}

function makeBuildingClone(sourceName, name) {
  const src = buildingOriginals.get(sourceName);
  if (!src || !factoryMeshGroup) return null;
  const m = src.mesh.clone();                                // geometry shared, materials cloned below
  m.material = src.mesh.material.clone();
  m.children.forEach(k => { if (k.material) k.material = k.material.clone(); });
  let n = name;
  while (!n || buildingClones.has(n) || buildingOriginals.has(n)) n = `${sourceName}_copy${buildingCloneSeq++}`;
  m.name = n;
  m.userData = { isBuildingPart: true, cloneOf: sourceName, baseDims: (src.mesh.userData.baseDims || []).slice() };
  if (typeof exteriorCladdingMeshes !== 'undefined' && exteriorCladdingMeshes.includes(src.mesh)) exteriorCladdingMeshes.push(m);
  factoryMeshGroup.add(m);
  buildingClones.set(n, m);
  return m;
}

function applyBuildingState(st) {
  if (!factoryMeshGroup || !buildingOriginals.size) { pendingBuildingState = st || null; return; }
  st = st || {};
  if (isBuildingPart(selectedObject)) selectAssetObject(null);
  const removedList = st.removed === 'DEFAULT_EMPTY_SHELL' ? [...buildingOriginals.keys()].filter(n => !DEFAULT_SHELL_KEEP.test(n)) : (st.removed || []);
  const removed = new Set(removedList), moved = st.moved || {};
  buildingOriginals.forEach((o, name) => {
    if (removed.has(name)) { if (o.mesh.parent) o.mesh.parent.remove(o.mesh); return; }
    if (!o.mesh.parent) factoryMeshGroup.add(o.mesh);
    if (moved[name]) setXform(o.mesh, moved[name]);
    else { o.mesh.position.copy(o.pos); o.mesh.quaternion.copy(o.quat); o.mesh.scale.copy(o.scale); }
  });
  buildingClones.forEach(m => { if (m.parent) m.parent.remove(m); });
  buildingClones.clear();
  (st.clones || []).forEach(c => { const m = makeBuildingClone(c.source, c.name); if (m) setXform(m, c); });
}

/**
 * Click picking over placed assets + building parts. Nearest opaque hit wins; see-through cladding and glass
 * (opacity < 0.6) are only picked when nothing opaque lies behind them, or with Alt+click (frontmost).
 * A hit on the locked floor ends the search.
 */
function pickSelectable(alt) {
  const roots = [placedAssetsGroup];
  if (factoryMeshGroup) roots.push(factoryMeshGroup);
  const hits = raycaster.intersectObjects(roots, true);
  let firstSeeThrough = null;
  for (const h of hits) {
    const o = h.object;
    if (!o.isMesh || !o.visible) continue;
    let target = null;
    let p = o;
    while (p && p.parent !== placedAssetsGroup && p !== placedAssetsGroup) p = p.parent;
    if (p && p.parent === placedAssetsGroup) target = p.userData && p.userData.isEditableAsset ? p : null;
    else if (isBuildingPart(o)) target = o;
    else if (o.name && BUILDING_LOCKED.test(o.name)) break;     // the floor
    if (!target) continue;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const seeThrough = mat && mat.transparent && mat.opacity < 0.6;
    if (alt || !seeThrough) return target;
    if (!firstSeeThrough) firstSeeThrough = target;
  }
  return firstSeeThrough;
}
window.buildingEdits = { serialize: serializeBuilding, apply: applyBuildingState, originals: buildingOriginals, clones: buildingClones };

function setTransformMode(mode) {
  transformControl.setMode(mode);
  document.getElementById('btn-mode-translate').classList.toggle('active', mode === 'translate');
  document.getElementById('btn-mode-rotate').classList.toggle('active', mode === 'rotate');
  document.getElementById('btn-mode-scale').classList.toggle('active', mode === 'scale');
}

function toggleTransformSpace() {
  const next = transformControl.space === 'world' ? 'local' : 'world';
  transformControl.setSpace(next);
  const btnSp = document.getElementById('btn-space-toggle'); if (btnSp) btnSp.innerText = next === 'world' ? '🌐 World' : '📦 Local';
}

function toggleGridSnap() {
  isGridSnap = !isGridSnap;
  const btn = document.getElementById('btn-snap-toggle');
  btn.classList.toggle('active', isGridSnap);
  btn.innerText = isGridSnap ? '🧲 그리드 스냅 ON' : '🧲 그리드 스냅 OFF';
  updateSnapSettings();
}

function updateSnapSettings() {
  const elGrid = document.getElementById('sel-grid-snap'); if (elGrid) gridSnapStep = parseInt(elGrid.value, 10) || 100;
  const elRot = document.getElementById('sel-rot-snap'); if (elRot) rotSnapStepDeg = parseInt(elRot.value, 10) || 15;
  transformControl.setTranslationSnap(isGridSnap ? gridSnapStep : null);
  transformControl.setRotationSnap(isGridSnap ? THREE.MathUtils.degToRad(rotSnapStepDeg) : null);
}

// ============================================================================
// 8. 엔지니어링 메테리얼 스튜디오 (실제 NVIDIA SimReady 노멀/ORM 텍스처 연동)
// ============================================================================
function renderMaterialStudio() {
  const container = document.getElementById('material-swatch-grid') || document.getElementById('mat-grid');
  if (!container) return;
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
    const elMatP = document.getElementById('mat-physics-readout'); if (elMatP) elMatP.innerHTML = `
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
  const elPlacedBadge = document.getElementById('placed-count-badge'); if (elPlacedBadge) elPlacedBadge.innerText = `${placedObjects.length} EA`;
  const elBodyCount = document.getElementById('val-body-count'); if (elBodyCount) elBodyCount.innerText = `226 + ${placedObjects.length} EA`;
  // index_v2.html has no #outliner-list; without this guard the throw aborted the
  // rest of loadInitialSceneLayout() (e.g. restoring the saved cargo-gate wall).
  const list = document.getElementById('outliner-list');
  if (!list) return;
  list.innerHTML = '';

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
  undoStack.push(JSON.stringify({ items: serializeCurrentScene(), building: serializeBuilding() }));
  if (undoStack.length > 25) undoStack.shift();
}

function undoLastAction() {
  if (undoStack.length === 0) {
    log('[UNDO] 더 이상 실행 취소할 이력이 없습니다.');
    return;
  }
  const prev = JSON.parse(undoStack.pop());
  if (Array.isArray(prev)) rebuildPlacedAssetsFromList(prev);       // entries from before building edits existed
  else {
    rebuildPlacedAssetsFromList(prev.items || []);
    applyBuildingState(prev.building);
  }
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
window.selectAssetObject = selectAssetObject;
window.selectObject = selectAssetObject;

function loadInitialSceneLayout() {
  fetch('/api/layout')
    .then(r => r.json())
    .then(data => {
      // deferred until the shell OBJ has loaded; no saved building state → default removals
      applyBuildingState(data && data.building ? data.building : { removed: DEFAULT_BUILDING_REMOVED, moved: {}, clones: [] });
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        rebuildPlacedAssetsFromList(data.items);
        log(`[LAYOUT] 저장된 씬 레이아웃(${data.items.length}개 에셋) 로드 완료.`);
      } else {
        rebuildPlacedAssetsFromList(DEFAULT_SCENE_PLACEMENTS);
        log(`[LAYOUT] 기본 배치: CNC 장비 ${DEFAULT_SCENE_PLACEMENTS.length}대(라우터·선반).`);
      }

      // 게이트 설치 벽면 기본값 복원 (서버 저장값 우선 -> 로컬 스토리지 -> 기본값 NORTH)
      const targetWall = (data && data.gateConfig && data.gateConfig.installedWall) 
        ? data.gateConfig.installedWall 
        : (localStorage.getItem('cargoGateWall') || 'NORTH');
      relocateCargoGate(targetWall, false);

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
      applyBuildingState({ removed: DEFAULT_BUILDING_REMOVED, moved: {}, clones: [] });
      rebuildPlacedAssetsFromList(DEFAULT_SCENE_PLACEMENTS);
      const targetWall = localStorage.getItem('cargoGateWall') || 'NORTH';
      relocateCargoGate(targetWall, false);
    });
}

function saveSceneLayoutToServer() {
  const payload = {
    updatedAt: new Date().toISOString(),
    coordinateSystem: 'Right-Handed Z-Up (mm)',
    gateConfig: {
      defaultWall: 'NORTH',
      installedWall: currentGateWall || 'NORTH',
      positionY: 16000,
      description: '북측 하역장 전면 메인 오버헤드 섹셔널 도어 (기본값 고정)'
    },
    items: serializeCurrentScene(),
    building: serializeBuilding()
  };
  fetch('/api/layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(res => {
      if (res.success) {
        log(`[SAVED] 총 ${res.count}개 에셋 및 화물 게이트 기본 위치(북측 Y=16m)가 서버(scene_layout.json)에 저장되었습니다.`);
        const badge = document.getElementById('solver-badge');
        if (badge) badge.innerText = 'SYNC SAVED ✓';
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

    const target = pickSelectable(e.altKey);
    if (target) selectAssetObject(target);
  });

  container.addEventListener('mousemove', onMouseMove);

  
// ============================================================================
// 🖥️ Unreal Engine 5 & Linear Modern Workspace Controls
// ============================================================================
let isDrawerOpen = false;
let isZenMode = false;
let activeSidebarTab = 'inspector';

function toggleContentDrawer(forceOpen = null) {
  isDrawerOpen = forceOpen !== null ? forceOpen : !isDrawerOpen;
  const drawer = document.getElementById('content-drawer');
  if (drawer) {
    drawer.classList.toggle('open', isDrawerOpen);
  }
}
window.toggleContentDrawer = toggleContentDrawer;

function toggleRightSidebar() {
  document.body.classList.toggle('sidebar-open');
  const btn = document.getElementById('btn-toggle-sidebar');
  const isOpen = document.body.classList.contains('sidebar-open');
  if (btn) btn.classList.toggle('active', isOpen);
  setTimeout(onWindowResize, 280);
}
window.toggleRightSidebar = toggleRightSidebar;

function toggleZenMode() {
  isZenMode = !isZenMode;
  document.body.classList.toggle('zen-mode', isZenMode);
  const btn = document.getElementById('btn-toggle-zen');
  if (btn) btn.classList.toggle('active', isZenMode);
  if (isZenMode) {
    toggleContentDrawer(false);
    log('🖥️ [Zen Mode] 3D 디지털 트윈 몰입 뷰포트 활성화 (Tab 키로 복귀)');
  } else {
    log('🖥️ [Studio Mode] 편집 스튜디오 복귀');
  }
  setTimeout(onWindowResize, 280);
}
window.toggleZenMode = toggleZenMode;

function toggleSidebarCollapse(forceOpen = null) {
  const isCurrentlyOpen = document.body.classList.contains('sidebar-open');
  const targetOpen = (forceOpen !== null) ? forceOpen : !isCurrentlyOpen;

  document.body.classList.toggle('sidebar-open', targetOpen);

  const collapseIcon = document.getElementById('sidebar-collapse-icon');
  if (collapseIcon) {
    collapseIcon.innerText = targetOpen ? '▶ 접기' : '◀ 펼치기';
  }

  const floatBtn = document.getElementById('btn-floating-sidebar-expand');
  if (floatBtn) {
    floatBtn.style.display = targetOpen ? 'none' : 'flex';
  }

  setTimeout(onWindowResize, 200);
}
window.toggleSidebarCollapse = toggleSidebarCollapse;

function switchRightSidebarTab(tabName) {
  // 2026-11-09 UI 정리: 탭 5개 → 3개. 예전 이름으로 부르는 코드는 새 탭으로 연결합니다.
  tabName = ({ gates: 'plant', plc: 'plant', layout: 'inspector' })[tabName] || tabName;
  activeSidebarTab = tabName;
  const tabs = ['inspector', 'modeling', 'plant'];
  tabs.forEach(t => {
    const btn = document.getElementById('tab-btn-' + t);
    const pane = document.getElementById('pane-' + t);
    if (btn) btn.classList.toggle('active', t === tabName);
    if (pane) pane.classList.toggle('active', t === tabName);
  });

  const dd = document.getElementById('sidebar-menu-dropdown');
  if (dd && dd.value !== tabName) dd.value = tabName;

  // 사이드바가 접혀있다면 즉시 펼쳐서 내용 표시
  if (!document.body.classList.contains('sidebar-open')) {
    toggleSidebarCollapse(true);
  }

  const tabLabels = {
    inspector: '📐 배치 · 생산',
    modeling: '✏️ 만들기',
    plant: '⚙ 설비 · 신호'
  };
  log(`📋 [작업 패널 전환] [${tabLabels[tabName] || tabName}] 패널이 활성화되었습니다.`);
}
window.switchRightSidebarTab = switchRightSidebarTab;

function switchViewportPreset(preset) {
  // The mode functions below are on/off flips. Return to the plain state first so every preset
  // starts clean (before: going wireframe → 사실적 left everything in wireframe).
  if (isWireframe) toggleWireframe();
  if (isXRay) toggleXRay();
  if (typeof isSplatVisible !== 'undefined' && isSplatVisible) toggleGaussianSplats();
  isPhotorealPBR = true;
  isWireframeVisible = false;
  isCadEdgesVisible = preset === 'cad_edges';
  if (preset === 'xray') toggleXRay();
  else if (preset === 'wireframe') toggleWireframe();
  else if (preset === 'splat') toggleGaussianSplats();

  // Update Three.js materials (textured surfaces from visual_upgrade.js keep their own reflection strength)
  scene.traverse(c => {
    if (c.isMesh && c.material) {
      const textured = typeof c.material.name === 'string' && c.material.name.startsWith('surface:');
      if ('envMapIntensity' in c.material && !textured) c.material.envMapIntensity = 1.0;
      if (c.userData.isCadEdge) c.visible = isCadEdgesVisible;
    }
  });
  log('🎨 뷰포트 모드 전환: ' + preset);
}
window.switchViewportPreset = switchViewportPreset;


window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    
    // [Ctrl + Space]: UE5 Content Drawer Slide Toggle
    if (e.ctrlKey && e.code === 'Space') {
      e.preventDefault();
      toggleContentDrawer();
      return;
    }

    // [Tab]: Zen Mode Toggle
    if (e.code === 'Tab' && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      toggleZenMode();
      return;
    }

    // [F4]: Right Inspector Sidebar Toggle
    if (e.code === 'F4') {
      e.preventDefault();
      toggleRightSidebar();
      return;
    }

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
      case 'BracketLeft':
        e.preventDefault();
        setCameraSpeedMultiplier(cameraSpeedScalar - 0.2);
        break;
      case 'BracketRight':
        e.preventDefault();
        setCameraSpeedMultiplier(cameraSpeedScalar + 0.2);
        break;
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
  if (label) label.innerText = `${cameraSpeedScalar.toFixed(1)}x`;

  const hud = document.getElementById('footer-speed-pill') || document.getElementById('hud-speed');
  if (hud) {
    const curMps = ((baseCameraSpeed * cameraSpeedScalar) / 1000).toFixed(1);
    hud.innerText = `🏃 ${cameraSpeedScalar.toFixed(1)}x (${curMps} m/s)`;
  }

  if (controls) {
    controls.panSpeed = 1.0 * Math.max(0.5, Math.min(2.5, cameraSpeedScalar));
  }

  if (showLog) {
    const mps = ((baseCameraSpeed * cameraSpeedScalar) / 1000).toFixed(1);
    log(`🏃 카메라 이동 속도 조절: ${cameraSpeedScalar.toFixed(1)}x (${mps} m/s, ${(baseCameraSpeed * cameraSpeedScalar).toLocaleString()} mm/s)`);
  }
}
window.setCameraSpeedMultiplier = setCameraSpeedMultiplier;

function updateWASDCameraMovement(dt) {
  const isMoving = moveKeys.KeyW || moveKeys.KeyA || moveKeys.KeyS || moveKeys.KeyD || moveKeys.KeyQ || moveKeys.KeyE;
  if (!isMoving) return;

  const sprint = (moveKeys.ShiftLeft || moveKeys.ShiftRight) ? 3.0 : 1.0;
  const effectiveMult = cameraSpeedScalar * sprint;
  const speed = baseCameraSpeed * effectiveMult * dt;

  const hud = document.getElementById('footer-speed-pill') || document.getElementById('hud-speed');
  if (hud) {
    const curMps = ((baseCameraSpeed * effectiveMult) / 1000).toFixed(1);
    hud.innerText = `🏃 ${effectiveMult.toFixed(1)}x (${curMps} m/s)${sprint > 1 ? ' [부스트 ⚡]' : ''}`;
  }

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
// Building dimensions. Defaults describe the original 24 x 16 m model; tools/build_factory_shell.mjs writes
// building_meta.json next to the OBJ it generates, and everything size-dependent (camera views, floor grid,
// gate position) is derived from this object instead of fixed coordinates.
let BUILDING = { lengthX: 24000, widthY: 16000, eave: 7200, ridge: 8400, door: { wall: 'NORTH', centerX: 14500, legacyCenterX: 14500, legacyWallY: 16000 } };
window.getBuilding = () => BUILDING;

function applyBuildingDims() {
  const cx = BUILDING.lengthX / 2, cy = BUILDING.widthY / 2, span = Math.max(BUILDING.lengthX, BUILDING.widthY);
  if (gridHelper) {
    scene.remove(gridHelper);
    const size = Math.ceil(span * 1.3 / 1000) * 1000;
    gridHelper = new THREE.GridHelper(size, size / 1000, 0x38bdf8, 0x1e293b);
    gridHelper.rotation.x = Math.PI / 2; gridHelper.position.set(cx, cy, 3);
    gridHelper.material.transparent = true; gridHelper.material.opacity = 0.18;
    scene.add(gridHelper);
  }
  if (floorHitPlane) floorHitPlane.position.set(cx, cy, 0);
  if (floorReflector) floorReflector.position.set(cx, cy, -4);
  if (scene.fog && scene.fog.isFogExp2) scene.fog.density = Math.min(scene.fog.density, 0.19 / span);   // keep the far end of a big hall visible
}

function loadPrecisionModel() {
  fetch('/building_meta.json').then(r => (r.ok ? r.json() : null)).catch(() => null).then(meta => {
    if (meta && meta.lengthX > 0 && meta.widthY > 0) BUILDING = Object.assign({}, BUILDING, meta, { door: Object.assign({}, BUILDING.door, meta.door || {}) });
    applyBuildingDims();
    loadPrecisionModelNow();
  });
}

function loadPrecisionModelNow() {
  const loader = new THREE.OBJLoader();
  // GitHub Pages(정적, 서브경로)에서는 상대경로로, 로컬 서버에서는 /model.obj 라우트로
  const onShellLoaded = (obj) => {
    if (factoryMeshGroup) scene.remove(factoryMeshGroup);
    factoryMeshGroup = obj;

    obj.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const name = child.name || '';
        meshesByName[name] = child;

        // 모든 건축 쉘 메쉬에 월드 스케일 기반 UV/UV2 자동 생성 (원본 STEP은 B-Rep, 여기서는 OBJ 메쉬)
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
            transparent: exteriorWallOpacity < 0.98,
            opacity: exteriorWallOpacity,
            depthWrite: exteriorWallOpacity > 0.55
          });
          exteriorCladdingMeshes.push(child);
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
    setupCargoGateAssembly(obj);
    initBuildingParts(obj);
    const urlView = new URLSearchParams(window.location.search).get('view');
    if (urlView) setView(urlView);
    log('[PBR] 건축 쉘 메쉬(원본 SolidCraft STEP 226개 솔리드를 OBJ로 변환)에 골강판 노멀맵, 에폭시 바닥 반사, H-빔 스틸 셰이더 적용.');
  };
  loader.load('factory_precision.obj', onShellLoaded, undefined, () => loader.load('/model.obj', onShellLoaded));
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
  fetch('true_3dgs.bin')
    .then(res => { if (!res.ok) throw new Error('splat not found: ' + res.status); return res.arrayBuffer(); })
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
  const bSplat = document.getElementById('btn-splat'); if (bSplat) bSplat.classList.toggle('active', isSplatVisible);
}

function setView(mode) {
  const B = BUILDING, L = B.lengthX, W = B.widthY, span = Math.max(L, W), doorX = (B.door && B.door.centerX) || L / 2;
  if (mode === 'iso') {
    setExteriorWallOpacity(Math.min(exteriorWallOpacity, 0.40), false);
    camera.position.set(L * 1.04, -W * 1.12, span * 0.69);
    controls.target.set(L * 0.46, W * 0.47, 2500);
  } else if (mode === 'doors' || mode === 'cargo_gate') {
    camera.position.set(doorX, W - 11000, 2600);
    controls.target.set(doorX, W - 100, 2100);
  } else if (mode === 'hall') {                         // standing at the west end, looking down the length
    camera.position.set(3000, W * 0.5, 1700);
    controls.target.set(L, W * 0.5, 2600);
  } else {                                              // 'cnc_cell' and the old interior views: the machine area
    camera.position.set(2400, 14600, 3200);
    controls.target.set(8200, 10200, 950);
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

  // 가상 산업용 PLC 스캔 주기 실행 (50Hz / 20ms) - 에러 격리로 렌더 중단 방지
  try {
    if (typeof executePLCScanCycle === 'function') executePLCScanCycle();
  } catch (err) {
    console.warn('executePLCScanCycle warning:', err);
  }

  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  // 🚪 [Gate 1] 오버헤드 섹셔널 도어 물리 보간 루프
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
    // TorsionShaft는 벽면 고정 프레임 요소이므로 원점 회전 제거 (이상한 막대기 궤적 방지)
    if (gateWarningLight) {
      const flash = Math.sin(now * 0.015) > 0;
      gateWarningLight.intensity = flash ? 3.0 : 0.2;
    }
    updateGateUI();
  } else if (gateWarningLight && (gate1State.progress <= 0.01 || gate1State.progress >= 0.99)) {
    gateWarningLight.intensity = 0.0;
  }

  // 🚪 [Gate 2: 롤업 셔터 도어 삭제됨 - 단일 섹셔널 화물 게이트 운용]

  try {
    updateWASDCameraMovement(dt);
    updateOrbitPivot(dt);
  } catch (camErr) {
    console.warn('updateWASDCameraMovement warning:', camErr);
  }
  controls.update();

  const p = camera.position;
  const hudCoords = document.getElementById('hud-coords');
  if (hudCoords) {
    hudCoords.innerText = `X: ${Math.round(p.x).toLocaleString()}, Y: ${Math.round(p.y).toLocaleString()}, Z: ${Math.round(p.z).toLocaleString()} mm`;
  }

  try {
    // visual_upgrade.js renders through ambient occlusion + anti-aliasing when quality is 'high'
    if (window.twinVisual) window.twinVisual.render(); else renderer.render(scene, camera);
  } catch (renderErr) {
    console.error('Critical WebGL render error:', renderErr);
  }
}

window.onload = init3D;



// =====================================================================
// 플로팅 윈도우 드래그 & 리사이즈 & 위치 관리 시스템
// =====================================================================
let activeZIndex = 50;

function initFloatingWindows() {
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
}


// =====================================================================
// NVIDIA SIMREADY 카탈로그 모달 연동
// =====================================================================
const NVIDIA_SIMREADY_ASSETS = [
  { id: 'AMR_CARTER_V2', name: 'NVIDIA Isaac AMR Carter v2', tag: 'Mobile Robot', usdUrl: 'https://huggingface.co/datasets/nvidia/SimReady', desc: '물리 기반 충돌 바운딩 및 Jetson Orin 센서 마운트 포함' },
  { id: 'FORKLIFT_REACH_TRUCK', name: 'Yale Reach Truck Forklift', tag: 'Warehouse Vehicle', usdUrl: 'https://huggingface.co/datasets/nvidia/SimReady', desc: '고단 팔레트 적재 시뮬레이션을 위한 조향 및 틸트 키네마틱스 지원' },
  { id: 'PALLET_RACK_HEAVY_4TIER', name: 'Heavy Industrial Pallet Rack 4-Tier', tag: 'Logistics Storage', usdUrl: 'https://huggingface.co/datasets/nvidia/SimReady', desc: 'OpenUSD 물리 속성 및 2.5t 적재 하중 시뮬레이션 적용' },
  { id: 'SPILL_PALLET_CHEMICAL', name: 'Eagle 4-Drum Hazmat Spill Pallet', tag: 'Hazmat Containment', usdUrl: 'https://huggingface.co/datasets/nvidia/SimReady', desc: '고밀도 황색 폴리에틸렌 내화학 드럼 보관 팔레트' },
  { id: 'TOOL_CHEST_HEAVY_CABINET', name: 'Kennedy Heavy Duty Tool Chest', tag: 'Shop Equipment', usdUrl: 'https://huggingface.co/datasets/nvidia/SimReady', desc: '12단 정비 공구 캐비닛 및 자재 적재 벤치' },
  { id: 'SAFETY_SHOWER_EYEWASH', name: 'Haws Emergency Eyewash & Drench Shower', tag: 'Safety Facility', usdUrl: 'https://huggingface.co/datasets/nvidia/SimReady', desc: 'OSHA / ANSI Z358.1 규격 인증 긴급 세안 및 샤워 부스' }
];

function openNvidiaCatalogModal() {
  const modal = document.getElementById('modal-nvidia-catalog');
  const grid = document.getElementById('simready-grid-list');
  if (!modal || !grid) return;

  grid.innerHTML = NVIDIA_SIMREADY_ASSETS.map(asset => `
    <div class="simready-card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:800; font-size:12px; color:#f1f5f9;">${asset.name}</span>
        <span class="win-badge-pill" style="border-color:#76b900; color:#76b900;">${asset.tag}</span>
      </div>
      <div style="font-size:11px; color:#94a3b8; line-height:1.4;">${asset.desc}</div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
        <span style="font-size:10px; color:#64748b; font-family:ui-monospace,monospace;">USD / SimReady</span>
        <button class="btn-tb active-green" onclick="spawnAssetInstance('${asset.id}', 14000, 8000, 0); closeNvidiaCatalogModal();" style="padding:4px 8px; font-size:11px;">
          ➕ 씬에 즉시 스폰
        </button>
      </div>
    </div>
  `).join('');

  modal.style.display = 'flex';
}

function closeNvidiaCatalogModal() {
  const modal = document.getElementById('modal-nvidia-catalog');
  if (modal) modal.style.display = 'none';
}


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

window.gate1State = gate1State;
window.gate2State = gate2State;

// 하위 호환용 gateState 프록시
let gateState = gate1State;
let activeGateTarget = 'GATE1'; // 단일 섹셔널 화물 게이트
let currentGateWall = 'NORTH'; // 기본: 북측 벽면 (Y=16m)

function setActiveGateTarget(target) {
  activeGateTarget = 'GATE1';
  log(`🎮 [게이트 선택] 섹셔널 화물 게이트가 활성화되었습니다.`);
}
window.setActiveGateTarget = setActiveGateTarget;

function setupCargoGateAssembly(parentObj) {
  cargoGateMasterAssembly = new THREE.Group();
  cargoGateMasterAssembly.name = 'CargoGate_Master_Assembly';
  cargoGateMasterAssembly.userData = {
    name: '화물 적재 섹셔널 게이트 어셈블리',
    isSelectable: true,
    isCargoGateMaster: true
  };

  // Gate 1 (오버헤드 섹셔널 도어) 그룹들
  gatePanelsGroup = new THREE.Group();
  gatePanelsGroup.name = 'Gate1_Panels_Group';
  gateShaftGroup = new THREE.Group();
  gateShaftGroup.name = 'Gate1_Shaft_Group';

  gate2PanelsGroup = null;
  gate2DrumGroup = null;

  // 1. OBJ에서 화물문 부재 분리 & 롤업 도어 메쉬 영구 삭제
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

  // 롤업 도어 메쉬 완전히 숨김 및 씬에서 제거
  gate2Meshes.forEach(mesh => {
    mesh.visible = false;
    if (mesh.parent) mesh.parent.remove(mesh);
  });

  // 롤업 도어가 삭제된 북측 개구부(X: 18,400 ~ 22,400mm) 외벽 및 라이너 폐쇄 패널 생성
  if (gate2Meshes.length) {   // only the original 24 x 16 m model has the second (roll-up) opening to close
    const wallFillGeo = new THREE.BoxGeometry(4000, 150, 4100);
    const wallFillMat = new THREE.MeshPhysicalMaterial({
      color: 0x94a3b8,
      roughness: 0.38,
      metalness: 0.52,
      envMapIntensity: 0.45,
      normalMap: pbrTextures.corrugatedNormal || null,
      normalScale: new THREE.Vector2(0.32, 0.32),
      transparent: exteriorWallOpacity < 0.98,
      opacity: exteriorWallOpacity,
      depthWrite: exteriorWallOpacity > 0.55
    });
    const wallFillMesh = new THREE.Mesh(wallFillGeo, wallFillMat);
    wallFillMesh.name = 'Wall_North_Closed_RollupInfill';
    wallFillMesh.position.set(20400, 16075, 2050);
    parentObj.add(wallFillMesh);
    exteriorCladdingMeshes.push(wallFillMesh);

    const wallFillEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(wallFillGeo, 24),
      new THREE.LineBasicMaterial({ color: 0x090d14, transparent: true, opacity: isCadEdgesVisible ? 0.7 : 0.16 })
    );
    wallFillEdges.userData.isCadEdge = true;
    wallFillMesh.add(wallFillEdges);

    const linerFillGeo = new THREE.BoxGeometry(4000, 80, 2400);
    const linerFillMat = new THREE.MeshPhysicalMaterial({
      color: 0xdbe2ea,
      roughness: 0.38,
      metalness: 0.06,
      clearcoat: 0.15,
      envMapIntensity: 0.25,
      normalMap: pbrTextures.corrugatedNormal || null,
      normalScale: new THREE.Vector2(0.22, 0.22)
    });
    const linerFillMesh = new THREE.Mesh(linerFillGeo, linerFillMat);
    linerFillMesh.name = 'LinerPanel_North_Closed_RollupInfill';
    linerFillMesh.position.set(20400, 15950, 1200);
    parentObj.add(linerFillMesh);
  }

  // Gate 1 (섹셔널 도어) 메쉬 엄격 분리 편성:
  // - 고정 프레임 요소: 트랙, 모터, 상부 토션 샤프트 바(TorsionShaft), 수직 프레임 포스트(Stile)
  // - 승강 도어 패널: 실제 문짝 본체(Door_Sectional_Logistics, BottomWhite)만 포함하여 비정상 막대기 이동 방지
  gate1Meshes.forEach(mesh => {
    const n = mesh.name;
    if (n.includes('Stile_')) {
      // 화물문 개구부를 가로막는 세로 기둥(스타일) 제거 — 2026-11-08 사용자 지시
      mesh.visible = false;
      if (mesh.parent) mesh.parent.remove(mesh);
    } else if (n.includes('Track_') || n.includes('HoistMotor_') || n.includes('TorsionShaft')) {
      cargoGateMasterAssembly.add(mesh);
    } else {
      gatePanelsGroup.add(mesh);
    }
  });

  cargoGateMasterAssembly.add(gatePanelsGroup);

  // 2. 도크 범퍼 (Gate 1 전용)
  const bumperMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.8 });
  const bumperGeo = new THREE.BoxGeometry(220, 320, 600);
  const bump1L = new THREE.Mesh(bumperGeo, bumperMat); bump1L.position.set(12250, 15950, 300);
  const bump1R = new THREE.Mesh(bumperGeo, bumperMat); bump1R.position.set(16650, 15950, 300);
  cargoGateMasterAssembly.add(bump1L); cargoGateMasterAssembly.add(bump1R);

  // 3. 상부 스트로보 경광등 (Gate 1 섹셔널 전용)
  gateWarningLight = new THREE.PointLight(0xf59e0b, 0, 8000, 1.2);
  gateWarningLight.position.set(14500, 15850, 4800);
  cargoGateMasterAssembly.add(gateWarningLight);

  const strobe1Mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(80, 80, 140, 16),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.8 })
  );
  strobe1Mesh.position.set(14500, 15850, 4800);
  cargoGateMasterAssembly.add(strobe1Mesh);

  // 4. 벽면 3D 스위치 스테이션 (Gate 1 설치)
  const createSwitchBox = (posX, posY, posZ, gateTarget) => {
    const stGroup = new THREE.Group();
    stGroup.name = 'Gate_Button_Station_' + gateTarget;
    stGroup.userData = { isGateStation: true, targetGate: gateTarget };

    // 1. Industrial Steel Enclosure (320mm x 140mm x 620mm)
    const boxGeo = new THREE.BoxGeometry(320, 140, 620);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.7 });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.position.set(posX, posY, posZ);
    boxMesh.userData = { isGateBtn: true, action: 'TOGGLE', targetGate: gateTarget };
    stGroup.add(boxMesh);

    // 2. High-Visibility Safety Yellow Faceplate (280mm x 16mm x 580mm)
    const plateGeo = new THREE.BoxGeometry(280, 16, 580);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35, metalness: 0.1 });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    plateMesh.position.set(posX, posY - 72, posZ);
    plateMesh.userData = { isGateBtn: true, action: 'TOGGLE', targetGate: gateTarget };
    stGroup.add(plateMesh);

    // 3. Top LED Indicator Status Bar
    const ledGeo = new THREE.BoxGeometry(180, 24, 40);
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x10b981,
      emissiveIntensity: 0.8
    });
    const ledMesh = new THREE.Mesh(ledGeo, ledMat);
    ledMesh.position.set(posX, posY - 76, posZ + 230);
    ledMesh.userData = { isGateBtn: true, action: 'TOGGLE', targetGate: gateTarget };
    stGroup.add(ledMesh);

    // 4. Large Industrial Palm Pushbuttons
    const btnGeo = new THREE.CylinderGeometry(52, 52, 45, 24);
    btnGeo.rotateX(Math.PI / 2);

    // Green UP Button: Click to OPEN
    const btnMatUp = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.7,
      roughness: 0.25
    });
    const btnUp = new THREE.Mesh(btnGeo, btnMatUp);
    btnUp.position.set(posX, posY - 90, posZ + 120);
    btnUp.userData = { isGateBtn: true, action: 'OPEN', targetGate: gateTarget };
    stGroup.add(btnUp);

    // Red STOP Mushroom Head Button
    const stopGeo = new THREE.CylinderGeometry(60, 52, 50, 24);
    stopGeo.rotateX(Math.PI / 2);
    const btnMatStop = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.7,
      roughness: 0.25
    });
    const btnStop = new THREE.Mesh(stopGeo, btnMatStop);
    btnStop.position.set(posX, posY - 95, posZ);
    btnStop.userData = { isGateBtn: true, action: 'STOP', targetGate: gateTarget };
    stGroup.add(btnStop);

    // Blue DOWN Button: Click to CLOSE
    const btnMatDown = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x2563eb,
      emissiveIntensity: 0.7,
      roughness: 0.25
    });
    const btnDown = new THREE.Mesh(btnGeo, btnMatDown);
    btnDown.position.set(posX, posY - 90, posZ - 120);
    btnDown.userData = { isGateBtn: true, action: 'CLOSE', targetGate: gateTarget };
    stGroup.add(btnDown);

    return stGroup;
  };

  gateButtonStationMesh = createSwitchBox(16800, 15850, 1400, 'GATE1');
  cargoGateMasterAssembly.add(gateButtonStationMesh);
  gate2ButtonStationMesh = null;

  scene.add(cargoGateMasterAssembly);

  // 기본 북측 벽면(Y=16m, 디폴트)으로 정합 배치
  const initialWall = localStorage.getItem('cargoGateWall') || 'NORTH';
  relocateCargoGate(initialWall, false);
  console.log('Sectional Cargo Gate successfully assembled and set to ' + initialWall + ' wall. (North is saved default).');
}

function relocateCargoGate(wall, showLog = true) {
  if (!cargoGateMasterAssembly) return;
  currentGateWall = wall;
  localStorage.setItem('cargoGateWall', wall);

  ['btn-wall-south', 'btn-wall-north', 'btn-wall-west', 'btn-wall-east'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.classList.remove('active-green');
  });

  const activeBtn = document.getElementById('btn-wall-' + wall.toLowerCase());
  if (activeBtn) activeBtn.classList.add('active-green');

  const label = document.getElementById('label-gate-wall');

  // The gate parts are modelled on the original north wall (door centre X = legacyCenterX, wall at Y = legacyWallY).
  // Put that door centre where it belongs on the chosen wall: world = R(rotation) * local + position.
  const B = BUILDING, d = B.door || {}, lc = { x: d.legacyCenterX || 14500, y: d.legacyWallY || 16000 };
  const along = wall === 'NORTH' || wall === 'SOUTH' ? (d.centerX !== undefined ? d.centerX : B.lengthX / 2) : B.widthY / 2;
  const spec = {
    NORTH: { rot: 0, x: along, y: B.widthY, label: `북측 벽 (Y=${(B.widthY / 1000).toFixed(1)}m, 기본값)` },
    SOUTH: { rot: 0, x: along, y: 100, label: '남측 벽면 [반대편]' },
    WEST: { rot: -Math.PI / 2, x: 100, y: along, label: '서측 벽면 (X=0)' },
    EAST: { rot: Math.PI / 2, x: B.lengthX - 100, y: along, label: `동측 벽면 (X=${(B.lengthX / 1000).toFixed(1)}m)` }
  }[wall] || null;
  if (spec) {
    const c = Math.cos(spec.rot), sn = Math.sin(spec.rot);
    cargoGateMasterAssembly.rotation.z = spec.rot;
    cargoGateMasterAssembly.position.set(spec.x - (c * lc.x - sn * lc.y), spec.y - (sn * lc.x + c * lc.y), 0);
    if (label) label.innerText = spec.label;
    if (showLog) log(`🚪 [위치 변경] 화물 게이트(섹셔널)를 [${spec.label}]에 배치했습니다.`);
  }

  if (typeof syncInspectorFromSelected === 'function') syncInspectorFromSelected();
}
window.relocateCargoGate = relocateCargoGate;

function saveGateWallAsDefault(wall = null) {
  const targetWall = wall || currentGateWall || 'NORTH';
  relocateCargoGate(targetWall, false);
  localStorage.setItem('cargoGateWall', targetWall);
  saveSceneLayoutToServer();
  const label = document.getElementById('label-gate-wall');
  if (label) {
    label.innerText = (targetWall === 'NORTH') ? '북측 벽 (Y=16m, 기본값 영구 저장됨 ✓)' : `${targetWall} 벽 (기본값 저장됨 ✓)`;
    label.style.color = 'var(--accent-green)';
  }
  log(`💾 [기본값 영구 저장] 화물 게이트 설치 벽면이 [${targetWall === 'NORTH' ? '북측 벽면(Y=16m, 메인 하역장)' : targetWall}]으로 기본값 저장 완료되었습니다.`);
}
window.saveGateWallAsDefault = saveGateWallAsDefault;

function triggerGateAction(action, forceTarget = null) {
  const gState = gate1State;
  const gName = '섹셔널 화물 게이트';

  if (action === 'OPEN') {
    gState.targetProgress = 1.0;
    gState.status = 'OPENING';
    log(`🚪 [${gName}] [열기] 시퀀스가 시작되었습니다. (천장 4.1m 틸트 상승)`);
  } else if (action === 'CLOSE') {
    gState.targetProgress = 0.0;
    gState.status = 'CLOSING';
    log(`🚪 [${gName}] [닫기] 시퀀스가 시작되었습니다.`);
  } else if (action === 'STOP') {
    gState.targetProgress = gState.progress;
    gState.status = 'STOPPED';
    log(`🛑 [${gName}] 작동이 정지되었습니다.`);
  } else if (action === 'TOGGLE') {
    if (gState.targetProgress > 0.5) {
      triggerGateAction('CLOSE');
    } else {
      triggerGateAction('OPEN');
    }
    return;
  }

  updateGateUI();
}
window.triggerGateAction = triggerGateAction;

function updateGateUI() {
  const p1 = Math.round(gate1State.progress * 100);
  const fp1 = document.getElementById('footer-pill-g1');
  if (fp1) {
    fp1.innerText = gate1State.status === 'OPEN' ? 'OPEN (4.1m)' : (gate1State.status === 'CLOSED' ? 'CLOSED' : p1 + '%');
    fp1.style.color = gate1State.status === 'OPEN' ? '#34d399' : (gate1State.status === 'CLOSED' ? '#10b981' : '#38bdf8');
  }

  const bar1 = document.getElementById('gate1-progress-bar') || document.getElementById('gate-progress-bar');
  const percentText1 = document.getElementById('gate1-percent-text') || document.getElementById('gate-percent-text');
  const detailText1 = document.getElementById('gate1-detail-text') || document.getElementById('gate-detail-text');
  if (percentText1) percentText1.textContent = p1 + '%';
  if (bar1) bar1.style.width = p1 + '%';
  const curH1 = (gate1State.progress * 4.1).toFixed(2);
  if (detailText1) {
    if (gate1State.status === 'OPENING') detailText1.textContent = `상승 중... (높이: ${curH1}m / 4.1m)`;
    else if (gate1State.status === 'CLOSING') detailText1.textContent = `하강 중... (높이: ${curH1}m / 4.1m)`;
    else if (gate1State.progress >= 0.99) detailText1.textContent = '완전 개방 (4.1m 적재 가능)';
    else if (gate1State.progress <= 0.01) detailText1.textContent = '닫힘 상태 (높이: 0.0m)';
    else detailText1.textContent = `정지됨 (높이: ${curH1}m)`;
  }

  // 상단 뱃지 동기화
  const pill = document.getElementById('gate-state-pill');
  if (pill) {
    if (gate1State.status === 'OPENING') {
      pill.textContent = 'OPENING...'; pill.style.color = '#38bdf8'; pill.style.borderColor = '#38bdf8';
    } else if (gate1State.status === 'CLOSING') {
      pill.textContent = 'CLOSING...'; pill.style.color = '#f59e0b'; pill.style.borderColor = '#f59e0b';
    } else if (gate1State.progress >= 0.99) {
      pill.textContent = 'OPEN (4.1m)'; pill.style.color = '#34d399'; pill.style.borderColor = '#34d399';
    } else if (gate1State.progress <= 0.01) {
      pill.textContent = 'CLOSED'; pill.style.color = '#10b981'; pill.style.borderColor = '#10b981';
    } else {
      pill.textContent = `ACTIVE (${p1}%)`; pill.style.color = '#a78bfa'; pill.style.borderColor = '#a78bfa';
    }
  }

  const isOpen = (gate1State.progress > 0.5);

  const tbBtn = document.getElementById('btn-tb-gate-toggle');
  if (tbBtn) {
    tbBtn.textContent = isOpen ? '🚪 게이트: 닫기' : '🚪 게이트: 열기';
  }

  // Quick Gate Card in Inspector Tab 1
  const qStatus = document.getElementById('quick-gate-status');
  if (qStatus) {
    if (gate1State.status === 'OPENING') {
      qStatus.innerText = 'OPENING...'; qStatus.style.color = '#38bdf8';
    } else if (gate1State.status === 'CLOSING') {
      qStatus.innerText = 'CLOSING...'; qStatus.style.color = '#f59e0b';
    } else if (gate1State.progress >= 0.99) {
      qStatus.innerText = 'OPEN (4.1m)'; qStatus.style.color = '#34d399';
    } else if (gate1State.progress <= 0.01) {
      qStatus.innerText = 'CLOSED'; qStatus.style.color = '#10b981';
    } else {
      qStatus.innerText = `${p1}%`; qStatus.style.color = '#a78bfa';
    }
  }

  const q1Text = document.getElementById('quick-gate1-text');
  if (q1Text) q1Text.innerText = gate1State.status === 'OPEN' ? 'OPEN' : (gate1State.status === 'CLOSED' ? 'CLOSED' : `${p1}%`);

  const qBtn = document.getElementById('btn-quick-gate-toggle');
  if (qBtn) {
    qBtn.innerHTML = isOpen ? '<span>🚪 화물 게이트 닫기 (CLOSE)</span>' : '<span>🚪 화물 게이트 열기 (OPEN)</span>';
  }
}
window.updateGateUI = updateGateUI;


  // 3D 뷰포트 내 화물 게이트 푸시버튼 클릭 감지
  window.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('.floating-win')) return;
    const rect = renderer.domElement.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;

    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // 1. Check enlarged switch station click
    if (gateButtonStationMesh) {
      const hits = raycaster.intersectObjects(gateButtonStationMesh.children, true);
      if (hits.length > 0 && hits[0].object.userData.isGateBtn) {
        const u = hits[0].object.userData;
        triggerGateAction(u.action || 'TOGGLE');
        e.stopPropagation();
        return;
      }
    }

    // 2. Direct click on Gate 1 panels in 3D viewport (one-touch toggle!)
    if (gatePanelsGroup) {
      const g1Hits = raycaster.intersectObjects(gatePanelsGroup.children, true);
      if (g1Hits.length > 0) {
        triggerGateAction('TOGGLE');
        e.stopPropagation();
        return;
      }
    }
  }, true);

  // 단축키 Space: 게이트 작동 토글
  // Space key gate shortcut removed (doors operate via UI or 3D stations)




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
  if (typeof virtualPLC === 'undefined') return;
  const plc = virtualPLC;

  // DI 그리드 렌더링
  const diGrid = document.getElementById('plc-di-grid');
  if (diGrid && diGrid.children && diGrid.children.length === 0) {
    diGrid.innerHTML = Object.keys(plc.inputs).map(key => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#121a28; padding:3px 6px; border-radius:4px; border:1px solid #202d42; cursor:pointer;" onclick="togglePLCDigitalInput('${key}')" title="클릭하여 신호 토글">
        <span style="color:#cbd5e1; font-family:ui-monospace,monospace; font-size:10px;">${key}</span>
        <span id="led-di-${key}" style="width:8px; height:8px; border-radius:50%; background:#10b981; box-shadow:0 0 6px #10b981;"></span>
      </div>
    `).join('');
  }

  // DI LED 색상 동기화
  Object.entries(plc.inputs).forEach(([k, v]) => {
    const led = document.getElementById(`led-di-${k}`);
    if (led) {
      led.style.background = v ? '#10b981' : '#334155';
      led.style.boxShadow = v ? '0 0 6px #10b981' : 'none';
    }
  });

  // DO 그리드 렌더링
  const doGrid = document.getElementById('plc-do-grid');
  if (doGrid && doGrid.children && doGrid.children.length === 0) {
    doGrid.innerHTML = Object.keys(plc.outputs).map(key => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#121a28; padding:3px 6px; border-radius:4px; border:1px solid #202d42;">
        <span style="color:#cbd5e1; font-family:ui-monospace,monospace; font-size:10px;">${key}</span>
        <span id="led-do-${key}" style="width:8px; height:8px; border-radius:50%; background:#334155;"></span>
      </div>
    `).join('');
  }

  // DO LED 색상 동기화
  Object.entries(plc.outputs).forEach(([k, v]) => {
    const led = document.getElementById(`led-do-${k}`);
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

    ladderEl.innerHTML = `
      <div style="color:${r1Active ? '#34d399' : '#64748b'};">
        RUNG 01: [DOOR ${plc.inputs.DI_CNC_DOOR ? '🟢' : '⚪'}]--[AIR ${plc.inputs.DI_CNC_AIR ? '🟢' : '⚪'}]--[ESTOP ${plc.inputs.DI_CNC_ESTOP ? '🟢' : '⚪'}]----( SPINDLE ${r1Active ? '⚡ RUN' : 'OFF'} )
      </div>
      <div style="color:${r2Active ? '#38bdf8' : '#64748b'};">
        RUNG 02: [O2<50 ${plc.inputs.DI_3DP_O2_INTERLOCK ? '🟢' : '⚪'}]--[SEAL ${plc.inputs.DI_3DP_SEAL ? '🟢' : '⚪'}]-------------( DMLS_LASER ${r2Active ? '🔥 FIRE' : 'OFF'} )
      </div>
      <div style="color:${r3Active ? '#facc15' : '#64748b'};">
        RUNG 03: [GATE_PE ${plc.inputs.DI_GATE_PE_SAFE ? '🟢' : '⚪'}]--[LS_UP ${plc.inputs.DI_GATE_LS_UP ? '🔴' : '🟢'}]------------( GATE_MTR ${r3Active ? '🔄 RUN' : 'STOP'} )
      </div>
    `;
  }

  // 아날로그 값 표시
  const rpmEl = document.getElementById('plc-val-rpm');
  if (rpmEl) rpmEl.innerText = `${plc.analogs.AI_CNC_RPM.toLocaleString()} RPM`;
  const o2El = document.getElementById('plc-val-o2');
  if (o2El) o2El.innerText = `${plc.analogs.AI_3DP_O2_PPM} PPM (${plc.inputs.DI_3DP_O2_INTERLOCK ? '안전' : '경고'})`;
  const gateEl = document.getElementById('plc-val-gate');
  if (gateEl) gateEl.innerText = `${plc.analogs.AO_GATE_HERTZ.toFixed(1)} Hz`;
}

function togglePLCDigitalInput(key) {
  if (key in virtualPLC.inputs) {
    virtualPLC.inputs[key] = !virtualPLC.inputs[key];
    log(`⚡ [PLC I/O] ${key} 신호가 수동 토글되었습니다: ${virtualPLC.inputs[key] ? 'HIGH (1)' : 'LOW (0)'}`);
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

  log(`⚠️ [근사 미리보기] '${selectedObject.name}': 실제 R ${radius}mm 챔퍼가 아닙니다. 부재를 외곽이 ${radius * 2}mm 작은 직육면체로 바꿔 보여줄 뿐입니다. (${processedCount}개 메쉬, 되돌리기 가능)`);
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
  holeGroup.name = `Hole_${sizeName}_Counterbore`;

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
  log(`🕳️ [표시 마커] '${selectedObject.name}'에 ${sizeName} (Ø${diaMm}mm) 카운터보어 위치 마커를 붙였습니다. 형상에서 구멍을 빼지는 않습니다.`);
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
  log(`↺ [복원] '${selectedObject.name}' 원래 메쉬로 복원되었습니다.`);
}

window.applyChamferToBevelSelected = applyChamferToBevelSelected;
window.applyDrillHoleToSelected = applyDrillHoleToSelected;
window.resetMachiningGeometry = resetMachiningGeometry;



// ============================================================================
// SolidCraft CAD Modeling Studio Engine (Parametric Solids & Machining)
// ============================================================================
let activePrimitiveType = 'box';
let isLaserMeasureActive = false;
let measurePoints = [];
let measureLaserGroup = null;



function selectPrimitiveType(type) {
  activePrimitiveType = type;
  ['box', 'cylinder', 'pipe', 'hbeam'].forEach(t => {
    const btn = document.getElementById('btn-prim-' + t);
    const fields = document.getElementById('fields-' + t);
    if (btn) btn.classList.toggle('active-green', t === type);
    if (fields) fields.style.display = t === type ? 'block' : 'none';
  });
}
window.selectPrimitiveType = selectPrimitiveType;

function setBoxPreset(w, d, h) {
  const ew = document.getElementById('sc-box-w'); if (ew) ew.value = w;
  const ed = document.getElementById('sc-box-d'); if (ed) ed.value = d;
  const eh = document.getElementById('sc-box-h'); if (eh) eh.value = h;
}
window.setBoxPreset = setBoxPreset;

function setCylPreset(r, h, axis) {
  const er = document.getElementById('sc-cyl-r'); if (er) er.value = r;
  const eh = document.getElementById('sc-cyl-h'); if (eh) eh.value = h;
  const ea = document.getElementById('sc-cyl-axis'); if (ea) ea.value = axis;
}
window.setCylPreset = setCylPreset;

function setPipePreset(od, id, l) {
  const eod = document.getElementById('sc-pipe-od'); if (eod) eod.value = od;
  const eid = document.getElementById('sc-pipe-id'); if (eid) eid.value = id;
  const el = document.getElementById('sc-pipe-l'); if (el) el.value = l;
}
window.setPipePreset = setPipePreset;

function setHBeamPreset(b, h, l) {
  const eb = document.getElementById('sc-beam-b'); if (eb) eb.value = b;
  const eh = document.getElementById('sc-beam-h'); if (eh) eh.value = h;
  const el = document.getElementById('sc-beam-l'); if (el) el.value = l;
}
window.setHBeamPreset = setHBeamPreset;

function executeCreateSolidCraftPrimitive() {
  pushUndoState();
  const matSelect = document.getElementById('sc-prim-material');
  const matId = matSelect ? matSelect.value : 'SUS_304_306_Brushed_2B';
  const targetPos = new THREE.Vector3();
  if (controls && controls.target) {
    targetPos.copy(controls.target);
  } else {
    targetPos.set(12000, 8000, 500);
  }

  let newMesh = null;
  let dims = [1000, 1000, 1000];
  let primName = 'SolidCraft_Part';

  if (activePrimitiveType === 'box') {
    const w = parseFloat(document.getElementById('sc-box-w').value) || 1000;
    const d = parseFloat(document.getElementById('sc-box-d').value) || 800;
    const h = parseFloat(document.getElementById('sc-box-h').value) || 600;
    dims = [w, d, h];
    primName = `SolidCraft_Box_${Math.round(w)}x${Math.round(d)}x${Math.round(h)}`;
    const geo = new THREE.BoxGeometry(w, d, h);
    newMesh = new THREE.Mesh(geo, getIndustrialMaterial(matId));
    newMesh.position.set(targetPos.x, targetPos.y, Math.max(h / 2, targetPos.z));
  } else if (activePrimitiveType === 'cylinder') {
    const r = parseFloat(document.getElementById('sc-cyl-r').value) || 150;
    const h = parseFloat(document.getElementById('sc-cyl-h').value) || 800;
    const axis = document.getElementById('sc-cyl-axis').value || 'Z';
    dims = [r * 2, r * 2, h];
    primName = `SolidCraft_Cylinder_R${Math.round(r)}_H${Math.round(h)}`;
    const geo = new THREE.CylinderGeometry(r, r, h, 32);
    if (axis === 'X') geo.rotateZ(Math.PI / 2);
    else if (axis === 'Y') geo.rotateX(Math.PI / 2);
    newMesh = new THREE.Mesh(geo, getIndustrialMaterial(matId));
    newMesh.position.set(targetPos.x, targetPos.y, Math.max(h / 2, targetPos.z));
  } else if (activePrimitiveType === 'pipe') {
    const od = parseFloat(document.getElementById('sc-pipe-od').value) || 114.3;
    const id = parseFloat(document.getElementById('sc-pipe-id').value) || 105.3;
    const l = parseFloat(document.getElementById('sc-pipe-l').value) || 1500;
    dims = [od, od, l];
    primName = `SolidCraft_Pipe_OD${Math.round(od)}_ID${Math.round(id)}`;
    const outerGeo = new THREE.CylinderGeometry(od / 2, od / 2, l, 32);
    newMesh = new THREE.Mesh(outerGeo, getIndustrialMaterial(matId));
    newMesh.position.set(targetPos.x, targetPos.y, Math.max(l / 2, targetPos.z));
  } else if (activePrimitiveType === 'hbeam') {
    const b = parseFloat(document.getElementById('sc-beam-b').value) || 250;
    const h = parseFloat(document.getElementById('sc-beam-h').value) || 250;
    const l = parseFloat(document.getElementById('sc-beam-l').value) || 3000;
    dims = [b, h, l];
    primName = `SolidCraft_HBeam_${Math.round(b)}x${Math.round(h)}_L${Math.round(l)}`;
    const beamGroup = new THREE.Group();
    const mat = getIndustrialMaterial(matId);
    const tf = 14; const tw = 9;
    const topFlange = new THREE.Mesh(new THREE.BoxGeometry(b, tf, l), mat); topFlange.position.set(0, h/2 - tf/2, 0); beamGroup.add(topFlange);
    const botFlange = new THREE.Mesh(new THREE.BoxGeometry(b, tf, l), mat); botFlange.position.set(0, -h/2 + tf/2, 0); beamGroup.add(botFlange);
    const webMesh = new THREE.Mesh(new THREE.BoxGeometry(tw, h - tf*2, l), mat); webMesh.position.set(0, 0, 0); beamGroup.add(webMesh);
    newMesh = beamGroup;
    newMesh.position.set(targetPos.x, targetPos.y, Math.max(h / 2, targetPos.z));
  }

  if (newMesh) {
    newMesh.name = primName;
    newMesh.userData = {
      isSelectable: true,
      materialId: matId,
      baseDims: dims,
      isSolidCraftPrimitive: true,
      solidCraftCommand: {
        command: activePrimitiveType === 'box' ? 'solid.box' : (activePrimitiveType === 'cylinder' ? 'solid.cylinder' : (activePrimitiveType === 'pipe' ? 'solid.pipe' : 'solid.i_beam')),
        params: { name: primName, dims }
      }
    };

    // Add CAD Edge Lines
    newMesh.traverse(child => {
      if (child.isMesh && child.geometry) {
        child.castShadow = true;
        child.receiveShadow = true;
        const edgeGeo = new THREE.EdgesGeometry(child.geometry, 20);
        const edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.7 }));
        edgeLine.userData.isCadEdge = true;
        child.add(edgeLine);
      }
    });

    if (placedAssetsGroup) {
      placedAssetsGroup.add(newMesh);
    } else {
      scene.add(newMesh);
    }
    placedObjects.push(newMesh);
    updateOutlinerUI();
    if (typeof selectAssetObject === 'function') {
      selectAssetObject(newMesh);
    }
    log(`🛠️ [SolidCraft CAD] '${primName}' 솔리드가 생성되었습니다. (크기: ${dims.join(' × ')} mm)`);
  }
}
window.executeCreateSolidCraftPrimitive = executeCreateSolidCraftPrimitive;

function setChamferQuick(val) {
  const s = document.getElementById('slider-chamfer-c'); if (s) s.value = val;
  const v = document.getElementById('val-chamfer-c'); if (v) v.value = val;
}
window.setChamferQuick = setChamferQuick;

function setFilletQuick(val) {
  const s = document.getElementById('slider-fillet-r'); if (s) s.value = val;
  const v = document.getElementById('val-fillet-r'); if (v) v.value = val;
}
window.setFilletQuick = setFilletQuick;

function applySolidCraftChamfer() {
  if (!selectedObject) {
    log('⚠️ 챔퍼 모따기를 적용할 3D 부품을 먼저 선택해 주세요.');
    return;
  }
  const cVal = parseFloat(document.getElementById('val-chamfer-c').value) || 5;
  pushUndoState();

  let count = 0;
  selectedObject.traverse(child => {
    if (child.isMesh && child.geometry) {
      if (!originalGeometriesMap.has(child)) {
        originalGeometriesMap.set(child, child.geometry.clone());
      }
      const orig = originalGeometriesMap.get(child);
      orig.computeBoundingBox();
      const sz = new THREE.Vector3();
      orig.boundingBox.getSize(sz);

      const chamGeo = new THREE.BoxGeometry(
        Math.max(10, sz.x - cVal * 2),
        Math.max(10, sz.y - cVal * 2),
        Math.max(10, sz.z - cVal * 2),
        2, 2, 2
      );
      child.geometry.dispose();
      child.geometry = chamGeo;
      child.geometry.computeVertexNormals();

      const oldEdges = child.children.find(c => c.userData && c.userData.isCadEdge);
      if (oldEdges) child.remove(oldEdges);
      const edgeGeo = new THREE.EdgesGeometry(child.geometry, 22);
      const edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 }));
      edgeLine.userData.isCadEdge = true;
      child.add(edgeLine);
      count++;
    }
  });
  log(`⚠️ [근사 미리보기] '${selectedObject.name}': 실제 C${cVal}mm 챔퍼가 아닙니다. 외곽이 ${cVal * 2}mm 작은 직육면체로 바꿔 보여줄 뿐입니다. (${count}개 메쉬)`);
  syncInspectorFromSelected();
}
window.applySolidCraftChamfer = applySolidCraftChamfer;

function applySolidCraftFillet() {
  if (!selectedObject) {
    log('⚠️ R-필렛 라운딩을 적용할 3D 부품을 먼저 선택해 주세요.');
    return;
  }
  const rVal = parseFloat(document.getElementById('val-fillet-r').value) || 5;
  pushUndoState();

  let count = 0;
  selectedObject.traverse(child => {
    if (child.isMesh && child.geometry) {
      if (!originalGeometriesMap.has(child)) {
        originalGeometriesMap.set(child, child.geometry.clone());
      }
      const orig = originalGeometriesMap.get(child);
      orig.computeBoundingBox();
      const sz = new THREE.Vector3();
      orig.boundingBox.getSize(sz);

      const filletGeo = new THREE.BoxGeometry(
        Math.max(10, sz.x - rVal * 1.6),
        Math.max(10, sz.y - rVal * 1.6),
        Math.max(10, sz.z - rVal * 1.6),
        4, 4, 4
      );
      child.geometry.dispose();
      child.geometry = filletGeo;
      child.geometry.computeVertexNormals();

      const oldEdges = child.children.find(c => c.userData && c.userData.isCadEdge);
      if (oldEdges) child.remove(oldEdges);
      const edgeGeo = new THREE.EdgesGeometry(child.geometry, 18);
      const edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xa78bfa, transparent: true, opacity: 0.85 }));
      edgeLine.userData.isCadEdge = true;
      child.add(edgeLine);
      count++;
    }
  });
  log(`⚠️ [근사 미리보기] '${selectedObject.name}': 실제 R${rVal}mm 필렛이 아닙니다. 외곽이 ${(rVal * 1.6).toFixed(1)}mm 작은 직육면체로 바꿔 보여줄 뿐입니다. (${count}개 메쉬)`);
  syncInspectorFromSelected();
}
window.applySolidCraftFillet = applySolidCraftFillet;

function applySolidCraftCounterbore() {
  if (!selectedObject) {
    log('⚠️ 볼트홀 타공을 적용할 3D 솔리드를 먼저 선택해 주세요.');
    return;
  }
  const bSelect = document.getElementById('sc-bolt-size');
  const bSpec = bSelect ? bSelect.value : 'M8_9.0mm';
  const diaMm = parseFloat(bSpec.split('_')[1]) || 9.0;
  applyDrillHoleToSelected(bSpec.split('_')[0], diaMm);
}
window.applySolidCraftCounterbore = applySolidCraftCounterbore;

function resetSelectedSolidCraftGeometry() {
  if (!selectedObject) return;
  pushUndoState();
  let count = 0;
  selectedObject.traverse(child => {
    if (child.isMesh && originalGeometriesMap.has(child)) {
      child.geometry.dispose();
      child.geometry = originalGeometriesMap.get(child).clone();
      child.geometry.computeVertexNormals();

      const oldEdges = child.children.find(c => c.userData && c.userData.isCadEdge);
      if (oldEdges) child.remove(oldEdges);
      const edgeGeo = new THREE.EdgesGeometry(child.geometry, 24);
      const edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 }));
      edgeLine.userData.isCadEdge = true;
      child.add(edgeLine);
      count++;
    }
  });
  log(`🔄 [SolidCraft Stock] '${selectedObject.name}'의 기계 가공 형상이 원본 스톡으로 복원되었습니다. (${count}개)`);
  syncInspectorFromSelected();
}
window.resetSelectedSolidCraftGeometry = resetSelectedSolidCraftGeometry;

// 3D Laser Dimension Measurement Tool
function toggleLaserMeasurementTool() {
  isLaserMeasureActive = !isLaserMeasureActive;
  const btn = document.getElementById('btn-toggle-laser-measure');
  if (btn) {
    btn.innerHTML = isLaserMeasureActive ? '<span>📏 3D 레이저 계측기: <b style="color:#34d399;">ON (2점 클릭)</b></span>' : '<span>📏 3D 레이저 거리 계측기: OFF</span>';
    btn.classList.toggle('active-green', isLaserMeasureActive);
  }
  measurePoints = [];
  log(isLaserMeasureActive ? '📏 [3D 레이저 계측] 활성화: 3D 화면 속 임의의 두 점을 클릭하여 실시간 거리를 측정하세요.' : '📏 [3D 레이저 계측] 종료');
}
window.toggleLaserMeasurementTool = toggleLaserMeasurementTool;

function clearLaserMeasurements() {
  if (measureLaserGroup) {
    scene.remove(measureLaserGroup);
    measureLaserGroup = null;
  }
  measurePoints = [];
  const ed = document.getElementById('meas-val-dist'); if (ed) ed.innerText = '- mm';
  const ex = document.getElementById('meas-val-dx'); if (ex) ex.innerText = '-';
  const ey = document.getElementById('meas-val-dy'); if (ey) ey.innerText = '-';
  const ez = document.getElementById('meas-val-dz'); if (ez) ez.innerText = '-';
  log('📏 3D 레이저 측정선이 초기화되었습니다.');
}
window.clearLaserMeasurements = clearLaserMeasurements;

function handleLaserMeasurementClick(point) {
  if (!isLaserMeasureActive) return;
  measurePoints.push(point.clone());

  if (measurePoints.length === 1) {
    log(`📏 [측정 시작점 P1]: X ${Math.round(point.x)}, Y ${Math.round(point.y)}, Z ${Math.round(point.z)} mm`);
  } else if (measurePoints.length >= 2) {
    const p1 = measurePoints[0];
    const p2 = measurePoints[1];
    const dx = Math.round(p2.x - p1.x);
    const dy = Math.round(p2.y - p1.y);
    const dz = Math.round(p2.z - p1.z);
    const dist = Math.round(p1.distanceTo(p2));

    const ed = document.getElementById('meas-val-dist'); if (ed) ed.innerText = `${dist.toLocaleString()} mm`;
    const ex = document.getElementById('meas-val-dx'); if (ex) ex.innerText = `${dx.toLocaleString()}`;
    const ey = document.getElementById('meas-val-dy'); if (ey) ey.innerText = `${dy.toLocaleString()}`;
    const ez = document.getElementById('meas-val-dz'); if (ez) ez.innerText = `${dz.toLocaleString()}`;

    if (measureLaserGroup) scene.remove(measureLaserGroup);
    measureLaserGroup = new THREE.Group();

    // Laser Line
    const lineMat = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 2 });
    const lineGeo = new THREE.BufferGeometry();
    const posArr = new Float32Array([p1.x, p1.y, p1.z, p2.x, p2.y, p2.z]);
    lineGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    measureLaserGroup.add(new THREE.Line(lineGeo, lineMat));

    // Endpoints
    const ptGeo = new THREE.SphereGeometry(40, 16, 16);
    const ptMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    const m1 = new THREE.Mesh(ptGeo, ptMat); m1.position.copy(p1); measureLaserGroup.add(m1);
    const m2 = new THREE.Mesh(ptGeo, ptMat); m2.position.copy(p2); measureLaserGroup.add(m2);

    scene.add(measureLaserGroup);
    log(`📏 [측정 완료] P1 -> P2 실측 직선 거리: ${dist.toLocaleString()} mm (ΔX: ${dx}, ΔY: ${dy}, ΔZ: ${dz} mm)`);
    measurePoints = [];
  }
}

function exportSolidCraftCommandScript() {
  const commands = [];
  placedObjects.forEach(obj => {
    if (obj.userData && obj.userData.solidCraftCommand) {
      commands.push(obj.userData.solidCraftCommand);
    } else {
      const p = obj.position;
      commands.push({
        command: 'solid.box',
        params: {
          name: obj.name,
          position: [Math.round(p.x), Math.round(p.y), Math.round(p.z)],
          dims: obj.userData.baseDims || [1000, 1000, 1000]
        }
      });
    }
  });

  const scriptText = JSON.stringify(commands, null, 2);
  navigator.clipboard.writeText(scriptText).then(() => {
    log('📋 SolidCraft JSON 명령 스크립트가 클립보드에 복사되었습니다! (' + commands.length + '개 솔리드)');
  }).catch(() => {
    log('📋 스크립트 추출 완료:\n' + scriptText);
  });
}
window.exportSolidCraftCommandScript = exportSolidCraftCommandScript;

function exportCurrentModelAsOBJ() {
  let objOutput = '# SolidCraft Twin Studio v2 Exported OBJ\n';
  let vertOffset = 1;

  placedObjects.forEach(obj => {
    obj.traverse(child => {
      if (child.isMesh && child.geometry) {
        const geo = child.geometry;
        const pos = geo.attributes.position;
        if (!pos) return;
        objOutput += `o ${child.name || obj.name}\n`;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          v.applyMatrix4(child.matrixWorld);
          objOutput += `v ${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.z.toFixed(2)}\n`;
        }
        if (geo.index) {
          const idx = geo.index;
          for (let i = 0; i < idx.count; i += 3) {
            objOutput += `f ${idx.getX(i) + vertOffset} ${idx.getX(i + 1) + vertOffset} ${idx.getX(i + 2) + vertOffset}\n`;
          }
        } else {
          for (let i = 0; i < pos.count; i += 3) {
            objOutput += `f ${i + vertOffset} ${i + 1 + vertOffset} ${i + 2 + vertOffset}\n`;
          }
        }
        vertOffset += pos.count;
      }
    });
  });

  const blob = new Blob([objOutput], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `SolidCraft_Factory_Export_${Date.now()}.obj`;
  a.click();
  log('📤 현재 씬의 솔리드 지오메트리가 OBJ 파일로 성공적으로 내보내기 되었습니다.');
}
window.exportCurrentModelAsOBJ = exportCurrentModelAsOBJ;

// ============================================================================
// SolidCraft CAD Blueprint Studio Engine (Dedicated Window & Isolated Viewport)
// ============================================================================

let cadStudioScene = null;
let cadStudioCamera = null;
let cadStudioRenderer = null;
let cadStudioControls = null;
let cadStudioCurrentMesh = null;
let cadStudioEdgesLine = null;
let cadStudioGrid = null;
let cadStudioAxes = null;
let cadStudioIsWireframe = false;
let cadStudioActiveType = 'box';

let cadStudioParams = {
  box: { w: 1000, d: 800, h: 600 },
  cylinder: { r: 150, h: 800, axis: 'Z' },
  pipe: { od: 114.3, id: 105.3, l: 1500 },
  hbeam: { b: 250, h: 250, l: 3000 },
  trapezoid: { w1: 300, w2: 180, h: 250, t: 40 } // 두께 40mm = 4cm 사다리꼴 판넬
};

// ==============================================================
// SolidCraft 2D Metric Grid Sketcher & Extrude Engine
// ==============================================================
let cadStudioCurrentMode = 'sketch'; // 'sketch' | '3d'
let cadSketchTool = 'point'; // 'point' | 'circle' | 'subtract'
let cadSketchSnapEnabled = true;
let cadSketchSnapGrid = 10; // mm; selectable 0.1 / 1 / 10 (SketchCore.SNAP_STEPS)
let cadSketchIsClosed = true;
let cadSketchExtrudeThickness = 40; // mm; raw input, validated at extrude time (SketchCore.validateThickness)

// Initial Vertices: Centered Trapezoid (Bottom W1=300, Top W2=180, Height H=250)
let cadSketchVertices = [
  { x: -150, y: -125 },
  { x: 150, y: -125 },
  { x: 90, y: 125 },
  { x: -90, y: 125 }
];

// Initial Subtracted Hole: at (40, 20) with dia 16mm
let cadSketchHoles = [
  { x: 40, y: 20, dia: 16, isSubtract: true }
];

let cadSketchPan = { x: 0, y: 0 };
let cadSketchScale = 1.0;
let cadSketchIsPanning = false;
let cadSketchPanStart = { x: 0, y: 0 };
let cadSketchDraggedVertexIdx = -1;
let cadSketchCircleStart = null;
let cadSketchCurrentMouseWorld = { x: 0, y: 0 };
let cadSketchCanvasInitialized = false;

function cadStudioSwitchMode(mode) {
  cadStudioCurrentMode = mode;
  const sketchCanvas = document.getElementById('cad-sketch-canvas');
  const studioCanvas = document.getElementById('cad-studio-canvas');
  const sketchPanel = document.getElementById('cad-sketch-panel');
  const studio3dPanel = document.getElementById('cad-3d-panel');
  const btnSketch = document.getElementById('btn-cad-view-sketch');
  const btn3d = document.getElementById('btn-cad-view-3d');
  const modeHud = document.getElementById('cad-studio-mode-hud');
  const guideText = document.getElementById('cad-viewport-guide-text');

  if (mode === 'sketch') {
    if (sketchCanvas) sketchCanvas.style.display = 'block';
    if (studioCanvas) studioCanvas.style.display = 'none';
    if (sketchPanel) sketchPanel.style.display = 'flex';
    if (studio3dPanel) studio3dPanel.style.display = 'none';
    if (btnSketch) btnSketch.classList.add('active-green');
    if (btn3d) btn3d.classList.remove('active-green');
    if (modeHud) modeHud.textContent = '빠른 스케치·견적 모드 — 2D 스케치';
    if (guideText) guideText.textContent = '✏️ 마우스 좌클릭: 점 추가 / 원 그리기 | 우클릭 드래그: 모눈 이동(팬) | 휠: 줌 인/아웃';
    cadSketchInitCanvas();
    cadSketchRender();
  } else {
    if (sketchCanvas) sketchCanvas.style.display = 'none';
    if (studioCanvas) studioCanvas.style.display = 'block';
    if (sketchPanel) sketchPanel.style.display = 'none';
    if (studio3dPanel) studio3dPanel.style.display = 'flex';
    if (btnSketch) btnSketch.classList.remove('active-green');
    if (btn3d) btn3d.classList.add('active-green');
    if (modeHud) modeHud.textContent = '빠른 스케치·견적 모드 — 3D 메쉬 미리보기';
    if (guideText) guideText.textContent = '마우스 좌클릭: 360° 회전 | 우클릭/휠클릭: 팬 이동 | 휠: 줌';
    
    // Ensure 3D viewport is sized properly
    if (studioCanvas && cadStudioRenderer && cadStudioCamera) {
      const r = studioCanvas.parentElement.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        cadStudioCamera.aspect = r.width / r.height;
        cadStudioCamera.updateProjectionMatrix();
        cadStudioRenderer.setSize(r.width, r.height);
      }
    }
    if (!cadStudioCurrentMesh) {
      cadSketchExecuteExtrude();
    }
  }
}
window.cadStudioSwitchMode = cadStudioSwitchMode;

function cadSketchWorldToScreen(wx, wy, width, height) {
  return {
    x: width / 2 + (wx + cadSketchPan.x) * cadSketchScale,
    y: height / 2 - (wy + cadSketchPan.y) * cadSketchScale
  };
}

function cadSketchScreenToWorld(sx, sy, width, height, applySnap = true) {
  let wx = (sx - width / 2) / cadSketchScale - cadSketchPan.x;
  let wy = (height / 2 - sy) / cadSketchScale - cadSketchPan.y;
  if (applySnap && cadSketchSnapEnabled) {
    wx = SketchCore.snapValue(wx, cadSketchSnapGrid);
    wy = SketchCore.snapValue(wy, cadSketchSnapGrid);
  }
  return { x: wx, y: wy };
}

function cadSketchSetTool(tool) {
  cadSketchTool = tool;
  ['point', 'circle', 'subtract'].forEach(t => {
    const btn = document.getElementById('btn-sketch-tool-' + t);
    if (btn) btn.classList.toggle('active-green', t === tool);
  });
  log(`🛠️ [빠른 스케치] 스케치 도구 선택됨: ${tool === 'point' ? '✏️ 점/외곽선 그리기' : tool === 'circle' ? '◯ 원 그리기' : '✂️ 구멍 빼기'}`);
  cadSketchRender();
}
window.cadSketchSetTool = cadSketchSetTool;

function cadSketchToggleSnap() {
  cadSketchSnapEnabled = !cadSketchSnapEnabled;
  const btn = document.getElementById('btn-sketch-snap');
  if (btn) {
    btn.textContent = `🧲 그리드 스냅: ${cadSketchSnapGrid}mm (${cadSketchSnapEnabled ? 'ON' : 'OFF'})`;
    btn.style.color = cadSketchSnapEnabled ? '#38bdf8' : '#94a3b8';
  }
  cadSketchRender();
}
window.cadSketchToggleSnap = cadSketchToggleSnap;

function cadSketchSetSnapStep(val) {
  const step = parseFloat(val);
  if (!SketchCore.SNAP_STEPS.includes(step)) return;
  cadSketchSnapGrid = step;
  const btn = document.getElementById('btn-sketch-snap');
  if (btn) btn.textContent = `🧲 그리드 스냅: ${cadSketchSnapGrid}mm (${cadSketchSnapEnabled ? 'ON' : 'OFF'})`;
  cadSketchRender();
}
window.cadSketchSetSnapStep = cadSketchSetSnapStep;

function cadSketchCloseLoopToggle() {
  cadSketchIsClosed = !cadSketchIsClosed;
  const btn = document.getElementById('btn-sketch-loop-toggle');
  if (btn) {
    btn.textContent = `🔄 루프: ${cadSketchIsClosed ? '닫힘 (Closed)' : '열림 (Open)'}`;
    btn.style.color = cadSketchIsClosed ? '#10b981' : '#f59e0b';
  }
  cadSketchRender();
}
window.cadSketchCloseLoopToggle = cadSketchCloseLoopToggle;

function cadSketchLoadPreset(type) {
  if (type === 'trapezoid') {
    // 300mm bottom, 180mm top, 250mm height
    cadSketchVertices = [
      { x: -150, y: -125 },
      { x: 150, y: -125 },
      { x: 90, y: 125 },
      { x: -90, y: 125 }
    ];
    cadSketchHoles = [
      { x: 40, y: 20, dia: 16, isSubtract: true }
    ];
    cadSketchIsClosed = true;
    cadSketchExtrudeThickness = 40;
    log('📐 [빠른 스케치] 사다리꼴 판넬 프리셋(밑변 300, 윗변 180, 높이 250, 두께 40mm)이 로드되었습니다.');
  } else if (type === 'rect') {
    cadSketchVertices = [
      { x: -150, y: -100 },
      { x: 150, y: -100 },
      { x: 150, y: 100 },
      { x: -150, y: 100 }
    ];
    cadSketchHoles = [
      { x: 0, y: 0, dia: 20, isSubtract: true }
    ];
    cadSketchIsClosed = true;
    cadSketchExtrudeThickness = 40;
    log('📦 [빠른 스케치] 직사각형 판넬 프리셋(300×200, 두께 40mm)이 로드되었습니다.');
  }
  const thInput = document.getElementById('cad-sketch-extrude-thickness');
  if (thInput) thInput.value = cadSketchExtrudeThickness;
  cadSketchUpdateVerticesTable();
  cadSketchUpdateHolesTable();
  cadSketchRender();
}
window.cadSketchLoadPreset = cadSketchLoadPreset;

function cadSketchClear() {
  cadSketchVertices = [];
  cadSketchHoles = [];
  cadSketchIsClosed = false;
  cadSketchUpdateVerticesTable();
  cadSketchUpdateHolesTable();
  cadSketchRender();
  log('⟲ [빠른 스케치] 스케치 캔버스가 초기화되었습니다. 모눈 위를 클릭하여 새 점을 찍어보세요.');
}
window.cadSketchClear = cadSketchClear;

function cadSketchAddVertex() {
  const lastV = cadSketchVertices[cadSketchVertices.length - 1] || { x: 0, y: 0 };
  cadSketchVertices.push({ x: lastV.x + 50, y: lastV.y });
  cadSketchUpdateVerticesTable();
  cadSketchRender();
}
window.cadSketchAddVertex = cadSketchAddVertex;

function cadSketchDeleteVertex(idx) {
  cadSketchVertices.splice(idx, 1);
  cadSketchUpdateVerticesTable();
  cadSketchRender();
}
window.cadSketchDeleteVertex = cadSketchDeleteVertex;

function cadSketchEditVertex(idx, axis, val) {
  if (cadSketchVertices[idx]) {
    cadSketchVertices[idx][axis] = parseFloat(val) || 0;
    cadSketchRender();
  }
}
window.cadSketchEditVertex = cadSketchEditVertex;

function cadSketchAddHole() {
  cadSketchHoles.push({ x: 0, y: 0, dia: 16, isSubtract: true });
  cadSketchUpdateHolesTable();
  cadSketchRender();
}
window.cadSketchAddHole = cadSketchAddHole;

function cadSketchDeleteHole(idx) {
  cadSketchHoles.splice(idx, 1);
  cadSketchUpdateHolesTable();
  cadSketchRender();
}
window.cadSketchDeleteHole = cadSketchDeleteHole;

function cadSketchEditHole(idx, key, val) {
  if (cadSketchHoles[idx]) {
    if (key === 'isSubtract') {
      cadSketchHoles[idx].isSubtract = val;
    } else {
      cadSketchHoles[idx][key] = parseFloat(val) || 0;
    }
    cadSketchRender();
  }
}
window.cadSketchEditHole = cadSketchEditHole;

function cadSketchUpdateThickness(val) {
  // Keep the raw input; it is validated when extruding (no silent fallback to 40 mm).
  cadSketchExtrudeThickness = val;
}
window.cadSketchUpdateThickness = cadSketchUpdateThickness;

function cadSketchUpdateVerticesTable() {
  const container = document.getElementById('cad-sketch-vertices-table');
  if (!container) return;
  if (cadSketchVertices.length === 0) {
    container.innerHTML = '<div style="font-size:11px; color:#64748b; padding:4px;">캔버스를 클릭하여 정점을 추가하세요.</div>';
    return;
  }
  container.innerHTML = cadSketchVertices.map((v, i) => `
    <div style="display:flex; align-items:center; gap:6px; background:#0c1017; padding:4px 6px; border-radius:4px; border:1px solid #233047;">
      <span style="font-size:10px; color:#38bdf8; font-weight:700; width:24px;">P${i}</span>
      <span style="font-size:10px; color:#64748b;">X:</span>
      <input type="number" value="${Math.round(v.x*10)/10}" step="5" oninput="cadSketchEditVertex(${i},'x',this.value)" style="flex:1; width:50px; background:#141c2b; border:1px solid #233047; color:#fff; padding:2px 4px; border-radius:3px; font-family:monospace; font-size:11px;">
      <span style="font-size:10px; color:#64748b;">Y:</span>
      <input type="number" value="${Math.round(v.y*10)/10}" step="5" oninput="cadSketchEditVertex(${i},'y',this.value)" style="flex:1; width:50px; background:#141c2b; border:1px solid #233047; color:#fff; padding:2px 4px; border-radius:3px; font-family:monospace; font-size:11px;">
      <button onclick="cadSketchDeleteVertex(${i})" style="background:transparent; border:none; color:#ef4444; cursor:pointer; font-size:11px;" title="점 삭제">✕</button>
    </div>
  `).join('');
}

function cadSketchUpdateHolesTable() {
  const container = document.getElementById('cad-sketch-holes-table');
  if (!container) return;
  if (cadSketchHoles.length === 0) {
    container.innerHTML = '<div style="font-size:11px; color:#64748b; padding:4px;">타공 원이 없습니다. 캔버스에 원을 그리거나 추가하세요.</div>';
    return;
  }
  container.innerHTML = cadSketchHoles.map((h, i) => `
    <div style="display:flex; align-items:center; gap:4px; background:#0c1017; padding:4px 6px; border-radius:4px; border:1px solid ${h.isSubtract ? '#f43f5e' : '#233047'};">
      <span style="font-size:10px; color:#f43f5e; font-weight:700; width:20px;">H${i+1}</span>
      <span style="font-size:9px; color:#64748b;">X:</span>
      <input type="number" value="${Math.round(h.x*10)/10}" step="5" oninput="cadSketchEditHole(${i},'x',this.value)" style="width:40px; background:#141c2b; border:1px solid #233047; color:#fff; padding:2px 4px; border-radius:3px; font-family:monospace; font-size:10px;">
      <span style="font-size:9px; color:#64748b;">Y:</span>
      <input type="number" value="${Math.round(h.y*10)/10}" step="5" oninput="cadSketchEditHole(${i},'y',this.value)" style="width:40px; background:#141c2b; border:1px solid #233047; color:#fff; padding:2px 4px; border-radius:3px; font-family:monospace; font-size:10px;">
      <span style="font-size:9px; color:#64748b;">Ø:</span>
      <input type="number" value="${Math.round(h.dia*10)/10}" step="1" oninput="cadSketchEditHole(${i},'dia',this.value)" style="width:38px; background:#141c2b; border:1px solid #233047; color:#fff; padding:2px 4px; border-radius:3px; font-family:monospace; font-size:10px;">
      <label style="display:flex; align-items:center; gap:2px; font-size:9px; color:${h.isSubtract ? '#f43f5e' : '#94a3b8'}; cursor:pointer;">
        <input type="checkbox" ${h.isSubtract ? 'checked' : ''} onchange="cadSketchEditHole(${i},'isSubtract',this.checked)"> 빼기
      </label>
      <button onclick="cadSketchDeleteHole(${i})" style="background:transparent; border:none; color:#ef4444; cursor:pointer; font-size:11px;" title="홀 삭제">✕</button>
    </div>
  `).join('');
}

function cadSketchInitCanvas() {
  const canvas = document.getElementById('cad-sketch-canvas');
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    canvas.width = rect.width;
    canvas.height = rect.height;
  }

  if (cadSketchCanvasInitialized) {
    cadSketchRender();
    return;
  }
  cadSketchCanvasInitialized = true;

  window.addEventListener('resize', () => {
    if (canvas.parentElement) {
      const r = canvas.parentElement.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        canvas.width = r.width;
        canvas.height = r.height;
        cadSketchRender();
      }
    }
  });

  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (e.button === 2 || e.button === 1) {
      cadSketchIsPanning = true;
      cadSketchPanStart = { x: sx, y: sy };
      canvas.style.cursor = 'grab';
      return;
    }

    if (e.button === 0) {
      const worldNoSnap = cadSketchScreenToWorld(sx, sy, canvas.width, canvas.height, false);
      const worldSnap = cadSketchScreenToWorld(sx, sy, canvas.width, canvas.height, true);

      // Check handle grab
      for (let i = 0; i < cadSketchVertices.length; i++) {
        const v = cadSketchVertices[i];
        const dist = Math.hypot(v.x - worldNoSnap.x, v.y - worldNoSnap.y);
        if (dist <= 12 / cadSketchScale) {
          cadSketchDraggedVertexIdx = i;
          return;
        }
      }

      if (cadSketchTool === 'point') {
        if (cadSketchVertices.length >= 3) {
          const first = cadSketchVertices[0];
          const distFirst = Math.hypot(first.x - worldNoSnap.x, first.y - worldNoSnap.y);
          if (distFirst <= 15 / cadSketchScale) {
            cadSketchIsClosed = true;
            cadSketchCloseLoopToggle();
            cadSketchCloseLoopToggle(); // Sync UI
            cadSketchUpdateVerticesTable();
            cadSketchRender();
            return;
          }
        }
        cadSketchVertices.push({ x: worldSnap.x, y: worldSnap.y });
        cadSketchUpdateVerticesTable();
        cadSketchRender();
      } else if (cadSketchTool === 'circle') {
        cadSketchCircleStart = { x: worldSnap.x, y: worldSnap.y };
      } else if (cadSketchTool === 'subtract') {
        for (let i = 0; i < cadSketchHoles.length; i++) {
          const h = cadSketchHoles[i];
          const dist = Math.hypot(h.x - worldNoSnap.x, h.y - worldNoSnap.y);
          if (dist <= (h.dia / 2) + 10) {
            h.isSubtract = !h.isSubtract;
            cadSketchUpdateHolesTable();
            cadSketchRender();
            return;
          }
        }
      }
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (cadSketchIsPanning) {
      const dx = (sx - cadSketchPanStart.x) / cadSketchScale;
      const dy = -(sy - cadSketchPanStart.y) / cadSketchScale;
      cadSketchPan.x += dx;
      cadSketchPan.y += dy;
      cadSketchPanStart = { x: sx, y: sy };
      cadSketchRender();
      return;
    }

    const worldSnap = cadSketchScreenToWorld(sx, sy, canvas.width, canvas.height, true);
    cadSketchCurrentMouseWorld = worldSnap;

    const hud = document.getElementById('cad-sketch-coords-hud');
    if (hud) {
      hud.textContent = `CURSOR: X: ${worldSnap.x.toFixed(1)} mm | Y: ${worldSnap.y.toFixed(1)} mm (SNAP: ${cadSketchSnapEnabled ? cadSketchSnapGrid + 'mm' : 'OFF'})`;
    }

    if (cadSketchDraggedVertexIdx >= 0) {
      cadSketchVertices[cadSketchDraggedVertexIdx].x = worldSnap.x;
      cadSketchVertices[cadSketchDraggedVertexIdx].y = worldSnap.y;
      cadSketchUpdateVerticesTable();
      cadSketchRender();
      return;
    }

    cadSketchRender();
  });

  canvas.addEventListener('pointerup', (e) => {
    if (cadSketchIsPanning) {
      cadSketchIsPanning = false;
      canvas.style.cursor = 'crosshair';
    }
    if (cadSketchDraggedVertexIdx >= 0) {
      cadSketchDraggedVertexIdx = -1;
    }
    if (cadSketchCircleStart && cadSketchTool === 'circle') {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const worldSnap = cadSketchScreenToWorld(sx, sy, canvas.width, canvas.height, true);
      const rad = Math.hypot(worldSnap.x - cadSketchCircleStart.x, worldSnap.y - cadSketchCircleStart.y);
      const dia = Math.max(Math.round(rad * 2), 4);
      cadSketchHoles.push({
        x: cadSketchCircleStart.x,
        y: cadSketchCircleStart.y,
        dia: dia,
        isSubtract: true
      });
      cadSketchCircleStart = null;
      cadSketchUpdateHolesTable();
      cadSketchRender();
      log(`🎯 [빠른 스케치] 타공 원(중심: [${worldSnap.x}, ${worldSnap.y}]mm, 직경: Ø${dia}mm)이 배치되었습니다.`);
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    cadSketchScale = Math.max(0.2, Math.min(10.0, cadSketchScale * zoomFactor));
    cadSketchRender();
  }, { passive: false });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  cadSketchUpdateVerticesTable();
  cadSketchUpdateHolesTable();
  cadSketchRender();
}

function cadSketchRender() {
  const canvas = document.getElementById('cad-sketch-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // 1. Clear & Background
  ctx.fillStyle = '#06090f';
  ctx.fillRect(0, 0, w, h);

  // 2. Metric Grid Drawing
  const minWorld = cadSketchScreenToWorld(0, h, w, h, false);
  const maxWorld = cadSketchScreenToWorld(w, 0, w, h, false);

  const startX = Math.floor(minWorld.x / 10) * 10;
  const endX = Math.ceil(maxWorld.x / 10) * 10;
  const startY = Math.floor(minWorld.y / 10) * 10;
  const endY = Math.ceil(maxWorld.y / 10) * 10;

  // Minor Grid Lines (10mm)
  ctx.lineWidth = 0.5;
  for (let gx = startX; gx <= endX; gx += 10) {
    const isMajor = (gx % 100 === 0);
    const isMid = (gx % 50 === 0);
    ctx.strokeStyle = isMajor ? 'rgba(56, 189, 248, 0.25)' : isMid ? 'rgba(56, 189, 248, 0.12)' : 'rgba(30, 48, 77, 0.35)';
    const sp = cadSketchWorldToScreen(gx, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(sp.x, 0);
    ctx.lineTo(sp.x, h);
    ctx.stroke();

    if (isMajor && cadSketchScale > 0.4) {
      ctx.fillStyle = '#475569';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillText(`${gx}mm`, sp.x + 3, h - 8);
    }
  }

  for (let gy = startY; gy <= endY; gy += 10) {
    const isMajor = (gy % 100 === 0);
    const isMid = (gy % 50 === 0);
    ctx.strokeStyle = isMajor ? 'rgba(56, 189, 248, 0.25)' : isMid ? 'rgba(56, 189, 248, 0.12)' : 'rgba(30, 48, 77, 0.35)';
    const sp = cadSketchWorldToScreen(0, gy, w, h);
    ctx.beginPath();
    ctx.moveTo(0, sp.y);
    ctx.lineTo(w, sp.y);
    ctx.stroke();

    if (isMajor && cadSketchScale > 0.4) {
      ctx.fillStyle = '#475569';
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.fillText(`${gy}mm`, 8, sp.y - 3);
    }
  }

  // Coordinate Origin Axes (X: Red, Y: Green)
  const origin = cadSketchWorldToScreen(0, 0, w, h);
  ctx.lineWidth = 1.5;
  // X Axis
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
  ctx.beginPath();
  ctx.moveTo(0, origin.y);
  ctx.lineTo(w, origin.y);
  ctx.stroke();
  // Y Axis
  ctx.strokeStyle = 'rgba(34, 197, 94, 0.7)';
  ctx.beginPath();
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, h);
  ctx.stroke();

  // Origin point marker
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.fillText('(0,0)', origin.x + 6, origin.y - 6);

  // 3. Render Polygon Contour
  if (cadSketchVertices.length > 0) {
    ctx.beginPath();
    const firstP = cadSketchWorldToScreen(cadSketchVertices[0].x, cadSketchVertices[0].y, w, h);
    ctx.moveTo(firstP.x, firstP.y);

    for (let i = 1; i < cadSketchVertices.length; i++) {
      const p = cadSketchWorldToScreen(cadSketchVertices[i].x, cadSketchVertices[i].y, w, h);
      ctx.lineTo(p.x, p.y);
    }

    if (cadSketchIsClosed && cadSketchVertices.length >= 3) {
      ctx.closePath();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
      ctx.fill();
    }

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Edge Dimension Labels
    const count = cadSketchIsClosed ? cadSketchVertices.length : cadSketchVertices.length - 1;
    for (let i = 0; i < count; i++) {
      const vA = cadSketchVertices[i];
      const vB = cadSketchVertices[(i + 1) % cadSketchVertices.length];
      const pA = cadSketchWorldToScreen(vA.x, vA.y, w, h);
      const pB = cadSketchWorldToScreen(vB.x, vB.y, w, h);
      const midX = (pA.x + pB.x) / 2;
      const midY = (pA.y + pB.y) / 2;
      const len = Math.hypot(vB.x - vA.x, vB.y - vA.y);

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(midX - 25, midY - 9, 50, 16);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.strokeRect(midX - 25, midY - 9, 50, 16);

      ctx.fillStyle = '#38bdf8';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${len.toFixed(1)}mm`, midX, midY + 3);
    }

    // Vertex Handles
    cadSketchVertices.forEach((v, idx) => {
      const sp = cadSketchWorldToScreen(v.x, v.y, w, h);
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`P${idx} (${v.x},${v.y})`, sp.x + 8, sp.y - 6);
    });
  }

  // 4. Render Holes & Subtractions
  cadSketchHoles.forEach((hole, idx) => {
    const sp = cadSketchWorldToScreen(hole.x, hole.y, w, h);
    const screenR = (hole.dia * 0.5) * cadSketchScale;

    ctx.beginPath();
    ctx.arc(sp.x, sp.y, screenR, 0, Math.PI * 2);
    ctx.fillStyle = hole.isSubtract ? 'rgba(244, 63, 94, 0.22)' : 'rgba(56, 189, 248, 0.15)';
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = hole.isSubtract ? '#f43f5e' : '#38bdf8';
    ctx.setLineDash(hole.isSubtract ? [4, 3] : []);
    ctx.stroke();
    ctx.setLineDash([]);

    // Crosshair in center of hole
    ctx.strokeStyle = hole.isSubtract ? '#f43f5e' : '#38bdf8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sp.x - screenR - 4, sp.y); ctx.lineTo(sp.x + screenR + 4, sp.y);
    ctx.moveTo(sp.x, sp.y - screenR - 4); ctx.lineTo(sp.x, sp.y + screenR + 4);
    ctx.stroke();

    // Hole Label
    ctx.fillStyle = hole.isSubtract ? '#f43f5e' : '#38bdf8';
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Ø${hole.dia}mm ${hole.isSubtract ? '(SUBTRACT)' : ''}`, sp.x, sp.y + screenR + 13);
  });

  // 5. Live drawing preview
  if (cadSketchTool === 'point' && cadSketchVertices.length > 0 && !cadSketchIsClosed) {
    const lastV = cadSketchVertices[cadSketchVertices.length - 1];
    const spLast = cadSketchWorldToScreen(lastV.x, lastV.y, w, h);
    const spCur = cadSketchWorldToScreen(cadSketchCurrentMouseWorld.x, cadSketchCurrentMouseWorld.y, w, h);

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(spLast.x, spLast.y);
    ctx.lineTo(spCur.x, spCur.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const dist = Math.hypot(cadSketchCurrentMouseWorld.x - lastV.x, cadSketchCurrentMouseWorld.y - lastV.y);
    ctx.fillStyle = '#f59e0b';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${dist.toFixed(1)} mm`, (spLast.x + spCur.x) / 2, (spLast.y + spCur.y) / 2 - 6);
  } else if (cadSketchTool === 'circle' && cadSketchCircleStart) {
    const spCenter = cadSketchWorldToScreen(cadSketchCircleStart.x, cadSketchCircleStart.y, w, h);
    const spCur = cadSketchWorldToScreen(cadSketchCurrentMouseWorld.x, cadSketchCurrentMouseWorld.y, w, h);
    const r = Math.hypot(spCur.x - spCenter.x, spCur.y - spCenter.y);

    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(spCenter.x, spCenter.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const diaMm = (r / cadSketchScale) * 2;
    ctx.fillStyle = '#f43f5e';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Ø${diaMm.toFixed(1)} mm (타공)`, spCenter.x, spCenter.y - r - 6);
  }
}

function cadSketchExecuteExtrude() {
  if (cadSketchVertices.length < 3) {
    log('⚠️ [빠른 스케치] 익스트루드를 실행하려면 최소 3개 이상의 점으로 둘러싸인 다각형이 필요합니다.');
    return;
  }

  const tCheck = SketchCore.validateThickness(cadSketchExtrudeThickness);
  if (!tCheck.ok) {
    log(`⚠️ [빠른 스케치] 두께 입력 오류: ${tCheck.error}. 익스트루드하지 않았습니다.`);
    return;
  }

  // Reject holes that are outside the outline, cross an edge or overlap each other
  // (ExtrudeGeometry silently produces a broken mesh in those cases).
  const holeErrors = [];
  cadSketchHoles.forEach((h, i) => {
    if (!h.isSubtract) return;
    const others = cadSketchHoles.filter((o, j) => j < i);
    const v = SketchCore.validateHole(cadSketchVertices, h, others);
    if (!v.ok) holeErrors.push(`#${i + 1} (${h.x}, ${h.y}, Ø${h.dia}): ${v.error}`);
  });
  if (holeErrors.length) {
    log(`⚠️ [빠른 스케치] 구멍 오류로 익스트루드하지 않았습니다 — ${holeErrors.join(' / ')}`);
    return;
  }

  // Mesh extrusion via the shared, unit-tested helper (viewer/lib/sketch_core.js)
  const built = SketchCore.buildPanelGeometry(THREE, cadSketchVertices, cadSketchHoles, tCheck.value);
  const geo = built.geometry;
  const subtractCount = built.subtractCount;
  const thickness = built.thickness;
  // Remember the sketch-space centre before centring, so 3D picks can be mapped back to sketch coordinates.
  geo.computeBoundingBox();
  const sketchCenter = {
    x: (geo.boundingBox.min.x + geo.boundingBox.max.x) / 2,
    y: (geo.boundingBox.min.y + geo.boundingBox.max.y) / 2
  };
  geo.center(); // Center around origin (display only)

  const matSelect = document.getElementById('cad-studio-material');
  const matId = matSelect ? matSelect.value : 'SUS_304_306_Brushed_2B';
  const mat = getIndustrialMaterial(matId);
  mat.wireframe = cadStudioIsWireframe;

  if (cadStudioCurrentMesh && cadStudioScene) {
    cadStudioScene.remove(cadStudioCurrentMesh);
    cadStudioCurrentMesh.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material && c.material.dispose) c.material.dispose();
    });
    cadStudioCurrentMesh = null;
  }

  cadStudioCurrentMesh = new THREE.Mesh(geo, mat);
  cadStudioCurrentMesh.position.set(0, thickness / 2, 0);
  cadStudioCurrentMesh.name = `SolidCraft_Extruded_${Math.round(thickness)}mm`;
  cadStudioCurrentMesh.userData = {
    isSolidCraftPrimitive: true,
    isExtrudedSketch: true,
    thickness: thickness,
    vertices: JSON.parse(JSON.stringify(cadSketchVertices)),
    holes: JSON.parse(JSON.stringify(cadSketchHoles)),
    sketchCenter: sketchCenter,
    materialId: matId,
    chamfers: [],
    fillets: [],
    counterbores: []
  };

  // Add sharp CAD edge lines
  const edgeGeo = new THREE.EdgesGeometry(geo, 20);
  const edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 }));
  cadStudioCurrentMesh.add(edgeLine);

  if (cadStudioScene) {
    cadStudioScene.add(cadStudioCurrentMesh);
  }

  // Update HUD
  const box = new THREE.Box3().setFromObject(cadStudioCurrentMesh);
  const sizeX = Math.round(box.max.x - box.min.x);
  const sizeY = Math.round(box.max.y - box.min.y);
  const sizeZ = Math.round(box.max.z - box.min.z);
  const dimHud = document.getElementById('cad-studio-dim-hud');
  if (dimHud) {
    // Report width × height × thickness from the sketch-space geometry bbox (the old label printed X × Z × Y).
    geo.computeBoundingBox();
    const gb = geo.boundingBox;
    const fmt = v => (Math.round(v * 100) / 100).toString();
    dimHud.textContent = `폭 × 높이 × 두께: ${fmt(gb.max.x - gb.min.x)} × ${fmt(gb.max.y - gb.min.y)} × ${fmt(gb.max.z - gb.min.z)} mm | 구멍: ${subtractCount}개 (메쉬 차집합)`;
  }
  const layers = SketchCore.precisionLayers(THREE, cadSketchHoles, built.curveSegments);
  const precHud = document.getElementById('cad-studio-precision-hud');
  if (precHud) {
    precHud.innerHTML = `${layers.display}<br>${layers.model}<br>${layers.machining}`;
  }

  cadStudioSwitchMode('3d');
  cadStudioFitCameraToMesh();
  log(`🧊 [빠른 스케치] 두께 ${thickness}mm 판넬 메쉬 생성 (구멍 ${subtractCount}개, 원 ${layers.sides}각형 근사, 최대 현 오차 ${layers.worstChordalErrorMm.toFixed(3)}mm). 견적·형상 확인용이며 가공 공차는 검증되지 않았습니다.`);
}
window.cadSketchExecuteExtrude = cadSketchExecuteExtrude;
window.cadSketchRender = cadSketchRender;
window.cadSketchInitCanvas = cadSketchInitCanvas;
window.cadSketchUpdateVerticesTable = cadSketchUpdateVerticesTable;
window.cadSketchUpdateHolesTable = cadSketchUpdateHolesTable;

function initSolidCraftStudioViewport() {
  const canvas = document.getElementById('cad-studio-canvas');
  if (!canvas || cadStudioRenderer) return;

  const container = canvas.parentElement;
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;

  // 1. Dedicated Scene
  cadStudioScene = new THREE.Scene();
  cadStudioScene.background = new THREE.Color(0x0a0e17);

  // 2. Blueprint Studio Grid Floor (Unreal / CAD Style)
  cadStudioGrid = new THREE.GridHelper(3000, 60, 0x007acc, 0x1e293b);
  cadStudioGrid.position.y = 0;
  cadStudioScene.add(cadStudioGrid);

  // 3. Origin Coordinate Tripod
  cadStudioAxes = new THREE.AxesHelper(350);
  cadStudioAxes.renderOrder = 999;
  cadStudioAxes.material.depthTest = false;
  cadStudioScene.add(cadStudioAxes);

  // 4. Studio 3-Point PBR Lighting
  const ambLight = new THREE.AmbientLight(0xffffff, 0.7);
  cadStudioScene.add(ambLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
  keyLight.position.set(2000, 3000, 2500);
  cadStudioScene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.9);
  fillLight.position.set(-2000, 1500, -1500);
  cadStudioScene.add(fillLight);

  const backLight = new THREE.DirectionalLight(0xa855f7, 0.6);
  backLight.position.set(0, 2000, -2500);
  cadStudioScene.add(backLight);

  // 5. Dedicated Camera
  cadStudioCamera = new THREE.PerspectiveCamera(45, width / height, 1, 50000);
  cadStudioCamera.position.set(1800, 1400, 1800);

  // 6. Dedicated Renderer
  cadStudioRenderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  cadStudioRenderer.setPixelRatio(window.devicePixelRatio || 1);
  cadStudioRenderer.setSize(width, height);
  cadStudioRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  cadStudioRenderer.toneMappingExposure = 1.15;

  // 7. Dedicated OrbitControls
  cadStudioControls = new THREE.OrbitControls(cadStudioCamera, canvas);
  cadStudioControls.enableDamping = true;
  cadStudioControls.dampingFactor = 0.08;
  cadStudioControls.target.set(0, 300, 0);
  cadStudioControls.update();

  // Animation Loop
  function animateCadStudio() {
    requestAnimationFrame(animateCadStudio);
    if (cadStudioControls) cadStudioControls.update();
    if (cadStudioRenderer && cadStudioScene && cadStudioCamera) {
      cadStudioRenderer.render(cadStudioScene, cadStudioCamera);
    }
  }
  animateCadStudio();

  // Resize listener
  window.addEventListener('resize', () => {
    if (!cadStudioRenderer || !canvas.parentElement) return;
    const r = canvas.parentElement.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      cadStudioCamera.aspect = r.width / r.height;
      cadStudioCamera.updateProjectionMatrix();
      cadStudioRenderer.setSize(r.width, r.height);
    }
  });

  // Pointer listener for surface coordinate picking
  canvas.addEventListener('pointerdown', (e) => {
    if (!cadStudioIsPickMode || !cadStudioCurrentMesh || !cadStudioCamera) return;
    const rect = canvas.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cadStudioCamera);
    const hits = raycaster.intersectObject(cadStudioCurrentMesh, true);
    if (hits.length > 0) {
      // Find intersection with the main mesh (excluding lines)
      const hit = hits.find(h => h.object && h.object.isMesh && !h.object.userData.isHoleElement) || hits[0];
      const p = hit.point;
      const localP = cadStudioCurrentMesh.worldToLocal(p.clone());
      const roundX = Math.round(localP.x * 10) / 10;
      const roundY = Math.round(localP.y * 10) / 10;
      const xInput = document.getElementById('cad-hole-x');
      const yInput = document.getElementById('cad-hole-y');
      if (xInput) xInput.value = roundX;
      if (yInput) yInput.value = roundY;
      log(`📍 [빠른 스케치] 판넬 표면 타공 위치 자동 픽: X = ${roundX}mm, Y = ${roundY}mm`);
      cadStudioTogglePickMode(); // turn off pick mode after successful pick
    }
  });
}

function openSolidCraftStudioModal() {
  const modal = document.getElementById('modal-solidcraft-studio');
  if (!modal) return;
  modal.style.display = 'flex';

  setTimeout(() => {
    initSolidCraftStudioViewport();
    cadStudioSwitchMode(cadStudioCurrentMode || 'sketch');
  }, 60);

  log('🛠️ [빠른 스케치] 언리얼 블루프린트 모드 2D 모눈 스케처 & 3D 익스트루드 CAD 스튜디오가 활성화되었습니다.');
}
window.openSolidCraftStudioModal = openSolidCraftStudioModal;

function closeSolidCraftStudioModal() {
  const modal = document.getElementById('modal-solidcraft-studio');
  if (modal) modal.style.display = 'none';
}
window.closeSolidCraftStudioModal = closeSolidCraftStudioModal;

function cadStudioSelectPrimitive(type) {
  cadStudioActiveType = type;
  ['box', 'cylinder', 'pipe', 'hbeam', 'trapezoid'].forEach(t => {
    const btn = document.getElementById('cad-btn-' + t);
    if (btn) btn.classList.toggle('active-green', t === type);
  });
  cadStudioRenderParamsForm();
  cadStudioRenderPrimitive();
}
window.cadStudioSelectPrimitive = cadStudioSelectPrimitive;

function cadStudioRenderParamsForm() {
  const container = document.getElementById('cad-studio-params-container');
  if (!container) return;

  if (cadStudioActiveType === 'trapezoid') {
    const p = cadStudioParams.trapezoid;
    container.innerHTML = `
      <div style="font-size:12px; font-weight:700; color:#38bdf8; margin-bottom:8px;">📐 사다리꼴 정밀 판넬 (Trapezoid Panel)</div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#94a3b8;">하변 폭 (W1 밑변):</span>
          <div style="display:flex; align-items:center; gap:4px;">
            <input type="number" value="${p.w1}" step="10" min="20" oninput="cadStudioUpdateParam('trapezoid','w1',this.value)" style="width:80px; background:#0c1017; border:1px solid #233047; color:#fff; padding:3px 6px; border-radius:4px; font-family:monospace; text-align:right;">
            <span style="font-size:10px; color:#64748b;">mm</span>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#94a3b8;">상변 폭 (W2 윗변):</span>
          <div style="display:flex; align-items:center; gap:4px;">
            <input type="number" value="${p.w2}" step="10" min="20" oninput="cadStudioUpdateParam('trapezoid','w2',this.value)" style="width:80px; background:#0c1017; border:1px solid #233047; color:#fff; padding:3px 6px; border-radius:4px; font-family:monospace; text-align:right;">
            <span style="font-size:10px; color:#64748b;">mm</span>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#94a3b8;">세로 높이 (H):</span>
          <div style="display:flex; align-items:center; gap:4px;">
            <input type="number" value="${p.h}" step="10" min="20" oninput="cadStudioUpdateParam('trapezoid','h',this.value)" style="width:80px; background:#0c1017; border:1px solid #233047; color:#fff; padding:3px 6px; border-radius:4px; font-family:monospace; text-align:right;">
            <span style="font-size:10px; color:#64748b;">mm</span>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(56,189,248,0.08); padding:4px 6px; border-radius:4px; border:1px solid rgba(56,189,248,0.2);">
          <span style="font-size:11px; font-weight:700; color:#38bdf8;">판넬 두께 (T / 4cm):</span>
          <div style="display:flex; align-items:center; gap:4px;">
            <input type="number" value="${p.t}" step="5" min="5" oninput="cadStudioUpdateParam('trapezoid','t',this.value)" style="width:80px; background:#0c1017; border:1px solid #38bdf8; color:#38bdf8; font-weight:700; padding:3px 6px; border-radius:4px; font-family:monospace; text-align:right;">
            <span style="font-size:10px; color:#38bdf8;">mm</span>
          </div>
        </div>
      </div>
    `;
  } else if (cadStudioActiveType === 'box') {
    const p = cadStudioParams.box;
    container.innerHTML = `
      <div style="font-size:12px; font-weight:600; color:#38bdf8; margin-bottom:8px;">📦 솔리드 박스 치수 (mm)</div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#94a3b8;">가로 (W / X축):</span>
          <input type="number" value="${p.w}" step="50" min="50" oninput="cadStudioUpdateParam('box','w',this.value)" style="width:90px; background:#0c1017; border:1px solid #233047; color:#fff; padding:4px 6px; border-radius:4px; font-family:monospace; text-align:right;">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#94a3b8;">세로 (D / Y축):</span>
          <input type="number" value="${p.d}" step="50" min="50" oninput="cadStudioUpdateParam('box','d',this.value)" style="width:90px; background:#0c1017; border:1px solid #233047; color:#fff; padding:4px 6px; border-radius:4px; font-family:monospace; text-align:right;">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#94a3b8;">높이 (H / Z축):</span>
          <input type="number" value="${p.h}" step="50" min="50" oninput="cadStudioUpdateParam('box','h',this.value)" style="width:90px; background:#0c1017; border:1px solid #233047; color:#fff; padding:4px 6px; border-radius:4px; font-family:monospace; text-align:right;">
        </div>
      </div>
    `;
  } else if (cadStudioActiveType === 'cylinder') {
    const p = cadStudioParams.cylinder;
    container.innerHTML = `
      <div style="font-size:12px; font-weight:600; color:#38bdf8; margin-bottom:8px;">⚙️ 솔리드 원통 치수 (mm)</div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#94a3b8;">반경 (Radius):</span>
          <input type="number" value="${p.r}" step="10" min="10" oninput="cadStudioUpdateParam('cylinder','r',this.value)" style="width:90px; background:#0c1017; border:1px solid #233047; color:#fff; padding:4px 6px; border-radius:4px; font-family:monospace; text-align:right;">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#94a3b8;">길이/높이 (H):</span>
          <input type="number" value="${p.h}" step="50" min="50" oninput="cadStudioUpdateParam('cylinder','h',this.value)" style="width:90px; background:#0c1017; border:1px solid #233047; color:#fff; padding:4px 6px; border-radius:4px; font-family:monospace; text-align:right;">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#94a3b8;">축 방향:</span>
          <select onchange="cadStudioUpdateParam('cylinder','axis',this.value)" style="width:90px; background:#0c1017; border:1px solid #233047; color:#fff; padding:4px 6px; border-radius:4px; font-size:11px;">
            <option value="Z" ${p.axis==='Z'?'selected':''}>Z (수직)</option>
            <option value="X" ${p.axis==='X'?'selected':''}>X (수평)</option>
            <option value="Y" ${p.axis==='Y'?'selected':''}>Y (전후)</option>
          </select>
        </div>
      </div>
    `;
  } else if (cadStudioActiveType === 'pipe') {
    const p = cadStudioParams.pipe;
    container.innerHTML = `
      <div style="font-size:12px; font-weight:600; color:#38bdf8; margin-bottom:8px;">🔩 산업용 중공 파이프 (mm)</div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#94a3b8;">외경 (OD):</span>
          <input type="number" value="${p.od}" step="5" min="10" oninput="cadStudioUpdateParam('pipe','od',this.value)" style="width:90px; background:#0c1017; border:1px solid #233047; color:#fff; padding:4px 6px; border-radius:4px; font-family:monospace; text-align:right;">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#94a3b8;">내경 (ID):</span>
          <input type="number" value="${p.id}" step="5" min="5" oninput="cadStudioUpdateParam('pipe','id',this.value)" style="width:90px; background:#0c1017; border:1px solid #233047; color:#fff; padding:4px 6px; border-radius:4px; font-family:monospace; text-align:right;">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#94a3b8;">길이 (L):</span>
          <input type="number" value="${p.l}" step="50" min="50" oninput="cadStudioUpdateParam('pipe','l',this.value)" style="width:90px; background:#0c1017; border:1px solid #233047; color:#fff; padding:4px 6px; border-radius:4px; font-family:monospace; text-align:right;">
        </div>
      </div>
    `;
  } else if (cadStudioActiveType === 'hbeam') {
    const p = cadStudioParams.hbeam;
    container.innerHTML = `
      <div style="font-size:12px; font-weight:600; color:#38bdf8; margin-bottom:8px;">🏗️ 구조용 H-형강 (mm)</div>
      <div style="display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#94a3b8;">플랜지 폭 (B):</span>
          <input type="number" value="${p.b}" step="10" min="50" oninput="cadStudioUpdateParam('hbeam','b',this.value)" style="width:90px; background:#0c1017; border:1px solid #233047; color:#fff; padding:4px 6px; border-radius:4px; font-family:monospace; text-align:right;">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#94a3b8;">웨브 높이 (H):</span>
          <input type="number" value="${p.h}" step="10" min="50" oninput="cadStudioUpdateParam('hbeam','h',this.value)" style="width:90px; background:#0c1017; border:1px solid #233047; color:#fff; padding:4px 6px; border-radius:4px; font-family:monospace; text-align:right;">
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:#94a3b8;">길이 (L):</span>
          <input type="number" value="${p.l}" step="100" min="100" oninput="cadStudioUpdateParam('hbeam','l',this.value)" style="width:90px; background:#0c1017; border:1px solid #233047; color:#fff; padding:4px 6px; border-radius:4px; font-family:monospace; text-align:right;">
        </div>
      </div>
    `;
  }
}

function cadStudioUpdateParam(type, key, val) {
  if (cadStudioParams[type]) {
    cadStudioParams[type][key] = (key === 'axis') ? val : (parseFloat(val) || 0);
  }
  cadStudioRenderPrimitive();
}
window.cadStudioUpdateParam = cadStudioUpdateParam;

function cadStudioRenderPrimitive() {
  if (!cadStudioScene) return;

  if (cadStudioCurrentMesh) {
    cadStudioScene.remove(cadStudioCurrentMesh);
    cadStudioCurrentMesh.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      if (c.material && c.material.dispose) c.material.dispose();
    });
    cadStudioCurrentMesh = null;
  }

  const matSelect = document.getElementById('cad-studio-material');
  const matId = matSelect ? matSelect.value : 'SUS_304_306_Brushed_2B';
  const mat = getIndustrialMaterial(matId);
  mat.wireframe = cadStudioIsWireframe;

  let geo = null;
  let dims = [1000, 800, 600];
  let primName = 'SolidCraft_Part';

  if (cadStudioActiveType === 'box') {
    const p = cadStudioParams.box;
    dims = [p.w, p.d, p.h];
    primName = `SolidCraft_Box_${Math.round(p.w)}x${Math.round(p.d)}x${Math.round(p.h)}`;
    geo = new THREE.BoxGeometry(p.w, p.d, p.h);
    cadStudioCurrentMesh = new THREE.Mesh(geo, mat);
    cadStudioCurrentMesh.position.set(0, p.h / 2, 0);
  } else if (cadStudioActiveType === 'cylinder') {
    const p = cadStudioParams.cylinder;
    dims = [p.r * 2, p.r * 2, p.h];
    primName = `SolidCraft_Cylinder_R${Math.round(p.r)}_H${Math.round(p.h)}`;
    geo = new THREE.CylinderGeometry(p.r, p.r, p.h, 48);
    if (p.axis === 'X') geo.rotateZ(Math.PI / 2);
    else if (p.axis === 'Y') geo.rotateX(Math.PI / 2);
    cadStudioCurrentMesh = new THREE.Mesh(geo, mat);
    cadStudioCurrentMesh.position.set(0, p.h / 2, 0);
  } else if (cadStudioActiveType === 'pipe') {
    const p = cadStudioParams.pipe;
    dims = [p.od, p.od, p.l];
    primName = `SolidCraft_Pipe_OD${Math.round(p.od)}_ID${Math.round(p.id)}`;
    geo = new THREE.CylinderGeometry(p.od / 2, p.od / 2, p.l, 48);
    cadStudioCurrentMesh = new THREE.Mesh(geo, mat);
    cadStudioCurrentMesh.position.set(0, p.l / 2, 0);
  } else if (cadStudioActiveType === 'hbeam') {
    const p = cadStudioParams.hbeam;
    dims = [p.b, p.h, p.l];
    primName = `SolidCraft_HBeam_${Math.round(p.b)}x${Math.round(p.h)}_L${Math.round(p.l)}`;
    const group = new THREE.Group();
    const tf = 14; const tw = 9;
    const topFlange = new THREE.Mesh(new THREE.BoxGeometry(p.b, tf, p.l), mat);
    topFlange.position.set(0, p.h / 2 - tf / 2, 0); group.add(topFlange);
    const botFlange = new THREE.Mesh(new THREE.BoxGeometry(p.b, tf, p.l), mat);
    botFlange.position.set(0, -p.h / 2 + tf / 2, 0); group.add(botFlange);
    const webMesh = new THREE.Mesh(new THREE.BoxGeometry(tw, p.h - tf * 2, p.l), mat);
    webMesh.position.set(0, 0, 0); group.add(webMesh);
    cadStudioCurrentMesh = group;
    cadStudioCurrentMesh.position.set(0, p.h / 2, 0);
  } else if (cadStudioActiveType === 'trapezoid') {
    const p = cadStudioParams.trapezoid;
    dims = [p.w1, p.h, p.t];
    primName = `SolidCraft_Trapezoid_${Math.round(p.w1)}x${Math.round(p.w2)}_T${Math.round(p.t)}mm`;
    
    // Create 2D trapezoid centered at origin
    const shape = new THREE.Shape();
    const halfW1 = p.w1 / 2;
    const halfW2 = p.w2 / 2;
    const halfH = p.h / 2;
    
    // Bottom-Left -> Bottom-Right -> Top-Right -> Top-Left
    shape.moveTo(-halfW1, -halfH);
    shape.lineTo(halfW1, -halfH);
    shape.lineTo(halfW2, halfH);
    shape.lineTo(-halfW2, halfH);
    shape.closePath();

    const extrudeSettings = {
      depth: p.t,
      bevelEnabled: false
    };
    geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.center(); // Center around origin
    
    cadStudioCurrentMesh = new THREE.Mesh(geo, mat);
    cadStudioCurrentMesh.position.set(0, p.h / 2, 0);
  }

  if (cadStudioCurrentMesh) {
    cadStudioCurrentMesh.name = primName;
    cadStudioCurrentMesh.userData = {
      isSolidCraftPrimitive: true,
      materialId: matId,
      baseDims: dims,
      primitiveType: cadStudioActiveType,
      chamfers: [],
      fillets: [],
      counterbores: []
    };

    // Add Sharp CAD Edge Line Overlay
    cadStudioCurrentMesh.traverse(child => {
      if (child.isMesh && child.geometry) {
        const edgeGeo = new THREE.EdgesGeometry(child.geometry, 20);
        const edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 }));
        child.add(edgeLine);
      }
    });

    cadStudioScene.add(cadStudioCurrentMesh);

    // Update HUD Dimensions
    const hud = document.getElementById('cad-studio-dim-hud');
    if (hud) {
      hud.textContent = `DIMS: ${dims.map(d => Math.round(d)).join(' × ')} mm | ${cadStudioActiveType.toUpperCase()}`;
    }

    if (cadStudioControls) {
      cadStudioControls.target.set(0, dims[2] ? dims[2] / 2 : 200, 0);
    }
  }
}

function cadStudioUpdateMaterial() {
  const matSelect = document.getElementById('cad-studio-material');
  const matId = matSelect ? matSelect.value : 'SUS_304_306_Brushed_2B';
  if (!cadStudioCurrentMesh) return;
  const newMat = getIndustrialMaterial(matId);
  newMat.wireframe = cadStudioIsWireframe;

  cadStudioCurrentMesh.traverse(child => {
    if (child.isMesh) {
      child.material = newMat;
      child.material.needsUpdate = true;
    }
  });
  cadStudioCurrentMesh.userData.materialId = matId;
}
window.cadStudioUpdateMaterial = cadStudioUpdateMaterial;

function cadStudioToggleWireframe() {
  cadStudioIsWireframe = !cadStudioIsWireframe;
  const btn = document.getElementById('btn-cad-wireframe');
  if (btn) btn.classList.toggle('active-green', cadStudioIsWireframe);
  if (cadStudioCurrentMesh) {
    cadStudioCurrentMesh.traverse(child => {
      if (child.isMesh) {
        child.material.wireframe = cadStudioIsWireframe;
        child.material.needsUpdate = true;
      }
    });
  }
}
window.cadStudioToggleWireframe = cadStudioToggleWireframe;

// Frame the current part: previously the camera stayed ~3 m away, so a 300 mm panel was a few pixels wide.
function cadStudioFitCameraToMesh() {
  if (!cadStudioCurrentMesh || !cadStudioCamera || !cadStudioControls) return;
  const box = new THREE.Box3().setFromObject(cadStudioCurrentMesh);
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2 || 100;
  const fov = THREE.MathUtils.degToRad(cadStudioCamera.fov);
  const dist = (radius / Math.sin(fov / 2)) * 1.15;
  const dir = new THREE.Vector3(0.55, 0.45, 0.7).normalize();
  cadStudioCamera.position.copy(center).addScaledVector(dir, dist);
  cadStudioCamera.near = Math.max(0.1, dist / 100);
  cadStudioCamera.far = dist * 100;
  cadStudioCamera.updateProjectionMatrix();
  cadStudioControls.target.copy(center);
  cadStudioControls.update();
}
window.cadStudioFitCameraToMesh = cadStudioFitCameraToMesh;

function cadStudioResetCamera() {
  if (cadStudioCamera && cadStudioControls) {
    cadStudioCamera.position.set(1800, 1400, 1800);
    cadStudioControls.target.set(0, 300, 0);
    cadStudioControls.update();
  }
}
window.cadStudioResetCamera = cadStudioResetCamera;

function cadStudioSetChamfer(val) {
  const el = document.getElementById('cad-chamfer-val');
  if (el) el.value = val;
}
window.cadStudioSetChamfer = cadStudioSetChamfer;

function cadStudioApplyChamfer() {
  if (!cadStudioCurrentMesh) return;
  const cVal = parseFloat(document.getElementById('cad-chamfer-val').value) || 2.0;
  
  let count = 0;
  cadStudioCurrentMesh.traverse(child => {
    if (child.isMesh && child.geometry) {
      const geo = child.geometry.isBufferGeometry ? child.geometry : new THREE.BufferGeometry().fromGeometry(child.geometry);
      const pos = geo.attributes.position;
      if (!pos) return;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (Math.abs(v.x) > 10 && Math.abs(v.y) > 10) {
          const signX = Math.sign(v.x);
          const signY = Math.sign(v.y);
          pos.setX(i, v.x - signX * cVal * 0.4);
          pos.setY(i, v.y - signY * cVal * 0.4);
          count++;
        }
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      child.geometry = geo;
    }
  });

  // Re-build edge lines
  cadStudioCurrentMesh.traverse(child => {
    if (child.isMesh) {
      const oldEdges = child.children.filter(c => c.isLineSegments);
      oldEdges.forEach(e => child.remove(e));
      const edgeGeo = new THREE.EdgesGeometry(child.geometry, 20);
      const edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 }));
      child.add(edgeLine);
    }
  });

  cadStudioCurrentMesh.userData.chamfers.push(cVal);
  log(`⚠️ [근사 미리보기] 실제 C${cVal}mm 챔퍼가 아닙니다. 중심에서 10mm 넘게 떨어진 정점 ${count}개를 안쪽으로 ${(cVal * 0.4).toFixed(2)}mm씩 옮긴 것이라 판넬 전체(구멍 포함)가 줄어듭니다.`);
}
window.cadStudioApplyChamfer = cadStudioApplyChamfer;

function cadStudioSetFillet(val) {
  const el = document.getElementById('cad-fillet-val');
  if (el) el.value = val;
}
window.cadStudioSetFillet = cadStudioSetFillet;

function cadStudioApplyFillet() {
  if (!cadStudioCurrentMesh) return;
  const rVal = parseFloat(document.getElementById('cad-fillet-val').value) || 2.0;
  
  let count = 0;
  cadStudioCurrentMesh.traverse(child => {
    if (child.isMesh && child.geometry) {
      const pos = child.geometry.attributes.position;
      if (!pos) return;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (Math.abs(v.x) > 10 && Math.abs(v.z) > 10) {
          const signX = Math.sign(v.x);
          const signZ = Math.sign(v.z);
          pos.setX(i, v.x - signX * rVal * 0.35);
          pos.setZ(i, v.z - signZ * rVal * 0.35);
          count++;
        }
      }
      pos.needsUpdate = true;
      child.geometry.computeVertexNormals();
    }
  });

  // Re-build edge lines
  cadStudioCurrentMesh.traverse(child => {
    if (child.isMesh) {
      const oldEdges = child.children.filter(c => c.isLineSegments);
      oldEdges.forEach(e => child.remove(e));
      const edgeGeo = new THREE.EdgesGeometry(child.geometry, 20);
      const edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 }));
      child.add(edgeLine);
    }
  });

  cadStudioCurrentMesh.userData.fillets.push(rVal);
  log(`⚠️ [근사 미리보기] 실제 R${rVal}mm 필렛이 아닙니다. 정점 ${count}개를 안쪽으로 ${(rVal * 0.35).toFixed(2)}mm씩 옮긴 것이라 형상 전체가 변형됩니다.`);
}
window.cadStudioApplyFillet = cadStudioApplyFillet;

function cadStudioApplyCounterbore() {
  if (!cadStudioCurrentMesh) return;
  const preset = document.getElementById('cad-cbore-preset').value;
  
  const cboreSpecs = {
    M5: { holeR: 2.75, boreR: 5.0, depth: 5.5 },
    M6: { holeR: 3.3, boreR: 5.5, depth: 6.5 },
    M8: { holeR: 4.5, boreR: 7.5, depth: 8.5 },
    M10: { holeR: 5.5, boreR: 9.0, depth: 10.5 }
  };
  const spec = cboreSpecs[preset] || cboreSpecs.M6;

  // Add Visual Counterbore Marker Ring
  const boreGeo = new THREE.RingGeometry(spec.holeR, spec.boreR, 32);
  boreGeo.rotateX(-Math.PI / 2);
  const boreMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide });
  const boreMesh = new THREE.Mesh(boreGeo, boreMat);
  boreMesh.position.set(0, 1, 0);

  const innerGeo = new THREE.CylinderGeometry(spec.holeR, spec.holeR, spec.depth * 2, 24);
  const innerMat = new THREE.MeshBasicMaterial({ color: 0x047857 });
  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  innerMesh.position.set(0, -spec.depth, 0);

  const cboreGroup = new THREE.Group();
  cboreGroup.add(boreMesh);
  cboreGroup.add(innerMesh);

  // Position at top center of model
  const box = new THREE.Box3().setFromObject(cadStudioCurrentMesh);
  const topY = box.max.y;
  cboreGroup.position.set(0, topY, 0);

  cadStudioCurrentMesh.add(cboreGroup);
  cadStudioCurrentMesh.userData.counterbores.push({ preset, spec });
  log(`⌖ [표시 마커] ${preset} 카운터보어 마커(보어 Ø${spec.boreR*2}mm / 깊이 ${spec.depth}mm)를 판넬 중앙 위에 붙였습니다. 형상에서 빼지는 않습니다.`);
}
window.cadStudioApplyCounterbore = cadStudioApplyCounterbore;

let cadStudioIsPickMode = false;
function cadStudioTogglePickMode() {
  cadStudioIsPickMode = !cadStudioIsPickMode;
  const btn = document.getElementById('btn-cad-pick-point');
  if (btn) {
    btn.style.background = cadStudioIsPickMode ? 'rgba(56,189,248,0.3)' : 'rgba(56,189,248,0.1)';
    btn.textContent = cadStudioIsPickMode ? '🎯 표면 클릭 대기중...' : '🖱️ 표면 클릭 좌표 픽';
  }
  if (cadStudioIsPickMode) {
    log('🖱️ [빠른 스케치] 3D 뷰포트에서 사다리꼴 판넬 표면을 클릭하면 해당 위치의 (X, Y) 좌표가 자동으로 입력됩니다.');
  }
}
window.cadStudioTogglePickMode = cadStudioTogglePickMode;

function cadStudioApplyCustomHole() {
  if (!cadStudioCurrentMesh) {
    log('⚠️ [빠른 스케치] 먼저 사다리꼴 판넬 또는 프리미티브를 생성해주세요.');
    return;
  }
  const x = parseFloat(document.getElementById('cad-hole-x').value) || 0;
  const y = parseFloat(document.getElementById('cad-hole-y').value) || 0;
  const dia = parseFloat(document.getElementById('cad-hole-dia').value) || 16;
  const depth = parseFloat(document.getElementById('cad-hole-depth').value) || 50;
  const r = dia * 0.5;

  // Extruded sketch panel: add a REAL through-hole to the sketch and rebuild the mesh.
  // (x, y) come from the 3D pick / inputs in centred mesh space → map back to sketch space.
  const ud = cadStudioCurrentMesh.userData || {};
  if (ud.isExtrudedSketch && ud.sketchCenter) {
    const hole = {
      x: Math.round((x + ud.sketchCenter.x) * 1000) / 1000,
      y: Math.round((y + ud.sketchCenter.y) * 1000) / 1000,
      dia: dia,
      isSubtract: true
    };
    const v = SketchCore.validateHole(cadSketchVertices, hole, cadSketchHoles);
    if (!v.ok) {
      log(`⚠️ [빠른 스케치] 구멍을 넣지 않았습니다: ${v.error}`);
      return;
    }
    cadSketchHoles.push(hole);
    cadSketchUpdateHolesTable();
    cadSketchExecuteExtrude();
    log(`🎯 [빠른 스케치] 스케치 좌표 (${hole.x}, ${hole.y})에 Ø${dia}mm 관통 구멍을 추가하고 메쉬를 다시 만들었습니다. (테두리 여유 ${v.edgeClearance.toFixed(2)}mm)`);
    return;
  }
  // Other primitives: no sketch to cut, so only a position marker is added (see log below).

  const holeGroup = new THREE.Group();
  holeGroup.name = `CustomHole_X${x}_Y${y}_D${dia}`;
  holeGroup.userData.isHoleElement = true;

  // 1. Through-hole drill visual cutout (Cylinder along Z)
  const holeGeo = new THREE.CylinderGeometry(r, r, depth + 10, 32);
  holeGeo.rotateX(Math.PI / 2);
  const holeMat = new THREE.MeshStandardMaterial({
    color: 0x05070a,
    roughness: 0.9,
    metalness: 0.1
  });
  const holeMesh = new THREE.Mesh(holeGeo, holeMat);
  holeMesh.userData.isHoleElement = true;
  holeGroup.add(holeMesh);

  // 2. High-precision Target / Chamfered Entry Ring (Cyan rings on front & back faces)
  const ringGeo = new THREE.RingGeometry(r, r + 2.5, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide });
  
  const frontRing = new THREE.Mesh(ringGeo, ringMat);
  frontRing.position.set(0, 0, (depth / 2) + 0.5);
  frontRing.userData.isHoleElement = true;
  holeGroup.add(frontRing);

  const backRing = new THREE.Mesh(ringGeo, ringMat);
  backRing.position.set(0, 0, -(depth / 2) - 0.5);
  backRing.userData.isHoleElement = true;
  holeGroup.add(backRing);

  // 3. Coordinate crosshair marker
  const crossMat = new THREE.LineBasicMaterial({ color: 0x10b981 });
  const crossGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-r - 4, 0, (depth / 2) + 0.6),
    new THREE.Vector3(r + 4, 0, (depth / 2) + 0.6),
    new THREE.Vector3(0, -r - 4, (depth / 2) + 0.6),
    new THREE.Vector3(0, r + 4, (depth / 2) + 0.6)
  ]);
  const cross = new THREE.LineSegments(crossGeo, crossMat);
  cross.userData.isHoleElement = true;
  holeGroup.add(cross);

  // Local placement relative to panel center
  holeGroup.position.set(x, y, 0);

  cadStudioCurrentMesh.add(holeGroup);

  if (!cadStudioCurrentMesh.userData.holes) {
    cadStudioCurrentMesh.userData.holes = [];
  }
  cadStudioCurrentMesh.userData.holes.push({ x, y, dia, depth });

  log(`🎯 [표시 마커] (X:${x}mm, Y:${y}mm)에 Ø${dia}mm 구멍 위치 마커를 붙였습니다. 형상에서 빼지는 않습니다 — 실제 구멍은 2D 스케치의 '구멍 빼기'로 만드세요.`);
}
window.cadStudioApplyCustomHole = cadStudioApplyCustomHole;

function cadStudioApplyToFactoryScene() {
  if (!cadStudioCurrentMesh) {
    if (cadSketchVertices && cadSketchVertices.length >= 3) {
      cadSketchExecuteExtrude();
    }
  }
  if (!cadStudioCurrentMesh) {
    log('⚠️ [빠른 스케치] 배치할 3D 모델이 없습니다. 먼저 스케치 또는 프리미티브를 생성해주세요.');
    return;
  }
  
  pushUndoState();
  const cloned = cadStudioCurrentMesh.clone(true);
  
  // Placement target in factory (center of factory view or current controls target)
  const targetPos = new THREE.Vector3();
  if (controls && controls.target) {
    targetPos.copy(controls.target);
  } else {
    targetPos.set(12000, 8000, 300);
  }
  
  const box = new THREE.Box3().setFromObject(cloned);
  const sizeZ = box.max.z - box.min.z;
  const sizeY = box.max.y - box.min.y;
  
  // Position above ground
  cloned.position.set(targetPos.x, targetPos.y, Math.max(sizeZ / 2, sizeY / 2, 20));
  
  cloned.userData = Object.assign({}, cadStudioCurrentMesh.userData, {
    isSelectable: true,
    placedAt: new Date().toISOString()
  });

  // Ensure shadows and CAD edges in factory scene
  cloned.traverse(child => {
    if (child.isMesh && child.geometry) {
      child.castShadow = true;
      child.receiveShadow = true;
      const edgeGeo = new THREE.EdgesGeometry(child.geometry, 20);
      const edgeLine = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.7 }));
      edgeLine.userData.isCadEdge = true;
      child.add(edgeLine);
    }
  });

  if (placedAssetsGroup) {
    placedAssetsGroup.add(cloned);
  } else {
    scene.add(cloned);
  }
  placedObjects.push(cloned);
  updateOutlinerUI();

  if (typeof selectAssetObject === 'function') {
    selectAssetObject(cloned);
  }

  log(`🚀 [빠른 스케치] '${cloned.name}' 파트가 공장 디지털 트윈 씬에 성공적으로 인스턴스 배치되었습니다! (위치: [${Math.round(cloned.position.x)}, ${Math.round(cloned.position.y)}, ${Math.round(cloned.position.z)}])`);
  closeSolidCraftStudioModal();
}
window.cadStudioApplyToFactoryScene = cadStudioApplyToFactoryScene;

function cadStudioExportOBJ() {
  if (!cadStudioCurrentMesh) return;
  let objOutput = `# SolidCraft CAD Blueprint Studio Export\n# Part: ${cadStudioCurrentMesh.name}\n`;
  let vertOffset = 1;

  cadStudioCurrentMesh.traverse(child => {
    if (child.isMesh && child.geometry) {
      const geo = child.geometry;
      const pos = geo.attributes.position;
      if (!pos) return;
      objOutput += `o ${child.name || cadStudioCurrentMesh.name}\n`;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        v.applyMatrix4(child.matrixWorld);
        objOutput += `v ${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.z.toFixed(2)}\n`;
      }
      if (geo.index) {
        const idx = geo.index;
        for (let i = 0; i < idx.count; i += 3) {
          objOutput += `f ${idx.getX(i) + vertOffset} ${idx.getX(i + 1) + vertOffset} ${idx.getX(i + 2) + vertOffset}\n`;
        }
      } else {
        for (let i = 0; i < pos.count; i += 3) {
          objOutput += `f ${i + vertOffset} ${i + 1 + vertOffset} ${i + 2 + vertOffset}\n`;
        }
      }
      vertOffset += pos.count;
    }
  });

  const blob = new Blob([objOutput], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${cadStudioCurrentMesh.name || 'SolidCraft_Part'}_${Date.now()}.obj`;
  a.click();
  log(`📤 [빠른 스케치] '${cadStudioCurrentMesh.name}.obj' 파일이 성공적으로 다운로드되었습니다.`);
}
window.cadStudioExportOBJ = cadStudioExportOBJ;

