import './bakery.css'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

const KEYS = ['q', 'w', 'e', 'a', 's', 'd', 'z', 'x', 'c'] as const
type BreadKey = (typeof KEYS)[number]

const CODE_TO_KEY: Record<string, BreadKey> = {
  KeyQ: 'q', KeyW: 'w', KeyE: 'e',
  KeyA: 'a', KeyS: 's', KeyD: 'd',
  KeyZ: 'z', KeyX: 'x', KeyC: 'c',
}

const BREADS: Record<BreadKey, { name: string; english: string; color: number; accent: string }> = {
  q: { name: '우유 식빵냥', english: 'MILK LOAF', color: 0xf1c98f, accent: '#f0b76c' },
  w: { name: '초코 식빵냥', english: 'CHOCO LOAF', color: 0x8d563d, accent: '#9e674d' },
  e: { name: '딸기 크림냥', english: 'BERRY CREAM', color: 0xf4a6ae, accent: '#ef8697' },
  a: { name: '버터 크루냥', english: 'BUTTER CAT', color: 0xeeb867, accent: '#e6a443' },
  s: { name: '메론빵냥', english: 'MELON CAT', color: 0xaecb79, accent: '#8faf58' },
  d: { name: '팥빵냥', english: 'RED BEAN CAT', color: 0xc8896a, accent: '#b16f51' },
  z: { name: '소금빵냥', english: 'SALT ROLL', color: 0xe7bd7d, accent: '#daa35b' },
  x: { name: '블루베리냥', english: 'BERRY BUN', color: 0x9b91c9, accent: '#8074b6' },
  c: { name: '시나몬냥', english: 'CINNAMON CAT', color: 0xc79568, accent: '#af7749' },
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

type MovingBread = {
  group: THREE.Group
  bornAt: number
  lane: number
  speed: number
  packed: boolean
}

type FlourParticle = {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  bornAt: number
}

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main class="bakery-shell">
    <header class="bakery-header">
      <a href="${import.meta.env.BASE_URL}" class="bakery-brand" aria-label="홈으로 이동">
        <span class="brand-stamp" aria-hidden="true">ฅ</span>
        <span><strong>냥빵 공장</strong><small>CAT BREAD FACTORY</small></span>
      </a>
      <p><span></span> OVEN ONLINE · 180°C</p>
    </header>

    <section class="bakery-intro" aria-labelledby="bakery-title">
      <div>
        <p class="eyebrow">PRESS A KEY, BAKE A CAT</p>
        <h1 id="bakery-title">오늘도 말랑하게<br><em>냥빵 생산 중!</em></h1>
      </div>
      <div class="factory-counts" aria-live="polite">
        <div><span>오늘 만든 빵</span><strong id="bread-count">000</strong></div>
        <div><span>포장 완료</span><strong id="packed-count">000</strong></div>
      </div>
    </section>

    <section class="factory-layout">
      <div class="factory-stage" id="factory-stage">
        <canvas id="factory-canvas" aria-label="고양이 빵이 만들어지는 3D 컨베이어 벨트"></canvas>
        <div class="stage-badge"><span></span> LIVE FACTORY</div>
        <div class="bread-toast" id="bread-toast" aria-live="polite">
          <span id="toast-key">Q</span>
          <p><strong id="toast-name">우유 식빵냥</strong><small>갓 구워지는 중…</small></p>
        </div>
        <div class="factory-help">키를 누르면 오븐이 작동해요 <span>→</span></div>
      </div>

      <aside class="bread-menu">
        <div class="menu-heading">
          <p>BAKERY KEYBOARD</p>
          <h2>오늘의 냥빵</h2>
          <span id="sound-status">사운드 준비 중…</span>
        </div>
        <div class="bread-keys" role="group" aria-label="고양이 빵 키보드">
          ${KEYS.map((key) => {
            const bread = BREADS[key]
            return `
              <button class="bread-key" data-key="${key}" type="button" style="--accent:${bread.accent}" aria-label="${key.toUpperCase()} ${bread.name}">
                <span>${key.toUpperCase()}</span>
                <strong>${bread.name}</strong>
                <small>${bread.english}</small>
              </button>
            `
          }).join('')}
        </div>
        <p class="touch-tip"><i aria-hidden="true">✦</i> 여러 키를 함께 누르면 빵도 한꺼번에 나와요.</p>
      </aside>
    </section>

    <footer class="bakery-footer">
      <p>FRESHLY BAKED WITH KEYBOARD & LOVE</p>
      <a href="${import.meta.env.BASE_URL}sampler.html">냥발 샘플러로 돌아가기 <span>↗</span></a>
    </footer>
  </main>
`

const canvas = document.querySelector<HTMLCanvasElement>('#factory-canvas')!
const stage = document.querySelector<HTMLDivElement>('#factory-stage')!
const breadCountElement = document.querySelector<HTMLElement>('#bread-count')!
const packedCountElement = document.querySelector<HTMLElement>('#packed-count')!
const breadToast = document.querySelector<HTMLDivElement>('#bread-toast')!
const toastKey = document.querySelector<HTMLElement>('#toast-key')!
const toastName = document.querySelector<HTMLElement>('#toast-name')!
const soundStatus = document.querySelector<HTMLElement>('#sound-status')!
const buttons = new Map<BreadKey, HTMLButtonElement>()
const buffers = new Map<BreadKey, AudioBuffer>()
const activeInputs = new Map<BreadKey, Set<string>>(KEYS.map((key) => [key, new Set()]))
const pointerKeys = new Map<number, BreadKey>()

document.querySelectorAll<HTMLButtonElement>('.bread-key').forEach((button) => {
  buttons.set(button.dataset.key as BreadKey, button)
})

const AudioContextClass = window.AudioContext ?? window.webkitAudioContext
const audioContext = new AudioContextClass({ latencyHint: 'interactive' })
let breadCount = 0
let packedCount = 0
let toastTimer = 0
let spawnBread3D: (key: BreadKey) => void = () => undefined

async function ensureAudioReady() {
  if (audioContext.state === 'suspended') await audioContext.resume()
}

async function loadSound(key: BreadKey) {
  for (const extension of ['wav', 'mp3']) {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}sounds/${key}.${extension}`)
      if (!response.ok || (response.headers.get('content-type') ?? '').includes('text/html')) continue
      buffers.set(key, await audioContext.decodeAudioData(await response.arrayBuffer()))
      return true
    } catch {
      // Continue with the other supported extension.
    }
  }
  return false
}

async function loadSounds() {
  const loaded = (await Promise.all(KEYS.map(loadSound))).filter(Boolean).length
  soundStatus.textContent = `${loaded}/9 SOUND READY`
}

function playSound(key: BreadKey) {
  const buffer = buffers.get(key)
  if (!buffer) return
  const source = audioContext.createBufferSource()
  const gain = audioContext.createGain()
  source.buffer = buffer
  gain.gain.value = .82
  source.connect(gain).connect(audioContext.destination)
  source.start(audioContext.currentTime)
}

function updateCounts() {
  breadCountElement.textContent = String(breadCount).padStart(3, '0')
  packedCountElement.textContent = String(packedCount).padStart(3, '0')
}

function showToast(key: BreadKey) {
  window.clearTimeout(toastTimer)
  toastKey.textContent = key.toUpperCase()
  toastName.textContent = BREADS[key].name
  breadToast.classList.remove('show')
  void breadToast.offsetWidth
  breadToast.classList.add('show')
  toastTimer = window.setTimeout(() => breadToast.classList.remove('show'), 1100)
}

async function pressBreadKey(key: BreadKey, token: string) {
  const inputs = activeInputs.get(key)!
  if (inputs.has(token)) return
  inputs.add(token)
  buttons.get(key)!.classList.add('is-active')
  await ensureAudioReady()
  playSound(key)
  spawnBread3D(key)
  breadCount += 1
  updateCounts()
  showToast(key)
}

function releaseBreadKey(key: BreadKey, token: string) {
  const inputs = activeInputs.get(key)!
  inputs.delete(token)
  if (!inputs.size) buttons.get(key)!.classList.remove('is-active')
}

function makeCatBread(key: BreadKey) {
  const group = new THREE.Group()
  const bakedMaterial = (color: number, roughness = .72) => new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    clearcoat: .12,
    clearcoatRoughness: .58,
  })
  const crustMaterial = bakedMaterial(0xa96335, .76)
  const darkCrustMaterial = bakedMaterial(0x75422f, .78)
  const crumbMaterial = bakedMaterial(BREADS[key].color, .82)
  const faceMaterial = new THREE.MeshStandardMaterial({ color: 0x493029, roughness: .84 })
  const pinkMaterial = new THREE.MeshStandardMaterial({ color: 0xde8179, roughness: .65 })

  const addMesh = (mesh: THREE.Mesh) => {
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }

  const addEars = (material: THREE.Material, y: number, spread = .32, z = 0) => {
    const geometry = new THREE.ConeGeometry(.17, .32, 4)
    for (const side of [-1, 1]) {
      const ear = addMesh(new THREE.Mesh(geometry, material))
      ear.position.set(side * spread, y, z)
      ear.rotation.z = side * .12
      ear.rotation.y = Math.PI / 4
    }
  }

  const addFace = (z: number, y = 0, scale = 1) => {
    const eyeGeometry = new THREE.SphereGeometry(.046 * scale, 12, 8)
    for (const side of [-1, 1]) {
      const eye = addMesh(new THREE.Mesh(eyeGeometry, faceMaterial))
      eye.scale.z = .5
      eye.position.set(side * .18 * scale, y + .06 * scale, z)
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(.062 * scale, 14), pinkMaterial)
      cheek.position.set(side * .3 * scale, y - .055 * scale, z + .006)
      group.add(cheek)
    }
    const nose = addMesh(new THREE.Mesh(new THREE.SphereGeometry(.035 * scale, 10, 7), pinkMaterial))
    nose.scale.set(1.18, .72, .48)
    nose.position.set(0, y - .035 * scale, z + .018)
  }

  const addSeeds = (count: number, color = 0xf7e6bc, y = .4, z = .3) => {
    const seedMaterial = new THREE.MeshStandardMaterial({ color, roughness: .8 })
    for (let seedIndex = 0; seedIndex < count; seedIndex += 1) {
      const seed = addMesh(new THREE.Mesh(new THREE.SphereGeometry(.035, 9, 6), seedMaterial))
      const column = seedIndex % 4
      const row = Math.floor(seedIndex / 4)
      seed.scale.set(.55, 1.45, .38)
      seed.rotation.z = (seedIndex % 2 ? 1 : -1) * .55
      seed.position.set(-.3 + column * .2 + row * .04, y - row * .13 + Math.sin(seedIndex) * .025, z)
    }
  }

  if (key === 'q' || key === 'w' || key === 'e') {
    const outer = addMesh(new THREE.Mesh(new RoundedBoxGeometry(1.18, .88, .72, 7, .22), key === 'w' ? darkCrustMaterial : crustMaterial))
    outer.position.y = -.02
    const leftCrown = addMesh(new THREE.Mesh(new THREE.SphereGeometry(.34, 22, 14), key === 'w' ? darkCrustMaterial : crustMaterial))
    leftCrown.scale.set(1.05, .65, .92)
    leftCrown.position.set(-.27, .39, 0)
    const rightCrown = leftCrown.clone()
    rightCrown.position.x = .27
    group.add(rightCrown)
    const inner = addMesh(new THREE.Mesh(new RoundedBoxGeometry(.94, .65, .055, 6, .17), crumbMaterial))
    inner.position.set(0, -.03, .385)
    addEars(crumbMaterial, .48, .3, .36)
    addFace(.425, -.05, .9)
    if (key === 'e') {
      const cream = addMesh(new THREE.Mesh(new THREE.SphereGeometry(.16, 18, 12), bakedMaterial(0xffeee0, .5)))
      cream.scale.set(1.45, .58, .72)
      cream.position.set(0, .27, .43)
      const berry = addMesh(new THREE.Mesh(new THREE.SphereGeometry(.085, 14, 9), bakedMaterial(0xc94e5d, .42)))
      berry.position.set(.03, .35, .5)
    }
  } else if (key === 'a') {
    const sizes = [.29, .37, .43, .37, .29]
    sizes.forEach((size, segmentIndex) => {
      const segment = addMesh(new THREE.Mesh(new THREE.SphereGeometry(size, 24, 15), bakedMaterial(0xd99137, .67)))
      const offset = segmentIndex - 2
      segment.scale.set(.9, 1, .76)
      segment.position.set(offset * .23, Math.abs(offset) * .075 - .08, 0)
    })
    addEars(bakedMaterial(0xd99137, .67), .43, .29)
    addFace(.34, -.06, .82)
  } else if (key === 's') {
    const body = addMesh(new THREE.Mesh(new THREE.SphereGeometry(.57, 30, 20), crumbMaterial))
    body.scale.set(1.02, .78, .73)
    addEars(crumbMaterial, .45)
    const scoreMaterial = bakedMaterial(0x7f9b4f, .8)
    for (const direction of [-1, 1]) {
      for (let lineIndex = -1; lineIndex <= 1; lineIndex += 1) {
        const score = addMesh(new THREE.Mesh(new THREE.BoxGeometry(.035, .78, .035), scoreMaterial))
        score.position.set(lineIndex * .21, .03, .415)
        score.rotation.z = direction * .65
      }
    }
    addFace(.43, -.06, .9)
  } else if (key === 'd') {
    const body = addMesh(new THREE.Mesh(new THREE.SphereGeometry(.58, 30, 20), crumbMaterial))
    body.scale.set(1.03, .76, .73)
    addEars(crumbMaterial, .45)
    addSeeds(8, 0xf6e3b6, .39, .31)
    addFace(.43, -.08, .9)
  } else if (key === 'z') {
    const rollMaterial = bakedMaterial(0xd89443, .72)
    for (let segmentIndex = 0; segmentIndex < 5; segmentIndex += 1) {
      const offset = segmentIndex - 2
      const segment = addMesh(new THREE.Mesh(new THREE.SphereGeometry(.35, 22, 14), rollMaterial))
      segment.scale.set(.92, .8 - Math.abs(offset) * .06, .76)
      segment.position.set(offset * .22, Math.abs(offset) * .045 - .04, 0)
    }
    addEars(rollMaterial, .4, .3)
    addSeeds(4, 0xfff1d2, .29, .31)
    addFace(.34, -.09, .8)
  } else if (key === 'x') {
    const body = addMesh(new THREE.Mesh(new THREE.SphereGeometry(.58, 30, 20), crumbMaterial))
    body.scale.set(1.03, .78, .73)
    addEars(crumbMaterial, .45)
    const berryMaterial = bakedMaterial(0x504780, .4)
    for (let berryIndex = 0; berryIndex < 5; berryIndex += 1) {
      const berry = addMesh(new THREE.Mesh(new THREE.SphereGeometry(.07, 14, 9), berryMaterial))
      berry.position.set(-.24 + berryIndex * .12, .37 + Math.sin(berryIndex * 1.7) * .07, .28)
    }
    addFace(.43, -.08, .9)
  } else {
    const rollMaterial = bakedMaterial(0xba7748, .72)
    const body = addMesh(new THREE.Mesh(new THREE.CylinderGeometry(.57, .57, .62, 32), rollMaterial))
    body.rotation.x = Math.PI / 2
    const inner = addMesh(new THREE.Mesh(new THREE.CircleGeometry(.48, 32), bakedMaterial(0xd9a06c, .74)))
    inner.position.z = .325
    const spiralPoints: THREE.Vector3[] = []
    for (let pointIndex = 0; pointIndex < 34; pointIndex += 1) {
      const progress = pointIndex / 33
      const angle = progress * Math.PI * 4.5
      const radius = .04 + progress * .34
      spiralPoints.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, .342))
    }
    const spiral = addMesh(new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiralPoints), 50, .025, 7, false),
      darkCrustMaterial,
    ))
    spiral.position.y = .02
    addEars(rollMaterial, .46, .31)
    addFace(.37, -.1, .76)
  }

  const toastSpotMaterial = new THREE.MeshBasicMaterial({ color: 0x8b4e2d, transparent: true, opacity: .16 })
  for (let spotIndex = 0; spotIndex < 7; spotIndex += 1) {
    const spot = new THREE.Mesh(new THREE.CircleGeometry(.018 + Math.random() * .018, 8), toastSpotMaterial)
    spot.position.set((Math.random() - .5) * .7, (Math.random() - .5) * .42, .448)
    group.add(spot)
  }

  return group
}

function initializeFactory() {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.12
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0xfff5df, 12, 24)
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 50)
  camera.position.set(0, 5.6, 10.5)
  camera.lookAt(0, .75, 0)

  scene.add(new THREE.HemisphereLight(0xfff9eb, 0xa97968, 2.3))
  const sunlight = new THREE.DirectionalLight(0xfff3d3, 4.2)
  sunlight.position.set(-5, 9, 7)
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(1024, 1024)
  sunlight.shadow.camera.left = -8
  sunlight.shadow.camera.right = 8
  sunlight.shadow.camera.top = 6
  sunlight.shadow.camera.bottom = -5
  scene.add(sunlight)
  const ovenLight = new THREE.PointLight(0xff8040, 18, 8)
  ovenLight.position.set(-3.7, 2.3, 0)
  scene.add(ovenLight)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 12),
    new THREE.MeshStandardMaterial({ color: 0xf4dfbd, roughness: .85 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -.55
  floor.receiveShadow = true
  scene.add(floor)

  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0x9a827a, roughness: .38, metalness: .55 })
  const beltMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3c3a, roughness: .72 })
  const beltBase = new THREE.Mesh(new RoundedBoxGeometry(8.9, .52, 2.35, 4, .18), metalMaterial)
  beltBase.position.y = -.06
  beltBase.castShadow = true
  beltBase.receiveShadow = true
  scene.add(beltBase)
  const belt = new THREE.Mesh(new RoundedBoxGeometry(8.5, .18, 2.02, 4, .1), beltMaterial)
  belt.position.y = .28
  belt.receiveShadow = true
  scene.add(belt)

  const slats: THREE.Mesh[] = []
  for (let slatIndex = 0; slatIndex < 19; slatIndex += 1) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(.055, .025, 1.92), new THREE.MeshStandardMaterial({ color: 0x786460, roughness: .55 }))
    slat.position.set(-4.2 + slatIndex * .47, .39, 0)
    slats.push(slat)
    scene.add(slat)
  }

  for (const x of [-4.3, 4.3]) {
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 2.35, 24), metalMaterial)
    roller.rotation.x = Math.PI / 2
    roller.position.set(x, .08, 0)
    roller.castShadow = true
    scene.add(roller)
  }

  const machineMaterial = new THREE.MeshPhysicalMaterial({ color: 0xf2a878, roughness: .32, clearcoat: .7 })
  const machineDark = new THREE.MeshStandardMaterial({ color: 0x543c3a, roughness: .55 })
  for (const x of [-4.05, -2.55]) {
    const pillar = new THREE.Mesh(new RoundedBoxGeometry(.38, 2.75, 2.65, 4, .12), machineMaterial)
    pillar.position.set(x, 1.55, 0)
    pillar.castShadow = true
    scene.add(pillar)
  }
  const machineTop = new THREE.Mesh(new RoundedBoxGeometry(1.9, .48, 2.65, 4, .14), machineMaterial)
  machineTop.position.set(-3.3, 2.9, 0)
  machineTop.castShadow = true
  scene.add(machineTop)
  const machineBack = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.9, .18), machineDark)
  machineBack.position.set(-3.3, 1.55, -1.18)
  scene.add(machineBack)

  const machineLampMaterial = new THREE.MeshStandardMaterial({ color: 0xffb15d, emissive: 0xff5b24, emissiveIntensity: .85 })
  const machineLamp = new THREE.Mesh(new THREE.SphereGeometry(.12, 18, 12), machineLampMaterial)
  machineLamp.position.set(-3.3, 3.22, 1.02)
  scene.add(machineLamp)

  const packageMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xbde5dc,
    transparent: true,
    opacity: .38,
    transmission: .45,
    roughness: .12,
    thickness: .3,
  })
  const packageBox = new THREE.Mesh(new RoundedBoxGeometry(1.55, 1.55, 2.5, 4, .16), packageMaterial)
  packageBox.position.set(4.1, .98, 0)
  packageBox.receiveShadow = true
  scene.add(packageBox)

  const breads: MovingBread[] = []
  const flour: FlourParticle[] = []
  const flourGeometry = new THREE.SphereGeometry(.045, 8, 6)
  const flourMaterial = new THREE.MeshBasicMaterial({ color: 0xfff8df, transparent: true, opacity: .9 })

  spawnBread3D = (key) => {
    const group = makeCatBread(key)
    const lane = (Math.random() - .5) * .9
    group.position.set(-3.35, 2.4, lane)
    group.scale.setScalar(.05)
    scene.add(group)
    breads.push({ group, bornAt: performance.now(), lane, speed: 1 + Math.random() * .14, packed: false })
    ovenLight.intensity = 36
    machineLampMaterial.emissiveIntensity = 2.4

    for (let particleIndex = 0; particleIndex < 13; particleIndex += 1) {
      const mesh = new THREE.Mesh(flourGeometry, flourMaterial.clone())
      mesh.position.set(-3.3, 1.8, lane)
      scene.add(mesh)
      flour.push({
        mesh,
        bornAt: performance.now(),
        velocity: new THREE.Vector3((Math.random() - .5) * 1.2, .8 + Math.random() * 1.2, (Math.random() - .5) * 1.1),
      })
    }
  }

  const resize = () => {
    const rect = stage.getBoundingClientRect()
    renderer.setSize(rect.width, rect.height, false)
    camera.aspect = rect.width / rect.height
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(stage)
  resize()

  const clock = new THREE.Clock()
  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), .04)
    const now = performance.now()
    slats.forEach((slat) => {
      slat.position.x += delta * 1.12
      if (slat.position.x > 4.25) slat.position.x -= 8.93
    })
    ovenLight.intensity = THREE.MathUtils.damp(ovenLight.intensity, 18, 5, delta)
    machineLampMaterial.emissiveIntensity = THREE.MathUtils.damp(machineLampMaterial.emissiveIntensity, .85, 6, delta)

    for (let breadIndex = breads.length - 1; breadIndex >= 0; breadIndex -= 1) {
      const item = breads[breadIndex]
      const age = (now - item.bornAt) / 1000
      if (age < .58) {
        const progress = age / .58
        const bounce = Math.sin(progress * Math.PI) * .38
        item.group.position.y = THREE.MathUtils.lerp(2.4, .96, progress) + bounce
        item.group.scale.setScalar(Math.min(1, progress * 2.8))
      } else {
        item.group.position.y = .78 + Math.abs(Math.sin((age - .58) * 5.5)) * Math.max(0, .09 - (age - .58) * .03)
        item.group.position.x += delta * item.speed
        item.group.position.z = item.lane
        item.group.rotation.y = Math.sin(age * 2.4) * .06
      }
      if (item.group.position.x > 3.75 && !item.packed) {
        item.packed = true
        packedCount += 1
        updateCounts()
        packageMaterial.emissive.setHex(0x72cdb8)
        packageMaterial.emissiveIntensity = .55
      }
      if (item.group.position.x > 5.15) {
        scene.remove(item.group)
        item.group.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return
          object.geometry.dispose()
          if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose())
          else object.material.dispose()
        })
        breads.splice(breadIndex, 1)
      }
    }
    packageMaterial.emissiveIntensity = THREE.MathUtils.damp(packageMaterial.emissiveIntensity, 0, 5, delta)

    for (let particleIndex = flour.length - 1; particleIndex >= 0; particleIndex -= 1) {
      const particle = flour[particleIndex]
      const age = (now - particle.bornAt) / 1000
      particle.velocity.y -= delta * 1.9
      particle.mesh.position.addScaledVector(particle.velocity, delta)
      const material = particle.mesh.material as THREE.MeshBasicMaterial
      material.opacity = Math.max(0, 1 - age / 1.15)
      if (age > 1.15) {
        scene.remove(particle.mesh)
        material.dispose()
        flour.splice(particleIndex, 1)
      }
    }
    renderer.render(scene, camera)
  })

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      renderer.dispose()
    })
  }
}

window.addEventListener('keydown', (event) => {
  const key = CODE_TO_KEY[event.code]
  if (!key || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return
  event.preventDefault()
  void pressBreadKey(key, `key:${key}`)
})

window.addEventListener('keyup', (event) => {
  const key = CODE_TO_KEY[event.code]
  if (key) releaseBreadKey(key, `key:${key}`)
})

window.addEventListener('blur', () => {
  activeInputs.forEach((tokens, key) => [...tokens].forEach((token) => releaseBreadKey(key, token)))
})

buttons.forEach((button, key) => {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    const token = `pointer:${event.pointerId}`
    pointerKeys.set(event.pointerId, key)
    button.setPointerCapture(event.pointerId)
    void pressBreadKey(key, token)
  })
  const release = (event: PointerEvent) => {
    const pressedKey = pointerKeys.get(event.pointerId)
    if (!pressedKey) return
    releaseBreadKey(pressedKey, `pointer:${event.pointerId}`)
    pointerKeys.delete(event.pointerId)
  }
  button.addEventListener('pointerup', release)
  button.addEventListener('pointercancel', release)
})

try {
  initializeFactory()
} catch (error) {
  console.warn('3D bakery could not start.', error)
}
void loadSounds()
