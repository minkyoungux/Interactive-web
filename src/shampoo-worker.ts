/// <reference lib="webworker" />
import { FaceLandmarker, HandLandmarker, ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision'
import type { WorkerReply, WorkerRequest } from './shampoo-tracking'
import { cameraHandSide } from './shampoo-tracking'
const scope = self as unknown as DedicatedWorkerGlobalScope
let hands: HandLandmarker | undefined
let face: FaceLandmarker | undefined
let humanSeg: ImageSegmenter | undefined
let selfieIndex = -1
let closed = false
const send = (message: WorkerReply, transfer: Transferable[] = []) => scope.postMessage(message, transfer)
function close() {
  closed = true
  hands?.close(); face?.close(); humanSeg?.close()
  hands = undefined; face = undefined; humanSeg = undefined
}
scope.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  if (data.type === 'close') { close(); send({ type: 'closed' }); scope.close(); return }
  if (closed) { if (data.type === 'frame') data.bitmap.close(); return }
  try {
    if (data.type === 'init') {
      // The installed 1.0.1 runtime provides an ES-module WASM loader for module workers.
      const vision = await FilesetResolver.forVisionTasks(`${data.origin}/shampoo/mediapipe`, true)
      const runtime = await import(/* @vite-ignore */ vision.wasmLoaderPath)
      const wasmScope = scope as unknown as { ModuleFactory: unknown }
      // MediaPipe consumes and clears this global after constructing each graph.
      // ES modules are cached, so restore the exported factory before the second graph.
      wasmScope.ModuleFactory = runtime.default
      const model = (name: string) => `${data.origin}/lemonade/mediapipe/${name}_landmarker.task`
      if (closed) return
      if (data.role === 'hands') {
        hands = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: model('hand'), delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2,
          minHandDetectionConfidence: .45, minHandPresenceConfidence: .45, minTrackingConfidence: .45,
        })
      } else {
        face = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: model('face'), delegate: 'CPU' }, runningMode: 'VIDEO', numFaces: 1,
          minFaceDetectionConfidence: .45, minFacePresenceConfidence: .45, minTrackingConfidence: .45,
        })
        if (closed) { close(); return }
        wasmScope.ModuleFactory = runtime.default
        humanSeg = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `${data.origin}/shampoo/selfie_segmenter.tflite`, delegate: 'CPU' },
          runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
        })
        // This model really has ONE confidence channel, labelled "selfie" (not index 1).
        selfieIndex = humanSeg.getLabels().findIndex(label => label.trim().toLowerCase() === 'selfie')
        if (selfieIndex < 0) throw new Error('HumanSeg selfie confidence channel is missing')
      }
      if (closed) { close(); return }
      send({ type: 'ready' })
    } else {
      try {
        if (hands) {
          const result = hands.detectForVideo(data.bitmap, data.time)
          send({ type: 'hands', hands: result.landmarks, time: data.time,
            sides: result.landmarks.map((_, index) => {
              const label = result.handedness[index]?.[0]
              return { side: cameraHandSide(label?.categoryName ?? ''), score: label?.score ?? 0 }
            }),
          })
        }
        else if (face && humanSeg) {
          const landmarks = face.detectForVideo(data.bitmap, data.time).faceLandmarks[0] ?? []
          let mask: Extract<WorkerReply, { type: 'human' }>['mask']
          if (data.segment && landmarks.length) {
            humanSeg.segmentForVideo(data.bitmap, data.time, result => {
              const selfie = result.confidenceMasks?.[selfieIndex]
              if (selfie) mask = { data: new Float32Array(selfie.getAsFloat32Array()), width: selfie.width, height: selfie.height }
              // Callback-owned masks are released by MediaPipe on return; only the copy leaves this worker.
            })
          }
          send({ type: 'human', face: landmarks, mask, time: data.time }, mask ? [mask.data.buffer] : [])
        }
      } finally { data.bitmap.close() }
    }
  } catch (error) {
    close()
    send({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
