import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({ entryPoints: ['src/sampler-face-core.ts'], bundle: true, format: 'esm', write: false })
const core = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)

function face() {
  const points = Array.from({ length: 478 }, () => ({ x: .5, y: .5 }))
  points[33] = { x: .30, y: .42 }; points[133] = { x: .43, y: .42 }
  points[159] = points[160] = { x: .36, y: .39 }; points[144] = points[145] = { x: .36, y: .45 }
  points[362] = { x: .57, y: .42 }; points[263] = { x: .70, y: .42 }
  points[385] = points[386] = { x: .64, y: .39 }; points[374] = points[380] = { x: .64, y: .45 }
  for (const index of [468,469,470,471,472]) points[index] = { x: .365, y: .42 }
  for (const index of [473,474,475,476,477]) points[index] = { x: .635, y: .42 }
  points[234] = { x: .28, y: .5 }; points[454] = { x: .72, y: .5 }; points[1] = { x: .5, y: .5 }
  points[61] = { x: .42, y: .58 }; points[291] = { x: .58, y: .58 }; points[13] = { x: .5, y: .577 }; points[14] = { x: .5, y: .583 }
  return points
}

test('iris position is normalized within each eye instead of changing with face size', () => {
  const original = face(), gaze = core.irisGaze(original)
  assert.ok(gaze.x > .45 && gaze.x < .55)
  assert.ok(gaze.y > .45 && gaze.y < .55)
  const scaled = original.map(point => ({ x: .5 + (point.x - .5) * .55, y: .5 + (point.y - .5) * .55 }))
  const smaller = core.irisGaze(scaled)
  assert.ok(Math.abs(smaller.x - gaze.x) < 1e-9)
  assert.ok(Math.abs(smaller.y - gaze.y) < 1e-9)
})

test('five-point calibration maps normal and reversed camera axes to the canvas', () => {
  const regular = { center: {x:.5,y:.5}, left:{x:.3,y:.5}, right:{x:.7,y:.5}, top:{x:.5,y:.3}, bottom:{x:.5,y:.7} }
  const center = core.calibratedGaze({x:.5,y:.5}, regular)
  assert.ok(Math.abs(center.x - .5) < 1e-9 && Math.abs(center.y - .5) < 1e-9)
  assert.equal(core.calibratedGaze({x:.3,y:.3}, regular).x, .1)
  assert.equal(core.calibratedGaze({x:.7,y:.7}, regular).y, .9)
  const reversed = { ...regular, left:{x:.7,y:.5}, right:{x:.3,y:.5} }
  assert.equal(core.calibratedGaze({x:.7,y:.5}, reversed).x, .1)
  assert.equal(core.calibratedGaze({x:.3,y:.5}, reversed).x, .9)
})

test('mouth gate requires a deliberate opening and closes with hysteresis', () => {
  const mouth = new core.MouthGate()
  mouth.update(.8, 0); assert.equal(mouth.open, false)
  mouth.update(.8, 95); assert.equal(mouth.open, true)
  mouth.update(.27, 130); assert.equal(mouth.open, true)
  mouth.update(.1, 150); assert.equal(mouth.open, true)
  mouth.update(.1, 225); assert.equal(mouth.open, false)
})

test('head turn selects once and must return to center before selecting again', () => {
  const selector = new core.HeadPalette(); selector.setNeutral(.02)
  assert.equal(selector.update(.12, 0), 0)
  assert.equal(selector.update(.12, 180), 1)
  assert.equal(selector.update(.12, 500), 0)
  selector.update(.02, 600)
  selector.update(-.08, 650)
  assert.equal(selector.update(-.08, 830), -1)
})

test('mouth geometry and yaw stay scale independent', () => {
  const points = face(), closed = core.mouthOpenness(points), yaw = core.headYaw(points)
  assert.ok(closed < .12); assert.ok(Math.abs(yaw) < 1e-9)
  points[13].y = .56; points[14].y = .60
  assert.ok(core.mouthOpenness(points) > .5)
  points[1].x = .57; assert.ok(core.headYaw(points) > .1)
  assert.equal(core.mouthOpenness(points, .8), .8)
})
