# Sugar Hill Factory Digital Twin

슈가힐 신규 공장의 웹 디지털 트윈입니다. 사실적인 공장 씬 안에서 부품을 모델링하고,
네스팅·G-code를 거쳐 CNC 라우터와 금속 3D 프린터가 그 데이터대로 움직이며,
설비 신호를 실시간(WebSocket)으로 내보냅니다.

> **정직성 메모** — 공정 시간·이송·절입·탭 크기는 **가정값**입니다. 형상은 브라우저 **메쉬**(B-Rep 아님)이고
> 가공 공차는 검증되지 않았습니다. G-code는 **초안**이며 파일로만 저장됩니다 — 시뮬레이션과 사람 검토 없이 기계에 넣지 마세요.
> 실제 장비는 연결되어 있지 않습니다(향후 연결은 읽기 전용 설계).

---

## 1. 빠른 시작

```bash
npm install
npm run dev
```

브라우저에서 **http://localhost:8089** (허브) → **/v2** (전체 트윈).
Node.js 20 이상 필요. three.js r128은 CDN에서 받으므로 인터넷이 필요합니다.

```bash
npm test             # 단위·통합 테스트 (Node 내장 러너)
npm start            # 포트 8088
node tools/build_standalone.mjs   # 서버 없이 도는 단일 HTML 데모 → dist/
```

| 주소 | 내용 |
|---|---|
| `/` | 허브 — 모듈별 링크와 검증 상태 |
| `/v2` | **전체 트윈** (공장 씬 · 모델링 · 생산 패널 · 네스팅/G-code) |
| `/monitor` | 실시간 모니터 — 트윈이 보내는 데이터를 다른 화면에서 수신 |
| `/api/telemetry` | 최신 텔레메트리 JSON (외부 프로그램용) |
| `/api/parts` | 부품 라이브러리 API |
| `/demo` | 설비 동작 단일 HTML 데모 (빌드 후) |
| `/polymer`, `/studio`, `/v1` | 이전 에이전트가 만든 구버전 페이지 (보존용) |

---

## 2. 기능

### 공장 트윈 (`/v2`)
- 공장 씬: 건물·구조물 + 설비 15종 기본 배치 (Seal-Jet CNC 선반, EOS·TRUMPF 금속 3D 프린터, **3축 CNC 라우터**, 작업대, 사무 가구 등).
- 공간 편집: 에셋 배치 / 이동·회전·크기 기즈모 / 복제 / 삭제 / 되돌리기 / 레이아웃 저장(`scene_layout.json`).
- 가상 PLC: CNC·3D 프린터·화물문 인터락(도어·에어·비상정지·O₂·씰). 인터락이 끊기면 설비 정지, 실제 가공 상태에 따라 스핀들·레이저 출력.

### 모델링 (상단 "CAD 모델링" → 빠른 스케치)
- 2D 스케치(점·원), 스냅 0.1 / 1 / 10 mm, 두께 입력 → 메쉬 익스트루드.
- 구멍 검증: 외곽 밖·테두리 겹침·구멍끼리 겹침은 거부.
- 정밀도 3층 표기: 화면 표시(원 다각형 근사·현 오차) / 모델 수치 / 가공 공차(미검증).
- **📚 라이브러리에 저장**, **공장에 배치**(배치 시 라이브러리에도 자동 저장).

### 생산 패널 (화면 왼쪽 아래 "🏭 생산 · 실시간 트윈")
- 설비 카드: 상태(대기·투입·가공·배출·인터락 정지), 진행률, 남은 시간, 가동률, **실시간 축 값**.
- **보기**: 카메라를 설비 앞으로 이동. **◎ 내부 보기**: 설비 외장을 반투명하게 → 안쪽 동작 확인.
- 부품 → 설비 배정: 판재는 CNC 라우터 / 금속 3D 프린터 (선반은 회전체 전용이라 판재 배정 거부).
- 속도 1× ~ 3600×.

### 설비 동작 (실제 신호와 같은 값으로 움직임)
- **CNC 라우터**: 갠트리 X · 캐리지 Y · 스핀들 Z · 회전수. 부품 외곽+구멍을 다패스로 가공, 절삭점 표시.
- **금속 3D 프린터**: 층마다 리코터 → 레이저 스폿 해칭 → 플랫폼 하강, 적층물 성장.
- **CNC 선반**: 척 회전 (회전체 부품 전용).

### 네스팅 · G-code (생산 패널 → "📐 네스팅 · G-code")
- 부품 라이브러리에서 두께 선택 → 부품 체크 · 수량 입력 → **즉시 자동 네스팅 + G-code 재계산**.
- 원판(기본 2440×1220), 여백, 부품 간격, 90° 회전 허용, 공구 Ø, 절입, 이송, 고정 탭(개수·폭·높이).
- 네스팅: Skyline 하단-좌측 배치(외곽 bbox 기준).
- G-code: 공구 반경 보정, 구멍 먼저(안쪽 우선), 다패스, **모든 깊은 패스에서 탭 유지**, 관통 +0.3 mm, Fanuc형 포스트, 공구보다 작은 구멍은 경고 후 생략.
- **💾 .nc 저장**(파일까지만) / **라우터로 보내기** → 라우터가 **생성된 G-code 텍스트를 해석해서 그대로 재생**:
  원판 하강 → 클램프 4개 체결 · 진공 ON → 절삭(홈이 실시간으로 그려짐) → 클램프 해제 · 탭 분리 → 부품 배출.
- **📥 DXF 불러오기**: LWPOLYLINE(볼록 bulge), POLYLINE, LINE·ARC 연결, CIRCLE(구멍), 인치→mm. 한 파일에 외곽이 여러 개면 부품 여러 개. 원이 아닌 안쪽 윤곽은 경고(깎지 않음).

### 실시간 데이터
- WebSocket `ws://<host>/ws` — 트윈(발행자)이 5 Hz로 송신, 수신자는 읽기 전용.
- 스키마 `sugarhill-twin/2`: 설비 상태·작업·진행률·**축 값**(X/Y/Z/rpm, 층/플랫폼/레이저/리코터, NC 프로그램·줄 번호·이송·진공·클램프), PLC 입출력, 화물문, 최근 이벤트.
- `/monitor`에서 확인, `/api/telemetry`로 최신값 조회.

---

## 3. 사용 방법 (처음부터 끝까지)

1. `npm run dev` → http://localhost:8089/v2
2. 상단 **CAD 모델링** → 빠른 스케치에서 외곽을 그리거나 프리셋 선택 → 구멍 추가 → 두께 입력 → **익스트루드**.
3. **📚 라이브러리에 저장** (이름 입력, 비우면 자동) — 또는 **공장에 배치**.
4. 왼쪽 아래 생산 패널 → **📐 네스팅 · G-code**.
5. 두께 선택 → 부품 체크 · 수량 → 미리보기(부품·공구 경로·빨간 탭)와 G-code가 자동 계산됨. 다른 CAD 도면은 **📥 .dxf 선택**.
6. **💾 .nc 저장**으로 파일 받기, 또는 **라우터로 보내기 ▶** → 패널의 **보기**로 가공 확인 (속도 60× 이상 추천).
7. 다른 탭에서 **/monitor**를 열면 같은 데이터가 실시간으로 들어옵니다.

단일 부품을 바로 넣으려면: 생산 패널의 "모델링 부품 → 설비 배정"에서 부품과 설비를 골라 **배정**.

---

## 4. 구조

```
viewer/
  server.mjs              정적 서버 + WebSocket 중계 + /api/parts (127.0.0.1만, CORS 없음)
  index_v2.html           /v2 화면
  editor_v2.js            공장 씬·편집·모델링 (이전 에이전트의 대형 파일, 부분 수정)
  twin_live.js            설비 리그·내부 보기·생산 패널·텔레메트리 발행
  twin_nest.js            부품 라이브러리·자동 네스팅·G-code 창·라우터 시트 가공
  monitor.html, hub.html
  lib/                    순수 함수 모듈 (브라우저 전역 + Node require 겸용, 테스트 대상)
    twin_runtime.js       부품 데이터 → 작업 → 설비 상태 머신
    machine_kinematics.js 설비별 축 신호
    nesting.js            Skyline 네스팅
    nc_program.js         G-code 생성 · 해석 · 재생 시간
    dxf_import.js         DXF → 부품
    sketch_core.js        스케치 → 익스트루드, 구멍 검증
    cam_core.js           구버전 CAM 페이지용 배치·DXF
  standalone/             단일 HTML 데모 템플릿
tools/build_standalone.mjs
tests/                    node --test
docs/                     AUDIT(감사) · PLAN_sugarhill(계획) · WORKLOG(작업 기록) · PLAN_phase1
parts_library.json        부품 라이브러리 데이터 (TWIN_DATA_DIR로 위치 변경 가능)
```

`viewer/`의 `apply_* / fix_* / check_* / inspect_* …` 스크립트 약 90개는 이전 에이전트가 쓴 1회성 패치 기록입니다(실행 대상 아님, 보존용).

---

## 5. 한계 (검증 안 된 것)

- 공정 시간·이송·절입·탭·레이어 시간: **가정값**. 실측값으로 교체 필요.
- 형상은 메쉬, 가공 공차 미검증. B-Rep 파이프라인(SolidCraft STEP)은 계획 단계(`docs/PLAN_sugarhill.md` S2).
- 네스팅은 외곽 bbox 기준 — 사다리꼴 등이 맞물리지 않아 사용률이 낮을 수 있음.
- G-code: 포스트 1종(Fanuc형), 램프 진입 없음(저속 플런지), 마이터 오프셋(오목이 심한 외곽 부정확 가능), 외부 시뮬레이터(CAMotics) 교차검증 안 함.
- DXF: SPLINE · ELLIPSE · 블록(INSERT) · 비원형 구멍 미지원.
- 카탈로그 일부(WAAM, 컨베이어 등)는 회색 박스.
- 라우터 위치는 임의 배치 — 실제 레이아웃 확인 필요.
- 실제 장비 미연결.

---

## 6. 깃허브 업로드 (뮤즈용)

이 폴더는 아직 git 저장소가 아닙니다. 아래 순서로 올리면 됩니다.

```bash
cd factory-digital-twin
git init -b main
git add .
git status            # node_modules, videos/, nvidia_isaac_assets/, dist/ 가 빠졌는지 확인
git commit -m "Sugar Hill factory digital twin: modeling, nesting, G-code, machine rigs, live telemetry"
```

GitHub에서 **비공개(Private)** 저장소를 만든 뒤:

```bash
git remote add origin https://github.com/<계정>/factory-digital-twin.git
git push -u origin main
```

- `.gitignore`가 제외하는 것: `node_modules/`, `videos/`(2 GB), `nvidia_isaac_assets/`(513 MB, NVIDIA 라이선스), `*.ply`, `dist/`, 브라우저 프로필, 로그, 습식장비 실험 파일과 회사 내부 자료를 인용한 문서.
- 100 MB 넘는 파일은 없습니다(가장 큰 파일 약 2.5 MB). 저장소 크기 약 30 MB.
- 비밀 키·토큰은 코드에 없습니다(검색 확인). 1회성 스크립트에 로컬 경로(`C:/Users/…`)가 남아 있습니다.
- 공개(Public) 전환 전에: 회사 관련 내용이 없는지, NVIDIA 자산이 빠졌는지 다시 확인하세요.

clone 후 실행:

```bash
npm install && npm run dev
```

(`nvidia_isaac_assets/`가 없으면 일부 자산 텍스처만 빠지고 트윈은 동작합니다. 필요하면 `download_nvidia_isaac_assets.mjs`로 받으세요.)
