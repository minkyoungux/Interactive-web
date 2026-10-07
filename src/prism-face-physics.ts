export type FacePoint = { x: number; y: number; z: number }
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// All camera layers use the same mirrored object-fit: cover projection.
export function cameraProjection(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight)
  return { width: sourceWidth * scale, height: sourceHeight * scale }
}
export function yawFromMatrix(matrix: number[]) {
  // MediaPipe's row-major canonical → camera rotation, independent of translation.
  return Math.atan2(-matrix[8], Math.hypot(matrix[0], matrix[4]))
}
export function dispersion(yaw: number, speed: number, sensitivity: number) {
  return clamp((Math.abs(yaw) - .09) * 1.25 * sensitivity + Math.abs(speed) * .085 * sensitivity, 0, 1)
}
