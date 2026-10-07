import './asmr.css'
import { createMaterialRenderer } from './asmr-scene'
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

type Point = { x: number; y: number }
type Mode = 'soap' | 'slime' | 'sand'
type Body = { x: number; y: number; vx: number; vy: number }
type Hand = {
  id: string
  points: Point[]
  previousPoints: Point[]
  pinchPoint: Point
  pinch: boolean
  contacts: boolean[]
  slimeGrip: boolean
  gripOffset: Point
  intentSince: number
  gripSince: number
  frameDelta: number
  lastSeen: number
}
type ParticleKind = 'soap' | 'slime' | 'sand'
type Particle = {
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
  life: number
  maxLife: number
}
type Speckle = { x: number; depth: number; size: number; shade: number }

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <main class="asmr-app" data-mode="soap">
    <video class="asmr-camera" id="camera" playsinline muted aria-label="실시간 카메라 화면"></video>
    <canvas class="asmr-canvas" id="asmr-canvas" aria-label="손으로 만지는 ASMR 재료"></canvas>
    <div class="camera-grade" aria-hidden="true"></div>

    <header class="asmr-topbar">
      <a class="asmr-brand" href="${import.meta.env.BASE_URL}" aria-label="인터랙티브 랩으로 돌아가기">
        <span class="asmr-mark" aria-hidden="true"></span>
        <strong>ASMR Lab</strong>
        <span class="example-number">11</span>
      </a>
      <div class="tracking-status" id="tracking-status" role="status" aria-live="polite">
        <i aria-hidden="true"></i><span>Camera waiting</span>
      </div>
    </header>

    <nav class="material-tabs" aria-label="ASMR 재료 선택">
      <button class="material-tab" type="button" data-mode="soap" aria-selected="true">비누 미끄러뜨리기</button>
      <button class="material-tab" type="button" data-mode="slime" aria-selected="false">점액 만지기</button>
      <button class="material-tab" type="button" data-mode="sand" aria-selected="false">모래 퍼내기</button>
    </nav>

    <aside class="asmr-utilities" aria-label="ASMR 설정">
      <p class="mode-readout" id="mode-readout">SOAP · READY</p>
      <button class="utility-button" id="sound-button" type="button" aria-pressed="true">소리 켜짐</button>
      <button class="utility-button" id="reset-button" type="button">새 재료</button>
    </aside>
    <p class="gesture-guide" id="gesture-guide">손가락 세 개를 비누 위에 잠깐 얹은 뒤 밀어보세요.</p>
    <p class="action-toast" id="action-toast" role="status" aria-live="polite">SOAP READY</p>

    <section class="welcome" id="welcome" aria-labelledby="welcome-title">
      <div class="welcome-card">
        <p class="welcome-kicker">EXPERIMENT 11 · HAND-REACTIVE TACTILE SOUND</p>
        <h1 id="welcome-title">ASMR Lab</h1>
        <p class="welcome-copy">비누를 밀어 미끄러뜨리고, 슬라임을 집어 옮겨보세요.<br>양손으로 잡아 벌리면 슬라임이 길게 늘어나요.</p>
        <p class="headphone-note">🎧 이어폰을 사용하면 촉각적인 소리가 더 잘 들려요.</p>
        <button class="start-button" id="start-button" type="button">소리와 카메라 켜기</button>
        <p class="privacy-note">카메라 영상은 기기 밖으로 전송되거나 저장되지 않아요.</p>
      </div>
    </section>

    <section class="error-panel" id="error-panel" hidden aria-live="assertive">
      <div>
        <h2>ASMR Lab을 열 수 없어요</h2>
        <p id="error-copy">브라우저의 카메라 권한을 확인하고 다시 시도해 주세요.</p>
        <button class="retry-button" id="retry-button" type="button">다시 시도</button>
      </div>
    </section>
  </main>
`

const root = document.querySelector<HTMLElement>('.asmr-app')!
const video = document.querySelector<HTMLVideoElement>('#camera')!
const canvas = document.querySelector<HTMLCanvasElement>('#asmr-canvas')!
const context = canvas.getContext('2d')!
const materials = createMaterialRenderer()
const welcome = document.querySelector<HTMLElement>('#welcome')!
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!
const retryButton = document.querySelector<HTMLButtonElement>('#retry-button')!
const resetButton = document.querySelector<HTMLButtonElement>('#reset-button')!
const soundButton = document.querySelector<HTMLButtonElement>('#sound-button')!
const errorPanel = document.querySelector<HTMLElement>('#error-panel')!
const errorCopy = document.querySelector<HTMLElement>('#error-copy')!
const trackingStatus = document.querySelector<HTMLElement>('#tracking-status')!
const trackingCopy = trackingStatus.querySelector<HTMLElement>('span')!
const modeReadout = document.querySelector<HTMLElement>('#mode-readout')!
const gestureGuide = document.querySelector<HTMLElement>('#gesture-guide')!
const actionToast = document.querySelector<HTMLElement>('#action-toast')!
const materialTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.material-tab'))

const fingertips = [4, 8, 12, 16, 20]
const slimePointCount = 42
const sandColumnCount = 104
const lowPowerDevice = (navigator.hardwareConcurrency || 8) <= 4
const hands = new Map<string, Hand>()
const slimeRadii = new Float32Array(slimePointCount)
const slimeVelocity = new Float32Array(slimePointCount)
const sandHeights = new Float32Array(sandColumnCount)
const sandSpeckles: Speckle[] = Array.from({ length: lowPowerDevice ? 100 : 170 }, () => ({
  x: Math.random(), depth: Math.random(), size: .7 + Math.random() * 1.8, shade: Math.random(),
}))
const soapBody: Body = { x: 0, y: 0, vx: 0, vy: 0 }
const slimeBody: Body = { x: 0, y: 0, vx: 0, vy: 0 }
let particles: Particle[] = []
let handLandmarker: HandLandmarker | null = null
let audioContext: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null
let soundEnabled = true
let cameraReady = false
let currentMode: Mode = 'soap'
let width = innerWidth
let height = innerHeight
let dpr = 1
let lastFrameAt = performance.now()
let lastInferenceAt = 0
let lastVideoTime = -1
let lastSoundAt = 0
let toastTimer = 0

const modeCopy: Record<Mode, { readout: string; guide: string; ready: string }> = {
  soap: { readout: 'SOAP · READY', guide: '손가락 세 개를 비누 위에 잠깐 얹은 뒤 밀어보세요.', ready: 'SOAP READY' },
  slime: { readout: 'SLIME · READY', guide: '핀치로 집어 이동 · 양손으로 잡아 벌려 늘리기', ready: 'SLIME READY' },
  sand: { readout: 'SAND · READY', guide: '손가락 두 개 이상을 잠깐 얹고 움직여 모래를 퍼보세요.', ready: 'SAND READY' },
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function distance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function resize() {
  width = innerWidth
  height = innerHeight
  const budget = lowPowerDevice ? 2_350_000 : 4_100_000
  dpr = Math.min(devicePixelRatio || 1, 2, Math.max(1, Math.sqrt(budget / Math.max(1, width * height))))
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function resetSoap() {
  Object.assign(soapBody, { x: 0, y: 0, vx: 0, vy: 0 })
}

function slimeRestRadius(index: number) {
  const angle = index / slimePointCount * Math.PI * 2
  return 1 + Math.sin(angle * 3 + .5) * .075 + Math.cos(angle * 5) * .035
}

function resetSlime() {
  for (let i = 0; i < slimePointCount; i++) slimeRadii[i] = slimeRestRadius(i)
  slimeVelocity.fill(0)
  Object.assign(slimeBody, { x: 0, y: 0, vx: 0, vy: 0 })
  hands.forEach((hand) => { hand.slimeGrip = false })
}

function resetSand() {
  for (let index = 0; index < sandColumnCount; index += 1) {
    const normalized = index / (sandColumnCount - 1) * 2 - 1
    sandHeights[index] = Math.pow(Math.max(0, 1 - normalized * normalized), .72)
  }
}

function resetCurrent(showMessage = true) {
  clearGestures()
  if (currentMode === 'soap') resetSoap()
  else if (currentMode === 'slime') resetSlime()
  else resetSand()
  particles = particles.filter((particle) => particle.kind !== currentMode)
  if (showMessage) showAction(`FRESH ${currentMode.toUpperCase()}`)
}

function setStatus(message: string, state: 'loading' | 'ready' | 'error') {
  trackingCopy.textContent = message
  trackingStatus.classList.toggle('ready', state === 'ready')
  trackingStatus.classList.toggle('error', state === 'error')
}

function showAction(message: string) {
  window.clearTimeout(toastTimer)
  actionToast.textContent = message
  actionToast.classList.remove('show')
  void actionToast.offsetWidth
  actionToast.classList.add('show')
  toastTimer = window.setTimeout(() => actionToast.classList.remove('show'), 850)
}

function initAudio() {
  if (!audioContext) audioContext = new AudioContext()
  if (audioContext.state === 'suspended') void audioContext.resume()
  if (!noiseBuffer) {
    noiseBuffer = audioContext.createBuffer(1, Math.round(audioContext.sampleRate * .45), audioContext.sampleRate)
    const channel = noiseBuffer.getChannelData(0)
    for (let index = 0; index < channel.length; index += 1) channel[index] = Math.random() * 2 - 1
  }
}

function playNoise(frequency: number, type: BiquadFilterType, duration: number, volume: number, intensity = 1) {
  if (!soundEnabled || !audioContext || !noiseBuffer) return
  const source = audioContext.createBufferSource()
  const filter = audioContext.createBiquadFilter()
  const gain = audioContext.createGain()
  source.buffer = noiseBuffer
  filter.type = type
  filter.frequency.value = frequency
  filter.Q.value = type === 'bandpass' ? 2.3 : .7
  const now = audioContext.currentTime
  gain.gain.setValueAtTime(Math.max(.0001, volume * clamp(intensity, .15, 1.3)), now)
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration)
  source.connect(filter).connect(gain).connect(audioContext.destination)
  source.start(now, Math.random() * .2)
  source.stop(now + duration)
}

function playTone(frequency: number, duration: number, volume: number, endFrequency = frequency * .62) {
  if (!soundEnabled || !audioContext) return
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()
  const now = audioContext.currentTime
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, now)
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(28, endFrequency), now + duration)
  gain.gain.setValueAtTime(volume, now)
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration)
  oscillator.connect(gain).connect(audioContext.destination)
  oscillator.start(now)
  oscillator.stop(now + duration)
}

function playMaterialSound(mode: Mode, intensity: number, now: number) {
  if (now - lastSoundAt < (lowPowerDevice ? 78 : 55)) return
  lastSoundAt = now
  if (mode === 'soap') playNoise(550 + intensity * 650, 'lowpass', .12, .024, intensity)
  else if (mode === 'slime') {
    playNoise(330 + intensity * 220, 'lowpass', .1, .035, intensity)
    if (Math.random() < .14) playTone(105 + Math.random() * 35, .08, .018, 62)
  } else playNoise(780 + intensity * 720, 'bandpass', .075, .026, intensity)
}

async function setupTracking() {
  const vision = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}lemonade/mediapipe`)
  const options = {
    runningMode: 'VIDEO' as const,
    numHands: 2,
    minHandDetectionConfidence: .52,
    minHandPresenceConfidence: .48,
    minTrackingConfidence: .48,
  }
  try {
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}lemonade/mediapipe/hand_landmarker.task`, delegate: 'GPU' },
    })
  } catch {
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}lemonade/mediapipe/hand_landmarker.task`, delegate: 'CPU' },
    })
  }
}

async function startExperience() {
  startButton.disabled = true
  startButton.textContent = '재료 준비 중…'
  errorPanel.hidden = true
  setStatus('Loading hand tracking', 'loading')
  try {
    initAudio()
    const [stream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } },
        audio: false,
      }),
      handLandmarker ? Promise.resolve() : setupTracking(),
    ])
    video.srcObject = stream
    await video.play()
    cameraReady = true
    welcome.classList.add('hidden')
    setStatus('손을 보여주세요', 'ready')
    showAction(modeCopy[currentMode].ready)
  } catch (error) {
    const denied = error instanceof DOMException && error.name === 'NotAllowedError'
    errorCopy.textContent = denied
      ? '카메라 권한이 차단되었습니다. 주소창의 카메라 설정에서 권한을 허용해 주세요.'
      : '카메라 또는 손 인식 모델을 준비하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.'
    errorPanel.hidden = false
    setStatus('Camera unavailable', 'error')
  } finally {
    startButton.disabled = false
    startButton.textContent = '소리와 카메라 켜기'
  }
}

function screenPoint(landmark: NormalizedLandmark): Point {
  const sourceWidth = video.videoWidth || 1280
  const sourceHeight = video.videoHeight || 720
  const scale = Math.max(width / sourceWidth, height / sourceHeight)
  const renderedWidth = sourceWidth * scale
  const renderedHeight = sourceHeight * scale
  const cropX = (renderedWidth - width) * .5
  const cropY = (renderedHeight - height) * .5
  return {
    x: width - (landmark.x * renderedWidth - cropX),
    y: landmark.y * renderedHeight - cropY,
  }
}

function soapGeometry() {
  const soapWidth = clamp(width * .38, 180, 430)
  const soapHeight = Math.min(soapWidth * .55, height * .25)
  return { x: centerX() + soapBody.x - soapWidth * .5, y: height * .47 + soapBody.y - soapHeight * .5, width: soapWidth, height: soapHeight }
}

function centerX() { return width * .5 }

function addParticle(particle: Particle) {
  particles.push(particle)
  const cap = lowPowerDevice ? 150 : 260
  if (particles.length > cap) particles.splice(0, particles.length - cap)
}

function interactSoap(hand: Hand, now: number) {
  const box = soapGeometry()
  const touching = fingertips.map((index) => {
    const p = hand.points[index]
    return p.x > box.x + 6 && p.x < box.x + box.width - 6 && p.y > box.y + 6 && p.y < box.y + box.height - 6
  })
  if (!intentReady(hand, !hand.pinch && touching.filter(Boolean).length >= 3, now, 180)) return
  hand.contacts = touching
  const motion = palmMotion(hand)
  if (Math.hypot(motion.x, motion.y) < 35) return
  const blend = 1 - Math.exp(-hand.frameDelta * 9)
  soapBody.vx += (motion.x * 1.15 - soapBody.vx) * blend
  soapBody.vy += (motion.y * 1.15 - soapBody.vy) * blend
  playMaterialSound('soap', clamp(Math.hypot(motion.x, motion.y) / 500, .15, 1), now)
}

function slimeGeometry() {
  return { x: centerX() + slimeBody.x, y: height * .51 + slimeBody.y, radius: clamp(Math.min(width * .22, height * .24), 80, 230) }
}

function slimeNodeAt(angle: number) {
  const normalized = (angle + Math.PI * 2) % (Math.PI * 2)
  return Math.round(normalized / (Math.PI * 2) * slimePointCount) % slimePointCount
}

function disturbSlime(node: number, target: number, strength: number) {
  for (let offset = -3; offset <= 3; offset += 1) {
    const index = (node + offset + slimePointCount) % slimePointCount
    const weight = Math.exp(-(offset * offset) / 5)
    slimeVelocity[index] += (target - slimeRadii[index]) * strength * weight
  }
}

function spawnSlimeBubble(x: number, y: number) {
  addParticle({
    kind: 'slime', x, y, vx: (Math.random() - .5) * 24, vy: -8 - Math.random() * 18,
    radius: 4 + Math.random() * 9, color: Math.random() > .5 ? '#b7ffe4' : '#f1dcff',
    life: .6 + Math.random() * .55, maxLife: 1.15,
  })
}

function intentReady(hand: Hand, touching: boolean, now: number, dwell: number) {
  if (!touching) { hand.intentSince = 0; return false }
  if (!hand.intentSince) hand.intentSince = now
  return now - hand.intentSince >= dwell
}

function palmMotion(hand: Hand) {
  let x = 0
  let y = 0
  for (const i of [0, 5, 9, 13, 17]) {
    x += hand.points[i].x - hand.previousPoints[i].x
    y += hand.points[i].y - hand.previousPoints[i].y
  }
  return { x: clamp(x / (5 * hand.frameDelta), -900, 900), y: clamp(y / (5 * hand.frameDelta), -900, 900) }
}

function clearGestures() {
  hands.forEach((hand) => {
    hand.intentSince = 0
    hand.gripSince = 0
    hand.slimeGrip = false
    hand.contacts.fill(false)
    hand.previousPoints = hand.points
  })
}

function interactSlime(hand: Hand, now: number, justReleased: boolean) {
  const blob = slimeGeometry()
  const dx = hand.pinchPoint.x - blob.x
  const dy = hand.pinchPoint.y - blob.y
  const surface = blob.radius * slimeRadii[slimeNodeAt(Math.atan2(dy, dx))]
  const canGrab = hand.pinch && Math.hypot(dx, dy) < surface - 5
  if (canGrab && !hand.gripSince) hand.gripSince = now
  if (!canGrab && !hand.slimeGrip) hand.gripSince = 0
  if (!hand.slimeGrip && canGrab && now - hand.gripSince >= 160) {
    hand.slimeGrip = true
    hand.gripOffset = { x: dx, y: dy }
    playTone(125, .11, .03, 62)
    showAction('잡았어요 · 손을 움직여보세요')
  }
  if (justReleased && hand.slimeGrip) {
    hand.slimeGrip = false
    hand.gripSince = 0
    playTone(230 + Math.random() * 90, .08, .035, 105)
    spawnSlimeBubble(hand.pinchPoint.x, hand.pinchPoint.y)
  }
  if (hand.slimeGrip) {
    hand.contacts[0] = true
    hand.contacts[1] = true
    const motion = palmMotion(hand)
    if (Math.hypot(motion.x, motion.y) > 35) playMaterialSound('slime', clamp(Math.hypot(motion.x, motion.y) / 450, .15, 1), now)
    return
  }
  // Rest at least two fingertips on the actual surface before pressing.
  const touching = fingertips.map((i) => {
    const p = hand.points[i]
    const angle = Math.atan2(p.y - blob.y, p.x - blob.x)
    return distance(p, blob) < blob.radius * slimeRadii[slimeNodeAt(angle)] - 8
  })
  if (!intentReady(hand, !hand.pinch && touching.filter(Boolean).length >= 2, now, 260)) return
  fingertips.forEach((landmarkIndex, finger) => {
    if (!touching[finger]) return
    const point = hand.points[landmarkIndex]
    const previous = hand.previousPoints[landmarkIndex]
    const dx = point.x - blob.x
    const dy = point.y - blob.y
    const gap = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)
    const node = slimeNodeAt(angle)
    hand.contacts[finger] = true
    const movement = distance(point, previous)
    if (movement / hand.frameDelta < 30) return
    disturbSlime(node, clamp(gap / blob.radius, .78, 1.2), .07)
    playMaterialSound('slime', clamp(movement / 25, .15, .8), now)
  })
}

function constrainBody(body: Body, halfWidth: number, halfHeight: number, originY: number, bounce: number) {
  const maxX = Math.max(0, width * .5 - halfWidth - 12)
  const minY = Math.min(0, 118 + halfHeight - originY)
  const maxY = Math.max(minY, height - 115 - halfHeight - originY)
  if (body.x < -maxX) { body.x = -maxX; body.vx = Math.abs(body.vx) * bounce }
  if (body.x > maxX) { body.x = maxX; body.vx = -Math.abs(body.vx) * bounce }
  if (body.y < minY) { body.y = minY; body.vy = Math.abs(body.vy) * bounce }
  if (body.y > maxY) { body.y = maxY; body.vy = -Math.abs(body.vy) * bounce }
}

function updateBodies(delta: number, now: number) {
  for (const [id, hand] of hands) if (now - hand.lastSeen > 200) hands.delete(id)
  if (currentMode === 'soap') {
    soapBody.x += soapBody.vx * delta
    soapBody.y += soapBody.vy * delta
    soapBody.vx *= Math.exp(-1.1 * delta)
    soapBody.vy *= Math.exp(-1.1 * delta)
    if (Math.hypot(soapBody.vx, soapBody.vy) < 3) soapBody.vx = soapBody.vy = 0
    const box = soapGeometry()
    constrainBody(soapBody, box.width / 2, box.height / 2, height * .47, .45)
    const speed = Math.hypot(soapBody.vx, soapBody.vy)
    if (speed > 35) playMaterialSound('soap', clamp(speed / 600, .1, .8), now)
  }
  if (currentMode !== 'slime') return
  const grips = Array.from(hands.values()).filter((hand) => hand.slimeGrip && hand.pinch)
  const blob = slimeGeometry()
  if (grips.length) {
    let x = 0
    let y = 0
    grips.forEach((hand) => { x += hand.pinchPoint.x - hand.gripOffset.x; y += hand.pinchPoint.y - hand.gripOffset.y })
    x = x / grips.length - centerX()
    y = y / grips.length - height * .51
    // Damped spring follows the grip without snapping its center to the fingertips.
    slimeBody.vx += (x - slimeBody.x) * 105 * delta
    slimeBody.vy += (y - slimeBody.y) * 105 * delta
    slimeBody.vx *= Math.exp(-17 * delta)
    slimeBody.vy *= Math.exp(-17 * delta)
  } else {
    slimeBody.vx *= Math.exp(-5 * delta)
    slimeBody.vy *= Math.exp(-5 * delta)
  }
  slimeBody.vx = clamp(slimeBody.vx, -950, 950)
  slimeBody.vy = clamp(slimeBody.vy, -950, 950)
  slimeBody.x += slimeBody.vx * delta
  slimeBody.y += slimeBody.vy * delta
  constrainBody(slimeBody, blob.radius, blob.radius, height * .51, .1)
  // Only two grips pull opposite parts of the surface; a single grip transports it.
  if (grips.length === 2) {
    const moved = slimeGeometry()
    grips.forEach((hand) => {
      const dx = hand.pinchPoint.x - moved.x
      const dy = hand.pinchPoint.y - moved.y
      const stretch = Math.hypot(dx, dy) / Math.max(20, Math.hypot(hand.gripOffset.x, hand.gripOffset.y))
      disturbSlime(slimeNodeAt(Math.atan2(dy, dx)), clamp(stretch, .72, 1.9), delta * 3)
    })
  }
}

function sandGeometry() {
  const moundWidth = clamp(width * .66, 330, 780)
  return { left: centerX() - moundWidth * .5, width: moundWidth, bottom: height * .74, maxHeight: clamp(height * .31, 175, 330) }
}

function sandSurface(index: number) {
  const sand = sandGeometry()
  return sand.bottom - sandHeights[clamp(index, 0, sandColumnCount - 1)] * sand.maxHeight
}

function scatterSand(point: Point, previous: Point, count: number, lift: number) {
  for (let index = 0; index < count; index += 1) {
    addParticle({
      kind: 'sand', x: point.x + (Math.random() - .5) * 16, y: point.y + (Math.random() - .5) * 10,
      vx: (point.x - previous.x) * (4 + Math.random() * 3) + (Math.random() - .5) * 30,
      vy: Math.min(-18, (point.y - previous.y) * (4 + Math.random() * 2) - lift - Math.random() * 34),
      radius: .7 + Math.random() * 2.1, color: Math.random() > .5 ? '#f5c877' : '#bb773d',
      life: .65 + Math.random() * .65, maxLife: 1.3,
    })
  }
}

function interactSand(hand: Hand, now: number) {
  const sand = sandGeometry()
  const inSand = fingertips.map((i) => {
    const p = hand.points[i]
    const amount = (p.x - sand.left) / sand.width
    if (amount < 0 || amount > 1) return false
    return p.y > sandSurface(Math.round(amount * (sandColumnCount - 1))) + 4 && p.y < sand.bottom
  })
  if (!intentReady(hand, inSand.filter(Boolean).length >= 2 && !hand.pinch, now, 220)) return
  fingertips.forEach((landmarkIndex, finger) => {
    if (!inSand[finger]) return
    const point = hand.points[landmarkIndex]
    const previous = hand.previousPoints[landmarkIndex] ?? point
    const amount = (point.x - sand.left) / sand.width
    if (amount < 0 || amount > 1) return
    const column = clamp(Math.round(amount * (sandColumnCount - 1)), 0, sandColumnCount - 1)
    hand.contacts[finger] = true
    const movement = distance(point, previous)
    if (movement / hand.frameDelta < 30) return
    const lift = Math.max(0, previous.y - point.y)
    const removal = clamp(movement * .16 + lift * .25, 0, 7)
    for (let offset = -5; offset <= 5; offset += 1) {
      const target = column + offset
      if (target < 0 || target >= sandColumnCount) continue
      const weight = Math.exp(-(offset * offset) / 11)
      sandHeights[target] = Math.max(.025, sandHeights[target] - removal / sand.maxHeight * weight)
    }
    if (movement > 1.3) {
      scatterSand(point, previous, lowPowerDevice ? 2 : 3, lift * 2.2)
      playMaterialSound('sand', clamp((movement + lift) / 24, .18, 1.25), now)
    }
  })
}

function readHands(result: HandLandmarkerResult, now: number) {
  for (const [id, hand] of hands) if (now - hand.lastSeen > 200) hands.delete(id)
  const visible = new Set<string>()
  result.landmarks.forEach((landmarks, handIndex) => {
    const id = result.handedness[handIndex]?.[0]?.categoryName?.toLowerCase() || `hand-${handIndex}`
    let points = landmarks.map(screenPoint)
    const palmSpan = Math.max(32, distance(points[5], points[17]))
    const pinchRatio = distance(points[4], points[8]) / palmSpan
    const pinchPoint = { x: (points[4].x + points[8].x) * .5, y: (points[4].y + points[8].y) * .5 }
    let hand = hands.get(id)
    let justReleased = false
    if (!hand) {
      hand = {
        id, points, previousPoints: points, pinchPoint, pinch: pinchRatio < .38,
        contacts: Array(5).fill(false), slimeGrip: false, lastSeen: now,
        gripOffset: { x: 0, y: 0 }, intentSince: 0, gripSince: 0, frameDelta: .052,
      }
      hands.set(id, hand)
    } else {
      const wasPinching = hand.pinch
      hand.frameDelta = clamp((now - hand.lastSeen) / 1000, .016, .15)
      const smoothing = 1 - Math.exp(-22 * hand.frameDelta)
      const jumped = distance(points[0], hand.points[0]) > Math.max(width, height) * .22
      if (jumped) {
        hand.slimeGrip = false
        hand.intentSince = hand.gripSince = 0
        hand.points = points
      }
      points = points.map((p, i) => ({ x: hand!.points[i].x + (p.x - hand!.points[i].x) * smoothing, y: hand!.points[i].y + (p.y - hand!.points[i].y) * smoothing }))
      hand.previousPoints = hand.points
      hand.points = points
      hand.pinchPoint = { x: (points[4].x + points[8].x) / 2, y: (points[4].y + points[8].y) / 2 }
      hand.pinch = wasPinching ? pinchRatio < .62 : pinchRatio < .38
      hand.lastSeen = now
      justReleased = wasPinching && !hand.pinch
    }
    hand.contacts.fill(false)
    if (currentMode === 'soap') interactSoap(hand, now)
    else if (currentMode === 'slime') interactSlime(hand, now, justReleased)
    else interactSand(hand, now)
    visible.add(id)
  })

  for (const [id, hand] of hands) {
    if (!visible.has(id) && now - hand.lastSeen > 220) hands.delete(id)
  }
  const active = Array.from(hands.values()).some((hand) => hand.contacts.some(Boolean) || hand.slimeGrip)
  modeReadout.textContent = active ? `${currentMode.toUpperCase()} · TOUCH` : modeCopy[currentMode].readout
  setStatus(hands.size ? `손 ${hands.size}개 인식 중` : '손을 보여주세요', 'ready')
}

function updateTracking(now: number) {
  const interval = lowPowerDevice ? 70 : 52
  if (!cameraReady || !handLandmarker || video.readyState < 2 || video.currentTime === lastVideoTime || now - lastInferenceAt < interval) return
  lastInferenceAt = now
  lastVideoTime = video.currentTime
  try { readHands(handLandmarker.detectForVideo(video, now), now) } catch { /* Keep the latest stable material state. */ }
}

function roundedRectPath(x: number, y: number, boxWidth: number, boxHeight: number, radius: number) {
  const path = new Path2D()
  path.roundRect(x, y, boxWidth, boxHeight, radius)
  return path
}

function drawSoap() {
  const box = soapGeometry()
  const shape = roundedRectPath(box.x, box.y, box.width, box.height, 24)
  context.save()
  context.shadowColor = 'rgba(46,13,32,.4)'
  context.shadowBlur = 20
  context.shadowOffsetY = 12
  const gradient = context.createLinearGradient(box.x, box.y, box.x + box.width, box.y + box.height)
  gradient.addColorStop(0, '#fff4f8')
  gradient.addColorStop(.35, '#ffd0e0')
  gradient.addColorStop(1, '#c56e96')
  context.fillStyle = gradient
  context.fill(shape)
  context.shadowColor = 'transparent'
  context.strokeStyle = 'rgba(255,255,255,.55)'
  context.lineWidth = 1.5
  context.stroke(shape)
  context.restore()
}

function updateSlime(delta: number) {
  for (let index = 0; index < slimePointCount; index += 1) {
    const previous = slimeRadii[(index - 1 + slimePointCount) % slimePointCount]
    const next = slimeRadii[(index + 1) % slimePointCount]
    const neighborTarget = (previous + next) * .5
    slimeVelocity[index] += (slimeRestRadius(index) - slimeRadii[index]) * 4.8 * delta
    slimeVelocity[index] += (neighborTarget - slimeRadii[index]) * 7.5 * delta
    slimeVelocity[index] *= Math.pow(.78, delta * 60)
    slimeRadii[index] = clamp(slimeRadii[index] + slimeVelocity[index], .42, 2.2)
  }
}

function slimePath() {
  const blob = slimeGeometry()
  const points = Array.from({ length: slimePointCount }, (_, index) => {
    const angle = index / slimePointCount * Math.PI * 2
    const radius = blob.radius * slimeRadii[index]
    return { x: blob.x + Math.cos(angle) * radius, y: blob.y + Math.sin(angle) * radius }
  })
  const path = new Path2D()
  const firstMid = { x: (points[0].x + points[1].x) * .5, y: (points[0].y + points[1].y) * .5 }
  path.moveTo(firstMid.x, firstMid.y)
  for (let index = 1; index <= points.length; index += 1) {
    const point = points[index % points.length]
    const next = points[(index + 1) % points.length]
    path.quadraticCurveTo(point.x, point.y, (point.x + next.x) * .5, (point.y + next.y) * .5)
  }
  path.closePath()
  return path
}

function drawSlime(now: number) {
  const blob = slimeGeometry()
  const path = slimePath()
  context.save()
  context.shadowColor = 'rgba(73, 255, 192, .35)'
  context.shadowBlur = 34
  const gradient = context.createRadialGradient(blob.x - blob.radius * .35, blob.y - blob.radius * .45, 4, blob.x, blob.y, blob.radius * 1.45)
  gradient.addColorStop(0, 'rgba(237,255,249,.94)')
  gradient.addColorStop(.18, 'rgba(136,255,216,.9)')
  gradient.addColorStop(.65, 'rgba(79,210,178,.82)')
  gradient.addColorStop(1, 'rgba(73,123,148,.78)')
  context.fillStyle = gradient
  context.fill(path)
  context.shadowColor = 'transparent'
  context.strokeStyle = 'rgba(224,255,246,.7)'
  context.lineWidth = 2
  context.stroke(path)
  context.clip(path)
  context.fillStyle = 'rgba(255,255,255,.17)'
  context.beginPath(); context.ellipse(blob.x - blob.radius * .28, blob.y - blob.radius * .35, blob.radius * .26, blob.radius * .12, -.55, 0, Math.PI * 2); context.fill()
  for (let ring = 0; ring < 5; ring += 1) {
    const angle = now * .0004 + ring * 1.7
    const x = blob.x + Math.cos(angle) * blob.radius * (.2 + ring * .1)
    const y = blob.y + Math.sin(angle * 1.2) * blob.radius * .42
    context.strokeStyle = `rgba(240,255,250,${.2 + ring * .025})`
    context.lineWidth = 1.2
    context.beginPath(); context.arc(x, y, 5 + ring * 2.3, 0, Math.PI * 2); context.stroke()
  }
  context.restore()
}

function updateSand(delta: number) {
  const next = new Float32Array(sandHeights)
  for (let index = 1; index < sandColumnCount - 1; index += 1) {
    const average = (sandHeights[index - 1] + sandHeights[index + 1]) * .5
    next[index] += (average - sandHeights[index]) * Math.min(.07, delta * 1.8)
  }
  sandHeights.set(next)
}

function drawSand() {
  const sand = sandGeometry()
  context.save()
  const shape = new Path2D()
  shape.moveTo(sand.left, sand.bottom + 28)
  for (let index = 0; index < sandColumnCount; index += 1) {
    const x = sand.left + index / (sandColumnCount - 1) * sand.width
    shape.lineTo(x, sandSurface(index))
  }
  shape.lineTo(sand.left + sand.width, sand.bottom + 28)
  shape.closePath()
  context.shadowColor = 'rgba(56, 26, 8, .42)'
  context.shadowBlur = 28
  context.shadowOffsetY = 15
  const gradient = context.createLinearGradient(0, sand.bottom - sand.maxHeight, 0, sand.bottom)
  gradient.addColorStop(0, '#ffe2a3')
  gradient.addColorStop(.4, '#dfaa61')
  gradient.addColorStop(1, '#8d5428')
  context.fillStyle = gradient
  context.fill(shape)
  context.shadowColor = 'transparent'
  context.clip(shape)
  sandSpeckles.forEach((speckle) => {
    const x = sand.left + speckle.x * sand.width
    const column = clamp(Math.round(speckle.x * (sandColumnCount - 1)), 0, sandColumnCount - 1)
    const surface = sandSurface(column)
    const y = surface + 5 + speckle.depth * Math.max(8, sand.bottom - surface)
    context.fillStyle = speckle.shade > .5 ? 'rgba(255,232,174,.62)' : 'rgba(112,63,29,.35)'
    context.beginPath(); context.arc(x, y, speckle.size, 0, Math.PI * 2); context.fill()
  })
  context.restore()
  context.strokeStyle = 'rgba(255,234,187,.52)'
  context.lineWidth = 1.5
  context.stroke(shape)
}

function updateParticles(delta: number) {
  particles.forEach((particle) => {
    const gravity = particle.kind === 'slime' ? -7 : particle.kind === 'sand' ? 340 : 235
    particle.vy += gravity * delta
    particle.vx *= Math.pow(particle.kind === 'sand' ? .985 : .975, delta * 60)
    particle.x += particle.vx * delta
    particle.y += particle.vy * delta
    particle.life -= delta
  })
  particles = particles.filter((particle) => particle.life > 0)
}

function drawParticles() {
  context.save()
  particles.forEach((particle) => {
    context.globalAlpha = clamp(particle.life / particle.maxLife * 1.7, 0, 1)
    context.fillStyle = particle.color
    if (particle.kind === 'slime') {
      context.strokeStyle = particle.color
      context.lineWidth = 1.3
      context.beginPath(); context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2); context.stroke()
    } else if (particle.kind === 'soap') {
      context.save(); context.translate(particle.x, particle.y); context.rotate(particle.x * .04)
      context.fillRect(-particle.radius, -particle.radius * .35, particle.radius * 2, particle.radius * .7); context.restore()
    } else {
      context.beginPath(); context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2); context.fill()
    }
  })
  context.restore()
}

function drawHands() {
  const color = currentMode === 'soap' ? '#ffd0e2' : currentMode === 'slime' ? '#afffe2' : '#ffd590'
  for (const hand of hands.values()) {
    context.save()
    fingertips.forEach((landmarkIndex, finger) => {
      const point = hand.points[landmarkIndex]
      context.fillStyle = hand.contacts[finger] ? color : 'rgba(255,255,255,.88)'
      context.shadowColor = color
      context.shadowBlur = 0
      context.beginPath(); context.arc(point.x, point.y, hand.contacts[finger] ? 4 : 2, 0, Math.PI * 2); context.fill()
    })
    if (hand.pinch && currentMode === 'slime') {
      context.strokeStyle = hand.slimeGrip ? color : 'rgba(255,255,255,.7)'
      context.lineWidth = hand.slimeGrip ? 3 : 1.5
      context.beginPath(); context.arc(hand.pinchPoint.x, hand.pinchPoint.y, hand.slimeGrip ? 18 : 13, 0, Math.PI * 2); context.stroke()
    }
    context.restore()
  }
}

function render(now: number) {
  const delta = Math.min(.033, Math.max(.001, (now - lastFrameAt) / 1000))
  lastFrameAt = now
  if (!document.hidden) {
    updateTracking(now)
    updateBodies(delta, now)
    if (currentMode === 'slime') updateSlime(delta)
    if (currentMode === 'sand') updateSand(delta)
    updateParticles(delta)
    context.clearRect(0, 0, width, height)
    const contacts: Point[] = []
    hands.forEach((hand) => fingertips.forEach((landmark, finger) => {
      if (hand.contacts[finger]) contacts.push(hand.points[landmark])
    }))
    const painted = materials?.paint(context, {
      mode: currentMode, width, height, scale: dpr, time: now,
      box: soapGeometry(), blob: slimeGeometry(), sand: sandGeometry(),
      radii: slimeRadii, heights: sandHeights, contacts,
    })
    if (!painted) {
      if (currentMode === 'soap') drawSoap()
      else if (currentMode === 'slime') drawSlime(now)
      else drawSand()
    }
    drawParticles()
    drawHands()
  }
  requestAnimationFrame(render)
}

function selectMode(mode: Mode) {
  if (mode === currentMode) return
  currentMode = mode
  root.dataset.mode = mode
  clearGestures()
  soapBody.vx = soapBody.vy = slimeBody.vx = slimeBody.vy = 0
  materialTabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.mode === mode)))
  modeReadout.textContent = modeCopy[mode].readout
  gestureGuide.textContent = modeCopy[mode].guide
  showAction(modeCopy[mode].ready)
  initAudio()
}

materialTabs.forEach((tab) => tab.addEventListener('click', () => selectMode(tab.dataset.mode as Mode)))
startButton.addEventListener('click', startExperience)
retryButton.addEventListener('click', startExperience)
resetButton.addEventListener('click', () => resetCurrent())
soundButton.addEventListener('click', () => {
  soundEnabled = !soundEnabled
  soundButton.textContent = soundEnabled ? '소리 켜짐' : '소리 꺼짐'
  soundButton.setAttribute('aria-pressed', String(soundEnabled))
  if (soundEnabled) {
    initAudio()
    playTone(260, .1, .025, 160)
  }
})
window.addEventListener('resize', resize)
document.addEventListener('visibilitychange', () => {
  const stream = video.srcObject instanceof MediaStream ? video.srcObject : null
  stream?.getVideoTracks().forEach((track) => { track.enabled = !document.hidden })
  if (document.hidden) video.pause()
  else if (cameraReady) void video.play()
  clearGestures()
  hands.clear()
  soapBody.vx = soapBody.vy = slimeBody.vx = slimeBody.vy = 0
})
window.addEventListener('pagehide', () => {
  const stream = video.srcObject instanceof MediaStream ? video.srcObject : null
  stream?.getTracks().forEach((track) => track.stop())
  handLandmarker?.close()
  materials?.dispose()
  void audioContext?.close()
})

resize()
resetSlime()
resetSand()
requestAnimationFrame(render)
