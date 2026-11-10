# assets/ — 조명 · 표면 텍스처 · 모델

`/v2` 화면이 `/assets/…` 경로로 읽는 파일들입니다. 없으면 화면은 이전 방식(텍스처 없는 재질)으로 그대로 뜹니다.

```
assets/
  hdri/empty_warehouse_01_2k.hdr      조명용 HDRI
  surfaces/manifest.json              어느 부재에 어느 텍스처를 입힐지
  surfaces/<세트>/diff.jpg nor.jpg arm.jpg
  models/factory_building.glb         건물 glTF (node tools/build_building_gltf.mjs 로 다시 생성)
```

## 지금 들어 있는 것 (2026-11-09)

모두 **Poly Haven** (https://polyhaven.com) 에서 받은 **CC0** 자료입니다. 출처 표기 의무가 없고 재배포할 수 있습니다.
Megascans를 받을 Fab 로그인이 없어서 임시로 넣은 것이며, 아래 "Megascans로 바꾸기" 대로 교체할 수 있습니다.

| 파일 | Poly Haven 이름 | 쓰이는 곳 |
|---|---|---|
| `hdri/empty_warehouse_01_2k.hdr` (6.6 MB) | Empty Warehouse 01, 2K | 장면 전체 조명·반사 |
| `surfaces/concrete_floor_worn_001/` | Concrete Floor Worn 001, 1K | 바닥 슬래브, 메자닌 슬래브 |
| `surfaces/corrugated_iron/` | Corrugated Iron, 1K | 외벽, 지붕 박공, 내부 라이너 패널 |
| `surfaces/white_plaster_02/` | White Plaster 02, 1K | 계단 벽, 화장실 벽, 사무실 벽 |
| `surfaces/plywood/` | Plywood, 1K | 합판 백보드, 목재 난간, 사무실 문 |
| `surfaces/metal_plate/` | Metal Plate, 1K | 계단 디딤판, 계단참 |

## 텍스처 세트 형식

폴더 하나에 파일 세 개:

| 파일 | 내용 | 색 공간 |
|---|---|---|
| `diff.jpg` | 기본 색 (Albedo / Base Color) | sRGB |
| `nor.jpg` | 노멀 맵, **OpenGL 방식**(초록 채널이 위쪽) | 선형 |
| `arm.jpg` | R = 앰비언트 오클루전, G = 거칠기, B = 금속성 | 선형 |

`arm.jpg`는 언리얼의 ORM 패킹과 같은 순서입니다.

## Megascans로 바꾸기

Megascans는 2026-11-05부터 Fab에서 무료이고, Fab 표준 라이선스로 어떤 엔진·도구에서도 쓸 수 있습니다.
Fab 로그인이 필요해서 Claude가 대신 받을 수 없었습니다. **Epic 계정으로 로그인한 사람이 받아 주세요.**

1. https://www.fab.com/sellers/Quixel%20Megascans 에서 로그인 → 아래 표의 검색어로 찾아 "라이브러리에 추가" → 다운로드.
   - 품질은 **2K** (웹 화면에는 충분, 4K는 파일이 4배).
   - 형식은 텍스처 JPG. 맵은 Base Color, Normal(**OpenGL**), 그리고 ORM(또는 AO·Roughness·Metalness 따로).
2. `assets/surfaces/<새 폴더>/` 에 `diff.jpg`, `nor.jpg`, `arm.jpg` 이름으로 넣습니다.
   - AO·Roughness·Metalness가 따로 왔으면 Claude에게 "ARM으로 합쳐 줘"라고 하면 됩니다.
   - 노멀이 DirectX 방식이면 초록 채널을 뒤집어야 합니다(같이 요청).
3. `surfaces/manifest.json`에서 해당 슬롯의 `"set"`을 새 폴더 이름으로 바꾸고 새로고침.

### 받을 목록

| 우선 | Fab 검색어 (Quixel Megascans 안에서) | 종류 | 넣을 슬롯 | 비고 |
|---|---|---|---|---|
| 1 | `Industrial Concrete Floor` 또는 `Dusty Concrete Floor` | 머티리얼 | `floor` | 화면의 절반이 바닥이라 효과가 가장 큼 |
| 1 | `Corrugated Metal` (Sheet / Panel) | 머티리얼 | `cladding` | 깨끗한 은회색. 녹이 심한 것은 피함 |
| 2 | `Painted Wall` 또는 `Plaster Wall` (white, clean) | 머티리얼 | `interior_walls` | 지금 것은 약간 회색빛 |
| 2 | `Plywood` | 머티리얼 | `wood` | |
| 2 | `Metal Tread Plate` / `Diamond Plate` | 머티리얼 | `tread_plate` | 계단 |
| 3 | `Painted Metal` / `Steel Beam` (grey or white paint) | 머티리얼 | 새 슬롯 `steel` | 기둥·보·중도리용. 슬롯 추가는 요청하면 넣음 |
| 3 | `Floor Stain`, `Oil Leak`, `Tire Marks` | 데칼 | (다음 단계) | 바닥의 깨끗한 CG 느낌 제거. 데칼 표시 기능 구현 필요 |
| 3 | `Wooden Pallet`, `Metal Barrel`, `Cardboard Box`, `Traffic Cone` | 3D | (다음 단계) | FBX/glTF로 받아 설비·비품 라이브러리에 추가 |

Megascans에는 CNC 라우터·선반 같은 **기계 모델이 없습니다.** 기계는 제조사 CAD(STEP)나 Fab의 다른 판매자 모델이 필요합니다.

## 건물 glTF

`models/factory_building.glb` — `factory_precision.obj`에서 만든 표준 glTF입니다 (226개 부재, 미터 단위, Y-up, 부재 이름 유지, UV 포함: 1 UV = 1 m).

- **Blender**: File → Import → glTF 2.0. 조명·AO를 굽거나(베이크) UV를 다듬을 때.
- **Unreal**: 콘텐츠 브라우저로 끌어다 놓기. Megascans 머티리얼을 슬롯 이름(floor, cladding, …)대로 지정.
- 다시 만들기: `node tools/build_building_gltf.mjs`

웹 화면은 아직 OBJ를 읽고 UV를 실행 중에 만듭니다(같은 투영 방식). Blender에서 조명을 구운 glb가 생기면 화면이 그 파일을 읽도록 바꿉니다.
