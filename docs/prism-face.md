# PRISM FACE

`npm run dev` 실행 후 `/prism-face.html` 또는 홈의 **16 · Prism Face** 탭에서 열기.

- **카메라 켜기**: 권한을 허용하고 정면을 바라보세요. 시작할 때의 얼굴 방향을 정면 기준으로 잡습니다.
- 좌우로 얼굴을 돌리면 회전 각도와 속도에 따라 입자가 흩어지고 무지갯빛 실선이 늘어납니다. 정면으로 돌아오면 스프링 운동으로 다시 모입니다.
- **흩어짐**, **무지갯빛** 슬라이더로 반응과 색을 조절합니다.
- **다시 모으기**: 입자 운동을 초기화하고 현재 얼굴 방향을 정면으로 다시 설정합니다.
- 카메라 없이 드래그하거나 캔버스에 포커스하고 좌우 방향키로 미리보기를 회전할 수 있습니다. 드래그를 놓거나 Escape를 누르면 다시 모입니다.

MediaPipe Face Landmarker는 별도 Web Worker에서 약 25fps로 추론합니다. 얼굴의 468개 점을 canonical mesh의 898개 삼각형으로 연결하고 면적에 비례한 층화 샘플링과 저불일치 수열로 얼굴 전체를 고르게 채웁니다. 데스크톱에서는 120,000개, 모바일에서는 60,000개의 미세 입자를 사용합니다. 표면을 덮는 막이나 얼굴 Mesh는 렌더링하지 않습니다. 실시간 표면 법선에 따른 입자 명암, 입자 자체의 무지갯빛, 빛의 실선과 bloom을 Three.js로 렌더링합니다. 영상과 입자에 동일한 좌우 반전 및 cover 투영을 적용합니다.

WASM, 모델, 얼굴 데이터는 로컬 `public` 파일을 사용합니다. 영상은 서버로 전송하지 않습니다. 카메라 끄기, 페이지 종료, 홈의 다른 실험으로 이동할 때 영상 트랙과 Worker를 종료합니다. 숨겨진 탭에서는 렌더링과 추론을 멈추고 카메라 트랙을 비활성화합니다.

## 얼굴 데이터 출처

`public/prism-face/canonical-face.json`은 Google MediaPipe의 [canonical_face_model.obj](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj)에서 정점, UV, 삼각형 인덱스를 추출한 데이터입니다. 원본은 [Apache License 2.0](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE)으로 제공됩니다. Copyright 2019 The MediaPipe Authors.

## 확인

- `npx tsc --noEmit`
- `node tests/prism-face-browser.cjs` (Chrome 및 기존 브라우저 테스트와 동일한 Playwright 설치 필요)

현재 전체 프로젝트의 `npm run build`는 기존 `doodleface.html`이 참조하는 `src/doodleface.ts`가 없어 실패합니다. Prism Face 엔트리의 독립 Vite 빌드는 확인했습니다.
