import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const result = await build({ entryPoints: ['src/rubber-human-physics.ts'], bundle: true, format: 'esm', write: false })
const { flowPoint, springStep, localPoint, worldPoint, insidePolygon } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const near = (a, b, epsilon = 1e-8) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < epsilon, `${JSON.stringify(a)} != ${JSON.stringify(b)}`)
test('grabbed material point follows the pinch exactly, even for long pulls', () => {
  for (const pull of [{ x: 0, y: 0 }, { x: 3, y: -2 }, { x: -7, y: 1 }]) {
    const a = { x: .7, y: -.2 }
    near(flowPoint(a, a, pull), { x: a.x + pull.x, y: a.y + pull.y })
  }
})
test('long deformation remains locally unfolded and smooth', () => {
  const a = { x: .6, y: .2 }, pull = { x: 5, y: -2 }, e = .0001
  for (let x = -1; x < 1; x += .1) for (let y = -1; y < 1; y += .1) {
    const p = flowPoint({ x, y }, a, pull), dx = flowPoint({ x: x + e, y }, a, pull), dy = flowPoint({ x, y: y + e }, a, pull)
    const determinant = ((dx.x - p.x) * (dy.y - p.y) - (dy.x - p.x) * (dx.y - p.y)) / (e * e)
    assert.ok(determinant > 0, `fold at ${x},${y}: ${determinant}`)
  }
})
test('coordinate mapping survives mirror, rotation, resize and non-square faces', () => {
  const pose = { center: { x: 320, y: 270 }, right: { x: -120, y: 30 }, down: { x: 20, y: 180 } }
  near(localPoint(worldPoint({ x: .63, y: -.42 }, pose), pose), { x: .63, y: -.42 })
})
test('spring overshoots, settles and is independent of refresh rate', () => {
  function run(hz) {
    const p = { x: 3, y: -2 }, v = { x: 0, y: 0 }; let crossed = false
    for (let i = 0; i < hz * 2; i++) { springStep(p, v, 1 / hz); if (p.x < 0) crossed = true }
    assert.ok(crossed); assert.ok(Math.hypot(p.x, p.y) < .001)
    return p
  }
  near(run(30), run(144))
})
test('reduced-motion return never overshoots', () => {
  const p = { x: 2, y: 1 }, v = { x: -10, y: 5 }
  for (let i = 0; i < 120; i++) { springStep(p, v, 1 / 60, true); assert.ok(p.x >= 0 && p.y >= 0) }
  assert.ok(Math.hypot(p.x, p.y) < .001)
})
test('hit testing excludes points outside the face', () => {
  const polygon = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 }]
  assert.equal(insidePolygon({ x: 0, y: 0 }, polygon), true)
  assert.equal(insidePolygon({ x: 1.1, y: 0 }, polygon), false)
})
