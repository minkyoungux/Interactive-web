# Local MediaPipe assets

- `face_landmarker.task` / `hand_landmarker.task`: copied from the project's existing `public/lemonade/mediapipe` models.
- `vision_wasm_*`: copied from the installed `@mediapipe/tasks-vision` 1.0.1 package. Keep JS and WASM paired with the installed package version.
- SIMD, non-SIMD and module-worker loaders are retained; existing examples also use this directory.
- `pose_landmarker_lite.task`: Google MediaPipe Pose Lite float16 v1, for settlement body landmarks.
- `interactive_segmentation.task`: Google MediaPipe MagicTouch v2 int8 v1, for extracting a reference subject. See `docs/season-forest-settlement.md` for source URLs and scope.

DoodleFace loads these same-origin assets through `/mediapipe`, without a CDN. Its HTML restricts connections to the same origin, including blocking the runtime's external telemetry endpoint. MediaPipe package license: Apache-2.0.
