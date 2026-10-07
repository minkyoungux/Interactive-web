import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import './claw.css'

type Phase = 'idle' | 'lowering' | 'closing' | 'rising' | 'carrying' | 'releasing' | 'returning'
type BattleStyle = 'zigzag' | 'magic' | 'flyer' | 'bruiser'
type Toy = {
  group: THREE.Group
  body: CANNON.Body
  name: string
  color: string
  scale: number
  won: boolean
  held: boolean
  event: boolean
  escapeCooldown: number
  skittishness: number
  escapeTime: number
  escapeAngle: number
  escapeBursts: number
  panicFace: boolean
  battleStyle: BattleStyle
  attackCooldown: number
}

const app = document.querySelector<HTMLDivElement>('#claw-app')!
app.innerHTML = `
  <main class="arcade-shell">
    <header class="arcade-header">
      <a class="back-link" href="${import.meta.env.BASE_URL}">← EXIT</a>
      <div class="brand-lockup"><span class="brand-star">✦</span><div><span>LUCKY</span><strong>CLAW</strong></div></div>
      <button class="prize-count" id="prizes-button" type="button" aria-haspopup="dialog">
        <span>PRIZES</span><strong id="prize-count">00</strong><i>▦</i>
      </button>
    </header>

    <section class="machine-layout" aria-label="3차원 인형뽑기 게임">
      <div class="scene-wrap" id="scene-wrap">
        <div class="scene-glow"></div>
        <div class="drag-guide" id="drag-guide"><span>↔</span> 드래그해서 기계를 돌려보세요</div>
        <div class="status-card" id="status-card" aria-live="polite">
          <span class="status-light"></span><div><small>CLAW STATUS</small><strong id="status-text">방향키로 위치를 정하세요</strong></div>
        </div>
        <div class="lock-curtain" id="lock-curtain" aria-hidden="true"><span></span><span></span><span></span><strong>AUTO PLAY</strong></div>
        <div class="win-showcase" id="win-showcase" hidden>
          <div class="win-rays"></div><div class="magic-circle"><i></i><i></i><i></i></div><div class="showcase-canvas" id="win-canvas"></div>
          <p id="win-tier">MAGICAL GET!</p><strong id="win-name">인형</strong>
        </div>
        <div class="celebration-layer" id="celebration-layer" aria-hidden="true"></div>
      </div>

      <aside class="control-deck">
        <div class="control-copy"><p>HOW TO PLAY</p><h1>잡고 싶은 인형<br>위로 집게를 옮겨요.</h1><p class="subcopy">스페이스 바를 누르면 모든 조작이 잠기고 집게가 자동으로 움직입니다.</p></div>
        <div class="position-readout"><span>CLAW POSITION</span><strong id="position-readout">X 30 · Z 25</strong></div>
        <div class="arrow-controls" aria-label="집게 방향 조작">
          <button class="arrow-key arrow-up" data-key="ArrowUp" type="button" aria-label="집게를 뒤로 이동">↑<small>뒤</small></button>
          <button class="arrow-key arrow-left" data-key="ArrowLeft" type="button" aria-label="집게를 왼쪽으로 이동">←<small>좌</small></button>
          <button class="arrow-key arrow-down" data-key="ArrowDown" type="button" aria-label="집게를 앞으로 이동">↓<small>앞</small></button>
          <button class="arrow-key arrow-right" data-key="ArrowRight" type="button" aria-label="집게를 오른쪽으로 이동">→<small>우</small></button>
        </div>
        <button class="drop-button" id="drop-button" type="button"><span class="drop-ring"></span><span class="drop-label"><strong>DROP</strong><small>SPACE BAR</small></span></button>
        <div class="control-note"><span class="legend-dot legend-dot--ready"></span> 이동 가능 <span class="legend-dot legend-dot--locked"></span> 자동 진행 중</div>
      </aside>
    </section>
    <footer class="arcade-footer"><span>ARCADE COLLECTION 03</span><span>PHYSICS 3D SIMULATION</span><span>GOOD LUCK!</span></footer>
  </main>

  <section class="prize-gallery" id="prize-gallery" role="dialog" aria-modal="true" aria-labelledby="gallery-title" hidden>
    <div class="gallery-panel">
      <div class="gallery-head"><div><p>MY COLLECTION</p><h2 id="gallery-title">뽑은 인형들</h2></div><button id="gallery-close" type="button" aria-label="컬렉션 닫기">×</button></div>
      <div class="gallery-body">
        <div class="gallery-viewer" id="gallery-viewer"><p id="gallery-empty">아직 뽑은 인형이 없어요.<br>첫 번째 인형에 도전해 보세요!</p></div>
        <div class="gallery-list" id="gallery-list"></div>
      </div>
      <p class="gallery-tip">선택한 인형은 자동으로 회전해요 · 드래그해서 직접 돌려볼 수도 있어요</p>
    </div>
  </section>
`

const sceneWrap = document.querySelector<HTMLDivElement>('#scene-wrap')!
const statusCard = document.querySelector<HTMLDivElement>('#status-card')!
const statusText = document.querySelector<HTMLElement>('#status-text')!
const lockCurtain = document.querySelector<HTMLDivElement>('#lock-curtain')!
const dropButton = document.querySelector<HTMLButtonElement>('#drop-button')!
const prizeCount = document.querySelector<HTMLElement>('#prize-count')!
const positionReadout = document.querySelector<HTMLElement>('#position-readout')!
const prizesButton = document.querySelector<HTMLButtonElement>('#prizes-button')!
const gallery = document.querySelector<HTMLElement>('#prize-gallery')!
const galleryClose = document.querySelector<HTMLButtonElement>('#gallery-close')!
const galleryList = document.querySelector<HTMLDivElement>('#gallery-list')!
const galleryViewer = document.querySelector<HTMLDivElement>('#gallery-viewer')!
const galleryEmpty = document.querySelector<HTMLParagraphElement>('#gallery-empty')!
const winShowcase = document.querySelector<HTMLDivElement>('#win-showcase')!
const winCanvas = document.querySelector<HTMLDivElement>('#win-canvas')!
const winName = document.querySelector<HTMLElement>('#win-name')!
const winTier = document.querySelector<HTMLElement>('#win-tier')!
const celebrationLayer = document.querySelector<HTMLDivElement>('#celebration-layer')!

const scene = new THREE.Scene()
scene.background = new THREE.Color('#171326')
scene.fog = new THREE.FogExp2('#171326', 0.023)
const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100)
camera.position.set(0, 5.9, 16.8)
camera.lookAt(0, 2.75, 0)

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.14
sceneWrap.prepend(renderer.domElement)

scene.add(new THREE.HemisphereLight('#fff4e9', '#271438', 2.25))
const keyLight = new THREE.DirectionalLight('#fff1d7', 4.5)
keyLight.position.set(5, 11, 9)
keyLight.castShadow = true
keyLight.shadow.mapSize.set(2048, 2048)
keyLight.shadow.camera.left = -8
keyLight.shadow.camera.right = 8
keyLight.shadow.camera.top = 10
keyLight.shadow.camera.bottom = -5
scene.add(keyLight)
const pinkLight = new THREE.PointLight('#ff4f9a', 18, 18, 2)
pinkLight.position.set(-5, 5, 5)
scene.add(pinkLight)
const cyanLight = new THREE.PointLight('#5de5ff', 14, 18, 2)
cyanLight.position.set(5, 6, -3)
scene.add(cyanLight)

const roomFloor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#0d0a17', roughness: 0.78, metalness: 0.15 }))
roomFloor.rotation.x = -Math.PI / 2
roomFloor.position.y = -1.2
roomFloor.receiveShadow = true
scene.add(roomFloor)
const grid = new THREE.GridHelper(28, 28, '#5a315a', '#2a2038')
grid.position.y = -1.18
scene.add(grid)

const machine = new THREE.Group()
scene.add(machine)
const redMetal = new THREE.MeshPhysicalMaterial({ color: '#e73868', metalness: 0.72, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.14 })
const darkMetal = new THREE.MeshPhysicalMaterial({ color: '#25192e', metalness: 0.74, roughness: 0.26, clearcoat: 0.65 })
const paleMetal = new THREE.MeshPhysicalMaterial({ color: '#f1d7d4', metalness: 0.54, roughness: 0.24, clearcoat: 0.8 })
const glass = new THREE.MeshPhysicalMaterial({ color: '#bdefff', transparent: true, opacity: 0.1, roughness: 0.04, transmission: 0.76, thickness: 0.08, side: THREE.DoubleSide, depthWrite: false })

function box(parent: THREE.Object3D, size: [number, number, number], position: [number, number, number], material: THREE.Material, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material)
  mesh.position.set(...position)
  mesh.castShadow = shadow
  mesh.receiveShadow = true
  parent.add(mesh)
  return mesh
}

function textTexture(text: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#b91e50'; ctx.fillRect(0, 0, 1024, 256)
  ctx.strokeStyle = '#ff88af'; ctx.lineWidth = 18; ctx.strokeRect(9, 9, 1006, 238)
  const gradient = ctx.createLinearGradient(0, 0, 1024, 0)
  gradient.addColorStop(0, '#fff0a3'); gradient.addColorStop(.5, '#fff'); gradient.addColorStop(1, '#bff6ff')
  ctx.fillStyle = gradient; ctx.font = '900 132px Arial Rounded MT Bold, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.shadowColor = '#5c0628'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 8; ctx.fillText(text, 512, 132)
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Front-facing cabinet: upper glass box + substantial lower cabinet.
box(machine, [7.8, 2.15, 6.7], [0, -0.58, 0], darkMetal)
box(machine, [7.5, .18, 6.35], [0, .55, 0], paleMetal)
box(machine, [7.8, 1.12, 6.7], [0, 7.05, 0], redMetal)
for (const x of [-3.65, 3.65]) for (const z of [-3.1, 3.1]) box(machine, [.24, 5.95, .24], [x, 3.55, z], redMetal)
box(machine, [7.25, .2, .2], [0, 6.48, 3.1], paleMetal)
box(machine, [7.25, .2, .2], [0, 6.48, -3.1], paleMetal)
box(machine, [.2, .2, 6], [-3.65, 6.48, 0], paleMetal)
box(machine, [.2, .2, 6], [3.65, 6.48, 0], paleMetal)
const frontGlass = box(machine, [7.06, 5.68, .025], [0, 3.57, 3.09], glass, false); frontGlass.renderOrder = 8
box(machine, [7.06, 5.68, .025], [0, 3.57, -3.09], glass, false)
box(machine, [.025, 5.68, 5.92], [-3.64, 3.57, 0], glass, false)
box(machine, [.025, 5.68, 5.92], [3.64, 3.57, 0], glass, false)
const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 1.42), new THREE.MeshBasicMaterial({ map: textTexture('LUCKY CLAW'), toneMapped: false }))
sign.position.set(0, 7.12, 3.36); machine.add(sign)

// Central chute through the lower cabinet, aligned with the front collection opening.
const chute = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 1.18), new THREE.MeshStandardMaterial({ color: '#050409', roughness: .92 }))
chute.rotation.x = -Math.PI / 2; chute.position.set(0, .57, 1.72); machine.add(chute)
box(machine, [2.25, 1.12, .12], [0, -.55, 3.39], redMetal)
const prizeDoor = box(machine, [1.62, .67, .08], [0, -.53, 3.47], new THREE.MeshPhysicalMaterial({ color: '#07060b', roughness: .38, metalness: .2 }))
prizeDoor.renderOrder = 10
for (const x of [-1.22, 1.22]) box(machine, [.07, .86, .09], [x, -.53, 3.46], paleMetal)

// Cabinet console details.
const consoleBox = box(machine, [2.45, .5, .98], [2.25, .12, 3.48], redMetal); consoleBox.rotation.x = -.12
const joystick = new THREE.Group()
const joyStem = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, .52, 18), darkMetal); joyStem.position.y = .24
const joyTop = new THREE.Mesh(new THREE.SphereGeometry(.18, 24, 18), new THREE.MeshPhysicalMaterial({ color: '#ffe05d', roughness: .16, clearcoat: 1 })); joyTop.position.y = .52
joystick.add(joyStem, joyTop); joystick.position.set(1.9, .48, 3.48); machine.add(joystick)
const cabinetButton = new THREE.Mesh(new THREE.CylinderGeometry(.22, .25, .13, 24), new THREE.MeshPhysicalMaterial({ color: '#62e6ff', emissive: '#147b99', emissiveIntensity: 1.5, clearcoat: 1 }))
cabinetButton.rotation.x = Math.PI / 2 - .12; cabinetButton.position.set(2.62, .41, 3.69); machine.add(cabinetButton)

// Animated arcade bulbs, neon rails and sweeping interior light.
const arcadeBulbs: THREE.Mesh[] = []
function addBulb(x: number, y: number, z: number, index: number) {
  const color = new THREE.Color().setHSL((index * .073) % 1, .92, .65)
  const material = new THREE.MeshBasicMaterial({ color, toneMapped: false })
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.075, 12, 10), material)
  bulb.position.set(x, y, z); machine.add(bulb); arcadeBulbs.push(bulb)
}
let bulbIndex = 0
for (let x = -3.42; x <= 3.43; x += .38) { addBulb(x, 6.48, 3.23, bulbIndex++); addBulb(x, .62, 3.23, bulbIndex++) }
for (let y = .9; y <= 6.25; y += .38) { addBulb(-3.65, y, 3.23, bulbIndex++); addBulb(3.65, y, 3.23, bulbIndex++) }
const neonPink = new THREE.MeshBasicMaterial({ color: '#ff4d9b', toneMapped: false })
const neonCyan = new THREE.MeshBasicMaterial({ color: '#5deaff', toneMapped: false })
box(machine, [.055, 5.45, .055], [-3.48, 3.55, 3.25], neonPink, false)
box(machine, [.055, 5.45, .055], [3.48, 3.55, 3.25], neonCyan, false)
box(machine, [6.82, .055, .055], [0, 6.3, 3.25], neonCyan, false)
box(machine, [6.82, .055, .055], [0, .76, 3.25], neonPink, false)
const sweepLights: THREE.SpotLight[] = []
for (const [color, x] of [['#ff55b8', -2.2], ['#59dcff', 0], ['#ffe56a', 2.2]] as const) {
  const light = new THREE.SpotLight(color, 34, 11, .4, .75, 1.7)
  light.position.set(x, 6.35, .4); light.target.position.set(-x * .3, .6, 0); machine.add(light, light.target); sweepLights.push(light)
}

// Physics world keeps every plush above the floor and naturally piled.
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -8.8, 0) })
world.allowSleep = true;
(world.solver as CANNON.GSSolver).iterations = 14
const plushPhysics = new CANNON.Material('plush')
const wallPhysics = new CANNON.Material('cabinet')
world.addContactMaterial(new CANNON.ContactMaterial(plushPhysics, plushPhysics, { friction: .78, restitution: .03 }))
world.addContactMaterial(new CANNON.ContactMaterial(plushPhysics, wallPhysics, { friction: .68, restitution: .06 }))

function staticPlane(position: CANNON.Vec3, rotation: CANNON.Quaternion) {
  const body = new CANNON.Body({ mass: 0, material: wallPhysics, shape: new CANNON.Plane() })
  body.position.copy(position); body.quaternion.copy(rotation); world.addBody(body)
}
const qFloor = new CANNON.Quaternion(); qFloor.setFromEuler(-Math.PI / 2, 0, 0)
const qLeft = new CANNON.Quaternion(); qLeft.setFromEuler(0, Math.PI / 2, 0)
const qRight = new CANNON.Quaternion(); qRight.setFromEuler(0, -Math.PI / 2, 0)
const qFront = new CANNON.Quaternion(); qFront.setFromEuler(0, Math.PI, 0)
staticPlane(new CANNON.Vec3(0, .58, 0), qFloor)
staticPlane(new CANNON.Vec3(-3.3, 0, 0), qLeft)
staticPlane(new CANNON.Vec3(3.3, 0, 0), qRight)
staticPlane(new CANNON.Vec3(0, 0, -2.72), new CANNON.Quaternion())
staticPlane(new CANNON.Vec3(0, 0, 2.66), qFront)

const eyeMaterial = new THREE.MeshPhysicalMaterial({ color: '#09070d', roughness: .12, clearcoat: 1 })
const white = new THREE.MeshStandardMaterial({ color: '#fff7ee', roughness: .88 })
function plush(color: string) { return new THREE.MeshPhysicalMaterial({ color, roughness: .94, sheen: 1, sheenColor: new THREE.Color(color), sheenRoughness: .74 }) }
function ellipsoid(group: THREE.Group, p: [number, number, number], s: [number, number, number], material: THREE.Material, segments = 24) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(14, Math.floor(segments * .7))), material)
  mesh.position.set(...p); mesh.scale.set(...s); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh
}
function face(group: THREE.Group, y: number, z: number, gap = .2) {
  const leftEye = ellipsoid(group, [-gap, y, z], [.085, .105, .045], eyeMaterial, 16)
  const rightEye = ellipsoid(group, [gap, y, z], [.085, .105, .045], eyeMaterial, 16)
  leftEye.name = rightEye.name = 'normal-eye'
  addPanicEyes(group, y, z + .018, gap)
  ellipsoid(group, [0, y - .18, z + .03], [.065, .05, .035], plush('#df7b91'), 14)
}
function addPanicEyes(group: THREE.Group, y: number, z: number, gap = .2) {
  const panicEyes = new THREE.Group()
  panicEyes.name = 'panic-eyes'
  panicEyes.visible = false
  const strokeGeometry = new THREE.BoxGeometry(.18, .052, .055)
  const addStroke = (x: number, offsetY: number, angle: number) => {
    const stroke = new THREE.Mesh(strokeGeometry, eyeMaterial)
    stroke.position.set(x, y + offsetY, z)
    stroke.rotation.z = angle
    stroke.castShadow = true
    panicEyes.add(stroke)
  }
  // Left eye is > and right eye is <, creating an unmistakable >< panic face.
  addStroke(-gap - .035, .052, -.62)
  addStroke(-gap - .035, -.052, .62)
  addStroke(gap + .035, .052, .62)
  addStroke(gap + .035, -.052, -.62)
  group.add(panicEyes)
}
function bow(group: THREE.Group, color: string, y: number, z: number) {
  const mat = plush(color)
  ellipsoid(group, [-.17, y, z], [.2, .14, .08], mat, 18)
  ellipsoid(group, [.17, y, z], [.2, .14, .08], mat, 18)
  ellipsoid(group, [0, y, z + .03], [.09, .09, .07], white, 16)
}
function gem(group: THREE.Group, color: string, y: number, z: number) {
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(.13, 0), new THREE.MeshPhysicalMaterial({ color, emissive: color, emissiveIntensity: .18, roughness: .15, clearcoat: 1 }))
  mesh.position.set(0, y, z); mesh.scale.y = 1.25; group.add(mesh)
}
function bear(color: string, accent: string) {
  const g = new THREE.Group(), fur = plush(color), muzzle = plush(accent)
  ellipsoid(g, [0, .63, 0], [.67, .78, .54], fur); ellipsoid(g, [0, 1.44, .02], [.72, .65, .59], fur)
  ellipsoid(g, [-.52, 1.88, 0], [.28, .28, .23], fur); ellipsoid(g, [.52, 1.88, 0], [.28, .28, .23], fur)
  ellipsoid(g, [0, 1.27, .55], [.29, .21, .16], muzzle); face(g, 1.52, .59)
  ellipsoid(g, [-.62, .72, 0], [.25, .5, .24], fur); ellipsoid(g, [.62, .72, 0], [.25, .5, .24], fur)
  ellipsoid(g, [-.32, .02, .07], [.36, .3, .42], fur); ellipsoid(g, [.32, .02, .07], [.36, .3, .42], fur)
  return g
}
function bunny(color: string, accent: string) {
  const g = new THREE.Group(), fur = plush(color), inner = plush(accent)
  ellipsoid(g, [0, .61, 0], [.61, .77, .5], fur); ellipsoid(g, [0, 1.42, .02], [.68, .63, .56], fur)
  ellipsoid(g, [-.28, 2.08, -.02], [.27, .78, .22], fur); ellipsoid(g, [.28, 2.08, -.02], [.27, .78, .22], fur)
  ellipsoid(g, [-.28, 2.11, .19], [.12, .54, .055], inner); ellipsoid(g, [.28, 2.11, .19], [.12, .54, .055], inner)
  face(g, 1.5, .56); ellipsoid(g, [-.57, .7, 0], [.23, .48, .22], fur); ellipsoid(g, [.57, .7, 0], [.23, .48, .22], fur)
  ellipsoid(g, [-.3, .03, .07], [.34, .29, .4], fur); ellipsoid(g, [.3, .03, .07], [.34, .29, .4], fur)
  return g
}
function cat(color: string, accent: string) {
  const g = new THREE.Group(), fur = plush(color)
  ellipsoid(g, [0, .62, 0], [.64, .78, .52], fur); ellipsoid(g, [0, 1.43, .02], [.72, .65, .58], fur)
  const ear = new THREE.ConeGeometry(.3, .68, 4)
  for (const x of [-.44, .44]) { const m = new THREE.Mesh(ear, fur); m.position.set(x, 1.93, -.01); m.rotation.y = Math.PI / 4; m.castShadow = true; g.add(m) }
  face(g, 1.5, .59); ellipsoid(g, [-.58, .7, 0], [.23, .5, .22], fur); ellipsoid(g, [.58, .7, 0], [.23, .5, .22], fur)
  ellipsoid(g, [-.31, .02, .06], [.35, .3, .41], fur); ellipsoid(g, [.31, .02, .06], [.35, .3, .41], fur); bow(g, accent, .82, .52)
  return g
}
function duck(color: string, accent: string) {
  const g = new THREE.Group(), fur = plush(color), beak = plush(accent)
  ellipsoid(g, [0, .62, 0], [.72, .8, .58], fur); ellipsoid(g, [0, 1.45, .02], [.65, .61, .56], fur); face(g, 1.55, .56, .19)
  ellipsoid(g, [0, 1.3, .62], [.31, .12, .17], beak); ellipsoid(g, [-.64, .7, 0], [.24, .52, .2], fur); ellipsoid(g, [.64, .7, 0], [.24, .52, .2], fur)
  ellipsoid(g, [-.32, .02, .1], [.36, .18, .42], beak); ellipsoid(g, [.32, .02, .1], [.36, .18, .42], beak)
  return g
}
function fox(color: string, accent: string) {
  const g = cat(color, accent), tailMat = plush(color)
  ellipsoid(g, [.73, .52, -.18], [.28, .72, .28], tailMat); gem(g, accent, 1.92, .5); return g
}
function moonSeal(color: string, accent: string) {
  const g = new THREE.Group(), fur = plush(color)
  ellipsoid(g, [0, .65, 0], [.74, .83, .6], fur); ellipsoid(g, [0, 1.42, .03], [.72, .62, .58], fur)
  ellipsoid(g, [-.48, 1.88, 0], [.2, .29, .2], fur); ellipsoid(g, [.48, 1.88, 0], [.2, .29, .2], fur)
  face(g, 1.52, .59); ellipsoid(g, [-.54, .55, .24], [.26, .44, .22], fur); ellipsoid(g, [.54, .55, .24], [.26, .44, .22], fur)
  gem(g, accent, 1.9, .5); return g
}

function mageDoll(color: string, accent: string) {
  const g = new THREE.Group(), cloth = plush(color), hair = plush(accent), skin = plush('#ffd8c5')
  ellipsoid(g, [0, 1.48, -.05], [.62, .68, .54], hair)
  ellipsoid(g, [0, 1.5, .18], [.51, .54, .48], skin)
  const dress = new THREE.Mesh(new THREE.ConeGeometry(.7, 1.28, 24), cloth); dress.position.set(0, .55, 0); dress.castShadow = true; g.add(dress)
  ellipsoid(g, [-.54, .72, .02], [.2, .52, .2], cloth); ellipsoid(g, [.54, .72, .02], [.2, .52, .2], cloth)
  ellipsoid(g, [-.31, -.02, .02], [.26, .33, .3], hair); ellipsoid(g, [.31, -.02, .02], [.26, .33, .3], hair)
  face(g, 1.55, .67, .17); gem(g, '#ffe76a', 1.96, .61); bow(g, accent, .85, .64); return g
}
function starSprite(color: string, accent: string) {
  const g = new THREE.Group(), shape = new THREE.Shape()
  for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .55 : 1; const x = Math.cos(a) * r, y = Math.sin(a) * r + 1; i ? shape.lineTo(x, y) : shape.moveTo(x, y) }
  shape.closePath()
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: .38, bevelEnabled: true, bevelSize: .12, bevelThickness: .12, bevelSegments: 3 }), plush(color)); body.position.z = -.2; body.castShadow = true; g.add(body)
  face(g, 1.05, .36, .23); ellipsoid(g, [-.76, .78, .1], [.28, .2, .2], plush(accent)); ellipsoid(g, [.76, .78, .1], [.28, .2, .2], plush(accent)); return g
}
function cloudSprite(color: string, accent: string) {
  const g = new THREE.Group(), cloud = plush(color)
  ellipsoid(g, [0, .95, 0], [.78, .55, .48], cloud); ellipsoid(g, [-.55, 1.06, 0], [.5, .46, .42], cloud); ellipsoid(g, [.55, 1.06, 0], [.5, .46, .42], cloud); ellipsoid(g, [0, 1.4, -.02], [.55, .5, .43], cloud)
  face(g, 1.1, .49, .22); bow(g, accent, .62, .46); return g
}
function slimeSprite(color: string, accent: string) {
  const g = new THREE.Group(), jelly = plush(color)
  ellipsoid(g, [0, .78, 0], [.82, .76, .63], jelly); ellipsoid(g, [0, 1.28, -.02], [.61, .55, .52], jelly); face(g, 1.12, .6, .22)
  for (const x of [-.26, 0, .26]) { const crown = new THREE.Mesh(new THREE.ConeGeometry(.17, .48, 5), plush(accent)); crown.position.set(x, 1.82 - Math.abs(x) * .3, 0); crown.castShadow = true; g.add(crown) }
  return g
}
function robotSprite(color: string, accent: string) {
  const g = new THREE.Group(), shell = plush(color), light = new THREE.MeshPhysicalMaterial({ color: accent, emissive: accent, emissiveIntensity: .25, roughness: .2, clearcoat: 1 })
  box(g, [1.18, 1.12, .85], [0, .62, 0], shell); box(g, [1.28, .95, .9], [0, 1.58, 0], shell)
  ellipsoid(g, [-.28, 1.65, .49], [.1, .12, .06], light, 16); ellipsoid(g, [.28, 1.65, .49], [.1, .12, .06], light, 16)
  ellipsoid(g, [-.68, .7, 0], [.25, .48, .23], shell); ellipsoid(g, [.68, .7, 0], [.25, .48, .23], shell); ellipsoid(g, [-.32, -.02, 0], [.32, .28, .36], shell); ellipsoid(g, [.32, -.02, 0], [.32, .28, .36], shell)
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .45, 12), shell); antenna.position.y = 2.25; g.add(antenna); ellipsoid(g, [0, 2.5, 0], [.13, .13, .13], light, 14); return g
}
function potionSprite(color: string, accent: string) {
  const g = new THREE.Group(), liquid = plush(color), cork = plush('#d89b66')
  ellipsoid(g, [0, .72, 0], [.72, .77, .58], liquid); ellipsoid(g, [0, 1.3, 0], [.5, .53, .45], liquid)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.31, .4, .62, 24), liquid); neck.position.y = 1.66; neck.castShadow = true; g.add(neck)
  const stopper = new THREE.Mesh(new THREE.CylinderGeometry(.34, .3, .28, 20), cork); stopper.position.y = 2.04; stopper.castShadow = true; g.add(stopper)
  face(g, .95, .57, .2); gem(g, accent, 1.42, .47); return g
}
function octopusSprite(color: string, accent: string) {
  const g = new THREE.Group(), fur = plush(color)
  ellipsoid(g, [0, 1.18, 0], [.75, .78, .62], fur); ellipsoid(g, [0, .72, 0], [.72, .52, .58], fur); face(g, 1.25, .61, .22)
  for (let i = 0; i < 5; i += 1) { const a = -1.1 + i * .55; ellipsoid(g, [Math.sin(a) * .64, .18, Math.cos(a) * .22], [.23, .52, .22], fur) }
  bow(g, accent, 1.78, .36); return g
}

function eventBoy() {
  const g = new THREE.Group(), skin = plush('#ffd0b2'), hair = plush('#252231'), shirt = plush('#ff566e'), shorts = plush('#55b6c7')
  ellipsoid(g, [0, 1.55, 0], [.88, .72, .68], skin)
  ellipsoid(g, [0, 1.98, -.13], [.86, .38, .6], hair)
  ellipsoid(g, [-.82, 1.55, 0], [.17, .24, .16], skin); ellipsoid(g, [.82, 1.55, 0], [.17, .24, .16], skin)
  ellipsoid(g, [0, .68, 0], [.68, .72, .54], shirt)
  box(g, [1.14, .36, .83], [0, .1, 0], shorts)
  ellipsoid(g, [-.69, .75, 0], [.24, .55, .23], skin); ellipsoid(g, [.69, .75, 0], [.24, .55, .23], skin)
  ellipsoid(g, [-.35, -.21, .04], [.35, .43, .42], skin); ellipsoid(g, [.35, -.21, .04], [.35, .43, .42], skin)
  const leftEye = ellipsoid(g, [-.27, 1.58, .66], [.09, .11, .05], eyeMaterial, 16)
  const rightEye = ellipsoid(g, [.27, 1.58, .66], [.09, .11, .05], eyeMaterial, 16)
  leftEye.name = rightEye.name = 'normal-eye'; addPanicEyes(g, 1.58, .68, .27)
  const browMat = plush('#302838')
  const leftBrow = box(g, [.3, .075, .07], [-.27, 1.82, .65], browMat, false); leftBrow.rotation.z = -.14
  const rightBrow = box(g, [.3, .075, .07], [.27, 1.82, .65], browMat, false); rightBrow.rotation.z = .14
  ellipsoid(g, [-.54, 1.38, .64], [.15, .08, .035], plush('#f59aa1'), 16); ellipsoid(g, [.54, 1.38, .64], [.15, .08, .035], plush('#f59aa1'), 16)
  ellipsoid(g, [0, 1.3, .69], [.22, .1, .045], plush('#9e3852'), 16)
  gem(g, '#ffe25f', .73, .54)
  return g
}

function giantShiro() {
  const g = new THREE.Group(), fur = plush('#fffdf8'), inner = plush('#e9e4e8')
  ellipsoid(g, [0, .68, 0], [.78, .78, .62], fur)
  ellipsoid(g, [0, 1.48, .05], [.88, .74, .68], fur)
  ellipsoid(g, [-.63, 1.82, -.01], [.34, .3, .22], fur); ellipsoid(g, [.63, 1.82, -.01], [.34, .3, .22], fur)
  ellipsoid(g, [-.62, 1.8, .16], [.2, .16, .08], inner); ellipsoid(g, [.62, 1.8, .16], [.2, .16, .08], inner)
  face(g, 1.55, .68, .25)
  ellipsoid(g, [0, 1.35, .73], [.13, .1, .07], eyeMaterial, 16)
  ellipsoid(g, [-.51, .57, .13], [.28, .54, .27], fur); ellipsoid(g, [.51, .57, .13], [.28, .54, .27], fur)
  ellipsoid(g, [-.32, .02, .13], [.38, .3, .44], fur); ellipsoid(g, [.32, .02, .13], [.38, .3, .44], fur)
  const tail = new THREE.Mesh(new THREE.TorusGeometry(.43, .13, 14, 28, Math.PI * 1.62), fur)
  tail.position.set(.64, .78, -.38); tail.rotation.set(Math.PI / 2, .16, -.5); tail.castShadow = true; g.add(tail)
  return g
}

function giantSakura() {
  const g = new THREE.Group(), skin = plush('#ffd6c7'), hair = plush('#6f3e2b'), pink = plush('#f45f91'), palePink = plush('#ffd6e7'), whiteCloth = plush('#fff8f2')
  ellipsoid(g, [0, 1.57, -.08], [.75, .73, .62], hair)
  ellipsoid(g, [0, 1.55, .19], [.61, .59, .53], skin)
  for (const x of [-.49, -.25, 0, .25, .49]) ellipsoid(g, [x, 1.98 - Math.abs(x) * .25, .22], [.22, .36, .18], hair, 18)
  const dress = new THREE.Mesh(new THREE.ConeGeometry(.78, 1.38, 28), pink); dress.position.set(0, .6, 0); dress.castShadow = true; g.add(dress)
  ellipsoid(g, [0, .91, .53], [.62, .19, .13], whiteCloth)
  bow(g, '#e83e75', 1.08, .61); gem(g, '#ffe261', .89, .68)
  ellipsoid(g, [-.66, .79, .05], [.22, .53, .21], palePink); ellipsoid(g, [.66, .79, .05], [.22, .53, .21], palePink)
  ellipsoid(g, [-.34, -.08, .05], [.3, .42, .34], whiteCloth); ellipsoid(g, [.34, -.08, .05], [.3, .42, .34], whiteCloth)
  face(g, 1.61, .72, .2)
  const hat = new THREE.Mesh(new THREE.SphereGeometry(.66, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), pink)
  hat.scale.y = .38; hat.position.set(0, 2.04, -.02); hat.castShadow = true; g.add(hat)
  const wing = plush('#fffdf8')
  const leftWing = ellipsoid(g, [-.72, 1.68, -.2], [.36, .19, .12], wing); leftWing.rotation.z = .45
  const rightWing = ellipsoid(g, [.72, 1.68, -.2], [.36, .19, .12], wing); rightWing.rotation.z = -.45
  return g
}

function giantKero() {
  const g = new THREE.Group(), gold = plush('#f6c84a'), cream = plush('#fff1b4'), orange = plush('#f2933d')
  ellipsoid(g, [0, .68, 0], [.76, .78, .62], gold)
  ellipsoid(g, [0, 1.5, .04], [.84, .72, .66], gold)
  ellipsoid(g, [-.58, 1.98, 0], [.31, .31, .24], gold); ellipsoid(g, [.58, 1.98, 0], [.31, .31, .24], gold)
  ellipsoid(g, [-.58, 1.98, .18], [.16, .16, .08], cream); ellipsoid(g, [.58, 1.98, .18], [.16, .16, .08], cream)
  face(g, 1.58, .69, .25)
  ellipsoid(g, [0, 1.34, .71], [.11, .08, .06], orange, 16)
  ellipsoid(g, [-.62, .65, .04], [.27, .52, .25], gold); ellipsoid(g, [.62, .65, .04], [.27, .52, .25], gold)
  ellipsoid(g, [-.34, .01, .09], [.38, .29, .42], gold); ellipsoid(g, [.34, .01, .09], [.38, .29, .42], gold)
  bow(g, '#f08b35', .94, .6); gem(g, '#ef4d5f', .73, .67)
  const wing = plush('#fffdf8')
  for (const side of [-1, 1]) {
    const upper = ellipsoid(g, [side * .73, 1.08, -.27], [.49, .25, .13], wing); upper.rotation.z = side * -.55
    const lower = ellipsoid(g, [side * .79, .8, -.24], [.42, .21, .12], wing); lower.rotation.z = side * -.25
  }
  return g
}

const toys: Toy[] = []
function addToy(group: THREE.Group, name: string, color: string, x: number, z: number, y: number, scale: number, rotation: [number, number, number], event = false) {
  const root = new THREE.Group()
  group.position.y = -1.03
  root.add(group)
  root.scale.setScalar(scale)
  root.updateMatrixWorld(true)
  const initialBounds = new THREE.Box3().setFromObject(root)
  const center = initialBounds.getCenter(new THREE.Vector3())
  group.position.x -= center.x / scale
  group.position.y -= center.y / scale
  group.position.z -= center.z / scale
  root.updateMatrixWorld(true)
  const visualSize = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
  root.position.set(x, y, z); root.rotation.set(...rotation); machine.add(root)
  const body = new CANNON.Body({ mass: 1.05, material: plushPhysics, linearDamping: .2, angularDamping: .34, allowSleep: true, sleepSpeedLimit: .06, sleepTimeLimit: 1.2 })
  body.addShape(new CANNON.Box(new CANNON.Vec3(visualSize.x * .45, visualSize.y * .45, visualSize.z * .45)))
  body.position.set(x, y, z); body.quaternion.setFromEuler(...rotation); world.addBody(body)
  body.angularVelocity.set((Math.random() - .5) * 3.4, (Math.random() - .5) * 3.4, (Math.random() - .5) * 3.4)
  const battleStyle: BattleStyle = name.includes('체리') || name.includes('마법사') || name.includes('포션') || name.includes('별') ? 'magic'
    : name.includes('케로') || name.includes('구름') || name.includes('병아리') || name.includes('물범') ? 'flyer'
      : name.includes('장난꾸러기') || name.includes('로봇') || name.includes('베어') || name.includes('슬라임') ? 'bruiser' : 'zigzag'
  toys.push({
    group: root,
    body,
    name,
    color,
    scale,
    won: false,
    held: false,
    event,
    escapeCooldown: Math.random() * .25,
    skittishness: event ? 1.15 : .72 + Math.random() * .46,
    escapeTime: 0,
    escapeAngle: 0,
    escapeBursts: 0,
    panicFace: false,
    battleStyle,
    attackCooldown: .35 + Math.random() * 1.1,
  })
}

const specs: Array<[THREE.Group, string, string, boolean?]> = [
  [mageDoll('#ed6eaa', '#673c99'), '체리 마법사 미미', '#ed6eaa'], [starSprite('#f4ce4b', '#ff83ad'), '소원별 피코', '#f4ce4b'],
  [cloudSprite('#aee5ef', '#f294bd'), '구름 요정 몽실', '#aee5ef'], [slimeSprite('#9b7de0', '#ffe76a'), '보석 슬라임', '#9b7de0'],
  [robotSprite('#5998c7', '#82f1ff'), '수호 로봇 루키', '#5998c7'], [potionSprite('#ec75ad', '#ffe56b'), '하트 포션', '#ec75ad'],
  [octopusSprite('#e989c0', '#72e2da'), '별바다 문어', '#e989c0'], [bunny('#f19bc3', '#ffe1ed'), '하트 리본 토끼', '#f19bc3'],
  [cat('#776bd8', '#ffd85f'), '별빛 고양이', '#776bd8'], [bear('#ed718d', '#ffd0d6'), '프리즘 베어', '#ed718d'],
  [duck('#f3ca3d', '#ef7c48'), '리본 병아리', '#f3ca3d'], [fox('#ef8a58', '#ffe26b'), '태양 여우', '#ef8a58'],
  [moonSeal('#76bddd', '#fff09e'), '달빛 물범', '#76bddd'], [mageDoll('#67b9c8', '#315293'), '푸른 마법사 소라', '#67b9c8'],
  [starSprite('#ef8eb1', '#fff09c'), '하트별 코코', '#ef8eb1'], [cloudSprite('#c29ce4', '#7ef0da'), '오로라 구름', '#c29ce4'],
  [slimeSprite('#72c49c', '#ff9ac2'), '클로버 슬라임', '#72c49c'], [robotSprite('#a987d7', '#ffe86f'), '마법 로봇 비비', '#a987d7'],
  [potionSprite('#7dcce2', '#ffd75d'), '별빛 포션', '#7dcce2'], [octopusSprite('#9a7edb', '#ffcbdd'), '은하 문어', '#9a7edb'],
  [mageDoll('#f0a04f', '#6d3d95'), '노을 마법사 나나', '#f0a04f'], [starSprite('#77d0b0', '#ffe66d'), '초록별 토토', '#77d0b0'],
  [cloudSprite('#f3b3ce', '#fff18b'), '딸기 구름', '#f3b3ce'], [slimeSprite('#69b9e5', '#ffdd73'), '파란 왕관 슬라임', '#69b9e5'],
  [robotSprite('#ea7894', '#80f0e4'), '하트 로봇 모모', '#ea7894'], [potionSprite('#ac86df', '#7ef3e3'), '오로라 포션', '#ac86df'],
  [octopusSprite('#f1a463', '#ffe16d'), '태양 문어', '#f1a463'], [moonSeal('#8f9ee2', '#ffdd7c'), '꿈결 물범', '#8f9ee2'],
  [bunny('#ef7fa9', '#fff0f6'), '사탕 토끼', '#ef7fa9'],
  [eventBoy(), '대왕 장난꾸러기', '#ff566e', true], [giantShiro(), '대왕 흰둥이', '#fffdf8', true],
  [giantSakura(), '대왕 카드캡터 체리', '#f45f91', true], [giantKero(), '대왕 케로', '#f6c84a', true],
]
let eventToyIndex = 0
const eventSlots: Array<[number, number]> = [[-1.85, -1.25], [1.85, -1.2], [-1.72, 1.08], [1.72, 1.05]]
specs.forEach(([group, name, color, event], index) => {
  const slot = event ? eventSlots[eventToyIndex++ % eventSlots.length] : null
  const x = slot ? slot[0] : -2.35 + (index % 5) * 1.15 + (Math.random() - .5) * .38
  const z = slot ? slot[1] : -1.82 + (index % 4) * 1.12 + (Math.random() - .5) * .32
  const y = event ? 7.2 + eventToyIndex * .48 : 2.2 + Math.floor(index / 6) * .46 + Math.random() * 3.1
  const scale = event ? .7 : .43 + Math.random() * .055
  addToy(group, name, color, x, z, y, scale, [(Math.random() - .5) * Math.PI, Math.random() * Math.PI * 2, (Math.random() - .5) * Math.PI], event)
})

// True three-finger claw: three articulated arms at exactly 120° intervals.
const clawRoot = new THREE.Group(); clawRoot.position.set(0, 5.72, 0); machine.add(clawRoot)
const clawMetal = new THREE.MeshPhysicalMaterial({ color: '#d8e8ec', metalness: .94, roughness: .14, clearcoat: .85 })
const clawDark = new THREE.MeshPhysicalMaterial({ color: '#53616c', metalness: .9, roughness: .2 })
const housing = new THREE.Mesh(new THREE.SphereGeometry(.37, 32, 20), clawMetal); housing.scale.y = .76; housing.castShadow = true; clawRoot.add(housing)
const connector = new THREE.Mesh(new THREE.CylinderGeometry(.17, .2, .4, 24), clawDark); connector.position.y = .32; clawRoot.add(connector)

function segment(material: THREE.Material, radius: number) { const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.12, 1, 14), material); m.castShadow = true; return m }
function alignSegment(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const direction = b.clone().sub(a), length = direction.length(); mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.scale.set(1, length, 1)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
}
const arms: Array<{ root: THREE.Group; upper: THREE.Mesh; lower: THREE.Mesh; joint: THREE.Mesh; tip: THREE.Mesh }> = []
for (let i = 0; i < 3; i += 1) {
  const root = new THREE.Group(); root.rotation.y = i * Math.PI * 2 / 3
  const upper = segment(clawMetal, .052), lower = segment(clawMetal, .046)
  const joint = new THREE.Mesh(new THREE.SphereGeometry(.085, 16, 12), clawDark)
  const tip = new THREE.Mesh(new THREE.SphereGeometry(.075, 16, 12), clawMetal)
  root.add(upper, lower, joint, tip); clawRoot.add(root); arms.push({ root, upper, lower, joint, tip })
}
let clawOpen = 1
function setClawOpen(value: number) {
  clawOpen = THREE.MathUtils.clamp(value, 0, 1)
  const base = new THREE.Vector3(.13, -.13, 0)
  const knee = new THREE.Vector3(THREE.MathUtils.lerp(.43, .79, clawOpen), -.78, 0)
  const tip = new THREE.Vector3(THREE.MathUtils.lerp(.13, .95, clawOpen), -1.47, 0)
  for (const arm of arms) { alignSegment(arm.upper, base, knee); alignSegment(arm.lower, knee, tip); arm.joint.position.copy(knee); arm.tip.position.copy(tip) }
}
setClawOpen(1)
const cable = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, 1, 12), clawDark); machine.add(cable)
function updateCable() { const ceiling = 6.54, length = Math.max(.2, ceiling - clawRoot.position.y); cable.scale.y = length; cable.position.set(clawRoot.position.x, clawRoot.position.y + length / 2, clawRoot.position.z) }
updateCable()

let phase: Phase = 'idle', phaseTime = 0, phaseDuration = 0
const phaseStart = new THREE.Vector3()
let heldToy: Toy | null = null, heldStable = false, slipped = false
let chaseTarget: Toy | null = null
const chaseOrigin = new THREE.Vector2()
let delivery: { toy: Toy; start: THREE.Vector3; startedAt: number } | null = null
const wonToys: Toy[] = [], pressed = new Set<string>()
let fleeAnnounced = false
let attackWaveCooldown = 0
type ToyAttack = { mesh: THREE.Group; toy: Toy; origin: THREE.Vector3; age: number; duration: number; power: number; label: string }
const toyAttacks: ToyAttack[] = []

function attackProfile(style: BattleStyle) {
  if (style === 'magic') return { color: '#ff65cb', power: .36, duration: .34, label: '반짝 마법탄' }
  if (style === 'flyer') return { color: '#7cecff', power: .3, duration: .25, label: '날개 돌진' }
  if (style === 'bruiser') return { color: '#ffb13b', power: .48, duration: .3, label: '몸통 박치기' }
  return { color: '#a8ff62', power: .28, duration: .22, label: '기습 태클' }
}

function launchToyAttack(toy: Toy) {
  const profile = attackProfile(toy.battleStyle)
  const attack = new THREE.Group()
  const material = new THREE.MeshBasicMaterial({ color: profile.color, toneMapped: false })
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(.13, 0), material)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.2, .026, 8, 20), material)
  ring.rotation.x = Math.PI / 2; attack.add(core, ring)
  const origin = new THREE.Vector3(toy.body.position.x, toy.body.position.y + .48, toy.body.position.z)
  attack.position.copy(origin); machine.add(attack)
  toyAttacks.push({ mesh: attack, toy, origin, age: 0, duration: profile.duration, power: profile.power, label: profile.label })
  status(`${toy.name}의 ${profile.label}!`, 'miss')
}

function updateToyAttacks(dt: number) {
  for (let i = toyAttacks.length - 1; i >= 0; i -= 1) {
    const attack = toyAttacks[i]
    attack.age += dt
    const t = Math.min(1, attack.age / attack.duration)
    const target = new THREE.Vector3(clawRoot.position.x, clawRoot.position.y - .32, clawRoot.position.z)
    attack.mesh.position.lerpVectors(attack.origin, target, t)
    attack.mesh.position.y += Math.sin(t * Math.PI) * .42
    attack.mesh.rotation.x += dt * 12; attack.mesh.rotation.y += dt * 17
    attack.mesh.scale.setScalar(.75 + Math.sin(t * Math.PI) * .7)
    if (t < 1) continue
    if (phase === 'lowering' || phase === 'closing') {
      let dx = clawRoot.position.x - attack.origin.x, dz = clawRoot.position.z - attack.origin.z
      const length = Math.max(.001, Math.hypot(dx, dz)); dx /= length; dz /= length
      clawRoot.position.x = THREE.MathUtils.clamp(clawRoot.position.x + dx * attack.power, -2.75, 2.75)
      clawRoot.position.z = THREE.MathUtils.clamp(clawRoot.position.z + dz * attack.power, -2.2, 2.2)
      sceneWrap.classList.remove('under-attack'); void sceneWrap.offsetWidth; sceneWrap.classList.add('under-attack')
      window.setTimeout(() => sceneWrap.classList.remove('under-attack'), 260)
      status(`${attack.toy.name}의 공격 적중! 집게가 밀려났어요`, 'miss')
    }
    machine.remove(attack.mesh); toyAttacks.splice(i, 1)
  }
}
function ease(t: number) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2 }
function setPanicFace(toy: Toy, active: boolean) {
  if (toy.panicFace === active) return
  toy.panicFace = active
  toy.group.traverse((part) => {
    if (part.name === 'normal-eye') part.visible = !active
    else if (part.name === 'panic-eyes') part.visible = active
  })
}
function status(message: string, mode: 'ready' | 'busy' | 'success' | 'miss' = 'ready') { statusText.textContent = message; statusCard.dataset.mode = mode }
function lock(value: boolean) {
  lockCurtain.classList.toggle('show', value); lockCurtain.setAttribute('aria-hidden', String(!value)); dropButton.disabled = value
  document.querySelectorAll<HTMLButtonElement>('.arrow-key').forEach((button) => { button.disabled = value }); pressed.clear()
}
function begin(next: Phase, duration: number, message: string, mode: 'ready' | 'busy' | 'success' | 'miss' = 'busy') { phase = next; phaseTime = 0; phaseDuration = duration; phaseStart.copy(clawRoot.position); status(message, mode) }
function triggerDrop() {
  if (phase !== 'idle') return
  lock(true); heldToy = null; heldStable = false; slipped = false; fleeAnnounced = false
  attackWaveCooldown = .18
  chaseOrigin.set(clawRoot.position.x, clawRoot.position.z)
  chaseTarget = toys
    .filter(toy => !toy.won && !toy.held)
    .map(toy => ({ toy, distance: Math.hypot(toy.body.position.x - clawRoot.position.x, toy.body.position.z - clawRoot.position.z) }))
    .sort((a, b) => a.distance - b.distance)[0]?.toy ?? null
  for (const toy of toys) {
    setPanicFace(toy, false)
    toy.escapeTime = 0
    toy.escapeBursts = 0
    toy.escapeCooldown = Math.random() * .12
    toy.attackCooldown = .12 + Math.random() * .48
  }
  begin('lowering', 1.02, '고속으로 집게가 내려가는 중…')
}

function chaseEscapingToy(dt: number, intensity: number) {
  if (!chaseTarget || chaseTarget.won || chaseTarget.held) return
  const prediction = .08 + intensity * .08
  let targetX = chaseTarget.body.position.x + chaseTarget.body.velocity.x * prediction
  let targetZ = chaseTarget.body.position.z + chaseTarget.body.velocity.z * prediction
  const fromOriginX = targetX - chaseOrigin.x, fromOriginZ = targetZ - chaseOrigin.y
  const originDistance = Math.hypot(fromOriginX, fromOriginZ)
  const chaseLimit = .92
  if (originDistance > chaseLimit) {
    targetX = chaseOrigin.x + fromOriginX / originDistance * chaseLimit
    targetZ = chaseOrigin.y + fromOriginZ / originDistance * chaseLimit
  }
  const dx = targetX - clawRoot.position.x, dz = targetZ - clawRoot.position.z
  const distance = Math.hypot(dx, dz)
  if (distance < .005) return
  const speed = 2.6 + intensity * 2.35
  const step = Math.min(distance, speed * dt)
  clawRoot.position.x = THREE.MathUtils.clamp(clawRoot.position.x + dx / distance * step, -2.75, 2.75)
  clawRoot.position.z = THREE.MathUtils.clamp(clawRoot.position.z + dz / distance * step, -2.2, 2.2)
}

function updateEscapingToys(dt: number) {
  if (phase !== 'lowering' && phase !== 'closing') {
    for (const toy of toys) setPanicFace(toy, false)
    return
  }
  const closingProgress = phase === 'closing' ? phaseTime / Math.max(.001, phaseDuration) : 0
  const canNoticeClaw = phase === 'lowering' || closingProgress < .72
  attackWaveCooldown -= dt

  const senseRadius = phase === 'lowering' ? 3.05 : 2.2
  let escaped = false
  for (const toy of toys) {
    if (toy.won || toy.held) continue
    toy.escapeCooldown -= dt
    toy.attackCooldown -= dt
    const dx = toy.body.position.x - clawRoot.position.x
    const dz = toy.body.position.z - clawRoot.position.z
    const distance = Math.hypot(dx, dz)

    // A nearby plush suddenly rights itself before starting a short, frantic escape run.
    if (canNoticeClaw && distance < senseRadius && toy.escapeTime <= 0) {
      const away = distance < .05 ? Math.random() * Math.PI * 2 : Math.atan2(dz, dx)
      toy.escapeAngle = away + (Math.random() - .5) * .64
      toy.escapeTime = 1.15 + toy.skittishness * .65 + Math.random() * .42
      toy.escapeBursts = 0
      toy.escapeCooldown = 0
      toy.body.wakeUp()
      toy.body.position.y += toy.event ? .3 : .18
      toy.body.quaternion.setFromEuler(0, Math.PI / 2 - toy.escapeAngle, 0)
      toy.body.angularVelocity.set(0, (Math.random() - .5) * 2.2, 0)
      toy.body.velocity.y = Math.max(toy.body.velocity.y, .75)
      setPanicFace(toy, true)
      escaped = true
    }

    if (toy.escapeTime <= 0) continue
    toy.escapeTime -= dt
    if (toy.escapeTime <= 0) {
      setPanicFace(toy, false)
      continue
    }
    if (toy.escapeCooldown > 0) continue

    const awayNow = distance < .05 ? toy.escapeAngle : Math.atan2(dz, dx)
    const zigzagStrength = toy.battleStyle === 'zigzag' ? .52 : .2
    const zigzag = (toy.escapeBursts % 2 ? 1 : -1) * (zigzagStrength + Math.random() * .3)
    toy.escapeAngle = awayNow + zigzag
    const panic = THREE.MathUtils.clamp(1 - distance / senseRadius, .16, 1) * toy.skittishness
    const runMultiplier = toy.battleStyle === 'zigzag' ? 1.22 : toy.battleStyle === 'bruiser' ? .83 : 1
    const jumpMultiplier = toy.battleStyle === 'flyer' ? 1.55 : toy.battleStyle === 'bruiser' ? .72 : 1
    const horizontalImpulse = (1.45 + panic * 2.05 + Math.random() * .42) * runMultiplier
    const jumpImpulse = (.72 + panic * .72 + Math.random() * .3) * jumpMultiplier
    toy.body.wakeUp()
    toy.body.applyImpulse(new CANNON.Vec3(
      Math.cos(toy.escapeAngle) * horizontalImpulse,
      jumpImpulse,
      Math.sin(toy.escapeAngle) * horizontalImpulse,
    ))
    toy.body.angularVelocity.x += (Math.random() - .5) * 1.25
    toy.body.angularVelocity.y += (Math.random() - .5) * 3.5
    toy.body.angularVelocity.z += (Math.random() - .5) * 1.25
    toy.escapeBursts += 1
    toy.escapeCooldown = .17 + Math.random() * .16
    if (attackWaveCooldown <= 0 && distance < 2.5 && canNoticeClaw && toy.attackCooldown <= 0) {
      launchToyAttack(toy)
      toy.attackCooldown = 1.1 + Math.random() * 1.2
      attackWaveCooldown = .34
    }
    escaped = true
  }

  if (escaped && !fleeAnnounced) {
    fleeAnnounced = true
    status('인형들이 벌떡 일어나 필사적으로 도망가요!', 'busy')
  }
}

function attemptGrab() {
  const clawWorld = new THREE.Vector3(); clawRoot.getWorldPosition(clawWorld)
  const nearest = toys.filter(t => !t.won && !t.held).map(toy => { const p = new THREE.Vector3(); toy.group.getWorldPosition(p); return { toy, p, d: Math.hypot(p.x - clawWorld.x, p.z - clawWorld.z) } }).sort((a, b) => a.d - b.d)[0]
  const grabRange = nearest?.toy.event ? 1.56 : 1.18
  if (!nearest || nearest.d > grabRange) { status('아쉽게도 집게가 빗나갔어요', 'miss'); return }
  const accuracy = THREE.MathUtils.clamp(1 - nearest.d / grabRange, 0, 1)
  const escapeSpeed = Math.hypot(nearest.toy.body.velocity.x, nearest.toy.body.velocity.z)
  const grabChance = (nearest.toy.event ? .31 : .36) + accuracy * .6 - Math.min(.32, escapeSpeed * .1)
  if (Math.random() > grabChance) { status(escapeSpeed > .75 ? '인형이 벌떡 일어나 잽싸게 도망쳤어요!' : '인형을 스쳤지만 놓쳤어요', 'miss'); return }
  heldToy = nearest.toy; heldToy.held = true; heldStable = Math.random() < .3 + accuracy * .65
  world.removeBody(heldToy.body); clawRoot.attach(heldToy.group)
  heldToy.group.position.set((Math.random() - .5) * (heldStable ? .1 : .32), -1.06, (Math.random() - .5) * (heldStable ? .1 : .32))
  heldToy.group.rotation.set(.08, heldToy.group.rotation.y, heldStable ? .04 : .38)
  status(heldStable ? `${heldToy.name}, 단단히 잡았어요!` : `${heldToy.name}, 아슬아슬하게 잡혔어요`, heldStable ? 'success' : 'busy')
}
function releaseToPile() {
  if (!heldToy) return
  machine.attach(heldToy.group); heldToy.held = false
  const p = heldToy.group.position, q = heldToy.group.quaternion
  heldToy.body.position.set(p.x, Math.max(.8, p.y), p.z); heldToy.body.quaternion.set(q.x, q.y, q.z, q.w); heldToy.body.velocity.set(0, 0, 0); heldToy.body.angularVelocity.set((Math.random() - .5) * 2, (Math.random() - .5) * 2, (Math.random() - .5) * 2)
  world.addBody(heldToy.body); heldToy = null; slipped = true
}
function startDelivery(toy: Toy) { machine.attach(toy.group); toy.won = true; toy.held = false; delivery = { toy, start: toy.group.position.clone(), startedAt: performance.now() }; heldToy = null }
function finish() { phase = 'idle'; lock(false); status('방향키로 다음 위치를 정하세요') }

function updateSequence(dt: number) {
  if (phase === 'idle') return
  phaseTime += dt; const raw = Math.min(1, phaseTime / phaseDuration), t = ease(raw)
  if (phase === 'lowering') {
    clawRoot.position.y = THREE.MathUtils.lerp(phaseStart.y, 1.92, t)
    if (raw > .32) chaseEscapingToy(dt, raw)
    if (raw === 1) begin('closing', .44, '도망가기 전에 빠르게 오므리는 중…')
  }
  else if (phase === 'closing') {
    chaseEscapingToy(dt, 1)
    setClawOpen(1 - t)
    if (raw === 1) { attemptGrab(); begin('rising', 1.45, heldToy ? '잡았다! 빠르게 들어 올리는 중…' : '빈 집게가 올라오는 중…') }
  }
  else if (phase === 'rising') {
    clawRoot.position.y = THREE.MathUtils.lerp(phaseStart.y, 5.72, t)
    if (heldToy && !heldStable && !slipped && raw > .44 && Math.random() < dt * 1.18) { const name = heldToy.name; releaseToPile(); status(`${name}이(가) 미끄러졌어요!`, 'miss') }
    if (raw === 1) begin('carrying', 1.65, heldToy ? '가운데 출구로 옮기는 중…' : '출구로 이동하는 중…')
  } else if (phase === 'carrying') {
    clawRoot.position.x = THREE.MathUtils.lerp(phaseStart.x, 0, t); clawRoot.position.z = THREE.MathUtils.lerp(phaseStart.z, 1.72, t)
    if (heldToy && !heldStable && !slipped && raw > .25 && Math.random() < dt * 1.35) { const name = heldToy.name; releaseToPile(); status(`${name}이(가) 이동 중 떨어졌어요!`, 'miss') }
    if (raw === 1) begin('releasing', .9, heldToy ? '출구에서 세 발을 펼쳐요!' : '집게를 펼치는 중…')
  } else if (phase === 'releasing') {
    setClawOpen(t); if (heldToy && raw > .32) startDelivery(heldToy)
    if (raw === 1) begin('returning', 1.4, delivery ? '인형이 하부 출구로 내려가요!' : '집게가 제자리로 돌아가요')
  } else if (phase === 'returning') {
    clawRoot.position.x = THREE.MathUtils.lerp(phaseStart.x, 0, t); clawRoot.position.z = THREE.MathUtils.lerp(phaseStart.z, 0, t)
    if (raw === 1) finish()
  }
  updateCable()
}

let showcaseModel: THREE.Group | null = null, showcaseSpin = 0, showcaseDragging = false, showcaseLastX = 0
const showcaseScene = new THREE.Scene(), showcaseCamera = new THREE.PerspectiveCamera(32, 1, .1, 50)
showcaseScene.add(new THREE.HemisphereLight('#fff5ed', '#4e2b68', 3))
const showcaseLight = new THREE.DirectionalLight('#fff', 4); showcaseLight.position.set(3, 5, 5); showcaseScene.add(showcaseLight)
const showcaseRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); showcaseRenderer.setPixelRatio(Math.min(devicePixelRatio, 2)); showcaseRenderer.outputColorSpace = THREE.SRGBColorSpace; showcaseRenderer.toneMapping = THREE.ACESFilmicToneMapping
function mountShowcase(toy: Toy, container: HTMLElement) {
  container.prepend(showcaseRenderer.domElement); if (showcaseModel) showcaseScene.remove(showcaseModel)
  showcaseModel = toy.group.clone(true); showcaseModel.scale.setScalar(1); showcaseScene.add(showcaseModel)
  const bounds = new THREE.Box3().setFromObject(showcaseModel), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3())
  showcaseModel.position.sub(center); const max = Math.max(size.x, size.y, size.z); showcaseCamera.position.set(0, 0, max * 2.45); showcaseCamera.lookAt(0, 0, 0); showcaseSpin = 0
  resizeShowcase(container)
}
function resizeShowcase(container: HTMLElement) { const r = container.getBoundingClientRect(); showcaseRenderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false); showcaseCamera.aspect = r.width / Math.max(1, r.height); showcaseCamera.updateProjectionMatrix() }
function celebrate(toy: Toy) {
  celebrationLayer.replaceChildren()
  celebrationLayer.className = `celebration-layer active${toy.event ? ' event' : ''}`
  const palette = toy.event ? ['#ffe66d', '#ff4f9a', '#64e9ff', '#ffffff'] : ['#ff8fbd', '#ffe27a', '#8ff0df', '#c9a5ff']
  const count = toy.event ? 76 : 52
  for (let i = 0; i < count; i += 1) {
    const particle = document.createElement('i')
    particle.className = i % 5 === 0 ? 'magic-star' : 'flower-petal'
    particle.style.setProperty('--left', `${Math.random() * 100}%`)
    particle.style.setProperty('--delay', `${Math.random() * .5}s`)
    particle.style.setProperty('--duration', `${1.35 + Math.random() * 1.15}s`)
    particle.style.setProperty('--drift', `${(Math.random() - .5) * 230}px`)
    particle.style.setProperty('--spin', `${240 + Math.random() * 620}deg`)
    particle.style.setProperty('--color', palette[i % palette.length])
    celebrationLayer.append(particle)
  }
  window.setTimeout(() => { celebrationLayer.className = 'celebration-layer'; celebrationLayer.replaceChildren() }, 2700)
}
function showWin(toy: Toy) {
  winName.textContent = toy.name
  winTier.textContent = toy.event ? '★ EVENT PRIZE ★' : 'MAGICAL GET!'
  winShowcase.classList.toggle('event', toy.event)
  celebrate(toy)
  winShowcase.hidden = false; winShowcase.classList.remove('show'); mountShowcase(toy, winCanvas); void winShowcase.offsetWidth; winShowcase.classList.add('show')
  window.setTimeout(() => { winShowcase.hidden = true; if (!gallery.hidden) selectPrize(toy) }, 2000)
}
function updateGalleryList() {
  galleryList.replaceChildren(); galleryEmpty.hidden = wonToys.length > 0
  wonToys.forEach((toy, index) => { const button = document.createElement('button'); button.type = 'button'; button.innerHTML = `<i style="--toy-color:${toy.color}">✦</i><span><small>PRIZE ${String(index + 1).padStart(2, '0')}</small><strong>${toy.name}</strong></span>`; button.addEventListener('click', () => selectPrize(toy)); galleryList.append(button) })
}
function selectPrize(toy: Toy) { document.querySelectorAll('.gallery-list button').forEach(b => b.classList.toggle('selected', b.textContent?.includes(toy.name) ?? false)); mountShowcase(toy, galleryViewer) }
function openGallery() { gallery.hidden = false; updateGalleryList(); if (wonToys[0]) selectPrize(wonToys[0]); galleryClose.focus() }
function closeGallery() { gallery.hidden = true; prizesButton.focus() }
prizesButton.addEventListener('click', openGallery); galleryClose.addEventListener('click', closeGallery); gallery.addEventListener('click', e => { if (e.target === gallery) closeGallery() })
galleryViewer.addEventListener('pointerdown', e => { showcaseDragging = true; showcaseLastX = e.clientX; galleryViewer.setPointerCapture(e.pointerId) })
galleryViewer.addEventListener('pointermove', e => { if (!showcaseDragging || !showcaseModel) return; showcaseModel.rotation.y += (e.clientX - showcaseLastX) * .012; showcaseLastX = e.clientX })
galleryViewer.addEventListener('pointerup', () => { showcaseDragging = false })

function updateDelivery() {
  if (!delivery) return
  const raw = Math.min(1, (performance.now() - delivery.startedAt) / 1300), t = ease(raw), toy = delivery.toy
  toy.group.position.x = THREE.MathUtils.lerp(delivery.start.x, 0, t); toy.group.position.z = THREE.MathUtils.lerp(delivery.start.z, 3.48, t)
  toy.group.position.y = THREE.MathUtils.lerp(delivery.start.y, -.58, t) + Math.sin(Math.PI * raw) * .28; toy.group.rotation.z += .035
  if (raw === 1) { wonToys.push(toy); prizeCount.textContent = String(wonToys.length).padStart(2, '0'); status(`${toy.name} 획득!`, 'success'); showWin(toy); delivery = null }
}

const moveKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
function setKeyVisual(key: string, active: boolean) { document.querySelector<HTMLButtonElement>(`.arrow-key[data-key="${key}"]`)?.classList.toggle('pressed', active); if (key === 'Space') dropButton.classList.toggle('pressed', active) }
function manual(dt: number) {
  if (phase !== 'idle') return
  let x = 0, z = 0; if (pressed.has('ArrowLeft')) x--; if (pressed.has('ArrowRight')) x++; if (pressed.has('ArrowUp')) z--; if (pressed.has('ArrowDown')) z++
  if (!x && !z) return
  const len = Math.hypot(x, z), speed = 3.35; clawRoot.position.x = THREE.MathUtils.clamp(clawRoot.position.x + x / len * speed * dt, -2.75, 2.75); clawRoot.position.z = THREE.MathUtils.clamp(clawRoot.position.z + z / len * speed * dt, -2.2, 2.2); updateCable(); status('빠르게 위치를 조정하는 중…')
}
window.addEventListener('keydown', e => { if (moveKeys.includes(e.key) || e.code === 'Space') e.preventDefault(); if (phase !== 'idle' || !gallery.hidden) return; if (moveKeys.includes(e.key)) { pressed.add(e.key); setKeyVisual(e.key, true) } if (e.code === 'Space' && !e.repeat) { setKeyVisual('Space', true); triggerDrop() } })
window.addEventListener('keyup', e => { pressed.delete(e.key); setKeyVisual(e.key, false); if (e.code === 'Space') setKeyVisual('Space', false) })
window.addEventListener('blur', () => { pressed.forEach(k => setKeyVisual(k, false)); pressed.clear(); setKeyVisual('Space', false) })
document.querySelectorAll<HTMLButtonElement>('.arrow-key').forEach(button => {
  const key = button.dataset.key!
  button.addEventListener('pointerdown', e => { if (phase !== 'idle') return; e.preventDefault(); button.setPointerCapture(e.pointerId); pressed.add(key); setKeyVisual(key, true) })
  const stop = () => { pressed.delete(key); setKeyVisual(key, false) }; button.addEventListener('pointerup', stop); button.addEventListener('pointercancel', stop)
})
dropButton.addEventListener('click', triggerDrop)

// Drag the entire machine around its center; initial view remains straight-on.
let dragging = false, dragX = 0, dragY = 0, targetYaw = 0, targetPitch = 0
renderer.domElement.addEventListener('pointerdown', e => { dragging = true; dragX = e.clientX; dragY = e.clientY; renderer.domElement.setPointerCapture(e.pointerId); sceneWrap.classList.add('dragging'); document.querySelector('#drag-guide')?.classList.add('used') })
renderer.domElement.addEventListener('pointermove', e => { if (!dragging) return; targetYaw = THREE.MathUtils.clamp(targetYaw + (e.clientX - dragX) * .006, -.95, .95); targetPitch = THREE.MathUtils.clamp(targetPitch + (e.clientY - dragY) * .0025, -.08, .14); dragX = e.clientX; dragY = e.clientY })
const stopDrag = () => { dragging = false; sceneWrap.classList.remove('dragging') }; renderer.domElement.addEventListener('pointerup', stopDrag); renderer.domElement.addEventListener('pointercancel', stopDrag)

function resize() { const r = sceneWrap.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix(); const active = !gallery.hidden ? galleryViewer : winCanvas; if (active.isConnected && showcaseRenderer.domElement.parentElement === active) resizeShowcase(active) }
window.addEventListener('resize', resize); resize()

const clock = new THREE.Clock()
function animate() {
  const dt = Math.min(.033, clock.getDelta()); manual(dt); updateSequence(dt); updateEscapingToys(dt); updateToyAttacks(dt); updateDelivery(); world.step(1 / 60, dt, 4)
  for (const toy of toys) if (!toy.held && !toy.won) { toy.group.position.set(toy.body.position.x, toy.body.position.y, toy.body.position.z); toy.group.quaternion.set(toy.body.quaternion.x, toy.body.quaternion.y, toy.body.quaternion.z, toy.body.quaternion.w) }
  const lightTime = performance.now() * .001
  arcadeBulbs.forEach((bulb, index) => {
    const material = bulb.material as THREE.MeshBasicMaterial
    material.color.setHSL((index * .073 + lightTime * .12) % 1, .94, .57 + Math.sin(lightTime * 5.5 - index * .42) * .12)
    bulb.scale.setScalar(.82 + Math.sin(lightTime * 6.2 - index * .35) * .22)
  })
  sweepLights.forEach((light, index) => {
    light.target.position.x = Math.sin(lightTime * .82 + index * 2.1) * 2.45
    light.target.position.z = Math.cos(lightTime * .63 + index) * 1.45
    light.intensity = 28 + Math.sin(lightTime * 3.1 + index) * 8
  })
  pinkLight.intensity = 15 + Math.sin(lightTime * 2.7) * 4
  cyanLight.intensity = 12 + Math.sin(lightTime * 3.1 + 1.4) * 3
  machine.rotation.y += (targetYaw - machine.rotation.y) * .09; machine.rotation.x += (targetPitch - machine.rotation.x) * .09
  positionReadout.textContent = `X ${Math.round((clawRoot.position.x + 3) * 10).toString().padStart(2, '0')} · Z ${Math.round((clawRoot.position.z + 2.5) * 10).toString().padStart(2, '0')}`
  if (showcaseModel && showcaseRenderer.domElement.isConnected) { if (!showcaseDragging) showcaseSpin += dt * .72; showcaseModel.rotation.y += showcaseDragging ? 0 : dt * .72; showcaseRenderer.render(showcaseScene, showcaseCamera) }
  renderer.render(scene, camera); requestAnimationFrame(animate)
}
animate()
