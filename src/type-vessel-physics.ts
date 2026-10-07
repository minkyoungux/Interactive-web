export type Point = { x: number; y: number }
export type Pose = Point & { angle: number }
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// Follow the short arc across atan2's seam instead of flipping orientation.
export function trackAngle(previous: number, measured: number, delta: number) {
  const difference = Math.atan2(Math.sin(measured - previous), Math.cos(measured - previous))
  if (Math.abs(difference) < .015) return previous
  const step = clamp(difference, -5 * delta, 5 * delta)
  return previous + step * (1 - Math.exp(-delta * 18))
}

export function anchoredPose(anchor: Point, hand: Point, angle: number): Pose {
  const rotated = worldPoint(anchor, { x: 0, y: 0, angle })
  return { x: hand.x - rotated.x, y: hand.y - rotated.y, angle }
}

export function localPoint(point: Point, pose: Pose): Point {
  const x = point.x - pose.x, y = point.y - pose.y
  const c = Math.cos(pose.angle), s = Math.sin(pose.angle)
  return { x: x * c + y * s, y: -x * s + y * c }
}

export function worldPoint(point: Point, pose: Pose): Point {
  const c = Math.cos(pose.angle), s = Math.sin(pose.angle)
  return { x: pose.x + point.x * c - point.y * s, y: pose.y + point.x * s + point.y * c }
}

export function radiusAt(profile: Float32Array, row: number) {
  const i = clamp(row, 0, profile.length - 1)
  const a = Math.floor(i), b = Math.min(profile.length - 1, a + 1)
  return profile[a] + (profile[b] - profile[a]) * (i - a)
}

export function shapeProfile(profile: Float32Array, row: number, radius: number) {
  for (let i = 0; i < profile.length; i++) {
    const influence = Math.exp(-Math.pow((i - row) / 2.6, 2)) * .26
    profile[i] = clamp(profile[i] + (clamp(radius, .27, 1.42) - profile[i]) * influence, .27, 1.42)
  }
}

// Solve a relative swept crossing, including a cup moving between video frames.
export function cupCrossing(previous: Point, current: Point, oldCup: Point, cup: Point, halfWidth: number, cupHeight: number) {
  const a = previous.y - (oldCup.y - cupHeight)
  const b = current.y - (cup.y - cupHeight)
  if (a > 0 || b < 0 || b <= a) return null
  const t = -a / (b - a)
  const x = previous.x + (current.x - previous.x) * t - (oldCup.x + (cup.x - oldCup.x) * t)
  return Math.abs(x) < halfWidth - 7 ? x : null
}
