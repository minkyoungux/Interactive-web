// Pure geometry and game rules; coordinates are mirrored, half-camera local 0..1.
export type Point = { x: number; y: number }
export type Side = 0 | 1
export const OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
export const COLORS = ['#29282e','#ffffff','#ed5657','#ff9846','#ffd84d','#91c65b','#3fafa1','#499de5','#8a73cf','#ef83b1']
export const TIMING = { stable: 650, countdown: 5000, swap: 850, play: 60000, reveal: 2400, result: 10000, handGrace: 220, release: 110 }
export const other = (side: Side): Side => side === 0 ? 1 : 0
export function owner(center: Point): Side { return 1 - center.x < .5 ? 0 : 1 }
export function local(point: Point, side: Side): Point { return { x: (1 - point.x) * 2 - side, y: point.y } }
export function center(points: Point[]): Point {
  return { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length }
}
export type Cover = { x: number; y: number; width: number; height: number }
export function cover(sourceWidth: number, sourceHeight: number, width: number, height: number): Cover {
  const scale = Math.max(width / sourceWidth, height / sourceHeight)
  return { x: (width - sourceWidth * scale) / 2, y: (height - sourceHeight * scale) / 2, width: sourceWidth * scale, height: sourceHeight * scale }
}
export const project = (p: Point, t: Cover): Point => ({ x: t.x + p.x * t.width, y: t.y + p.y * t.height })
export function contains(point: Point, polygon: Point[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j]
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
export type Pose = { points: Point[]; aspect: number; size: number; angle: number; time: number }
export function pose(points: Point[], aspect: number, time: number): Pose {
  const a = points[33], b = points[263], top = points[10], chin = points[152]
  return { points, aspect, time, angle: Math.atan2(b.y - a.y, (b.x - a.x) * aspect), size: Math.max(.01, Math.hypot((chin.x - top.x) * aspect, chin.y - top.y)) }
}
export type Anchor = { index: number; x: number; y: number }
export function attach(p: Point, face: Pose): Anchor {
  let index = 0, best = Infinity
  face.points.forEach((q, i) => {
    const d = ((p.x - q.x) * face.aspect) ** 2 + (p.y - q.y) ** 2
    if (d < best) { best = d; index = i }
  })
  const q = face.points[index], x = (p.x - q.x) * face.aspect / face.size, y = (p.y - q.y) / face.size
  const c = Math.cos(face.angle), s = Math.sin(face.angle)
  return { index, x: x * c + y * s, y: -x * s + y * c }
}
export function resolve(a: Anchor, face: Pose): Point {
  const q = face.points[a.index], c = Math.cos(face.angle), s = Math.sin(face.angle)
  return { x: q.x + (a.x * c - a.y * s) * face.size / face.aspect, y: q.y + (a.x * s + a.y * c) * face.size }
}
export function predict(previous: Pose | null, latest: Pose, now: number): Pose {
  const dt = previous ? latest.time - previous.time : 0
  if (!previous || dt <= 0 || dt > 250 || now - latest.time > 180) return latest
  const ahead = Math.min(45, Math.max(0, now - latest.time)) / dt
  const clamp = (d: number) => Math.max(-.025, Math.min(.025, d * Math.min(.65, ahead)))
  return pose(latest.points.map((p, i) => ({ x: p.x + clamp(p.x - previous.points[i].x), y: p.y + clamp(p.y - previous.points[i].y) })), latest.aspect, now)
}
export class Pinch {
  down = false
  point: Point | null = null
  seen = -Infinity
  private releasing = -1
  update(hand: Point[] | null, now: number, aspect: number) {
    const before = this.down
    if (hand) {
      this.seen = now
      this.point = center([hand[4], hand[8]])
      const distance = (a: Point, b: Point) => Math.hypot((a.x - b.x) * aspect, a.y - b.y)
      const ratio = distance(hand[4], hand[8]) / Math.max(.001, distance(hand[5], hand[17]))
      if (!this.down && ratio < .62) { this.down = true; this.releasing = -1 }
      else if (this.down && ratio > .82) {
        if (this.releasing < 0) this.releasing = now
        if (now - this.releasing >= TIMING.release) { this.down = false; this.releasing = -1 }
      } else this.releasing = -1
    } else {
      // Missing frames cannot count toward the stable-open interval.
      this.releasing = -1
      if (now - this.seen > TIMING.handGrace) { this.down = false; this.point = null }
    }
    return { started: !before && this.down, ended: before && !this.down }
  }
}
export type Stroke = { color: string; points: Anchor[] }
export class Ink {
  strokes: Stroke[] = []
  active: Stroke | null = null
  private last: Point | null = null
  sample(point: Point, face: Pose | null, started: boolean, down: boolean, color: string, palette: boolean) {
    if (!down || palette) { this.active = null; this.last = null; return }
    if (!face) return
    if (started && contains(point, OVAL.map(i => face.points[i]))) {
      this.active = { color, points: [] }; this.strokes.push(this.active); this.last = null
    }
    if (this.active && (!this.last || Math.hypot((point.x - this.last.x) * face.aspect, point.y - this.last.y) > .0015)) {
      this.active.points.push(attach(point, face)); this.last = { ...point }
    }
  }
  end() { this.active = null; this.last = null }
}
export type Phase = 'lobby' | 'loading' | 'waiting' | 'countdown' | 'swapping' | 'playing' | 'reveal' | 'result'
export class Round {
  phase: Phase = 'lobby'
  deadline = 0
  private stable = [-1, -1]
  private lastSeen = [-Infinity, -Infinity]
  faces(found: boolean[], now: number) {
    found.forEach((yes, i) => {
      if (!yes) this.stable[i] = -1
      else {
        if (this.stable[i] < 0 || now - this.lastSeen[i] > 250) this.stable[i] = now
        this.lastSeen[i] = now
      }
    })
    if (this.phase === 'waiting' && this.stable.every(t => t >= 0 && now - t >= TIMING.stable)) {
      this.phase = 'countdown'; this.deadline = now + TIMING.countdown
    }
    if (this.phase === 'countdown' && found.some(yes => !yes)) { this.phase = 'waiting'; this.deadline = 0 }
  }
  tick(now: number) {
    if (this.phase === 'countdown' && now >= this.deadline) this.phase = 'swapping'
    if (this.phase === 'playing' && now >= this.deadline) { this.phase = 'reveal'; this.deadline += TIMING.reveal }
    if (this.phase === 'reveal' && now >= this.deadline) { this.phase = 'result'; this.deadline += TIMING.result }
    if (this.phase === 'result' && now >= this.deadline) this.phase = 'lobby'
    return this.phase
  }
  swapped(now: number) { if (this.phase === 'swapping') { this.phase = 'playing'; this.deadline = now + TIMING.play } }
}
