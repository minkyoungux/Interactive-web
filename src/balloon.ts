import './balloon.css'
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

type Point = { x: number; y: number }
type Character = 'cat' | 'bear' | 'bunny' | 'frog' | 'duck' | 'alien'
type BalloonKind = 'normal' | 'bomb' | 'water' | 'slime' | 'gold' | 'ghost'
type Balloon = {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  color: string
  accent: string
  character: Character
  kind: BalloonKind
  phase: number
  buoyancy: number
  stringLength: number
  grabLength: number
  heldBy: string | null
  slimeHits: number
  squashUntil: number
}
type Hand = {
  id: string
  points: Point[]
  indexTip: Point
  previousIndex: Point
  pinchPoint: Point
  pinch: boolean
  lastSeen: number
  lastPopAt: number
  lastGrabAt: number
  lastHitBalloonId: number | null
  suppressPopsUntil: number
}
type SnapState = { pinched: boolean; primedAt: number; lastGap: number; lastSeen: number; cooldownUntil: number }
type FragmentKind = 'rubber' | 'water' | 'slime' | 'spark' | 'mist'
type Fragment = { x: number; y: number; vx: number; vy: number; angle: number; spin: number; size: number; color: string; life: number; maxLife: number; kind: FragmentKind }
type Confetti = Fragment & { shape: 'rect' | 'circle' }
type Puff = { x: number; y: number; radius: number; life: number; maxLife: number; color: string }
type PendingPop = { id: number; at: number }

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <main class="balloon-app">
    <video class="balloon-camera" id="camera" playsinline muted aria-label="실시간 카메라 화면"></video>
    <canvas class="balloon-canvas" id="balloon-canvas" aria-label="손으로 만지는 캐릭터 풍선"></canvas>
    <div class="camera-shade" aria-hidden="true"></div>

    <header class="balloon-topbar">
      <a class="balloon-brand" href="${import.meta.env.BASE_URL}" aria-label="인터랙티브 랩으로 돌아가기">
        <span class="balloon-logo" aria-hidden="true"></span>
        <strong>Balloon</strong>
        <span class="example-number">09</span>
      </a>
      <div class="tracking-status" id="tracking-status" role="status" aria-live="polite">
        <i aria-hidden="true"></i><span>Camera waiting</span>
      </div>
    </header>

    <div class="gesture-guide" aria-label="손동작 안내">
      <span>☝ 검지로 풍선 터뜨리기</span>
      <span>🤏 핀치로 여러 끈 모으기</span>
      <span>🫰 스냅으로 풍선 밀기</span>
    </div>
    <p class="action-toast" id="action-toast" role="status" aria-live="polite">SNAP · PUSH!</p>

    <section class="welcome" id="welcome" aria-labelledby="welcome-title">
      <div class="welcome-card">
        <p class="welcome-kicker">EXPERIMENT 09 · HAND-TRACKED BALLOON PHYSICS</p>
        <h1 id="welcome-title">Balloon</h1>
        <p class="welcome-copy">핀치를 유지한 채 여러 끈을 훑어 나만의 풍선 다발을 만들어보세요.<br>검지로 특수 풍선을 터뜨리고, 스냅으로 서로 밀어낼 수도 있어요.</p>
        <div class="special-guide" aria-label="특수 풍선 안내">
          <span>💣 연쇄 폭발</span><span>💧 물보라</span><span>🟢 두 번 터치</span><span>⭐ 골드 파티</span><span>👻 손끝 피하기</span>
        </div>
        <button class="start-button" id="start-button" type="button">카메라 켜기</button>
        <p class="privacy-note">카메라 영상은 기기 밖으로 전송되거나 저장되지 않아요.</p>
      </div>
    </section>

    <section class="error-panel" id="error-panel" hidden aria-live="assertive">
      <div>
        <h2>카메라를 열 수 없어요</h2>
        <p id="error-copy">브라우저의 카메라 권한을 확인하고 다시 시도해 주세요.</p>
        <button class="retry-button" id="retry-button" type="button">다시 시도</button>
      </div>
    </section>
  </main>
`

const video = document.querySelector<HTMLVideoElement>('#camera')!
const canvas = document.querySelector<HTMLCanvasElement>('#balloon-canvas')!
const context = canvas.getContext('2d')!
const welcome = document.querySelector<HTMLElement>('#welcome')!
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!
const retryButton = document.querySelector<HTMLButtonElement>('#retry-button')!
const errorPanel = document.querySelector<HTMLElement>('#error-panel')!
const errorCopy = document.querySelector<HTMLElement>('#error-copy')!
const trackingStatus = document.querySelector<HTMLElement>('#tracking-status')!
const trackingCopy = trackingStatus.querySelector<HTMLElement>('span')!
const actionToast = document.querySelector<HTMLElement>('#action-toast')!

const palette = [
  ['#ff5795', '#a51156'], ['#ff8a3d', '#b83d18'], ['#ffd33d', '#a87000'],
  ['#56dfa1', '#087652'], ['#45cce8', '#08758a'], ['#6989ff', '#263eaa'],
  ['#a66cff', '#5d24a4'], ['#f578e7', '#963d8c'], ['#ff6b6b', '#a82737'],
] as const
const confettiColors = ['#ff4f91', '#ffd43b', '#5ef0b5', '#55d9ff', '#9f73ff', '#fff8d8']
const characters: Character[] = ['cat', 'bear', 'bunny', 'frog', 'duck', 'alien']
const specialColors: Record<Exclude<BalloonKind, 'normal'>, readonly [string, string]> = {
  bomb: ['#2b2937', '#ff4c67'],
  water: ['#49dfff', '#0879d8'],
  slime: ['#9cff46', '#27882c'],
  gold: ['#ffd84d', '#c16c00'],
  ghost: ['#f0ebff', '#8f78cc'],
}
const fingertipIndex = 8
const lowPowerDevice = (navigator.hardwareConcurrency || 8) <= 4
const maxBalloons = lowPowerDevice ? 12 : 18
const hands = new Map<string, Hand>()
const snapStates = new Map<string, SnapState>()
let balloons: Balloon[] = []
let fragments: Fragment[] = []
let confetti: Confetti[] = []
let puffs: Puff[] = []
let pendingPops: PendingPop[] = []
let handLandmarker: HandLandmarker | null = null
let cameraReady = false
let width = innerWidth
let height = innerHeight
let dpr = 1
let nextBalloonId = 1
let lastFrameAt = performance.now()
let lastInferenceAt = 0
let lastVideoTime = -1
let nextSpawnAt = 0
let actionToastTimer = 0
let audioContext: AudioContext | null = null

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function resize() {
  width = innerWidth
  height = innerHeight
  const budget = lowPowerDevice ? 2_400_000 : 4_200_000
  dpr = Math.min(devicePixelRatio || 1, 2, Math.max(1, Math.sqrt(budget / Math.max(1, width * height))))
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  balloons.forEach((balloon) => { balloon.x = clamp(balloon.x, balloon.radius, width - balloon.radius) })
}

function balloonHeight(balloon: Balloon) {
  return balloon.radius * 1.16
}

function neckPoint(balloon: Balloon): Point {
  return { x: balloon.x, y: balloon.y + balloonHeight(balloon) * .88 }
}

function looseTail(balloon: Balloon, time = performance.now()): Point {
  const neck = neckPoint(balloon)
  const offsetX = Math.sin(time * .0017 + balloon.phase) * Math.min(8, balloon.stringLength * .06)
  return {
    x: neck.x + offsetX,
    y: neck.y + Math.sqrt(Math.max(0, balloon.stringLength * balloon.stringLength - offsetX * offsetX)),
  }
}

function randomBalloonKind(): BalloonKind {
  const roll = Math.random()
  if (roll < .08) return 'bomb'
  if (roll < .16) return 'water'
  if (roll < .24) return 'slime'
  if (roll < .30) return 'gold'
  if (roll < .38) return 'ghost'
  return 'normal'
}

function spawnBalloon(y?: number, forcedKind?: BalloonKind) {
  if (balloons.length >= maxBalloons) return
  const size = clamp(width * (.034 + Math.random() * .038), 31, 76)
  const kind = forcedKind ?? randomBalloonKind()
  const pair = kind === 'normal' ? palette[Math.floor(Math.random() * palette.length)] : specialColors[kind]
  const stringLength = clamp(size * (1.75 + Math.random() * .45), 72, 150)
  balloons.push({
    id: nextBalloonId++,
    x: size + Math.random() * Math.max(1, width - size * 2),
    y: y ?? height + size * 1.8,
    vx: (Math.random() - .5) * 16,
    vy: -(17 + Math.random() * 22),
    radius: size,
    color: pair[0],
    accent: pair[1],
    character: characters[Math.floor(Math.random() * characters.length)],
    kind,
    phase: Math.random() * Math.PI * 2,
    buoyancy: 5 + Math.random() * 6,
    stringLength,
    grabLength: stringLength,
    heldBy: null,
    slimeHits: 0,
    squashUntil: 0,
  })
}

function populateBalloons() {
  if (balloons.length) return
  const count = lowPowerDevice ? 7 : 10
  const openingKinds: BalloonKind[] = ['water', 'gold', 'ghost', 'bomb', 'slime', 'normal']
  for (let index = 0; index < count; index += 1) {
    spawnBalloon(height * (.24 + index / count * .96) + Math.random() * 80, openingKinds[index % openingKinds.length])
  }
  nextSpawnAt = performance.now() + 500
}

function setStatus(message: string, state: 'loading' | 'ready' | 'error') {
  trackingCopy.textContent = message
  trackingStatus.classList.toggle('ready', state === 'ready')
  trackingStatus.classList.toggle('error', state === 'error')
}

function showAction(message: string) {
  window.clearTimeout(actionToastTimer)
  actionToast.textContent = message
  actionToast.classList.remove('show')
  void actionToast.offsetWidth
  actionToast.classList.add('show')
  actionToastTimer = window.setTimeout(() => actionToast.classList.remove('show'), 800)
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
  startButton.textContent = '풍선 준비 중…'
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
    audioContext = new AudioContext()
    cameraReady = true
    populateBalloons()
    welcome.classList.add('hidden')
    setStatus('MediaPipe · show your hands', 'ready')
  } catch (error) {
    const denied = error instanceof DOMException && error.name === 'NotAllowedError'
    errorCopy.textContent = denied
      ? '카메라 권한이 차단되었습니다. 주소창의 카메라 설정에서 권한을 허용해 주세요.'
      : '카메라 또는 손 인식 모델을 준비하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.'
    errorPanel.hidden = false
    setStatus('Camera unavailable', 'error')
  } finally {
    startButton.disabled = false
    startButton.textContent = '카메라 켜기'
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

function segmentHit(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const amount = lengthSquared ? clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1) : 0
  const closest = { x: start.x + dx * amount, y: start.y + dy * amount }
  return { distance: distance(point, closest), amount }
}

function pointToSegment(point: Point, start: Point, end: Point) {
  return segmentHit(point, start, end).distance
}

function tryGrabString(hand: Hand, now: number) {
  const heldCount = balloons.reduce((count, balloon) => count + Number(balloon.heldBy === hand.id), 0)
  if (heldCount >= 6 || now - hand.lastGrabAt < 110) return
  let nearest: Balloon | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  let nearestAmount = 1
  for (const balloon of balloons) {
    if (balloon.heldBy) continue
    const neck = neckPoint(balloon)
    const tail = looseTail(balloon)
    const hit = segmentHit(hand.pinchPoint, neck, tail)
    if (hit.distance < Math.max(24, balloon.radius * .42) && hit.distance < nearestDistance) {
      nearest = balloon
      nearestDistance = hit.distance
      nearestAmount = hit.amount
    }
  }
  if (nearest) {
    nearest.heldBy = hand.id
    nearest.grabLength = clamp(nearest.stringLength * nearestAmount, 18, nearest.stringLength)
    hand.lastGrabAt = now
    const bouquetSize = heldCount + 1
    showAction(bouquetSize > 1 ? `BOUQUET · ${bouquetSize} BALLOONS` : 'PINCH · STRING CAUGHT')
  }
}

function releaseHandBalloons(handId: string) {
  balloons.forEach((balloon) => {
    if (balloon.heldBy === handId) {
      balloon.heldBy = null
      balloon.grabLength = balloon.stringLength
    }
  })
}

function playPop() {
  if (!audioContext) return
  const oscillator = audioContext.createOscillator()
  const gain = audioContext.createGain()
  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(180, audioContext.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(55, audioContext.currentTime + .08)
  gain.gain.setValueAtTime(.11, audioContext.currentTime)
  gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .09)
  oscillator.connect(gain).connect(audioContext.destination)
  oscillator.start()
  oscillator.stop(audioContext.currentTime + .1)
}

function queueBombChain(balloon: Balloon) {
  const blastRadius = balloon.radius * 4.5
  const nearby = balloons
    .map((target) => ({ target, gap: distance(balloon, target) }))
    .filter(({ gap }) => gap < blastRadius)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, lowPowerDevice ? 3 : 5)

  nearby.forEach(({ target, gap }, index) => {
    const dx = target.x - balloon.x
    const dy = target.y - balloon.y
    const length = Math.hypot(dx, dy) || 1
    const force = 330 * (1 - gap / blastRadius) + 100
    target.vx += dx / length * force
    target.vy += dy / length * force
    if (!pendingPops.some((pending) => pending.id === target.id)) {
      pendingPops.push({ id: target.id, at: performance.now() + 90 + index * 65 })
    }
  })
}

function popBalloon(balloon: Balloon) {
  const index = balloons.indexOf(balloon)
  if (index < 0) return
  balloons.splice(index, 1)
  playPop()
  const fragmentKind: FragmentKind = balloon.kind === 'water'
    ? 'water'
    : balloon.kind === 'slime'
      ? 'slime'
      : balloon.kind === 'gold'
        ? 'spark'
        : balloon.kind === 'ghost' ? 'mist' : 'rubber'
  const fragmentCount = balloon.kind === 'water' || balloon.kind === 'slime' || balloon.kind === 'ghost'
    ? (lowPowerDevice ? 15 : 24)
    : (lowPowerDevice ? 8 : 13)
  for (let fragmentIndex = 0; fragmentIndex < fragmentCount; fragmentIndex += 1) {
    const angle = Math.PI * 2 * fragmentIndex / fragmentCount + Math.random() * .28
    const speed = (fragmentKind === 'water' ? 145 : fragmentKind === 'mist' ? 55 : 100) + Math.random() * (fragmentKind === 'water' ? 260 : fragmentKind === 'mist' ? 115 : 210)
    const maxLife = .55 + Math.random() * .5
    fragments.push({
      x: balloon.x,
      y: balloon.y,
      vx: Math.cos(angle) * speed + balloon.vx * .45,
      vy: Math.sin(angle) * speed + balloon.vy * .35,
      angle,
      spin: (Math.random() - .5) * 13,
      size: balloon.radius * (.18 + Math.random() * .2),
      color: fragmentKind === 'water'
        ? (Math.random() > .45 ? '#5be5ff' : '#c9f8ff')
        : fragmentKind === 'mist' ? (Math.random() > .45 ? '#ffffff' : '#c8b9ff')
        : Math.random() > .3 ? balloon.color : balloon.accent,
      life: maxLife,
      maxLife,
      kind: fragmentKind,
    })
  }
  const confettiCount = balloon.kind === 'gold'
    ? (lowPowerDevice ? 34 : 58)
    : balloon.kind === 'water' || balloon.kind === 'slime' ? 5 : (lowPowerDevice ? 12 : 22)
  for (let confettiIndex = 0; confettiIndex < confettiCount; confettiIndex += 1) {
    const angle = Math.random() * Math.PI * 2
    const speed = 80 + Math.random() * 250
    const maxLife = .8 + Math.random() * .8
    confetti.push({
      x: balloon.x,
      y: balloon.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 32,
      angle,
      spin: (Math.random() - .5) * 18,
      size: 3 + Math.random() * 6,
      color: balloon.kind === 'gold'
        ? ['#fff6aa', '#ffd43b', '#ff9f1c'][Math.floor(Math.random() * 3)]
        : confettiColors[Math.floor(Math.random() * confettiColors.length)],
      life: maxLife,
      maxLife,
      kind: 'spark',
      shape: Math.random() > .35 ? 'rect' : 'circle',
    })
  }
  puffs.push({ x: balloon.x, y: balloon.y, radius: balloon.radius, life: .46, maxLife: .46, color: balloon.color })
  if (balloon.kind === 'bomb') {
    puffs.push({ x: balloon.x, y: balloon.y, radius: balloon.radius * 1.5, life: .65, maxLife: .65, color: '#ff4c67' })
    queueBombChain(balloon)
    showAction('BOOM · CHAIN REACTION!')
  } else if (balloon.kind === 'water') {
    puffs.push({ x: balloon.x, y: balloon.y, radius: balloon.radius * 1.35, life: .7, maxLife: .7, color: '#d8fbff' })
    puffs.push({ x: balloon.x, y: balloon.y, radius: balloon.radius * 1.8, life: .82, maxLife: .82, color: '#35cfff' })
    showAction('SPLASH!')
  } else if (balloon.kind === 'gold') {
    puffs.push({ x: balloon.x, y: balloon.y, radius: balloon.radius * 1.6, life: .78, maxLife: .78, color: '#fff173' })
    showAction('GOLDEN PARTY!')
  } else if (balloon.kind === 'ghost') {
    puffs.push({ x: balloon.x, y: balloon.y, radius: balloon.radius * 1.2, life: .8, maxLife: .8, color: '#ffffff' })
    puffs.push({ x: balloon.x, y: balloon.y, radius: balloon.radius * 1.7, life: .95, maxLife: .95, color: '#bba8ff' })
    showAction('GHOST · CAUGHT!')
  }
  if (fragments.length > (lowPowerDevice ? 190 : 280)) fragments.splice(0, fragments.length - (lowPowerDevice ? 190 : 280))
  if (confetti.length > (lowPowerDevice ? 260 : 440)) confetti.splice(0, confetti.length - (lowPowerDevice ? 260 : 440))
  if (puffs.length > 28) puffs.splice(0, puffs.length - 28)
}

function flickBalloons(origin: Point, direction: Point) {
  let target: Balloon | null = null
  let bestScore = Number.POSITIVE_INFINITY
  const length = Math.hypot(direction.x, direction.y) || 1
  const normal = { x: direction.x / length, y: direction.y / length }
  for (const balloon of balloons) {
    const offset = { x: balloon.x - origin.x, y: balloon.y - origin.y }
    const forward = offset.x * normal.x + offset.y * normal.y
    if (forward < -20 || forward > Math.max(width, height) * .75) continue
    const sideways = Math.abs(offset.x * normal.y - offset.y * normal.x)
    if (sideways > Math.max(120, balloon.radius * 2.1)) continue
    const score = sideways + Math.max(0, forward) * .13
    if (score < bestScore) { target = balloon; bestScore = score }
  }
  if (!target) return
  const impulse = 330 + Math.min(240, target.radius * 2.2)
  target.vx += normal.x * impulse
  target.vy += normal.y * impulse
  puffs.push({ x: target.x, y: target.y, radius: target.radius * .7, life: .32, maxLife: .32, color: '#ffffff' })
  showAction('SNAP · PUSH!')
}

function updateSnap(handedness: string, landmarks: NormalizedLandmark[], palmSpan: number, now: number) {
  const thumb = landmarks[4]
  const middle = landmarks[12]
  const gap = Math.hypot(thumb.x - middle.x, thumb.y - middle.y) / Math.max(.035, palmSpan)
  const existing = snapStates.get(handedness)
  if (!existing) {
    snapStates.set(handedness, { pinched: gap < .52, primedAt: now, lastGap: gap, lastSeen: now, cooldownUntil: now })
    return
  }
  const elapsed = Math.max(.016, (now - existing.lastSeen) / 1000)
  const separationSpeed = (gap - existing.lastGap) / elapsed
  if (!existing.pinched && gap < .52 && now >= existing.cooldownUntil) {
    existing.pinched = true
    existing.primedAt = now
  }
  if (existing.pinched && gap > .68 && separationSpeed > .85 && now - existing.primedAt < 1_200 && now >= existing.cooldownUntil) {
    const origin = screenPoint(middle)
    const palm = screenPoint(landmarks[9])
    flickBalloons(origin, { x: origin.x - palm.x, y: origin.y - palm.y })
    existing.pinched = false
    existing.cooldownUntil = now + 650
  }
  if (existing.pinched && now - existing.primedAt > 1_300) existing.pinched = false
  existing.lastGap = gap
  existing.lastSeen = now
}

function readHands(result: HandLandmarkerResult, now: number) {
  const visibleHands = new Set<string>()
  result.landmarks.forEach((landmarks, handIndex) => {
    const handedness = result.handedness[handIndex]?.[0]?.categoryName?.toLowerCase() || `hand-${handIndex}`
    const points = landmarks.map(screenPoint)
    const palmSpan = Math.max(32, distance(points[5], points[17]))
    const pinchRatio = distance(points[4], points[8]) / palmSpan
    const pinchPoint = { x: (points[4].x + points[8].x) * .5, y: (points[4].y + points[8].y) * .5 }
    const current = hands.get(handedness)
    if (current) {
      const wasPinching = current.pinch
      current.previousIndex = current.indexTip
      current.indexTip = points[fingertipIndex]
      current.points = points
      current.pinchPoint = pinchPoint
      current.pinch = wasPinching ? pinchRatio < .56 : pinchRatio < .39
      current.lastSeen = now
      if (current.pinch) {
        current.suppressPopsUntil = now + 320
        tryGrabString(current, now)
      }
      if (wasPinching && !current.pinch) releaseHandBalloons(handedness)
    } else {
      const hand: Hand = {
        id: handedness,
        points,
        indexTip: points[fingertipIndex],
        previousIndex: points[fingertipIndex],
        pinchPoint,
        pinch: pinchRatio < .39,
        lastSeen: now,
        lastPopAt: 0,
        lastGrabAt: 0,
        lastHitBalloonId: null,
        suppressPopsUntil: pinchRatio < .39 ? now + 320 : 0,
      }
      hands.set(handedness, hand)
      if (hand.pinch) tryGrabString(hand, now)
    }
    updateSnap(handedness, landmarks, Math.max(.035, Math.hypot(landmarks[5].x - landmarks[17].x, landmarks[5].y - landmarks[17].y)), now)
    visibleHands.add(handedness)
  })

  for (const [handId, hand] of hands) {
    if (!visibleHands.has(handId) && now - hand.lastSeen > 190) {
      releaseHandBalloons(handId)
      hands.delete(handId)
    }
  }
  setStatus(hands.size ? `MediaPipe · ${hands.size} hand${hands.size > 1 ? 's' : ''}` : 'MediaPipe · show your hands', 'ready')
  handleFingerPops(now)
}

function handleFingerPops(now: number) {
  for (const hand of hands.values()) {
    if (hand.pinch || now < hand.suppressPopsUntil) {
      hand.lastHitBalloonId = null
      continue
    }
    let target: Balloon | null = null
    let nearest = Number.POSITIVE_INFINITY
    for (const balloon of balloons) {
      const rx = balloon.radius
      const ry = balloonHeight(balloon)
      const normalized = Math.hypot((hand.indexTip.x - balloon.x) / rx, (hand.indexTip.y - balloon.y) / ry)
      const swept = pointToSegment({ x: balloon.x, y: balloon.y }, hand.previousIndex, hand.indexTip)
      if ((normalized < 1.04 || swept < balloon.radius * .74) && distance(hand.indexTip, { x: balloon.x, y: balloon.y }) < nearest) {
        target = balloon
        nearest = distance(hand.indexTip, { x: balloon.x, y: balloon.y })
      }
    }
    if (!target) {
      hand.lastHitBalloonId = null
      continue
    }
    if (target.id === hand.lastHitBalloonId || now - hand.lastPopAt < 150) continue
    if (target) {
      if (target.kind === 'slime' && target.slimeHits === 0) {
        target.slimeHits = 1
        target.squashUntil = now + 460
        target.vx += (target.x - hand.indexTip.x) * 4.2
        target.vy -= 145
        puffs.push({ x: target.x, y: target.y, radius: target.radius * .66, life: .35, maxLife: .35, color: '#baff7c' })
        showAction('SLIME · BOING! ONE MORE TAP')
      } else {
        popBalloon(target)
      }
      hand.lastPopAt = now
      hand.lastHitBalloonId = target.id
    }
  }
}

function updateTracking(now: number) {
  const interval = lowPowerDevice ? 68 : 52
  if (!cameraReady || !handLandmarker || video.readyState < 2 || video.currentTime === lastVideoTime || now - lastInferenceAt < interval) return
  lastInferenceAt = now
  lastVideoTime = video.currentTime
  try { readHands(handLandmarker.detectForVideo(video, now), now) } catch { /* Keep the latest stable hand state. */ }
}

function solveCollisions() {
  for (let firstIndex = 0; firstIndex < balloons.length; firstIndex += 1) {
    const first = balloons[firstIndex]
    for (let secondIndex = firstIndex + 1; secondIndex < balloons.length; secondIndex += 1) {
      const second = balloons[secondIndex]
      const dx = second.x - first.x
      const dy = second.y - first.y
      const currentDistance = Math.hypot(dx, dy) || .001
      const minimumDistance = (first.radius + second.radius) * .78
      if (currentDistance >= minimumDistance) continue
      const nx = dx / currentDistance
      const ny = dy / currentDistance
      const firstInverseMass = (first.heldBy ? .08 : 1) / (first.radius * first.radius)
      const secondInverseMass = (second.heldBy ? .08 : 1) / (second.radius * second.radius)
      const inverseMassSum = firstInverseMass + secondInverseMass
      const overlap = minimumDistance - currentDistance
      first.x -= nx * overlap * firstInverseMass / inverseMassSum
      first.y -= ny * overlap * firstInverseMass / inverseMassSum
      second.x += nx * overlap * secondInverseMass / inverseMassSum
      second.y += ny * overlap * secondInverseMass / inverseMassSum
      const relativeVelocity = (second.vx - first.vx) * nx + (second.vy - first.vy) * ny
      if (relativeVelocity < 0) {
        const impulse = -(1.72 * relativeVelocity) / inverseMassSum
        first.vx -= impulse * nx * firstInverseMass
        first.vy -= impulse * ny * firstInverseMass
        second.vx += impulse * nx * secondInverseMass
        second.vy += impulse * ny * secondInverseMass
      }
    }
  }
}

function constrainHeldBalloon(balloon: Balloon, delta: number, addVelocity: boolean) {
  if (!balloon.heldBy) return
  const hand = hands.get(balloon.heldBy)
  if (!hand || !hand.pinch) {
    balloon.heldBy = null
    balloon.grabLength = balloon.stringLength
    return
  }
  const anchor = hand.pinchPoint
  const neck = neckPoint(balloon)
  let dx = neck.x - anchor.x
  let dy = neck.y - anchor.y
  let length = Math.hypot(dx, dy)
  if (length < 1) { dx = 0; dy = -1; length = 1 }
  const correctionX = anchor.x + dx / length * balloon.grabLength - neck.x
  const correctionY = anchor.y + dy / length * balloon.grabLength - neck.y
  balloon.x += correctionX
  balloon.y += correctionY
  if (addVelocity) {
    balloon.vx += correctionX / Math.max(.01, delta) * .12
    balloon.vy += correctionY / Math.max(.01, delta) * .12
  }
}

function updateBalloons(delta: number, now: number) {
  if (pendingPops.length) {
    const due = pendingPops.filter((pending) => pending.at <= now)
    pendingPops = pendingPops.filter((pending) => pending.at > now)
    due.forEach((pending) => {
      const target = balloons.find((balloon) => balloon.id === pending.id)
      if (target) popBalloon(target)
    })
  }
  if (cameraReady && now >= nextSpawnAt && balloons.length < maxBalloons) {
    spawnBalloon()
    nextSpawnAt = now + 520 + Math.random() * 520
  }
  for (const balloon of balloons) {
    const oldX = balloon.x
    const oldY = balloon.y
    if (balloon.kind === 'ghost' && !balloon.heldBy) {
      for (const hand of hands.values()) {
        const dx = balloon.x - hand.indexTip.x
        const dy = balloon.y - hand.indexTip.y
        const gap = Math.hypot(dx, dy) || 1
        const scareRadius = balloon.radius * 4.25
        if (gap < scareRadius) {
          const force = (1 - gap / scareRadius) * 1_180 * delta
          balloon.vx += dx / gap * force
          balloon.vy += dy / gap * force - 18 * delta
        }
      }
    }
    balloon.vy -= balloon.buoyancy * delta
    balloon.vx += Math.sin(now * .001 + balloon.phase) * 4.4 * delta
    const drag = Math.pow(.975, delta * 60)
    balloon.vx *= drag
    balloon.vy *= Math.pow(.992, delta * 60)
    balloon.x += balloon.vx * delta
    balloon.y += balloon.vy * delta

    if (balloon.x < balloon.radius * .72) { balloon.x = balloon.radius * .72; balloon.vx = Math.abs(balloon.vx) * .72 }
    if (balloon.x > width - balloon.radius * .72) { balloon.x = width - balloon.radius * .72; balloon.vx = -Math.abs(balloon.vx) * .72 }

    constrainHeldBalloon(balloon, delta, true)
    const frameVelocityX = (balloon.x - oldX) / Math.max(.01, delta)
    const frameVelocityY = (balloon.y - oldY) / Math.max(.01, delta)
    balloon.vx = balloon.vx * .82 + frameVelocityX * .18
    balloon.vy = balloon.vy * .82 + frameVelocityY * .18
  }
  solveCollisions()
  balloons.forEach((balloon) => constrainHeldBalloon(balloon, delta, false))
  balloons = balloons.filter((balloon) => balloon.heldBy || balloon.y > -balloon.radius * 3.4)
}

function updateParticles(delta: number) {
  const updateParticle = (particle: Fragment) => {
    particle.vy += 260 * delta
    particle.vx *= Math.pow(.98, delta * 60)
    particle.vy *= Math.pow(.99, delta * 60)
    particle.x += particle.vx * delta
    particle.y += particle.vy * delta
    particle.angle += particle.spin * delta
    particle.life -= delta
  }
  fragments.forEach(updateParticle)
  confetti.forEach(updateParticle)
  fragments = fragments.filter((particle) => particle.life > 0)
  confetti = confetti.filter((particle) => particle.life > 0)
  puffs.forEach((puff) => { puff.life -= delta })
  puffs = puffs.filter((puff) => puff.life > 0)
}

function drawString(balloon: Balloon, now: number) {
  const neck = neckPoint(balloon)
  const hand = balloon.heldBy ? hands.get(balloon.heldBy) : null
  const tail = hand?.pinch ? hand.pinchPoint : looseTail(balloon, now)
  context.save()
  context.strokeStyle = balloon.kind === 'gold'
    ? 'rgba(255, 224, 91, .96)'
    : balloon.kind === 'water'
      ? 'rgba(159, 239, 255, .9)'
      : balloon.kind === 'ghost' ? 'rgba(220, 209, 255, .84)' : 'rgba(255, 255, 255, .78)'
  context.lineWidth = 1.25
  context.shadowColor = 'rgba(25, 12, 38, .3)'
  context.shadowBlur = 3
  context.beginPath()
  context.moveTo(neck.x, neck.y)
  context.lineTo(tail.x, tail.y)
  if (hand?.pinch) {
    const remaining = Math.max(0, balloon.stringLength - balloon.grabLength)
    const offsetX = Math.sin(now * .0023 + balloon.phase) * Math.min(5, remaining * .08)
    context.lineTo(
      tail.x + offsetX,
      tail.y + Math.sqrt(Math.max(0, remaining * remaining - offsetX * offsetX)),
    )
  }
  context.stroke()
  context.restore()
}

function drawCharacterFace(balloon: Balloon, radius: number) {
  const eyeY = -radius * .12
  context.fillStyle = balloon.accent
  if (balloon.character === 'frog') {
    context.beginPath(); context.arc(-radius * .35, -radius * .52, radius * .16, 0, Math.PI * 2); context.fill()
    context.beginPath(); context.arc(radius * .35, -radius * .52, radius * .16, 0, Math.PI * 2); context.fill()
  }
  context.fillStyle = '#24172d'
  context.beginPath(); context.ellipse(-radius * .25, eyeY, radius * .07, radius * .1, 0, 0, Math.PI * 2); context.fill()
  context.beginPath(); context.ellipse(radius * .25, eyeY, radius * .07, radius * .1, 0, 0, Math.PI * 2); context.fill()
  context.fillStyle = 'rgba(255,255,255,.9)'
  context.beginPath(); context.arc(-radius * .27, eyeY - radius * .03, radius * .022, 0, Math.PI * 2); context.fill()
  context.beginPath(); context.arc(radius * .23, eyeY - radius * .03, radius * .022, 0, Math.PI * 2); context.fill()
  context.strokeStyle = balloon.accent
  context.lineWidth = Math.max(1.5, radius * .035)
  context.lineCap = 'round'
  context.beginPath()
  if (balloon.character === 'duck') {
    context.moveTo(-radius * .15, radius * .19); context.quadraticCurveTo(0, radius * .29, radius * .15, radius * .19)
  } else if (balloon.character === 'alien') {
    context.moveTo(-radius * .12, radius * .2); context.lineTo(radius * .12, radius * .2)
  } else {
    context.arc(0, radius * .12, radius * .17, .15, Math.PI - .15)
  }
  context.stroke()
  context.fillStyle = 'rgba(255, 160, 190, .48)'
  context.beginPath(); context.ellipse(-radius * .45, radius * .13, radius * .12, radius * .06, 0, 0, Math.PI * 2); context.fill()
  context.beginPath(); context.ellipse(radius * .45, radius * .13, radius * .12, radius * .06, 0, 0, Math.PI * 2); context.fill()
}

function drawSpecialMark(balloon: Balloon, radius: number, now: number) {
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  if (balloon.kind === 'bomb') {
    context.strokeStyle = '#fff1a8'
    context.lineWidth = Math.max(2, radius * .065)
    context.beginPath()
    context.moveTo(radius * .15, -radius * .72)
    context.quadraticCurveTo(radius * .35, -radius * 1.04, radius * .5, -radius * .8)
    context.stroke()
    const spark = radius * (.085 + Math.sin(now * .018) * .018)
    context.fillStyle = '#ffdb4d'
    context.fillRect(radius * .5 - spark, -radius * .8 - spark, spark * 2, spark * 2)
  } else if (balloon.kind === 'water') {
    context.strokeStyle = 'rgba(239,254,255,.96)'
    context.lineWidth = Math.max(2, radius * .052)
    context.beginPath()
    context.moveTo(0, -radius * .79)
    context.bezierCurveTo(radius * .22, -radius * .51, radius * .23, -radius * .31, 0, -radius * .31)
    context.bezierCurveTo(-radius * .23, -radius * .31, -radius * .22, -radius * .51, 0, -radius * .79)
    context.stroke()
    context.beginPath()
    context.moveTo(-radius * .42, radius * .49)
    context.quadraticCurveTo(-radius * .12, radius * .31, radius * .12, radius * .49)
    context.quadraticCurveTo(radius * .31, radius * .61, radius * .46, radius * .48)
    context.stroke()
  } else if (balloon.kind === 'slime') {
    context.fillStyle = 'rgba(218,255,161,.72)'
    context.beginPath(); context.arc(-radius * .33, radius * .5, radius * .08, 0, Math.PI * 2); context.fill()
    context.beginPath(); context.arc(radius * .25, radius * .56, radius * .055, 0, Math.PI * 2); context.fill()
  } else if (balloon.kind === 'gold') {
    const outer = radius * .29
    const inner = outer * .45
    context.translate(0, radius * .4)
    context.fillStyle = '#fff8bd'
    context.beginPath()
    for (let point = 0; point < 10; point += 1) {
      const angle = -Math.PI / 2 + point * Math.PI / 5
      const length = point % 2 ? inner : outer
      const x = Math.cos(angle) * length
      const y = Math.sin(angle) * length
      if (point === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    context.closePath(); context.fill()
    context.strokeStyle = 'rgba(255,255,255,.92)'
    context.lineWidth = Math.max(1.5, radius * .04)
    const gleam = Math.sin(now * .006 + balloon.phase) * radius * .08
    context.beginPath(); context.moveTo(-radius * .58 + gleam, -radius * .52); context.lineTo(-radius * .42 + gleam, -radius * .22); context.stroke()
    context.beginPath(); context.moveTo(-radius * .57 + gleam, -radius * .37); context.lineTo(-radius * .42 + gleam, -radius * .52); context.stroke()
  } else if (balloon.kind === 'ghost') {
    context.strokeStyle = 'rgba(255,255,255,.88)'
    context.lineWidth = Math.max(2.5, radius * .065)
    context.beginPath()
    context.moveTo(-radius * .66, radius * .57)
    context.quadraticCurveTo(-radius * .47, radius * .76, -radius * .28, radius * .57)
    context.quadraticCurveTo(-radius * .09, radius * .76, radius * .1, radius * .57)
    context.quadraticCurveTo(radius * .29, radius * .76, radius * .48, radius * .57)
    context.quadraticCurveTo(radius * .58, radius * .67, radius * .67, radius * .57)
    context.stroke()
  }
  context.restore()
}

function drawBalloon(balloon: Balloon, now: number) {
  const radius = balloon.radius
  const radiusY = balloonHeight(balloon)
  const angle = clamp(balloon.vx / 950, -.16, .16) + Math.sin(now * .0015 + balloon.phase) * .018
  context.save()
  context.translate(balloon.x, balloon.y)
  context.rotate(angle)
  if (balloon.squashUntil > now) {
    const remaining = clamp((balloon.squashUntil - now) / 460, 0, 1)
    const wobble = Math.sin((1 - remaining) * Math.PI * 4.5) * remaining * .27
    context.scale(1 + wobble, 1 - wobble)
  }
  if (balloon.kind === 'ghost') context.globalAlpha = .72 + Math.sin(now * .004 + balloon.phase) * .12
  context.shadowColor = 'rgba(22, 9, 33, .28)'
  context.shadowBlur = radius * .22
  context.shadowOffsetY = radius * .11

  context.fillStyle = balloon.color
  if (balloon.kind !== 'ghost') {
    if (balloon.character === 'cat') {
      context.beginPath(); context.moveTo(-radius * .66, -radiusY * .57); context.lineTo(-radius * .45, -radiusY * 1.02); context.lineTo(-radius * .13, -radiusY * .72); context.fill()
      context.beginPath(); context.moveTo(radius * .66, -radiusY * .57); context.lineTo(radius * .45, -radiusY * 1.02); context.lineTo(radius * .13, -radiusY * .72); context.fill()
    } else if (balloon.character === 'bear') {
      context.beginPath(); context.arc(-radius * .55, -radiusY * .63, radius * .25, 0, Math.PI * 2); context.fill()
      context.beginPath(); context.arc(radius * .55, -radiusY * .63, radius * .25, 0, Math.PI * 2); context.fill()
    } else if (balloon.character === 'bunny') {
      context.beginPath(); context.ellipse(-radius * .34, -radiusY * .89, radius * .21, radiusY * .53, -.14, 0, Math.PI * 2); context.fill()
      context.beginPath(); context.ellipse(radius * .34, -radiusY * .89, radius * .21, radiusY * .53, .14, 0, Math.PI * 2); context.fill()
    } else if (balloon.character === 'alien') {
      context.strokeStyle = balloon.color; context.lineWidth = radius * .11
      context.beginPath(); context.moveTo(0, -radiusY * .7); context.quadraticCurveTo(radius * .08, -radiusY * 1.04, radius * .25, -radiusY * 1.14); context.stroke()
      context.beginPath(); context.arc(radius * .27, -radiusY * 1.15, radius * .1, 0, Math.PI * 2); context.fill()
    }
  }

  const gradient = balloon.kind === 'gold'
    ? context.createLinearGradient(-radius, -radiusY, radius, radiusY)
    : context.createRadialGradient(-radius * .34, -radiusY * .36, radius * .05, 0, 0, radiusY * 1.1)
  if (balloon.kind === 'gold') {
    gradient.addColorStop(0, '#8b4900')
    gradient.addColorStop(.22, '#ffd438')
    gradient.addColorStop(.43, '#fff9bb')
    gradient.addColorStop(.58, '#ffc420')
    gradient.addColorStop(1, '#8f4800')
  } else if (balloon.kind === 'water') {
    gradient.addColorStop(0, 'rgba(244,254,255,.96)')
    gradient.addColorStop(.13, 'rgba(90,225,255,.74)')
    gradient.addColorStop(.72, 'rgba(12,164,225,.74)')
    gradient.addColorStop(1, 'rgba(0,86,175,.92)')
  } else if (balloon.kind === 'ghost') {
    gradient.addColorStop(0, 'rgba(255,255,255,.96)')
    gradient.addColorStop(.16, 'rgba(232,226,255,.88)')
    gradient.addColorStop(.7, 'rgba(174,153,232,.72)')
    gradient.addColorStop(1, 'rgba(91,64,153,.84)')
  } else {
    gradient.addColorStop(0, '#ffffff')
    gradient.addColorStop(.08, balloon.color)
    gradient.addColorStop(.76, balloon.color)
    gradient.addColorStop(1, balloon.accent)
  }
  context.fillStyle = gradient
  context.strokeStyle = 'rgba(255,255,255,.5)'
  context.lineWidth = 1.2
  context.beginPath()
  context.ellipse(0, 0, radius, radiusY, 0, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.shadowColor = 'transparent'
  if (balloon.kind === 'water') {
    context.save()
    context.beginPath(); context.ellipse(0, 0, radius * .94, radiusY * .94, 0, 0, Math.PI * 2); context.clip()
    const waterLine = radius * (.08 + Math.sin(now * .003 + balloon.phase) * .055)
    context.fillStyle = 'rgba(0,109,218,.63)'
    context.beginPath()
    context.moveTo(-radius * 1.05, waterLine)
    context.quadraticCurveTo(-radius * .52, waterLine - radius * .16, 0, waterLine)
    context.quadraticCurveTo(radius * .52, waterLine + radius * .16, radius * 1.05, waterLine)
    context.lineTo(radius * 1.05, radiusY * 1.1)
    context.lineTo(-radius * 1.05, radiusY * 1.1)
    context.closePath(); context.fill()
    context.fillStyle = 'rgba(230,253,255,.72)'
    context.beginPath(); context.arc(-radius * .48, -radius * .38, radius * .075, 0, Math.PI * 2); context.fill()
    context.beginPath(); context.arc(radius * .43, radius * .3, radius * .045, 0, Math.PI * 2); context.fill()
    context.restore()
  }
  if (balloon.kind === 'ghost') {
    context.fillStyle = '#2a1748'
    context.beginPath(); context.ellipse(-radius * .26, -radius * .13, radius * .12, radius * .21, -.1, 0, Math.PI * 2); context.fill()
    context.beginPath(); context.ellipse(radius * .26, -radius * .13, radius * .12, radius * .21, .1, 0, Math.PI * 2); context.fill()
    context.beginPath(); context.ellipse(0, radius * .27, radius * .14, radius * .2, 0, 0, Math.PI * 2); context.fill()
    context.strokeStyle = 'rgba(255,255,255,.7)'
    context.lineWidth = radius * .085
    context.beginPath(); context.arc(-radius * .73, radius * .18, radius * .34, -.7, .75); context.stroke()
    context.beginPath(); context.arc(radius * .73, radius * .18, radius * .34, Math.PI - .75, Math.PI + .7); context.stroke()
  } else {
    drawCharacterFace(balloon, radius)
  }
  drawSpecialMark(balloon, radius, now)

  context.fillStyle = balloon.accent
  context.beginPath()
  context.moveTo(-radius * .13, radiusY * .82)
  context.lineTo(radius * .13, radiusY * .82)
  context.lineTo(radius * .19, radiusY * 1.04)
  context.lineTo(-radius * .19, radiusY * 1.04)
  context.closePath()
  context.fill()
  context.restore()
}

function drawParticles() {
  for (const puff of puffs) {
    const progress = 1 - puff.life / puff.maxLife
    context.save()
    context.globalAlpha = 1 - progress
    context.strokeStyle = puff.color
    context.lineWidth = 4 * (1 - progress)
    context.beginPath(); context.arc(puff.x, puff.y, puff.radius * (.25 + progress * 1.45), 0, Math.PI * 2); context.stroke()
    context.restore()
  }
  for (const fragment of fragments) {
    context.save()
    context.globalAlpha = fragment.life / fragment.maxLife
    context.translate(fragment.x, fragment.y)
    context.rotate(fragment.angle)
    context.fillStyle = fragment.color
    if (fragment.kind === 'water') {
      context.globalAlpha *= .74
      context.beginPath()
      context.moveTo(0, -fragment.size)
      context.bezierCurveTo(fragment.size * .8, 0, fragment.size * .64, fragment.size, 0, fragment.size)
      context.bezierCurveTo(-fragment.size * .64, fragment.size, -fragment.size * .8, 0, 0, -fragment.size)
      context.fill()
    } else if (fragment.kind === 'slime') {
      context.beginPath(); context.arc(0, 0, fragment.size * .7, 0, Math.PI * 2); context.fill()
      context.beginPath(); context.arc(fragment.size * .55, fragment.size * .2, fragment.size * .34, 0, Math.PI * 2); context.fill()
    } else if (fragment.kind === 'spark') {
      context.fillRect(-fragment.size * .18, -fragment.size, fragment.size * .36, fragment.size * 2)
      context.fillRect(-fragment.size, -fragment.size * .18, fragment.size * 2, fragment.size * .36)
    } else if (fragment.kind === 'mist') {
      context.globalAlpha *= .48
      context.shadowColor = fragment.color
      context.shadowBlur = fragment.size
      context.beginPath(); context.arc(0, 0, fragment.size * .76, 0, Math.PI * 2); context.fill()
    } else {
      context.beginPath(); context.moveTo(-fragment.size, fragment.size * .55); context.quadraticCurveTo(0, -fragment.size, fragment.size, fragment.size * .45); context.closePath(); context.fill()
    }
    context.restore()
  }
  for (const piece of confetti) {
    context.save()
    context.globalAlpha = Math.min(1, piece.life / piece.maxLife * 2)
    context.translate(piece.x, piece.y)
    context.rotate(piece.angle)
    context.fillStyle = piece.color
    if (piece.shape === 'circle') {
      context.beginPath(); context.arc(0, 0, piece.size * .55, 0, Math.PI * 2); context.fill()
    } else {
      context.fillRect(-piece.size * .8, -piece.size * .34, piece.size * 1.6, piece.size * .68)
    }
    context.restore()
  }
}

function drawHands() {
  for (const hand of hands.values()) {
    const bouquetSize = balloons.reduce((count, balloon) => count + Number(balloon.heldBy === hand.id), 0)
    context.save()
    context.strokeStyle = 'rgba(255,255,255,.8)'
    context.fillStyle = hand.pinch ? '#fff4a8' : '#ffffff'
    context.lineWidth = 2
    context.shadowColor = hand.pinch ? '#ffe66c' : '#ff75b5'
    context.shadowBlur = 14
    context.beginPath(); context.arc(hand.indexTip.x, hand.indexTip.y, hand.pinch ? 7 : 5, 0, Math.PI * 2); context.fill()
    if (hand.pinch) {
      context.beginPath(); context.arc(hand.pinchPoint.x, hand.pinchPoint.y, 15, 0, Math.PI * 2); context.stroke()
      if (bouquetSize > 1) {
        context.shadowBlur = 10
        context.fillStyle = '#fff4a8'
        context.beginPath(); context.arc(hand.pinchPoint.x + 20, hand.pinchPoint.y - 20, 12, 0, Math.PI * 2); context.fill()
        context.shadowBlur = 0
        context.fillStyle = '#2a1833'
        context.font = '800 10px Inter, sans-serif'
        context.textAlign = 'center'
        context.textBaseline = 'middle'
        context.fillText(`${bouquetSize}`, hand.pinchPoint.x + 20, hand.pinchPoint.y - 20.5)
      }
    }
    context.restore()
  }
}

function render(now: number) {
  const delta = Math.min(.033, Math.max(.001, (now - lastFrameAt) / 1000))
  lastFrameAt = now
  if (!document.hidden) {
    updateTracking(now)
    updateBalloons(delta, now)
    updateParticles(delta)
    context.clearRect(0, 0, width, height)
    balloons.forEach((balloon) => drawString(balloon, now))
    balloons.forEach((balloon) => drawBalloon(balloon, now))
    drawParticles()
    drawHands()
  }
  requestAnimationFrame(render)
}

startButton.addEventListener('click', startExperience)
retryButton.addEventListener('click', startExperience)
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
  void audioContext?.close()
})

resize()
requestAnimationFrame(render)
