export type FacePoint = { x: number; y: number; z?: number }
export type Blendshape = { categoryName?: string; score?: number }
export type ExpressionSignal = {
  smile: number
  mouth: number
  blink: number
  brow: number
  tilt: number
  energy: number
}

export const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const score = (scores: Blendshape[], name: string) => scores.find(item => item.categoryName === name)?.score ?? 0
const average = (...values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

export function expressionFromFace(points: FacePoint[], scores: Blendshape[]): ExpressionSignal {
  const smile = clamp01(average(score(scores, 'mouthSmileLeft'), score(scores, 'mouthSmileRight')) * 1.65)
  const mouth = clamp01(score(scores, 'jawOpen') * 1.3)
  const blink = clamp01(average(score(scores, 'eyeBlinkLeft'), score(scores, 'eyeBlinkRight')) * 1.35)
  const brow = clamp01(average(
    score(scores, 'browInnerUp'),
    score(scores, 'browOuterUpLeft'),
    score(scores, 'browOuterUpRight'),
  ) * 1.55)

  let tilt = 0
  if (points.length > 263) {
    const left = points[33], right = points[263]
    tilt = Math.max(-1, Math.min(1, Math.atan2(right.y - left.y, right.x - left.x) / .42))
  }
  const energy = clamp01(Math.max(smile * .8, mouth, brow * .72, blink * .52))
  return { smile, mouth, blink, brow, tilt, energy }
}

export class SignalSmoother {
  value: ExpressionSignal = { smile: 0, mouth: 0, blink: 0, brow: 0, tilt: 0, energy: 0 }
  private lastAt = 0

  update(target: ExpressionSignal, now: number) {
    const elapsed = this.lastAt ? Math.min(80, now - this.lastAt) : 16
    this.lastAt = now
    const blend = 1 - Math.exp(-elapsed / 68)
    ;(Object.keys(this.value) as (keyof ExpressionSignal)[]).forEach(key => {
      this.value[key] += (target[key] - this.value[key]) * blend
    })
    return { ...this.value }
  }

  reset() { this.value = { smile: 0, mouth: 0, blink: 0, brow: 0, tilt: 0, energy: 0 }; this.lastAt = 0 }
}

export class BlinkPulse {
  private closed = false
  update(value: number) {
    if (!this.closed && value >= .64) { this.closed = true; return true }
    if (this.closed && value <= .28) this.closed = false
    return false
  }
  reset() { this.closed = false }
}
