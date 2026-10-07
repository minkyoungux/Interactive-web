export type BodyPoint = { x: number; y: number; visibility?: number }
export type MaskData = { data: Float32Array; width: number; height: number }
export type ResidentAnalysis = { human: MaskData; sourcePose: BodyPoint[]; object?: MaskData; targetPose: BodyPoint[] }
export type ResidentVisionRequest = { type: 'init'; origin: string } | { type: 'analyze'; id: number; person: ImageBitmap; reference: ImageBitmap; transparent: boolean; seed: { x: number; y: number } }
export type ResidentVisionReply = { type: 'ready' } | { type: 'result'; id: number; result: ResidentAnalysis } | { type: 'error'; id?: number; message: string }

export class ResidentVision {
  private worker?: Worker
  private ready?: Promise<void>
  private rejectReady?: (error: Error) => void
  private pending = new Map<number, { resolve: (value: ResidentAnalysis) => void; reject: (error: Error) => void }>()
  private next = 0
  private timeout?: ReturnType<typeof setTimeout>
  start() {
    if (this.ready) return this.ready
    const worker = this.worker = new Worker(new URL('./season-forest-resident-worker.ts', import.meta.url), { type: 'module' })
    this.ready = new Promise<void>((resolve, reject) => {
      this.rejectReady = reject
      this.timeout = setTimeout(() => this.fail(new Error('인식 모델을 준비하는 데 시간이 오래 걸려요. 다시 시도해주세요.')), 60000)
      worker.onmessage = ({ data }: MessageEvent<ResidentVisionReply>) => {
        if (data.type === 'ready') { clearTimeout(this.timeout); this.rejectReady = undefined; resolve() }
        else if (data.type === 'error') this.fail(new Error(data.message))
        else { this.pending.get(data.id)?.resolve(data.result); this.pending.delete(data.id) }
      }
      worker.onerror = () => this.fail(new Error('이미지 인식 모델을 불러오지 못했어요. 다시 시도해주세요.'))
      worker.postMessage({ type: 'init', origin: new URL(import.meta.env.BASE_URL, location.origin).href.replace(/\/$/, '') } satisfies ResidentVisionRequest)
    })
    return this.ready
  }
  private fail(error: Error) {
    clearTimeout(this.timeout); this.rejectReady?.(error); this.rejectReady = undefined
    this.pending.forEach(p => p.reject(error)); this.pending.clear()
    this.worker?.terminate(); this.worker = undefined; this.ready = undefined
  }
  async analyze(person: HTMLCanvasElement, reference: HTMLCanvasElement, transparent: boolean, seed: { x: number; y: number }) {
    await this.start()
    const worker = this.worker
    if (!worker) throw new Error('인식 작업이 취소되었어요.')
    const personBitmap = await createImageBitmap(person)
    let referenceBitmap: ImageBitmap
    try { referenceBitmap = await createImageBitmap(reference) } catch (error) { personBitmap.close(); throw error }
    if (this.worker !== worker) { personBitmap.close(); referenceBitmap.close(); throw new Error('인식 작업이 취소되었어요.') }
    const id = ++this.next
    return new Promise<ResidentAnalysis>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      worker.postMessage({ type: 'analyze', id, person: personBitmap, reference: referenceBitmap, transparent, seed } satisfies ResidentVisionRequest, [personBitmap, referenceBitmap])
    })
  }
  dispose() { this.fail(new Error('입주 작업이 취소되었어요.')) }
}
