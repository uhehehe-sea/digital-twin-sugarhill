# Sugar Hill 공장 디지털 트윈 — 기획서 (2026-11-09)

프로젝트 분석 → 디지털 트윈 로드맵 → 그래픽 업그레이드(Quixel 포함) → 시스템 개선 → UI 정리 순서입니다.
근거: 저장소 코드(커밋 `bcffdfc` 기준), Drive `knowledge-index` 지식 정리본(2026-11-08), 2026년 11월 웹 조사.
웹에서 확인한 내용은 끝의 "출처"에 링크가 있고, 확인하지 못한 것은 본문에 "미확인"이라고 적었습니다.

---

## 0. 한 장 요약

| 질문 | 답 |
|---|---|
| 지금 이것은 디지털 트윈인가? | 아직 아닙니다. **가정값으로 움직이는 시뮬레이션 모델**입니다. 실제 기계 데이터가 들어오지 않습니다. |
| 진짜 트윈까지 무엇이 필요한가? | ① 시간 모델 보정 ② 생산량·납기 계산 ③ 실제 기계 데이터 연결 ④ 예측 → 의사결정. 4단계, 아래 2장. |
| Quixel(Megascans) 에셋을 가져올 수 있나? | **가능합니다.** Fab에서 받은 Megascans는 Fab 표준 라이선스로 어떤 엔진·도구에서도 쓸 수 있고, 2026-11-05부터 전체 무료로 전환 중입니다(11/12까지). FBX·glTF로 받습니다. 단, 예전에 Bridge로 받은 에셋은 옛 라이선스(언리얼 전용)일 수 있어 Fab에서 다시 받아야 합니다. |
| 언리얼 수준 그래픽이 되나? | 웹(three.js)만으로 Lumen·Nanite와 같은 수준은 안 됩니다. 다만 지금보다 훨씬 사실적으로는 만들 수 있고(3장 A안), 진짜 언리얼 화질이 필요하면 **같은 데이터를 읽는 언리얼 뷰어를 따로 두는 것**(B안)이 현실적입니다. |
| 지금 그래픽이 밋밋한 진짜 이유 | 엔진 탓보다 **데이터 탓**입니다. 건물 모델에 UV가 없어 텍스처를 입힐 수 없고, 설비는 전부 상자·원통으로 그린 것이며, 재질 텍스처 폴더가 저장소에 없습니다. |
| 가장 먼저 할 일 | 1) UI 정리(잘리는 툴바·틀린 단축키 표기) 2) three.js 최신화 + glTF 파이프라인 3) 가감속 시간 모델 + 생산량 계산기. 7장. |

---

## 1. 프로젝트 분석

### 1.1 구성

| 부분 | 파일 | 규모 | 상태 |
|---|---|---|---|
| 3D 편집기 | `viewer/editor_v2.js` | 6,672줄 (한 파일) | 기능은 많으나 한 파일에 전부 들어 있어 수정 위험이 큼 |
| 화면 | `viewer/index_v2.html` | 1,686줄, 인라인 스타일 311곳, `onclick` 116곳, 버튼 109개 | 정리 필요 (5장) |
| 생산 패널 | `viewer/twin_live.js` | 720줄 | 양호 |
| 네스팅·G-code | `viewer/twin_nest.js` | 835줄 | 양호 |
| 순수 로직 | `viewer/lib/*.js` (런타임, 운동학, 네스팅, NC, 절삭, DXF, 스케치) | 2,000줄 남짓 | **가장 건강한 부분.** 테스트 71개가 여기를 지킴 |
| 서버 | `viewer/server.mjs` | 396줄 | 보안 점검 반영 완료 |
| 테스트 | `tests/` 12개 파일 | 71개 통과 | 브라우저 화면 테스트는 없음 |

### 1.2 잘 되어 있는 것
- **G-code를 실제로 해석해서 재생**합니다. 화면의 공구는 생성된 NC 프로그램 그대로 움직이고, 원판은 공구 위치만큼 깎입니다.
- 로직이 화면과 분리된 순수 함수(`viewer/lib`)라 테스트가 가능하고, 다른 화면(언리얼 등)에서도 같은 계산을 쓸 수 있습니다.
- 설비 신호 형식(축 위치, 스핀들, 진공, 클램프, NC 줄 번호)이 이미 정해져 WebSocket으로 나갑니다. 실제 기계 값을 같은 형식으로 받으면 됩니다.
- 정직성 표기: 가정값에는 "가정값" 배지가 붙어 있습니다.

### 1.3 문제점 (확인한 사실)

**그래픽**
- three.js **r128**(2021년 판)을 씁니다. 현재 최신은 r186(2026-09)입니다.
- three.js를 **CDN에서 받아 옵니다**(`cdnjs`, `jsdelivr`). 인터넷이 끊기면 공장 화면이 뜨지 않습니다.
- 조명 환경이 실제 HDRI가 아니라 코드로 그린 어두운 돔입니다(`buildIndustrialHDRIEnvironment`).
- 후처리 스크립트(블룸 등)를 불러오지만 실제로는 쓰지 않습니다. AO·SSR·GI 없음.
- 건물 OBJ(`factory_precision.obj`): 부재 226개, 면 21,568개, **UV 좌표 0개.** 텍스처를 입힐 수 없는 모델입니다.
- 설비는 상자·원통을 조합해 코드로 그립니다(210곳). 실제 기계 형상이 아닙니다.
- 재질 텍스처 경로(`/assets/nvidia_material_library/...`)가 가리키는 `nvidia_isaac_assets` 폴더가 **저장소에 없습니다.** 지금은 대체 텍스처로 그려집니다.
- 화면 문구가 실제보다 큽니다: "UE5 실사 PBR (AgX IBL + SSR)"라고 쓰여 있지만 톤매핑은 ACES이고 SSR은 없습니다.

**시스템**
- 가공 시간 = 구간 길이 ÷ 이송속도. 가감속이 없어 실제보다 짧게 나옵니다. 급속 15,000 mm/min, 로딩 40초, 언로딩 45초는 고정 가정값.
- 실제 기계에서 들어오는 데이터 경로가 없습니다(내보내기만 함).
- 작업·사이클 기록이 저장되지 않습니다. 새로고침하면 사라집니다.
- 레이아웃 저장은 마지막에 저장한 사람이 덮어씁니다. 버전·충돌 처리 없음.
- 네스팅은 외곽 사각형 기준이라 수율이 낮습니다. 공구 교환 미지원.

**UI**
- 상단 툴바 폭이 약 2,050 px입니다. 1,600 px 화면에서 저장·CAD·Zen·패널 버튼이 잘립니다.
- 같은 기능이 여러 곳에 있습니다: 게이트 열기(툴바·속성 탭·화물 도어 탭), CAD 창 열기(툴바·탭).
- 표기와 동작이 다릅니다: "복제 (Ctrl+D)" → 실제 Shift+D, "선택 (Q)" → Q는 카메라 하강.
- 한/EN 전환은 화면 문구를 사후에 바꿔 끼우는 방식이라, 문구가 바뀌면 사전도 손으로 고쳐야 합니다.

### 1.4 Drive 지식 정리본에서 가져온 것

| 지식 | 이 기획에 쓰는 곳 |
|---|---|
| Sugar Hill 3DGS 파이프라인 (휴대폰 영상 → 2fps 프레임 → COLMAP → 3DGS, 무료 Colab T4) | 3장: 실제 공장 스캔을 트윈 배경으로. three.js r186이 스플랫을 기본 지원 |
| 3DGS 촬영 요령 (겹침 70~80%, 높이 3단, 노출 고정, 방 하나 200~500장) | 3장 A-4 |
| "정적 공간은 3DGS, 움직이는 공정은 4DGS — 공장 트윈은 정적 3DGS부터" | 3장: 4DGS는 로드맵에서 제외 |
| 메쉬는 정밀 기준이 될 수 없다, B-Rep 커널이 기준(SSoT) | 4장: 치수 기준은 SolidCraft/STEP, 화면 메쉬는 표시용 |
| SolidCraft MCP (STEP 내보내기) | 4장: 부품 형상의 기준 데이터 |
| 회고록의 PLC 로드맵 (OPC-UA, MQTT/WebSocket) | 2장 3단계 |
| Drive의 Twinmotion 파일(.tm), Unreal 프로젝트, unreal-engine-mcp 스킬 | 3장 B안: 언리얼 뷰어의 출발점 |
| CNC 네스팅 파이프라인(0501네스팅.zip), cnc-cad-drawing 스킬(Skyline 80~88%) | 4장: 네스팅 수율 개선 참고 |

---

## 2. 디지털 트윈 로드맵

### 2.1 기준으로 삼을 표준과 자료

- **ISO 23247 (제조 디지털 트윈 프레임워크).** 1~4부(2021)에 이어 **5부 "디지털 스레드"가 2026-06에 발행**됐고, 6부 "디지털 트윈 구성"이 발행 절차 중입니다. 사례 기술보고서 ISO/TR 23247-101:2026(로봇 용접)도 나왔습니다.
- **NIST AMS 400-2** "ISO 23247 기반 디지털 트윈 구현 사례 시나리오", **NIST 디지털 트윈 연구실**(AMS 100-68, 중소 제조업체용 테스트베드). 무료이고 우리 규모에 가장 가까운 안내서입니다.
- **Digital Twin Consortium 역량 주기율표(CPT).** 기술과 무관하게 "우리 트윈에 어떤 역량이 필요한가"를 정리하는 무료 도구입니다.
- 기계 연결: 최신 컨트롤러는 **MTConnect**가 가장 손이 덜 가고, 구형 기계는 엣지 장치가 PLC/CNC 값을 MQTT로 바꿔 보내는 방식이 일반적입니다. 컨트롤러 접속이 안 되면 **저가 전류 센서**로 가동 여부·OEE를 재는 연구 사례가 있습니다(NSF, ORNL).

ISO 23247의 네 덩어리에 우리 것을 대응시키면 이렇습니다.

| ISO 23247 | 뜻 | 우리 프로젝트 | 상태 |
|---|---|---|---|
| 관측 대상 제조 요소 | 실제 기계·자재·작업자 | 라우터, 선반, 원판, 부품 | 실물은 있으나 식별 체계 없음 |
| 데이터 수집·장치 제어 | 실물에서 데이터를 읽는 층 | **없음** | 3단계에서 만듦 |
| 디지털 트윈 본체 | 모델, 동기화, 분석, 시뮬레이션 | `twin_runtime`, `nc_program`, `sheet_carve`, 3D 화면 | 모델·시뮬레이션만 있음 |
| 사용자 | 사람과 다른 시스템 | /v2 화면, /monitor, WebSocket | 있음 |

### 2.2 단계별 계획

**1단계 — 시간이 맞는 모델 (보정)** · 목표: 예측과 실제 사이클 시간 오차 ±10% → ±5%
1. 가감속 모델: 구간별 사다리꼴 속도, 모서리 각도에 따른 감속, 급속·플런지 분리 (`nc_program.js`의 `timing()` 교체, 테스트 추가).
2. 보정 화면: 기계별 최대 가속도·급속 속도·로딩/언로딩 시간을 입력하고, 실측 시간을 넣으면 계수를 맞춰 줍니다.
3. 재질별 실제 절삭 조건표(PP, PP-GF30, FKM).
4. 화면의 "가정값" 배지를 "실측 보정 (날짜)"로 바꿉니다.
- 필요한 것: 기준 G-code 3~4개의 실제 가공 시간(초시계면 충분), 라우터 기종·컨트롤러.

**2단계 — 생산량·납기 계산기**
- 입력: 부품·수량, 원판, 교대·휴식, 설비 대수.
- 계산: 네스팅 → 장수, 장당 사이클(로딩+가공+언로딩), OEE(가용성×성능×품질) 적용.
- 출력 예: "1,000개 → 42장 → 순가공 28.4 h → 가동률 75% 적용 37.9 h → 2교대 2.4일".
- What-if: 라우터 +1대, 이송 +20%, 원판 크기 변경을 나란히 비교.
- 600× 시뮬레이션 결과와 계산기 결과가 일치하는지 자동 테스트로 묶습니다.

**3단계 — 실제 기계 연결 (디지털 섀도)**
1. 자산 등록부: 설비마다 고정 ID, 기종, 컨트롤러, 접속 방식. 화면의 설비와 1:1.
2. 수집 어댑터(서버 쪽, 읽기 전용): MTConnect → OPC UA → MQTT 순으로 가능한 것을 붙입니다. 접속이 안 되는 기계는 스핀들 전류 센서 + 도어/진공 스위치.
3. 사이클 기록 저장소(SQLite 또는 JSONL): 시작·끝·부품·프로그램·실제 시간. 1단계 보정이 이 기록으로 자동 갱신됩니다.
4. 화면: 계획 대 실제를 나란히, 지연 자동 표시. 실제 값이 들어오면 3D 기계가 그 값으로 움직입니다.
- 원칙: 트윈은 기계에 **쓰지 않습니다.** 읽기만 합니다.

**4단계 — 예측과 의사결정 (디지털 트윈)**
- 진행 상황으로 납기 재계산, 지연 예상 시 알림.
- 여러 설비 작업 배분, 병목 표시.
- 스핀들 가동 시간·공구 절삭 거리 누적 → 교체 시점 예측.
- 레이아웃·설비 변경을 트윈에서 먼저 검증.
- ISO 23247-5의 디지털 스레드: 주문 → 스케치/DXF → 네스팅 → G-code → 가공 기록을 하나의 이력으로 묶습니다.

### 2.3 학습 순서 (추천)

1. NIST AMS 400-2 사례 시나리오 — ISO 23247을 실제로 어떻게 적용하는지.
2. NIST 디지털 트윈 연구실 보고서(AMS 100-68) — 중소 제조업체 사례.
3. Digital Twin Consortium 역량 주기율표 사용 안내 + 워크시트 — 우리 요구사항 점검표로 사용.
4. 미시간대 "Digital Twins" 온라인 강좌(Coursera, 청강 가능) — 개념 전반.
5. MTConnect 개요, 저가 전류 센서 OEE 논문 — 3단계 준비.
6. three.js WebGPURenderer 안내서, glTF Transform — 3장 준비.

---

## 3. 그래픽 업그레이드

### 3.1 Quixel Megascans를 가져올 수 있는가

**가능합니다.** 조사 결과:

- **라이선스.** Fab에서 받은 에셋은 Fab 표준 라이선스이고, Epic은 이 라이선스로 Megascans를 포함한 에셋을 "어떤 게임 엔진이나 도구에서도" 쓸 수 있다고 밝혔습니다. three.js 웹 뷰어도 해당합니다.
- **가격.** Epic이 2026-11-05에 Megascans 전체(2만 3천여 개)를 다시 무료로 풀었고, Fab 목록은 11-12까지 순차 전환됩니다. 2025-01-01 이후 구매분은 계정 잔액으로 환불됩니다.
- **Bridge.** Quixel Bridge는 단계적으로 종료 중입니다. 2026년 초부터 새 에셋이 Bridge에 올라오지 않고, 에셋마다 "Fab에서 받기"로 넘어갑니다. **Fab 웹 또는 Epic 런처의 Fab**에서 받으세요.
- **형식.** Fab 목록에는 FBX와 glTF가 들어 있고, 일부는 GLB·USDZ 변환본도 있습니다. Epic 문서는 언리얼 밖에서는 FBX를 권합니다. 우리는 glTF/GLB를 받거나 FBX를 Blender에서 glTF로 바꾸면 됩니다.
- **주의.** 예전에 Bridge/Quixel.com에서 받은 에셋은 받을 당시 라이선스(언리얼 전용일 수 있음)가 적용됩니다. 웹 뷰어에 쓸 것은 **Fab에서 새로 받으세요.** 최종 판단은 각 목록에 표시된 라이선스 문구를 확인해야 합니다(라이선스 원문은 이번 조사에서 직접 읽지 못했습니다).

**Megascans가 채워 주는 것과 못 채우는 것**

| 종류 | 공장 트윈에서의 쓰임 | 기대 효과 |
|---|---|---|
| 표면(타일 텍스처) | 콘크리트·에폭시 바닥, 골강판 벽, 도장 철골, 합판 | **큼** — 바닥과 벽이 화면의 대부분 |
| 결함·데칼 | 바닥 얼룩, 타이어 자국, 안전선 마모 | 큼 — "CG 같은 깨끗함"을 없앰 |
| 3D 소품 | 팔레트, 드럼, 상자, 콘, 배관 | 중간 |
| 기계(CNC, 3D 프린터) | **없음** | Megascans는 스캔 자연물·소품 위주. 기계는 제조사 CAD(STEP → glTF)나 Fab의 다른 판매자 모델이 필요 |

그리고 **건물 모델에 UV가 없어서** 지금은 표면 텍스처를 받아도 입힐 수 없습니다. A-2가 선행 조건입니다.

### 3.2 A안 — 웹 뷰어를 최대한 끌어올리기 (추천, 먼저)

| 단계 | 내용 | 효과 |
|---|---|---|
| A-1 | three.js r128 → 최신(r186 계열), CDN 대신 저장소에 포함, ES 모듈 + 빌드(Vite). WebGPU 렌더러를 쓰되 WebGL로 자동 대체 | 인터넷 없이 동작, 이후 모든 단계의 전제 |
| A-2 | **건물 다시 만들기**: Blender에서 OBJ에 UV 생성(스마트 UV/박스 투영) → 재질 지정 → **조명·AO 굽기(베이크)** → glTF(KTX2 텍스처, meshopt 압축). 부재 이름은 유지해 "건물 부재 편집"이 그대로 동작 | 가장 큰 화질 향상. 고정된 건물은 구운 조명이 실시간 GI보다 좋고 가볍습니다 |
| A-3 | Megascans 표면·데칼 적용, 실제 HDRI 환경(창고/공장), 톤매핑 정리 | 재질 사실감 |
| A-4 | **실제 공장 3DGS 배경**: 지식 정리본의 촬영 요령으로 다시 촬영 → 스플랫을 CAD 좌표에 정렬 → 뷰 모드로 전환. r186은 스플랫 로더·레이캐스팅을 기본 제공 | "진짜 우리 공장" 느낌. 치수 기준은 여전히 CAD |
| A-5 | 후처리: AO, 반사, 블룸, 안티에일리어싱. 그림자 품질(계단식 그림자) | 마감 |
| A-6 | 설비 모델 교체: 라우터부터 제조사 CAD 또는 구매 모델을 glTF로. 축 이름(X/Y/Z/스핀들) 규칙만 맞추면 지금의 운동학 코드가 그대로 구동 | 기계 사실감 |

한계를 분명히 하면: A안의 도달점은 "건축 시각화 수준의 웹 화면"입니다. 언리얼의 Lumen(실시간 GI)·Nanite(초고밀도 메쉬)와 같지는 않습니다. WebGPU 렌더러의 성숙도는 자료마다 평가가 달라서(공식 안내서는 "매 판 개선 중"이라고만 함) A-1에서 WebGL 대체 경로를 반드시 유지합니다. r186 스플랫은 대규모 스트리밍(LoD)이 없어 공장 한 동 규모까지가 적당합니다.

### 3.3 B안 — 언리얼 뷰어를 따로 두기 (선택, A안 뒤)

- 언리얼 5 프로젝트에 같은 glTF/FBX 에셋과 Megascans(언리얼에서는 기본 통합)를 넣고, **같은 `scene_layout.json`과 같은 WebSocket 신호**를 읽어 설비를 움직입니다.
- 브라우저에서 보려면 Pixel Streaming을 씁니다. 언리얼이 GPU PC에서 그리고 영상으로 보내는 방식이라 **GPU PC가 계속 켜져 있어야 하고 동시 접속자 수만큼 비용이 듭니다.** 일반적인 분담은 "평소 업무는 웹 화면, 고화질이 필요할 때만 언리얼"입니다.
- 출발점이 이미 있습니다: Drive의 Twinmotion 파일과 Unreal 프로젝트, 이 PC의 `unreal-engine-mcp` 스킬(에디터 자동 제어).
- 용도: 발표·영상·고객 시연. 계산과 운영은 웹 트윈이 계속 담당합니다.

### 3.4 C안 — NVIDIA Omniverse / OpenUSD (지금은 보류)

Omniverse의 공장 트윈 사례는 대형 공장·로봇 군집 위주이고 RTX 장비와 운영 부담이 큽니다. 지금 채택하지 않되, 에셋을 glTF/USD로 관리해 두면 나중에 옮길 수 있습니다. 코드 주석과 화면에 있는 "Omniverse RTX Grade", "NVIDIA Isaac SimReady" 표현은 실제와 다르므로 5장에서 정리합니다.

### 3.5 추천

**A-1 → A-2 → A-3**을 먼저 합니다(엔진을 바꾸지 않고 가장 큰 차이). 3DGS 재촬영(A-4)은 현장 일정에 맞춰 병행. 시연용 고화질이 꼭 필요해지면 B안을 얹습니다. 어느 쪽이든 에셋은 **glTF 하나로 관리**해 두 뷰어가 같이 씁니다.

---

## 4. 시스템 기능 개선

우선순위 순입니다.

| # | 개선 | 이유 | 규모 |
|---|---|---|---|
| S1 | three.js 등 외부 스크립트를 저장소에 포함 (CDN 제거) | 인터넷이 끊기면 화면이 안 뜸 | 작음 |
| S2 | 가감속 시간 모델 + 보정 입력 | 2장 1단계 | 중간 |
| S3 | 생산량·납기 계산기 | 2장 2단계 | 중간 |
| S4 | 사이클·작업 기록 저장 (서버, SQLite/JSONL) + 다시 보기 | 새로고침하면 기록이 사라짐. 보정과 OEE의 재료 | 중간 |
| S5 | 자산 등록부 + 수집 어댑터 틀 (모의 기계로 먼저 검증) | 2장 3단계 | 큼 |
| S6 | `editor_v2.js` 분할 (카메라, 선택, 건물, 게이트, PLC, 스케치 창을 모듈로) | 6,672줄 한 파일. 수정할 때마다 다른 기능이 깨질 위험 | 큼 (A-1과 함께) |
| S7 | 레이아웃 버전 관리: 저장할 때마다 이력, 되돌리기, 동시 저장 충돌 알림 | 지금은 마지막 저장이 덮어씀 | 중간 |
| S8 | 브라우저 자동 테스트 (화면 뜸 → 부품 배치 → 라우터 작업 → 완료) | 화면 쪽은 테스트가 없음. 이번 "절삭 위치 반 장 밀림"도 화면에서만 보이던 버그 | 중간 |
| S9 | 네스팅 수율: 사각형 기준 → 실제 형상 맞물림 | 수율이 계산기 결과를 좌우 | 큼 |
| S10 | 공구 교환(`docs/TOOL_CHANGE.md` 설계안), G43 길이 보정 | 공구 정보 대기 중 | 중간 |
| S11 | 부품 형상 기준을 STEP(SolidCraft)으로, 화면 메쉬는 표시용 | 지식 정리본의 결론(B-Rep이 기준) | 큼 |
| S12 | 언어 전환을 키 기반으로 (문구에 ID 부여) | 지금은 사전을 손으로 맞춰야 함 | 중간 |

---

## 5. UI 정리

### 5.1 원칙
1. **한 기능은 한 곳에.** 중복 버튼을 없앱니다.
2. **작업 순서대로 배치.** 배치 → 만들기 → 생산 → 모니터.
3. **표기는 실제 동작과 같게.** 단축키, 렌더링 이름, 에셋 이름.
4. 1,366 px 폭에서도 잘리지 않게.

### 5.2 구체안

**상단 툴바** (지금 약 2,050 px → 목표 1,300 px 이하)
- 왼쪽: 로고 · `KO|EN` · 변형 도구(선택/이동/회전/크기) · 스냅
- 가운데: 보기 메뉴 하나로 묶기 — 셰이딩, 시점 바로가기, 외벽 투명도
- 오른쪽: 되돌리기 · **저장** · `⋯` 메뉴(Cycles 렌더, Zen, 패널 토글)
- 카메라 속도는 하단 상태바에 이미 있으므로 툴바에서 뺍니다. 게이트 버튼은 화물 도어 탭으로.

**오른쪽 사이드바** (탭 5개 → 4개, 작업 순서)

| 새 탭 | 들어가는 것 |
|---|---|
| 배치 | 선택 오브젝트 속성, 배치 목록, 레이아웃 저장·내보내기·초기화, 건물 부재 |
| 만들기 | 빠른 스케치 열기, 부품 라이브러리, 네스팅·G-code |
| 생산 | 실시간 트윈 패널, (2단계) 생산량 계산기 |
| 설비·신호 | 화물 도어, 가상 PLC, 실시간 데이터 연결 상태 |

- 재질 스튜디오는 "배치" 탭의 선택 오브젝트 아래에, 선택이 있을 때만.
- "CAD 모델링" 탭의 기본 형상 생성기·근사 챔퍼/필렛은 빠른 스케치 창과 겹칩니다. 스케치 창으로 합치고 탭에서는 뺍니다.

**표기 바로잡기 (작고 확실한 것, 바로 가능)**
- "복제 (Ctrl+D)" → "복제 (Shift+D)"
- "선택 (Q)" → 단축키 표기 삭제(Q는 카메라 하강) 또는 선택 도구에 다른 키 배정
- "UE5 실사 PBR (AgX IBL + SSR)" → "사실적 (PBR)" — A안이 끝난 뒤 실제 기능에 맞춰 다시 명명
- "NVIDIA Isaac SimReady™ 디지털 트윈 에셋 뱅크" → "설비·비품 라이브러리"
- "언리얼 블루프린트 스타일 …" 수식어 삭제
- 이모지는 탭·주요 버튼에만 남기고 줄입니다.

**구조**
- 인라인 스타일 311곳 → 디자인 토큰(색·간격·글자 크기)과 클래스.
- `onclick` 116곳 → 모듈에서 이벤트 연결(S6과 함께).
- 빈 상태 안내: 부품이 없을 때 "① 스케치 → ② 공장에 배치 → ③ 배정" 3단계 안내.
- 로그 창과 알림(토스트) 위치 통일.

---

## 6. 일정안

기간은 한 사람이 이 저장소에서 작업하는 기준의 어림값이고, ★는 사장님 쪽 입력이 필요한 항목입니다.

| 묶음 | 내용 | 어림 |
|---|---|---|
| ① 빠른 정리 | UI 표기 바로잡기, 툴바 축소, 탭 재배치, CDN 제거(S1) | 2~3일 |
| ② 시간·수량 | 가감속 모델(S2), 생산량 계산기(S3), 기록 저장(S4) | 1주 · ★실측 시간이 오면 보정 |
| ③ 엔진 기반 | three.js 최신화 + 모듈 분할(A-1, S6), 브라우저 테스트(S8) | 1~2주 |
| ④ 화질 | 건물 UV·베이크·glTF(A-2), Megascans·HDRI(A-3), 후처리(A-5) | 1~2주 · ★Fab 계정으로 에셋 받기 |
| ⑤ 실물 연결 | 자산 등록부, 모의 기계 어댑터, 계획 대 실제 화면(S5) | 2주 · ★컨트롤러 정보 |
| ⑥ 선택 | 3DGS 재촬영·정렬(A-4), 설비 모델 교체(A-6), 언리얼 뷰어(B안) | 각 1~2주 · ★현장 촬영, 기계 CAD |

①과 ②는 서로 독립이라 동시에 진행할 수 있습니다. ③은 큰 수술이라 ①·② 뒤에, ④는 ③ 뒤에 합니다.

## 7. 지금 필요한 결정과 입력

1. **시작 순서**: ①(UI 정리)과 ②(시간·수량)부터 시작해도 되는지.
2. **그래픽 방향**: A안(웹 강화) 먼저, B안(언리얼 뷰어)은 나중 — 이 순서로 가도 되는지.
3. ★ 라우터 기종과 컨트롤러, 재질별 실제 이송·절입, 원판 로딩/언로딩 실제 시간.
4. ★ Fab(Epic) 계정으로 Megascans를 받아 둘지 — 무료 전환이 11/12에 끝나므로 그 뒤 받는 것이 깔끔합니다.
5. ★ 공장 3DGS를 다시 촬영할 수 있는지(지식 정리본 촬영 요령 기준).

---

## 출처

**Megascans / Fab**
- [Epic has made Megascans free again – for good, this time (CG Channel, 2026-11)](https://www.cgchannel.com/2026/11/epic-has-made-megascans-free-again-for-good-this-time/)
- [Megascans library is now free (Creative Bloq)](https://www.creativebloq.com/news/the-worlds-biggest-library-of-scanned-assets-for-3d-artists-is-now-free-and-it-seems-that-this-time-its-for-good)
- [Quixel to Fab Transition FAQs (Epic 포럼)](https://forums.unrealengine.com/t/quixel-to-fab-transition-faqs/2033839)
- [Megascans License? (Epic 포럼)](https://forums.unrealengine.com/t/megascans-license/2081542)
- [Exporting assets from Fab in Launcher (Epic 문서)](https://dev.epicgames.com/documentation/en-us/fab/exporting-assets-from-fab-in-launcher)
- [Quixel to Fab migration guide 2026 (StraySpark)](https://www.strayspark.studio/blog/quixel-to-fab-migration-indie-developer-survival-guide-2026)

**three.js / 웹 그래픽**
- [three.js WebGPURenderer 안내서](https://threejs.org/manual/en/webgpurenderer.html)
- [three.js Ships Its Native Gaussian Splat Renderer in r186 (radiancefields.com)](https://radiancefields.com/three.js-ships-its-native-gaussian-splat-renderer-and-splat-raycasting-in-r186)
- [three.js r183 render pipeline (cinevva)](https://app.cinevva.com/news/2026-03-18-threejs-r183-render-pipeline)
- [Migrating Three.js from WebGL to WebGPU (buildmvpfast)](https://www.buildmvpfast.com/blog/threejs-webgl-to-webgpu-renderer-migration-2026)
- [glTF Transform CLI](https://www.npmjs.com/package/@gltf-transform/cli)
- [Pixel Streaming vs WebGL vs WebGPU (Vagon)](https://vagon.io/blog/pixel-streaming-vs-webgl-vs-webgpu-the-best-solution-for-unreal-engine-web-deployment)

**디지털 트윈 표준·학습**
- [ISO 23247-5:2026 Digital thread for digital twin](https://www.iso.org/standard/87425.html)
- [ISO/TR 23247-101:2026 미리보기](https://webstore.ansi.org/preview-pages/ISO/preview_ISO+TR+23247-101-2026.pdf)
- [NIST Digital Twins for Advanced Manufacturing](https://nist.gov/programs-projects/digital-twins-advanced-manufacturing)
- [NIST: Towards Digital Twin Robot Workcell Standards and Methods](https://www.nist.gov/publications/towards-digital-twin-robot-workcell-standards-and-methods)
- [Digital Twin Capabilities Periodic Table User Guide (DTC)](https://www.digitaltwinconsortium.org/wp-content/uploads/sites/3/2022/06/Digital-Twin-Capabilities-Periodic-Table-User-Guide.pdf)
- [University of Michigan — Digital Twins 강좌](https://online.umich.edu/courses/digital-twins)
- [Chalmers: ISO 23247 실험실 구현 사례 (2026)](https://research.chalmers.se/en/publication/552658)

**기계 연결·OEE**
- [Part fingerprinting-based productivity monitoring of CNC machines with low-cost current sensors (NSF)](https://par.nsf.gov/biblio/10632342)
- [ORNL 저가 센서 장착 연구](https://info.ornl.gov/sites/publications/Files/Pub166042.pdf)
- [A Low-Cost Approach to Machine Monitoring (MoldMaking Technology)](https://moldmakingtechnology.com/articles/a-low-cost-approach-to-machine-monitoring)
- [Real-time OEE dashboards for small CNC shops (JITbase)](https://www.jitbase.com/blog/implement-real-time-oee-dashboards-small-cnc-shops)

**NVIDIA Omniverse**
- [NVIDIA: Omniverse collaboration factory digital twin](https://perspectives.nvidia.com/physical-ai/omniverse/task/blog/nvidia-omniverse-collaboration-factory-digital-twin/)
- [Simulating robots in industrial facility digital twins (NVIDIA)](https://developer.nvidia.com/blog/simulating-robots-in-industrial-facility-digital-twins/)

**내부 자료**
- Drive `knowledge-index/기술지식_통합정리본_20261108.md`, `디자인_모델링_지식_모음_20261108.md`
- Drive `digital_twin_master_architecture_retrospective.md`, `blender_digital_twin_precision_harness_analysis.md`
- 저장소 `docs/WORKLOG.md`, `docs/TOOL_CHANGE.md`, `README.md`
