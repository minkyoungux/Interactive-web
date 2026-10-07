import * as THREE from 'three'
import type { BodyPoint, ResidentAnalysis } from './season-forest-resident-vision'

export type PhotoSurfaces = {
  face?: HTMLCanvasElement; torso?: HTMLCanvasElement
  arms: (HTMLCanvasElement | undefined)[]; hands: (HTMLCanvasElement | undefined)[]
  legs: (HTMLCanvasElement | undefined)[]; whole: HTMLCanvasElement; wholeAspect: number
}
const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n))

/** Every visible texel comes from the captured photograph AND the HumanSeg interior. */
export function makePhotoSurfaces(person: HTMLCanvasElement, analysis: ResidentAnalysis): PhotoSurfaces {
  const w = person.width, h = person.height, src = person.getContext('2d')!.getImageData(0, 0, w, h)
  const mask = analysis.human, points = analysis.sourcePose
  const valid = (p?: BodyPoint) => !!p && (p.visibility ?? 1) > .5 && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1
  const pixel = (i: number) => ({ x: points[i].x * w, y: points[i].y * h })
  const confidence = (x: number, y: number) => mask.data[Math.min(mask.height - 1, Math.floor(y / h * mask.height)) * mask.width + Math.min(mask.width - 1, Math.floor(x / w * mask.width))]
  function crop(sample: (u: number, v: number) => { x: number; y: number }, ellipse = false) {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256
    const ctx = canvas.getContext('2d')!, out = ctx.createImageData(256, 256)
    let covered = 0
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const u = (x + .5) / 256, v = (y + .5) / 256, p = sample(u, v)
      const sx = Math.floor(p.x), sy = Math.floor(p.y)
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue
      const c = confidence(sx, sy)
      if (c <= .72) continue
      const edge = ellipse ? clamp((1 - Math.hypot((u - .5) / .5, (v - .5) / .5)) / .10) : clamp(Math.min(u, v, 1 - u, 1 - v) / .045)
      const alpha = Math.round(255 * clamp((c - .72) / .16) * edge)
      if (!alpha) continue
      const from = (sy * w + sx) * 4, to = (y * 256 + x) * 4
      out.data[to] = src.data[from]; out.data[to + 1] = src.data[from + 1]; out.data[to + 2] = src.data[from + 2]; out.data[to + 3] = alpha
      covered++
    }
    ctx.putImageData(out, 0, 0)
    return covered > 256 * 256 * .015 ? canvas : undefined
  }
  let x0 = w, x1 = 0, y0 = h, y1 = 0
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (confidence(x, y) > .72) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  const whole = crop((u, v) => ({ x: x0 + u * (x1 - x0), y: y0 + v * (y1 - y0) }))
  if (!whole) throw new Error('사진에서 사람 영역을 찾지 못했어요. 밝은 곳에서 다시 촬영해주세요.')
  let face: HTMLCanvasElement | undefined, torso: HTMLCanvasElement | undefined
  if ([0, 2, 5].every(i => valid(points[i]))) {
    const nose = pixel(0), l = pixel(2), r = pixel(5)
    const earSpan = valid(points[7]) && valid(points[8]) ? Math.abs(pixel(7).x - pixel(8).x) : 0
    const width = Math.max(earSpan * 1.5, Math.hypot(l.x - r.x, l.y - r.y) * 2.8, w * .07), height = width * 1.23
    const cx = earSpan > width * .3 ? (pixel(7).x + pixel(8).x) / 2 : nose.x
    face = crop((u, v) => ({ x: cx + (u - .5) * width, y: nose.y + (v - .59) * height }), true)
  }
  const order = valid(points[11]) && valid(points[12]) && points[11].x < points[12].x ? [0, 1] : [1, 0]
  if ([11, 12, 23, 24].every(i => valid(points[i]))) {
    const [a, b] = order, L = pixel(11 + a), R = pixel(11 + b), H = pixel(23 + a), J = pixel(23 + b)
    torso = crop((u, v) => ({ x: (L.x * (1 - u) + R.x * u) * (1 - v) + (H.x * (1 - u) + J.x * u) * v, y: (L.y * (1 - u) + R.y * u) * (1 - v) + (H.y * (1 - u) + J.y * u) * v }))
  }
  function limb(indices: number[], ratio: number) {
    if (!indices.every(i => valid(points[i]))) return undefined
    const chain = indices.map(pixel)
    const lengths = chain.slice(1).map((p, i) => Math.hypot(p.x - chain[i].x, p.y - chain[i].y))
    const length = lengths.reduce((a, b) => a + b, 0)
    if (length < 5) return undefined
    return crop((u, v) => {
      let d = v * length, i = 0
      while (i < lengths.length - 1 && d > lengths[i]) d -= lengths[i++]
      const A = chain[i], B = chain[i + 1], len = Math.max(1, lengths[i]), t = d / len
      return { x: A.x + (B.x - A.x) * t - (B.y - A.y) / len * (u - .5) * length * ratio, y: A.y + (B.y - A.y) * t + (B.x - A.x) / len * (u - .5) * length * ratio }
    })
  }
  return { face, torso, whole, wholeAspect: (x1 - x0) / Math.max(1, y1 - y0), arms: order.map(i => limb([11 + i, 13 + i], .65)), hands: order.map(i => limb([13 + i, 15 + i], .60)), legs: order.map(i => limb([23 + i, 25 + i, 27 + i], .35)) }
}

/** Front-only curved decal. Geometry remains the miniature, never the photographed silhouette. */
export function photoSurface(mesh: THREE.Mesh, canvas: HTMLCanvasElement, name: string, sourceAspect?: number) {
  const geometry = mesh.geometry.clone(), pos = geometry.getAttribute('position')
  geometry.computeBoundingBox(); const box = geometry.boundingBox!, size = box.getSize(new THREE.Vector3())
  const uv = new Float32Array(pos.count * 2)
  const aspect = size.x * mesh.scale.x / (size.y * mesh.scale.y) / (sourceAspect ?? 1)
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - box.min.x) / Math.max(.001, size.x), v = (pos.getY(i) - box.min.y) / Math.max(.001, size.y)
    uv[i * 2] = .5 + (u - .5) * (sourceAspect ? Math.max(1, aspect) : 1)
    uv[i * 2 + 1] = .5 + (v - .5) * (sourceAspect ? Math.max(1, 1 / aspect) : 1)
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  const old = geometry.getIndex(), count = old ? old.count : pos.count, indices: number[] = []
  for (let i = 0; i < count; i += 3) {
    const a = old ? old.getX(i) : i, b = old ? old.getX(i + 1) : i + 1, c = old ? old.getX(i + 2) : i + 2
    if (Math.min(pos.getZ(a), pos.getZ(b), pos.getZ(c)) >= -.001) indices.push(a, b, c)
  }
  geometry.setIndex(indices)
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace
  // Zero-alpha edges prevent clamp-to-edge from extending the portrait outside its crop.
  map.generateMipmaps = false; map.minFilter = THREE.LinearFilter
  const material = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: .92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  const overlay = new THREE.Mesh(geometry, material); overlay.name = `humanseg-${name}`
  overlay.position.copy(mesh.position); overlay.quaternion.copy(mesh.quaternion); overlay.scale.copy(mesh.scale).multiplyScalar(1.008)
  overlay.position.z += .001; overlay.renderOrder = 2; mesh.parent!.add(overlay)
  return () => { overlay.removeFromParent(); geometry.dispose(); material.dispose(); map.dispose() }
}
