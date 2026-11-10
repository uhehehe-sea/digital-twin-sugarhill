# 조명 설계 메모 — Unreal · Twinmotion · Blender에서 배운 것 (2026-11-09)

`/v2` 화면의 조명(`viewer/visual_upgrade.js`)을 왜 이렇게 짰는지 적어 둡니다.
세 프로그램의 실내 조명 자료를 조사해 공통 원칙을 뽑고, 웹(three.js)에서 가능한 방법으로 옮겼습니다.

## 세 프로그램의 공통 원칙

| 원칙 | Unreal | Twinmotion | Blender | 근거 |
|---|---|---|---|---|
| 빛은 **실제 등기구 자리**에서 나온다 | Rect Light를 조명 기구마다 | "천장 조명마다 실제 광원을 달아야 미리보기와 결과가 맞는다" | 등기구 위치에 Area Light | 창고는 "실내 천장등 + 바깥 HDR" 구성 |
| **반사된 빛(간접광)** 이 실내를 채운다 | Lumen GI | Lumen | Cycles 경로 추적 | 정확한 GI에서는 실내가 야외보다 훨씬 어둡다 → 노출로 보정 |
| 반사에는 **그 방**이 비친다 | Reflection Capture / Lumen 반사 | Lumen 반사 | 경로 추적 | 야외 하늘이 실내 바닥에 비치면 가짜로 보인다 |
| **노출은 손으로 고정** | 실내용 Post Process Volume을 따로, 자동 노출 범위 제한 | 자동 노출을 끄고 수동(예: 1.4에서 시작) | Exposure + AgX | 자동 노출은 실내에서 과다 노출을 만든다 |
| 필름 톤 곡선 | ACES 계열 | 동일 | AgX (4.x 기본) | |
| 바깥은 **부드러운 HDRI** | Sky Light + HDRI | Skydome | World HDRI | 해가 보이는 HDRI는 날카로운 그림자를 만든다 |
| 접촉부 음영 | AO, Lumen | AO | AO / 경로 추적 | |

## 이 프로젝트에서 구현한 방식

| 원칙 | 구현 | 한계 |
|---|---|---|
| 등기구 광원 | 건물의 `HighBay_LED_*` 8개 각각에 면광원(RectAreaLight, 등기구 크기 1200×320 mm). 등기구 자체는 발광 재질 + 블룸 | 면광원은 그림자를 만들지 못함(three.js 제약) |
| 그림자 | 지붕 구조 바로 아래에서 비스듬히 내려 비추는 방향광 1개(4096 그림자 맵, 건물 바닥 크기에 맞춤). 지붕·외벽·천장 기구는 그림자를 드리우지 않음 | 8개 등의 평균 방향 1개로 근사. 등마다의 겹친 그림자는 아님 |
| 간접광·실내 반사 | 조명이 켜진 실내를 홀 중앙(높이 2.4 m)에서 큐브맵으로 찍어 환경광으로 사용. 2회 반복해 1차 반사광까지 포함 (Unreal의 Sky Light / Reflection Capture와 같은 발상) | 한 지점에서 찍은 것이라 위치별 차이가 없음. 설비를 옮겨도 자동 갱신 안 됨 → `twinVisual.recapture()` |
| 바깥 | Poly Haven 창고 HDRI. 캡처할 때 반투명 외벽과 문을 통해 들어오는 빛으로만 사용 | |
| 노출·톤 | 수동 노출 1.2, AgX | |
| 접촉부 음영 | GTAO, 반경 450 mm | 화면 공간 방식이라 화면 밖 물체는 반영 안 됨 |
| 바닥 | 콘크리트 텍스처 + 거칠기 0.55(코팅된 콘크리트) → 등기구가 은은히 비침 | |

균형값: 직접광(그림자 광원 2.6 + 등기구 조도 0.6) 대 환경광 0.5. 환경광을 1.0으로 두면 캡처된 빛이 모든 곳을 밝혀 그림자가 사라집니다.

## 아직 사진 같지 않은 이유와 다음 단계

1. **설비가 상자 모양**입니다. 실제 기계 형상(제조사 CAD나 구매 모델)이 가장 큰 차이를 만듭니다.
2. **진짜 GI가 아닙니다.** 한 점 캡처는 근사입니다. 고정된 건물은 Blender에서 라이트맵을 구우면(베이크) 위치별 간접광과 부드러운 그림자가 정확해집니다. 건물 glb는 준비되어 있습니다(`assets/models/factory_building.glb`).
3. **현장 색과 재질이 추정값**입니다. 현장 사진이 있으면 바닥·벽·조명 색온도를 실제에 맞출 수 있습니다.
4. 소품과 사용 흔적(팔레트, 바닥 얼룩, 케이블, 표지판)이 없습니다. Megascans 데칼·소품 단계.
5. 화면 전체를 실제 스캔(3DGS)으로 덮는 방법도 있습니다(추후).

## 조정하는 곳

`viewer/visual_upgrade.js` 상단의 상수:

- `EXPOSURE` — 전체 밝기
- `FIXTURE.irradiance` — 등기구 바로 아래 바닥에 닿는 빛의 양, `FIXTURE.color` — 색온도(지금 약 4500 K), `FIXTURE.emissive` — 등기구 자체의 밝기(블룸)
- `SHADOW.strength` / `lean` / `height` — 그림자 광원의 세기·기울기·높이
- 캡처 뒤 `scene.environmentIntensity` — 간접광 양

## 출처

- [Unreal: Lumen과 실내 노출, Skylight Leaking, Local Exposure (Fortnite Chapter 4 기술 블로그)](https://www.unrealengine.com/tech-blog/lumen-brings-real-time-global-illumination-to-fortnite-battle-royale-chapter-4?lang=en-US)
- [Unreal 포럼: 어두운 Lumen 실내 해결](https://forums.unrealengine.com/t/how-to-fix-extremely-dark-lumen-interior-scenes/2263003)
- [Unreal 포럼: 실내 조명 — Lumen vs Path Tracing (UE 5.7)](https://forums.unrealengine.com/t/community-tutorial-interior-lighting-lumen-vs-path-tracing-in-unreal-engine-5-7/2668574)
- [Unreal answers: 창고 조명 — 실내 천장등 + 바깥 HDR, 실내/실외 볼륨 분리](https://answers.unrealengine.com/questions/823696/view.html)
- [Twinmotion 포럼: 실내 과다 노출 → 자동 노출 끄기](https://forums.unrealengine.com/t/is-there-a-way-i-can-fix-my-interior-lighting-the-interior-render-has-an-extremely-overexposed-area/1830189)
- [Twinmotion 포럼: 실내 렌더 — 천장등마다 실제 광원 추가](https://forums.unrealengine.com/t/continuing-frustrations-with-indoor-renders/1831706)
- [VDCI: Twinmotion 실내 조명과 Lumen](https://vdci.edu/learn/interior-design/interior-lighting-twinmotion-lumen)
- [VDCI: Twinmotion 실내 렌더 설정(수동 노출)](https://vdci.edu/learn/interior-design/interior-rendering-settings-twinmotion)
- [HDRI로 실내 조명하기 (흐린 HDRI, 세기 조절)](https://www.relebook.com/articles/hdri-lighting-for-interior-3d-rendering)
- [포털 라이트와 등기구 조명의 역할 분담](https://novedge.com/blogs/design-news/cinema-4d-tip-optimizing-redshift-interior-lighting-with-portal-area-lights)
- [three.js 포럼: 사실적인 빛과 그림자 — 구운 에셋이 최선](https://discourse.threejs.org/t/how-to-get-photorrealism-light-shadows-in-three-js/28874)
- [three.js 포럼: 라이트 프로브](https://discourse.threejs.org/t/threejs-light-probes/55981)

## 조명 굽기 (2026-11-10)

실내가 사실적으로 보이는 핵심은 간접광입니다. 실시간으로는 이 PC(내장 그래픽)에서 감당이 안 되므로 미리 계산해 둡니다.

```
node tools/build_factory_shell.mjs   # 건물 치수·구조를 바꿨을 때
node tools/bake_lightmap.mjs         # 약 2분. --texel 60 --size 4096 으로 더 세밀하게
```

- 결과 `assets/lightmap/`이 있으면 뷰어가 자동으로 씁니다. 지우면 예전 실시간 조명으로 돌아갑니다.
- 밝기는 `viewer/visual_upgrade.js`의 `BAKED.gain`, 기계 그림자 진하기는 `BAKED.shadowOpacity`.
- 바닥 얼룩·벽 물때를 빼려면 `--no-grunge`.
