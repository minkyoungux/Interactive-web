// A small deadband and debounce keep lip tracking noise from switching modes.
export class OpenMouth {
  open = false
  private candidateAt: number | null = null
  private openedAt: number | null = null
  private lastSample: number | null = null

  update(score: number, now: number) {
    if (this.lastSample !== null && now - this.lastSample > 300) this.release()
    this.lastSample = now
    if (!Number.isFinite(score) || score < .12) {
      this.open = false; this.candidateAt = this.openedAt = null
    } else if (!this.open) {
      if (score >= .28) {
        if (this.candidateAt === null) this.candidateAt = now
        if (now - this.candidateAt >= 160) { this.open = true; this.openedAt = now }
      } else this.candidateAt = null
    }
    return this.open
  }

  seconds(now: number) { return this.openedAt === null ? 0 : Math.max(0, (now - this.openedAt) / 1000) }
  release() { this.open = false; this.candidateAt = this.openedAt = this.lastSample = null }
}

export function mouthOpenness(points: { x: number; y: number }[], aspect: number, jawScore = 0) {
  const boundedJaw = Number.isFinite(jawScore) ? Math.max(0, Math.min(1, jawScore)) : 0
  if (points.length < 468) return boundedJaw
  const distance = (a: number, b: number) => Math.hypot((points[a].x - points[b].x) * aspect, points[a].y - points[b].y)
  const gap = distance(13, 14) / Math.max(.001, distance(61, 291))
  return Math.max(boundedJaw, Math.max(0, Math.min(1, (gap - .02) / .38)))
}

// A deliberately readable 4.5-second journey, reversible from any point.
export function advanceTransition(progress: number, open: boolean, dt: number) {
  return Math.max(0, Math.min(1, progress + (open ? 1 / 4.5 : -1 / 3.4) * Math.max(0, dt)))
}

export function universeScale(seconds: number) {
  return 1 + .9 * (1 - Math.exp(-Math.max(0, seconds) / 10))
}
