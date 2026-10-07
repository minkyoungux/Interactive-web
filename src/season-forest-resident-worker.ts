/// <reference lib="webworker" />
import { FilesetResolver, ImageSegmenter, PoseLandmarker, InteractiveSegmenter } from '@mediapipe/tasks-vision'
import type { MaskData, ResidentVisionReply, ResidentVisionRequest } from './season-forest-resident-vision'
const scope = self as unknown as DedicatedWorkerGlobalScope
let human: ImageSegmenter | undefined, pose: PoseLandmarker | undefined, object: InteractiveSegmenter | undefined
let humanIndex = 0
const send = (value: ResidentVisionReply, transfer: Transferable[] = []) => scope.postMessage(value, transfer)
scope.onmessage = async ({ data }: MessageEvent<ResidentVisionRequest>) => {
  try {
    if (data.type === 'init') {
      const fileset = await FilesetResolver.forVisionTasks(`${data.origin}/mediapipe`, true)
      const runtime = await import(/* @vite-ignore */ fileset.wasmLoaderPath)
      const wasmScope = scope as unknown as { ModuleFactory: unknown }
      wasmScope.ModuleFactory = runtime.default
      human = await ImageSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: `${data.origin}/shampoo/selfie_segmenter.tflite`, delegate: 'CPU' }, runningMode: 'IMAGE', outputConfidenceMasks: true })
      humanIndex = human.getLabels().findIndex(label => label.toLowerCase() === 'selfie')
      if (humanIndex < 0) throw new Error('사람 영역 분리 모델의 출력이 올바르지 않아요.')
      wasmScope.ModuleFactory = runtime.default
      pose = await PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: `${data.origin}/mediapipe/pose_landmarker_lite.task`, delegate: 'CPU' }, runningMode: 'IMAGE', numPoses: 1, minPoseDetectionConfidence: .35, minPosePresenceConfidence: .35 })
      wasmScope.ModuleFactory = runtime.default
      object = await InteractiveSegmenter.createFromOptions(fileset, { baseOptions: { modelAssetPath: `${data.origin}/mediapipe/interactive_segmentation.task`, delegate: 'CPU' } })
      send({ type: 'ready' })
    } else {
      if (!human || !pose || !object) throw new Error('인식 모델이 아직 준비되지 않았어요.')
      try {
        let mask!: MaskData
        human.segment(data.person, result => {
          const m = result.confidenceMasks?.[humanIndex]
          if (!m) throw new Error('사진에서 사람을 분리하지 못했어요.')
          mask = { data: new Float32Array(m.getAsFloat32Array()), width: m.width, height: m.height }
        })
        const personPose = pose.detect(data.person), sourcePose = personPose.landmarks[0] ?? []
        personPose.close()
        const refPose = pose.detect(data.reference), targetPose = refPose.landmarks[0] ?? []
        refPose.close()
        let objectMask: MaskData | undefined
        if (!data.transparent) {
          const humanReference = [11, 12, 23, 24].every(i => (targetPose[i]?.visibility ?? 0) > .6)
          if (humanReference) {
            human.segment(data.reference, result => {
              const m = result.confidenceMasks?.[humanIndex]
              if (m) objectMask = { data: new Float32Array(m.getAsFloat32Array()), width: m.width, height: m.height }
            })
          } else {
            object.setImage(data.reference)
            // 1 = POSITIVE. The installed runtime omits the BrushMode enum export.
            const result = object.segment([{ brushMode: 1, point: [data.seed], isCompleted: true }])
            objectMask = { data: new Float32Array(result.getAsFloat32Array()), width: result.width, height: result.height }
            result.close()
          }
        }
        send({ type: 'result', id: data.id, result: { human: mask, sourcePose, targetPose, object: objectMask } }, [mask.data.buffer, ...(objectMask ? [objectMask.data.buffer] : [])])
      } finally { data.person.close(); data.reference.close() }
    }
  } catch (error) {
    send({ type: 'error', id: data.type === 'analyze' ? data.id : undefined, message: error instanceof Error ? error.message : '이미지 인식에 실패했어요.' })
  }
}
