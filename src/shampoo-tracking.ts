export type Landmark = { x: number; y: number; z?: number }
export type HandSide = 'left' | 'right'
// Inference receives the unmirrored camera frame; the MediaPipe hand model
// assumes selfie-mirrored input when reporting handedness.
export function cameraHandSide(label: string): HandSide | null {
  return label.toLowerCase() === 'right' ? 'left' : label.toLowerCase() === 'left' ? 'right' : null
}
export type WorkerRequest =
  | { type: 'init'; role: 'hands' | 'human'; origin: string }
  | { type: 'frame'; bitmap: ImageBitmap; time: number; segment?: boolean }
  | { type: 'close' }
export type WorkerReply =
  | { type: 'ready' }
  | { type: 'closed' }
  | { type: 'error'; message: string }
  | { type: 'hands'; hands: Landmark[][]; time: number; sides?: { side: HandSide | null; score: number }[] }
  | { type: 'human'; face: Landmark[]; time: number; mask?: { data: Float32Array; width: number; height: number } }
