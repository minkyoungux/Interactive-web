import * as THREE from 'three'
import type { BodyPoint, MaskData, ResidentAnalysis } from './season-forest-resident-vision'
import { type ToyStyle } from './season-forest-resident-style'
import { makePhotoSurfaces, type PhotoSurfaces } from './season-forest-resident-photo'

import { makeVillager, type Species } from './season-forest-villager'

type Bounds = { x: number; y: number; width: number; height: number }
export type ResidentAssets = { shape: HTMLCanvasElement; humanoid: boolean; style: ToyStyle; photos: PhotoSurfaces; targetPose?: BodyPoint[] }
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))
function confidence(mask: MaskData, x: number, y: number) {
  return mask.data[Math.min(mask.height - 1, Math.floor(clamp(y) * mask.height)) * mask.width + Math.min(mask.width - 1, Math.floor(clamp(x) * mask.width))]
}
function bounds(data: Uint8ClampedArray, width: number, height: number): Bounds {
  let x0 = width, x1 = 0, y0 = height, y1 = 0, count = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 160) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); count++
  }
  if (count < 80 || x1 - x0 < 6 || y1 - y0 < 6) throw new Error('형체를 찾지 못했어요. 한 대상이 선명하게 보이는 이미지로 다시 시도해주세요.')
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}
const visible = (p?: BodyPoint) => !!p && (p.visibility ?? 1) > .45 && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1

/** HumanSeg supplies real photographic pixels; landmarks separate the body surfaces. */
export function buildResidentAssets(reference: HTMLCanvasElement, person: HTMLCanvasElement, analysis: ResidentAnalysis): ResidentAssets {
  const ref = reference.getContext('2d')!.getImageData(0, 0, reference.width, reference.height)
  if (analysis.object) for (let y = 0; y < reference.height; y++) for (let x = 0; x < reference.width; x++) {
    const i = (y * reference.width + x) * 4
    ref.data[i + 3] = Math.round(ref.data[i + 3] * clamp((confidence(analysis.object, x / reference.width, y / reference.height) - .4) * 5))
  }
  const rb = bounds(ref.data, reference.width, reference.height)
  const cutout = document.createElement('canvas'); cutout.width = reference.width; cutout.height = reference.height; cutout.getContext('2d')!.putImageData(ref, 0, 0)
  const shape = document.createElement('canvas'), ratio = 384 / Math.max(rb.width, rb.height)
  shape.width = Math.max(12, Math.round(rb.width * ratio)); shape.height = Math.max(12, Math.round(rb.height * ratio))
  shape.getContext('2d')!.drawImage(cutout, rb.x, rb.y, rb.width, rb.height, 0, 0, shape.width, shape.height)
  const shapePixels = shape.getContext('2d')!.getImageData(0, 0, shape.width, shape.height)
  const w = person.width, h = person.height, photo = person.getContext('2d')!.getImageData(0, 0, w, h)
  let count = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, inside = confidence(analysis.human, x / w, y / h) > .72
    if (inside) count++
    photo.data[i * 4 + 3] = inside ? 255 : 0
  }
  if (count < w * h * .012) throw new Error('촬영된 화면에서 사람을 찾지 못했어요. 밝은 곳에서 얼굴과 상체를 보여주세요.')
  const pb = bounds(photo.data, w, h)
  const target = analysis.targetPose.map(p => ({ ...p, x: (p.x * reference.width - rb.x) / rb.width, y: (p.y * reference.height - rb.y) / rb.height }))
  const source = analysis.sourcePose, poseFound = [11, 12, 23, 24].every(i => visible(target[i]))
  let feetRows = 0
  for (const fraction of [.86, .90, .94]) {
    let runs = 0, active = false
    const row = Math.floor(shape.height * fraction)
    for (let x = 0; x < shape.width; x++) { const inside = shapePixels.data[(row * shape.width + x) * 4 + 3] > 160; if (inside && !active) runs++; active = inside }
    if (runs === 2) feetRows++
  }
  const humanoid = poseFound || (feetRows >= 2 && rb.height / rb.width > 1.05)
  const rowWidth = (v: number) => {
    const y = Math.floor(v * (shape.height - 1)); let left = shape.width, right = 0
    for (let x = 0; x < shape.width; x++) if (shapePixels.data[(y * shape.width + x) * 4 + 3] > 160) { left = Math.min(left, x); right = Math.max(right, x) }
    return Math.max(0, right - left) / shape.width
  }
  const headRect = (() => {
    if (visible(source[0]) && visible(source[7]) && visible(source[8])) {
      const width = Math.max(.09, Math.abs(source[7].x - source[8].x) * 1.6)
      return { x: source[0].x - width / 2, y: source[0].y - width * .65, width, height: width * 1.35 }
    }
    return { x: pb.x / w, y: pb.y / h, width: pb.width / w, height: pb.height / h * .32 }
  })()
  // Base colours cover unseen surfaces; the visible front receives the actual photograph.
  function palette(data: Uint8ClampedArray, width: number, height: number, box: Bounds, fallback: string) {
    const bins = new Map<number, { n: number; r: number; g: number; b: number }>()
    for (let y = Math.max(0, Math.floor(box.y * height)); y < Math.min(height, (box.y + box.height) * height); y += 2) for (let x = Math.max(0, Math.floor(box.x * width)); x < Math.min(width, (box.x + box.width) * width); x += 2) {
      const i = (y * width + x) * 4; if (data[i + 3] < 180) continue
      const r = data[i], g = data[i + 1], b = data[i + 2], key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5)
      const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }; bin.n++; bin.r += r; bin.g += g; bin.b += b; bins.set(key, bin)
    }
    const best = [...bins.values()].sort((a, b) => b.n - a.n)[0]
    if (!best) return fallback
    const color = new THREE.Color(`rgb(${Math.round(best.r / best.n)},${Math.round(best.g / best.n)},${Math.round(best.b / best.n)})`)
    const hsl = { h: 0, s: 0, l: 0 }; color.getHSL(hsl)
    color.setHSL(hsl.h, Math.min(.65, hsl.s), clamp(hsl.l, .15, .83))
    return `#${color.getHexString()}`
  }
  let earJoin = 0
  for (let v = .04; v < .36; v += .02) {
    let runs = 0, active = false
    const y = Math.floor(v * shape.height)
    for (let x = 0; x < shape.width; x++) { const on = shapePixels.data[(y * shape.width + x) * 4 + 3] > 160; if (on && !active) runs++; active = on }
    if (runs === 2) earJoin = v
  }
  const torso = [11, 12, 23, 24].every(i => visible(source[i])) ? {
    x: Math.min(source[11].x, source[12].x), y: Math.min(source[11].y, source[12].y),
    width: Math.abs(source[11].x - source[12].x), height: Math.max(.05, (source[23].y + source[24].y - source[11].y - source[12].y) / 2),
  } : { x: pb.x / w, y: (pb.y + pb.height * .35) / h, width: pb.width / w, height: pb.height / h * .35 }
  const kind: ToyStyle['kind'] = poseFound ? 'human' : earJoin > .18 ? 'long-ear' : earJoin > .04 ? (rowWidth(.04) < rowWidth(.12) * .63 ? 'point-ear' : 'round-ear') : humanoid ? 'floppy-ear' : 'object'
  const style: ToyStyle = {
    kind,
    fur: palette(shapePixels.data, shape.width, shape.height, { x: .12, y: .13, width: .76, height: .36 }, '#e1be8b'),
    skin: palette(photo.data, w, h, headRect, '#e7b895'),
    hair: palette(photo.data, w, h, { ...headRect, height: headRect.height * .35 }, '#685647'),
    shirt: palette(photo.data, w, h, torso, '#79a996'),
    accent: palette(shapePixels.data, shape.width, shape.height, { x: .2, y: .55, width: .6, height: .24 }, '#dca56f'),
    headWidth: clamp(.35 + (rb.width / rb.height) * .06, .37, .44), headHeight: kind === 'long-ear' ? .30 : .33,
    earLength: clamp(earJoin / .34),
  }
  const photos = makePhotoSurfaces(person, analysis)
  if (kind !== 'object' && !photos.face && !photos.torso) throw new Error('사람은 찾았지만 얼굴과 몸의 위치를 맞추지 못했어요. 정면을 보고 얼굴과 상체가 나오게 다시 촬영해주세요.')
  return { shape, humanoid, style, photos, targetPose: target }
}

/** Reference suggests ears/colours; camera supplies texture, never the body silhouette. */
export function makeImageResident(assets: ResidentAssets, species: Species = 'rabbit') {
  return makeVillager({ species, color: assets.style.fur, shirt: assets.style.shirt, variant: 0, personal: true, personality: 'gentle' }, assets.photos)
}
