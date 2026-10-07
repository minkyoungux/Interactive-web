/// <reference lib="webworker" />
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { mouthOpenness } from './little-universe-core'
const scope = self as unknown as DedicatedWorkerGlobalScope
let model: FaceLandmarker | null = null
scope.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const vision = await FilesetResolver.forVisionTasks(`${data.origin}/mediapipe`, true)
      const runtime = await import(/* @vite-ignore */ vision.wasmLoaderPath)
      ;(scope as unknown as { ModuleFactory: unknown }).ModuleFactory = runtime.default
      model = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `${data.origin}/mediapipe/face_landmarker.task`, delegate: 'CPU' },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
        minFaceDetectionConfidence: .5, minFacePresenceConfidence: .5, minTrackingConfidence: .5,
      })
      scope.postMessage({ type: 'ready' })
    } else if (data.type === 'frame') {
      try {
        const result = model!.detectForVideo(data.bitmap, data.time)
        const scores = result.faceBlendshapes[0]?.categories ?? []
        scope.postMessage({ type: 'face', points: result.faceLandmarks[0] ?? [],
          mouth: mouthOpenness(result.faceLandmarks[0] ?? [], data.bitmap.width / data.bitmap.height,
            scores.find(s => s.categoryName === 'jawOpen')?.score ?? 0),
          time: data.time,
        })
      } finally { data.bitmap.close() }
    } else if (data.type === 'close') { model?.close(); model = null; scope.close() }
  } catch (error) {
    model?.close(); model = null
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
