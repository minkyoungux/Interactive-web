export type Point = { x: number; y: number }
export type Calibration = {
  center: Point
  left: Point
  right: Point
  top: Point
  bottom: Point
}

export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))

function average(points: Point[], indices: number[]) {
  return indices.reduce((sum, index) => ({ x: sum.x + points[index].x, y: sum.y + points[index].y }), { x: 0, y: 0 })
}

function eyePosition(points: Point[], iris: number[], corners: [number, number], lids: [number[], number[]]) {
  const pupilSum = average(points, iris)
  const pupil = { x: pupilSum.x / iris.length, y: pupilSum.y / iris.length }
  const a = points[corners[0]], b = points[corners[1]]
  const left = a.x < b.x ? a : b, right = a.x < b.x ? b : a
  const topSum = average(points, lids[0]), bottomSum = average(points, lids[1])
  const top = topSum.y / lids[0].length, bottom = bottomSum.y / lids[1].length
  return {
    x: (pupil.x - left.x) / Math.max(.0001, right.x - left.x),
    y: (pupil.y - top) / Math.max(.0001, bottom - top),
  }
}

// MediaPipe's ten iris points become a gaze value that is independent of face size.
export function irisGaze(points: Point[]): Point | null {
  if (points.length < 478) return null
  const right = eyePosition(points, [468, 469, 470, 471, 472], [33, 133], [[159, 160], [144, 145]])
  const left = eyePosition(points, [473, 474, 475, 476, 477], [362, 263], [[385, 386], [374, 380]])
  const x = (right.x + left.x) / 2, y = (right.y + left.y) / 2
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
}

function axis(value: number, start: number, end: number, edge = .1) {
  const span = end - start
  if (Math.abs(span) < .012) return .5
  return clamp(edge + ((value - start) / span) * (1 - edge * 2), .025, .975)
}

export function calibratedGaze(raw: Point, calibration: Calibration): Point {
  return {
    x: axis(raw.x, calibration.left.x, calibration.right.x),
    y: axis(raw.y, calibration.top.y, calibration.bottom.y),
  }
}

export function mouthOpenness(points: Point[], jawScore = 0) {
  const jaw = clamp(Number.isFinite(jawScore) ? jawScore : 0)
  if (points.length < 292) return jaw
  const gap = Math.hypot(points[13].x - points[14].x, points[13].y - points[14].y)
  const width = Math.hypot(points[61].x - points[291].x, points[61].y - points[291].y)
  return Math.max(jaw, clamp((gap / Math.max(.001, width) - .03) / .38))
}

export function headYaw(points: Point[]) {
  if (points.length < 455) return 0
  const left = points[234], right = points[454], nose = points[1]
  const width = Math.max(.001, Math.hypot(right.x - left.x, right.y - left.y))
  return ((nose.x - (left.x + right.x) / 2) / width)
}

export class MouthGate {
  open = false
  private candidate: boolean | null = null
  private candidateAt = 0
  private lastAt = -Infinity

  update(score: number, now: number) {
    if (now - this.lastAt > 350) this.reset()
    this.lastAt = now
    const desired = this.open ? score > .20 : score >= .34
    if (desired === this.open) { this.candidate = null; return this.open }
    if (this.candidate !== desired) { this.candidate = desired; this.candidateAt = now }
    if (now - this.candidateAt >= (desired ? 90 : 70)) { this.open = desired; this.candidate = null }
    return this.open
  }

  reset() { this.open = false; this.candidate = null; this.lastAt = -Infinity }
}

export class HeadPalette {
  private armed = true
  private direction = 0
  private candidateAt = 0
  private neutral = 0

  setNeutral(value: number) { this.neutral = value; this.armed = true; this.direction = 0 }

  update(value: number, now: number) {
    const offset = value - this.neutral
    if (!this.armed) {
      if (Math.abs(offset) < .028) this.armed = true
      return 0
    }
    const direction = offset < -.075 ? -1 : offset > .075 ? 1 : 0
    if (!direction) { this.direction = 0; return 0 }
    if (direction !== this.direction) { this.direction = direction; this.candidateAt = now; return 0 }
    if (now - this.candidateAt < 170) return 0
    this.armed = false; this.direction = 0
    return direction
  }
}

export class SmoothCursor {
  value: Point = { x: .5, y: .5 }
  private lastAt = 0

  update(target: Point, now: number) {
    const dt = this.lastAt ? Math.min(80, now - this.lastAt) : 16
    this.lastAt = now
    const amount = 1 - Math.exp(-dt / 72)
    this.value.x += (target.x - this.value.x) * amount
    this.value.y += (target.y - this.value.y) * amount
    return { ...this.value }
  }

  reset(point: Point = { x: .5, y: .5 }) { this.value = { ...point }; this.lastAt = 0 }
}
