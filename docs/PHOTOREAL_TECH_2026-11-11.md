# 더 사실적인 디지털 트윈을 만드는 방법 — 최신 기술 정리 (2026-11-11 조사, Fable)

오늘 웹 검색과 이 PC에 설치된 라이브러리(three.js 0.187)를 직접 열어 확인한 내용입니다.
각 항목에 **[확인]**(공식 문서·설치본에서 직접 확인) / **[보고됨]**(커뮤니티 글·기사 1곳, 직접 검증 안 함)을 붙였습니다.
이 프로젝트의 제약: Intel UHD 내장 그래픽, 웹(three.js), 공장 내부 재현이 목표, 소품은 넣지 않음.

## 한눈에 — 효과 대비 비용 순서

| 순위 | 방법 | 사실감 효과 | 이 PC에서 | 걸리는 일 |
|---|---|---|---|---|
| 1 | 실제 공장을 **가우시안 스플랫(3DGS)** 으로 촬영해 배경으로 쓰기 | 매우 큼(사진 그대로) | 가능(스트리밍 LoD) | 현장 재촬영 필요 |
| 2 | **Cycles 굽기 품질 해결**(노이즈 제거 순서) + 방향성 라이트맵 | 큼 | 가볍다(굽기는 사전 계산) | 중간 |
| 3 | **바닥 반사**(박스 투영 반사 + SSR) | 큼 | SSR은 "높음" 단계만 | 중간 |
| 4 | **데칼**(타이어 자국, 물 자국, 기름 얼룩) | 큼 | 가볍다 | 작음 |
| 5 | 벽 상부·지붕 재질 + 바닥 재질 교체(Megascans) | 중간 | 가볍다 | 작음(받기만 하면 됨) |
| 6 | WebGPU 렌더러 + SSGI/TRAA | 중간 | **무거움** — 좋은 GPU에서만 | 큼(렌더 경로 이전) |
| 7 | 카메라 마무리(노출·색·필름 그레인·피사계 심도) | 중간 | 가볍다 | 작음 |
| 8 | OpenUSD / Omniverse 스트리밍 | 최고(경로 추적) | 불가(서버 GPU 필요) | 매우 큼·유료 |

## 1. 가우시안 스플랫 — 실제 공장을 그대로 넣기

- **무엇:** 사진·영상 수백 장에서 장면을 "빛나는 점 구름"으로 복원. 모델링 없이 사진과 같은 화면이 나옴.
- **[확인] three.js 0.187에 스플랫 로더가 들어 있음.** 이 PC의 `node_modules/three/examples/jsm/loaders/`에 `GaussianSplatPLYLoader.js`, `SPLATLoader.js`, `KSPLATLoader.js`, `SPZLoader.js`, `GLTFGaussianSplatLoaderExtension.js`가 있음(r186, 2026-09-08부터라고 보고됨).
- **[확인] Spark**(World Labs, MIT 라이선스): three.js용 3DGS 렌더러. 2.x에서 스트리밍 LoD와 `.RAD` 압축 형식, 일반 메시와 한 장면에서 함께 그리기 지원. PLY·SPZ·SPLAT·KSPLAT·SOG 읽음. 2026-09 v2.3.0.
- **이 프로젝트에 쓰는 법(혼합 방식):** 스플랫 = 눈에 보이는 배경(벽·천장·바닥의 실제 얼룩과 빛), 지금의 메시 건물 = 충돌·치수·편집·기계 배치용(보이지 않거나 반투명). 기계와 가상 설비는 메시로 스플랫 위에 그림.
- **한계:** 스플랫은 조명이 사진에 굳어 있어 조명을 바꿀 수 없음(재조명은 아직 연구 단계, 실용 사례를 찾지 못함). 물건이 찍히면 그대로 들어감 → **빈 공장일 때 촬영**해야 "소품 없음" 조건에 맞음.
- **촬영 요령(Drive 지식 문서 기준):** 노출·초점 고정, 겹침 70~80%, 4K 30fps, 천천히 걸으며 벽·천장·바닥을 모두. 지금 가진 70초 편집 영상은 컷이 많아 복원용으로는 부족.
- **처리:** 프레임 추출(2fps) → COLMAP → Colab 무료 T4에서 gsplat/nerfstudio → SPZ 또는 SOG로 압축 → `assets/`에 넣고 로더로 읽기.

## 2. 조명 굽기 — 지금 막힌 곳과 푸는 법

- **현재:** 내장 베이커(Node) 결과를 쓰는 중. Blender Cycles 경로(`--blender`)는 동작하지만 얼룩이 남음.
- **[보고됨] 얼룩 원인 후보:** Blender는 굽기에서 노이즈 제거와 여백 확장(margin)의 순서 문제로 이음매가 어두워지는 버그 이력이 있음(#94573). 해결 방향은 "노이즈 제거 먼저, 여백은 그 뒤".
  → 우리 흐름에 맞는 해법: Blender에서는 **여백 0, 노이즈 제거 없이** 굽고, 받은 float 이미지를 **차트 단위로 OIDN 노이즈 제거**(Blender 파이썬의 합성 노드 Denoise 또는 `oidn` 실행 파일) → 여백 채우기는 지금처럼 Node가 담당.
- **[보고됨] Blender 5.3에 DLSS Ray Reconstruction 디노이저 추가**(NVIDIA GPU 전용, 뷰포트 중심) — 이 PC와 굽기에는 해당 없음.
- **방향성 라이트맵 [보고됨]:** 텍셀마다 "빛이 주로 오는 방향"을 함께 저장하면 노멀 맵(골판 리브, 콘크리트 요철)이 구운 조명에도 반응. 실행 비용은 거의 없음. 지금은 구운 조명이 평평해서 골판 요철이 죽어 보임 → 효과 큼.
- **프로브 볼륨 [보고됨]:** 공간에 격자로 빛 정보를 저장해 **움직이는 기계**가 주변 간접광을 받게 함(커뮤니티 사례: 프로브당 32,000 샘플, 7회 반사로 굽고 실행은 0.1 ms). three.js 0.187에 `lighting/vxgi/VXGIVolume.js`가 있음 **[확인: 파일 존재]**, 품질·성능은 미검증.

## 3. 반사 — 바닥에 천장등이 비치게

- 지금: 홀 가운데 한 점에서 찍은 큐브 반사 → 위치가 맞지 않아 "어딘가 비치긴 하는" 수준.
- 할 일: (a) 구역별(홀 4~6곳, 메자닌 아래) 큐브 캡처 + **박스 투영 보정**으로 등이 제자리에 비치게, (b) 바닥 거칠기 맵에 닳은 길(광택)과 먼지(무광) 차이 주기 — Megascans 바닥의 거칠기 0.94는 너무 무광이라 현장의 번들거림이 안 나옴.
- **[확인] three.js 0.187 TSL에 `SSRNode.js`(화면 공간 반사)** 가 있음. WebGPU 렌더러 경로에서만 쓰는 노드라 지금 구조(WebGLRenderer)에는 바로 못 붙임.

## 4. 데칼 — 사용 흔적

- 현장 영상에서 사실감의 절반은 **바닥 타이어 자국·갈색 얼룩·흰 가루, 벽의 세로 물 자국**.
- 받아 둔 `Tire Tracks On Concrete`(Opacity 맵 포함)를 바닥 위 얇은 투명 평면으로 배치하거나, 라이트맵 굽기 때 알베도에 합성.
- 구현은 작음: `manifest.json`에 `decals: [{set, at:[x,y], sizeM, rotation}]` 추가 + 뷰어에서 평면 생성.

## 5. WebGPU 렌더러 — 언제 갈아탈까

- **[확인] three.js 공식 문서:** WebGPURenderer는 아직 "실험적". 새 효과(SSGI, SSS, 개선된 피사계 심도)는 새 렌더러에만 추가됨.
- **[확인] 설치본에 있는 TSL 노드:** `SSGINode.js`, `SSRNode.js`, `GTAONode.js`, `TRAANode.js`(시간적 AA), `DenoiseNode.js`, `RecurrentDenoiseNode.js`.
- **[보고됨]** SSGI는 큰 장면에서 비용이 큼. Speedball GI(커뮤니티 DDGI 패키지)는 "중간 규모에 적합, 빛샘 있음".
- **판단:** 이 PC(Intel UHD)에서는 이득보다 손해. 굽기 + 반사 + 데칼로 대부분 해결하고, **시연 기기가 외장 GPU로 정해지면** "높음" 단계 전용으로 WebGPU 경로를 추가. 전환 시 `visual_upgrade.js`의 셰이더 패치(`onBeforeCompile`)와 후처리(EffectComposer)를 TSL로 다시 써야 함.

## 6. 카메라 마무리 (가볍고 효과 좋음)

- 영상 프레임에 맞춘 노출·화이트밸런스(현장은 차가운 LED + 크림색 벽 → 약간 녹황색).
- 등 주변 빛 번짐(블룸, 지금은 "높음"만), 약한 비네트, 필름 그레인, 색수차 아주 약하게.
- 시간적 안티에일리어싱(TRAA)은 WebGPU 경로 필요. 지금 경로에서는 SMAA 유지.

## 7. 산업용 트윈의 표준 흐름 (참고)

- **[확인] NVIDIA Omniverse / OpenUSD:** 공장 트윈의 사실상 표준 데이터 층. 브라우저로는 서버 GPU에서 그린 화면을 WebRTC로 스트리밍(Sight Machine: Azure A10 GPU, Chromium 브라우저). 현장 복원은 LiDAR + 사진측량(NavVis).
- 이 프로젝트에는 과함(서버 GPU 비용, 라이선스). 다만 **건물 glb → USD 변환**은 Blender로 가능하므로, 나중에 Omniverse로 옮길 길은 열려 있음.
- Sand3D 에셋(이미 연동)은 USDA 원본이라 같은 흐름에 맞음.

## 8. 권하는 다음 순서

1. **데칼**(4절) — 받아 둔 타이어 자국부터. 하루 안.
2. **Cycles 노이즈 해결 + 방향성 라이트맵**(2절).
3. **바닥 반사**(3절) + 바닥 재질 교체(더 밝은 회색, 거칠기 맵 조정).
4. **현장 재촬영 → 3DGS**(1절) — 공장이 비어 있을 때. 가장 큰 도약.
5. 시연 기기가 정해지면 WebGPU "높음" 경로(5절).

## 출처

- three.js WebGPURenderer 매뉴얼: https://threejs.org/manual/en/webgpurenderer
- three.js 포럼 — Global Illumination: https://discourse.threejs.org/t/global-illumination/91243
- three.js 포럼 — Directional Light mapping in WebGPU: https://discourse.threejs.org/t/directional-light-mapping-in-webgpu/82383
- Speedball GI README: https://cdn.jsdelivr.net/npm/speedball-gi@0.6.7/README.md
- Spark (World Labs): https://github.com/sparkjsdev/spark · https://sparkjs.dev/docs/overview/
- Spark v2.3.0 소식: https://radiancefields.com/spark-v2.3.0-fixes-on-demand-rendering-for-paged-lod
- Gaussian Splat Lite 1.0 (three.js 포럼): https://discourse.threejs.org/t/gaussian-splat-lite-1-0-webgpu-streaming-lod-and-depth-rendering-for-three-js/94234
- Blender 굽기 + 노이즈 제거 이음매 버그 #94573: https://projects.blender.org/blender/blender/issues/94573
- Blender 5.3 DLSS 디노이저 기사: https://digitalproduction.com/2026/06/03/nvidia-brings-dlss-denoising-to-blender-5-3/
- NVIDIA Omniverse 참조 구조: https://docs.omniverse.nvidia.com/arch-diagrams/latest/ref-arch-diagrams/overview.html
- NVIDIA — Sight Machine 사례: https://www.nvidia.com/en-us/case-studies/sight-machine/
- 설치본 직접 확인: `node_modules/three/examples/jsm/{loaders,tsl/display,lighting/vxgi}` (three 0.187)

**조사 한계:** 검색 4회의 요약 결과에 근거함. [보고됨] 항목은 원문을 끝까지 읽거나 실행해 보지 않았음. "영상만으로 공장을 사실적으로 복원"하는 2026년 신기술은 이번 검색에서 구체적인 자료를 찾지 못함.
