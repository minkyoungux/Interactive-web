import './prism-face.css'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { cameraProjection, clamp, dispersion, yawFromMatrix, type FacePoint } from './prism-face-physics'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <canvas class="prism-world" tabindex="0" aria-label="무지갯빛 입자로 이루어진 얼굴. 미리보기에서 좌우로 드래그하거나 방향키로 얼굴을 돌려보세요."></canvas>
  <video class="prism-video" playsinline muted aria-hidden="true"></video>
  <main class="prism-ui">
    <header class="prism-header">
      <a class="prism-brand" href="${import.meta.env.BASE_URL}#prism-face"><i class="prism-mark" aria-hidden="true"></i> PRISM FACE</a>
      <div class="prism-status" role="status" aria-live="polite"><i aria-hidden="true"></i><span>PREVIEW · 미리보기</span></div>
    </header>
    <section class="prism-intro"><p class="prism-eyebrow">MATTER INTO LIGHT / EXPERIMENT 16</p><h1>빛으로<br>풀어지는 <em>얼굴.</em></h1><p>고개를 돌리면, 수천의 작은 우주로.<br>다시 마주하면, 온전히 당신으로.</p></section>
    <span class="prism-side">IRIDESCENT MATTER — 2026</span>
    <div class="prism-caption"><span>A PORTRAIT, IN PARTICLES</span><p id="prism-guide">좌우로 드래그해 얼굴을 돌려보세요.<br>카메라를 켜면 당신의 얼굴이 빛이 됩니다.</p></div>
    <section class="prism-controls" aria-label="빛과 입자 설정">
      <p class="prism-control-heading">LIGHT LAB <b>01 / LIVE PORTRAIT</b></p>
      <label class="prism-slider"><span>흩어짐 <output id="scatter-value">1.0×</output></span><input id="scatter-input" type="range" min="0.4" max="2" step="0.1" value="1" aria-label="입자 흩어짐 강도" /></label>
      <label class="prism-slider"><span>무지갯빛 <output id="light-value">70%</output></span><input id="light-input" type="range" min="0" max="100" step="1" value="70" aria-label="무지갯빛 강도" /></label>
      <p class="prism-error" role="alert" hidden></p>
      <div class="prism-actions"><button class="prism-start" id="prism-camera" type="button">카메라 켜기 ↗</button><button id="prism-reset" type="button">다시 모으기</button></div>
      <p class="prism-note">카메라 영상은 기기 안에서만 처리됩니다.</p>
    </section>
    <footer class="prism-footer"><div class="prism-spectrum"><i aria-hidden="true"></i><span>VISIBLE / 380—750 nm</span></div><span>DISPERSION <b class="prism-percent">00%</b></span></footer>
  </main>
`
const canvas = document.querySelector<HTMLCanvasElement>('.prism-world')!
const video = document.querySelector<HTMLVideoElement>('.prism-video')!
const status = document.querySelector<HTMLElement>('.prism-status span')!
const guide = document.querySelector<HTMLElement>('#prism-guide')!
const error = document.querySelector<HTMLElement>('.prism-error')!
const cameraButton = document.querySelector<HTMLButtonElement>('#prism-camera')!
const meter = document.querySelector<HTMLElement>('.prism-percent')!
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
type Canonical = { vertices: number[][]; uv: number[][]; triangles: number[] }
let disposed = false
let cleanup: (() => void) | undefined
function dispose() { disposed = true; cleanup?.() }
window.addEventListener('interactive:dispose', dispose, { once: true })
window.addEventListener('pagehide', dispose, { once: true })

async function start() {
  const response = await fetch(`${import.meta.env.BASE_URL}prism-face/canonical-face.json`)
  if (!response.ok) throw new Error('얼굴 데이터를 불러오지 못했어요. 새로고침해 주세요.')
  const model: Canonical = await response.json()
  if (disposed) return
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  renderer.setClearColor('#08090c')
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 2000)
  camera.position.z = 1000
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .57, .6, .83)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  let width = innerWidth, height = innerHeight, pixelRatio = 1
  let time = 0, lastFrame = performance.now(), raf = 0
  let sensitivity = 1, light = .7, scatter = 0, yaw = 0, yawSpeed = 0
  let demoYaw = 0, demoTarget = 0, demoPitch = 0, pointer = false
  let live = false, starting = false, generation = 0, faceSeen = -Infinity
  let worker: Worker | null = null, stream: MediaStream | null = null
  let workerReady = false, busy = false, lastInference = 0, lastVideo = -1
  let latestFace: FacePoint[] | null = null, latestYaw = 0, neutralYaw: number | null = null
  let previousYaw = 0, poseAt = 0, uiAt = 0, visibility = 1, initialized = false
  const face = new Float32Array(468 * 3)
  const faceGeometry = new THREE.BufferGeometry()
  faceGeometry.setAttribute('position', new THREE.BufferAttribute(face, 3).setUsage(THREE.DynamicDrawUsage))
  faceGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(model.uv.flat()), 2))
  faceGeometry.setIndex(model.triangles)

  // Stratified triangle coverage and low-discrepancy barycentrics avoid sparse patches.
  const triangleArea: number[] = []
  let totalArea = 0
  for (let i = 0; i < model.triangles.length; i += 3) {
    const a = model.vertices[model.triangles[i]], b = model.vertices[model.triangles[i + 1]], c = model.vertices[model.triangles[i + 2]]
    const u = b.map((v, j) => v - a[j]), v = c.map((p, j) => p - a[j])
    totalArea += Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]) * .5
    triangleArea.push(totalArea)
  }
  const count = innerWidth < 700 ? 60000 : 120000
  const positions = new Float32Array(count * 3), velocities = new Float32Array(count * 3)
  const anchors = new Uint16Array(count * 3), weights = new Float32Array(count * 3)
  const uv = new Float32Array(count * 2), seeds = new Float32Array(count * 4), shades = new Float32Array(count)
  let randomSeed = 7193
  function random() { randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0; return randomSeed / 4294967296 }
  for (let i = 0; i < count; i++) {
    const area = (i + .5) / count * totalArea
    let lo = 0, hi = triangleArea.length - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (triangleArea[mid] < area) lo = mid + 1; else hi = mid }
    const root = Math.sqrt((i * .754877666 + .5) % 1), t = (i * .569840291 + .5) % 1, w = [1 - root, root * (1 - t), root * t]
    for (let j = 0; j < 3; j++) {
      const a = model.triangles[lo * 3 + j]
      anchors[i * 3 + j] = a; weights[i * 3 + j] = w[j]
      uv[i * 2] += model.uv[a][0] * w[j]; uv[i * 2 + 1] += model.uv[a][1] * w[j]
    }
    seeds[i * 4] = random(); seeds[i * 4 + 1] = random(); seeds[i * 4 + 2] = random(); seeds[i * 4 + 3] = random()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
  geometry.setAttribute('aShade', new THREE.BufferAttribute(shades, 1).setUsage(THREE.DynamicDrawUsage))
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uLight: { value: light }, uPixelRatio: { value: 1 }, uAlpha: { value: 1 }, uScatter: { value: 0 } },
    vertexShader: `attribute vec4 aSeed;attribute float aShade;varying float vShade;varying vec2 vUv;varying vec4 vSeed;uniform float uPixelRatio,uTime,uScatter;
      void main(){vUv=uv;vSeed=aSeed;vShade=aShade;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
        float glint=pow(.5+.5*sin(uTime*(1.+aSeed.y)+aSeed.x*100.),22.);
        gl_PointSize=max(1.,(.8+aSeed.z*.6+glint*1.25)*uPixelRatio*(1.+uScatter*.25));}`,
    fragmentShader: `varying float vShade;varying vec2 vUv;varying vec4 vSeed;uniform float uTime,uLight,uAlpha,uScatter;
      void main(){vec2 p=gl_PointCoord-.5;float r=length(p)*2.;if(r>1.)discard;
        float core=exp(-r*r*7.);float halo=exp(-r*r*4.)*.06;
        float wave=vUv.x*.85+vUv.y*.55+uTime*.025+sin(vUv.y*16.)*.07;
        vec3 color=.45+.55*cos(6.28318*(wave+vec3(0.,.33,.67)));
        color=mix(vec3(.8,.9,1.),color,uLight*(.65+vSeed.w*.35));
        float glint=pow(.5+.5*sin(uTime*(1.+vSeed.y)+vSeed.x*100.),22.);
        float eye=min(length((vUv-vec2(.35,.623))/vec2(.064,.019)),length((vUv-vec2(.65,.623))/vec2(.064,.019)));
        float eyes=.4+.6*smoothstep(.7,1.15,eye);
        gl_FragColor=vec4(color*(1.65+glint*1.8),(core+halo)*(.6+vSeed.x*.4)*uAlpha*(1.-uScatter*.18)*vShade*mix(eyes,1.,uScatter));}`,
  })
  const particles = new THREE.Points(geometry, material)
  particles.frustumCulled = false; scene.add(particles)

  const trailCount = 100, steps = 22
  const trailPositions = new Float32Array(trailCount * steps * 6)
  const trailColors = new Float32Array(trailPositions.length)
  const trailGeometry = new THREE.BufferGeometry()
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage))
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3))
  const trailMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: .22, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })
  const trails = new THREE.LineSegments(trailGeometry, trailMaterial)
  trails.frustumCulled = false; scene.add(trails)
  const trailColor = new THREE.Color()
  for (let i = 0; i < trailCount; i++) {
    trailColor.setHSL(i / trailCount, .8, .65)
    for (let j = 0; j < steps; j++) for (let end = 0; end < 2; end++) {
      const k = (i * steps + j) * 6 + end * 3, fade = Math.pow(1 - (j + end) / steps, 1.8)
      trailColors[k] = trailColor.r * fade * 1.8; trailColors[k + 1] = trailColor.g * fade * 1.8; trailColors[k + 2] = trailColor.b * fade * 1.8
    }
  }
  const videoTexture = new THREE.VideoTexture(video)
  const backgroundMaterial = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { uVideo: { value: videoTexture }, uCover: { value: new THREE.Vector2(1, 1) }, uLive: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform sampler2D uVideo;uniform vec2 uCover;uniform float uLive;
      void main(){vec2 uv=(vUv-.5)*uCover+.5;uv.x=1.-uv.x;vec3 c=pow(texture2D(uVideo,uv).rgb,vec3(2.2));
        float shade=mix(.20,.40,1.-smoothstep(.1,.8,length(vUv-.5)));
        vec3 dark=vec3(.004,.005,.008)+vec3(.006,.007,.011)*exp(-length((vUv-.5)*vec2(1.,.8))*3.);
        gl_FragColor=vec4(mix(dark,c*shade,uLive),1.);}`,
  })
  const background = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backgroundMaterial)
  background.position.z = -500; background.renderOrder = -10; scene.add(background)

  function say(text: string) { if (status.textContent !== text) status.textContent = text }
  function reset() {
    neutralYaw = live && latestFace ? latestYaw : null; yaw = 0; yawSpeed = 0; previousYaw = 0; poseAt = 0
    demoTarget = 0; demoPitch = 0; scatter = 0; velocities.fill(0); initialized = false
  }
  function stopCamera() {
    generation++; workerReady = false; busy = false; starting = false; live = false
    worker?.terminate(); worker = null
    stream?.getTracks().forEach(track => track.stop()); stream = null
    video.pause(); video.srcObject = null; latestFace = null; neutralYaw = null; lastVideo = -1; faceSeen = -Infinity
    backgroundMaterial.uniforms.uLive.value = 0
    document.body.classList.remove('camera-live')
    cameraButton.textContent = '카메라 켜기 ↗'; cameraButton.disabled = false
    guide.innerHTML = '좌우로 드래그해 얼굴을 돌려보세요.<br>카메라를 켜면 당신의 얼굴이 빛이 됩니다.'
    say('PREVIEW · 미리보기'); reset()
  }
  function failed(message: string) { stopCamera(); error.hidden = false; error.textContent = message }
  async function enableCamera() {
    if (live) { stopCamera(); return }
    if (starting || disposed) return
    if (!navigator.mediaDevices?.getUserMedia) { failed('카메라를 사용하려면 localhost 또는 HTTPS로 열어주세요.'); return }
    starting = true; cameraButton.disabled = true; error.hidden = true; say('LOADING · 카메라 준비 중')
    const session = ++generation
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false })
      if (disposed || session !== generation) { acquired.getTracks().forEach(t => t.stop()); return }
      stream = acquired; video.srcObject = acquired; await video.play()
      if (disposed || session !== generation) return
      worker = new Worker(new URL('./prism-face-worker.ts', import.meta.url), { type: 'module' })
      const currentWorker = worker
      const timeout = window.setTimeout(() => { if (session === generation && !workerReady) failed('얼굴 트래킹 준비가 지연되고 있어요. 카메라를 다시 켜주세요.') }, 25000)
      worker.onmessage = ({ data }) => {
        if (session !== generation || disposed) return
        if (data.type === 'ready') {
          clearTimeout(timeout); workerReady = true; live = true; starting = false; cameraButton.disabled = false
          cameraButton.textContent = '카메라 끄기'; document.body.classList.add('camera-live')
          guide.innerHTML = '고개를 천천히 좌우로 돌려보세요.<br>정면을 바라보면 입자가 다시 모입니다.'
          say('LOOK HERE · 얼굴을 비춰주세요'); resize(); reset()
          stream?.getVideoTracks().forEach(t => { t.enabled = !document.hidden })
          stream?.getVideoTracks().forEach(t => t.addEventListener('ended', () => { if (session === generation) failed('카메라 연결이 끊겼어요. 다시 켜주세요.') }, { once: true }))
        } else if (data.type === 'face') {
          busy = false
          if (data.points.length < 468) return
          latestFace = data.points; faceSeen = performance.now()
          latestYaw = data.matrix ? yawFromMatrix(data.matrix) : 0
          if (neutralYaw === null) neutralYaw = latestYaw
          const nextYaw = latestYaw - neutralYaw
          const dt = (data.time - poseAt) / 1000
          yawSpeed = poseAt && dt > 0 && dt < .3 ? clamp((nextYaw - previousYaw) / dt, -8, 8) : 0
          previousYaw = nextYaw; poseAt = data.time
          backgroundMaterial.uniforms.uLive.value = 1
        } else if (data.type === 'error') { clearTimeout(timeout); console.error('Prism Face tracking:', data.message); failed('얼굴 트래킹을 시작하지 못했어요. 새로고침 후 다시 켜주세요.') }
      }
      worker.onerror = () => { clearTimeout(timeout); if (session === generation) failed('얼굴 트래킹을 불러오지 못했어요. 새로고침해 주세요.') }
      currentWorker.postMessage({ type: 'init', origin: new URL(import.meta.env.BASE_URL, location.origin).href.replace(/\/$/, '') })
    } catch (cause) {
      if (disposed || session !== generation) return
      const name = cause instanceof DOMException ? cause.name : ''
      failed(name === 'NotAllowedError' ? '카메라 접근이 허용되지 않았어요. 브라우저의 카메라 권한을 허용하고 다시 켜주세요.' : name === 'NotFoundError' ? '연결된 카메라가 없어요. 미리보기는 드래그로 움직일 수 있어요.' : '카메라를 열지 못했어요. 다른 앱에서 사용 중인지 확인하고 다시 켜주세요.')
    }
  }
  async function infer(now: number) {
    if (!live || !workerReady || busy || video.readyState < 2 || now - lastInference < 40 || video.currentTime === lastVideo) return
    busy = true; lastInference = now; lastVideo = video.currentTime
    const current = worker, session = generation
    try {
      const bitmap = await createImageBitmap(video)
      if (session !== generation || disposed || document.hidden) { bitmap.close(); if (session === generation) busy = false; return }
      current?.postMessage({ type: 'frame', bitmap, time: now }, [bitmap])
    } catch { if (session === generation) busy = false }
  }
  function resize() {
    width = innerWidth; height = innerHeight; pixelRatio = Math.min(devicePixelRatio || 1, 1.5)
    camera.left = -width / 2; camera.right = width / 2; camera.top = height / 2; camera.bottom = -height / 2; camera.updateProjectionMatrix()
    renderer.setPixelRatio(pixelRatio); renderer.setSize(width, height, false)
    composer.setPixelRatio(pixelRatio); composer.setSize(width, height)
    material.uniforms.uPixelRatio.value = pixelRatio
    background.scale.set(width, height, 1)
    const cover = cameraProjection(video.videoWidth || 960, video.videoHeight || 720, width, height)
    backgroundMaterial.uniforms.uCover.value.set(width / cover.width, height / cover.height)
    initialized = false
  }
  function updateFace(dt: number) {
    const easing = 1 - Math.exp(-dt * 22)
    const cover = cameraProjection(video.videoWidth || 960, video.videoHeight || 720, width, height)
    demoYaw += (demoTarget - demoYaw) * (1 - Math.exp(-dt * 7))
    const demoScale = Math.min(height * (width < 700 ? .022 : .033), width * .048)
    const demoCenterY = width < 700 ? height * .075 : -height * .025
    const cy = Math.cos(demoYaw), sy = Math.sin(demoYaw), cp = Math.cos(demoPitch), sp = Math.sin(demoPitch)
    for (let i = 0; i < 468; i++) {
      let x: number, y: number, z: number
      if (live && latestFace) {
        const p = latestFace[i]; x = (.5 - p.x) * cover.width; y = (.5 - p.y) * cover.height; z = -p.z * cover.width
      } else {
        const v = model.vertices[i], vx = v[0], vy = v[1], vz = v[2] - 3
        x = (vx * cy + vz * sy) * demoScale + (width < 700 ? width * .045 : width * .06)
        y = (vy * cp - vz * sp) * demoScale + demoCenterY
        z = (-vx * sy + vz * cy) * demoScale
      }
      const k = i * 3
      face[k] += (x - face[k]) * (initialized ? easing : 1)
      face[k + 1] += (y - face[k + 1]) * (initialized ? easing : 1)
      face[k + 2] += (z - face[k + 2]) * (initialized ? easing : 1)
    }
    faceGeometry.attributes.position.needsUpdate = true; faceGeometry.computeVertexNormals()
  }
  function updateParticles(dt: number) {
    const extent = Math.min(width, height) * .58, direction = yaw < 0 ? -1 : 1
    const stiffness = 36 - scatter * 22, damping = Math.exp(-(10 - scatter * 4) * dt)
    const normals = faceGeometry.attributes.normal.array
    for (let i = 0; i < count; i++) {
      const k = i * 3, s = i * 4, a = anchors[k] * 3, b = anchors[k + 1] * 3, c = anchors[k + 2] * 3
      const w0 = weights[k], w1 = weights[k + 1], w2 = weights[k + 2]
      const nx = normals[a]*w0+normals[b]*w1+normals[c]*w2, ny=normals[a+1]*w0+normals[b+1]*w1+normals[c+1]*w2, nz=normals[a+2]*w0+normals[b+2]*w1+normals[c+2]*w2
      shades[i] = .28 + .72 * Math.pow(clamp(-nx*.35+ny*.4+nz*.85,0,1),1.5)
      const release = scatter * Math.pow(seeds[s], .6), wave = time * (.35 + seeds[s + 1] * .6) + seeds[s + 2] * 20
      const drift = extent * release
      const dx = direction * drift * (.15 + seeds[s + 1] * 1.7) + Math.sin(wave) * drift * .18
      const dy = (seeds[s + 2] - .5) * drift * 1.45 + Math.cos(wave * 1.3) * drift * .18
      const dz = (seeds[s + 3] - .5) * drift * .5
      for (let j = 0; j < 3; j++) {
        const target = face[a + j] * w0 + face[b + j] * w1 + face[c + j] * w2 + (j === 0 ? dx : j === 1 ? dy : dz)
        if (!initialized) { positions[k + j] = target; velocities[k + j] = 0 }
        velocities[k + j] += (target - positions[k + j]) * stiffness * dt
        velocities[k + j] *= damping
        positions[k + j] += velocities[k + j] * dt
      }
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.aShade.needsUpdate = true
    for (let i = 0; i < trailCount; i++) {
      const p = (i * 271 + 119) % count * 3, phase = i * 2.39
      for (let j = 0; j < steps; j++) for (let end = 0; end < 2; end++) {
        const t = (j + end) / steps, k = (i * steps + j) * 6 + end * 3
        trailPositions[k] = positions[p] + direction * t * extent * scatter * (1.2 + Math.sin(phase) * .4)
        trailPositions[k + 1] = positions[p + 1] + Math.sin(t * 3 + phase + time * .35) * t * extent * scatter * .17 - t*t*extent*scatter*.14
        trailPositions[k + 2] = positions[p + 2]
      }
    }
    trailGeometry.attributes.position.needsUpdate = true
    trailMaterial.opacity = scatter * visibility * (.08 + light * .16)
    initialized = true
  }
  function tick(now: number) {
    raf = 0
    if (disposed || document.hidden) return
    const dt = Math.min((now - lastFrame) / 1000, 1 / 30); lastFrame = now; time += dt
    void infer(now)
    const faceFound = live && now - faceSeen < 450
    const nextYaw = live ? latestYaw - (neutralYaw ?? latestYaw) : demoYaw
    if (!live) yawSpeed = (demoTarget - demoYaw) * 5
    yaw += (nextYaw - yaw) * (1 - Math.exp(-dt * 10))
    if (live && now - faceSeen > 150) yawSpeed *= Math.exp(-dt * 5)
    const targetScatter = live && !faceFound ? 1 : dispersion(yaw, yawSpeed, sensitivity)
    scatter += (targetScatter - scatter) * (1 - Math.exp(-dt * (targetScatter > scatter ? 4.5 : 2)))
    visibility += ((live && !faceFound ? 0 : 1) - visibility) * (1 - Math.exp(-dt * 3))
    updateFace(dt); updateParticles(dt)
    material.uniforms.uTime.value = reducedMotion.matches ? 0 : time
    material.uniforms.uScatter.value = scatter; material.uniforms.uAlpha.value = visibility
    if (now - uiAt > 250) {
      uiAt = now; meter.textContent = `${Math.round(scatter * 100).toString().padStart(2, '0')}%`
      if (live) say(faceFound ? (scatter > .35 ? 'DISPERSING · 빛으로 흩어지는 중' : 'TRACKING · 얼굴을 따라 흐르는 빛') : 'LOOK HERE · 얼굴을 비춰주세요')
    }
    composer.render(); raf = requestAnimationFrame(tick)
  }
  const drag = (event: PointerEvent) => {
    if (!pointer || live) return
    demoTarget = clamp((event.clientX / width - .5) * 2.5, -1.15, 1.15)
    demoPitch = clamp((event.clientY / height - .5) * .8, -.35, .35)
  }
  canvas.addEventListener('pointerdown', event => { pointer = true; canvas.setPointerCapture(event.pointerId); drag(event) })
  canvas.addEventListener('pointermove', drag)
  canvas.addEventListener('pointerup', () => { pointer = false; demoTarget = 0; demoPitch = 0 })
  canvas.addEventListener('pointercancel', () => { pointer = false; demoTarget = 0; demoPitch = 0 })
  canvas.addEventListener('keydown', event => {
    if (event.key === 'Escape') reset()
    if (!live && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); demoTarget = clamp(demoTarget + (event.key === 'ArrowLeft' ? -.18 : .18), -1.15, 1.15) }
  })
  document.querySelector('#prism-reset')!.addEventListener('click', reset)
  cameraButton.addEventListener('click', () => { void enableCamera() })
  document.querySelector<HTMLInputElement>('#scatter-input')!.addEventListener('input', event => {
    sensitivity = Number((event.target as HTMLInputElement).value)
    document.querySelector('#scatter-value')!.textContent = `${sensitivity.toFixed(1)}×`
  })
  document.querySelector<HTMLInputElement>('#light-input')!.addEventListener('input', event => {
    light = Number((event.target as HTMLInputElement).value) / 100
    material.uniforms.uLight.value = light
    bloom.strength = .25 + light * .46
    document.querySelector('#light-value')!.textContent = `${Math.round(light * 100)}%`
  })
  const onVisibility = () => {
    stream?.getVideoTracks().forEach(t => { t.enabled = !document.hidden })
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; pointer = false }
    else if (!disposed && !raf) { lastFrame = performance.now(); raf = requestAnimationFrame(tick) }
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('resize', resize)
  if (reducedMotion.matches) demoTarget = demoYaw = 0
  resize(); raf = requestAnimationFrame(tick)
  cleanup = () => {
    cancelAnimationFrame(raf); stopCamera(); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVisibility)
    faceGeometry.dispose(); geometry.dispose(); material.dispose(); trailGeometry.dispose(); trailMaterial.dispose()
    background.geometry.dispose(); backgroundMaterial.dispose(); videoTexture.dispose(); composer.dispose(); bloom.dispose(); renderer.dispose()
  }
}
void start().catch(cause => {
  cleanup?.(); error.hidden = false
  error.textContent = cause instanceof Error && cause.message.includes('얼굴 데이터') ? cause.message : '화면을 준비하지 못했어요. 브라우저의 그래픽 가속을 켜고 새로고침해 주세요.'
  cameraButton.disabled = true; status.textContent = 'UNAVAILABLE · 화면 준비 실패'; console.error(cause)
})
