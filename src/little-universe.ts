import './little-universe.css'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { cameraProjection, clamp, type FacePoint } from './prism-face-physics'
import { OpenMouth, advanceTransition, universeScale } from './little-universe-core'

document.body.classList.add('universe-page')
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <canvas class="prism-world" tabindex="0" aria-label="입을 벌리면 작은 우주. 미리보기에서는 스페이스바를 누르고 있으면 얼굴 입자가 별자리로 떠오릅니다."></canvas>
  <video class="prism-video" playsinline muted aria-hidden="true"></video>
  <main class="prism-ui">
    <header class="prism-header">
      <a class="prism-brand" href="${import.meta.env.BASE_URL}#little-universe"><i class="universe-mark" aria-hidden="true"></i> LITTLE UNIVERSE</a>
      <div class="prism-status" role="status" aria-live="polite"><i aria-hidden="true"></i><span>PREVIEW · 미리보기</span></div>
    </header>
    <section class="prism-intro"><p class="prism-eyebrow">A UNIVERSE IN MOTION / 17</p><h1>입을 벌리면,<br><em>작은 우주.</em></h1><p>당신의 얼굴에 잠든 수많은 별.<br>입을 벌리고, 별들이 떠오르는 길을 따라가세요.</p></section>
    <span class="prism-side">OPEN YOUR MOUTH. WATCH THE STARS MOVE.</span>
    <div class="prism-caption"><span>EVERY STAR WAS ONCE YOU</span><p id="universe-guide">미리보기 버튼이나 스페이스바를 길게 누르세요.<br>입자가 떠올라 은하로 흐르는 과정을 지켜보세요.</p></div>
    <section class="prism-controls" aria-label="작은 우주 설정">
      <p class="prism-control-heading">INNER SPACE <b>FACE → CONSTELLATION</b></p>
      <div class="universe-readouts"><div><span>입 벌린 시간</span><strong id="open-seconds">0.0</strong><small>s</small></div><div><span>입자 이동</span><strong id="transition-value">0</strong><small>%</small></div></div>
      <label class="prism-slider"><span>별빛 <output id="starlight-value">70%</output></span><input id="starlight-input" type="range" min="10" max="100" step="1" value="70" aria-label="별빛 강도" /></label>
      <button class="universe-preview" id="universe-preview" type="button" aria-pressed="false">누르고 입 벌리기 · 미리보기</button>
      <p class="prism-error" role="alert" hidden></p>
      <div class="prism-actions"><button class="prism-start" id="universe-camera" type="button">카메라 켜기 ↗</button><button id="universe-reset" type="button">다시 얼굴로</button></div>
      <p class="prism-note">입을 벌리면 펼쳐지고, 닫으면 얼굴로 돌아와요.<br>영상은 기기에서만 처리돼요.</p>
    </section>
    <footer class="prism-footer"><div class="prism-spectrum"><i class="universe-spectrum" aria-hidden="true"></i><span>FROM YOU, TO INFINITY</span></div><span class="universe-phase">MOUTH CLOSED / 얼굴</span></footer>
  </main>
`
const canvas = document.querySelector<HTMLCanvasElement>('.prism-world')!
const video = document.querySelector<HTMLVideoElement>('.prism-video')!
const status = document.querySelector<HTMLElement>('.prism-status span')!
const guide = document.querySelector<HTMLElement>('#universe-guide')!
const error = document.querySelector<HTMLElement>('.prism-error')!
const cameraButton = document.querySelector<HTMLButtonElement>('#universe-camera')!
const durationLabel = document.querySelector<HTMLElement>('#open-seconds')!
const transitionLabel = document.querySelector<HTMLElement>('#transition-value')!
const phaseLabel = document.querySelector<HTMLElement>('.universe-phase')!
const previewButton = document.querySelector<HTMLButtonElement>('#universe-preview')!
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
  let light = .7, dream = 0, expansion = 1, orbit = 0, previewHeld = false
  const mouth = new OpenMouth()
  let live = false, starting = false, generation = 0, faceSeen = -Infinity
  let worker: Worker | null = null, stream: MediaStream | null = null
  let workerReady = false, busy = false, lastInference = 0, lastVideo = -1
  let latestFace: FacePoint[] | null = null
  let uiAt = 0, visibility = 1, initialized = false
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
  const positions = new Float32Array(count * 3), galaxies = new Float32Array(count * 3), featured = new Float32Array(count)
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

  // Keep neighboring facial hues together in the arms instead of mixing them into white dust.
  const hueOrder = Array.from({ length: count }, (_, i) => i)
  const hueAt = (i: number) => uv[i*2]*.85 + uv[i*2+1]*.55 + Math.sin(uv[i*2+1]*16)*.07
  hueOrder.sort((a,b) => hueAt(a)-hueAt(b))
  // Four spiral arms, faint surrounding dust, and a few stars beyond the disk.
  for (let rank = 0; rank < count; rank++) {
    const i = hueOrder[rank]
    const r = Math.pow(random(), .55), angle = Math.floor(rank/count*4) * Math.PI / 2 + r * 5.1 + (random() - .5) * .65
    const k = i * 3
    galaxies[k] = Math.cos(angle) * r
    galaxies[k + 1] = Math.sin(angle) * r * .72 + (random() - .5) * .09
    galaxies[k + 2] = Math.sin(angle) * r * .30 + (random() - .5) * .1
    if (i % 19 === 0) {
      galaxies[k] = (random() - .5) * 2.8; galaxies[k + 1] = (random() - .5) * 2.2
    }
  }
  const groups = [
    [-.64, .20, -.25], [-.26, .55, .4], [.28, .46, -.5], [.64, .07, .2],
    [.32, -.43, .7], [-.34, -.39, -.3], [-.05, -.04, .1],
  ]
  const shapes = [
    [[-.12,.08],[-.04,.02],[.01,.11],[.09,.05],[.13,-.05]],
    [[-.12,-.06],[-.04,.06],[.04,-.01],[.12,.10],[.15,-.04]],
    [[-.12,.06],[-.05,-.04],[.02,.07],[.09,-.03],[.14,.05]],
  ]
  const starIndices: number[] = [], connections: number[] = []
  groups.forEach(([cx,cy,angle], g) => {
    const shape = shapes[g % shapes.length], start = starIndices.length
    shape.forEach(([x,y], j) => {
      const index = 107 + (g * 5 + j) * Math.floor(count / 38), k = index * 3
      galaxies[k] = cx + x * Math.cos(angle) - y * Math.sin(angle)
      galaxies[k + 1] = cy + x * Math.sin(angle) + y * Math.cos(angle)
      galaxies[k + 2] = .15; featured[index] = 1; starIndices.push(index)
      if (j) connections.push(start + j - 1, start + j)
    })
    if (g % 2 === 0) connections.push(start + 1, start + 3)
  })
  const uniforms = {
    uTime: { value: 0 }, uColorPhase: { value: 0 }, uLight: { value: light }, uPixelRatio: { value: 1 }, uAlpha: { value: 1 },
    uDream: { value: 0 }, uRadius: { value: 1 }, uLift: { value: 1 }, uOrbit: { value: 0 }, uCenter: { value: new THREE.Vector3() },
  }
  const transformShader = `
    attribute vec3 aGalaxy;attribute vec4 aSeed;
    uniform float uDream,uRadius,uLift,uOrbit;uniform vec3 uCenter;
    float dreamMix(){return smoothstep(aSeed.x*.28,.72+aSeed.x*.28,uDream);}
    vec3 dreamPositionAt(float t){
      float angle=uOrbit*.07;float c=cos(angle),s=sin(angle);
      vec3 star=vec3(aGalaxy.x*c-aGalaxy.y*s,aGalaxy.x*s+aGalaxy.y*c,aGalaxy.z)*uRadius+uCenter;
      vec3 start=position;
      vec3 lift=start+vec3((aSeed.z-.5)*uRadius*1.2,uLift*(.65+aSeed.y*.45),(aSeed.w-.5)*uRadius*.4);
      vec3 radial=star-uCenter;
      vec3 turn=uCenter+vec3(-radial.y,radial.x,radial.z)*1.25+vec3(0.,uLift*.22,0.);
      float q=1.-t;
      return q*q*q*start+3.*q*q*t*lift+3.*q*t*t*turn+t*t*t*star;
    }
    vec3 dreamPosition(){return dreamPositionAt(dreamMix());}`
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
  geometry.setAttribute('aGalaxy', new THREE.BufferAttribute(galaxies, 3))
  geometry.setAttribute('aFeatured', new THREE.BufferAttribute(featured, 1))
  geometry.setAttribute('aShade', new THREE.BufferAttribute(shades, 1).setUsage(THREE.DynamicDrawUsage))
  // Every point, trail, and constellation endpoint uses its original facial UV and seed.
  const colorShader = `
    uniform float uColorPhase,uLight;
    vec3 particleColor(vec2 faceUv,vec4 seed){
      float wave=faceUv.x*.85+faceUv.y*.55+uColorPhase+sin(faceUv.y*16.)*.07;
      vec3 rainbow=.45+.55*cos(6.28318*(wave+vec3(0.,.33,.67)));
      return mix(vec3(.8,.9,1.),rainbow,uLight*(.65+seed.w*.35));
    }`
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms,
    vertexShader: transformShader + `
      attribute float aShade,aFeatured;varying float vShade,vMix,vFeatured;varying vec2 vUv;varying vec4 vSeed;
      uniform float uPixelRatio,uTime;
      void main(){vUv=uv;vSeed=aSeed;vShade=aShade;vMix=dreamMix();vFeatured=aFeatured;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(dreamPosition(),1.);
        float glint=pow(.5+.5*sin(uTime*(.5+aSeed.y)+aSeed.x*100.),22.);
        float faceSize=.8+aSeed.z*.6+glint*1.25;
        float starSize=.8+pow(aSeed.z,14.)*1.8+glint*1.25+aFeatured*3.;
        gl_PointSize=max(1.,(mix(faceSize,starSize,vMix)+sin(vMix*3.14159)*.25)*uPixelRatio);}`,
    fragmentShader: colorShader + `
      varying float vShade,vMix,vFeatured;varying vec2 vUv;varying vec4 vSeed;uniform float uTime,uAlpha;
      void main(){
        vec2 p=gl_PointCoord-.5;float r=length(p)*2.;if(r>1.)discard;
        float core=exp(-r*r*7.),halo=exp(-r*r*4.)*.06;
        vec3 color=particleColor(vUv,vSeed);
        float glint=pow(.5+.5*sin(uTime*(.5+vSeed.y)+vSeed.x*100.),22.);
        float eye=min(length((vUv-vec2(.35,.623))/vec2(.064,.019)),length((vUv-vec2(.65,.623))/vec2(.064,.019)));
        float faceShade=vShade*(.4+.6*smoothstep(.7,1.15,eye));
        float grain=mix(.09+.91*pow(vSeed.z,6.),1.,vFeatured);
        float transit=sin(vMix*3.14159);
        float alpha=mix((.6+vSeed.x*.4)*faceShade,grain,vMix)*(1.-transit*.45)+transit*.06;
        float cross=(exp(-abs(p.x)*55.)+exp(-abs(p.y)*55.))*exp(-r*2.)*vFeatured*vMix*.35;
        gl_FragColor=vec4(color*(1.65+glint*1.8),(core+halo+cross)*alpha*uAlpha*(.45+uLight*.8));
      }`,
  })
  const particles = new THREE.Points(geometry, material)
  particles.frustumCulled = false; scene.add(particles)

  const linePositions = new Float32Array(connections.length * 3)
  const lineGalaxy = new Float32Array(linePositions.length), lineSeeds = new Float32Array(connections.length * 4)
  connections.forEach((node, i) => {
    const index = starIndices[node]
    lineGalaxy.set(galaxies.subarray(index*3,index*3+3),i*3)
    lineSeeds.set(seeds.subarray(index*4,index*4+4),i*4)
  })
  const lineGeometry = new THREE.BufferGeometry()
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage))
  lineGeometry.setAttribute('aGalaxy', new THREE.BufferAttribute(lineGalaxy, 3))
  lineGeometry.setAttribute('aSeed', new THREE.BufferAttribute(lineSeeds, 4))
  const lineUv = new Float32Array(connections.length * 2)
  connections.forEach((node,i) => lineUv.set(uv.subarray(starIndices[node]*2,starIndices[node]*2+2),i*2))
  lineGeometry.setAttribute('uv', new THREE.BufferAttribute(lineUv,2))
  const lineMaterial = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, uniforms,
    vertexShader: transformShader + colorShader + 'varying vec3 vColor;void main(){vColor=particleColor(uv,aSeed);gl_Position=projectionMatrix*modelViewMatrix*vec4(dreamPosition(),1.);}',
    fragmentShader: 'varying vec3 vColor;uniform float uDream,uAlpha,uLight;void main(){gl_FragColor=vec4(vColor,smoothstep(.84,1.,uDream)*uAlpha*(.16+uLight*.16));}',
  })
  const constellations = new THREE.LineSegments(lineGeometry, lineMaterial)
  constellations.frustumCulled = false; scene.add(constellations)

  // Short moving tails follow the same particle paths and disappear at both endpoints.
  const tailCount = innerWidth < 700 ? 450 : 900
  const tailIndices = Array.from({ length: tailCount }, (_, i) => Math.floor((i + .5) / tailCount * count))
  const tailPositions = new Float32Array(tailCount * 6), tailGalaxy = new Float32Array(tailCount * 6)
  const tailSeeds = new Float32Array(tailCount * 8), tailHeads = new Float32Array(tailCount * 2)
  const tailUv = new Float32Array(tailCount * 4)
  tailIndices.forEach((index,i) => {
    for (let end=0;end<2;end++) {
      tailGalaxy.set(galaxies.subarray(index*3,index*3+3),i*6+end*3)
      tailSeeds.set(seeds.subarray(index*4,index*4+4),i*8+end*4)
      tailHeads[i*2+end] = end
      tailUv.set(uv.subarray(index*2,index*2+2),i*4+end*2)
    }
  })
  const tailGeometry = new THREE.BufferGeometry()
  tailGeometry.setAttribute('position',new THREE.BufferAttribute(tailPositions,3).setUsage(THREE.DynamicDrawUsage))
  tailGeometry.setAttribute('aGalaxy',new THREE.BufferAttribute(tailGalaxy,3))
  tailGeometry.setAttribute('aSeed',new THREE.BufferAttribute(tailSeeds,4))
  tailGeometry.setAttribute('aHead',new THREE.BufferAttribute(tailHeads,1))
  tailGeometry.setAttribute('uv',new THREE.BufferAttribute(tailUv,2))
  const tailMaterial = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, uniforms,
    vertexShader: transformShader + colorShader + `attribute float aHead;varying float vTailAlpha;varying vec3 vColor;
      void main(){float t=dreamMix();float behind=max(0.,t-.024*(1.-aHead));
        gl_Position=projectionMatrix*modelViewMatrix*vec4(dreamPositionAt(behind),1.);
        vTailAlpha=sin(t*3.14159)*(.15+aHead*.85);
        vColor=particleColor(uv,aSeed);}`,
    fragmentShader: 'varying float vTailAlpha;varying vec3 vColor;uniform float uAlpha;void main(){gl_FragColor=vec4(vColor*1.5,vTailAlpha*uAlpha*.35);}',
  })
  const tails = new THREE.LineSegments(tailGeometry,tailMaterial)
  tails.frustumCulled = false; scene.add(tails)
  const videoTexture = new THREE.VideoTexture(video)
  const backgroundMaterial = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { uVideo: { value: videoTexture }, uCover: { value: new THREE.Vector2(1, 1) }, uLive: { value: 0 }, uDream: uniforms.uDream },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform sampler2D uVideo;uniform vec2 uCover;uniform float uLive,uDream;
      void main(){vec2 uv=(vUv-.5)*uCover+.5;uv.x=1.-uv.x;vec3 c=pow(texture2D(uVideo,uv).rgb,vec3(2.2));
        float shade=mix(.20,.40,1.-smoothstep(.1,.8,length(vUv-.5)));
        vec3 dark=vec3(.004,.005,.008)+vec3(.006,.007,.011)*exp(-length((vUv-.5)*vec2(1.,.8))*3.);
        gl_FragColor=vec4(mix(dark,c*shade,uLive*(1.-smoothstep(0.,.75,uDream))),1.);}`,
  })
  const background = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), backgroundMaterial)
  background.position.z = -500; background.renderOrder = -10; scene.add(background)

  function say(text: string) { if (status.textContent !== text) status.textContent = text }
  function reset() { previewHeld = false; mouth.release(); previewButton.setAttribute('aria-pressed', 'false') }
  function stopCamera() {
    generation++; workerReady = false; busy = false; starting = false; live = false
    worker?.terminate(); worker = null
    stream?.getTracks().forEach(track => track.stop()); stream = null
    video.pause(); video.srcObject = null; latestFace = null; lastVideo = -1; faceSeen = -Infinity
    backgroundMaterial.uniforms.uLive.value = 0
    document.body.classList.remove('camera-live')
    cameraButton.textContent = '카메라 켜기 ↗'; cameraButton.disabled = false
    previewButton.disabled = false; previewButton.textContent = '누르고 입 벌리기 · 미리보기'
    guide.innerHTML = '미리보기 버튼이나 스페이스바를 길게 누르세요.<br>입자가 떠올라 은하로 흐르는 과정을 지켜보세요.'
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
      worker = new Worker(new URL('./little-universe-worker.ts', import.meta.url), { type: 'module' })
      const currentWorker = worker
      const timeout = window.setTimeout(() => { if (session === generation && !workerReady) failed('얼굴 트래킹 준비가 지연되고 있어요. 카메라를 다시 켜주세요.') }, 25000)
      worker.onmessage = ({ data }) => {
        if (session !== generation || disposed) return
        if (data.type === 'ready') {
          clearTimeout(timeout); workerReady = true; live = true; starting = false; cameraButton.disabled = false
          cameraButton.textContent = '카메라 끄기'; document.body.classList.add('camera-live')
          previewButton.disabled = true; previewButton.textContent = '입을 천천히 벌려보세요'
          guide.innerHTML = '입을 벌리고 입자가 은하로 흐르는 길을 보세요.<br>입을 닫으면 다시 얼굴로 모입니다.'
          say('LOOK HERE · 얼굴을 비춰주세요'); resize(); reset()
          stream?.getVideoTracks().forEach(t => { t.enabled = !document.hidden })
          stream?.getVideoTracks().forEach(t => t.addEventListener('ended', () => { if (session === generation) failed('카메라 연결이 끊겼어요. 다시 켜주세요.') }, { once: true }))
        } else if (data.type === 'face') {
          busy = false
          if (data.points.length < 468) return
          latestFace = data.points; faceSeen = performance.now()
          mouth.update(data.mouth, data.time)
          backgroundMaterial.uniforms.uLive.value = 1
        } else if (data.type === 'error') { clearTimeout(timeout); console.error('Little Universe tracking:', data.message); failed('얼굴 트래킹을 시작하지 못했어요. 새로고침 후 다시 켜주세요.') }
      }
      worker.onerror = () => { clearTimeout(timeout); if (session === generation) failed('얼굴 트래킹을 불러오지 못했어요. 새로고침해 주세요.') }
      currentWorker.postMessage({ type: 'init', origin: new URL(import.meta.env.BASE_URL, location.origin).href.replace(/\/$/, '') })
    } catch (cause) {
      if (disposed || session !== generation) return
      const name = cause instanceof DOMException ? cause.name : ''
      failed(name === 'NotAllowedError' ? '카메라 접근이 허용되지 않았어요. 브라우저의 카메라 권한을 허용하고 다시 켜주세요.' : name === 'NotFoundError' ? '연결된 카메라가 없어요. 미리보기 버튼으로 우주를 펼칠 수 있어요.' : '카메라를 열지 못했어요. 다른 앱에서 사용 중인지 확인하고 다시 켜주세요.')
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
    const demoScale = Math.min(height * (width < 700 ? .016 : .033), width * .048)
    const demoCenterY = width < 700 ? height * .12 : -height * .025
    const demoYaw = -.10, cy = Math.cos(demoYaw), sy = Math.sin(demoYaw)
    for (let i = 0; i < 468; i++) {
      let x: number, y: number, z: number
      if (live && latestFace) {
        const p = latestFace[i]; x = (.5 - p.x) * cover.width; y = (.5 - p.y) * cover.height; z = -p.z * cover.width
      } else {
        const v = model.vertices[i], vx = v[0], vy = v[1], vz = v[2] - 3
        x = (vx * cy + vz * sy) * demoScale + (width < 700 ? width * .045 : width * .06)
        y = vy * demoScale + demoCenterY
        z = (-vx * sy + vz * cy) * demoScale
      }
      const k = i * 3
      face[k] += (x - face[k]) * (initialized ? easing : 1)
      face[k + 1] += (y - face[k + 1]) * (initialized ? easing : 1)
      face[k + 2] += (z - face[k + 2]) * (initialized ? easing : 1)
    }
    faceGeometry.attributes.position.needsUpdate = true; faceGeometry.computeVertexNormals()
  }
  function updateParticles() {
    const normals = faceGeometry.attributes.normal.array
    for (let i = 0; i < count; i++) {
      const k = i*3, a=anchors[k]*3, b=anchors[k+1]*3, c=anchors[k+2]*3
      const w0=weights[k], w1=weights[k+1], w2=weights[k+2]
      const nx=normals[a]*w0+normals[b]*w1+normals[c]*w2, ny=normals[a+1]*w0+normals[b+1]*w1+normals[c+1]*w2, nz=normals[a+2]*w0+normals[b+2]*w1+normals[c+2]*w2
      shades[i] = .28 + .72 * Math.pow(clamp(-nx*.35+ny*.4+nz*.85,0,1),1.5)
      for(let j=0;j<3;j++) positions[k+j]=face[a+j]*w0+face[b+j]*w1+face[c+j]*w2
    }
    connections.forEach((node,i) => linePositions.set(positions.subarray(starIndices[node]*3,starIndices[node]*3+3),i*3))
    tailIndices.forEach((index,i) => {
      const anchor = positions.subarray(index*3,index*3+3)
      tailPositions.set(anchor,i*6); tailPositions.set(anchor,i*6+3)
    })
    tailGeometry.attributes.position.needsUpdate = true
    lineGeometry.attributes.position.needsUpdate = true
    geometry.attributes.position.needsUpdate = true; geometry.attributes.aShade.needsUpdate = true
    initialized = true
  }
  function tick(now: number) {
    raf = 0
    if (disposed || document.hidden) return
    const dt = Math.min((now - lastFrame) / 1000, 1 / 15); lastFrame = now; time += dt
    void infer(now)
    const faceFound = live && now - faceSeen < 450
    if (!live) mouth.update(previewHeld ? .95 : 0, now)
    else if (!faceFound) mouth.release()
    const openTime = mouth.seconds(now)
    // Freeze the facial palette for the whole journey, including the return trip.
    if (dream === 0 && !mouth.open && !reducedMotion.matches) uniforms.uColorPhase.value += dt*.025
    dream = advanceTransition(dream,mouth.open,dt)
    expansion += (universeScale(openTime)-expansion)*(1-Math.exp(-dt*1.5))
    if (!reducedMotion.matches) orbit += dt*dream
    visibility += ((live && !faceFound ? 0 : 1)-visibility)*(1-Math.exp(-dt*3))
    updateFace(dt); updateParticles()
    uniforms.uTime.value = reducedMotion.matches ? 0 : time
    uniforms.uDream.value = dream; uniforms.uAlpha.value = visibility; uniforms.uOrbit.value = orbit
    uniforms.uRadius.value = Math.min(width*.50,height*.46)*expansion
    uniforms.uCenter.value.set(width < 700 ? width*.025 : width*.045,width < 700 ? height*.09 : height*.015,0)
    uniforms.uLift.value = height*(reducedMotion.matches ? .06 : .25)
    if (now - uiAt > 250) {
      uiAt = now; durationLabel.textContent = openTime.toFixed(1); transitionLabel.textContent = String(Math.round(dream*100))
      phaseLabel.textContent = mouth.open ? dream < .99 ? 'IN MOTION / 은하로 이동 중' : 'MOUTH OPEN / 작은 우주' : dream > .01 ? 'COMING HOME / 다시 얼굴로' : 'MOUTH CLOSED / 얼굴'
      document.body.classList.toggle('universe-inward',mouth.open)
      canvas.dataset.dream = dream.toFixed(3)
      say(live && !faceFound ? 'LOOK HERE · 얼굴을 비춰주세요' : mouth.open ? dream < .99 ? 'IN MOTION · 입자가 은하로 흐르는 중' : 'INNER UNIVERSE · 입을 닫으면 돌아와요' : dream > .01 ? 'COMING HOME · 입자가 얼굴로 돌아오는 중' : live ? 'MOUTH CLOSED · 입을 벌려보세요' : 'PREVIEW · 미리보기')
    }
    composer.render(); raf = requestAnimationFrame(tick)
  }
  function hold(value: boolean) {
    if (live) return
    previewHeld = value; previewButton.setAttribute('aria-pressed',String(value))
  }
  previewButton.addEventListener('pointerdown', event => { previewButton.setPointerCapture(event.pointerId); hold(true) })
  previewButton.addEventListener('pointerup', () => hold(false))
  previewButton.addEventListener('pointercancel', () => hold(false))
  previewButton.addEventListener('lostpointercapture', () => hold(false))
  function keyDown(event: KeyboardEvent) {
    if (event.code === 'Space' && (event.target === canvas || event.target === previewButton)) { event.preventDefault(); hold(true) }
    if (event.key === 'Escape') reset()
  }
  function keyUp(event: KeyboardEvent) { if (event.code === 'Space') hold(false) }
  window.addEventListener('keydown',keyDown); window.addEventListener('keyup',keyUp)
  const onBlur = () => { hold(false) }
  window.addEventListener('blur',onBlur)
  document.querySelector('#universe-reset')!.addEventListener('click',reset)
  cameraButton.addEventListener('click',() => { void enableCamera() })
  document.querySelector<HTMLInputElement>('#starlight-input')!.addEventListener('input',event => {
    light = Number((event.target as HTMLInputElement).value)/100; uniforms.uLight.value = light
    bloom.strength = .25 + light*.55
    document.querySelector('#starlight-value')!.textContent = `${Math.round(light*100)}%`
  })
  const prepareCapture = () => { if (!disposed) composer.render() }
  window.addEventListener('interactivecaptureprepare',prepareCapture)
  const onVisibility = () => {
    stream?.getVideoTracks().forEach(t => { t.enabled = !document.hidden })
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; reset() }
    else if (!disposed && !raf) { lastFrame = performance.now(); raf = requestAnimationFrame(tick) }
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('resize', resize)
  resize(); raf = requestAnimationFrame(tick)
  cleanup = () => {
    cancelAnimationFrame(raf); stopCamera(); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('keydown',keyDown); window.removeEventListener('keyup',keyUp); window.removeEventListener('blur',onBlur); window.removeEventListener('interactivecaptureprepare',prepareCapture)
    faceGeometry.dispose(); geometry.dispose(); material.dispose(); lineGeometry.dispose(); lineMaterial.dispose(); tailGeometry.dispose(); tailMaterial.dispose()
    background.geometry.dispose(); backgroundMaterial.dispose(); videoTexture.dispose(); composer.dispose(); bloom.dispose(); renderer.dispose()
  }
}
void start().catch(cause => {
  cleanup?.(); error.hidden = false
  error.textContent = cause instanceof Error && cause.message.includes('얼굴 데이터') ? cause.message : '화면을 준비하지 못했어요. 브라우저의 그래픽 가속을 켜고 새로고침해 주세요.'
  cameraButton.disabled = true; status.textContent = 'UNAVAILABLE · 화면 준비 실패'; console.error(cause)
})
