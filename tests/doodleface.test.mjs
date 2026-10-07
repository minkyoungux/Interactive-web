import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const bundle = await build({ entryPoints: ['src/doodleface-core.ts'], bundle: true, format: 'esm', write: false })
const { owner, local, cover, project, pose, attach, resolve, predict, Pinch, Ink, Round, OVAL, TIMING } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const near = (p, q) => assert.ok(Math.hypot(p.x - q.x, p.y - q.y) < 1e-8, `${JSON.stringify(p)} != ${JSON.stringify(q)}`)
function face(time = 0) {
  const points = Array.from({ length: 478 }, () => ({ x: .5, y: .5 }))
  OVAL.forEach((id, i) => { const a = -Math.PI / 2 + i / OVAL.length * Math.PI * 2; points[id] = { x: .5 + Math.cos(a) * .25, y: .5 + Math.sin(a) * .3 } })
  points[33] = { x: .4, y: .4 }; points[263] = { x: .6, y: .4 }
  return pose(points, .8, time)
}
function hand(gap, x = .5) {
  const h = Array.from({ length: 21 }, () => ({ x, y: .6 }))
  h[5] = { x: x - .1, y: .6 }; h[17] = { x: x + .1, y: .6 }
  h[4] = { x: x - gap / 2, y: .5 }; h[8] = { x: x + gap / 2, y: .5 }
  return h
}
test('mirror ownership is fixed at half boundary and local half coordinates preserve y', () => {
  assert.equal(owner({ x: .75, y: .5 }), 0)
  assert.equal(owner({ x: .25, y: .5 }), 1)
  assert.equal(owner({ x: .5, y: .5 }), 1)
  near(local({ x: .9, y: .3 }, 0), { x: .2, y: .3 })
  near(local({ x: .4, y: .7 }, 1), { x: .2, y: .7 })
})
test('cover projection crops a half independently in landscape and portrait', () => {
  const wide = cover(640, 720, 500, 300), tall = cover(640, 720, 300, 500)
  near(project({ x: .5, y: .5 }, wide), { x: 250, y: 150 })
  near(project({ x: .5, y: .5 }, tall), { x: 150, y: 250 })
  assert.equal(wide.width, 500); assert.equal(tall.height, 500)
  assert.ok(wide.y < 0); assert.ok(tall.x < 0)
})
test('landmark attachment follows translation, scale, rotation and local expression', () => {
  const initial = face(), p = { x: .514, y: .513 }, a = attach(p, initial)
  near(resolve(a, initial), p)
  const angle = .65, scale = 1.5, c = Math.cos(angle), s = Math.sin(angle)
  const transform = p => ({ x: .6 + scale * (((p.x - .5) * initial.aspect) * c - (p.y - .5) * s) / initial.aspect, y: .4 + scale * (((p.x - .5) * initial.aspect) * s + (p.y - .5) * c) })
  const moved = pose(initial.points.map(transform), initial.aspect, 100)
  near(resolve(a, moved), transform(p))
  moved.points[a.index].y += .02
  near(resolve(a, moved), { ...transform(p), y: transform(p).y + .02 })
})
test('prediction is short, bounded, and stops when pose history is stale', () => {
  const initial = face(0), next = pose(initial.points.map(p => ({ x: p.x + .01, y: p.y })), .8, 100)
  assert.ok(predict(initial, next, 130).points[0].x > next.points[0].x)
  assert.ok(predict(initial, next, 130).points[0].x < next.points[0].x + .01)
  assert.equal(predict(initial, next, 500), next)
})
test('generous pinch threshold, hysteresis and stable 110ms release avoid flicker', () => {
  const p = new Pinch()
  assert.equal(p.update(hand(.12), 0, .8).started, true)
  p.update(hand(.15), 20, .8); assert.equal(p.down, true)
  p.update(hand(.18), 40, .8); p.update(hand(.18), 149, .8); assert.equal(p.down, true)
  assert.equal(p.update(hand(.18), 150, .8).ended, true)
})
test('220ms missing-hand grace preserves both pinch and last pen, then ends stroke', () => {
  const p = new Pinch(); p.update(hand(.01), 100, 1); const point = p.point
  p.update(null, 320, 1); assert.equal(p.down, true); assert.equal(p.point, point)
  assert.equal(p.update(null, 321, 1).ended, true); assert.equal(p.point, null)
  assert.equal(p.update(hand(.01), 330, 1).started, true)
})
test('missing hand cannot count as a stable-open release', () => {
  const p = new Pinch(); p.update(hand(.01), 0, 1); p.update(hand(.2), 10, 1)
  p.update(null, 100, 1); p.update(hand(.2), 150, 1); assert.equal(p.down, true)
  p.update(hand(.2), 260, 1); assert.equal(p.down, false)
})
test('new stroke must begin inside face, may continue outside and cannot begin on palette', () => {
  const ink = new Ink(), f = face()
  ink.sample({ x: .02, y: .02 }, f, true, true, 'red', false)
  ink.sample({ x: .5, y: .5 }, f, false, true, 'red', false)
  assert.equal(ink.strokes.length, 0)
  ink.sample({ x: .5, y: .5 }, f, true, true, 'red', false)
  assert.equal(ink.strokes[0].points.length, 1, 'first point is immediately available')
  ink.sample({ x: .99, y: .99 }, f, false, true, 'red', false)
  assert.equal(ink.strokes[0].points.length, 2)
  ink.sample({ x: .5, y: .5 }, f, true, true, 'blue', true)
  assert.equal(ink.strokes.length, 1); assert.equal(ink.active, null)
})
test('both faces need 650ms continuous recognition; missing face resets countdown', () => {
  const r = new Round(); r.phase = 'waiting'
  for (let t = 0; t <= 600; t += 100) r.faces([true, true], t)
  assert.equal(r.phase, 'waiting'); r.faces([true, true], 650)
  assert.equal(r.phase, 'countdown'); assert.equal(r.deadline, 5650)
  r.faces([true, false], 700); assert.equal(r.phase, 'waiting')
  for (let t = 800; t <= 1500; t += 100) r.faces([true, true], t)
  assert.equal(r.phase, 'countdown')
})
test('sparse observations cannot count toward stable face time', () => {
  const r = new Round(); r.phase = 'waiting'; r.faces([true, true], 0); r.faces([true, true], 900)
  assert.equal(r.phase, 'waiting')
})
test('60 seconds begin only after swap finishes; reveal 2.4s then result 10s', () => {
  const r = new Round(); r.phase = 'countdown'; r.deadline = 5000
  r.tick(5000); assert.equal(r.phase, 'swapping')
  r.tick(5850); assert.equal(r.phase, 'swapping')
  r.swapped(5887); assert.equal(r.deadline, 65887)
  r.tick(65886); assert.equal(r.phase, 'playing')
  r.tick(65887); assert.equal(r.phase, 'reveal')
  r.tick(68286); assert.equal(r.phase, 'reveal')
  r.tick(68287); assert.equal(r.phase, 'result')
  r.tick(78286); assert.equal(r.phase, 'result')
  r.tick(78287); assert.equal(r.phase, 'lobby')
  assert.equal(TIMING.swap, 850)
})
