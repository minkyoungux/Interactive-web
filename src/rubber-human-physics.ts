export type Point = { x: number; y: number }
export type Pose = { center: Point; right: Point; down: Point }
export const FLOW_STEPS = 64
export const FLOW_RADIUS = .52
export const zero = (): Point => ({ x: 0, y: 0 })
export const length = (p: Point) => Math.hypot(p.x, p.y)
export function localPoint(p: Point, pose: Pose): Point {
  const x = p.x - pose.center.x, y = p.y - pose.center.y
  const det = pose.right.x * pose.down.y - pose.right.y * pose.down.x
  return { x: (x * pose.down.y - y * pose.down.x) / det, y: (y * pose.right.x - x * pose.right.y) / det }
}
export function worldPoint(p: Point, pose: Pose): Point {
  return { x: pose.center.x + p.x * pose.right.x + p.y * pose.down.x, y: pose.center.y + p.x * pose.right.y + p.y * pose.down.y }
}
// Integrate a moving, smooth Gaussian field. Unlike a single displacement
// bump, small flow steps preserve a rounded neck even for long pulls.
export function flowPoint(point: Point, anchor: Point, pull: Point, inverse = false): Point {
  const p = { ...point }
  const sign = inverse ? -1 : 1
  const sx = pull.x / FLOW_STEPS * sign, sy = pull.y / FLOW_STEPS * sign
  for (let i = 0; i < FLOW_STEPS; i++) {
    const t = inverse ? 1 - i / FLOW_STEPS : i / FLOW_STEPS
    const cx = anchor.x + pull.x * t, cy = anchor.y + pull.y * t
    const w = Math.exp(-((p.x - cx) ** 2 + (p.y - cy) ** 2) / (FLOW_RADIUS ** 2))
    const mx = p.x + sx * w * .5 - cx - sx * .5
    const my = p.y + sy * w * .5 - cy - sy * .5
    const mid = Math.exp(-(mx * mx + my * my) / (FLOW_RADIUS ** 2))
    p.x += sx * mid; p.y += sy * mid
  }
  return p
}
// Exact underdamped spring solution; independent of frame rate.
export function springStep(position: Point, velocity: Point, dt: number, reducedMotion = false) {
  if (reducedMotion) {
    const decay = Math.exp(-18 * dt)
    position.x *= decay; position.y *= decay; velocity.x = velocity.y = 0
    return
  }
  const damping = 5.8, frequency = 15
  const decay = Math.exp(-damping * dt), c = Math.cos(frequency * dt), s = Math.sin(frequency * dt)
  for (const axis of ['x', 'y'] as const) {
    const p = position[axis], v = velocity[axis], b = (v + damping * p) / frequency
    position[axis] = decay * (p * c + b * s)
    velocity[axis] = decay * (v * c - (damping * b + frequency * p) * s)
  }
}
export function insidePolygon(p: Point, polygon: Point[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
