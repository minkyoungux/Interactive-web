import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({ entryPoints: ['src/season-forest-ocean.ts'], bundle: true, format: 'esm', write: false })
const { isOpenWater, routeIsClear, makeSwimRoutes, swimPosition, waterFootprint, advanceSwimReaction, advanceTreeSpring } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const shores = [
  { lat: .4, lon: .2, width: .35, height: .25, phase: 1 },
  { lat: -.4, lon: -.6, width: .4, height: .3, phase: 3 },
  { lat: .1, lon: Math.PI - .05, width: .3, height: .3, phase: 2 },
]

test('trees stay bounded during shaking and settle at different frame rates', () => {
  for (const hz of [30, 60, 120]) {
    const tree = { x: 0, z: 0, vx: 0, vz: 0 }
    for (let i = 0; i < hz * 2; i++) {
      tree.vx += 20 / hz
      tree.vz -= 20 / hz
      advanceTreeSpring(tree, 1 / hz)
      assert.ok(Math.hypot(tree.x, tree.z) <= .650001)
    }
    assert.ok(Math.hypot(tree.x, tree.z) > .1)
    for (let i = 0; i < hz * 6; i++) advanceTreeSpring(tree, 1 / hz)
    assert.ok(Math.abs(tree.x) + Math.abs(tree.z) + Math.abs(tree.vx) + Math.abs(tree.vz) < .00015)
  }
})

test('startled swimmers leave their routes, avoid shorelines and recover', () => {
  for (const route of makeSwimRoutes(shores)) {
    const state = { phase: .3, panic: 1, x: 0, y: 0, vx: .4, vy: -.3 }
    let departure = 0
    for (let i = 0; i < 60 * 12; i++) {
      const p = advanceSwimReaction(state, route, .16, 1 / 60, shores)
      assert.ok(waterFootprint(p.lat, p.lon, shores), 'body stays off the beach during escape')
      departure = Math.max(departure, Math.hypot(state.x, state.y))
    }
    assert.ok(departure > .001)
    assert.ok(state.panic < .00001)
    assert.ok(Math.hypot(state.x, state.y) < .0001)
  }
})

test('water mask rejects islands, wrapped coastlines and polar ice', () => {
  assert.equal(isOpenWater(.4, .2, shores), false)
  assert.equal(isOpenWater(.1, -Math.PI + .04, shores), false)
  assert.equal(isOpenWater(1.4, 0, shores), false)
  assert.equal(isOpenWater(0, 1.5, shores), true)
  assert.equal(routeIsClear({ lat: .4, lon: .2, width: .08, height: .03, rotation: 0 }, .07, shores), false)
})

test('swimmers complete closed loops while keeping their body footprint off the beach', () => {
  const routes = makeSwimRoutes(shores)
  assert.equal(routes.length, 24)
  for (const route of routes) {
    const start = swimPosition(route, 0), end = swimPosition(route, Math.PI * 2)
    assert.ok(Math.hypot(start.lat - end.lat, start.lon - end.lon) < 1e-10)
    // Sample between the route planner checkpoints and around each creature's body.
    for (let i = 0; i < 997; i++) {
      const p = swimPosition(route, i / 997 * Math.PI * 2)
      for (let j = 0; j < 16; j++) {
        const a = j / 16 * Math.PI * 2
        assert.ok(isOpenWater(p.lat + Math.sin(a) * .068, p.lon + Math.cos(a) * .068 / Math.cos(p.lat), shores))
      }
    }
  }
})
