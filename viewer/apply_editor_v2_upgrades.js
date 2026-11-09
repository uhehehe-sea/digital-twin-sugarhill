import fs from 'fs';
import path from 'path';

const basePath = 'C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer';
const editorPath = path.join(basePath, 'editor_v2.js');

let js = fs.readFileSync(editorPath, 'utf8');
console.log('Original editor_v2.js length:', js.length);

// ---------------------------------------------------------------------
// 1. EXPAND ASSET_CATALOG TO 28+ ITEMS
// ---------------------------------------------------------------------
const newAssetCatalogDefinition = `
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
`;

// Replace ASSET_CATALOG
js = js.replace(/const ASSET_CATALOG = \[[\s\S]*?\];/, newAssetCatalogDefinition);

// ---------------------------------------------------------------------
// 2. ADD PROCEDURAL GEOMETRIES FOR NEW ASSETS
// ---------------------------------------------------------------------
const newAssetGeometriesCode = `
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
`;

// Insert the new asset geometries before the default case in createProceduralAssetGeometry
js = js.replace("default: {", `${newAssetGeometriesCode}\n      default: {`);

// ---------------------------------------------------------------------
// 3. ADD FLOATING WINDOW MANAGER LOGIC
// ---------------------------------------------------------------------
const floatingWindowManagerCode = `
// =====================================================================
// 플로팅 윈도우 드래그 & 리사이즈 & 위치 관리 시스템
// =====================================================================
let activeZIndex = 50;

function initFloatingWindows() {
  const winIds = ['win-inspector', 'win-assets', 'win-gate-anim'];
  
  winIds.forEach(id => {
    const win = document.getElementById(id);
    if (!win) return;
    const titlebar = win.querySelector('.win-titlebar');
    if (!titlebar) return;

    // 포커스 시 가장 앞으로 가져오기 (z-index 증가)
    win.addEventListener('pointerdown', () => {
      activeZIndex++;
      win.style.zIndex = activeZIndex;
      winIds.forEach(otherId => {
        const other = document.getElementById(otherId);
        if (other) other.classList.remove('active-focus');
      });
      win.classList.add('active-focus');
    });

    // 타이틀바 드래그 이동
    let isDragging = false;
    let startX = 0, startY = 0;
    let origLeft = 0, origTop = 0;

    titlebar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.win-controls')) return; // 버튼 클릭은 무시
      isDragging = true;
      activeZIndex++;
      win.style.zIndex = activeZIndex;
      startX = e.clientX;
      startY = e.clientY;
      const rect = win.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      win.style.right = 'auto'; // 우측 고정 해제
      win.style.bottom = 'auto'; // 하단 고정 해제
      win.style.left = origLeft + 'px';
      win.style.top = origTop + 'px';
      titlebar.setPointerCapture(e.pointerId);
    });

    titlebar.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      let newLeft = Math.max(0, Math.min(window.innerWidth - 120, origLeft + dx));
      let newTop = Math.max(46, Math.min(window.innerHeight - 50, origTop + dy));
      win.style.left = newLeft + 'px';
      win.style.top = newTop + 'px';
    });

    const stopDrag = (e) => {
      if (isDragging) {
        isDragging = false;
        try { titlebar.releasePointerCapture(e.pointerId); } catch(err) {}
      }
    };
    titlebar.addEventListener('pointerup', stopDrag);
    titlebar.addEventListener('pointercancel', stopDrag);
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
  if (win.style.display === 'none') {
    win.style.display = 'flex';
    activeZIndex++;
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
    win.style.left = 'auto';
    win.style.right = '20px';
    win.style.top = '58px';
    win.style.bottom = 'auto';
    win.style.width = '440px';
    win.style.height = 'calc(100vh - 80px)';
  } else if (winId === 'win-assets') {
    win.style.left = '20px';
    win.style.right = 'auto';
    win.style.top = 'auto';
    win.style.bottom = '20px';
    win.style.width = '820px';
    win.style.height = '360px';
  } else if (winId === 'win-gate-anim') {
    win.style.left = '20px';
    win.style.right = 'auto';
    win.style.top = '58px';
    win.style.bottom = 'auto';
    win.style.width = '380px';
    win.style.height = '260px';
  }
}

function resetFloatingWindows() {
  ['win-inspector', 'win-assets', 'win-gate-anim'].forEach(resetWinPosition);
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

  grid.innerHTML = NVIDIA_SIMREADY_ASSETS.map(asset => \`
    <div class="simready-card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:800; font-size:12px; color:#f1f5f9;">\${asset.name}</span>
        <span class="win-badge-pill" style="border-color:#76b900; color:#76b900;">\${asset.tag}</span>
      </div>
      <div style="font-size:11px; color:#94a3b8; line-height:1.4;">\${asset.desc}</div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px;">
        <span style="font-size:10px; color:#64748b; font-family:ui-monospace,monospace;">USD / SimReady</span>
        <button class="btn-tb active-green" onclick="spawnAssetInstance('\${asset.id}', 14000, 8000, 0); closeNvidiaCatalogModal();" style="padding:4px 8px; font-size:11px;">
          ➕ 씬에 즉시 스폰
        </button>
      </div>
    </div>
  \`).join('');

  modal.style.display = 'flex';
}

function closeNvidiaCatalogModal() {
  const modal = document.getElementById('modal-nvidia-catalog');
  if (modal) modal.style.display = 'none';
}
`;

// ---------------------------------------------------------------------
// 4. ADD CARGO GATE ANIMATION SEQUENCE & 3D BUTTON STATION
// ---------------------------------------------------------------------
const gateAnimationAndInteractionCode = `
// =====================================================================
// 화물 적재 섹셔널 게이트 애니메이션 시퀀스 & 3D 인터랙티브 버튼
// =====================================================================
let gateState = {
  status: 'CLOSED', // 'CLOSED', 'OPENING', 'OPEN', 'CLOSING', 'STOPPED'
  progress: 0.0,    // 0.0 (닫힘) ~ 1.0 (완전 열림)
  targetProgress: 0.0,
  speed: 0.35       // 1초당 진척률
};

let gatePanelsGroup = null;
let gateShaftGroup = null;
let gateWarningLight = null;
let gateButtonStationMesh = null;

function triggerGateAction(action) {
  if (action === 'OPEN') {
    gateState.targetProgress = 1.0;
    gateState.status = 'OPENING';
    log('🚪 화물 적재 게이트 [열기] 시퀀스가 시작되었습니다. (천장 4.1m 틸트 상승)');
  } else if (action === 'CLOSE') {
    gateState.targetProgress = 0.0;
    gateState.status = 'CLOSING';
    log('🚪 화물 적재 게이트 [닫기] 시퀀스가 시작되었습니다.');
  } else if (action === 'STOP') {
    gateState.targetProgress = gateState.progress;
    gateState.status = 'STOPPED';
    log('🛑 화물 적재 게이트 작동이 정지되었습니다.');
  } else if (action === 'TOGGLE') {
    if (gateState.targetProgress > 0.5) {
      triggerGateAction('CLOSE');
    } else {
      triggerGateAction('OPEN');
    }
    return;
  }
  updateGateUI();
}

function updateGateUI() {
  const pill = document.getElementById('gate-state-pill');
  const bar = document.getElementById('gate-progress-bar');
  const percentText = document.getElementById('gate-percent-text');
  const detailText = document.getElementById('gate-detail-text');
  const tbBtn = document.getElementById('btn-tb-gate-toggle');

  const p = Math.round(gateState.progress * 100);
  if (percentText) percentText.textContent = p + '%';
  if (bar) bar.style.width = p + '%';

  const curH = (gateState.progress * 4.1).toFixed(2);

  if (gateState.status === 'OPENING') {
    if (pill) { pill.textContent = 'OPENING...'; pill.style.color = '#38bdf8'; pill.style.borderColor = '#38bdf8'; }
    if (detailText) detailText.textContent = \`상승 중... (높이: \${curH}m / 4.1m)\`;
    if (tbBtn) tbBtn.textContent = '🚪 게이트 닫기 (Space)';
  } else if (gateState.status === 'CLOSING') {
    if (pill) { pill.textContent = 'CLOSING...'; pill.style.color = '#f59e0b'; pill.style.borderColor = '#f59e0b'; }
    if (detailText) detailText.textContent = \`하강 중... (높이: \${curH}m / 4.1m)\`;
    if (tbBtn) tbBtn.textContent = '🚪 게이트 열기 (Space)';
  } else if (gateState.progress >= 0.99) {
    if (pill) { pill.textContent = 'OPEN (4.1m)'; pill.style.color = '#34d399'; pill.style.borderColor = '#34d399'; }
    if (detailText) detailText.textContent = '완전 개방 상태 (적재 차량 진입 가능)';
    if (tbBtn) tbBtn.textContent = '🚪 게이트 닫기 (Space)';
  } else if (gateState.progress <= 0.01) {
    if (pill) { pill.textContent = 'CLOSED'; pill.style.color = '#10b981'; pill.style.borderColor = '#10b981'; }
    if (detailText) detailText.textContent = '닫힘 상태 (높이: 0.0m / 4.1m)';
    if (tbBtn) tbBtn.textContent = '🚪 게이트 열기 (Space)';
  } else {
    if (pill) { pill.textContent = 'STOPPED'; pill.style.color = '#ef4444'; pill.style.borderColor = '#ef4444'; }
    if (detailText) detailText.textContent = \`정지됨 (높이: \${curH}m / 4.1m)\`;
  }
}
`;

// ---------------------------------------------------------------------
// 5. ENHANCE loadPrecisionModel() WITH:
//    - Real Restroom Dual-Door Pod
//    - Real Entrance Staircase
//    - Cargo Bay Hazard Chevron Markings & Dock Bumpers
//    - 3D Pushbutton Station on the wall beside gate
//    - Grounding Lounge Booths to Floor (Z=0)
// ---------------------------------------------------------------------
const architecturalEnhancementsCode = `
      // =================================================================
      // 1. 사용자 피드백 반영: 현대식 듀얼 도어 화장실 포드 (남/여 2문 구조)
      // =================================================================
      const restroomPodGroup = new THREE.Group();
      restroomPodGroup.name = 'Restroom_Dual_Pod_Unit';
      
      const rrWallMat = new THREE.MeshStandardMaterial({ color: 0x222b3b, roughness: 0.4, metalness: 0.1 });
      const rrDoorMatMen = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.3, metalness: 0.2 });
      const rrDoorMatWomen = new THREE.MeshStandardMaterial({ color: 0x831843, roughness: 0.3, metalness: 0.2 });
      const rrSteelMat = materials.STAINLESS_304;

      // 화장실 외벽 및 중앙 칸막이 벽체 (X: 13500 ~ 15900, Y: 0 ~ 2640, Z: 0 ~ 3050)
      addBoxPart(restroomPodGroup, [2400, 100, 3050], [14700, 2600, 1525], rrWallMat); // 전면 벽
      addBoxPart(restroomPodGroup, [100, 2600, 3050], [14700, 1300, 1525], rrWallMat); // 남/여 중앙 분리 칸막이
      
      // 문 1: 남성용 도어 (Restroom_Door_01_Men)
      addBoxPart(restroomPodGroup, [950, 60, 2150], [14100, 2620, 1075], rrDoorMatMen);
      addBoxPart(restroomPodGroup, [30, 80, 280], [14500, 2660, 1050], rrSteelMat); // 스테인리스 핸들
      addBoxPart(restroomPodGroup, [120, 10, 120], [14100, 2660, 1600], new THREE.MeshBasicMaterial({ color: 0x38bdf8 })); // 블루 픽토그램

      // 문 2: 여성용 도어 (Restroom_Door_02_Women)
      addBoxPart(restroomPodGroup, [950, 60, 2150], [15300, 2620, 1075], rrDoorMatWomen);
      addBoxPart(restroomPodGroup, [30, 80, 280], [14900, 2660, 1050], rrSteelMat); // 스테인리스 핸들
      addBoxPart(restroomPodGroup, [120, 10, 120], [15300, 2660, 1600], new THREE.MeshBasicMaterial({ color: 0xf472b6 })); // 마젠타 픽토그램

      scene.add(restroomPodGroup);
      baseControllableObjects.set('Restroom_Dual_Pod_Unit', restroomPodGroup);

      // =================================================================
      // 2. 사용자 피드백 반영: 전면 입구측 추가 계단 (Staircase_Entrance_East_02)
      // =================================================================
      const entranceStairGroup = new THREE.Group();
      entranceStairGroup.name = 'Staircase_Entrance_East_02';

      const stSteelMat = materials.STAINLESS_304;
      const stTreadMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.6 });
      const stYellowMat = materials.SAFETY_YELLOW;

      // 동측 전면 입구 계단 (X: 22000, Y: 1800 ~ 4600, Z: 0 ~ 2800)
      const numSteps = 14;
      const stepRise = 200; // mm
      const stepRun = 200;  // mm
      for (let i = 0; i < numSteps; i++) {
        const sy = 1800 + i * stepRun;
        const sz = (i + 1) * stepRise;
        // 디딤판 (다이아몬드 플레이트 트레드)
        addBoxPart(entranceStairGroup, [1100, stepRun + 20, 45], [22000, sy, sz], stTreadMat);
      }
      // 양측 C-채널 스트링거 빔
      addBoxPart(entranceStairGroup, [60, 3100, 220], [22550, 3100, 1400], stSteelMat);
      addBoxPart(entranceStairGroup, [60, 3100, 220], [21450, 3100, 1400], stSteelMat);

      // OSHA 안전 옐로우 핸드레일 & 포스트
      for (let i = 0; i < 4; i++) {
        const py = 1800 + i * 900;
        const pz = (i * 4.5) * stepRise + 450;
        addBoxPart(entranceStairGroup, [40, 40, 950], [22550, py, pz], stYellowMat);
        addBoxPart(entranceStairGroup, [40, 40, 950], [21450, py, pz], stYellowMat);
      }
      addBoxPart(entranceStairGroup, [40, 3200, 40], [22550, 3100, 2350], stYellowMat); // 상부 핸드레일
      addBoxPart(entranceStairGroup, [40, 3200, 40], [21450, 3100, 2350], stYellowMat);

      scene.add(entranceStairGroup);
      baseControllableObjects.set('Staircase_Entrance_East_02', entranceStairGroup);

      // =================================================================
      // 3. 사용자 피드백 반영: 화물칸 해저드 사선 마킹 & 고무 도크 범퍼
      // =================================================================
      const dockBayGroup = new THREE.Group();
      dockBayGroup.name = 'Dock_Bay_Safety_Structure';

      // 45도 블랙 & 옐로우 해저드 사선 안전선 스트라이프 (바닥면 Z: 6mm)
      const hazardTexCanvas = document.createElement('canvas');
      hazardTexCanvas.width = 512;
      hazardTexCanvas.height = 128;
      const hctx = hazardTexCanvas.getContext('2d');
      hctx.fillStyle = '#facc15'; // OSHA Yellow
      hctx.fillRect(0, 0, 512, 128);
      hctx.fillStyle = '#111827'; // Dark Black
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

      // 화물문 전면 바닥 경고 에이프런
      const apronGeo = new THREE.PlaneGeometry(4400, 600);
      const apronMesh = new THREE.Mesh(apronGeo, hazardMat);
      apronMesh.position.set(14500, 15650, 6);
      dockBayGroup.add(apronMesh);

      // 화물 하차 도크 헤비듀티 고무 범퍼 (좌/우 2개)
      const bumperRubberMat = materials.FKM_FLUOROELASTOMER;
      const bumperFaceMat = materials.STAINLESS_304;
      addBoxPart(dockBayGroup, [250, 350, 600], [12350, 16100, 350], bumperRubberMat);
      addBoxPart(dockBayGroup, [250, 20, 600], [12350, 15915, 350], bumperFaceMat);
      addBoxPart(dockBayGroup, [250, 350, 600], [16650, 16100, 350], bumperRubberMat);
      addBoxPart(dockBayGroup, [250, 20, 600], [16650, 15915, 350], bumperFaceMat);

      scene.add(dockBayGroup);
      baseControllableObjects.set('Dock_Bay_Safety_Structure', dockBayGroup);

      // =================================================================
      // 4. 화물문 우측 벽면 3D 인더스트리얼 푸시버튼 제어 스테이션
      // =================================================================
      const buttonStationGroup = new THREE.Group();
      buttonStationGroup.name = 'Gate_Control_Station_3D';
      buttonStationGroup.position.set(16900, 15850, 1400);

      // 스테이션 인클로저 하우징 (방폭 알루미늄 다이캐스팅)
      const stationBoxMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.6 });
      addBoxPart(buttonStationGroup, [180, 90, 360], [0, 0, 0], stationBoxMat);
      
      // 노란색 전면 명판 (OSHA Warning Plate)
      addBoxPart(buttonStationGroup, [160, 10, 340], [0, -48, 0], materials.SAFETY_YELLOW);

      // 3개 푸시 버튼: 초록(OPEN), 빨강(STOP), 노랑(CLOSE)
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

      scene.add(buttonStationGroup);
      baseControllableObjects.set('Gate_Control_Station_3D', buttonStationGroup);
      gateButtonStationMesh = buttonStationGroup;

      // =================================================================
      // 5. 화물 게이트 리프팅 부품 그룹 분리 & 경광등 세팅
      // =================================================================
      gatePanelsGroup = new THREE.Group();
      gatePanelsGroup.name = 'Gate_Moving_Panels';
      scene.add(gatePanelsGroup);

      const doorMeshNames = ['Door_Sectional_Logistics', 'Door_Sectional_BottomWhite', 'Door_Sectional_Stile_L', 'Door_Sectional_Stile_R'];
      doorMeshNames.forEach(mName => {
        const m = scene.getObjectByName(mName);
        if (m) {
          gatePanelsGroup.attach(m);
        }
      });

      gateShaftGroup = scene.getObjectByName('Door_Sectional_TorsionShaft');

      // 상부 점멸 스트로보 경광등 (Amber Strobe Beacon)
      const strobeMesh = new THREE.Mesh(new THREE.CylinderGeometry(60, 80, 100, 16), new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xd97706, roughness: 0.1 }));
      strobeMesh.position.set(14500, 15900, 4400);
      scene.add(strobeMesh);
      gateWarningLight = strobeMesh;

      // =================================================================
      // 6. 스크린샷에 있던 라운지 소파 부스 바닥 착지 (Z=0) 및 단일 객체 그룹화
      // =================================================================
      const lounge1Parts = ['Lounge_Booth1_GreyShell_Back', 'Lounge_Booth1_GreyShell_L', 'Lounge_Booth1_GreyShell_R', 'Lounge_Booth1_OrangeSeat', 'Lounge_Booth1_OrangeBack'];
      const booth1Group = new THREE.Group();
      booth1Group.name = 'Lounge_Booth_Unit_01';
      lounge1Parts.forEach(pName => {
        const obj = scene.getObjectByName(pName);
        if (obj) {
          booth1Group.attach(obj);
          baseControllableObjects.delete(pName);
        }
      });
      // 바닥(Z=0)으로 착지
      booth1Group.position.z = -150;
      scene.add(booth1Group);
      baseControllableObjects.set('Lounge_Booth_Unit_01', booth1Group);

      const lounge2Parts = ['Lounge_Booth2_GreyShell_Back', 'Lounge_Booth2_GreyShell_L', 'Lounge_Booth2_GreyShell_R', 'Lounge_Booth2_OrangeSeat', 'Lounge_Booth2_OrangeBack'];
      const booth2Group = new THREE.Group();
      booth2Group.name = 'Lounge_Booth_Unit_02';
      lounge2Parts.forEach(pName => {
        const obj = scene.getObjectByName(pName);
        if (obj) {
          booth2Group.attach(obj);
          baseControllableObjects.delete(pName);
        }
      });
      booth2Group.position.z = -150;
      scene.add(booth2Group);
      baseControllableObjects.set('Lounge_Booth_Unit_02', booth2Group);
`;

// Insert architectural enhancements inside loadPrecisionModel right after baseControllableObjects populating
js = js.replace("updateOutlinerUI();\n        log(`✅ 고정밀 B-Rep CAD 모델 로드 완료: ${objCount}개 요소 (모든 오브젝트 선택/변형/삭제 가능)`);", `${architecturalEnhancementsCode}\n        updateOutlinerUI();\n        log(\`✅ 고정밀 B-Rep CAD 모델 로드 완료: \${objCount}개 요소 (모든 오브젝트 선택/변형/삭제 가능)\`);`);

// ---------------------------------------------------------------------
// 6. UPDATE animate() WITH GATE LIFTING & SHAFT SPIN & STROBE FLASH
// ---------------------------------------------------------------------
const gateAnimateLogic = `
  // 화물 게이트 리프팅 시퀀스 물리 보간 연산
  if (gateState.progress !== gateState.targetProgress) {
    const dir = Math.sign(gateState.targetProgress - gateState.progress);
    const step = gateState.speed * 0.016; // 60fps 기준
    if (Math.abs(gateState.targetProgress - gateState.progress) <= step) {
      gateState.progress = gateState.targetProgress;
      if (gateState.progress >= 0.99) gateState.status = 'OPEN';
      else if (gateState.progress <= 0.01) gateState.status = 'CLOSED';
    } else {
      gateState.progress += dir * step;
    }

    // 도어 패널 리프팅 이동 (최대 4,100mm Z축 상승 및 천장 수평 틸트)
    if (gatePanelsGroup) {
      gatePanelsGroup.position.z = gateState.progress * 4100;
      // 상단 곡선 레일 틸트 효과
      gatePanelsGroup.position.y = -Math.pow(gateState.progress, 2) * 900;
    }

    // 토션 스프링 샤프트 회전 (8바퀴)
    if (gateShaftGroup) {
      gateShaftGroup.rotation.x = gateState.progress * Math.PI * 16;
    }

    // 황색 경광등 점멸 (Strobe Flash)
    if (gateWarningLight) {
      const flash = Math.sin(Date.now() * 0.02) > 0;
      gateWarningLight.material.emissiveIntensity = flash ? 3.0 : 0.2;
    }

    updateGateUI();
  }
`;

// Insert gate animation inside animate()
js = js.replace("requestAnimationFrame(animate);\n\n  const delta = clock.getDelta();", `requestAnimationFrame(animate);\n\n  const delta = clock.getDelta();\n${gateAnimateLogic}`);

// ---------------------------------------------------------------------
// 7. ADD 3D PUSHBUTTON RAYCASTING CLICK & KEYBOARD [Space] EVENT
// ---------------------------------------------------------------------
const buttonRaycastAndSpaceLogic = `
  // 3D 뷰포트 내 화물 게이트 푸시버튼 클릭 감지
  window.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.closest('.floating-win')) return;
    const rect = renderer.domElement.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;

    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    if (gateButtonStationMesh) {
      const hits = raycaster.intersectObjects(gateButtonStationMesh.children, true);
      if (hits.length > 0 && hits[0].object.userData.isGateBtn) {
        const action = hits[0].object.userData.action;
        triggerGateAction(action);
        e.stopPropagation();
      }
    }
  }, true);

  // 단축키 Space: 게이트 작동 토글
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      triggerGateAction('TOGGLE');
    }
  });
`;

// ---------------------------------------------------------------------
// 8. ADD NEW CAMERA VIEWS: cargo_gate, restroom_stairs
// ---------------------------------------------------------------------
const newCameraViews = `
    case 'cargo_gate':
      targetPos.set(15500, 11500, 2400);
      targetLook.set(15000, 15900, 2200);
      log('📷 카메라 시점: 북측 화물 적재 섹셔널 도어 & 3D 푸시버튼 제어기');
      break;

    case 'restroom_stairs':
      targetPos.set(18500, 5000, 2200);
      targetLook.set(16000, 2000, 1500);
      log('📷 카메라 시점: 듀얼 도어 화장실 포드 & 전면 입구 계단');
      break;
`;

// Insert new camera views in setView()
js = js.replace("case 'doors':", `${newCameraViews}\n    case 'doors':`);

// Append window manager, SimReady modal, gate animation & interactions to end of file
js += `\n\n${floatingWindowManagerCode}\n${gateAnimationAndInteractionCode}\n${buttonRaycastAndSpaceLogic}\n`;

// Call initFloatingWindows() in init3D
js = js.replace("init3D();\n  renderAssetDrawer();", "init3D();\n  initFloatingWindows();\n  renderAssetDrawer();");

fs.writeFileSync(editorPath, js, 'utf8');
console.log('Successfully updated editor_v2.js! New length:', js.length);
