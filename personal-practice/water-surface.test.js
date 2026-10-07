import test from 'node:test';
import assert from 'node:assert/strict';
import { WaterSurface } from './water-surface.js';
const normals = new Float32Array([0, 0, 1, 0, 0, -1, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0]);
const touch = { x: 0, y: 0, z: 1, down: true, speed: 0 };

test('pressing dents the touched surface while the opposite side stays stable', () => {
  const surface = new WaterSurface(normals);
  for (let i = 0; i < 30; i++) surface.step(1 / 60, i / 60, [touch], []);
  assert.ok(surface.displacement[0] < -.1);
  assert.ok(Math.abs(surface.displacement[1]) < .00001);
});
test('surface settles after release and keeps a finite positive radius', () => {
  const surface = new WaterSurface(normals);
  for (let i = 0; i < 120; i++) surface.step(1 / 60, i / 60, [touch], []);
  for (let i = 0; i < 600; i++) surface.step(1 / 60, 2 + i / 60, [], []);
  assert.ok([...surface.displacement].every(d => Math.abs(d) < .0001));
  assert.ok([...surface.positions].every(Number.isFinite));
  for (let i = 0; i < normals.length; i += 3) assert.ok(Math.hypot(...surface.positions.slice(i, i + 3)) > 1.5);
});
test('a released ripple travels beyond the contact point then expires', () => {
  const surface = new WaterSurface(normals), quiet = new WaterSurface(normals);
  const ripple = { ...touch, start: 0, strength: .08 };
  surface.step(0, .7, [], [ripple]); quiet.step(0, .7, [], []);
  assert.ok(Math.abs(surface.positions[6] - quiet.positions[6]) > .01);
  surface.step(0, 5, [], [ripple]); quiet.step(0, 5, [], []);
  assert.deepEqual(surface.positions, quiet.positions);
});
test('duplicate seam vertices remain coincident under touch and waves', () => {
  const surface = new WaterSurface(new Float32Array([0, 0, 1, 0, 0, 1]));
  for (let i = 0; i < 60; i++) surface.step(1 / 60, i / 60, [touch], [{ ...touch, start: 0, strength: .05 }]);
  assert.deepEqual(surface.positions.slice(0, 3), surface.positions.slice(3));
  surface.reset();
  assert.ok([...surface.velocity, ...surface.displacement].every(x => x === 0));
});
