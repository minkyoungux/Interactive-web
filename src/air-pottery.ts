import './air-pottery.css'
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

type Point = { x: number; y: number }
type Grip = { slice: number; side: -1 | 1; lastPoint: Point }
type Hand = {
  id: string
  points: Point[]
  previousTips: Point[]
  pinchPoint: Point
  pinch: boolean
  grip: Grip | null
  contacts: boolean[]
  lastSeen: number
}
type Fingerprint = {
  y: number
  angle: number
  width: number
  depth: number
  createdAt: number
}
type ClayParticle = { x: number; y: number; vx: number; vy: number; radius: number; life: number; maxLife: number }

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <main class="pottery-app">
    <video class="pottery-camera" id="camera" playsinline muted aria-label="실시간 카메라 화면"></video>
    <canvas class="pottery-canvas" id="pottery-canvas" aria-label="손으로 빚는 공중 점토"></canvas>
    <div class="camera-grade" aria-hidden="true"></div>

    <header class="pottery-topbar">
      <a class="pottery-brand" href="${import.meta.env.BASE_URL}" aria-label="인터랙티브 랩으로 돌아가기">
        <span class="pottery-mark" aria-hidden="true"></span>
        <strong>공중 도예</strong>
        <span class="example-number">10</span>
      </a>
      <div class="tracking-status" id="tracking-status" role="status" aria-live="polite">
        <i aria-hidden="true"></i><span>Camera waiting</span>
      </div>
    </header>

    <div class="gesture-guide" aria-label="손동작 안내">
      <span>☝ 손끝으로 눌러 빚기</span>
      <span>🤏 집어서 위아래로 늘리기</span>
      <span>🖐 열 손가락 자국 남기기</span>
    </div>

    <aside class="pottery-tools" aria-label="도예 도구">
      <p class="mode-readout" id="mode-readout">WAITING FOR HANDS</p>
      <p class="mark-count" id="mark-count">FINGERPRINTS · 0</p>
      <button class="reset-button" id="reset-button" type="button">새 점토</button>
    </aside>
    <p class="action-toast" id="action-toast" role="status" aria-live="polite">CLAY READY</p>

    <section class="welcome" id="welcome" aria-labelledby="welcome-title">
      <div class="welcome-card">
        <p class="welcome-kicker">EXPERIMENT 10 · HAND-SCULPTED DIGITAL CLAY</p>
        <h1 id="welcome-title">Air Pottery<span>공중 도예</span></h1>
        <p class="welcome-copy">회전하는 점토 표면을 손끝으로 눌러 형태를 만들고,<br>엄지와 검지로 집은 채 위아래로 움직여 길이를 바꿔보세요.</p>
        <button class="start-button" id="start-button" type="button">작업실 열기</button>
        <p class="privacy-note">카메라 영상과 손 정보는 기기 밖으로 전송되거나 저장되지 않아요.</p>
      </div>
    </section>

    <section class="error-panel" id="error-panel" hidden aria-live="assertive">
      <div>
        <h2>작업실을 열 수 없어요</h2>
        <p id="error-copy">브라우저의 카메라 권한을 확인하고 다시 시도해 주세요.</p>
        <button class="retry-button" id="retry-button" type="button">다시 시도</button>
      </div>
    </section>
  </main>
`

const video = document.querySelector<HTMLVideoElement>('#camera')!
const canvas = document.querySelector<HTMLCanvasElement>('#pottery-canvas')!
const context = canvas.getContext('2d')!
const welcome = document.querySelector<HTMLElement>('#welcome')!
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!
const retryButton = document.querySelector<HTMLButtonElement>('#retry-button')!
const resetButton = document.querySelector<HTMLButtonElement>('#reset-button')!
const errorPanel = document.querySelector<HTMLElement>('#error-panel')!
const errorCopy = document.querySelector<HTMLElement>('#error-copy')!
const trackingStatus = document.querySelector<HTMLElement>('#tracking-status')!
const trackingCopy = trackingStatus.querySelector<HTMLElement>('span')!
const modeReadout = document.querySelector<HTMLElement>('#mode-readout')!
const markCount = document.querySelector<HTMLElement>('#mark-count')!
const actionToast = document.querySelector<HTMLElement>('#action-toast')!

const SLICE_COUNT = 72
const fingertipIndexes = [4, 8, 12, 16, 20]
const lowPowerDevice = (navigator.hardwareConcurrency || 8) <= 4
const profile = new Float32Array(SLICE_COUNT)
const hands = new Map<string, Hand>()
const lastMarkAt = new Map<string, number>()
let fingerprints: Fingerprint[] = []
let particles: ClayParticle[] = []
let handLandmarker: HandLandmarker | null = null
let cameraReady = false
let width = innerWidth
let height = innerHeight
let dpr = 1
let centerX = width * .5
let baseY = height * .77
let baseRadius = 140
let clayHeight = 380
let defaultClayHeight = clayHeight
let wheelRotation = 0
let lastFrameAt = performance.now()
let lastInferenceAt = 0
let lastVideoTime = -1
let toastTimer = 0
let lastMode = ''

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function distance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function mix(first: number, second: number, amount: number) {
  return first + (second - first) * amount
}

function initialRadiusAt(amount: number) {
  if (amount < .08) return mix(.5, .64, amount / .08)
  if (amount < .3) return mix(.64, .72, (amount - .08) / .22)
  if (amount < .55) return mix(.72, 1.02, (amount - .3) / .25)
  if (amount < .82) return mix(1.02, .94, (amount - .55) / .27)
  return mix(.94, .84, (amount - .82) / .18)
}

function resetClay(showMessage = true) {
  for (let index = 0; index < SLICE_COUNT; index += 1) {
    const amount = index / (SLICE_COUNT - 1)
    profile[index] = initialRadiusAt(amount)
  }
  clayHeight = defaultClayHeight
  fingerprints = []
  particles = []
  lastMarkAt.clear()
  hands.forEach((hand) => { hand.grip = null })
  markCount.textContent = 'FINGERPRINTS · 0'
  if (showMessage) showAction('FRESH CLAY')
}

function resize() {
  const previousBaseRadius = baseRadius
  width = innerWidth
  height = innerHeight
  centerX = width * .5
  baseY = height * .77
  baseRadius = clamp(Math.min(width * .19, height * .22), 82, 190)
  defaultClayHeight = clamp(height * .46, 260, 470)
  if (!previousBaseRadius) clayHeight = defaultClayHeight
  else clayHeight = clamp(clayHeight * baseRadius / previousBaseRadius, height * .29, height * .61)
  const budget = lowPowerDevice ? 2_400_000 : 4_200_000
  dpr = Math.min(devicePixelRatio || 1, 2, Math.max(1, Math.sqrt(budget / Math.max(1, width * height))))
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
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
  startButton.textContent = '점토 준비 중…'
  errorPanel.hidden = true
  setStatus('Loading hand tracking', 'loading')
  try {
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
    setStatus('MediaPipe · show your hands', 'ready')
    showAction('CLAY READY')
  } catch (error) {
    const denied = error instanceof DOMException && error.name === 'NotAllowedError'
    errorCopy.textContent = denied
      ? '카메라 권한이 차단되었습니다. 주소창의 카메라 설정에서 권한을 허용해 주세요.'
      : '카메라 또는 손 인식 모델을 준비하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.'
    errorPanel.hidden = false
    setStatus('Camera unavailable', 'error')
  } finally {
    startButton.disabled = false
    startButton.textContent = '작업실 열기'
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

function topY() {
  return baseY - clayHeight
}

function profileIndexAt(screenY: number) {
  return clamp(Math.round((screenY - topY()) / clayHeight * (SLICE_COUNT - 1)), 0, SLICE_COUNT - 1)
}

function surfaceRadiusAt(index: number) {
  return profile[clamp(index, 0, SLICE_COUNT - 1)] * baseRadius
}

function deformProfile(index: number, target: number, strength: number, spread = 4) {
  for (let offset = -spread; offset <= spread; offset += 1) {
    const slice = index + offset
    if (slice < 0 || slice >= SLICE_COUNT) continue
    const weight = Math.exp(-(offset * offset) / Math.max(1, spread * spread * .55))
    profile[slice] = clamp(mix(profile[slice], target, strength * weight), .25, 1.38)
  }
}

function addFingerprint(handId: string, finger: number, slice: number, side: -1 | 1, depth: number, now: number) {
  const key = `${handId}-${finger}`
  const previous = lastMarkAt.get(key) ?? 0
  if (now - previous < 82) return
  lastMarkAt.set(key, now)
  const normalizedY = slice / (SLICE_COUNT - 1)
  const angle = side * (.68 + Math.random() * .17) - wheelRotation
  fingerprints.push({
    y: normalizedY,
    angle,
    width: 5 + Math.random() * 4,
    depth: clamp(depth, .25, 1),
    createdAt: now,
  })
  if (fingerprints.length > (lowPowerDevice ? 90 : 150)) fingerprints.splice(0, fingerprints.length - (lowPowerDevice ? 90 : 150))
  markCount.textContent = `FINGERPRINTS · ${fingerprints.length}`

  if (Math.random() > .54) {
    const x = centerX + side * surfaceRadiusAt(slice)
    const y = topY() + normalizedY * clayHeight
    particles.push({
      x, y, vx: side * (18 + Math.random() * 34), vy: -12 - Math.random() * 30,
      radius: 1.2 + Math.random() * 2.3, life: .45 + Math.random() * .35, maxLife: .8,
    })
    if (particles.length > 70) particles.splice(0, particles.length - 70)
  }
}

function pointTouchesClay(point: Point) {
  const upper = topY()
  if (point.y < upper - 22 || point.y > baseY + 22) return null
  const slice = profileIndexAt(point.y)
  const radius = surfaceRadiusAt(slice)
  const radialDistance = Math.abs(point.x - centerX)
  const band = clamp(baseRadius * .28, 28, 52)
  if (radialDistance > radius + band || radialDistance < Math.max(0, radius - band * 1.8)) return null
  return {
    slice,
    radius,
    radialDistance,
    side: (point.x < centerX ? -1 : 1) as -1 | 1,
    depth: clamp((radius + band - radialDistance) / (band * 1.7), 0, 1),
  }
}

function startGrip(hand: Hand) {
  const touch = pointTouchesClay(hand.pinchPoint)
  if (!touch) return
  hand.grip = { slice: touch.slice, side: touch.side, lastPoint: { ...hand.pinchPoint } }
  showAction('PINCH · CLAY CAUGHT')
}

function updateGrip(hand: Hand, now: number) {
  const grip = hand.grip
  if (!grip) return
  const point = hand.pinchPoint
  const horizontal = (point.x - grip.lastPoint.x) * grip.side
  const vertical = point.y - grip.lastPoint.y
  if (Math.abs(horizontal) > .15) {
    const target = profile[grip.slice] + horizontal / baseRadius * .72
    deformProfile(grip.slice, target, .34, 6)
  }
  if (Math.abs(vertical) > .15) {
    clayHeight = clamp(clayHeight - vertical * 1.25, height * .29, height * .61)
  }
  grip.slice = profileIndexAt(point.y)
  grip.lastPoint = { ...point }
  addFingerprint(hand.id, 8, grip.slice, grip.side, clamp(Math.hypot(horizontal, vertical) / 12, .35, 1), now)
}

function sculptWithFingers(hand: Hand, now: number) {
  hand.contacts.fill(false)
  fingertipIndexes.forEach((landmarkIndex, finger) => {
    if (hand.pinch && finger < 2) return
    const point = hand.points[landmarkIndex]
    const touch = pointTouchesClay(point)
    if (!touch) return
    hand.contacts[finger] = true
    const target = clamp(touch.radialDistance / baseRadius, .25, 1.38)
    if (target < profile[touch.slice]) {
      const movement = distance(point, hand.previousTips[finger] ?? point)
      deformProfile(touch.slice, target, .08 + Math.min(.08, movement * .006), finger === 0 ? 5 : 4)
    }
    addFingerprint(hand.id, landmarkIndex, touch.slice, touch.side, touch.depth, now)
  })
}

function readHands(result: HandLandmarkerResult, now: number) {
  const visible = new Set<string>()
  result.landmarks.forEach((landmarks, handIndex) => {
    const id = result.handedness[handIndex]?.[0]?.categoryName?.toLowerCase() || `hand-${handIndex}`
    const points = landmarks.map(screenPoint)
    const tips = fingertipIndexes.map((index) => points[index])
    const palmSpan = Math.max(32, distance(points[5], points[17]))
    const pinchRatio = distance(points[4], points[8]) / palmSpan
    const pinchPoint = { x: (points[4].x + points[8].x) * .5, y: (points[4].y + points[8].y) * .5 }
    let hand = hands.get(id)
    if (!hand) {
      hand = {
        id, points, previousTips: tips, pinchPoint,
        pinch: pinchRatio < .38, grip: null, contacts: Array(5).fill(false), lastSeen: now,
      }
      hands.set(id, hand)
      if (hand.pinch) startGrip(hand)
    } else {
      const wasPinching = hand.pinch
      hand.previousTips = fingertipIndexes.map((index) => hand!.points[index])
      hand.points = points
      hand.pinchPoint = pinchPoint
      hand.pinch = wasPinching ? pinchRatio < .56 : pinchRatio < .38
      hand.lastSeen = now
      if (!wasPinching && hand.pinch) startGrip(hand)
      if (wasPinching && !hand.pinch) hand.grip = null
    }
    if (hand.pinch && hand.grip) updateGrip(hand, now)
    sculptWithFingers(hand, now)
    visible.add(id)
  })

  for (const [id, hand] of hands) {
    if (!visible.has(id) && now - hand.lastSeen > 220) hands.delete(id)
  }

  const gripping = Array.from(hands.values()).some((hand) => hand.grip)
  const touching = Array.from(hands.values()).some((hand) => hand.contacts.some(Boolean))
  const mode = gripping ? 'PINCH · STRETCHING' : touching ? 'TOUCH · SCULPTING' : hands.size ? 'HANDS READY' : 'WAITING FOR HANDS'
  if (mode !== lastMode) {
    lastMode = mode
    modeReadout.textContent = mode
  }
  setStatus(hands.size ? `MediaPipe · ${hands.size} hand${hands.size > 1 ? 's' : ''}` : 'MediaPipe · show your hands', 'ready')
}

function updateTracking(now: number) {
  const interval = lowPowerDevice ? 68 : 52
  if (!cameraReady || !handLandmarker || video.readyState < 2 || video.currentTime === lastVideoTime || now - lastInferenceAt < interval) return
  lastInferenceAt = now
  lastVideoTime = video.currentTime
  try { readHands(handLandmarker.detectForVideo(video, now), now) } catch { /* Keep the last stable sculpture state. */ }
}

function clayPath() {
  const path = new Path2D()
  for (let index = 0; index < SLICE_COUNT; index += 1) {
    const y = topY() + index / (SLICE_COUNT - 1) * clayHeight
    const x = centerX - surfaceRadiusAt(index)
    if (index === 0) path.moveTo(x, y)
    else path.lineTo(x, y)
  }
  for (let index = SLICE_COUNT - 1; index >= 0; index -= 1) {
    const y = topY() + index / (SLICE_COUNT - 1) * clayHeight
    path.lineTo(centerX + surfaceRadiusAt(index), y)
  }
  path.closePath()
  return path
}

function drawWheel(now: number) {
  const baseWidth = surfaceRadiusAt(SLICE_COUNT - 1)
  context.save()
  context.fillStyle = 'rgba(8, 5, 4, .42)'
  context.beginPath(); context.ellipse(centerX, baseY + 25, baseWidth * 1.42, 29, 0, 0, Math.PI * 2); context.fill()

  const platform = context.createLinearGradient(centerX - baseWidth, 0, centerX + baseWidth, 0)
  platform.addColorStop(0, '#49322a')
  platform.addColorStop(.25, '#a77b66')
  platform.addColorStop(.53, '#e0b69d')
  platform.addColorStop(.78, '#815845')
  platform.addColorStop(1, '#36251f')
  context.fillStyle = platform
  context.beginPath(); context.ellipse(centerX, baseY + 9, baseWidth * 1.35, 23, 0, 0, Math.PI * 2); context.fill()
  context.fillStyle = '#473027'
  context.fillRect(centerX - baseWidth * 1.35, baseY + 8, baseWidth * 2.7, 18)
  context.beginPath(); context.ellipse(centerX, baseY + 26, baseWidth * 1.35, 19, 0, 0, Math.PI * 2); context.fill()
  context.strokeStyle = 'rgba(255,235,215,.26)'
  context.lineWidth = 1.4
  for (let ring = .45; ring < 1.25; ring += .22) {
    context.beginPath(); context.ellipse(centerX, baseY + 8, baseWidth * ring, 7 * ring, now * .0002, 0, Math.PI * 2); context.stroke()
  }
  context.restore()
}

function drawFingerprints(now: number) {
  for (const mark of fingerprints) {
    const slice = clamp(Math.round(mark.y * (SLICE_COUNT - 1)), 0, SLICE_COUNT - 1)
    const radius = surfaceRadiusAt(slice)
    const angle = mark.angle + wheelRotation
    const facing = Math.cos(angle)
    if (facing <= .04) continue
    const x = centerX + Math.sin(angle) * radius * .9
    const y = topY() + mark.y * clayHeight
    const alpha = clamp(facing, 0, 1) * (.25 + mark.depth * .45)
    context.save()
    context.translate(x, y)
    context.scale(.36 + facing * .64, 1)
    context.strokeStyle = `rgba(83, 38, 19, ${alpha})`
    context.lineWidth = 1.2 + mark.depth * 1.7
    context.beginPath(); context.ellipse(0, 0, mark.width, mark.width * .5, 0, .15, Math.PI * 1.85); context.stroke()
    context.strokeStyle = `rgba(255, 206, 166, ${alpha * .48})`
    context.lineWidth = .8
    context.beginPath(); context.ellipse(0, -1.5, mark.width * .82, mark.width * .34, 0, .1, Math.PI * 1.8); context.stroke()
    if (now - mark.createdAt < 180) {
      context.fillStyle = `rgba(255, 222, 191, ${1 - (now - mark.createdAt) / 180})`
      context.beginPath(); context.arc(0, 0, 2.4, 0, Math.PI * 2); context.fill()
    }
    context.restore()
  }
}

function drawClay(now: number) {
  const shape = clayPath()
  const upper = topY()
  const widest = Math.max(...profile) * baseRadius
  context.save()
  context.shadowColor = 'rgba(37, 14, 7, .48)'
  context.shadowBlur = 25
  context.shadowOffsetY = 13
  const clayGradient = context.createLinearGradient(centerX - widest, 0, centerX + widest, 0)
  clayGradient.addColorStop(0, '#6d321d')
  clayGradient.addColorStop(.16, '#b86439')
  clayGradient.addColorStop(.42, '#e79b68')
  clayGradient.addColorStop(.58, '#f4ba87')
  clayGradient.addColorStop(.79, '#a6502e')
  clayGradient.addColorStop(1, '#552515')
  context.fillStyle = clayGradient
  context.fill(shape)
  context.shadowColor = 'transparent'
  context.clip(shape)

  context.strokeStyle = 'rgba(91, 39, 19, .19)'
  context.lineWidth = 1
  const bandOffset = (wheelRotation * 13) % 8
  for (let y = upper + 8 + bandOffset; y < baseY; y += 8) {
    const slice = profileIndexAt(y)
    const radius = surfaceRadiusAt(slice)
    context.beginPath()
    context.ellipse(centerX, y, radius * .985, 2.4, 0, 0, Math.PI * 2)
    context.stroke()
  }

  const highlight = context.createLinearGradient(centerX - widest * .8, 0, centerX + widest * .2, 0)
  highlight.addColorStop(0, 'rgba(255,226,195,0)')
  highlight.addColorStop(.55, 'rgba(255,226,195,.26)')
  highlight.addColorStop(1, 'rgba(255,226,195,0)')
  context.fillStyle = highlight
  context.fillRect(centerX - widest * .7, upper, widest * .8, clayHeight)
  drawFingerprints(now)
  context.restore()

  context.save()
  context.strokeStyle = 'rgba(255,207,169,.42)'
  context.lineWidth = 1.5
  context.stroke(shape)
  const lipRadius = surfaceRadiusAt(0)
  context.fillStyle = '#4a2114'
  context.beginPath(); context.ellipse(centerX, upper + 1, lipRadius, clamp(lipRadius * .18, 9, 20), 0, 0, Math.PI * 2); context.fill()
  const inside = context.createRadialGradient(centerX, upper + 4, 2, centerX, upper + 3, lipRadius)
  inside.addColorStop(0, '#1f100c')
  inside.addColorStop(.7, '#5b2c1c')
  inside.addColorStop(1, '#d78655')
  context.fillStyle = inside
  context.beginPath(); context.ellipse(centerX, upper + 1, lipRadius * .78, clamp(lipRadius * .115, 6, 14), 0, 0, Math.PI * 2); context.fill()
  context.strokeStyle = 'rgba(255,211,177,.56)'
  context.lineWidth = 2.2
  context.beginPath(); context.ellipse(centerX, upper + 1, lipRadius, clamp(lipRadius * .18, 9, 20), 0, 0, Math.PI * 2); context.stroke()
  context.restore()
}

function updateParticles(delta: number) {
  particles.forEach((particle) => {
    particle.vy += 170 * delta
    particle.x += particle.vx * delta
    particle.y += particle.vy * delta
    particle.life -= delta
  })
  particles = particles.filter((particle) => particle.life > 0)
}

function drawParticles() {
  context.save()
  context.fillStyle = '#b9663f'
  particles.forEach((particle) => {
    context.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1)
    context.beginPath(); context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2); context.fill()
  })
  context.restore()
}

function drawHands() {
  for (const hand of hands.values()) {
    context.save()
    fingertipIndexes.forEach((landmarkIndex, finger) => {
      const point = hand.points[landmarkIndex]
      const touching = hand.contacts[finger]
      context.fillStyle = touching ? '#ffc18f' : 'rgba(255,250,242,.9)'
      context.shadowColor = touching ? '#e87e42' : '#fff4e7'
      context.shadowBlur = touching ? 18 : 9
      context.beginPath(); context.arc(point.x, point.y, touching ? 6.5 : 3.5, 0, Math.PI * 2); context.fill()
    })
    if (hand.pinch) {
      context.strokeStyle = hand.grip ? '#ffbd86' : 'rgba(255,250,242,.78)'
      context.lineWidth = hand.grip ? 3 : 1.5
      context.shadowColor = '#e87e42'
      context.shadowBlur = hand.grip ? 20 : 10
      context.beginPath(); context.arc(hand.pinchPoint.x, hand.pinchPoint.y, hand.grip ? 18 : 13, 0, Math.PI * 2); context.stroke()
    }
    context.restore()
  }
}

function render(now: number) {
  const delta = Math.min(.033, Math.max(.001, (now - lastFrameAt) / 1000))
  lastFrameAt = now
  if (!document.hidden) {
    updateTracking(now)
    wheelRotation = (wheelRotation + delta * .72) % (Math.PI * 2)
    updateParticles(delta)
    context.clearRect(0, 0, width, height)
    drawWheel(now)
    drawClay(now)
    drawParticles()
    drawHands()
  }
  requestAnimationFrame(render)
}

startButton.addEventListener('click', startExperience)
retryButton.addEventListener('click', startExperience)
resetButton.addEventListener('click', () => resetClay())
window.addEventListener('resize', resize)
document.addEventListener('visibilitychange', () => {
  const stream = video.srcObject instanceof MediaStream ? video.srcObject : null
  stream?.getVideoTracks().forEach((track) => { track.enabled = !document.hidden })
  if (document.hidden) video.pause()
  else if (cameraReady) void video.play()
})
window.addEventListener('pagehide', () => {
  const stream = video.srcObject instanceof MediaStream ? video.srcObject : null
  stream?.getTracks().forEach((track) => track.stop())
  handLandmarker?.close()
})

resize()
resetClay(false)
requestAnimationFrame(render)
