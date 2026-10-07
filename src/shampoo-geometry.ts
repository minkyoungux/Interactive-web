import type { Landmark } from './shampoo-tracking'
export type Point = { x: number; y: number }
export type Pose = { center: Point; right: Point; down: Point; scale: number }
export type Anchor = { ids: number[]; weights: number[]; offset: Point }
export type Scalp = { cells: Uint8Array; size: number; bounds: { left: number; top: number; width: number; height: number }; points: { point: Point; normal: Point; edge: boolean; seed: number }[] }
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
export const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export function getPose(face: Point[]): Pose | null {
  if (face.length < 468) return null
  const right = { x: (face[454].x - face[234].x) / 2, y: (face[454].y - face[234].y) / 2 }
  const down = { x: (face[152].x - face[10].x) / 2, y: (face[152].y - face[10].y) / 2 }
  if (Math.abs(right.x * down.y - right.y * down.x) < .0001) return null
  return { center: mix(face[10], face[152], .5), right, down, scale: Math.hypot(right.x, right.y) }
}
export function local(p: Point, pose: Pose): Point {
  const x = p.x - pose.center.x, y = p.y - pose.center.y
  const det = pose.right.x * pose.down.y - pose.right.y * pose.down.x
  return { x: (x * pose.down.y - y * pose.down.x) / det, y: (y * pose.right.x - x * pose.right.y) / det }
}
export function world(p: Point, pose: Pose): Point {
  return { x: pose.center.x + p.x * pose.right.x + p.y * pose.down.x, y: pose.center.y + p.x * pose.right.y + p.y * pose.down.y }
}
export function attach(p: Point, face: Point[], pose: Pose): Anchor {
  const nearest = face.slice(0, 468).map((v, id) => ({ id, d: distance(p, v) })).sort((a, b) => a.d - b.d).slice(0, 4)
  const weights = nearest.map(v => 1 / Math.max(.00001, v.d ** 3))
  const total = weights.reduce((a, b) => a + b, 0)
  weights.forEach((v, i) => { weights[i] = v / total })
  const center = nearest.reduce((p, v, i) => ({ x: p.x + face[v.id].x * weights[i], y: p.y + face[v.id].y * weights[i] }), { x: 0, y: 0 })
  const a = local(p, pose), b = local(center, pose)
  return { ids: nearest.map(v => v.id), weights, offset: { x: a.x - b.x, y: a.y - b.y } }
}
export function resolve(anchor: Anchor, face: Point[], pose: Pose): Point {
  const p = anchor.ids.reduce((p, id, i) => ({ x: p.x + face[id].x * anchor.weights[i], y: p.y + face[id].y * anchor.weights[i] }), { x: 0, y: 0 })
  return { x: p.x + anchor.offset.x * pose.right.x + anchor.offset.y * pose.down.x, y: p.y + anchor.offset.x * pose.right.y + anchor.offset.y * pose.down.y }
}
const foreheadIds = [54, 103, 67, 109, 10, 338, 297, 332, 284]
export function extractScalp(data: Float32Array, width: number, height: number, aspect: number, face: Point[], pose: Pose): Scalp | null {
  if (data.length !== width * height || !data.length) return null
  // Face-local grid moves with the head; its occupied cells come ONLY from the actual selfie mask.
  const forehead = foreheadIds.map(id => local(face[id], pose)).sort((a, b) => a.x - b.x)
  const line = (x: number) => {
    for (let i = 1; i < forehead.length; i++) if (x <= forehead[i].x) {
      const a = forehead[i - 1], b = forehead[i]
      return mix(a, b, Math.max(0, Math.min(1, (x - a.x) / Math.max(.001, b.x - a.x)))).y
    }
    return forehead[forehead.length - 1].y
  }
  // Discover the whole forehead-connected silhouette in mask space first. This
  // lets unusually tall/wide hair expand the grid instead of hitting a preset cap.
  const source = new Uint8Array(data.length)
  let sourceSeed = -1, sourceBest = Infinity
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x, value = data[index]
    if (!Number.isFinite(value) || value < .62 || value > 1) continue
    const p = local({ x: (x + .5) / width, y: (y + .5) / height * aspect }, pose)
    if (p.y > line(p.x) + .035) continue
    source[index] = 1
    const d = p.x ** 2 + (p.y + 1.12) ** 2
    if (d < sourceBest) { sourceBest = d; sourceSeed = index }
  }
  if (sourceSeed < 0 || sourceBest > .55) return null
  const sourceQueue = [sourceSeed]; source[sourceSeed] = 2
  let left = -2.4, right = 2.4, top = -3.6
  for (let i = 0; i < sourceQueue.length; i++) {
    const index = sourceQueue[i], x = index % width, y = Math.floor(index / width)
    const p = local({ x: (x + .5) / width, y: (y + .5) / height * aspect }, pose)
    left = Math.min(left, p.x - .06); right = Math.max(right, p.x + .06); top = Math.min(top, p.y - .06)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * width + nx
      if (nx < 0 || nx >= width || ny < 0 || ny >= height || source[n] !== 1) continue
      source[n] = 2; sourceQueue.push(n)
    }
  }
  const bounds = { left, top, width: right - left, height: -.3 - top }
  const size = Math.min(160, Math.max(88, Math.ceil(bounds.width / .055)))
  const cells = new Uint8Array(size * size)
  const pointAt = (x: number, y: number) => ({ x: left + (x + .5) / size * bounds.width, y: top + (y + .5) / size * bounds.height })
  let seed = -1, best = Infinity
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = pointAt(x, y), v = world(p, pose)
    if (p.y > line(p.x) + .035 || v.x < 0 || v.x >= 1 || v.y < 0 || v.y >= aspect) continue
    const maskIndex = Math.min(height - 1, Math.floor(v.y / aspect * height)) * width + Math.min(width - 1, Math.floor(v.x * width))
    if (source[maskIndex] !== 2) continue
    const value = data[maskIndex]
    if (!Number.isFinite(value) || value < .62 || value > 1) continue
    const index = y * size + x; cells[index] = 1
    const d = p.x ** 2 + (p.y + 1.12) ** 2
    if (d < best) { best = d; seed = index }
  }
  if (seed < 0 || best > .55) return null
  // Keep the component touching the forehead; isolated hands/background cannot seed a second cap.
  const queue = [seed], connected = new Uint8Array(cells.length); connected[seed] = 1
  for (let i = 0; i < queue.length; i++) {
    const index = queue[i], x = index % size, y = Math.floor(index / size)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, n = ny * size + nx
      if (nx < 0 || nx >= size || ny < 0 || ny >= size || !cells[n] || connected[n]) continue
      connected[n] = 1; queue.push(n)
    }
  }
  if (queue.length < 20) return null
  const boundary: { point: Point; normal: Point }[] = []
  // Normals come from confidence gradients, not the forehead clipping line.
  const sample = (x: number, y: number) => data[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))]
  for (const index of queue) {
    const x = index % size, y = Math.floor(index / size), p = pointAt(x, y), v = world(p, pose)
    const mx = Math.floor(v.x * width), my = Math.floor(v.y / aspect * height)
    if (Math.min(sample(mx - 2, my), sample(mx + 2, my), sample(mx, my - 2), sample(mx, my + 2)) > .62) continue
    const gx = (sample(mx - 2, my) - sample(mx + 2, my)) * width
    const gy = (sample(mx, my - 2) - sample(mx, my + 2)) * height / aspect
    const n = local({ x: pose.center.x + gx, y: pose.center.y + gy }, pose), length = Math.hypot(n.x, n.y)
    if (length > .001) boundary.push({ point: p, normal: { x: n.x / length, y: n.y / length } })
  }
  const points: Scalp['points'] = []
  for (const index of queue) {
    const x = index % size, y = Math.floor(index / size)
    const p = pointAt(x, y)
    let nearest = boundary[0], best = Infinity
    for (const b of boundary) { const d = distance(p, b.point); if (d < best) { best = d; nearest = b } }
    // A completely clipped mask can have no visible HumanSeg contour; do not invent a normal.
    points.push({ point: p, normal: nearest?.normal ?? { x: 0, y: 0 }, edge: best < .13, seed: index })
  }
  return { size, bounds, cells: connected, points }
}
export function scalpContains(p: Point, scalp: Scalp) {
  const x = Math.floor((p.x - scalp.bounds.left) / scalp.bounds.width * scalp.size), y = Math.floor((p.y - scalp.bounds.top) / scalp.bounds.height * scalp.size)
  return x >= 0 && y >= 0 && x < scalp.size && y < scalp.size && scalp.cells[y * scalp.size + x] === 1
}
export type Gesture = 'open' | 'point' | 'pinch' | 'fist'
const handPoints = (hand: Landmark[], aspect: number) => hand.map(v => ({ x: v.x, y: v.y * aspect, z: v.z ?? 0 }))
type HandPoint = ReturnType<typeof handPoints>[number]
const handDistance = (a: HandPoint, b: HandPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
function fingerExtended(p: HandPoint[], base: number, holding = false) {
  const a = p[base], b = p[base + 1], c = p[base + 3]
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z
  const vx = c.x - b.x, vy = c.y - b.y, vz = c.z - b.z
  const cosine = (ux * vx + uy * vy + uz * vz) / Math.max(.000001, Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz))
  return cosine > (holding ? .15 : .32) && handDistance(c, a) > handDistance(b, a) * (holding ? 1.25 : 1.45)
}
export function readGesture(hand: Landmark[], previous: Gesture, aspect: number): { gesture: Gesture; point: Point } {
  const p = handPoints(hand, aspect)
  if (p.length !== 21) return { gesture: 'open', point: { x: 0, y: 0 } }
  const palm = [0, 5, 9, 13, 17].reduce((s, id) => ({ x: s.x + p[id].x / 5, y: s.y + p[id].y / 5 }), { x: 0, y: 0 })
  const size = Math.max(.015, handDistance(p[0], p[9]), handDistance(p[5], p[17]))
  const indexExtended = fingerExtended(p, 5, previous === 'point')
  const othersExtended = [9, 13, 17].filter(base => fingerExtended(p, base)).length
  let curled = 0
  for (const [tip, pip, base] of [[8, 6, 5], [12, 10, 9], [16, 14, 13], [20, 18, 17]]) {
    if (!fingerExtended(p, base) && handDistance(p[tip], p[0]) < handDistance(p[pip], p[0]) * 1.2 && handDistance(p[tip], p[base]) < size * .9) curled++
  }
  const point = indexExtended && othersExtended <= 1
  // A raised index with the other three fingers folded is pointing, not a fist.
  const fist = !point && curled >= (previous === 'fist' ? 2 : 3)
  const pinch = handDistance(p[4], p[8]) / size < (previous === 'pinch' ? .43 : .29)
  const gesture = fist ? 'fist' : pinch ? 'pinch' : point ? 'point' : 'open'
  const tip = gesture === 'point' ? p[8] : gesture === 'pinch' ? mix(p[4], p[8], .5) : palm
  return { gesture, point: { x: tip.x, y: tip.y } }
}
export type Stroke = { gesture: Gesture; latched: boolean; last: Point | null; lastBurst: number; seen: number }
export function wipePalm(hand: Landmark[], aspect: number): { point: Point; span: number } | null {
  const p = handPoints(hand, aspect)
  if (p.length !== 21 || [5, 9, 13, 17].filter(base => fingerExtended(p, base)).length < 3) return null
  return {
    point: [0, 5, 9, 13, 17].reduce((s, id) => ({ x: s.x + p[id].x / 5, y: s.y + p[id].y / 5 }), { x: 0, y: 0 }),
    span: distance(p[5], p[17]),
  }
}
export const newStroke = (): Stroke => ({ gesture: 'open', latched: false, last: null, lastBurst: -Infinity, seen: -Infinity })
export const HAND_GRACE = 220
export function blowSign(hand: Landmark[], face: Point[], pose: Pose, aspect: number, holding = false): Point | null {
  if (hand.length !== 21 || face.length < 468) return null
  const p = handPoints(hand, aspect)
  const size = Math.max(.015, handDistance(p[0], p[9]), handDistance(p[5], p[17]))
  const circle = mix(p[4], p[8], .5)
  // Thumb + curved index form the ring. The remaining fingers distinguish an
  // OK/O sign from a fist; a straight-index drawing pinch remains available.
  const joined = handDistance(p[4], p[8]) < size * (holding ? .46 : .32)
  const a = { x: p[6].x - p[7].x, y: p[6].y - p[7].y, z: p[6].z - p[7].z }
  const b = { x: p[8].x - p[7].x, y: p[8].y - p[7].y, z: p[8].z - p[7].z }
  const cosine = (a.x * b.x + a.y * b.y + a.z * b.z) / Math.max(.000001, Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z))
  const curved = !fingerExtended(p, 5) && (cosine > -.82 || handDistance(p[8], p[5]) < size * .7)
  const extended = [9, 13, 17].filter(base => fingerExtended(p, base)).length
  const mouth = mix(face[13], face[14], .5)
  const mouthWidth = Math.max(pose.scale * .4, distance(face[61], face[291]))
  const close = distance(circle, mouth) < Math.max(mouthWidth * (holding ? .95 : .75), pose.scale * (holding ? .65 : .5))
  return joined && curved && extended >= 2 && close ? circle : null
}
export function strokeSamples(state: Stroke, gesture: Gesture, point: Point, time: number, hit: boolean, scale: number): Point[] {
  if (time - state.seen > HAND_GRACE || gesture !== state.gesture) {
    state.latched = false; state.last = null; state.lastBurst = -Infinity
  }
  state.seen = time; state.gesture = gesture
  if (gesture === 'open') { state.latched = false; state.last = null; return [] }
  if (!state.latched && hit) state.latched = true
  if (!state.latched) return []
  const spacing = scale * (gesture === 'fist' ? .3 : .065)
  const d = state.last ? distance(state.last, point) : 0
  const due = time - state.lastBurst >= (gesture === 'fist' ? 410 : 75)
  if (state.last && d < spacing && !due) return []
  const count = Math.max(1, Math.ceil(d / Math.max(.002, spacing)))
  const samples = Array.from({ length: count }, (_, i) => state.last ? mix(state.last, point, (i + 1) / count) : point)
  state.last = point; state.lastBurst = time
  return samples
}
