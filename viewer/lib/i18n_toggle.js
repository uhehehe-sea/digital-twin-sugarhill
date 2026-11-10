/*
 * i18n_toggle.js — 한/EN 화면 전환 (Korean ↔ English UI toggle) for /v2.
 *
 *   The UI is authored in Korean. Switching to English walks the visible text nodes and
 *   title/placeholder attributes and swaps them using
 *     1. EXACT — whole-label translations for the main controls, and
 *     2. GLOSS — a phrase glossary for everything else (longest phrase first).
 *   Originals are remembered, so switching back restores the exact Korean text.
 *   A MutationObserver keeps panels that re-render (live twin cards, nesting window,
 *   logs) in the selected language. Text the glossary cannot fully translate (asset
 *   descriptions, long log sentences) stays in Korean rather than shown half-translated.
 *   Choice persists in localStorage ('twin.lang').
 *
 * Browser only: window.TwinI18n = { set(lang), toggle(), get lang() }
 */
(function () {
  'use strict';
  const HANGUL = /[가-힣]/;
  const KEY = 'twin.lang';

  const EXACT = {
    // 2026-11-09 UI 정리 이후의 문구
    '↖ 선택': '↖ Select', '📷 전체 조감도': '📷 Overview', '🏭 CNC 제조셀': '🏭 CNC cell', '🚪 화물 게이트': '🚪 Cargo gate',
    '🚻 화장실 · 계단': '🚻 Restroom · stairs', '💼 1층 사무실': '💼 1F office', '🪜 메자닌': '🪜 Mezzanine', '☕ 라운지': '☕ Lounge', '🏗 홀 전체 (길이 방향)': '🏗 Whole hall (lengthwise)',
    '👁 보기 ▾': '👁 View ▾', '셰이딩': 'Shading', '사실적 (PBR)': 'Realistic (PBR)', 'CAD 외곽선': 'CAD edges', '실내 투시 (X-Ray)': 'X-Ray',
    '와이어프레임': 'Wireframe', '3DGS 스플랫': '3DGS splat', '외벽 투명도': 'Wall opacity', '카메라 속도': 'Camera speed',
    '⋯ 더보기 ▾': '⋯ More ▾', '🖥️ Zen 모드 (Tab)': '🖥️ Zen mode (Tab)', '⚡ Cycles 렌더': '⚡ Cycles render', '작업 패널': 'Work panel',
    '📐 배치 · 생산': '📐 Layout · Production', '✏️ 만들기': '✏️ Make', '⚙ 설비 · 신호': '⚙ Plant · Signals',
    '📋 복제 (Shift+D)': '📋 Duplicate (Shift+D)', '부품 만들기': 'Make a part',
    '① 스케치로 부품을 만들고 → ② 네스팅으로 원판에 배치해 G-code를 만든 뒤 → ③ 라우터로 보냅니다.': '① Sketch a part → ② nest it on a sheet and generate G-code → ③ send it to the router.',
    '✏️ 빠른 스케치 · 견적 열기': '✏️ Open quick sketch & quote', '📐 네스팅 · G-code 열기': '📐 Open nesting · G-code',
    '📦 설비 · 비품 라이브러리': '📦 Equipment library',
    // top toolbar
    '↖ 선택 (Q)': '↖ Select (Q)', '✥ 이동 (G)': '✥ Move (G)', '↻ 회전 (R)': '↻ Rotate (R)', '⤢ 크기 (T)': '⤢ Scale (T)',
    '스냅: 10mm': 'Snap: 10mm', '스냅: 50mm': 'Snap: 50mm', '스냅: 100mm': 'Snap: 100mm', '스냅: 500mm': 'Snap: 500mm', '스냅: OFF': 'Snap: OFF',
    '속도': 'Speed',
    '⚡ UE5 실사 PBR (AgX IBL + SSR)': '⚡ UE5 photoreal PBR (AgX IBL + SSR)', '📐 정밀 CAD 와이어 외곽선': '📐 CAD edge outlines',
    '🩻 실내 투시 (X-Ray Cutaway)': '🩻 X-Ray cutaway', '🕸️ 메쉬 와이어프레임': '🕸️ Mesh wireframe', '☁️ 3DGS 가우시안 스플랫': '☁️ 3DGS Gaussian splat',
    '📷 전체 조감도 (Isometric)': '📷 Overview (Isometric)', '🚪 화물 게이트 듀얼 존': '🚪 Cargo gate zone', '🏭 CNC & 3D 프린터 제조셀': '🏭 CNC & 3D printer cell',
    '🚻 듀얼 도어 화장실 & 계단': '🚻 Restrooms & stairs', '💼 1층 엔지니어링 오피스': '💼 1F engineering office', '🪜 메자닌 복층 & 계단': '🪜 Mezzanine & stairs',
    '☕ 라운지 & 케이지 존': '☕ Lounge & cage zone', '🏛️ 외벽 투명도': '🏛️ Wall opacity', '투명': 'Clear', '반투명': 'Ghost', '불투명': 'Solid',
    '🚪 게이트: 열기': '🚪 Gate: open', '🚪 게이트: 닫기': '🚪 Gate: close', '↩ 취소': '↩ Undo', '💾 저장': '💾 Save', '🛠️ CAD 모델링 창': '🛠️ CAD modeling',
    '📐 패널 (F4)': '📐 Panel (F4)',
    // viewport HUD
    '🎮 조작:': '🎮 Controls:', '이동 |': 'move |', '승강 |': 'up/down |',
    '부스트 | 좌클릭 드래그: 회전 (선택 오브제 중심) | 우클릭: 이동 | 휠: 줌': 'boost | Left-drag: orbit (around selection) | Right-drag: pan | Wheel: zoom',
    '선택:': 'Selected:',
    '✨ 3D 공간의 원하는 바닥/작업대 위치에 마우스를 놓아 에셋을 배치하세요 (ESC: 취소)': '✨ Point at a floor or bench spot to place the asset (ESC: cancel)',
    // sidebar header + tabs
    '🛠️ 작업 메뉴:': '🛠️ Workspace:', '📐 1. 속성 & 트랜스폼': '📐 1. Properties & transform', '🛠️ 2. SolidCraft CAD 모델링': '🛠️ 2. SolidCraft CAD modeling',
    '🚪 3. 화물 게이트 제어': '🚪 3. Cargo gate control', '⚡ 4. 가상 PLC 신호 버스': '⚡ 4. Virtual PLC signal bus', '🏭 5. 팩토리 씬 레이아웃': '🏭 5. Factory scene layout',
    '▶ 접기': '▶ Collapse', '◀ 작업 패널 펼치기': '◀ Expand panel', '📐 속성': '📐 Properties', '🛠️ CAD 모델링': '🛠️ CAD modeling', '🚪 화물 도어': '🚪 Cargo door',
    '⚡ 가상 PLC': '⚡ Virtual PLC', '🏭 레이아웃': '🏭 Layout',
    // inspector
    '선택 오브젝트 트랜스폼': 'Selected object transform', '선택 없음': 'Nothing selected', '위치 (mm)': 'Position (mm)', '회전 (°)': 'Rotation (°)', '스케일': 'Scale',
    '바운딩 크기:': 'Bounding size:', '추정 중량:': 'Est. mass:', '📋 복제 (Ctrl+D)': '📋 Duplicate (Ctrl+D)', '🗑️ 삭제 (Del)': '🗑️ Delete (Del)', '건물 부재': 'Building part',
    '🚪 게이트': '🚪 Gate', '🚪 화물 게이트 열기 (OPEN)': '🚪 Open cargo gate', '🚪 화물 게이트 닫기 (CLOSE)': '🚪 Close cargo gate',
    '엔지니어링 재질 스튜디오 (PBR Spec)': 'Engineering materials (PBR spec)',
    // live twin panel
    '🏭 생산 · 실시간 트윈': '🏭 Production · live twin', '가정값': 'Assumed', '🎥 자동 클로즈업': '🎥 Auto close-up', '📐 네스팅 · G-code': '📐 Nesting · G-code',
    '◎ 내부 보기': '◎ See inside', '내부': 'Inside', '복귀': 'Return', '대기 — 작업이 시작되면 그 설비로 다가갑니다': 'Idle — the camera moves in when a job starts',
    'CNC 라우터': 'CNC router', '보기': 'View', '대기': 'Idle', '가동': 'Running', '로딩': 'Loading', '언로딩': 'Unloading', '일시정지': 'Hold', '정지': 'Stopped',
    'CNC 선반': 'CNC lathe', '회전체 전용': 'Turned parts only', '금속 3D 프린터': 'Metal 3D printer', '층': 'Layer', '베드Z': 'Bed Z', '레이저': 'Laser', '리코터': 'Recoater',
    '모델링 부품 → 설비 배정': 'Modeled part → machine', '배정': 'Assign', '실시간 데이터': 'Live data', 'WebSocket 연결됨': 'WebSocket connected',
    'WebSocket 끊김': 'WebSocket disconnected', '모니터 ↗': 'Monitor ↗', '수신 화면 0': 'Viewers 0',
    '부품 없음: CAD 모델링 → 빠른 스케치에서 판넬을 만들고 “공장에 배치”.': 'No parts: CAD modeling → quick sketch, make a panel, then “place in factory”.',
    // modeling tab
    '🚀 독립 창 CAD 스튜디오': '🚀 Standalone CAD studio', '공장 메인 씬과 분리된': 'A', '독립 3D 뷰포트 창': 'separate 3D viewport window',
    '에서 실시간 360° 턴테이블 회전 및 치수 가공 후 공장 씬에 즉시 인스턴스로 배치합니다.': ': turntable, edit dimensions, then place the part in the factory scene.',
    '⬡ 언리얼 스타일 전용 CAD 창 띄우기': '⬡ Open CAD studio window', '🛠️ 형상 편집 (메쉬)': '🛠️ Shape editing (mesh)', 'Three.js 메쉬 · B-Rep 아님': 'Three.js mesh · not B-Rep',
    '1. 파라메트릭 솔리드 생성기 (Primitives)': '1. Parametric primitives', '박스': 'Box', '원통': 'Cylinder', '파이프': 'Pipe', 'H-형강': 'H-beam',
    '폭 (X mm)': 'Width (X mm)', '깊이 (Y mm)': 'Depth (Y mm)', '높이 (Z mm)': 'Height (Z mm)', '규격 프리셋:': 'Presets:', '유로 팔레트': 'Euro pallet',
    '제어반 캐비닛': 'Control cabinet', '스틸 베이스': 'Steel base', '반경 (R mm)': 'Radius (R mm)', '높이 (H mm)': 'Height (H mm)', '축 방향': 'Axis',
    'Z (수직)': 'Z (vertical)', 'X (수평)': 'X (horizontal)', 'Y (전후)': 'Y (front-back)', '샤프트 핀': 'Shaft pin', '롤러 축': 'Roller shaft', '플랜지 허브': 'Flange hub',
    '외경 (OD mm)': 'Outer Ø (OD mm)', '내경 (ID mm)': 'Inner Ø (ID mm)', '길이 (L mm)': 'Length (L mm)', '50A 강관': '50A steel pipe', '100A 배관': '100A pipe',
    '플랜지 (B mm)': 'Flange (B mm)', '웹 높이 (H mm)': 'Web height (H mm)', 'PBR 재질:': 'PBR material:',
    '➕ 3D 뷰포트에 솔리드 생성 (solidcraft.create)': '➕ Create solid in viewport (solidcraft.create)',
    '2. 형상 근사 미리보기 (실제 가공 형상 아님)': '2. Approximate preview (not the machined shape)', '⚠ 근사': '⚠ Approx.',
    '✂️ 챔퍼 근사 (외곽 축소 박스)': '✂️ Chamfer approx. (shrunk box)', 'C값 mm': 'C (mm)', '가공 적용': 'Apply', '⭕ 필렛 근사 (외곽 축소 박스)': '⭕ Fillet approx. (shrunk box)',
    'R값 mm': 'R (mm)', '🔩 카운터보어 위치 마커 (구멍 안 뚫림)': '🔩 Counterbore marker (no hole cut)', '규격 볼트홀': 'Bolt hole size', '타공 실행': 'Drill',
    '🔄 가공 형상 원본 복원 (solid.reset_stock)': '🔄 Restore original stock (solid.reset_stock)', '3. 3D 거리 측정 (화면상 메쉬 기준)': '3. 3D distance (on-screen mesh)',
    '📏 3D 레이저 거리 계측기: OFF': '📏 3D distance tool: OFF', '📏 3D 레이저 거리 계측기: ON': '📏 3D distance tool: ON', '지우기': 'Clear', '측정 직선 거리 (Dist):': 'Distance:',
    '4. SolidCraft 스크립트 & 내보내기': '4. SolidCraft script & export', '📋 SolidCraft 스크립트': '📋 SolidCraft script', '📤 OBJ 지오메트리': '📤 OBJ geometry',
    // gate tab
    '🚪 화물 게이트 (오버헤드 섹셔널 도어)': '🚪 Cargo gate (overhead sectional door)', '▲ 열기 (OPEN)': '▲ OPEN', '■ 정지 (STOP)': '■ STOP', '▼ 닫기 (CLOSE)': '▼ CLOSE',
    '설치 벽면 (Wall Position)': 'Wall position', '북측 벽 (Y=16m, 기본값 고정 ✓)': 'North wall (Y=16m, default ✓)', '북측 (기본값)': 'North (default)',
    '남측 (Y=0)': 'South (Y=0)', '서측 (X=0)': 'West (X=0)', '동측 (X=24)': 'East (X=24)', '💾 북측(Y=16m)을 기본값으로 영구 저장': '💾 Save north (Y=16m) as default',
    '🚪 화물 게이트:': '🚪 Cargo gate:',
    // PLC / layout tabs
    '가상 PLC 신호 버스 (S7-1500)': 'Virtual PLC signal bus (S7-1500)', '스핀들 회전수': 'Spindle speed', '챔버 산소 분압': 'Chamber O₂', '35 PPM (안전)': '35 PPM (safe)',
    '디지털 입력 (DI: 인터록 & 센서)': 'Digital inputs (DI: interlocks & sensors)', '디지털 출력 (DO: 모터 & 밸브)': 'Digital outputs (DO: motors & valves)',
    '실시간 래더 로직 (Ladder Rungs)': 'Live ladder logic (rungs)', '배치 에셋 목록 & 통계': 'Placed assets & stats', '데이터 동기화 & 내보내기': 'Sync & export',
    '💾 서버에 씬 레이아웃 동기화': '💾 Sync scene layout to server', '📥 JSON 파일 내보내기': '📥 Export JSON', '⚠️ 전체 배치 에셋 초기화': '⚠️ Reset all placed assets',
    // content drawer
    '🗂️ 콘텐츠 드로어': '🗂️ Content drawer', '🗂️ 콘텐츠 드로어 (Ctrl+Space)': '🗂️ Content drawer (Ctrl+Space)', 'CNC & 3D프린터': 'CNC & 3D printers', '물류 로봇': 'Logistics robots',
    '보관 설비': 'Storage', '오피스': 'Office', '안전 환경': 'Safety', '+드래그/클릭': '+drag/click', '▲ 에셋창 펼치기': '▲ Expand assets', '▼ 접기': '▼ Collapse',
    '📦 NVIDIA Isaac SimReady™ 디지털 트윈 에셋 뱅크': '📦 NVIDIA Isaac SimReady™ asset bank', '✕ 닫기': '✕ Close', '⚡ 지금 렌더링 시작': '⚡ Render now',
    // quick sketch / quote studio
    '빠른 스케치·견적 모드': 'Quick sketch & quote', '메쉬 · 가공 공차 미검증': 'Mesh · tolerances not verified', '✏️ 2D 모눈 스케처': '✏️ 2D grid sketch',
    '🧊 3D 솔리드 뷰': '🧊 3D solid view', '⟲ 카메라/화면 리셋': '⟲ Reset view', '▦ 와이어프레임': '▦ Wireframe', '🚀 공장 씬에 적용 및 배치': '🚀 Place in factory scene',
    '빠른 스케치·견적 모드 — 2D 스케치': 'Quick sketch & quote — 2D sketch', '빠른 스케치·견적 모드 — 3D 메쉬 미리보기': 'Quick sketch & quote — 3D mesh preview',
    '화면 표시: 메쉬 (익스트루드 후 계산)': 'Display: mesh (computed after extrude)', '모델 수치: 입력 좌표 → 브라우저 Float32 메쉬 (정밀 형상 기준 아님)': 'Model values: typed coordinates → Float32 mesh (not a precise reference)',
    '가공 공차: 미검증': 'Machining tolerance: not verified',
    '✏️ 마우스 좌클릭: 점 추가 / 원 그리기 | 우클릭 드래그: 모눈 이동(팬) | 휠: 줌 인/아웃': '✏️ Left-click: add point / circle | Right-drag: pan | Wheel: zoom',
    '1. 스케치 도구 (DRAWING TOOLS)': '1. Drawing tools', '✏️ 점/외곽선': '✏️ Points/outline', '◯ 원 그리기': '◯ Circle', '✂️ 구멍 빼기': '✂️ Cut hole',
    '🧲 그리드 스냅: 10mm (ON)': '🧲 Grid snap: 10mm (ON)', '🧲 그리드 스냅: OFF': '🧲 Grid snap: OFF', '🔄 루프: 닫힘 (Closed)': '🔄 Loop: closed', '🔄 루프: 열림 (Open)': '🔄 Loop: open',
    '📐 빠른 판재 형상 프리셋 (PRESETS)': '📐 Panel presets', '사다리꼴 (300×180×250)': 'Trapezoid (300×180×250)', '직사각형 (300×200)': 'Rectangle (300×200)',
    '⟲ 스케치 전체 초기화': '⟲ Clear sketch', '📍 외곽 정점 좌표 수치 기입 (VERTICES)': '📍 Outline vertices', '+ 점 추가': '+ Add point',
    '* 마우스 드래그 또는 아래 X, Y 수치를 타이핑하여 수정 가능': '* Drag with the mouse or type X, Y below', '🎯 타공 원 및 빼기 (HOLES & SUBTRACTION)': '🎯 Holes & subtraction',
    '+ 원 추가': '+ Add circle', '🧊 3D 입체 변환 (EXTRUSION)': '🧊 Extrusion', '판넬 두께 (Thickness):': 'Panel thickness:',
    '🧊 입력 두께로 익스트루드 (메쉬 미리보기)': '🧊 Extrude to thickness (mesh preview)', '📚 라이브러리에 저장': '📚 Save to library',
    '✏️ 2D 모눈 스케처로 돌아가기 (Edit Sketch)': '✏️ Back to 2D sketch', '1. 파라메트릭 프리미티브 (PRIMITIVES)': '1. Parametric primitives', '사다리꼴': 'Trapezoid',
    '2. PBR 재질 선택': '2. PBR material', '3. 형상 근사 미리보기 (실제 가공 형상 아님)': '3. Approximate preview (not the machined shape)',
    '✂ 45° 챔퍼 모따기': '✂ 45° chamfer', '모따기 적용': 'Apply chamfer', '⌒ R-필렛 라운딩': '⌒ R fillet', '라운딩 적용': 'Apply fillet',
    '🎯 지정 좌표 관통 구멍 (스케치 판넬)': '🎯 Through-hole at coordinates', '🖱️ 표면 클릭 좌표 픽': '🖱️ Pick on surface', 'X 좌표 (mm):': 'X (mm):', 'Y 좌표 (mm):': 'Y (mm):',
    '홀 직경 Ø (mm):': 'Hole Ø (mm):', '타공 깊이 (mm):': 'Hole depth (mm):', '⚡ 지정 좌표 관통홀 타공 실행': '⚡ Drill through-hole',
    '🚀 공장 씬에 적용 및 배치 (Apply to Scene)': '🚀 Place in factory scene', '💾 모델 OBJ 파일 다운로드': '💾 Download OBJ',
    // nesting window
    '자동 계산 · G-code 초안 · 가정 이송 · 파일까지만': 'Auto nest · G-code draft · assumed feeds · file only', '닫기': 'Close', '부품 라이브러리': 'Part library',
    '서버': 'Server', '두께': 'Thickness', '이 두께 모두 선택': 'Select all of this thickness', '선택 해제': 'Clear selection', 'DXF 불러오기': 'Import DXF',
    '판 두께 (mm)': 'Sheet thickness (mm)', '📥 .dxf 선택': '📥 Choose .dxf', '원판 (mm)': 'Sheet (mm)', '길이 X': 'Length X', '폭 Y': 'Width Y', '여백': 'Margin',
    '부품 간격': 'Part spacing', '90° 회전 허용 (결 없음)': 'Allow 90° rotation (no grain)', '원판 재질': 'Sheet material', '공구 · 절삭 (가정값)': 'Tool · cutting (assumed)',
    '공구 Ø': 'Tool Ø', '절입/패스': 'Depth/pass', '이송 mm/min': 'Feed mm/min', '스핀들 rpm': 'Spindle rpm', '고정 탭': 'Holding tabs', '개수': 'Count', '폭': 'Width',
    '높이': 'Height', '설비': 'Machine', '💾 .nc 저장': '💾 Save .nc', '🔍 CNC 검증': '🔍 CNC verify', '라우터로 보내기 ▶': 'Send to router ▶',
    '부품을 체크하면 자동으로 네스팅됩니다.': 'Tick parts to nest them automatically.', '부품': 'Parts', '공구 경로': 'Tool path', '탭': 'Tabs',
    '🔍 CNC 검증 — CAMotics에서 보기': '🔍 CNC verify — view in CAMotics', '외부 3축 시뮬레이터 · 눈으로 확인용': 'External 3-axis simulator · visual check',
    '전송 차단': 'Send blocked',
  };

  // Phrase glossary (applied longest first) for labels not in EXACT: asset names, cards, logs.
  const GLOSS = [
    ['스테인리스', 'stainless'], ['폴리프로필렌', 'polypropylene'], ['불소고무', 'fluoroelastomer'], ['내화학', 'chemical-resistant'], ['유리섬유 강화', 'glass-fiber reinforced'],
    ['전해연마', 'electropolished'], ['브러시드', 'brushed'], ['미러', 'mirror'], ['초내열', 'high-heat'], ['고온 산화피막', 'high-temp oxide'], ['적층면', 'as-built'],
    ['3D프린팅', '3D-printed'], ['3D 프린팅', '3D printing'], ['금속 3D 프린터', 'metal 3D printer'], ['금속 3D프린터', 'metal 3D printer'], ['3D 프린터', '3D printer'], ['3D프린터', '3D printer'],
    ['CNC 라우터', 'CNC router'], ['CNC 선반', 'CNC lathe'], ['머시닝 센터', 'machining center'], ['라우터', 'router'], ['선반', 'lathe'], ['판재 가공', 'sheet cutting'], ['판재', 'sheet'],
    ['완료', 'done'], ['대기', 'queued'], ['가동률', 'utilization'], ['가동', 'running'], ['송신', 'sent'], ['수신 화면', 'viewers'], ['가공 중', 'machining'], ['가공', 'machining'],
    ['배정 가능한 부품 없음', 'no assignable parts'], ['부품', 'part'], ['진행', 'progress'], ['남음', 'left'], ['제거량', 'removed'], ['따라가는 중', 'following'],
    ['고정', 'pinned'], ['일시정지', 'paused'], ['자동 재개', 'auto-resume'], ['재개', 'resume'], ['원래 화면', 'original view'], ['돌아감', 'returning'],
    ['보관 캐비닛', 'storage cabinet'], ['캐비닛', 'cabinet'], ['보관함', 'locker'], ['보관대', 'rack'], ['보관 랙', 'storage rack'], ['랙', 'rack'], ['작업대', 'workbench'],
    ['데스크', 'desk'], ['책상', 'desk'], ['의자', 'chair'], ['체어', 'chair'], ['오피스', 'office'], ['사무실', 'office'], ['회의용 테이블', 'meeting table'], ['테이블', 'table'],
    ['복합기', 'multifunction printer'], ['프린터', 'printer'], ['플로터', 'plotter'], ['모니터', 'monitor'], ['키보드', 'keyboard'], ['마우스', 'mouse'], ['휴지통', 'bin'],
    ['서류함', 'file cabinet'], ['서랍장', 'drawers'], ['지게차', 'forklift'], ['팔레트 트럭', 'pallet truck'], ['팔레트', 'pallet'], ['컨베이어', 'conveyor'], ['자율주행', 'autonomous'],
    ['물류 로봇', 'logistics robot'], ['로봇', 'robot'], ['견인', 'towing'], ['시저 리프트', 'scissor lift'], ['안전 샤워', 'safety shower'], ['세안', 'eyewash'], ['공구함', 'tool chest'],
    ['가드레일', 'guardrail'], ['펜스', 'fence'], ['도어', 'door'], ['게이트', 'gate'], ['안전', 'safety'], ['방폭', 'explosion-proof'], ['위험물', 'hazmat'], ['화학', 'chemical'],
    ['세척기', 'washer'], ['세척', 'cleaning'], ['측정기', 'measuring machine'], ['측정', 'measurement'], ['오븐', 'oven'], ['챔버', 'chamber'], ['진공', 'vacuum'], ['분말', 'powder'],
    ['회수', 'recovery'], ['탱크', 'tank'], ['가스', 'gas'], ['아르곤', 'argon'], ['레이저', 'laser'], ['듀얼', 'dual'], ['정밀', 'precision'], ['초정밀', 'ultra-precision'],
    ['고속', 'high-speed'], ['대형', 'large'], ['소형', 'compact'], ['전동', 'electric'], ['유압', 'hydraulic'], ['수동', 'manual'], ['산업용', 'industrial'], ['표준', 'standard'],
    ['바이스', 'vise'], ['지그', 'jig'], ['씰', 'seal'], ['오일씰', 'oil seal'], ['빌렛', 'billet'], ['백업링', 'backup ring'], ['가이드링', 'guide ring'], ['중공관', 'hollow tube'],
    ['파이프', 'pipe'], ['배관', 'piping'], ['강관', 'steel pipe'], ['원자재', 'raw stock'], ['스틸', 'steel'], ['강철', 'steel'], ['블랙', 'black'], ['브라운', 'brown'], ['그린', 'green'],
    ['내추럴', 'natural'], ['등급', 'grade'], ['계열', 'series'], ['보조설비', 'auxiliary'], ['멀티레이저', 'multi-laser'], ['회전체 전용', 'turned parts only'],
    ['세트', 'set'], ['카트', 'cart'], ['터미널', 'terminal'], ['이동식', 'mobile'], ['현장 제어용', 'shop-floor'], ['모바일 컴퓨터', 'mobile computer'],
    ['저장조', 'storage tank'], ['후처리', 'post-processing'], ['상판', 'top'], ['메자닌', 'mezzanine'], ['연구실', 'lab'],
    ['열기', 'open'], ['닫기', 'close'], ['닫힘', 'closed'], ['열림', 'open'], ['정지', 'stop'], ['상태', 'state'], ['저장', 'save'], ['삭제', 'delete'], ['복제', 'duplicate'],
    ['선택', 'select'], ['보기', 'view'], ['설비', 'machine'], ['작업', 'job'], ['클로즈업', 'close-up'], ['카메라', 'camera'], ['외장', 'housing'], ['반투명', 'translucent'],
    ['및', 'and'], ['3축', '3-axis'], ['5축', '5-axis'], ['6축', '6-axis'], ['전체', 'All'], ['일체형', 'integrated'], ['인체공학', 'ergonomic'],
    ['회전식', 'swivel'], ['패브릭', 'fabric'], ['매니저', 'manager'], ['하이백', 'high-back'], ['실무자', 'staff'], ['철제', 'steel'], ['4단', '4-drawer'], ['서류', 'document'],
    ['파일', 'file'], ['도면', 'drawing'], ['품질 보증 문서', 'QA document'], ['문서', 'document'], ['황색', 'yellow'], ['설비 구획 보호', 'machine zone guard'],
    ['금속', 'metal'], ['밀폐', 'sealed'], ['구동', 'driven'], ['자동', 'automatic'], ['운반차', 'carrier'], ['무인', 'unmanned'], ['유도형', 'guided'], ['자기 테이프', 'magnetic-tape'],
    ['검수', 'inspection'], ['출하', 'shipping'], ['라인', 'line'], ['작업', 'job'],
  ].sort((a, b) => b[0].length - a[0].length);

  const SKIP_TAGS = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE|NOSCRIPT)$/;
  const textOrig = new Map();      // Text node → original Korean
  const textSet = new Map();       // Text node → string we last wrote (to ignore our own mutations)
  const attrOrig = new Map();      // Element → { title?, placeholder? }
  let lang = 'ko';
  let observer = null;

  function translate(s) {
    if (!s || !HANGUL.test(s)) return null;
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], core = s.trim();
    if (Object.prototype.hasOwnProperty.call(EXACT, core)) return lead + EXACT[core] + trail;
    let out = core;
    for (const [ko, en] of GLOSS) if (out.includes(ko)) out = out.split(ko).join(en);
    // Only use the glossary result when it is fully English: replacing inside Korean words gives
    // mixed nonsense ("고정밀" → "pinned밀"), so anything left half-translated stays in Korean.
    if (out === core || HANGUL.test(out)) return null;
    return lead + out.replace(/\s{2,}/g, ' ') + trail;
  }

  function skipped(el) {
    for (let e = el; e; e = e.parentElement) {
      if (SKIP_TAGS.test(e.tagName) || (e.dataset && e.dataset.i18nSkip !== undefined)) return true;
    }
    return false;
  }

  function doText(n) {
    if (textSet.has(n) && textSet.get(n) === n.data) return;      // our own write
    if (!HANGUL.test(n.data) || !n.parentElement || skipped(n.parentElement)) { textSet.delete(n); return; }
    const t = translate(n.data);
    if (t == null) return;
    textOrig.set(n, n.data); textSet.set(n, t); n.data = t;
  }

  function doAttrs(el) {
    for (const a of ['title', 'placeholder']) {
      const v = el.getAttribute && el.getAttribute(a);
      if (!v || !HANGUL.test(v)) continue;
      const t = translate(v); if (t == null) continue;
      const o = attrOrig.get(el) || {}; if (o[a] == null) o[a] = v; attrOrig.set(el, o);
      el.setAttribute(a, t);
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 || skipped(root)) return;
    doAttrs(root);
    root.querySelectorAll('[title],[placeholder]').forEach(el => { if (!skipped(el)) doAttrs(el); });
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n; while ((n = w.nextNode())) doText(n);
  }

  function restore() {
    textOrig.forEach((ko, n) => { if (n.isConnected && n.data === textSet.get(n)) n.data = ko; });
    attrOrig.forEach((o, el) => { for (const a in o) el.setAttribute(a, o[a]); });
    textOrig.clear(); textSet.clear(); attrOrig.clear();
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(list => {
      for (const m of list) {
        if (m.type === 'characterData') doText(m.target);   // doText ignores our own writes
        else if (m.type === 'attributes') { if (m.target.nodeType === 1 && !skipped(m.target)) doAttrs(m.target); }
        else m.addedNodes.forEach(walk);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });
  }
  function stopObserver() { if (observer) { observer.disconnect(); observer = null; } }

  function syncButton() {
    const b = document.getElementById('btn-lang-toggle'); if (!b) return;
    b.classList.toggle('en', lang === 'en');           // highlights the active side of the KO | EN pill
    b.title = lang === 'en' ? 'Language: English — click for Korean' : 'Language: Korean — click for English';
    b.setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false');
  }

  function set(next) {
    lang = next === 'en' ? 'en' : 'ko';
    try { localStorage.setItem(KEY, lang); } catch (e) { /* storage blocked: session only */ }
    document.documentElement.lang = lang;
    if (lang === 'en') { walk(document.body); startObserver(); }
    else { stopObserver(); restore(); }
    syncButton();
  }

  function init() {
    const b = document.getElementById('btn-lang-toggle');
    if (b) { b.dataset.i18nSkip = ''; b.addEventListener('click', () => set(lang === 'en' ? 'ko' : 'en')); }
    let saved = 'ko';
    try { saved = localStorage.getItem(KEY) || 'ko'; } catch (e) { /* ignore */ }
    syncButton();
    // panels built after load (live twin, nesting window) are picked up by the observer
    if (saved === 'en') setTimeout(() => set('en'), 300);
  }

  window.TwinI18n = { set, toggle: () => set(lang === 'en' ? 'ko' : 'en'), get lang() { return lang; }, translate };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
