import './season-forest.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { advanceSwimReaction, advanceTreeSpring, coastlineRadius, makeSwimRoutes, swimPosition } from './season-forest-ocean'
import { setupResidents } from './season-forest-settlement'
import { EXPEDITION_DOCK } from './season-forest-expedition'
import { setupDeepSea } from './season-forest-deep-sea'

type Season = 'spring' | 'summer' | 'autumn' | 'winter'
type SeasonStyle = { name: string; english: string; icon: string; description: string; grass: string; leaves: string[]; accent: string }
const seasons: Record<Season, SeasonStyle> = {
  spring: { name: '봄', english: 'Spring', icon: '✿', description: '분홍빛 꽃잎이 흩날리고,<br>작은 숲이 기지개를 켜요.', grass: '#add286', leaves: ['#efb4ba', '#f5cbd0', '#91bd75'], accent: '#c58f9b' },
  summer: { name: '여름', english: 'Summer', icon: '☀', description: '초록이 가장 짙어지는 시간.<br>바닷바람이 숲을 지나가요.', grass: '#88bb6d', leaves: ['#4e9767', '#6fa963', '#a0c575'], accent: '#77985a' },
  autumn: { name: '가을', english: 'Autumn', icon: '❧', description: '나무마다 노을이 내려앉고,<br>도토리가 오솔길을 채워요.', grass: '#c2c181', leaves: ['#d88750', '#e6b05f', '#b8a25c'], accent: '#c18b51' },
  winter: { name: '겨울', english: 'Winter', icon: '❄', description: '지붕 위로 소복이 쌓인 눈.<br>숲은 잠시 쉬어가는 중이에요.', grass: '#e5eee3', leaves: ['#dcebe4', '#f4f3e7', '#9db9aa'], accent: '#93b5b3' },
}
const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
let month = new Date().getMonth()
const seasonFor = (value: number, south = false): Season => {
  const order: Season[] = ['winter', 'spring', 'summer', 'autumn']
  return order[(Math.floor(((value + 1) % 12) / 3) + (south ? 2 : 0)) % 4]
}
const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <main class="forest-app">
    <header class="forest-header">
      <a class="forest-brand" href="${import.meta.env.BASE_URL}#season-forest" aria-label="Interactive Lab 계절의 숲"><span class="brand-leaf" aria-hidden="true">⌁</span><span><b>계절의 숲</b><small>A LITTLE WORLD</small></span></a>
      <span class="header-note">A LITTLE WORLD, DEEP BELOW.</span>
      <span class="world-status"><i></i>깊은 바닷속, 우리의 작은 지구</span>
    </header>
    <section class="intro" aria-labelledby="world-title">
      <span class="eyebrow">YOUR OWN LITTLE PLANET</span>
      <h1 id="world-title">작은 지구,<br>서로 다른 계절.</h1>
      <p>어딘가에 봄이 찾아오면<br>지구 반대편에는 가을이 내려앉아요.<br>천천히 돌려, 당신의 계절을 만나보세요.</p>
      <p class="edition">FIELD NOTES &nbsp; / &nbsp; NO. 001</p>
    </section>
    <section class="world-stage" aria-label="드래그와 확대·축소가 가능한 3D 지구">
      <canvas class="world-canvas" tabindex="0" aria-label="3D 지구. 마우스로 숲과 바다를 휘저으면 나무가 흔들리고 물고기가 피합니다. 드래그로 회전, 휠 또는 두 손가락으로 확대·축소. 방향키로 회전, 더하기와 빼기로 확대·축소, Home으로 초기화."></canvas>
      <div class="render-error" role="alert" hidden>3D 지구를 표시할 수 없어요.<br>브라우저의 하드웨어 가속을 켜고 새로고침해 주세요.</div>
      <span class="world-caption">A WORLD THAT GROWS WITH THE SEASONS</span>
    </section>
    <aside class="season-notes" aria-label="북반구와 남반구의 계절" aria-live="polite">
      <article class="hemisphere" id="north-season"></article>
      <article class="hemisphere" id="south-season"></article>
      <p class="equator-note"><span>↝</span> 같은 순간, 다른 계절<br>적도를 사이에 둔 두 개의 이야기</p>
    </aside>
    <div class="view-controls" aria-label="지구 보기 조작">
      <div class="control-group"><button id="zoom-out" aria-label="축소">−</button><output id="zoom-level" aria-label="확대 비율">100%</output><button id="zoom-in" aria-label="확대">+</button></div>
      <button class="round-control" id="reset-view" aria-label="시점 초기화" title="처음 시점으로">↺</button>
      <button class="motion-control" id="auto-rotate" aria-pressed="false"><i></i><span>자동 회전</span></button>
    </div>
    <div class="map-options"><button id="cloud-toggle" aria-pressed="true">구름 보기</button><button id="equator-toggle" aria-pressed="false">적도 보기</button></div>
    <section class="calendar" aria-label="월별 계절 선택">
      <div class="calendar-title"><small>A MOMENT IN</small><strong id="selected-month"></strong></div>
      <div class="month-track">${monthNames.map((name, index) => `<button class="month-button" data-month="${index}" aria-label="${index + 1}월" aria-pressed="false"><b>${String(index + 1).padStart(2, '0')}</b><span>${name}</span></button>`).join('')}</div>
    </section>
    <footer class="forest-footer"><span>마우스로 숲과 바다를 휘저어 보세요</span><span>드래그로 지구 돌리기 &nbsp; · &nbsp; 스크롤 / 핀치로 가까이 보기</span></footer>
  </main>
`

function updateSeasonNotes() {
  for (const south of [false, true]) {
    const style = seasons[seasonFor(month, south)]
    const element = document.querySelector<HTMLElement>(south ? '#south-season' : '#north-season')!
    element.style.setProperty('--season-color', style.accent)
    element.innerHTML = `<div class="hemisphere-label">${south ? '남반구' : '북반구'}<span>${south ? 'SOUTH' : 'NORTH'}</span></div><h2 class="season-title"><span class="season-icon" aria-hidden="true">${style.icon}</span>${style.name}<small style="font:10px 'DM Sans',sans-serif;color:#929a87">${style.english}</small></h2><p class="season-description">${style.description}</p><div class="season-palette" aria-hidden="true">${style.leaves.map(color => `<i style="background:${color}"></i>`).join('')}</div>`
  }
  document.querySelector('#selected-month')!.innerHTML = `${month + 1}월 <span>${monthNames[month]}</span>`
  document.querySelectorAll<HTMLButtonElement>('.month-button').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.month) === month)))
}
updateSeasonNotes()

const canvas = document.querySelector<HTMLCanvasElement>('.world-canvas')!
const stage = document.querySelector<HTMLElement>('.world-stage')!
let renderer: THREE.WebGLRenderer
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })
  initWorld(renderer)
} catch (error) {
  console.error('Unable to initialize the seasonal world', error)
  document.querySelector<HTMLElement>('.render-error')!.hidden = false
  canvas.hidden = true
  document.querySelectorAll<HTMLButtonElement>('.view-controls button, .map-options button').forEach(button => { button.disabled = true })
}

function initWorld(renderer: THREE.WebGLRenderer) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8))
  renderer.setClearColor(0x000000, 0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.12
  const scene = new THREE.Scene()
  const deepSea = setupDeepSea(scene, reducedMotion)
  const camera = new THREE.PerspectiveCamera(37, 1, .1, 80)
  const home = new THREE.Vector3(0, 1.5, 13.8)
  camera.position.copy(home)
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = .065
  controls.enablePan = false
  controls.rotateSpeed = .65
  controls.zoomSpeed = .7
  controls.minDistance = 7.1
  controls.maxDistance = 22
  controls.minPolarAngle = .12
  controls.maxPolarAngle = Math.PI - .12
  controls.autoRotate = false
  controls.autoRotateSpeed = .32
  controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE
  scene.add(new THREE.HemisphereLight('#c0eaf0', '#294d67', 2.1))
  const sun = new THREE.DirectionalLight('#c6f2f5', 2.8)
  sun.position.set(-5, 8, 7)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = sun.shadow.camera.bottom = -4.7
  sun.shadow.camera.right = sun.shadow.camera.top = 4.7
  sun.shadow.normalBias = .035
  sun.shadow.bias = -.0002
  scene.add(sun)
  const fill = new THREE.DirectionalLight('#61b8d5', 1.6)
  fill.position.set(5, -2, -4)
  scene.add(fill)
  const world = new THREE.Group()
  scene.add(world)
  const materials = new Set<THREE.Material>()
  const geometries = new Set<THREE.BufferGeometry>()
  const material = (color: string, roughness = .9) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness })
    materials.add(value)
    return value
  }
  const geometry = <T extends THREE.BufferGeometry>(value: T): T => { geometries.add(value); return value }
  const sphere = geometry(new THREE.SphereGeometry(1, 12, 9))
  const cone = geometry(new THREE.ConeGeometry(1, 1, 7))
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 8))
  const box = geometry(new THREE.BoxGeometry(1, 1, 1))
  const trunk = material('#896c4a')
  const cream = material('#fff0c9')
  const dark = material('#596d60')
  const roof = material('#b77759')
  const roofBlue = material('#6e938d')
  const windowMat = material('#f3cd81')
  const rockMat = material('#b3b8a0')
  const sandMat = material('#e9d8aa')
  const sea = material('#72bab6', .48)
  const white = material('#fffdf0')
  const blossom = material('#f6e3b3')
  const palmGreen = material('#579873')
  const jungleGreen = material('#79b48a')
  const duneMat = material('#dfbc81')
  const clayMat = material('#c88e6b')
  const cactusMat = material('#739872')
  const lakeMat = material('#78bdbe', .3)
  const shallowsMat = material('#8dccbf', .6)
  const meadowFlowers = ['#ebadba', '#d5c0df', '#f6da83', '#faf0d8'].map(color => material(color))
  const roofGeometry = geometry(new THREE.ConeGeometry(.245, .20, 4))
  function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) {
    const result = new THREE.Mesh(geo, mat)
    result.position.set(x, y, z)
    result.scale.set(sx, sy, sz)
    result.castShadow = true
    result.receiveShadow = true
    parent.add(result)
    return result
  }
  mesh(world, geometry(new THREE.SphereGeometry(3, 96, 64)), sea, 0, 0, 0, 1)
  const seasonal = [false, true].map(south => {
    const style = seasons[seasonFor(month, south)]
    return { south, grass: material(style.grass), leaves: style.leaves.map(color => material(color)), snow: material('#f5f5e9'), snowCaps: [] as THREE.Object3D[] }
  })
  let seed = 67281
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296 }
  const point = (lat: number, lon: number, radius: number) => new THREE.Vector3(Math.cos(lat) * Math.sin(lon) * radius, Math.sin(lat) * radius, Math.cos(lat) * Math.cos(lon) * radius)
  const radialGroup = (lat: number, lon: number, radius = 3.085) => {
    const group = new THREE.Group()
    group.position.copy(point(lat, lon, radius))
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), group.position.clone().normalize())
    world.add(group)
    return group
  }
  type Biome = 'woodland' | 'alpine' | 'meadow' | 'tropical' | 'desert' | 'wetland'
  type Island = { lat: number; lon: number; width: number; height: number; phase: number; trees: number; biome: Biome }
  const islands: Island[] = [
    { lat: .57, lon: -.48, width: .62, height: .43, phase: 1, trees: 100, biome: 'woodland' },
    { lat: -.49, lon: .31, width: .58, height: .39, phase: 4, trees: 80, biome: 'meadow' },
    { lat: .64, lon: .80, width: .43, height: .38, phase: 2, trees: 65, biome: 'alpine' },
    { lat: -.27, lon: -.88, width: .32, height: .30, phase: 6, trees: 38, biome: 'desert' },
    { lat: -.96, lon: -.47, width: .42, height: .22, phase: 3, trees: 40, biome: 'alpine' },
    { lat: .02, lon: -.20, width: .30, height: .14, phase: 7, trees: 32, biome: 'tropical' },
    { lat: -.11, lon: .94, width: .24, height: .19, phase: 2, trees: 26, biome: 'wetland' },
    { lat: .35, lon: 1.87, width: .54, height: .42, phase: 5, trees: 80, biome: 'woodland' },
    { lat: -.55, lon: 2.24, width: .58, height: .38, phase: 7, trees: 70, biome: 'meadow' },
    { lat: .65, lon: -2.18, width: .57, height: .40, phase: 8, trees: 80, biome: 'alpine' },
    { lat: -.45, lon: -2.16, width: .46, height: .36, phase: 9, trees: 65, biome: 'woodland' },
    { lat: 1.20, lon: 2.8, width: .66, height: .19, phase: 1, trees: 32, biome: 'alpine' },
    { lat: .02, lon: 2.90, width: .34, height: .19, phase: 3, trees: 38, biome: 'tropical' },
    { lat: -.15, lon: -1.49, width: .16, height: .16, phase: 5, trees: 20, biome: 'tropical' },
    { lat: -.83, lon: -3.05, width: .35, height: .23, phase: 4, trees: 30, biome: 'wetland' },
    { lat: .37, lon: -3.02, width: .35, height: .25, phase: 2, trees: 35, biome: 'desert' },
  ]
  const edge = coastlineRadius
  type TreePart = { local: THREE.Matrix4; batch?: THREE.InstancedMesh; index: number; mesh: THREE.Mesh }
  const trees: { group: THREE.Group; base: THREE.Matrix4; inverse: THREE.Quaternion; x: number; z: number; vx: number; vz: number; parts: TreePart[] }[] = []
  function registerTree(group: THREE.Group) {
    trees.push({ group, base: new THREE.Matrix4(), inverse: group.quaternion.clone().invert(), x: 0, z: 0, vx: 0, vz: 0, parts: [] })
  }
  function land(island: Island, scale: number, radius: number, mat: THREE.Material) {
    const vertices: number[] = [], indices: number[] = []
    const rings = 12, segments = 80
    for (let ring = 0; ring <= rings; ring++) {
      for (let i = 0; i <= segments; i++) {
        const angle = i / segments * Math.PI * 2
        const r = ring / rings * edge(angle, island.phase) * scale
        const lat = island.lat + Math.sin(angle) * island.height * r
        const lon = island.lon + Math.cos(angle) * island.width * r
        const height = radius + .025 * Math.sin(ring / rings * Math.PI)
        const p = point(lat, lon, height)
        vertices.push(p.x, p.y, p.z)
        if (ring < rings && i < segments) {
          const a = ring * (segments + 1) + i, b = a + segments + 1
          indices.push(a, b, a + 1, b, b + 1, a + 1)
        }
      }
    }
    const geo = geometry(new THREE.BufferGeometry())
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    mesh(world, geo, mat, 0, 0, 0, 1)
  }
  function tree(lat: number, lon: number, pine: boolean, evergreen = false) {
    const group = radialGroup(lat, lon, 3.11)
    const palette = seasonal[Number(lat < 0)]
    const size = .52 + random() * .40
    group.scale.setScalar(size)
    mesh(group, cylinder, trunk, 0, .10, 0, .035, .21, .035)
    const leafMat = evergreen ? jungleGreen : palette.leaves[Math.floor(random() * 3)]
    if (pine) {
      mesh(group, cone, leafMat, 0, .23, 0, .16, .25, .16)
      mesh(group, cone, leafMat, 0, .35, 0, .12, .24, .12)
      const cap = mesh(group, cone, palette.snow, 0, .43, 0, .07, .10, .07)
      palette.snowCaps.push(cap)
    } else {
      mesh(group, sphere, leafMat, 0, .28, 0, .16, .18, .15)
      mesh(group, sphere, leafMat, -.085, .25, .01, .10, .115, .11)
      mesh(group, sphere, leafMat, .08, .30, -.015, .11, .12, .12)
    }
    registerTree(group)
  }
  function house(lat: number, lon: number, blue = false) {
    const group = radialGroup(lat, lon, 3.12)
    group.rotateY(-.2 + random() * .4)
    mesh(group, box, cream, 0, .13, 0, .28, .24, .24)
    const roofGeo = roofGeometry
    const top = mesh(group, roofGeo, blue ? roofBlue : roof, 0, .33, 0, 1, 1, .95)
    top.rotation.y = Math.PI / 4
    mesh(group, box, trunk, 0, .075, .125, .065, .15, .012)
    mesh(group, box, windowMat, -.085, .15, .126, .05, .06, .013)
    mesh(group, box, dark, .14, .14, 0, .012, .07, .065)
    mesh(group, box, roof, .08, .40, -.05, .042, .13, .05)
    const snowTop = mesh(group, roofGeo, seasonal[Number(lat < 0)].snow, 0, .351, 0, 1.01, .91, .97)
    snowTop.rotation.y = Math.PI / 4
    seasonal[Number(lat < 0)].snowCaps.push(snowTop)
    // A little doorstep and a curved row of stepping stones.
    for (let i = 0; i < 4; i++) mesh(group, sphere, sandMat, Math.sin(i * .6) * .028, -.005 - i * .008, .19 + i * .075, .047, .013, .035)
    for (let i = 0; i < 4; i++) mesh(group, cylinder, cream, -.24 + i * .075, .06, .24, .012, .12, .012)
    mesh(group, box, cream, -.13, .08, .24, .24, .019, .018)
  }
  function palm(lat: number, lon: number) {
    const group = radialGroup(lat, lon, 3.11)
    group.rotateY(random() * Math.PI * 2)
    group.scale.setScalar(.7 + random() * .4)
    mesh(group, cylinder, trunk, 0, .15, 0, .023, .3, .023)
    for (let i = 0; i < 6; i++) {
      const angle = i / 6 * Math.PI * 2
      const frond = mesh(group, sphere, palmGreen, Math.cos(angle) * .10, .29, Math.sin(angle) * .10, .16, .026, .046)
      frond.rotation.y = -angle
      frond.rotation.z = .2
    }
    for (let i = 0; i < 3; i++) mesh(group, sphere, trunk, (i - 1) * .026, .255, .028, .023)
    registerTree(group)
  }
  function cactus(lat: number, lon: number) {
    const group = radialGroup(lat, lon, 3.11)
    group.rotateY(random() * Math.PI)
    const size = .65 + random() * .6
    group.scale.setScalar(size)
    mesh(group, sphere, cactusMat, 0, .11, 0, .035, .13, .038)
    mesh(group, sphere, cactusMat, -.055, .10, 0, .055, .024, .025)
    mesh(group, sphere, cactusMat, -.085, .14, 0, .024, .065, .025)
    mesh(group, sphere, cactusMat, .055, .15, 0, .055, .024, .025)
    mesh(group, sphere, cactusMat, .085, .19, 0, .024, .058, .025)
    mesh(group, sphere, meadowFlowers[0], 0, .245, 0, .026, .015, .026)
  }
  function mountain(lat: number, lon: number, height: number, snowy: boolean) {
    const group = radialGroup(lat, lon, 3.095)
    const body = mesh(group, cone, snowy ? rockMat : clayMat, 0, height / 2, 0, height * .53, height, height * .45)
    body.rotation.y = .4
    if (snowy) {
      const cap = mesh(group, cone, white, 0, height * .86, 0, height * .16, height * .30, height * .135)
      cap.rotation.y = .4
    }
  }
  function rabbit(lat: number, lon: number) {
    const group = radialGroup(lat, lon, 3.13)
    group.rotateY(random() * Math.PI * 2)
    mesh(group, sphere, cream, 0, .042, 0, .04, .045, .06)
    mesh(group, sphere, cream, 0, .084, .04, .036)
    for (const x of [-.016, .016]) {
      mesh(group, sphere, cream, x, .132, .042, .011, .045, .012)
      mesh(group, sphere, dark, x * 1.25, .09, .069, .005)
    }
    mesh(group, sphere, white, 0, .043, -.055, .018)
  }
  islands.forEach((island, index) => {
    const palette = seasonal[Number(island.lat < 0)]
    const { biome } = island
    const tropical = biome === 'tropical' || biome === 'wetland'
    const desert = biome === 'desert'
    const latAt = (y: number) => island.lat + y * island.height
    const lonAt = (x: number) => island.lon + x * island.width
    const patch = (x: number, y: number, width: number, height: number): Island => ({ ...island, lat: latAt(y), lon: lonAt(x), width: island.width * width, height: island.height * height })
    land(island, 1.18, 3.008, shallowsMat)
    land(island, 1.075, 3.035, sandMat)
    land(island, 1, 3.085, desert ? duneMat : tropical ? jungleGreen : palette.grass)
    // Smaller surface patches add clearings, inland water and a winding path.
    const hasLake = !desert && island.width > .3
    if (hasLake) {
      const pond = patch(-.36, .12, .28, .24)
      land(pond, 1.13, 3.119, sandMat)
      land(pond, 1, 3.128, lakeMat)
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2
        const group = radialGroup(latAt(.12 + Math.sin(a) * .20), lonAt(-.36 + Math.cos(a) * .24), 3.145)
        mesh(group, sphere, palmGreen, 0, 0, 0, .025, .005, .023)
        if (i % 3 === 0) mesh(group, sphere, meadowFlowers[0], 0, .014, 0, .013)
      }
    }
    if (!tropical && !desert) {
      const pathPoints = Array.from({ length: 28 }, (_, i) => {
        const x = -.72 + i * .052
        return point(latAt(-.18 + Math.sin(x * 4) * .07), lonAt(x), 3.118)
      })
      mesh(world, geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pathPoints), 42, .023, 5, false)), sandMat, 0, 0, 0, 1)
      house(latAt(-.06), lonAt(.08), index % 2 === 0)
      if (island.width > .45) house(latAt(.12), lonAt(.46), index % 2 !== 0)
    }
    if (biome === 'alpine' || desert) {
      for (let i = 0; i < 5; i++) {
        const x = -.06 + i * .14, y = .35 + Math.sin(i * 1.2) * .15
        if (index < 4 && Math.hypot((x - EXPEDITION_DOCK.x) / .29, (y - EXPEDITION_DOCK.y) / .32) < 1) continue
        mountain(latAt(y), lonAt(x), (desert ? .24 : .38) + random() * .28, !desert)
      }
    }
    function reserved(x: number, y: number, trees: boolean) {
      // A visible landing pad for the four initial exploration teams.
      if (index < 4 && Math.hypot((x - EXPEDITION_DOCK.x) / .29, (y - EXPEDITION_DOCK.y) / .32) < 1) return true
      // Resident meeting clearing and release pit on the home island.
      if (index === 0 && (Math.hypot((x - .02) / .46, (y + .52) / .30) < 1 || Math.hypot(x - .57, y + .48) < .16)) return true
      if (hasLake && Math.hypot((x + .36) / .36, (y - .12) / .32) < 1) return true
      if (!tropical && !desert) {
        if (Math.abs(y + .18 - Math.sin(x * 4) * .07) < (trees ? .11 : .04) && Math.abs(x) < .8) return true
        if (Math.hypot((x - .08) * island.width, (y + .06) * island.height) < (trees ? .12 : .075)) return true
        if (island.width > .45 && Math.hypot((x - .46) * island.width, (y - .12) * island.height) < (trees ? .11 : .075)) return true
      }
      if ((biome === 'alpine' || desert) && y > .18 && y < .72 && x > -.25 && x < .72) return true
      return false
    }
    // A filled spiral distributes vegetation through the interior as well as the coast.
    for (let i = 0; i < island.trees * 2; i++) {
      const angle = i * 2.39996 + island.phase
      const radius = Math.sqrt((i + .5) / (island.trees * 2)) * .9 * edge(angle, island.phase)
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius
      if (reserved(x, y, true)) continue
      const lat = latAt(y), lon = lonAt(x)
      if (desert) { if (i % 2 === 0) cactus(lat, lon) }
      else if (tropical && i % 3 !== 0) palm(lat, lon)
      else if (biome !== 'meadow' || i % 3 === 0 || y > .38) tree(lat, lon, biome === 'alpine' || (!tropical && random() > .78), tropical)
    }
    const details = desert ? 65 : biome === 'meadow' ? 350 : 190
    for (let i = 0; i < details; i++) {
      const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * .93 * edge(angle, island.phase)
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius
      if (reserved(x, y, false)) continue
      const group = radialGroup(latAt(y), lonAt(x), 3.123)
      group.rotateY(random() * Math.PI * 2)
      if (desert || i % 13 === 0) {
        mesh(group, sphere, desert ? clayMat : rockMat, 0, .017, 0, .025 + random() * .04, .025, .033)
      } else if (biome === 'meadow' || i % 5 === 0) {
        const flower = meadowFlowers[i % meadowFlowers.length]
        for (let j = 0; j < 3; j++) {
          const px = (j - 1) * .025, pz = Math.sin(j * 4) * .022
          mesh(group, cylinder, palmGreen, px, .025, pz, .004, .05, .004)
          mesh(group, sphere, flower, px, .053, pz, .021, .012, .021)
          mesh(group, sphere, blossom, px, .063, pz, .007)
        }
      } else if (i % 7 === 0) {
        mesh(group, cylinder, cream, 0, .024, 0, .01, .045, .01)
        mesh(group, sphere, roof, 0, .047, 0, .033, .016, .032)
      } else {
        const mat = tropical ? palmGreen : palette.leaves[2]
        for (let j = 0; j < 3; j++) mesh(group, cone, mat, (j - 1) * .015, .028, 0, .013, .045 + random() * .025, .016)
      }
    }
    if (biome === 'meadow' || biome === 'woodland') {
      for (let i = 0; i < 5; i++) rabbit(latAt(-.4 - random() * .14), lonAt(-.1 + i * .15))
    }
    if (biome === 'wetland') {
      for (let i = 0; i < 25; i++) {
        const a = random() * Math.PI * 2
        const group = radialGroup(latAt(Math.sin(a) * .85), lonAt(Math.cos(a) * .85), 3.12)
        for (let j = 0; j < 3; j++) {
          mesh(group, cylinder, palmGreen, j * .018, .07, 0, .005, .14, .005)
          mesh(group, cylinder, trunk, j * .018, .14, 0, .009, .045, .009)
        }
      }
    }
  })
  // Polar snow, away from the seasonal islands.
  const ice = material('#e4eee7')
  mesh(world, geometry(new THREE.SphereGeometry(3.018, 48, 14, 0, Math.PI * 2, 0, .21)), ice, 0, 0, 0, 1)
  const southIce = mesh(world, geometry(new THREE.SphereGeometry(3.018, 48, 14, 0, Math.PI * 2, 0, .21)), ice, 0, 0, 0, 1)
  southIce.rotation.x = Math.PI

  // Repeated forest details share one draw call per geometry/material combination.
  // Snow gets separate hemisphere batches so seasonal visibility remains independent.
  const instancedMeshes: THREE.InstancedMesh[] = []
  const snowOwners = new Map<THREE.Object3D, number>()
  seasonal.forEach((palette, hemisphere) => {
    palette.snowCaps.forEach(cap => snowOwners.set(cap, hemisphere))
    palette.snowCaps = []
  })
  const batches = new Map<string, { objects: THREE.Mesh[]; snow: number | undefined }>()
  world.updateMatrixWorld(true)
  const treeParts = new Map<THREE.Object3D, TreePart>()
  trees.forEach(tree => {
    tree.base.copy(tree.group.matrixWorld)
    tree.group.children.forEach(object => {
      if (!(object instanceof THREE.Mesh)) return
      const part: TreePart = { local: object.matrix.clone(), mesh: object, index: 0 }
      tree.parts.push(part)
      treeParts.set(object, part)
    })
  })
  world.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    const snow = snowOwners.get(object)
    const key = `${object.geometry.id}:${object.material.id}:${snow ?? 'all'}`
    if (!batches.has(key)) batches.set(key, { objects: [], snow })
    batches.get(key)!.objects.push(object)
  })
  batches.forEach(({ objects, snow }) => {
    if (objects.length < 3) {
      if (snow !== undefined) seasonal[snow].snowCaps.push(...objects)
      return
    }
    const batch = new THREE.InstancedMesh(objects[0].geometry, objects[0].material, objects.length)
    batch.castShadow = true
    batch.receiveShadow = true
    objects.forEach((object, index) => {
      batch.setMatrixAt(index, object.matrixWorld)
      const part = treeParts.get(object)
      if (part) { part.batch = batch; part.index = index }
      object.removeFromParent()
    })
    batch.instanceMatrix.needsUpdate = true
    batch.computeBoundingSphere()
    if (objects.some(object => treeParts.has(object))) {
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      batch.boundingSphere!.radius += .5
    }
    world.add(batch)
    instancedMeshes.push(batch)
    if (snow !== undefined) seasonal[snow].snowCaps.push(batch)
  })

  const wavePoints: number[] = []
  for (let i = 0; i < 320; i++) {
    const lat = (random() - .5) * Math.PI * .87, lon = random() * Math.PI * 2
    for (let j = 0; j < 4; j++) {
      for (const k of [j, j + 1]) {
        const p = point(lat + Math.sin(k / 4 * Math.PI) * .003, lon + k * .009, 3.008)
        wavePoints.push(p.x, p.y, p.z)
      }
    }
  }
  const waveGeo = geometry(new THREE.BufferGeometry())
  waveGeo.setAttribute('position', new THREE.Float32BufferAttribute(wavePoints, 3))
  const waveMat = new THREE.LineBasicMaterial({ color: '#d5ece0', transparent: true, opacity: .34 })
  materials.add(waveMat)
  world.add(new THREE.LineSegments(waveGeo, waveMat))
  const equatorGeo = geometry(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 161 }, (_, i) => point(0, i / 160 * Math.PI * 2, 3.035))))
  const equatorMat = new THREE.LineDashedMaterial({ color: '#fff2c9', dashSize: .065, gapSize: .045, transparent: true, opacity: .85 })
  materials.add(equatorMat)
  const equator = new THREE.Line(equatorGeo, equatorMat)
  equator.computeLineDistances()
  equator.visible = false
  world.add(equator)
  const clouds = new THREE.Group()
  world.add(clouds)
  const cloudAnchors = [[.92, -.8], [.16, .9], [-.6, -.68], [.9, 2.5], [-.4, -2.9], [.3, -1.45], [-.9, 1.6]]
  cloudAnchors.forEach(([lat, lon], index) => {
    const group = new THREE.Group()
    group.position.copy(point(lat, lon, 3.6 + random() * .12))
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), group.position.clone().normalize())
    const size = index % 2 ? .75 : 1
    group.scale.setScalar(size)
    mesh(group, sphere, white, 0, 0, 0, .29, .12, .14).castShadow = false
    mesh(group, sphere, white, -.11, .07, 0, .15, .13, .13).castShadow = false
    mesh(group, sphere, white, .09, .10, 0, .17, .15, .14).castShadow = false
    clouds.add(group)
  })
  // A tiny sailboat makes the scale feel like a handmade miniature.
  const boat = radialGroup(-.20, -.36, 3.035)
  mesh(boat, sphere, trunk, 0, .035, 0, .14, .055, .055)
  mesh(boat, cylinder, cream, 0, .16, 0, .008, .25, .008)
  const sailGeo = geometry(new THREE.BufferGeometry())
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, .29, 0, 0, .08, 0, .12, .10, 0], 3))
  sailGeo.computeVertexNormals()
  const sailMat = material('#fff6d7')
  sailMat.side = THREE.DoubleSide
  mesh(boat, sailGeo, sailMat, 0, 0, 0, 1)

  const sharkMat = material('#588898', .55)
  const whaleMat = material('#537f9e', .5)
  const bellyMat = material('#cbdeda', .65)
  const turtleMat = material('#79a56b')
  const shellMat = material('#557e56')
  const fishMats = ['#eab970', '#e69272', '#73a2b5'].map(color => material(color, .5))
  const finMat = material('#588898')
  finMat.side = THREE.DoubleSide
  const finGeo = geometry(new THREE.BufferGeometry())
  finGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .035, 0, .108, -.032, 0, 0, -.068], 3))
  finGeo.computeVertexNormals()
  const sideFinGeo = geometry(new THREE.BufferGeometry())
  sideFinGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .04, .12, -.008, -.055, 0, .015, -.023], 3))
  sideFinGeo.computeVertexNormals()
  const wakeMat = new THREE.LineBasicMaterial({ color: '#e2f5e5', transparent: true, opacity: .5 })
  materials.add(wakeMat)
  const wakeGeo = geometry(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 25 }, (_, i) => {
    const angle = -.85 + i / 24 * 1.7
    return new THREE.Vector3(Math.sin(angle) * .17, .003, -.02 - Math.cos(angle) * .24)
  })))
  const oceanLife = new THREE.Group()
  oceanLife.name = 'ocean-life'
  world.add(oceanLife)
  const routes = makeSwimRoutes(islands)
  type Creature = 'shark' | 'whale' | 'turtle' | 'fish'
  const species: Creature[] = ['shark', 'whale', 'turtle', 'fish', 'shark', 'fish', 'turtle']
  const swimmers = routes.map((route, index) => {
    const kind = species[index % species.length]
    const group = new THREE.Group()
    group.name = `swimmer-${kind}-${index}`
    oceanLife.add(group)
    const body = new THREE.Group()
    group.add(body)
    const tail = new THREE.Group()
    const flippers: THREE.Object3D[] = []
    const jets: THREE.Object3D[] = []
    body.add(tail)
    function eyes(parent: THREE.Object3D, width: number, y: number, z: number, size: number) {
      for (const side of [-1, 1]) {
        mesh(parent, sphere, dark, side * width, y, z, size)
        mesh(parent, sphere, white, side * (width + size * .4), y + size * .3, z + size * .4, size * .28)
      }
    }
    if (kind === 'shark') {
      mesh(body, sphere, sharkMat, 0, .037, 0, .058, .049, .15)
      mesh(body, sphere, bellyMat, 0, .013, .035, .051, .025, .12)
      mesh(body, sphere, sharkMat, 0, .03, .115, .038, .031, .072)
      mesh(body, finGeo, finMat, 0, .071, -.005, 1)
      for (const side of [-1, 1]) {
        mesh(body, sideFinGeo, finMat, side * .035, .027, .025, side, 1, 1)
        for (let j = 0; j < 3; j++) mesh(body, sphere, dark, side * .055, .046, .07 - j * .015, .002, .013, .003)
      }
      eyes(body, .04, .057, .11, .008)
      tail.position.set(0, .037, -.13)
      mesh(tail, sphere, sharkMat, 0, 0, -.022, .021, .025, .06)
      const upper = mesh(tail, sphere, sharkMat, 0, .037, -.063, .013, .062, .029)
      upper.rotation.x = -.4
      const lower = mesh(tail, sphere, sharkMat, 0, -.018, -.064, .013, .04, .024)
      lower.rotation.x = .45
    } else if (kind === 'whale') {
      mesh(body, sphere, whaleMat, 0, .049, 0, .084, .064, .155)
      mesh(body, sphere, bellyMat, 0, .015, .035, .078, .035, .122)
      mesh(body, sphere, whaleMat, 0, .045, .075, .075, .062, .092)
      eyes(body, .067, .061, .083, .009)
      for (const side of [-1, 1]) {
        const flipper = mesh(body, sphere, whaleMat, side * .086, .02, -.02, .075, .014, .028)
        flipper.rotation.y = side * .5
        flippers.push(flipper)
      }
      tail.position.set(0, .035, -.13)
      mesh(tail, sphere, whaleMat, 0, 0, -.02, .035, .024, .044)
      for (const side of [-1, 1]) {
        const fluke = mesh(tail, sphere, whaleMat, side * .042, .005, -.052, .062, .013, .026)
        fluke.rotation.y = side * -.35
      }
      for (let j = 0; j < 7; j++) {
        const drop = mesh(body, sphere, bellyMat, 0, 0, 0, .013)
        jets.push(drop)
      }
    } else if (kind === 'turtle') {
      mesh(body, sphere, bellyMat, 0, .016, 0, .079, .025, .10)
      mesh(body, sphere, shellMat, 0, .044, 0, .073, .048, .093)
      mesh(body, sphere, turtleMat, 0, .029, .112, .029, .025, .039)
      eyes(body, .021, .042, .13, .005)
      // Raised shell plates and four paddling flippers.
      for (let j = 0; j < 5; j++) {
        const a = j / 5 * Math.PI * 2
        mesh(body, sphere, turtleMat, Math.cos(a) * .036, .081, Math.sin(a) * .047, .024, .009, .028)
      }
      for (const side of [-1, 1]) for (const front of [-1, 1]) {
        const flipper = mesh(body, sphere, turtleMat, side * .075, .02, front * .055, .055, .01, .019)
        flipper.rotation.y = side * front * -.5
        flippers.push(flipper)
      }
      tail.position.set(0, .02, -.09)
      mesh(tail, sphere, turtleMat, 0, 0, -.02, .009, .009, .035)
    } else {
      for (let j = 0; j < 6; j++) {
        const fish = new THREE.Group()
        fish.position.set((j % 3 - 1) * .06, .013, -Math.floor(j / 3) * .095 + (j % 2) * .03)
        body.add(fish)
        mesh(fish, sphere, fishMats[index % 3], 0, 0, 0, .019, .02, .047)
        eyes(fish, .014, .01, .025, .003)
        const fishTail = mesh(fish, sphere, fishMats[index % 3], 0, 0, -.05, .007, .027, .019)
        flippers.push(fishTail)
      }
    }
    const wake = new THREE.Line(wakeGeo, wakeMat)
    wake.position.y = -.01
    group.add(wake)
    group.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = false })
    return { group, body, tail, flippers, jets, kind, route, reaction: { phase: index * 2.39996, panic: 0, x: 0, y: 0, vx: 0, vy: 0 }, initialized: false, speed: kind === 'turtle' ? .11 : kind === 'fish' ? .23 : .16 }
  })
  const normal = new THREE.Vector3(), forward = new THREE.Vector3(), right = new THREE.Vector3()
  const orientation = new THREE.Matrix4()
  const previousPosition = new THREE.Vector3()
  function animateOcean(time: number, delta = 0) {
    swimmers.forEach((swimmer, index) => {
      const current = advanceSwimReaction(swimmer.reaction, swimmer.route, reducedMotion ? 0 : swimmer.speed, delta, islands)
      const next = swimPosition(swimmer.route, swimmer.reaction.phase + .008)
      previousPosition.copy(swimmer.group.position)
      swimmer.group.position.copy(point(current.lat, current.lon, 3.02))
      normal.copy(swimmer.group.position).normalize()
      if (swimmer.initialized && previousPosition.distanceToSquared(swimmer.group.position) > 1e-10) forward.copy(swimmer.group.position).sub(previousPosition)
      else forward.copy(point(next.lat, next.lon, 3.02)).sub(swimmer.group.position)
      forward.addScaledVector(normal, -forward.dot(normal)).normalize()
      right.crossVectors(normal, forward).normalize()
      orientation.makeBasis(right, normal, forward)
      const heading = new THREE.Quaternion().setFromRotationMatrix(orientation)
      if (!swimmer.initialized) swimmer.group.quaternion.copy(heading)
      else swimmer.group.quaternion.slerp(heading, 1 - Math.exp(-delta * 12))
      swimmer.initialized = true
      const stroke = Math.sin(time * (swimmer.kind === 'turtle' ? 2 : 5) + index + swimmer.reaction.panic * 6)
      swimmer.body.position.y = Math.sin(time * 2 + index) * .003
      swimmer.tail.rotation.y = swimmer.kind === 'whale' ? 0 : stroke * .35
      swimmer.tail.rotation.x = swimmer.kind === 'whale' ? stroke * .22 : 0
      swimmer.flippers.forEach((flipper, i) => { flipper.rotation.z = stroke * .22 * (i % 2 ? -1 : 1) })
      const spray = ((time + index * 1.7) % 9) / 1.7
      swimmer.jets.forEach((jet, i) => {
        jet.visible = spray < 1
        jet.position.set(Math.sin(i * 2.4) * spray * .05, .1 + Math.sin(spray * Math.PI) * (.12 + i * .012), .06 + Math.cos(i * 2.4) * spray * .04)
        jet.scale.setScalar(.011 * (1 - Math.min(spray, 1) * .7))
      })
    })
  }
  animateOcean(0)

  let targets: { mat: THREE.MeshStandardMaterial; color: THREE.Color }[] = []
  function setSeason() {
    targets = []
    seasonal.forEach(palette => {
      const season = seasonFor(month, palette.south), style = seasons[season]
      targets.push({ mat: palette.grass, color: new THREE.Color(style.grass) })
      palette.leaves.forEach((mat, i) => targets.push({ mat, color: new THREE.Color(style.leaves[i]) }))
      palette.snowCaps.forEach(cap => { cap.visible = season === 'winter' })
    })
    if (reducedMotion) targets.forEach(({ mat, color }) => mat.color.copy(color))
    updateSeasonNotes()
  }
  setSeason()
  const abort = new AbortController()
  const on = (target: EventTarget, type: string, listener: EventListener) => target.addEventListener(type, listener, { signal: abort.signal })
  const activeTrees = new Set<(typeof trees)[number]>()
  const tiltMatrix = new THREE.Matrix4(), treeMatrix = new THREE.Matrix4(), partMatrix = new THREE.Matrix4()
  const tiltEuler = new THREE.Euler()
  function animateTrees(delta: number) {
    const dirty = new Set<THREE.InstancedMesh>()
    activeTrees.forEach(tree => {
      if (!advanceTreeSpring(tree, delta, reducedMotion)) {
        tree.x = tree.z = tree.vx = tree.vz = 0
        activeTrees.delete(tree)
      }
      tiltMatrix.makeRotationFromEuler(tiltEuler.set(tree.x, 0, tree.z))
      treeMatrix.multiplyMatrices(tree.base, tiltMatrix)
      tree.parts.forEach(part => {
        if (part.batch) {
          partMatrix.multiplyMatrices(treeMatrix, part.local)
          part.batch.setMatrixAt(part.index, partMatrix)
          dirty.add(part.batch)
        } else {
          part.mesh.matrixAutoUpdate = false
          part.mesh.matrix.multiplyMatrices(tiltMatrix, part.local)
          part.mesh.matrixWorldNeedsUpdate = true
        }
      })
    })
    dirty.forEach(batch => { batch.instanceMatrix.needsUpdate = true })
  }
  const rippleGeometry = geometry(new THREE.RingGeometry(.92, 1, 40))
  const ripples = Array.from({ length: 12 }, () => {
    const mat = new THREE.MeshBasicMaterial({ color: '#effbed', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
    materials.add(mat)
    const ring = new THREE.Mesh(rippleGeometry, mat)
    ring.visible = false
    world.add(ring)
    return { ring, mat, age: 1 }
  })
  let rippleIndex = 0, lastRipple = 0
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2()
  const hitSphere = new THREE.Sphere(new THREE.Vector3(), 3.10)
  const hit = new THREE.Vector3(), tangent = new THREE.Vector3(), local = new THREE.Vector3()
  const away = new THREE.Vector3(), east = new THREE.Vector3(), north = new THREE.Vector3()
  let previousPointer: { x: number; y: number; time: number; id: number } | undefined
  const touchPointers = new Set<number>()
  on(canvas, 'pointerdown', event => {
    const e = event as PointerEvent
    if (e.pointerType === 'touch') touchPointers.add(e.pointerId)
    previousPointer = { x: e.clientX, y: e.clientY, time: performance.now(), id: e.pointerId }
  })
  const forgetPointer = (event: Event) => { touchPointers.delete((event as PointerEvent).pointerId); previousPointer = undefined }
  on(canvas, 'pointerup', forgetPointer)
  on(canvas, 'pointercancel', forgetPointer)
  on(canvas, 'pointerleave', () => { previousPointer = undefined })
  on(window, 'blur', () => { previousPointer = undefined; touchPointers.clear() })
  on(canvas, 'pointermove', event => {
    const e = event as PointerEvent, now = performance.now(), previous = previousPointer
    previousPointer = { x: e.clientX, y: e.clientY, time: now, id: e.pointerId }
    if (!previous || previous.id !== e.pointerId || touchPointers.size > 1 || now - previous.time > 180 || document.hidden) return
    const dx = e.clientX - previous.x, dy = e.clientY - previous.y, travel = Math.hypot(dx, dy)
    if (travel < 1) return
    const rect = canvas.getBoundingClientRect()
    camera.updateMatrixWorld()
    const steps = Math.min(6, Math.max(1, Math.ceil(travel / 16)))
    const impulse = Math.min(3, travel * .055) / steps * (reducedMotion ? .35 : 1)
    for (let step = 1; step <= steps; step++) {
      pointer.set(((previous.x + dx * step / steps - rect.left) / rect.width) * 2 - 1, -((previous.y + dy * step / steps - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      if (!raycaster.ray.intersectSphere(hitSphere, hit)) continue
      normal.copy(hit).normalize()
      tangent.set(dx, -dy, 0).applyQuaternion(camera.quaternion)
      tangent.addScaledVector(normal, -tangent.dot(normal)).normalize()
      trees.forEach(tree => {
        const distance = tree.group.position.distanceTo(hit)
        if (distance > .68) return
        local.copy(tangent).applyQuaternion(tree.inverse)
        const force = impulse * Math.pow(1 - distance / .68, 1.2) * 5
        tree.vx = THREE.MathUtils.clamp(tree.vx + local.z * force, -8, 8)
        tree.vz = THREE.MathUtils.clamp(tree.vz - local.x * force, -8, 8)
        activeTrees.add(tree)
      })
      swimmers.forEach(swimmer => {
        const distance = swimmer.group.position.distanceTo(hit)
        if (distance > .85) return
        const p = swimmer.group.position
        normal.copy(p).normalize()
        away.copy(p).sub(hit).addScaledVector(tangent, .10)
        away.addScaledVector(normal, -away.dot(normal))
        if (away.lengthSq() < .00001) away.copy(tangent)
        away.normalize()
        east.set(normal.z, 0, -normal.x).normalize()
        north.crossVectors(normal, east).normalize()
        const force = impulse * (1 - distance / .85) * .42
        const state = swimmer.reaction
        state.panic = Math.min(1, state.panic + impulse * 2)
        state.vx = THREE.MathUtils.clamp(state.vx + away.dot(east) * force, -.5, .5)
        state.vy = THREE.MathUtils.clamp(state.vy + away.dot(north) * force, -.5, .5)
      })
      if (now - lastRipple > 60) {
        const ripple = ripples[rippleIndex++ % ripples.length]
        normal.copy(hit).normalize()
        ripple.ring.position.copy(normal).multiplyScalar(3.13)
        ripple.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
        ripple.age = 0
        ripple.ring.visible = true
        lastRipple = now
      }
    }
  })
  document.querySelectorAll<HTMLButtonElement>('.month-button').forEach(button => on(button, 'click', () => { month = Number(button.dataset.month); setSeason() }))
  const autoButton = document.querySelector<HTMLButtonElement>('#auto-rotate')!
  const setRotation = (value: boolean) => {
    controls.autoRotate = value
    autoButton.setAttribute('aria-pressed', String(value))
  }
  on(autoButton, 'click', () => setRotation(!controls.autoRotate))
  // Manual exploration stays still after the user lets go.
  controls.addEventListener('start', () => setRotation(false))
  on(document.querySelector('#cloud-toggle')!, 'click', event => {
    clouds.visible = !clouds.visible
    ;(event.currentTarget as HTMLButtonElement).setAttribute('aria-pressed', String(clouds.visible))
  })
  on(document.querySelector('#equator-toggle')!, 'click', event => {
    equator.visible = !equator.visible
    ;(event.currentTarget as HTMLButtonElement).setAttribute('aria-pressed', String(equator.visible))
  })
  const zoom = (factor: number) => {
    camera.position.multiplyScalar(THREE.MathUtils.clamp(camera.position.length() * factor, controls.minDistance, controls.maxDistance) / camera.position.length())
    controls.update()
  }
  on(document.querySelector('#zoom-in')!, 'click', () => zoom(.87))
  on(document.querySelector('#zoom-out')!, 'click', () => zoom(1.15))
  const reset = () => { controls.reset(); camera.position.copy(home); controls.update(); setRotation(false) }
  on(document.querySelector('#reset-view')!, 'click', reset)
  on(canvas, 'keydown', event => {
    const key = (event as KeyboardEvent).key
    if (['+', '=', '-', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(key)) event.preventDefault()
    if (key === '+' || key === '=') zoom(.9)
    if (key === '-') zoom(1.1)
    if (key === 'Home') reset()
    if (key.startsWith('Arrow')) {
      setRotation(false)
      const spherical = new THREE.Spherical().setFromVector3(camera.position)
      if (key === 'ArrowLeft') spherical.theta -= .12
      if (key === 'ArrowRight') spherical.theta += .12
      if (key === 'ArrowUp') spherical.phi -= .12
      if (key === 'ArrowDown') spherical.phi += .12
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, controls.minPolarAngle, controls.maxPolarAngle)
      camera.position.setFromSpherical(spherical)
      controls.update()
    }
  })
  function resize() {
    const width = stage.clientWidth, height = stage.clientHeight
    camera.aspect = width / height
    // Preserve the whole globe when the viewport becomes tall and narrow.
    camera.fov = width < 650 ? 35 : 37
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(stage)
  resize()
  const residents = setupResidents({ world, camera, controls, stage, reducedMotion, point, homeIsland: islands[0], islands: islands.filter(island => island.biome === 'woodland' || island.biome === 'meadow'), allIslands: islands })
  let disposed = false, previous = performance.now(), oceanTime = 0
  const zoomOutput = document.querySelector<HTMLOutputElement>('#zoom-level')!
  function animate(now: number) {
    if (disposed || document.hidden) return
    const delta = Math.min((now - previous) / 1000, .05)
    previous = now
    targets.forEach(({ mat, color }) => mat.color.lerp(color, 1 - Math.exp(-delta * 5)))
    controls.update(delta)
    animateTrees(delta)
    ripples.forEach(ripple => {
      ripple.age += delta
      ripple.ring.visible = ripple.age < .65
      if (ripple.ring.visible) {
        ripple.ring.scale.setScalar(.035 + ripple.age * (reducedMotion ? .15 : .55))
        ripple.mat.opacity = Math.max(0, .35 * (1 - ripple.age / .65))
      }
    })
    if (!reducedMotion) {
      oceanTime += delta
      clouds.rotation.y += delta * .009
      boat.position.copy(point(-.20 + Math.sin(now * .0006) * .002, -.36, 3.035))
    }
    animateOcean(oceanTime, delta)
    residents.update(delta)
    deepSea.update(delta)
    const distance = camera.position.length()
    zoomOutput.value = `${Math.round(home.length() / distance * 100)}%`
    document.querySelector<HTMLButtonElement>('#zoom-in')!.disabled = distance <= controls.minDistance + .02
    document.querySelector<HTMLButtonElement>('#zoom-out')!.disabled = distance >= controls.maxDistance - .02
    renderer.render(scene, camera)
  }
  renderer.setAnimationLoop(animate)
  on(document, 'visibilitychange', () => { previous = performance.now() })
  function dispose() {
    if (disposed) return
    disposed = true
    abort.abort()
    observer.disconnect()
    controls.dispose()
    residents.dispose()
    deepSea.dispose()
    renderer.setAnimationLoop(null)
    instancedMeshes.forEach(value => value.dispose())
    geometries.forEach(value => value.dispose())
    materials.forEach(value => value.dispose())
    renderer.dispose()
  }
  on(window, 'interactive:dispose', dispose)
  on(window, 'pagehide', event => { if (!(event as PageTransitionEvent).persisted) dispose() })
  on(canvas, 'webglcontextlost', event => {
    event.preventDefault()
    document.querySelector<HTMLElement>('.render-error')!.hidden = false
    dispose()
  })
}
