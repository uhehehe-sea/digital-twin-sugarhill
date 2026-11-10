# 이어서 작업할 계획 — 다음 담당(Opus)에게 (2026-11-09 작성, Fable)

이 문서만 읽고 바로 시작할 수 있게 썼습니다. 배경은 `docs/DIGITAL_TWIN_PLAN_2026-11-09.md`(전체 기획),
지금까지 한 일은 `docs/WORKLOG.md`의 2026-11-09 항목, 조명 설계 근거는 `docs/LIGHTING_NOTES.md`에 있습니다.

## 0. 사용자와 작업 방식

- 사용자: 공장(Sugar Hill)을 운영하는 비개발자. 한국어로 짧게 지시합니다. **결과를 화면으로 확인**하는 것을 원합니다.
- 최종 목표: **포토리얼한 화면**의 **진짜 디지털 트윈**(실제 속도·수량·납기 예측 → 실기계 연결).
- 답변은 한국어, 쉬운 말, 한 일과 못 한 일을 구분해서. 스크린샷을 보내면 좋아합니다.
- 산출물은 Google Drive(`H:\내 드라이브`)에 올립니다. **같은 날짜면 `_v1`, `_v2` … 로 구분**(지금 최신은 `factory-digital-twin_claude_2026-11-09_v7.zip`). 날짜가 바뀌면 그 날짜의 `_v1`부터.
- 다른 에이전트 "뮤즈", "에고"가 같은 프로젝트를 다룹니다. 전달 메모는 `docs/HANDOFF_MUSE_2026-11-09.md`.
- 원칙: 기계에 **쓰지 않음**(읽기 전용), 실행 파일 경로는 환경변수에서만, 가정값은 "가정값"이라고 표시, 화면에서 직접 확인하지 않은 것은 확인했다고 쓰지 않기.

## 1. 실행과 검증

```bash
npm install          # three.js 0.187 포함 (v6부터 CDN 아님)
npm run dev          # http://localhost:8089/v2
npm test             # 92개 통과가 기준
```

- 브라우저 확인은 Browser 패널로 `http://127.0.0.1:8089/v2`. 전역으로 `scene`, `camera`, `controls`, `renderer`, `placedObjects`, `twinRuntime`, `twinVisual`, `TwinNest`, `twinAssignPart`, `buildingOriginals`에 접근할 수 있습니다.
- 라우터 작업을 끝까지 돌려 보는 절차: `openSolidCraftStudioModal()` → "입력 두께로 익스트루드" → "공장 씬에 적용 및 배치" → `twinAssignPart(part, 'CNC_Router_3Axis_01')` → `#tl-speed`를 60으로.
- 테스트가 `parts_library.json`, `scene_layout.json`을 건드릴 수 있습니다. 커밋 전에 `git checkout -- parts_library.json scene_layout.json`.

### 이 PC에서 겪은 함정

- Git Bash의 `tar`는 zip을 못 만듭니다(이름만 .zip인 tar가 됨). zip은 PowerShell에서 `& "$env:SystemRoot\System32\tar.exe" -a -c -f x.zip --exclude=node_modules --exclude=dist -C C:\Users\tonyh\Documents factory-digital-twin`.
- Bash 히어독 안의 `\\`가 `\` 하나로 줄어듭니다. 역슬래시나 따옴표가 많은 파일은 Write 도구로 쓰세요.
- `/assets/`는 1시간 캐시입니다. 텍스처·manifest를 바꾼 뒤 안 바뀌어 보이면 캐시입니다(manifest는 `no-store`로 읽음).
- 화면 스크립트는 `defer` + `window.onload = init3D` 순서입니다. `scene` 등은 onload 뒤에야 존재합니다.
- 장면 단위는 **mm, Z-up**. three.js 조명의 물리 감쇠를 쓰면 전부 검게 됩니다 → `viewer/three_global.js`의 조명 래퍼 참고.
- Blender, CAMotics는 이 PC에 없습니다. Fab(Epic) 로그인도 없습니다.

## 2. 지금 상태 (커밋 기준)

| 영역 | 상태 |
|---|---|
| UI | 툴바 1,366 px 대응, 탭 3개(배치·생산 / 만들기 / 설비·신호), KO/EN 전환 |
| 그래픽 | three.js 0.187(WebGLRenderer), HDRI + 등기구 면광원 8개 + 실내 큐브 캡처(간접광·반사), 실내 그림자, GTAO, 블룸, SMAA, 건물 UV + 표면 5종 |
| 에셋 | `assets/` — Poly Haven CC0 임시본. Megascans 교체 방법·목록은 `assets/README.md` |
| 건물 glTF | `assets/models/factory_building.glb` (`tools/build_building_gltf.mjs`). 화면은 아직 OBJ를 읽음 |
| 트윈 엔진 | 1~4단계 **계산·서버·테스트 완료, 화면 연결 없음** (아래 A) |
| 설비 모델 | 상자·원통 조합 그대로 |

## 3. 할 일 (우선순위 순)

### 0. 건물 치수 (사용자 답 대기)
현장 사진을 받았고 색·재질·빈 건물은 반영했습니다(`docs/SITE_REFERENCE_2026-11-09.md`). 치수는 추정이 서로 달라 보류했습니다.
사용자가 줄자 실측 1개나 영상 원본을 주면: 파라메트릭 건물 생성기(`tools/`)를 만들어 OBJ를 다시 만들고, `editor_v2.js`의 고정 좌표(16000/24000, 카메라 시점, 게이트·조명·기본 설비 위치)를 건물 크기에서 계산하도록 바꿉니다. 영상 프레임 추출 도구(ffmpeg/OpenCV)는 설치 허락을 받아야 합니다.

### A. 트윈 1~4단계를 화면에 연결 — **가장 먼저** (엔진은 다 있음)

엔진: `viewer/lib/nc_program.js`(`timing(segs, kin)`, `load(text, kin)`), `machine_profile.js`, `capacity.js`, `twin_real.js`, 서버 `/api/machines` `/api/ingest` `/api/real` `/api/cycles`, WebSocket `{type:'real'|'cycle'}`, `tools/mock_machine.mjs`.
`index_v2.html`에 `lib/machine_profile.js`, `lib/capacity.js`, `lib/twin_real.js`를 `defer`로 추가해야 합니다(아직 안 불러옴).

1. **프로파일 불러오기·적용**: 시작할 때 `/api/machines`를 읽어 `MachineProfile.merge(kind, saved)`. `twin_nest.js`의 `NcProgram.load(gen.text)` 두 곳(159, 258행 부근)과 `twin_live.js`의 `assignPart`에 `MachineProfile.kinOf(profile)`을 넘기고, `assignProgram(..., { loadS, unloadS })`에 프로파일 값을 넘깁니다. 결과: 화면의 예상 시간이 가감속 포함 값이 됨. `twin_nest.js` 356행의 "가감속 미포함" 문구도 고칩니다.
2. **설비 프로파일 창**: 설비 카드에 ⚙ 버튼 → 기종, 컨트롤러, 가속도, 급속, 로딩/언로딩, 공구 수명, 접속 방식(없음/HTTP/MTConnect + 주소) 입력, 저장(`POST /api/machines`). **실측 보정** 칸: "프로그램 이름 + 실제 걸린 시간(초)"을 넣으면 `POST /api/cycles {source:'manual'}` → `summarize`의 제안 계수를 보여 주고 "적용"으로 `timeFactor` 저장. 배지를 "가정값" ↔ "실측 보정 (날짜)"로.
3. **생산량·납기 계산기**: 네스팅 창에 섹션 추가. 입력: 목표 수량, 교대(시간/교대 수/휴식), OEE 3값, 설비 대수, 시작 일시. `Capacity.plan` 결과(장수, 순가공·총 시간, 작업일, 완료 예정)와 `Capacity.whatIf`(설비 +1, 이송 ±20%는 `feedScale`로 `NcProgram.timing` 재계산) 표.
4. **시뮬레이션 사이클 기록**: `twin_live.js`의 `JOB_DONE` 처리에서 `POST /api/cycles {source:'sim', machine, program, runS, predictedS, cutLenMm}`. 라우터로 보낼 때 `POST /api/cycles {source:'plan', ...}`(실기계 사이클에 예측을 붙이는 용도).
5. **계획 대 실제**: WebSocket `real` 메시지를 받아 설비 카드에 "실기계" 줄(상태, 프로그램, 줄 번호, 축). 5초 넘게 안 오면 "연결 끊김". 작업 중이면 `TwinReal.planVsActual`로 지연/정상/빠름 배지와 완료 예측. 시뮬레이션 작업이 없을 때는 3D 라우터 축을 실제 값으로 구동(`twin_nest.js`의 `drive`가 rig를 움직이는 방식 참고).
6. **공구 마모**: `/api/cycles` 기록으로 `TwinReal.toolWear` → 카드에 %와 "곧 교체/교체" 표시, "공구 교체함" 버튼(`toolChanged:true` 기록).
7. 검증: `node tools/mock_machine.mjs --program <저장한 .nc> --speed 20`으로 실기계 흉내를 내고 화면의 계획 대 실제·보정 제안이 맞는지 확인. 브라우저에서 확인한 수치를 WORKLOG에 적기.

### B. 포토리얼 — 사용자가 가장 원하는 것

1. **현장 사진/영상 반영**: 사용자가 현장 자료를 주겠다고 했습니다. 받으면 바닥·벽·조명 색온도·등기구 배치를 실제에 맞춥니다(`assets/surfaces/manifest.json`의 tint, `visual_upgrade.js`의 `FIXTURE`). 영상은 ffmpeg로 프레임을 뽑아 봅니다(설치 필요 여부 확인).
2. **Megascans 교체**: 사용자(또는 뮤즈/에고)가 `assets/README.md` 목록대로 받아 오면 폴더에 넣고 manifest의 `set`만 바꿉니다. AO/Roughness/Metalness가 따로 오면 ARM으로 합치는 스크립트를 `tools/`에 만드세요(sharp가 이미 의존성에 있음).
3. **철골 슬롯 추가**: 기둥·보·중도리(`Col_`, `Roof_Purlin`, `Roof_Gable_Rafter`, `Girt_`, `Mezzanine_Beam`, `Mezz_Joist`)는 아직 텍스처가 없습니다. 도장 철재 세트를 넣고 manifest에 `steel` 슬롯.
4. **설비 모델**: 라우터부터 실제 형상 glTF로. `GLTFLoader`는 `THREE.GLTFLoader`로 이미 노출. 축 노드 이름 규칙(gantry/carriage/spindle)을 정해 `twin_live.js`의 `buildRouter`가 만드는 rig와 같은 인터페이스로 맞추면 운동학 코드는 그대로 씁니다. 모델 출처는 사용자에게 확인(제조사 CAD / Fab 구매).
5. **라이트맵 베이크**: Blender 설치를 사용자에게 제안(무료). 설치되면 `factory_building.glb`를 헤드리스 Blender로 열어 lightmap UV(2번 채널) + Cycles 베이크 → glb에 `lightMap`으로. 화면이 OBJ 대신 glb를 읽게 바꿀 때는 좌표 변환(m·Y-up → mm·Z-up)과 `initBuildingParts`의 이름 기반 로직을 유지해야 합니다.
6. **데칼·소품**: 바닥 얼룩, 타이어 자국, 팔레트 등. 데칼은 `DecalGeometry` 또는 바닥 위 알파 평면.
7. 조명 미세 조정은 `docs/LIGHTING_NOTES.md`의 "조정하는 곳". 설비를 많이 옮긴 뒤에는 `twinVisual.recapture()`를 자동 호출하도록(저장 시점 등) 연결하면 좋습니다.
8. (선택) WebGPU 전환, 언리얼 뷰어(B안), 3DGS 배경은 기획서 3장. 사용자가 "실공장 3DGS는 추후"라고 했습니다.

### C. 정리

- `editor_v2.js`(약 6,700줄) 모듈 분할 — 기획서 S6. 큰 수술이므로 A·B 뒤에.
- 브라우저 자동 테스트(S8), 레이아웃 버전 관리(S7), 형상 네스팅(S9), 공구 교환(S10, `docs/TOOL_CHANGE.md`).
- 화면에 남은 과장 표현: `editor_v2.js` 주석·로그의 "UE5", "Omniverse RTX", 에셋 배지 "SimReady USD". 페이지 `<title>`도 "UE5 Slate × Linear Dark".
- 사이드바 버튼 "복제"는 고쳤지만 영어 사용설명서(`docs/User_Guide_EN.pdf`)는 UI 정리 전 화면 기준입니다. 탭 이름·툴바가 달라졌으니 다시 만들어야 합니다(생성 스크립트는 세션 임시 폴더에 있었으므로 새로 작성 필요).
- /v1, /splat.html, /monitor는 아직 r128 CDN.

## 4. 사용자에게 받아야 하는 것 (이미 요청함)

1. 라우터 기종·컨트롤러, 재질별 실제 이송·절입, 원판 로딩/언로딩 실제 시간, 기준 G-code 몇 개의 실제 가공 시간
2. 현장 사진·영상(바닥, 벽, 천장 등기구, 설비 전체와 근접)
3. Megascans 다운로드(`assets/README.md` 목록) — Epic 계정 필요
4. Blender 설치 여부, 설비 3D 모델 출처

## 5. 열려 있는 결정

- 공개 저장소의 과거 커밋에 개인 경로가 남아 있음 → 기록 재작성 여부(사용자 결정)
- 뮤즈의 GitHub 최신본과 합치기(주소 미확인). 방법은 HANDOFF 문서의 rebase 절차
- Drive의 `factory_digital_twin_unified.obj` 중복 정리
