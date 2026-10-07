import type { Point } from './shampoo-geometry'
export type SoapBubble = Point & { id: number; radius: number; vx: number; vy: number; variant: number; phase: number; born: number }
export type Food = Point & { key: string; radius: number }
export type Duck = Point & { direction: number; until: number; leaving: boolean; target: Food | null; retarget: number; chewUntil: number }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export class BubbleBath {
  bubbles: SoapBubble[] = []
  duck: Duck | null = null
  elapsed = 0
  nextDuck = 10
  private nextId = 0
  private accumulator = 0
  private width = 1
  private height = 1
  reset(width: number, height: number) {
    this.bubbles = []; this.duck = null; this.elapsed = this.accumulator = this.nextId = 0
    this.nextDuck = 10; this.width = width; this.height = height
  }
  resize(width: number, height: number) {
    if (this.width > 1) {
      for (const b of this.bubbles) { b.x *= width / this.width; b.y *= height / this.height }
      if (this.duck) { this.duck.x *= width / this.width; this.duck.y *= height / this.height; this.duck.target = null }
    }
    this.width = width; this.height = height
  }
  emit(point: Point, direction: Point, faceSize: number) {
    // Keep the settled pile, stop creating new bubbles at the memory budget.
    if (this.bubbles.length >= 420) return
    const length = Math.hypot(direction.x, direction.y)
    const dx = length > 1 ? direction.x / length : (Math.random() < .5 ? -1 : 1)
    const dy = length > 1 ? direction.y / length : -.25
    const maxRadius = Math.min(84, Math.max(18, this.width * .23))
    const radius = clamp(faceSize * (.16 + Math.random() ** .8 * .38), 18, maxRadius)
    const id = this.nextId++
    this.bubbles.push({ ...point, id, radius, vx: dx * (65 + Math.random() * 70) + (Math.random() - .5) * 28,
      vy: Math.min(10, dy * 55) - 55 - Math.random() * 65, variant: id % 6, phase: Math.random() * Math.PI * 2, born: this.elapsed })
  }
  update(delta: number, width: number, height: number, food: Food[]): string[] {
    this.width = width; this.height = height
    const dt = clamp(delta, 0, .06)
    this.elapsed += dt; this.accumulator += dt
    while (this.accumulator >= 1 / 60) { this.step(1 / 60); this.accumulator -= 1 / 60 }
    return this.updateDuck(dt, food)
  }
  private walls(b: SoapBubble) {
    const floor = this.height - 8 - b.radius
    if (b.x < b.radius) { b.x = b.radius; b.vx = Math.abs(b.vx) * .35 }
    if (b.x > this.width - b.radius) { b.x = this.width - b.radius; b.vx = -Math.abs(b.vx) * .35 }
    if (b.y > floor) {
      b.y = floor
      if (b.vy > 0) b.vy = b.vy > 30 ? -b.vy * .14 : 0
      b.vx *= .91
    }
  }
  private step(dt: number) {
    for (const b of this.bubbles) {
      b.vx += Math.sin(this.elapsed * 1.6 + b.phase) * 9 * dt
      b.vx *= Math.exp(-.45 * dt); b.vy = Math.min(220, b.vy + 135 * dt)
      b.x += b.vx * dt; b.y += b.vy * dt; this.walls(b)
    }
    // Spatial buckets keep a full pile inexpensive. Equal-mass impulse plus
    // overlap correction lets the hollow bubbles bounce softly and stack.
    // A bucket must cover the largest diameter, otherwise giant bubbles can
    // overlap across two buckets without ever being tested as neighbors.
    let cell = 34
    for (const b of this.bubbles) cell = Math.max(cell, b.radius * 2 + 2)
    const columns = Math.ceil(this.width / cell) + 4
    for (let pass = 0; pass < 4; pass++) {
      const buckets = new Map<number, SoapBubble[]>()
      for (const b of this.bubbles) {
        const x = Math.floor(b.x / cell), y = Math.floor(b.y / cell)
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          for (const a of buckets.get((y + dy) * columns + x + dx) ?? []) {
            let vx = b.x - a.x, vy = b.y - a.y
            let d = Math.hypot(vx, vy)
            const target = a.radius + b.radius
            if (d >= target) continue
            if (d < .0001) { vx = (a.id % 2 ? 1 : -1) * .001; vy = -.001; d = Math.hypot(vx, vy) }
            const nx = vx / d, ny = vy / d, overlap = (target - d) * .5
            a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap
            const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
            if (relative < 0) {
              const impulse = -relative * .56
              a.vx -= impulse * nx; a.vy -= impulse * ny; b.vx += impulse * nx; b.vy += impulse * ny
              a.vx *= .985; b.vx *= .985
            }
            this.walls(a); this.walls(b)
          }
        }
        const key = Math.floor(b.y / cell) * columns + Math.floor(b.x / cell)
        const bucket = buckets.get(key)
        if (bucket) bucket.push(b); else buckets.set(key, [b])
      }
    }
  }
  private updateDuck(dt: number, food: Food[]): string[] {
    if (!this.duck && this.elapsed >= this.nextDuck) {
      const left = Math.floor(this.elapsed / 10) % 2 === 1
      this.duck = { x: left ? -58 : this.width + 58, y: this.height * .7, direction: left ? 1 : -1,
        until: this.elapsed + 12, leaving: false, target: null, retarget: 0, chewUntil: 0 }
    }
    const duck = this.duck
    if (!duck) return []
    if (this.elapsed >= duck.until) { duck.leaving = true; duck.target = null }
    const bubbleFood = this.bubbles.map(b => ({ x: b.x, y: b.y, key: `bubble:${b.id}`, radius: b.radius }))
    const snacks = [...food, ...bubbleFood]
    const targetStillExists = duck.target && snacks.some(f => f.key === duck.target!.key)
    if (!duck.leaving && (this.elapsed >= duck.retarget || !targetStillExists)) {
      let best = Infinity; duck.target = null
      for (const f of snacks) {
        if (f.x < -10 || f.x > this.width + 10 || f.y < 10 || f.y > this.height) continue
        const distance = Math.hypot(f.x - duck.x, f.y - duck.y)
        if (distance < best) { best = distance; duck.target = f }
      }
      duck.retarget = this.elapsed + .25
    }
    const destination = duck.leaving ? { x: duck.direction > 0 ? this.width + 90 : -90, y: this.height * .72 }
      : duck.target ?? { x: this.width * (.5 + Math.sin(this.elapsed * .65) * .34), y: this.height * .72 }
    const dx = destination.x - duck.x, dy = destination.y - duck.y, length = Math.hypot(dx, dy)
    const travel = Math.min(length, (duck.leaving ? 185 : 165) * dt)
    if (Math.abs(dx) > 3) duck.direction = dx > 0 ? 1 : -1
    if (length > 1) { duck.x += dx / length * travel; duck.y += dy / length * travel }
    const eaten: string[] = []
    if (!duck.leaving) {
      const beak = { x: duck.x + duck.direction * 23, y: duck.y - 10 }
      for (const f of snacks) {
        if (Math.hypot(f.x - beak.x, f.y - beak.y) < 27 + f.radius) eaten.push(f.key)
      }
      if (eaten.length) {
        const keys = new Set(eaten)
        this.bubbles = this.bubbles.filter(b => !keys.has(`bubble:${b.id}`))
        duck.chewUntil = this.elapsed + .26
      }
    }
    if (duck.leaving && (duck.x < -65 || duck.x > this.width + 65)) {
      this.duck = null; this.nextDuck = this.elapsed + 9
    }
    return eaten
  }
}
