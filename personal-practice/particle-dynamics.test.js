import test from 'node:test';
import assert from 'node:assert/strict';
import { ParticleDynamics } from './particle-dynamics.js';
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const create = (points) => new ParticleDynamics(new Float32Array(points.flatMap(x => [x, 0, 0])), new Float32Array(points.map((_, i) => .2 + i * .1)));
const touch = (x, previousX = x, down = false) => ({ x, y: 0, previousX, previousY: 0, down });
const step = (p, touches = [], releases = []) => p.step(1 / 60, 0, identity, 1, 1000, touches, releases);

test('a moving brush pushes local particles and leaves momentum after it exits', () => {
  const particles = create([.05, .8]);
  step(particles, [touch(.08, 0)]);
  assert.ok(particles.velocities[0] > .005);
  assert.ok(Math.abs(particles.velocities[2]) < .0001);
  const firstOffset = particles.displacements[0];
  step(particles);
  assert.ok(particles.displacements[0] > firstOffset, 'motion persists after pointer leaves');
});
test('a swept touch hits particles between events, including fast swipes', () => {
  const particles = create([.4]);
  step(particles, [touch(.8, 0)]);
  assert.ok(particles.velocities[0] > .01);
});
test('holding gathers particles; release imparts a distinct outward impulse', () => {
  const particles = create([.1]);
  step(particles, [touch(0, 0, true)]);
  assert.ok(particles.velocities[0] < 0);
  const before = particles.velocities[0];
  step(particles, [], [{ x: 0, y: 0 }]);
  assert.ok(particles.velocities[0] > before + .005);
});
test('two fingers act independently', () => {
  const particles = create([-.45, .55]);
  step(particles, [touch(-.5), touch(.5)]);
  assert.ok(particles.velocities[0] > .0005);
  assert.ok(particles.velocities[2] > .0005);
});
test('particles stay finite, recover after force, and reset clears momentum', () => {
  const particles = create([.1, .12, .14, .16]);
  for (let i = 0; i < 90; i++) step(particles, [touch(.2, .15, true)]);
  step(particles, [], [{ x: .2, y: 0 }]);
  for (let i = 0; i < 800; i++) step(particles);
  assert.ok([...particles.displacements, ...particles.velocities].every(Number.isFinite));
  assert.ok([...particles.displacements].every(x => Math.abs(x) < .035));
  particles.reset();
  assert.ok([...particles.displacements, ...particles.velocities, ...particles.offsets, ...particles.motion].every(x => x === 0));
});

test('a flowing sphere uses updated surface homes without extra orbital rotation', () => {
  const source = new Float32Array([0, 0, 0]);
  const particles = new ParticleDynamics(source, new Float32Array([.3]), { orbit: false });
  source[0] = .45;
  particles.step(1 / 60, 20, identity, 1, 1000, [touch(.4)]);
  assert.ok(particles.velocities[0] > .0005, 'touch hits the current surface location');
});
