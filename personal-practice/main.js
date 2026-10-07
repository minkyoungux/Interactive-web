import * as THREE from 'three';
import { WaterSurface } from './water-surface.js';

const canvas = document.querySelector('#field');
const pauseButton = document.querySelector('#pause');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let paused = reducedMotion.matches;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
} catch {
  document.querySelector('#fallback').hidden = false;
  document.querySelector('.controls').hidden = true;
}
if (renderer) startWater(renderer);

function startWater(renderer) {
  renderer.setClearColor('#dce8ec');
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  camera.position.set(0, .15, 10.5);
  const clock = new THREE.Clock();
  const touches = new Map(), ripples = [], beads = [];
  const raycaster = new THREE.Raycaster();
  const hitSphere = new THREE.Sphere(new THREE.Vector3(), 2.25);
  const hit = new THREE.Vector3();
  const keyboard = new THREE.Vector2(0, 0);
  let elapsed = 0, width = 1, height = 1;

  // A real studio environment supplies long white reflections and dark edges.
  // Transmission through the backdrop uses water's index of refraction (1.333).
  const studio = new THREE.Scene();
  studio.background = new THREE.Color('#83999f');
  function softbox(x, y, z, sx, sy, intensity, tint = '#ffffff') {
    const material = new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(tint).multiplyScalar(intensity) } },
      side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform vec3 tint;varying vec2 vUv;void main(){vec2 p=abs(vUv-.5)*2.0;float a=(1.0-smoothstep(.6,1.0,p.x))*(1.0-smoothstep(.7,1.0,p.y));gl_FragColor=vec4(tint*a,1.0);}`,
    });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), material);
    panel.position.set(x, y, z); panel.lookAt(0, 0, 0); studio.add(panel);
  }
  softbox(-4, 4, 3, 2.7, 7, 5.5);
  softbox(5, 1, 1, 1.1, 8, 3.5, '#d3f3ff');
  softbox(0, 6, -3, 7, 3, 4.5);
  softbox(-2, -4, 2, 6, 1.2, 1.2, '#b2d7e4');
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: '#0a1821', side: THREE.DoubleSide }));
  dark.position.set(0, 0, -6); studio.add(dark);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(studio, .045);
  scene.environment = environment.texture;
  pmrem.dispose();
  studio.traverse(object => { if (object.isMesh) { object.geometry.dispose(); object.material.dispose(); } });

  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.ShaderMaterial({
    depthWrite: false,
    vertexShader: `varying vec3 vWorld;void main(){vec4 p=modelMatrix*vec4(position,1.0);vWorld=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
    fragmentShader: `varying vec3 vWorld;void main(){vec2 p=vWorld.xy;float gradient=smoothstep(-8.0,7.0,p.y);vec3 color=mix(vec3(.43,.57,.63),vec3(.88,.94,.95),gradient);float pool=exp(-pow(p.x*.19,2.0)-pow((p.y+4.7)*1.5,2.0));color+=vec3(.10,.16,.17)*pool;gl_FragColor=vec4(color,1.0);}`,
  }));
  backdrop.position.z = -8; scene.add(backdrop);

  const material = new THREE.MeshPhysicalMaterial({
    color: '#ecfcff', metalness: 0, roughness: .045,
    transmission: 1, thickness: 3.6, ior: 1.333,
    attenuationColor: new THREE.Color('#94d6e7'), attenuationDistance: 6.5,
    envMapIntensity: 1.15, clearcoat: .35, clearcoatRoughness: .045,
  });
  const geometry = new THREE.SphereGeometry(1, 144, 104);
  const normals = new Float32Array(geometry.attributes.position.array);
  const surface = new WaterSurface(normals);
  geometry.setAttribute('position', new THREE.BufferAttribute(surface.positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.computeVertexNormals();
  const drop = new THREE.Mesh(geometry, material);
  drop.frustumCulled = false;
  scene.add(drop);

  // A soft light pool below the suspended drop anchors it in the scene.
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 1.4), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vUv;void main(){vec2 p=(vUv-.5)*2.0;float r=dot(p,p);float shadow=exp(-r*5.0)*.14;float light=exp(-pow((length(p)-.5)*11.0,2.0))*.045;gl_FragColor=vec4(vec3(.17,.38,.44)+light,shadow);}`,
  }));
  pool.position.set(0, -2.92, -1); scene.add(pool);
  const beadGeometry = new THREE.SphereGeometry(1, 24, 16);

  function addRipple(normal, strength = .055) {
    if (paused || !normal) return;
    if (ripples.length >= 8) ripples.shift();
    ripples.push({ x: normal.x, y: normal.y, z: normal.z, start: elapsed, strength });
  }
  function splash(normal, speed) {
    addRipple(normal, .065);
    if (paused || !normal) return;
    for (let i = 0; i < 7; i++) {
      if (beads.length >= 35) {
        const old = beads.shift(); scene.remove(old.mesh);
      }
      const direction = normal.clone().add(new THREE.Vector3(Math.sin(i * 2.4) * .22, Math.cos(i * 1.7) * .22, .12)).normalize();
      const size = .035 + (i % 3) * .018;
      const mesh = new THREE.Mesh(beadGeometry, material);
      mesh.scale.setScalar(size); mesh.position.copy(direction).multiplyScalar(2.12);
      scene.add(mesh);
      beads.push({ mesh, direction, size, birth: elapsed, speed: .5 + i * .11 + Math.min(speed, 2) * .13 });
    }
  }
  function updateSurface(dt) {
    const active = [...touches.values()].filter(t => t.normal).map(t => ({ ...t.normal, down: t.down, speed: t.speed }));
    surface.step(dt, elapsed, active, ripples);
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    for (let i = ripples.length - 1; i >= 0; i--) if (elapsed - ripples[i].start > 4) ripples.splice(i, 1);
    for (let i = beads.length - 1; i >= 0; i--) {
      const bead = beads[i], age = elapsed - bead.birth;
      if (age > 1.55) { scene.remove(bead.mesh); beads.splice(i, 1); continue; }
      const flight = Math.sin(Math.min(1, age / 1.55) * Math.PI);
      bead.mesh.position.copy(bead.direction).multiplyScalar(2.12 + flight * bead.speed);
      bead.mesh.position.y -= Math.sin(age / 1.55 * Math.PI) * age * .10;
      bead.mesh.scale.setScalar(bead.size * Math.min(1, age * 14) * Math.min(1, (1.55 - age) * 6));
    }
    for (const touch of touches.values()) touch.speed *= Math.exp(-dt * 10);
  }

  function projectTouch(x, y) {
    camera.updateMatrixWorld();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    if (!raycaster.ray.intersectSphere(hitSphere, hit)) return null;
    return hit.clone().normalize();
  }
  function locate(event) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / width * 2 - 1;
    const y = -(event.clientY - rect.top) / height * 2 + 1;
    const normal = projectTouch(x, y);
    let touch = touches.get(event.pointerId);
    if (!touch) {
      if (touches.size >= 5) return null;
      touch = { normal, down: false, speed: 0, lastRipple: -1, lastNormal: normal };
      touches.set(event.pointerId, touch);
    }
    if (normal && touch.normal) touch.speed = Math.min(3, normal.distanceTo(touch.normal) * 18);
    touch.normal = normal;
    if (normal) touch.lastNormal = normal;
    if (normal && touch.speed > .09 && elapsed - touch.lastRipple > .12) {
      addRipple(normal, Math.min(.038, .008 + touch.speed * .015));
      touch.lastRipple = elapsed;
    }
    canvas.style.cursor = normal ? (touch.down ? 'grabbing' : 'grab') : 'default';
    return touch;
  }
  canvas.addEventListener('pointermove', locate);
  canvas.addEventListener('pointerdown', event => {
    const touch = locate(event);
    if (!touch) return;
    touch.down = true; addRipple(touch.normal, .035);
    canvas.setPointerCapture(event.pointerId);
    if (touch.normal) canvas.style.cursor = 'grabbing';
  });
  function release(event) {
    const touch = touches.get(event.pointerId);
    if (touch?.down && event.type === 'pointerup') splash(touch.normal || touch.lastNormal, touch.speed);
    if (touch) touch.down = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (event.pointerType !== 'mouse' || event.type === 'pointercancel') touches.delete(event.pointerId);
    canvas.style.cursor = touch?.normal ? 'grab' : 'default';
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', event => touches.delete(event.pointerId));
  canvas.addEventListener('pointerleave', event => { if (!canvas.hasPointerCapture(event.pointerId)) touches.delete(event.pointerId); });
  window.addEventListener('blur', () => touches.clear());
  canvas.addEventListener('keydown', event => {
    const movement = { ArrowLeft: [-.07, 0], ArrowRight: [.07, 0], ArrowUp: [0, .07], ArrowDown: [0, -.07] }[event.key];
    if (movement) {
      event.preventDefault(); keyboard.x = THREE.MathUtils.clamp(keyboard.x + movement[0], -.55, .55); keyboard.y = THREE.MathUtils.clamp(keyboard.y + movement[1], -.55, .55);
      const normal = projectTouch(keyboard.x, keyboard.y);
      touches.set('keyboard', { normal, down: false, speed: .5 }); addRipple(normal, .02);
    } else if (event.code === 'Space') {
      event.preventDefault();
      touches.set('keyboard', { normal: projectTouch(keyboard.x, keyboard.y), down: true, speed: 0 });
    }
  });
  canvas.addEventListener('keyup', event => {
    if (event.code === 'Space') {
      event.preventDefault(); const touch = touches.get('keyboard');
      if (touch) splash(touch.normal, .5); touches.delete('keyboard');
    }
  });
  canvas.addEventListener('blur', () => touches.delete('keyboard'));
  function setPaused(value) {
    if (typeof value !== 'boolean') throw new Error('paused must be a boolean');
    paused = value; touches.clear();
    pauseButton.setAttribute('aria-pressed', String(paused));
    document.querySelector('#pause-icon').textContent = paused ? '▷' : 'Ⅱ';
    document.querySelector('#pause-label').textContent = paused ? '재생' : '일시정지';
  }
  pauseButton.addEventListener('click', () => setPaused(!paused));
  document.querySelector('#reset').addEventListener('click', () => {
    elapsed = 0; touches.clear(); ripples.length = 0; keyboard.set(0, 0);
    beads.forEach(bead => scene.remove(bead.mesh)); beads.length = 0;
    surface.reset(); updateSurface(0); renderer.render(scene, camera);
  });
  reducedMotion.addEventListener('change', () => setPaused(reducedMotion.matches));
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); setPaused(true); document.querySelector('#fallback').hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    document.querySelector('#fallback').hidden = true; setPaused(reducedMotion.matches); resize();
  });
  function resize() {
    width = canvas.clientWidth; height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.position.z = 2.55 / (Math.tan(THREE.MathUtils.degToRad(19)) * Math.min(1, camera.aspect) * .77) + .65;
    camera.updateProjectionMatrix(); touches.clear();
    renderer.render(scene, camera);
  }
  new ResizeObserver(resize).observe(canvas);
  setPaused(paused); resize();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 30);
    if (paused || document.hidden) return;
    elapsed += dt; updateSurface(dt); renderer.render(scene, camera);
  });

  if (document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    try {
      Promise.resolve(document.modelContext.registerTool({
        name: 'set_water_paused', description: '물방울의 움직임을 정지하거나 재생합니다.',
        inputSchema: { type: 'object', properties: { paused: { type: 'boolean' } }, required: ['paused'], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) { setPaused(input?.paused); return { paused }; },
      }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* The visible controls are available without WebMCP. */ }
    window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
  }
}
