import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({ entryPoints: ['src/face-match-core.ts'], bundle: true, format: 'esm', write: false })
const core = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

function face(yaw = 0, pitch = .36) {
  const points = Array.from({ length: 478 }, () => ({ x: .5, y: .5 }))
  points[234] = { x: .3, y: .5 }; points[454] = { x: .7, y: .5 }
  points[33] = { x: .38, y: .4 }; points[263] = { x: .62, y: .4 }
  points[152] = { x: .5, y: .8 }; points[1] = { x: .5 + yaw * .4, y: .4 + pitch * .4 }
  return points
}

function calibrate(detector) {
  for (let now = 0; now <= 700; now += 50) detector.update(0, .36, now)
  assert.equal(detector.ready, true)
}

test('yaw and pitch are independent of face scale', () => {
  const original = face(.1, .4), yaw = core.headYaw(original), pitch = core.headPitch(original)
  const scaled = original.map(point => ({ x: .5 + (point.x - .5) * .5, y: .5 + (point.y - .5) * .5 }))
  assert.ok(Math.abs(core.headYaw(scaled) - yaw) < 1e-9)
  assert.ok(Math.abs(core.headPitch(scaled) - pitch) < 1e-9)
})

test('facial transformation matrix supplies direct yaw and pitch angles', () => {
  const pitch = .14, yaw = -.18, cx = Math.cos(pitch), sx = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw)
  const matrix = { rows: 4, columns: 4, data: [
    cy, sy * sx, sy * cx, 0,
    0, cx, -sx, 0,
    -sy, cy * sx, cy * cx, 0,
    0, 0, 0, 1,
  ] }
  const pose = core.matrixHeadPose(matrix)
  assert.ok(Math.abs(pose.yaw - yaw) < 1e-9)
  assert.ok(Math.abs(pose.pitch - pitch) < 1e-9)
})

test('face pose falls back to landmarks when a matrix is unavailable', () => {
  const points = face(.08, .42), pose = core.facePose(points)
  assert.ok(Math.abs(pose.yaw - core.headYaw(points)) < 1e-9)
  assert.ok(Math.abs(pose.pitch - core.headPitch(points)) < 1e-9)
})

test('a deliberate left or right turn triggers one pass and requires recentering', () => {
  const detector = new core.HeadGestureDetector(); calibrate(detector)
  assert.equal(detector.update(.11, .36, 800), null)
  assert.equal(detector.update(.11, .36, 960), 'pass-right')
  assert.equal(detector.update(.11, .36, 1200), null)
  detector.update(0, .36, 1700); detector.update(0, .36, 1900)
  assert.equal(detector.status, 'ready')
})

test('a vertical excursion followed by center triggers a match', () => {
  const detector = new core.HeadGestureDetector(); calibrate(detector)
  assert.equal(detector.update(0, .44, 800), null)
  assert.equal(detector.update(0, .44, 890), null)
  assert.equal(detector.update(0, .36, 980), 'match')
})

test('a brief wobble does not trigger a gesture', () => {
  const detector = new core.HeadGestureDetector(); calibrate(detector)
  assert.equal(detector.update(.1, .36, 800), null)
  assert.equal(detector.update(0, .36, 860), null)
  assert.equal(detector.update(0, .43, 920), null)
  assert.equal(detector.update(0, .36, 960), null)
})
