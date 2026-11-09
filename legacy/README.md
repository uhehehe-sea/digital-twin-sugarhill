# legacy/ — 실행 대상 아님 (보존용)

`viewer_oneoff/`는 이전 에이전트들이 `index_v2.html` / `editor_v2.js`를 문자열 치환으로 고치거나 상태를 확인하려고 만든
1회성 스크립트 78개입니다(`apply_*`, `fix_*`, `check_*`, `inspect_*`, `print_*`, `patch_*`, `rebuild_v2_clean.mjs`, `server_v1_backup.mjs` 등).

- 2026-11-09 정리 때 `viewer/`에서 이리로 옮겼습니다. 서버·테스트·화면은 이 폴더의 어떤 파일도 불러오지 않습니다.
- 원래 작성자 컴퓨터의 절대경로(개인 사용자명 포함)는 `(process.env.TWIN_ROOT || '.')` 또는 `<project-root>`로 바꿨습니다.
- **다시 실행하지 마세요.** 대부분 현재 `index_v2.html`/`editor_v2.js`에 이미 반영됐거나, 특정 시점의 줄 번호·문자열을 전제로 작성돼 지금 실행하면 파일을 망가뜨릴 수 있습니다.
- 필요 없다고 판단되면 이 폴더째 삭제해도 트윈 동작에는 영향이 없습니다.
