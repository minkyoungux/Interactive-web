// Every particle owns its displacement, velocity, mass and recovery time.
// Forces are measured in screen space, so the interaction sits under a finger
// even when the galaxy is tilted or the viewport is narrow.
export class ParticleDynamics {
  constructor(positions, seeds, { orbit = true } = {}) {
    this.source = positions;
    this.seeds = seeds;
    this.count = seeds.length;
    this.offsets = new Float32Array(this.count * 2);
    this.motion = new Float32Array(this.count * 2);
    this.displacements = new Float32Array(this.count * 2);
    this.velocities = new Float32Array(this.count * 2);
    this.orbits = new Float32Array(this.count);
    this.phases = new Float32Array(this.count * 2);
    for (let i = 0; i < this.count; i++) {
      this.orbits[i] = orbit ? .018 + .022 / (Math.hypot(positions[i * 3], positions[i * 3 + 1]) + .4) : 0;
      this.phases[i * 2] = Math.sin(seeds[i] * 100);
      this.phases[i * 2 + 1] = Math.cos(seeds[i] * 100);
    }
  }

  reset() {
    this.offsets.fill(0); this.motion.fill(0);
    this.displacements.fill(0); this.velocities.fill(0);
  }

  step(dt, time, matrix, aspect, height, touches, releases = []) {
    const frames = Math.min(dt * 60, 2);
    const pixel = 2 / height;
    const waveSin = Math.sin(time * .83), waveCos = Math.cos(time * .83);
    for (let i = 0; i < this.count; i++) {
      const j = i * 2, k = i * 3, seed = this.seeds[i];
      const angle = time * this.orbits[i], c = Math.cos(angle), s = Math.sin(angle);
      const x = c * this.source[k] + s * this.source[k + 1];
      const y = -s * this.source[k] + c * this.source[k + 1];
      const z = this.source[k + 2];
      const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
      const homeX = (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) / w * aspect;
      const homeY = (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) / w;
      let ox = this.displacements[j], oy = this.displacements[j + 1];
      let vx = this.velocities[j], vy = this.velocities[j + 1];
      const mass = .6 + seed * 1.4;
      const spring = .0018 + seed * .002;
      // Independent slow drift remains visible even with no touch input.
      vx += (-ox * spring + (waveSin * this.phases[j] + waveCos * this.phases[j + 1]) * .000025) * frames;
      vy += (-oy * spring + (waveCos * this.phases[j] - waveSin * this.phases[j + 1]) * .000025) * frames;
      const px = homeX + ox, py = homeY + oy;
      for (const touch of touches) {
        const radius = (touch.down ? 155 : 105) * pixel;
        const sx = touch.x - touch.previousX, sy = touch.y - touch.previousY;
        const lengthSquared = sx * sx + sy * sy;
        const t = lengthSquared > .0000001 ? Math.max(0, Math.min(1, ((px - touch.previousX) * sx + (py - touch.previousY) * sy) / lengthSquared)) : 1;
        const dx = px - (touch.previousX + sx * t), dy = py - (touch.previousY + sy * t);
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared > radius * radius) continue;
        const distance = Math.sqrt(distanceSquared);
        const falloff = Math.pow(1 - distance / radius, 2);
        const travelX = Math.max(-.12, Math.min(.12, sx / Math.max(.2, frames)));
        const travelY = Math.max(-.12, Math.min(.12, sy / Math.max(.2, frames)));
        if (touch.down) {
          // Holding gathers a small orbit. Dragging carries each star with inertia.
          const centerX = px - touch.x, centerY = py - touch.y;
          vx += (-centerX * .032 - centerY * .013 + travelX * .22) * falloff / mass * frames;
          vy += (-centerY * .032 + centerX * .013 + travelY * .22) * falloff / mass * frames;
        } else {
          const normal = Math.max(distance, pixel);
          vx += (dx / normal * .0018 + travelX * .18) * falloff / mass * frames;
          vy += (dy / normal * .0018 + travelY * .18) * falloff / mass * frames;
        }
      }
      for (const release of releases) {
        const dx = px - release.x, dy = py - release.y;
        const radius = 180 * pixel, distance = Math.hypot(dx, dy);
        if (distance < radius) {
          const force = Math.pow(1 - distance / radius, 1.5) * (.009 + seed * .014) / mass;
          // Seeds break symmetry, so releases scatter individual stars naturally.
          const angle = seed * 31.4;
          vx += (dx / Math.max(pixel, distance) + Math.cos(angle) * .3) * force;
          vy += (dy / Math.max(pixel, distance) + Math.sin(angle) * .3) * force;
        }
      }
      const damping = Math.pow(.953 + seed * .025, frames);
      vx = Math.max(-.09, Math.min(.09, vx * damping));
      vy = Math.max(-.09, Math.min(.09, vy * damping));
      ox += vx * frames; oy += vy * frames;
      this.displacements[j] = ox; this.displacements[j + 1] = oy;
      this.velocities[j] = vx; this.velocities[j + 1] = vy;
      this.offsets[j] = ox / aspect; this.offsets[j + 1] = oy;
      this.motion[j] = vx / pixel; this.motion[j + 1] = vy / pixel;
    }
  }
}
