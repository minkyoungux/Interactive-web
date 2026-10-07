# Shampoo runtime assets

`selfie_segmenter.tflite` is Google's MediaPipe SelfieSegmenter float16 version 1:
https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite

Its embedded `labels.txt` contains one label, `selfie`. It is a single foreground confidence channel.
SHA-256: `191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b`.

`mediapipe/vision_wasm_module_internal.{js,wasm}` were copied without modification from the installed `@mediapipe/tasks-vision@1.0.1` package (Apache-2.0). They are the module-worker variant, separate from the existing examples' classic WASM loaders.

Face/hand models are reused from `/lemonade/mediapipe/`. No camera frames are uploaded. See `docs/shampoo.md` for lifecycle, scheduling, tests and limitations.
