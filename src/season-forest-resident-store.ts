import { makeReferenceResident } from './season-forest-resident-shape'
import type { BodyPoint } from './season-forest-resident-vision'
import { makeVillager, type VillagerDesign } from './season-forest-villager'

export type ResidentModel = { root: THREE.Group; appearance: { shape: HTMLCanvasElement; texture: HTMLCanvasElement; humanoid: boolean; fur: string; targetPose: BodyPoint[]; design?: VillagerDesign }; updateTexture(): void; walk(time: number, walking: boolean): void; dispose(): void }
import type * as THREE from 'three'
export type AppearanceRecord = { shape: Blob; texture: Blob; humanoid: boolean; fur: string; targetPose: BodyPoint[]; design?: VillagerDesign }
export type ResidentRecord = {
  version: 1; id: string; name: string; island: number; x: number; y: number
  conversation: { who: 'me' | 'resident'; text: string }[]; appearance: AppearanceRecord
}
const png = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('이미지를 저장하지 못했어요.')), 'image/png'))
export async function snapshotAppearance(model: ResidentModel): Promise<AppearanceRecord> {
  const a = model.appearance
  // Invoke both encoders before yielding so one snapshot cannot mix two edits.
  const [shape, texture] = await Promise.all([png(a.shape), png(a.texture)])
  return { shape, texture, humanoid: a.humanoid, fur: a.fur, targetPose: a.targetPose, design: a.design }
}
async function canvasFrom(blob: Blob) {
  if (!(blob instanceof Blob) || blob.size > 8 * 1024 * 1024) throw new Error('저장된 주민 이미지가 올바르지 않아요.')
  const image = await createImageBitmap(blob)
  try {
    if (image.width < 1 || image.height < 1 || image.width > 1024 || image.height > 1024) throw new Error('주민 이미지 크기가 올바르지 않아요.')
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    canvas.getContext('2d')!.drawImage(image, 0, 0); return canvas
  } finally { image.close() }
}
export async function restoreResident(record: ResidentRecord) {
  if (record.version !== 1 || typeof record.id !== 'string' || typeof record.name !== 'string' || ![record.x, record.y, record.island].every(Number.isFinite)) throw new Error('저장된 주민 형식을 읽지 못했어요.')
  const a = record.appearance, [shape, texture] = await Promise.all([canvasFrom(a.shape), canvasFrom(a.texture)])
  if (a.design) return makeVillager(a.design, undefined, texture)
  return makeReferenceResident({ shape, texture, humanoid: !!a.humanoid, targetPose: Array.isArray(a.targetPose) ? a.targetPose : [], style: { fur: /^#[0-9a-f]{6}$/i.test(a.fur) ? a.fur : '#cab89a' }, photos: { whole: texture, wholeAspect: 1, arms: [], hands: [], legs: [] } })
}

/** All writes are ordered, including deletion, so an older autosave cannot resurrect an evicted resident. */
export class ResidentStore {
  private database: Promise<IDBDatabase>
  private queue: Promise<unknown> = Promise.resolve()
  constructor() {
    this.database = new Promise((resolve, reject) => {
      const request = indexedDB.open('little-world-residents', 2)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('residents')) request.result.createObjectStore('residents', { keyPath: 'id' })
        if (!request.result.objectStoreNames.contains('settings')) request.result.createObjectStore('settings')
      }
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result) }
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('다른 탭이 주민 저장소를 사용 중이에요.'))
    })
    void this.database.catch(() => {})
  }
  async all(): Promise<ResidentRecord[]> {
    const db = await this.database
    return new Promise((resolve, reject) => { const request = db.transaction('residents').objectStore('residents').getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) })
  }
  private write(action: (store: IDBObjectStore) => void) {
    const work = this.queue.catch(() => {}).then(async () => {
      const db = await this.database
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('residents', 'readwrite')
        transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error)
        action(transaction.objectStore('residents'))
      })
    })
    this.queue = work; return work
  }
  put(record: ResidentRecord) { return this.write(store => { store.put(record) }) }
  async communitySeeded() {
    const db = await this.database
    return new Promise<boolean>((resolve, reject) => { const r = db.transaction('settings').objectStore('settings').get('community-v1'); r.onsuccess = () => resolve(!!r.result); r.onerror = () => reject(r.error) })
  }
  async markCommunitySeeded() {
    const db = await this.database
    await new Promise<void>((resolve, reject) => { const t = db.transaction('settings', 'readwrite'); t.objectStore('settings').put(true, 'community-v1'); t.oncomplete = () => resolve(); t.onerror = () => reject(t.error) })
  }
  remove(id: string) { return this.write(store => { store.delete(id) }) }
  close() { void this.queue.catch(() => {}).then(() => this.database).then(db => db.close()).catch(() => {}) }
}
