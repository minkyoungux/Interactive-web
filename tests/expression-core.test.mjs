import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

const source = await readFile(new URL('../src/expression-core.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
const { BlinkPulse, SignalSmoother, expressionFromFace } = await import(moduleUrl)

const shapes = values => Object.entries(values).map(([categoryName, score]) => ({ categoryName, score }))

test('expression values combine bilateral blendshapes and stay normalized', () => {
  const points = Array.from({ length: 478 }, () => ({ x: .5, y: .5 }))
  points[33] = { x: .35, y: .4 }; points[263] = { x: .65, y: .46 }
  const value = expressionFromFace(points, shapes({ mouthSmileLeft: .7, mouthSmileRight: .9, jawOpen: .4, browInnerUp: .8 }))
  assert.equal(value.smile, 1)
  assert.ok(value.mouth > .5)
  assert.ok(value.brow > .4)
  assert.ok(value.tilt > 0)
  Object.values(value).forEach(item => assert.ok(item >= -1 && item <= 1))
})

test('blink pulse fires once until eyes open again', () => {
  const pulse = new BlinkPulse()
  assert.equal(pulse.update(.7), true)
  assert.equal(pulse.update(.9), false)
  assert.equal(pulse.update(.2), false)
  assert.equal(pulse.update(.7), true)
})

test('signal smoothing moves toward a target without jumping', () => {
  const smoother = new SignalSmoother()
  const target = { smile: 1, mouth: 1, blink: 1, brow: 1, tilt: 1, energy: 1 }
  const first = smoother.update(target, 100)
  assert.ok(first.smile > 0 && first.smile < 1)
  assert.ok(smoother.update(target, 180).smile > first.smile)
})
