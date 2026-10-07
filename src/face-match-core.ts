export type FacePoint = { x: number; y: number; z?: number }
export type FaceMatrix = { rows: number; columns: number; data: number[] }
export type Gesture = 'pass-left' | 'pass-right' | 'match' | null
export type GestureStatus = 'calibrating' | 'ready' | 'turning' | 'nodding' | 'recenter'

const distance = (a: FacePoint, b: FacePoint) => Math.hypot(a.x - b.x, a.y - b.y)

export function headYaw(points: FacePoint[]) {
  if (points.length < 455) return 0
  const left = points[234], right = points[454], nose = points[1]
  const width = Math.max(.001, distance(left, right))
  return (nose.x - (left.x + right.x) / 2) / width
}

// A scale-independent vertical nose position is steadier than raw screen movement.
export function headPitch(points: FacePoint[]) {
  if (points.length < 264) return 0
  const leftEye = points[33], rightEye = points[263], chin = points[152], nose = points[1]
  const eyeY = (leftEye.y + rightEye.y) / 2
  return (nose.y - eyeY) / Math.max(.001, chin.y - eyeY)
}

// MediaPipe's 4×4 face matrix gives true head rotation and is much less
// sensitive to camera distance or a user's individual face proportions.
export function matrixHeadPose(matrix?: FaceMatrix) {
  const data = matrix?.data
  if (!data || data.length < 16 || matrix?.rows !== 4 || matrix.columns !== 4) return null
  const scaleX = Math.max(.0001, Math.hypot(data[0], data[4], data[8]))
  const scaleY = Math.max(.0001, Math.hypot(data[1], data[5], data[9]))
  const scaleZ = Math.max(.0001, Math.hypot(data[2], data[6], data[10]))
  const r20 = Math.max(-1, Math.min(1, data[8] / scaleX))
  const yaw = Math.asin(-r20)
  const pitch = Math.atan2(data[9] / scaleY, data[10] / scaleZ)
  return Number.isFinite(yaw) && Number.isFinite(pitch) ? { yaw, pitch } : null
}

export function facePose(points: FacePoint[], matrix?: FaceMatrix) {
  return matrixHeadPose(matrix) ?? { yaw: headYaw(points), pitch: headPitch(points) }
}

export class HeadGestureDetector {
  ready = false
  status: GestureStatus = 'calibrating'
  progress = 0
  yaw = 0
  pitch = 0
  private startedAt = 0
  private samples = 0
  private yawSum = 0
  private pitchSum = 0
  private neutralYaw = 0
  private neutralPitch = 0
  private turnDirection = 0
  private turnStartedAt = 0
  private nodStartedAt = 0
  private nodPeakAt = 0
  private centerStartedAt = 0
  private needsCenter = false
  private cooldownUntil = 0

  reset() {
    this.ready = false; this.status = 'calibrating'; this.progress = 0
    this.startedAt = 0; this.samples = 0; this.yawSum = 0; this.pitchSum = 0
    this.turnDirection = 0; this.turnStartedAt = 0; this.nodStartedAt = 0; this.nodPeakAt = 0
    this.centerStartedAt = 0; this.needsCenter = false; this.cooldownUntil = 0
  }

  update(yaw: number, pitch: number, now: number): Gesture {
    this.yaw = yaw; this.pitch = pitch
    if (!this.startedAt) this.startedAt = now || .001
    if (!this.ready) {
      this.samples++; this.yawSum += yaw; this.pitchSum += pitch
      this.progress = Math.min(1, (now - this.startedAt) / 500)
      if (this.progress >= 1 && this.samples >= 8) {
        this.neutralYaw = this.yawSum / this.samples; this.neutralPitch = this.pitchSum / this.samples
        this.ready = true; this.status = 'ready'; this.progress = 1
      }
      return null
    }

    const yawOffset = yaw - this.neutralYaw, pitchOffset = pitch - this.neutralPitch
    const centered = Math.abs(yawOffset) < .042 && Math.abs(pitchOffset) < .036
    if (this.needsCenter || now < this.cooldownUntil) {
      this.status = 'recenter'
      if (centered) {
        if (!this.centerStartedAt) this.centerStartedAt = now
        if (now >= this.cooldownUntil && now - this.centerStartedAt > 110) {
          this.needsCenter = false; this.centerStartedAt = 0; this.status = 'ready'
        }
      } else this.centerStartedAt = 0
      return null
    }

    const direction = yawOffset < -.055 ? -1 : yawOffset > .055 ? 1 : 0
    if (direction) {
      this.status = 'turning'; this.nodStartedAt = 0; this.nodPeakAt = 0
      if (direction !== this.turnDirection) { this.turnDirection = direction; this.turnStartedAt = now }
      if (now - this.turnStartedAt >= 85) return this.trigger(direction < 0 ? 'pass-left' : 'pass-right', now)
      return null
    }
    this.turnDirection = 0; this.turnStartedAt = 0

    const nodDistance = Math.abs(pitchOffset)
    if (!this.nodPeakAt && nodDistance > .045 && Math.abs(yawOffset) < .075) {
      this.status = 'nodding'
      if (!this.nodStartedAt) this.nodStartedAt = now
      if (now - this.nodStartedAt >= 55) this.nodPeakAt = now
      return null
    }
    if (this.nodPeakAt) {
      this.status = 'nodding'
      if (now - this.nodPeakAt > 1200) { this.nodStartedAt = 0; this.nodPeakAt = 0; this.status = 'ready'; return null }
      if (nodDistance < .028) return this.trigger('match', now)
      return null
    }
    this.nodStartedAt = 0
    this.status = 'ready'
    if (centered) {
      this.neutralYaw += yawOffset * .012
      this.neutralPitch += pitchOffset * .012
    }
    return null
  }

  private trigger(gesture: Exclude<Gesture, null>, now: number) {
    this.needsCenter = true; this.cooldownUntil = now + 500; this.status = 'recenter'
    this.turnDirection = 0; this.turnStartedAt = 0; this.nodStartedAt = 0; this.nodPeakAt = 0
    return gesture
  }
}
