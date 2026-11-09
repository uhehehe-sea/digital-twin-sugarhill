# Phase 0 감사 보고서 (AUDIT)

- 작성: 2026-11-08 (ET), Claude Code (Opus)
- 대상: `C:\Projects\factory-digital-twin\` (원본 `C:\Users\jaeso\.gemini\antigravity\scratch\factory_digital_twin\` 및 `...\scratch\blender-cad-tools\` 의 복사본)
- 원칙: 이 단계에서 코드 수정 없음. 아래 판정은 **코드를 읽거나 실제로 실행해 확인한 것**만 "확인됨"으로 적었다. 실행 확인은 [실행]으로 표시.

---

## 0. 요약 (먼저 읽을 것)

| 영역 | 상태 |
|---|---|
| 백업 복사 | 완료. 원본은 그대로. 브라우저 프로필 폴더(`viewer/edgetmp`, `viewer/edgetmp2`)는 복사 제외 — 아래 1절 |
| git | **미완료 — 이 PC에 git이 설치돼 있지 않음.** `.gitignore`만 작성. 설치 승인 필요 |
| 서버 / 페이지 | `/v2`, `/polymer` 모두 로드됨 [실행]. `/v2`는 로드 시 콘솔 에러 1건 + 초기 캔버스 0×0 문제 |
| 회고록 "B-Rep/μm/H7 통과" | **사실 아님.** 검증 하네스는 하드코딩된 상수를 "측정값"으로 비교함 [실행] |
| CAM G-code | 동작은 하나 결함 다수 [실행]: 탭 높이 2.5mm 지정 → 실제 1.0mm, 볼트홀 Ø6.6 지정 → Ø6.0, 포스트프로세서 선택이 헤더 문자열만 바꿈, 원판을 넘는 부품 좌표 출력 |
| 웹 "챔퍼/필렛 [B-Rep]" | **가짜.** 부품 형상을 더 작은 직육면체로 교체할 뿐 |
| Mode 1 PLC | 브라우저 내 JS 가상 PLC(래더 흉내)만 있음. OPC-UA/MQTT/WebSocket 코드 없음 |
| 테스트 | 자동화 테스트 없음. `package.json`에 scripts 없음 |
| 재사용 가치 있는 것 | ① SolidCraft CLI가 만든 **진짜 B-Rep STEP**(226 솔리드) ② Mode 2 스케처 UI ③ JS 가상 PLC 구조 ④ Three.js 공장 씬 |

---

## 1. 백업 상태

- `robocopy`로 복사: 본 프로젝트 797파일 / 2.568 GB, `blender-cad-tools` 9파일 / 2.62 MB. 실패 0건.
- 복사 위치
  - `C:\Projects\factory-digital-twin\` ← `scratch\factory_digital_twin\`
  - `C:\Projects\factory-digital-twin\blender-cad-tools\` ← `scratch\blender-cad-tools\` (회고록이 말하는 `verification_harness.py`가 여기 있어서 함께 복사)
- **복사 제외**: `viewer\edgetmp\`, `viewer\edgetmp2\` — 이전 에이전트가 자동화에 쓴 Edge 브라우저 프로필. `Login Data`, `Cookies`, `History`, `Web Data` 파일이 들어 있음. 프로젝트 자산이 아니고 민감 정보가 있을 수 있어 복사하지 않았다. **원본 scratch에는 그대로 남아 있음** (삭제 여부는 사용자 판단).
- 원본 scratch 폴더는 건드리지 않았다.
- `.gitignore` 작성 완료: `node_modules/`, `videos/`(2 GB `.mov` 2개), `nvidia_isaac_assets/`(513 MB, NVIDIA 라이선스 자산), `*.ply`, 브라우저 프로필, `*.blend1`, `*.log`.
- **git init / 첫 커밋: 미수행.** `git.exe`가 PATH와 일반 설치 경로 어디에도 없음. winget은 있음. 설치는 시스템 변경이라 승인 대기.

## 2. 파일 트리 (요약)

전체 1,011파일 / 2.6 GB 중 코드는 1 MB 수준이다. 대부분은 영상·텍스처.

```
factory-digital-twin/
├─ viewer/                         ← 웹앱 본체
│  ├─ server.mjs                   Node http 서버 (포트 8088, 의존성 없음)
│  ├─ index_v2.html + editor_v2.js Mode 1 공장 씬 + Mode 2 스케처 (/v2)  — editor_v2.js 251 KB 단일 파일
│  ├─ polymer_auto_cam_nesting_studio.html   CAM·네스팅 (/polymer), 80 KB 단일 파일
│  ├─ digital_twin_closed_loop_studio.html   "CMM/ISO 286" 화면 (/studio)
│  ├─ index.html + editor.js        v1 (/) — index_v1_backup.html, editor_v1_backup.js 와 바이트 동일
│  ├─ splat.html, *.splat, *.bin    3DGS 뷰어 (초기 실험)
│  ├─ libs/, basis/                 KTX2 로더, basis transcoder
│  ├─ digital_twin_master_architecture_retrospective.md   회고록
│  └─ (~90개) apply_*/fix_*/patch_*/check_*/inspect_*/find_*/print_*/verify_*.mjs
│        → 이전 에이전트가 HTML/JS를 문자열 치환으로 고친 1회성 스크립트. 재실행 대상 아님
├─ blender-cad-tools/
│  ├─ verification_harness.py       "가상 CMM" 하네스
│  ├─ blender_twin_controller.py    Blender 헤드리스 스핀들 마운트 생성 + 하네스 호출
│  ├─ test_cad_precision.py         Blender 플랜지 생성 스크립트 (측정 없음)
│  ├─ blender_digital_twin_precision_harness_analysis.md
│  └─ addons/CAD_Sketcher-0.32.1-windows_x64.zip
├─ factory_precision.{json,sc,step,obj}   SolidCraft 스크립트 → B-Rep STEP / 메쉬 OBJ (공장 건물)
├─ industrial_cnc_and_3dprinter.{json,sc,step,obj}   SolidCraft 장비 모델
├─ test_mini.*, test_roof.json, test_script.json     SolidCraft 스크립트 실험
├─ generate_*.mjs, convert_*.mjs, extract_*.mjs ...  자산 생성/변환 1회성 스크립트
├─ setup_blender_isaac_digital_twin.py    Blender 렌더용 씬 구성
├─ materials_pp_fkm_stainless_spec.json   재질 스펙 (/api/materials)
├─ scene_layout.json, eval_report.json, factory_layout_spec.json
├─ nvidia_isaac_assets/  (513 MB, git 제외)
├─ videos/               (2 GB, git 제외)
└─ node_modules/         (sharp, ktx2-encoder, ktx-parse — 자산 변환용. 서버 실행엔 불필요)
```

## 3. 실행 방법과 의존성

```
node viewer/server.mjs     → http://localhost:8088/v2 , /polymer , /studio , /
```

- Node.js (확인: v26.13.0). 서버 자체는 외부 npm 의존성 없음.
- 브라우저 측은 CDN 의존: three.js r128 (cdnjs, jsdelivr), Tailwind (`https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js` — Antigravity 개발용 URL, 언제든 사라질 수 있음). 오프라인에서는 화면이 깨진다.
- 선택 의존: `solidcraft-cli.exe` 0.30.1 (`C:\Users\jaeso\.gemini\antigravity\bin\`, `/api/rebuild`에서 호출), Blender 5.2 포터블 (`scratch\blender-bin\`, 내장 Python 3.13.13). 시스템 Python은 없음(Store 스텁만 있음).
- **주의 — 경로 하드코딩**: `viewer/server.mjs:7` `baseDir = 'C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin'`. 복사본의 서버를 띄워도 **원본 scratch 파일을 서빙**하고, `/api/layout` POST는 원본의 `scene_layout.json`을 덮어쓴다. Phase 1 첫 작업으로 상대경로화 필요.
- 실행 시점에 원본 서버가 이미 8088에서 돌고 있었다 (PID 11116, 원본 `server.mjs`, 17:01 시작). 종료하지 않고 그대로 사용해 확인했다. 복사본 서버를 띄우면 `EADDRINUSE`로 실패한다.

## 4. 회고록 주장별 판정

회고록: `viewer/digital_twin_master_architecture_retrospective.md` (이하 "회고 L줄")

| # | 회고록 주장 | 판정 | 근거 |
|---|---|---|---|
| R1 | Blender + CAD Sketcher가 B-Rep 커널/SSoT (회고 L42, L127 "헤드리스 B-Rep 모델링") | **사실 아님** | `blender_twin_controller.py:70,82` `primitive_cube_add`/`primitive_cylinder_add` + Boolean 모디파이어 = 메쉬. CAD Sketcher는 zip만 있고 코드에서 켜지 않음 — `:30` 활성화 대상은 `measureit`, `precision_drawing_tools`뿐. 같은 폴더의 분석 문서조차 SSoT는 "외부 CAD 엔진"이라고 씀(`analysis.md:45`) |
| R2 | 64점 측정, 최대 편차 1.4 μm, ISO 286 H7 100% 통과 (회고 L52–53) | **사실 아님** | "64", "1.4 μm"는 코드·출력 어디에도 없음. 하네스 자체 기록 출력은 편차 `+0.00 um` (`analysis.md:23–26`). 측정 방식도 자기참조: 반지름 20으로 만든 실린더의 정점 반지름 평균을 다시 20과 비교 (`controller.py:151–163`) → 구조상 FAIL이 불가능. 현 오차는 정점이 아닌 면 중간에서 생기는데 그 지점은 측정하지 않음 |
| R2b | `verification_harness.py` = "ISO H7 및 2 μm 이내 공차 CMM 측정 코드" (회고 L126) | **사실 아님** [실행] | 단독 실행 시 `measured=20.008`, `measured=12.003` **리터럴 상수**를 비교하고 `PASSED (Ready for Machining)` 출력 (`verification_harness.py:79,83,70`). 실행 결과: `[PASS] Spindle Bearing Bore: Measured=20.0080mm` |
| R2c | /studio 화면의 CMM 표 | **사실 아님** | `digital_twin_closed_loop_studio.html:449–474` 편차 `+0.00 μm`와 `PASS` 배지가 정적 HTML. 파라미터와 무관하게 항상 PASS. `:1273` 생성 스크립트 마지막 줄이 무조건 `print("[OK] ... ISO 286 H7 Tolerance Passed")` |
| R3 | 현 오차 공식, 필요 세그먼트 계산 (회고 L41) | **코드로 확인됨** | `verification_harness.py:39–57` 수식 자체는 맞음. 단, 메쉬 해상도 계산이지 가공 공차 검증이 아님 |
| R4 | Blender 5.2.3 포터블 구축 (회고 L48) | 일부 확인 | `scratch\blender-bin\5.2\` 존재. 5.2.**3** 패치 버전은 미확인 |
| R5 | `/v2` Three.js 공장 씬, PBR (회고 L61–62) | **확인됨** [실행] | 288개 메쉬 로드. 스크린샷으로 공장 건물·설비 렌더 확인 (resize 이벤트 후) |
| R6 | `getIndustrialMaterial`, `selectObject` 에러 해결 (회고 L64–65) | 일부 | 해당 함수는 존재. 그러나 로드 시 **새 에러** 발생: `updateOutlinerUI` null 참조 (6절) |
| R7 | 고분자별 RPM/이송 (회고 L74–77) | 코드에 있음, **출처 없음** | `polymer_auto_cam_nesting_studio.html:555–657` 값 존재. 출처 주석 없음 |
| R8 | FPM 탄성 복원 +0.060mm 보정 음의 오프셋 툴패스 (회고 L76) | 일부 / 오해 소지 | `springback: 0.060` 값은 있음(`:609`). 보어 반경에 더하기만 함(`:1466`). 외곽 윤곽 G-code에는 미적용(`:1492–1495`)인데 표에는 외곽 보정값을 표시(`:1313`) → 표시와 출력 불일치 |
| R9 | 원판 400×300 네스팅, 실시간 수율 (회고 L79) | 확인됨 (단 한계 큼) | 기본값 `:692–693`. 원판 크기는 입력 가능(`:338–340`). 수율은 구멍 무시한 면적비, 95%에서 잘라냄(`:1322`) |
| R10 | G02/G03 네이티브 원호 보간 (회고 L80, L28) | 일부 | G02 원호는 출력됨 [실행]. "네이티브"의 실체는 문자열 템플릿 1개 (7절). G03은 출력 안 됨 |
| R11 | G83 (회고 L28) | **사실 아님** [실행] | 출력 G-code에 G83 없음. 볼트홀은 G01 직선 플런지 한 번 |
| R12 | DXF / STL / Python 스크립트 추출 (회고 L80) | 확인됨 | DXF `:1541–1589`(LINE/CIRCLE, 단위 헤더 없음), STL `:1591`, Python `:1612` (Python의 원판은 400×300 고정 `:1633`) |
| R13 | Google Drive 백업 (회고 L81) | **확인됨** (2026-11-08 추가 확인) | 폴더 `1-Fo353Eo…`에 회고록, studio/polymer HTML, `digital_twin_dashboard.html`(로컬에 없음), 분석 md, Blender zip 존재 |
| R14 | 10mm 스냅 스케처, 길이 라벨, 원 그리기/빼기 (회고 L89–95) | **확인됨** | `editor_v2.js:4573` 스냅 10, `:4654–4662` 스냅 처리 |
| R15 | 0.1mm 단위 양방향 동기화 (회고 L97) | 일부 | 수치 테이블 입력은 `parseFloat`로 임의 값 허용(`:4760–4792`). 마우스 입력은 10mm 스냅(OFF 가능) |
| R16 | 40mm 익스트루드, 구멍이 "완벽히" 뚫린 솔리드 (회고 L99–100) | 일부 [실행] | `THREE.ExtrudeGeometry` 메쉬(`:5251`). 사다리꼴 프리셋 bbox 300×250×40 정확. 단 Ø16 구멍이 **24각형**, 현 오차 **0.068 mm(68 μm)**, Float32 저장 |
| R17 | 수정 결과가 공장 씬에 "실시간" 배치 (회고 L27) | 일부 | `cadStudioApplyToFactoryScene()` (`editor_v2.js:5957`) 버튼으로 복제 배치. 실시간 연동은 아님 |
| R18 | OPC-UA / MQTT / 30Hz 텔레메트리 (회고 L107–111) | 미구현 (회고록도 "로드맵"으로 표기) | 관련 코드 없음. 존재하는 것은 JS 가상 PLC (`editor_v2.js:3833`) |
| R19 | 공정 흐름 노드 그래프 (회고 L114–116, 작업 지시서 "공정 흐름 노드") | **미구현** | 노드 그래프 코드 없음 (회고록도 로드맵으로 표기) |

## 5. 작업 지시서 문제 1~8의 실제 상태

| # | 문제 | 실제 상태 | 근거 |
|---|---|---|---|
| 1 | Blender+CAD Sketcher를 B-Rep/SSoT로 칭함 | **맞음.** 추가로 웹 UI도 "B-Rep Kernel v0.30", "SolidCraft B-Rep 챔퍼/필렛"이라 표기하는데 실제로는 Three.js 메쉬. **챔퍼/필렛은 부품을 작은 BoxGeometry로 바꿔치기** | `index_v2.html:851,963,966`; `editor_v2.js:4305–4312, 4324` (챔퍼), `:4348–4355, 4367` (필렛), `:2625, 2775` 로그 문구 |
| — | (보정) 진짜 B-Rep도 있다 | `factory_precision.step`은 SolidCraft CLI가 만든 AP242 B-Rep: `MANIFOLD_SOLID_BREP` 226개, `ADVANCED_FACE` 1,337개, `CYLINDRICAL_SURFACE` 9, `B_SPLINE` 108. 웹은 이를 OBJ 메쉬로만 표시 | `factory_precision.step` 헤더, `server.mjs:336–346` |
| 2 | 1.4 μm / H7 통과는 자기 비교 | **맞음, 더 나쁨.** 하네스 단독 실행은 비교 대상조차 리터럴 상수. /studio 표는 정적 PASS | 4절 R2, R2b, R2c |
| 3 | Mode 2 μm 정밀 주장 vs 10mm 스냅·40mm 고정·메쉬 불리언 | **대부분 맞음.** 스냅 10mm 고정(ON/OFF만), 메쉬 홀(24각형, 68 μm 현 오차). 두께는 입력칸이 이미 있으나(`cad-sketch-extrude-thickness`) 프리셋 로드 시 40으로 리셋, 0 입력 시 조용히 40으로 대체 [실행], 로그는 항상 "(4cm)"라고 씀 | `editor_v2.js:4573, 4710, 4723, 4795, 5245, 5303` |
| 4 | 네이티브 G-code (포스트·G41/42·시뮬 없음) | **맞음** [실행]. 7절 상세 | `polymer...html:1421–1527` |
| 5 | FPM 포함, 절삭 조건 출처 없음 | **맞음.** FPM은 CAM 프리셋뿐 아니라 **3D 프린팅 프리셋**(노즐 250 °C)까지 있음 — FKM은 일반 FDM 출력 대상이 아님. 4개 소재 전부 출처 주석 없음 | `polymer...html:605–630`, `:571–655` |
| 6 | 원판 400×300, 커프·간격·탭·베벨 미반영 | **대부분 맞음.** 원판은 입력 가능하나 기본 400×300. 직사각 bbox 격자 배치만, 회전 없음, 커프 없음, 간격 12mm 고정, 베벨 여유 없음. **G-code/DXF는 원판 수용량을 넘는 부품도 출력** — partCount=20일 때 13–20번이 원판 밖 [실행]. 탭은 있으나 결함 (7절) | `:692–697, 1010–1014` (그림만 clamp), `:1453` (G-code는 clamp 없음) |
| 7 | Mode 1이 범용 CNC 공장 | **맞음.** 가상 PLC 태그: CNC 스핀들/절삭유/비상정지, DMLS 레이저·아르곤·O2, 화물문. 습식장비 태그 없음 | `editor_v2.js:3785–3921` |
| 8 | scratch에만 있고 버전관리·테스트 없음 | **맞음.** git 없음(설치도 안 됨), 테스트 러너 없음. `verify_*.mjs`·`check_*.mjs`는 1회성 문자열 검사 스크립트 | `package.json` (scripts 없음) |

## 6. 서버 / 페이지 동작 확인 [실행]

환경: Claude 앱 내장 브라우저, 뷰포트 1024×768, 원본 서버(PID 11116).

### /v2
- 페이지 로드됨. 메쉬 288개.
- **콘솔 에러 (로드 시 1건)**
  ```
  Uncaught (in promise) TypeError: Cannot set properties of null (setting 'innerHTML')
      at updateOutlinerUI (editor_v2.js:2126)
      at selectAssetObject (editor_v2.js:1875)
      at rebuildPlacedAssetsFromList (editor_v2.js:2191)
      at editor_v2.js:2238
  ```
  아웃라이너 DOM 요소가 없는데 갱신을 시도.
- **초기 메인 캔버스 0×0**: `#canvas3d` 크기가 0이라 뷰포트가 검게 보임. `resize` 이벤트를 강제로 보내자 634×696으로 잡히고 공장 씬이 렌더됨. 페이지가 보이지 않는 상태에서 로드됐을 때만 생기는 문제일 수 있음 — 일반 브라우저 창에서 재확인 필요.
- Mode 2 익스트루드 측정: 사다리꼴 프리셋 → bbox 300×250×40 mm, 홀 Ø16 = 24각형, 정점 반지름 8.00000–8.00006 mm, 현 오차 0.068 mm, 위치 배열 `Float32Array`.

### /polymer
- 페이지 로드됨, 자체 콘솔 에러 없음 (콘솔에 보인 에러는 이전 /v2 탭의 `editor_v2.js` 것이며 /polymer는 그 파일을 로드하지 않음).
- G-code 생성 함수 직접 실행 결과는 7절.

## 7. CAM G-code 결함 상세 [실행]

기본값 PP, 두께 25, 스텝다운 3, 공구 Ø6, 탭 높이 2.5, 원판 400×300.

| 결함 | 내용 | 근거 |
|---|---|---|
| 탭 높이 | 9패스 중 8번째 패스가 Z−24까지 탭 구간을 그대로 지나감. 마지막 패스에서만 탭을 들어 올림(Z−22.5) → **남는 탭 높이 1.0 mm** (지정 2.5 mm). 탭도 아래쪽 변 1개뿐 | `:1499–1511` |
| 볼트홀 | Ø6.6 지정인데 Ø6 엔드밀로 그 위치에 Z−25 한 번에 직선 플런지 → **Ø6.0 구멍**. 공구 슬라이더를 키우면(최대 12) 과대 구멍. 펙(G83) 없음 | `:1481–1487`, `:233` |
| 포스트프로세서 | ISO / Fanuc / Mach3 선택 시 출력이 **헤더 주석 외 완전히 동일**. Klipper 선택 시 3D프린터 노즐·베드 가열(M104/M140) 후 밀링 경로를 그대로 출력 | `:1431, 1437–1442` |
| 공구 보정 | G41/G42 없음. 공구 반경을 좌표에 직접 더한 공구 중심 경로. 그 자체는 흔한 방식이나 기계 측 마모 보정이 불가 | `:1466, 1492–1495` |
| 진입/이탈 | 램프/헬리컬 진입 없이 윤곽 위에서 직선 Z 플런지. 이탈 동작 없음 | `:1472, 1504` |
| 관통 깊이 | 최저 Z−27 (두께 25 + 2). 스포일보드 여유 파라미터 없이 결과적으로 2mm 초과 | 실행 결과 `minZ = -27` |
| 원판 초과 | 수용량 12개인데 partCount 20 입력 시 13–20번 부품 좌표가 원판 밖 | 실행 |
| 형상 고정 | 부품이 항상 "스핀들 마운트 80×80 + 보어 + 볼트 4개" 템플릿. DXF 드롭은 파싱하지만 G-code 생성은 `geomParams` 템플릿 기반 | `:668–677, 1445–1487` |

## 8. 추가 발견 (보안·구조)

1. **원격 실행 엔드포인트**: `server.mjs`가 `Access-Control-Allow-Origin: *`(`:21`)로 열려 있고, `GET /api/rebuild`(`:336`)가 `solidcraft-cli`를, `POST /api/render-blender`(`:178`)가 요청 본문의 `blenderPath`로 `exec`를 실행(`:192, 227`). 같은 PC에서 아무 웹페이지나 이 서버에 요청해 실행 파일을 지정할 수 있는 구조. 로컬 전용이라도 Phase 1에서 막아야 함.
2. 경로 하드코딩: `server.mjs:7, 18` (3절).
3. 단일 거대 파일: `editor_v2.js` 251 KB(5,900여 줄), `polymer...html` 80 KB. 모듈 분리 없음 → 테스트하려면 순수 함수부터 분리 필요.
4. 중복 백업 파일: `index.html`≡`index_v1_backup.html`, `editor.js`≡`editor_v1_backup.js`, `factory_precision.sc.bak`.
5. 이전 에이전트의 1회성 패치 스크립트 약 90개가 `viewer/`에 섞여 있음. 삭제하지 말고 Phase 1에서 `archive/` 같은 폴더로 옮길지 결정 필요 (이동 전 목록 확인 받을 것).
6. `materials_pp_fkm_stainless_spec.json`과 `polymer...html` 내부 `MATERIAL_PRESETS`가 별개 — 재질 데이터 SSoT가 두 군데.

## 8a. Phase 1 작업 중 추가로 확인한 것 (2026-11-08)

- **Mode 2 모달의 챔퍼·필렛도 가짜**: `cadStudioApplyChamfer`/`cadStudioApplyFillet`은 중심에서 10mm 넘게 떨어진 모든 정점을 안쪽으로 옮긴다 → 판넬 전체(구멍 포함)가 줄어든다. 모서리 가공이 아님.
- **카운터보어·"지정 좌표 정밀 타공"·공장 쪽 볼트 타공 = 표시 마커**: 어두운 원통과 링 메쉬를 위에 붙일 뿐 형상에서 빼지 않는다 (`cadStudioApplyCounterbore`, `cadStudioApplyCustomHole`, `applyDrillHoleToSelected`).
- Mode 2 치수 HUD가 `X × Z × Y` 순서로 찍어 300 × 40 × 250으로 보였음 (두께와 높이가 뒤바뀜).
- `/v2` 로드 에러(`updateOutlinerUI` null)는 레이아웃 로드 콜백을 중단시켜 저장된 화물문 위치 복원 등 뒤 코드가 실행되지 않았음.
- `/studio` 로드 시 `updateInterferenceBadge is not defined` 에러 (원본에도 있음) → 시작 시 코드 패널 초기화가 건너뛰어짐.
- `/v2` 초기 캔버스 0×0은 **탭이 보이는 상태에서는 재현되지 않음** (792×870 정상). 숨겨진 상태로 로드될 때만 발생.
- `/studio` 표의 "작업대 간섭 여유 12.5 mm / PASS"는 여전히 정적일 가능성 — Phase 1에서 확인 못 함.

## 9. 다음 단계 전에 정해야 할 것 (사용자 결정)

1. **git 설치**: `winget install --id Git.Git -e` 로 설치해도 되는지. 설치 후 첫 커밋 "baseline from antigravity"는 `docs/` 추가 **전** 상태로 만들고, `docs/`는 두 번째 커밋으로 분리할 계획.
2. **원본 scratch 서버(PID 11116)**: 계속 둘지. 복사본으로 작업하려면 이 서버를 끄고 복사본 서버를 띄워야 함 (그 전에 `server.mjs` 경로 상대화 필요).
3. **브라우저 프로필 폴더** (`scratch\...\viewer\edgetmp*`, `scratch\edge_profile`, `scratch\chrome_profile`, `scratch\edgetmp3`): 로그인/쿠키 데이터가 있을 수 있음. 정리 여부는 사용자 판단.
4. **Phase 2 커널 선택지에 SolidCraft 추가 검토**: 이미 이 PC에 있는 `solidcraft-cli` 0.30.1이 파라미터 스크립트(JSON) → B-Rep STEP 출력, `eval`(측정) 명령을 지원함. 작업 지시서의 build123d(OpenCASCADE)와 비교 대상에 넣는 것을 제안. SolidWorks CLI 경로는 지시서에 미기입 상태.
