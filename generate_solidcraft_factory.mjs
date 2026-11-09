import fs from 'fs';

/**
 * SolidCraft v0.30.1 — 슈가힐(Sugar Hill) 공장 실제 촬영 영상(4K 원본 2종) 1:1 정밀 디지털 트윈 생성기
 *
 * 반영된 실제 현장 구조:
 * 1. 다크 브라운(적갈색 프라이머) H빔 주골조 + 실내 중앙 슬렌더 기둥 열 (IntCol_1..3) + 2단 벽체 수평 거트(Girt)
 * 2. 하단 2.4m 백색 골강판 라이너 패널(LinerPanel) + 상부 백색 단열재 벽면 + 우측 상부 루버 환기창(WallVent)
 * 3. 삼각형 박공 경사 천장(7,200mm -> 8,400mm) + 다크 브라운 래프터 & 11열 Z-퍼린 + 천장 매달림형 은색 가스 히터 3기 + LED 하이베이 조명
 * 4. 남측(Y=0..6,200mm) 메자닌 복합 구조체:
 *    - 2층 전면/측면 백색 석고보드 마감 박스 및 2층 출입문(Mezz_Upper_Door)
 *    - 우측 전면 L자형(중간 참 포함) 백색 외벽 + 매트 블랙 상단 두겁/디딤판/난간 계단 및 하부 4개 블랙 각관 지지대
 *    - 계단 우측 1층 장애인 화장실(내부 양변기/세면대 + 상부 2x4 목재 안전 난간) 및 계단 좌측 벽걸이 음수대 2대 & 구급함
 *    - 1층 메자닌 하부: 블랙 오픈 웹 스틸 조이스트 천장, 전면 체인링크 철망 케이지(게이트, 작업대, 블랙 캐비닛),
 *      서측 채광창 앞 오렌지/그레이 하이백 어쿠스틱 소파 부스 2조, 안쪽 마감 사무실 및 정문 유리 출입구/노란 게시판
 * 5. 북측(Y=16,000mm) 화물 출입구 벽면 (메자닌 정면 맞은편):
 *    - 좌측: 철제 앵글 선반 랙, 블랙 플라스틱 파렛트 박스, 대형 목재 수출 크레이트 2기, 수배전반/변압기, 주황/블랙 지게차(Forklift)
 *    - 중앙: 4열 수직 분할 회색 오버헤드 섹셔널 도어 + 상부 토션 스프링 축 & 트랙 + 좌측 블랙 체인 호이스트 모터
 *    - 중앙 우측(두 도어 사이): 백색 비상 출입문(EXIT) + 소화기 + 노란색 핸드 파렛트 잭(Pallet Jack)
 *    - 우측: 상단 원통형 드럼 후드가 달린 은색 롤업 코일 셔터 도어
 *    - 상부: 다크 브라운 프레임 대형 사각 배기팬(Shutter_Fan) 3기
 * 6. 바닥 노란 안전 구획선(SafetyLine) 및 적색 STOP 바닥 표지
 */

const outputJsonPath = (process.env.TWIN_ROOT || '.') + '/factory_precision.json';
const commands = [];

function addBox(name, corner, length, width, height) {
  commands.push({
    command: 'solid.box',
    params: {
      body_name: name,
      corner: [
        Math.round(corner[0] * 1000) / 1000,
        Math.round(corner[1] * 1000) / 1000,
        Math.round(corner[2] * 1000) / 1000
      ],
      length: Math.round(length * 1000) / 1000,
      width: Math.round(width * 1000) / 1000,
      height: Math.round(height * 1000) / 1000
    }
  });
}

function addCylinder(name, base, axis, radius, height) {
  commands.push({
    command: 'solid.cylinder',
    params: {
      body_name: name,
      base: [
        Math.round(base[0] * 1000) / 1000,
        Math.round(base[1] * 1000) / 1000,
        Math.round(base[2] * 1000) / 1000
      ],
      axis: axis,
      radius: radius,
      height: height
    }
  });
}

function addYZExtrude(bodyName, sketchName, xStart, xThickness, yzPoints) {
  commands.push({
    command: 'sketch.create',
    params: {
      plane: {
        origin: [xStart, 0, 0],
        x_dir: [0, 1, 0],
        y_dir: [0, 0, 1]
      },
      name: sketchName
    }
  });
  commands.push({
    command: 'sketch.line',
    params: {
      points: yzPoints.map(([y, z]) => [Math.round(y * 1000) / 1000, Math.round(z * 1000) / 1000]),
      closed: true
    }
  });
  commands.push({
    command: 'sketch.finish',
    params: {}
  });
  commands.push({
    command: 'solid.extrude',
    params: {
      sketch: sketchName,
      distance: xThickness,
      operation: 'new',
      body_name: bodyName
    }
  });
}

function addHBeamColumn(id, cx, cy, height = 7200) {
  const B = 240;
  const D = 260;
  const tw = 10;
  const tf = 14;
  addBox(`Col_${id}_BasePlate`, [cx - 180, cy - 180, 0], 360, 360, 20);
  addBox(`Col_${id}_Flange1`, [cx - B/2, cy - D/2, 20], B, tf, height - 20);
  addBox(`Col_${id}_Flange2`, [cx - B/2, cy + D/2 - tf, 20], B, tf, height - 20);
  addBox(`Col_${id}_Web`, [cx - tw/2, cy - D/2 + tf, 20], tw, D - 2*tf, height - 20);
}

console.log('=== Building 100% Video-Accurate Sugar Hill Factory Model ===');

// ---------------------------------------------------------------------------
// 1. 메인 바닥 슬래브 (24,000mm x 16,000mm) + 콘크리트 줄눈 + 노란 안전선 + STOP 마크
// ---------------------------------------------------------------------------
addBox('Floor_Slab', [0, 0, -200], 24000, 16000, 200);

for (let x = 6000; x < 24000; x += 6000) {
  addBox(`Joint_X_${x}`, [x - 5, 0, 0], 10, 16000, 3);
}
for (let y = 4000; y < 16000; y += 4000) {
  addBox(`Joint_Y_${y}`, [0, y - 5, 0], 24000, 10, 3);
}

// 실제 영상 속 바닥 노란 안전 구획선 (Safety Lines)
addBox('SafetyLine_Walkway_South', [0, 6800, 0], 18500, 90, 4);
addBox('SafetyLine_Walkway_Center', [4500, 10200, 0], 13500, 90, 4);
addBox('SafetyLine_Cross_West', [4500, 6800, 0], 90, 3490, 4);
addBox('SafetyLine_Cross_Mid', [11800, 6800, 0], 90, 3490, 4);
addBox('SafetyLine_Cross_East', [18000, 6800, 0], 90, 3490, 4);
addBox('SafetyLine_Cargo_Clearance', [11800, 12600, 0], 10800, 90, 4);
addBox('SafetyLine_Cargo_SideL', [11800, 12600, 0], 90, 3300, 4);
addBox('SafetyLine_Stair_Caution', [13200, 5600, 0], 2200, 90, 4);
// 바닥 빨간색 원형 STOP 표지 (영상 1 f_04 좌하단)
addCylinder('Floor_Stop_Decal_Red', [4200, 6200, 0], [0, 0, 1], 280, 5);

// ---------------------------------------------------------------------------
// 2. 다크 브라운 철골 기둥 (외벽 H빔 10기 + 실내 중앙 슬렌더 기둥 3기) & 삼각형 박공 지붕
// ---------------------------------------------------------------------------
const colX = [0, 6000, 12000, 18000, 24000];
let colIdx = 1;
for (const cx of colX) {
  addHBeamColumn(`HBeam_${colIdx++}`, cx, 0, 7200);
  addHBeamColumn(`HBeam_${colIdx++}`, cx, 16000, 7200);

  const rStart = cx === 0 ? 0 : (cx === 24000 ? 23820 : cx - 90);
  // 실제 영상과 동일한 깔끔한 박공 경사 I-빔 래프터 (처마 7,200 -> 중앙 용마루 Y=8,000, Z=8,400)
  addYZExtrude(
    `Roof_Gable_Rafter_X${cx}`,
    `Sketch_Rafter_${cx}`,
    rStart,
    180,
    [
      [0, 6940],
      [8000, 8140],
      [16000, 6940],
      [16000, 7200],
      [8000, 8400],
      [0, 7200]
    ]
  );
}

// 실내 홀 중앙 슬렌더 철골 기둥 3기 (영상 1 f_04에서 노란 라인 교차점에 서 있는 기둥들)
const intColX = [6000, 12000, 18000];
for (let i = 0; i < intColX.length; i++) {
  const icx = intColX[i];
  const icy = 10200;
  // Y=10,200 위치의 지붕 높이 계산: 7200 + 1200 * (1 - |10200-8000|/8000) = 8070
  addBox(`Col_Interior_Slender_${i+1}_Base`, [icx - 140, icy - 140, 0], 280, 280, 18);
  addBox(`Col_Interior_Slender_${i+1}`, [icx - 75, icy - 75, 18], 150, 150, 7880);
}

// 박공 지붕 중도리 (Z-Purlins: 11열 촘촘히 배치 — 영상 속 줄무늬 천장 구현)
const purlinYList = [0, 1600, 3200, 4800, 6400, 8000, 9600, 11200, 12800, 14400, 16000];
for (const py of purlinYList) {
  const distFromCenter = Math.abs(py - 8000);
  const slopeZ = 7200 + 1200 * (1 - distFromCenter / 8000);
  addBox(`Roof_Purlin_Y${py}`, [0, py - 50, slopeZ - 10], 24000, 100, 90);
}

// 외벽 2단 수평 거트 (Wall Girts: Z=3,600mm 및 Z=5,400mm — 영상 1 f_00, f_01, f_02)
addBox('Girt_North_Low', [0, 15880, 3600], 24000, 100, 90);
addBox('Girt_North_High', [0, 15880, 5400], 24000, 100, 90);
addBox('Girt_East_Low', [23880, 0, 3600], 100, 16000, 90);
addBox('Girt_East_High', [23880, 0, 5400], 100, 16000, 90);
addBox('Girt_West_Low', [20, 6200, 3600], 100, 9800, 90);
addBox('Girt_West_High', [20, 6200, 5400], 100, 9800, 90);

// 천장 매달림형 은색 가스 유닛 히터 3기 (영상 1 f_00, f_01, f_03) 및 LED 하이베이 등기구 8기
addBox('Ceiling_Gas_UnitHeater_1', [8200, 7400, 6350], 750, 650, 550);
addBox('Ceiling_Gas_UnitHeater_2', [15200, 7400, 6350], 750, 650, 550);
addBox('Ceiling_Gas_UnitHeater_3', [15200, 12800, 6100], 750, 650, 550);

for (const lx of [3500, 9000, 15000, 20500]) {
  addBox(`HighBay_LED_Row1_X${lx}`, [lx, 7600, 7600], 1200, 320, 60);
  addBox(`HighBay_LED_Row2_X${lx}`, [lx, 12200, 7100], 1200, 320, 60);
}

// ---------------------------------------------------------------------------
// 3. 남측 메자닌 복합 구조체 (X = 0..15,500mm, Y = 0..6,200mm)
// ---------------------------------------------------------------------------
// 3-1. 메자닌 2층 바닥 슬래브 및 전면 다크 브라운 철골 테두리 보
addBox('Mezzanine_Slab', [0, 0, 3050], 13200, 6000, 150);
addBox('Mezzanine_Beam_Front', [0, 5840, 2820], 13200, 160, 230);
addBox('Mezzanine_Beam_East', [13040, 0, 2820], 160, 6000, 230);
addBox('Mezzanine_Post_Center', [5800, 5800, 0], 180, 180, 2820);
addBox('Mezzanine_Post_Corner', [13020, 5800, 0], 180, 180, 2820);

// 3-2. 메자닌 2층 상부 마감 백색 벽체 (영상 1 f_03: 2층이 지붕 보까지 흰 벽으로 완전히 막혀 있고 중앙에 문이 있음!)
addBox('Mezz_Upper_Wall_Front', [0, 5850, 3200], 13200, 140, 3750);
addBox('Mezz_Upper_Wall_East', [13060, 0, 3200], 140, 5850, 3750);
addBox('Mezz_Upper_Door_Grey', [10600, 5960, 3200], 950, 60, 2100);

// 3-3. L자형(꺾임형) 백색 외벽 + 블랙 캡/블랙 디딤판 계단 (영상 1 f_03, f_06, f_13 완벽 재현)
// - 계단 하부 1단~9단 (Y = 5,800mm 라인에서 동->서 방향으로 올라와 중간 참 X=9,600..11,000 에 도달)
//   영상 f_03과 f_06을 보면: 계단 입구는 동쪽(또는 전면)에서 시작해 중간 참(Landing)에서 꺾여 2층 문으로 연결됨!
//   정확히 f_03 시점(동남쪽에서 바라본 뷰)과 일치하도록:
//   - 하부 경사부: X = 9,200..12,200mm, Y = 5,950..7,150mm (전면에서 오른쪽 위 중간 참으로 상승)
//   - 중간 참(Landing): X = 12,200..13,500mm, Y = 4,600..7,150mm, Z = 1,850mm (하부에 4개의 검은색 사각 기둥 지지)
//   - 상부 경사부: X = 12,200..13,500mm, Y = 2,600..4,600mm (참에서 2층으로 상승)
addBox('Stair_WhiteWall_FrontSlope', [9200, 7050, 0], 3000, 120, 1950);
addBox('Stair_BlackCap_FrontSlope', [9200, 7030, 1950], 3000, 160, 45);
addBox('Stair_WhiteWall_LandingFront', [12200, 7050, 0], 1300, 120, 2850);
addBox('Stair_BlackCap_LandingFront', [12200, 7030, 2850], 1300, 160, 45);
addBox('Stair_WhiteWall_LandingEast', [13380, 4500, 1800], 120, 2650, 1100);
addBox('Stair_BlackCap_LandingEast', [13360, 4500, 2900], 160, 2650, 45);

// 계단 중간 참 하부 블랙 사각 지지 기둥 4기 (영상 1 f_13)
addBox('Stair_BlackPost_1', [12250, 5950, 0], 120, 120, 1850);
addBox('Stair_BlackPost_2', [13350, 5950, 0], 120, 120, 1850);
addBox('Stair_BlackPost_3', [12250, 4600, 0], 120, 120, 2800);
addBox('Stair_BlackPost_4', [13350, 4600, 0], 120, 120, 2800);

// 매트 블랙 계단 디딤판 (하부 10단 + 중간 참 + 상부 6단) 및 블랙 핸드레일 (영상 1 f_06)
for (let s = 1; s <= 10; s++) {
  const sx = 9200 + (s - 1) * 300;
  const sz = s * 185;
  addBox(`Stair_BlackStep_Low_${s}`, [sx, 6000, sz - 185], 300, 1050, 185);
}
addBox('Stair_BlackLanding_Deck', [12200, 4600, 1750], 1250, 2450, 120);
for (let s = 1; s <= 6; s++) {
  const sy = 4600 - s * 300;
  const sz = 1870 + s * 195;
  addBox(`Stair_BlackStep_High_${s}`, [12250, sy, sz - 195], 1150, 300, 195);
}
addBox('Stair_BlackHandrail_Inner', [9300, 6000, 950], 2900, 60, 950);
addBox('Stair_BlackHandrail_Upper', [12250, 2800, 2850], 80, 1900, 950);

// 3-4. 계단 우측(동남측) 1층 장애인 화장실 박스 + 내부 변기/세면대 + 상부 2x4 목재 안전 난간 (영상 1 f_02, f_03)
addBox('Restroom_Box_Wall_Front', [13500, 2500, 0], 2400, 140, 3050);
addBox('Restroom_Box_Wall_East', [15760, 0, 0], 140, 2640, 3050);
addBox('Restroom_Box_Roof', [13200, 0, 2950], 2700, 2640, 120);
// 열린 화장실 그레이 도어 및 내부 백색 양변기/세면대 (영상 1 f_03 우하단)
addBox('Restroom_OpenDoor_Grey', [14200, 2640, 0], 80, 850, 2100);
addBox('Restroom_Toilet_White', [14800, 600, 0], 500, 680, 780);
addBox('Restroom_Sink_White', [13750, 800, 750], 480, 450, 200);
// 화장실 지붕 위 목재 안전 난간 (Wood Guardrail — 영상 1 f_02, f_03)
addBox('Wood_Guardrail_Post1', [13500, 2480, 3070], 90, 90, 1050);
addBox('Wood_Guardrail_Post2', [14600, 2480, 3070], 90, 90, 1050);
addBox('Wood_Guardrail_Post3', [15750, 2480, 3070], 90, 90, 1050);
addBox('Wood_Guardrail_TopRail', [13500, 2480, 4030], 2340, 90, 90);
addBox('Wood_Guardrail_MidRail', [13500, 2480, 3550], 2340, 90, 90);

// 3-5. 계단 좌측 벽걸이 스테인리스 음수대 2기 & 구급함 (영상 1 f_06)
addBox('WaterFountain_High', [11500, 5650, 850], 420, 380, 520);
addBox('WaterFountain_Low', [10950, 5650, 680], 420, 380, 450);
addBox('FirstAid_WallBox', [11800, 5780, 1550], 320, 100, 420);

// 3-6. 메자닌 1층 하부: 오픈 웹 스틸 조이스트 천장 + 체인링크 철망 케이지 + 작업대 & 블랙 캐비닛 (영상 1 f_07, f_09)
for (let jx = 1200; jx <= 12000; jx += 1800) {
  addBox(`Mezz_Joist_Black_X${jx}`, [jx, 200, 2860], 80, 5600, 180);
}
// 체인링크 펜스 기둥 및 상/중/하단 프레임 + 철망 패널 (X = 5,800..11,800mm, Y = 5,850mm)
for (const fx of [5800, 7300, 8800, 10300, 11800]) {
  addCylinder(`Cage_Post_X${fx}`, [fx, 5850, 0], [0, 0, 1], 35, 2820);
}
addBox('Cage_Mesh_Front_Panel', [5800, 5835, 50], 4500, 25, 2700);
addBox('Cage_Gate_Door', [10350, 5835, 50], 1400, 35, 2200);
addBox('Cage_Mesh_Side_Panel', [5800, 2800, 50], 25, 3050, 2700);

// 3-7. 메자닌 1층 하부 서측: 오렌지/그레이 하이백 어쿠스틱 소파 부스 2조 + 회의 테이블 + 채광창 (영상 1 f_12)
// 부스 1
addBox('Lounge_Booth1_GreyShell_Back', [600, 3400, 150], 2100, 140, 1350);
addBox('Lounge_Booth1_GreyShell_L', [600, 3400, 150], 120, 950, 1350);
addBox('Lounge_Booth1_GreyShell_R', [2580, 3400, 150], 120, 950, 1350);
addBox('Lounge_Booth1_OrangeSeat', [720, 3540, 150], 1860, 750, 320);
addBox('Lounge_Booth1_OrangeBack', [720, 3540, 470], 1860, 180, 520);
// 부스 2 (마주보는 배치)
addBox('Lounge_Booth2_GreyShell_Back', [600, 5350, 150], 2100, 140, 1350);
addBox('Lounge_Booth2_GreyShell_L', [600, 4540, 150], 120, 950, 1350);
addBox('Lounge_Booth2_GreyShell_R', [2580, 4540, 150], 120, 950, 1350);
addBox('Lounge_Booth2_OrangeSeat', [720, 4600, 150], 1860, 750, 320);
addBox('Lounge_Booth2_OrangeBack', [720, 5170, 470], 1860, 180, 520);
// 부스 중앙 백색 테이블
addBox('Lounge_Table_WhiteTop', [1000, 4120, 720], 1300, 650, 40);
addCylinder('Lounge_Table_Pedestal', [1650, 4445, 0], [0, 0, 1], 80, 720);

// 3-8. 메자닌 1층 하부 안쪽 마감 사무실 & 파티션 & 정문 유리 출입구/노란 게시판 (영상 1 f_10, f_11, 영상 2 f_00)
addBox('Office_Enclosed_Wall_North', [1800, 2600, 0], 4000, 140, 2850);
addBox('Office_Enclosed_Wall_East', [5660, 0, 0], 140, 2600, 2850);
addBox('Office_Door_Brown', [3400, 2730, 0], 920, 50, 2100);
addBox('Office_Cubicle_Partitions', [6200, 1400, 0], 3600, 350, 1650);
addBox('Main_Glass_Entry_Frame', [0, 200, 0], 180, 1800, 2400);
addBox('Notice_Board_Yellow_Wall', [200, 2450, 900], 1400, 60, 1100);
addBox('Entry_Floor_Mat_Dark', [250, 500, 0], 2200, 950, 8);

// ---------------------------------------------------------------------------
// 4. 북측 화물 출입구 벽면 (Y = 16,000mm — 메자닌 정면 맞은편, 순수 건축/고정 설비만 유지!)
//    (지게차, 목재 크레이트, 파렛트 박스, 선반 랙, 핸드카 등 동적 적재물은 제거 완료)
// ---------------------------------------------------------------------------
// 4-1. 중앙 좌측(X = 9,800..12,100mm): 고정 수배전반/변압기 + 합판 배면 보드
addBox('Plywood_Electrical_Backboard', [9800, 15820, 0], 2200, 40, 2400);
addBox('DryType_Transformer_Grey', [9950, 15250, 0], 850, 600, 1100);
addBox('Electrical_Switchboard_Panel1', [10950, 15600, 400], 550, 220, 1650);
addBox('Electrical_Switchboard_Panel2', [11600, 15600, 300], 480, 220, 1750);

// 4-2. 중앙(X = 12,600..16,400mm): 4열 수직 분할 회색 오버헤드 섹셔널 도어 + 토션 스프링 & 트랙 + 블랙 호이스트 모터
addBox('Door_Sectional_Logistics', [12600, 15880, 0], 3800, 90, 4200);
addBox('Door_Sectional_BottomWhite', [12600, 15850, 0], 3800, 40, 680);
for (const sx of [12600, 13550, 14500, 15450, 16340]) {
  addBox(`Door_Sectional_Stile_X${sx}`, [sx, 15840, 0], 60, 50, 4200);
}
addBox('Door_Sectional_TorsionShaft', [12400, 15720, 4450], 4200, 140, 140);
addBox('Door_Sectional_HoistMotor_Black', [12150, 15650, 4150], 280, 260, 480);
addBox('Door_Sectional_Track_L', [12550, 13200, 4200], 70, 2700, 70);
addBox('Door_Sectional_Track_R', [16380, 13200, 4200], 70, 2700, 70);

// 4-3. 두 화물 도어 사이(X = 16,400..18,400mm): 백색 비상 출입문(EXIT) + 적색 소화기
addBox('Exit_Door_North_White', [16950, 15860, 0], 950, 80, 2100);
addBox('Exit_Sign_North_Red', [17220, 15820, 2180], 400, 60, 220);
addCylinder('Fire_Extinguisher_North', [17980, 15820, 650], [0, 0, 1], 85, 480);

// 4-4. 우측(X = 18,400..22,400mm): 은색 롤업 코일 셔터 도어 + 상부 원통형 드럼 후드
addBox('Door_Rollup_Secondary', [18400, 15880, 0], 4000, 90, 4100);
addCylinder('Door_Rollup_DrumHood_Cylinder', [18300, 15680, 4220], [1, 0, 0], 260, 4200);

// 4-5. 북측 상부 벽면 대형 사각 루버 배기팬 3기
addBox('Shutter_Fan_1', [7100, 15720, 4850], 1350, 260, 1350);
addBox('Shutter_Fan_2', [16650, 15720, 4850], 1350, 260, 1350);
addBox('Shutter_Fan_3', [22550, 15720, 4850], 1250, 260, 1250);

// ---------------------------------------------------------------------------
// 5. 외벽 하단 2.4m 백색 골강판 라이너 패널(LinerPanel) + 상부 백색 단열재 외벽 + 동측 EXIT 도어 & 루버창
// ---------------------------------------------------------------------------
const wallThick = 150;
// 하단 2.4m 백색 골강판 라이너 패널 (영상 1 f_01, f_02, f_05)
addBox('LinerPanel_East_Corrugated', [23910, 2640, 0], 80, 13360, 2400);
addBox('LinerPanel_North_WestSeg', [0, 15910, 0], 12600, 80, 2400);
addBox('LinerPanel_North_MidSeg', [16400, 15910, 0], 2000, 80, 2400);
addBox('LinerPanel_North_EastSeg', [22400, 15910, 0], 1600, 80, 2400);
addBox('LinerPanel_West_NorthSeg', [10, 6000, 0], 80, 10000, 2400);

// 동측 벽면 비상 출입문(EXIT) + 소화기 + 상부 사각 루버 환기창 3기 (영상 1 f_00, f_01, f_02, f_05)
addBox('Exit_Door_East_White', [23850, 11200, 0], 80, 950, 2100);
addBox('WallVent_Louvre_East_1', [23860, 3600, 4350], 90, 1100, 1100);
addBox('WallVent_Louvre_East_2', [23860, 8600, 4350], 90, 1100, 1100);
addBox('WallVent_Louvre_East_3', [23860, 13600, 4350], 90, 1100, 1100);

// 외벽 본체 (상부 백색 단열재 벽면)
addBox('Wall_South_Full', [0, -wallThick, 0], 24000, wallThick, 7200);
addBox('Wall_North_WestSeg', [0, 16000, 0], 12600, wallThick, 7200);
addBox('Wall_North_MidSeg', [16400, 16000, 0], 2000, wallThick, 7200);
addBox('Wall_North_EastSeg', [22400, 16000, 0], 1600, wallThick, 7200);
addBox('Wall_North_TopDoor1', [12600, 16000, 4200], 3800, wallThick, 3000);
addBox('Wall_North_TopDoor2', [18400, 16000, 4100], 4000, wallThick, 3100);
addBox('Wall_East', [24000, 0, 0], wallThick, 16000, 7200);
addBox('Wall_West', [-wallThick, 0, 0], wallThick, 16000, 7200);

// 서측 메자닌 1층 라운지 채광 창문 2개소 프레임 (영상 1 f_10, f_12)
addBox('Window_Frame_West_1', [-20, 2900, 950], 80, 1500, 1200);
addBox('Window_Frame_West_2', [-20, 4650, 950], 80, 1500, 1200);

// 동/서측 삼각형 박공 상부 벽체 (Z=7,200 -> 8,400)
addYZExtrude('Wall_West_Gable_Peak', 'Sketch_West_Gable', -wallThick, wallThick, [
  [0, 7200],
  [8000, 8400],
  [16000, 7200]
]);
addYZExtrude('Wall_East_Gable_Peak', 'Sketch_East_Gable', 24000, wallThick, [
  [0, 7200],
  [8000, 8400],
  [16000, 7200]
]);

// 삼각형 박공 지붕 슬래브 (Sloped Gable Roof Cladding)
addYZExtrude('Roof_Gable_Cladding_South', 'Sketch_Roof_South', -200, 24400, [
  [-300, 7220],
  [8000, 8470],
  [8000, 8620],
  [-300, 7370]
]);
addYZExtrude('Roof_Gable_Cladding_North', 'Sketch_Roof_North', -200, 24400, [
  [8000, 8470],
  [16300, 7220],
  [16300, 7370],
  [8000, 8620]
]);

fs.writeFileSync(outputJsonPath, JSON.stringify({ commands }, null, 2), 'utf-8');
console.log(`Generated 100% Video-Accurate SolidCraft script with ${commands.length} commands.`);
