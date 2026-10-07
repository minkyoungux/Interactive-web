// A damped radial spring at every mesh vertex gives the drop a soft skin.
export class WaterSurface {
  constructor(normals, radius = 2.15) {
    this.normals = normals;
    this.radius = radius;
    this.positions = new Float32Array(normals.length);
    this.displacement = new Float32Array(normals.length / 3);
    this.velocity = new Float32Array(normals.length / 3);
    this.reset();
  }
  reset() {
    this.displacement.fill(0); this.velocity.fill(0);
    this.step(0, 0, [], []);
  }
  step(dt, time, touches, ripples) {
    const frames = Math.min(dt * 60, 2);
    for (let i = 0; i < this.displacement.length; i++) {
      const k = i * 3, nx = this.normals[k], ny = this.normals[k + 1], nz = this.normals[k + 2];
      let d = this.displacement[i], velocity = this.velocity[i];
      velocity -= d * .013 * frames;
      for (const touch of touches) {
        const dot = Math.max(-1, Math.min(1, nx * touch.x + ny * touch.y + nz * touch.z));
        const falloff = Math.exp(-(1 - dot) * 19);
        velocity -= (touch.down ? .0038 : .0006) * falloff * frames;
        velocity += touch.speed * .005 * Math.sin((1 - dot) * 18) * falloff * frames;
      }
      velocity *= Math.pow(.935, frames);
      d = Math.max(-.25, Math.min(.22, d + velocity * frames));
      this.displacement[i] = d; this.velocity[i] = velocity;
      let wave = 0;
      for (const ripple of ripples) {
        const age = time - ripple.start;
        if (age < 0 || age > 4) continue;
        const dot = Math.max(-1, Math.min(1, nx * ripple.x + ny * ripple.y + nz * ripple.z));
        const angle = Math.acos(dot);
        const front = angle - age * 1.8;
        wave += Math.sin(front * 15) * Math.exp(-front * front * 3) * Math.exp(-age * 1.3) * ripple.strength;
      }
      // Low modes change the silhouette, with small capillary waves on top.
      const breathe = Math.sin(time * 1.4) * .018;
      const flow = Math.sin(nx * 3.3 + ny * 2.7 + time * 1.15) * Math.sin(nz * 3.1 - ny * 2.8 - time * .7) * .027;
      const capillary = Math.sin(nx * 8 + nz * 5 + time * 1.6) * Math.sin(ny * 7 - time * 1.1) * .003;
      const radius = this.radius * (1 + d + wave + flow + capillary);
      this.positions[k] = nx * radius * (1 - breathe * .5);
      this.positions[k + 1] = ny * radius * (1.05 + breathe) + .06 * (ny * ny);
      this.positions[k + 2] = nz * radius * (1 - breathe * .5);
    }
  }
}
