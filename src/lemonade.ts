import './lemonade.css'
import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  type FaceLandmarkerResult,
  type HandLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

type Point = { x: number; y: number }
type TrackedHand = { handedness: 'left' | 'right'; points: Point[]; palm: Point; fist: boolean; squeeze: number }
type TrackedMouth = Point & { open: boolean; openness: number }
type LemonState = 'floating' | 'held' | 'sucked' | 'spent'
type Lemon = {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  angle: number
  angularVelocity: number
  floatPhase: number
  juice: number
  state: LemonState
  scaleY: number
  suctionScale: number
}
type Drop = { x: number; y: number; vx: number; vy: number; radius: number; amount: number; life: number }
type Splash = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number }
type CupMode = 'resting' | 'held' | 'thrown' | 'returning'
type Cup = {
  x: number
  y: number
  targetX: number
  targetY: number
  width: number
  height: number
  rotation: number
  vx: number
  vy: number
  angularVelocity: number
  mode: CupMode
  heldSince: number
  returnAt: number
}

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main class="lemonade-app">
    <video class="camera" id="camera" playsinline muted aria-label="실시간 카메라 화면"></video>
    <div class="camera-vignette" aria-hidden="true"></div>
    <canvas class="scene-canvas" id="scene-canvas" aria-label="떠다니는 레몬과 레모네이드 컵 인터랙션"></canvas>

    <header class="topbar">
      <a class="brand" href="${import.meta.env.BASE_URL}" aria-label="홈으로 돌아가기">
        <span class="brand-fruit" aria-hidden="true"></span>
        <strong>Lemonade</strong>
        <span class="example-number">07</span>
      </a>
      <div class="tracking-status" id="tracking-status" role="status" aria-live="polite">
        <i aria-hidden="true"></i><span>Camera waiting</span>
      </div>
    </header>

    <p class="side-label left">LEFT HAND · SQUEEZE</p>
    <p class="side-label right">RIGHT HAND · CARRY</p>
    <p class="mouth-tip" id="mouth-tip"><span aria-hidden="true">◌</span> 입을 벌리면 레몬이 쏙!</p>

    <section class="instruction-dock" aria-label="손동작 안내">
      <article class="gesture-card" id="left-guide">
        <span class="hand-symbol" aria-hidden="true">✊</span>
        <p><strong>왼손으로 꽉!</strong><small>레몬 가까이에서 주먹을 쥐어 짜요</small></p>
      </article>
      <article class="gesture-card" id="right-guide">
        <span class="hand-symbol" aria-hidden="true">✋</span>
        <p><strong>오른손으로 컵 이동</strong><small>빠르게 휘두르면 컵과 음료가 날아가요</small></p>
      </article>
    </section>

    <div class="fill-meter" aria-live="polite">
      <div><span>LEMONADE</span><strong id="fill-percent">0%</strong></div>
      <span class="meter-track"><i id="meter-fill"></i></span>
    </div>

    <div class="complete-toast" id="complete-toast" role="status">
      <b>Fresh!</b><span>레모네이드가 완성됐어요</span>
    </div>

    <section class="welcome" id="welcome" aria-labelledby="welcome-title">
      <div class="welcome-card">
        <p class="welcome-kicker">EXPERIMENT 07 · FACE + HAND TRACKING</p>
        <h1 id="welcome-title">Lemonade</h1>
        <p class="welcome-copy">왼손으로 레몬을 짜고 오른손으로 컵을 옮겨보세요.<br>입을 크게 벌리면 레몬이 커비처럼 쏙 빨려 들어가요.</p>
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
const canvas = document.querySelector<HTMLCanvasElement>('#scene-canvas')!
const context = canvas.getContext('2d')!
const welcome = document.querySelector<HTMLElement>('#welcome')!
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!
const retryButton = document.querySelector<HTMLButtonElement>('#retry-button')!
const errorPanel = document.querySelector<HTMLElement>('#error-panel')!
const errorCopy = document.querySelector<HTMLElement>('#error-copy')!
const trackingStatus = document.querySelector<HTMLElement>('#tracking-status')!
const trackingCopy = trackingStatus.querySelector<HTMLElement>('span')!
const leftGuide = document.querySelector<HTMLElement>('#left-guide')!
const rightGuide = document.querySelector<HTMLElement>('#right-guide')!
const mouthTip = document.querySelector<HTMLElement>('#mouth-tip')!
const fillPercent = document.querySelector<HTMLElement>('#fill-percent')!
const meterFill = document.querySelector<HTMLElement>('#meter-fill')!
const completeToast = document.querySelector<HTMLElement>('#complete-toast')!

const lemonImage = new Image()
lemonImage.src = `${import.meta.env.BASE_URL}lemonade/lemon.png`
let lemonRenderSource: CanvasImageSource = lemonImage
let lemonAspect = 1
lemonImage.addEventListener('load', () => {
  lemonAspect = lemonImage.naturalWidth / Math.max(1, lemonImage.naturalHeight)
  if (!('createImageBitmap' in window)) return
  const longestSide = 384
  const resizeWidth = lemonAspect >= 1 ? longestSide : Math.round(longestSide * lemonAspect)
  const resizeHeight = lemonAspect >= 1 ? Math.round(longestSide / lemonAspect) : longestSide
  void createImageBitmap(lemonImage, { resizeWidth, resizeHeight, resizeQuality: 'high' })
    .then((bitmap) => { lemonRenderSource = bitmap })
    .catch(() => undefined)
})

const lemonGlow = document.createElement('canvas')
lemonGlow.width = 128
lemonGlow.height = 128
const lemonGlowContext = lemonGlow.getContext('2d')!
const lemonGlowGradient = lemonGlowContext.createRadialGradient(64, 64, 29, 64, 64, 64)
lemonGlowGradient.addColorStop(0, 'rgba(234, 245, 53, 0)')
lemonGlowGradient.addColorStop(1, 'rgba(234, 245, 53, .1)')
lemonGlowContext.fillStyle = lemonGlowGradient
lemonGlowContext.fillRect(0, 0, 128, 128)

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
]

let width = 0
let height = 0
let dpr = 1
let handLandmarker: HandLandmarker | null = null
let faceLandmarker: FaceLandmarker | null = null
let hands: TrackedHand[] = []
let mouth: TrackedMouth | null = null
let lemons: Lemon[] = []
let drops: Drop[] = []
let splashes: Splash[] = []
let lastTime = performance.now()
let lastDetectionTime = -1
let heldLemon: Lemon | null = null
let lemonadeLevel = 0
let targetLevel = 0
let cameraReady = false
let completionShown = false
let lastInferenceAt = 0
let lastFaceInferenceAt = 0
let mouthWasOpen = false
let mouthOpeningCount = 0
let mouthAction: 'suck' | 'spit' = 'suck'
let spitUntil = 0
let spitStartedAt = 0
let emptySince = 0
let previousRightPalm: Point | null = null
let previousRightSampleAt = 0
let smoothedRightVelocity: Point = { x: 0, y: 0 }
let lastFillDisplay = -1
const lowPowerDevice = (navigator.hardwareConcurrency || 8) <= 4
const cup: Cup = {
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0,
  width: 150,
  height: 218,
  rotation: 0,
  vx: 0,
  vy: 0,
  angularVelocity: 0,
  mode: 'resting',
  heldSince: 0,
  returnAt: 0,
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function resize() {
  width = window.innerWidth
  height = window.innerHeight
  const pixelBudget = lowPowerDevice ? 2_400_000 : 3_600_000
  const budgetRatio = Math.sqrt(pixelBudget / Math.max(1, width * height))
  dpr = Math.min(window.devicePixelRatio || 1, 2, Math.max(1, budgetRatio))
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  context.setTransform(dpr, 0, 0, dpr, 0, 0)

  cup.width = clamp(width * .12, 108, 160)
  cup.height = cup.width * 1.43
  if (!cup.x) {
    cup.x = width / 2
    cup.y = height - cup.height * .5 - clamp(height * .11, 82, 104)
  }
  cup.targetX = clamp(cup.targetX || width / 2, cup.width * .7, width - cup.width * .7)
  cup.targetY = clamp(cup.targetY || cup.y, cup.height * .6 + 70, height - cup.height * .5 - 82)
}

function makeLemon(index: number): Lemon {
  const columnCount = width < 620 ? 4 : 6
  const column = index % columnCount
  const row = Math.floor(index / columnCount)
  return {
    x: width * ((column + .7) / (columnCount + .4)),
    y: height * (.17 + row * .17 + (column % 2) * .035),
    vx: (index % 2 ? 1 : -1) * (11 + Math.random() * 9),
    vy: 0,
    radius: clamp(width * .038, 34, 56) * (.88 + Math.random() * .18),
    angle: -.18 + Math.random() * .36,
    angularVelocity: (Math.random() - .5) * .18,
    floatPhase: Math.random() * Math.PI * 2,
    juice: .21 + Math.random() * .045,
    state: 'floating',
    scaleY: 1,
    suctionScale: 1,
  }
}

function resetLemons() {
  lemons = Array.from({ length: width < 620 ? 8 : 12 }, (_, index) => makeLemon(index))
  emptySince = 0
}

function setStatus(message: string, state: 'loading' | 'ready' | 'error') {
  trackingCopy.textContent = message
  trackingStatus.classList.toggle('ready', state === 'ready')
  trackingStatus.classList.toggle('error', state === 'error')
}

function setGuideActive(element: HTMLElement, active: boolean) {
  if (element.classList.contains('active') !== active) element.classList.toggle('active', active)
}

function setMouthTip(message: string, active: boolean, spitting: boolean) {
  if (mouthTip.textContent !== message) mouthTip.textContent = message
  if (mouthTip.classList.contains('active') !== active) mouthTip.classList.toggle('active', active)
  if (mouthTip.classList.contains('spitting') !== spitting) mouthTip.classList.toggle('spitting', spitting)
}

async function setupTracking() {
  const vision = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}lemonade/mediapipe`)
  const handOptions = {
    runningMode: 'VIDEO' as const,
    numHands: 2,
    minHandDetectionConfidence: .56,
    minHandPresenceConfidence: .52,
    minTrackingConfidence: .5,
  }
  try {
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      ...handOptions,
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}lemonade/mediapipe/hand_landmarker.task`, delegate: 'GPU' },
    })
  } catch {
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      ...handOptions,
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}lemonade/mediapipe/hand_landmarker.task`, delegate: 'CPU' },
    })
  }
  const faceOptions = {
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: .52,
    minFacePresenceConfidence: .5,
    minTrackingConfidence: .5,
  }
  try {
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      ...faceOptions,
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}lemonade/mediapipe/face_landmarker.task`, delegate: 'GPU' },
    })
  } catch {
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      ...faceOptions,
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}lemonade/mediapipe/face_landmarker.task`, delegate: 'CPU' },
    })
  }
}

async function startExperience() {
  startButton.disabled = true
  startButton.textContent = '준비하는 중…'
  errorPanel.hidden = true
  setStatus('Loading hand tracking', 'loading')

  try {
    const [stream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      }),
      handLandmarker && faceLandmarker ? Promise.resolve() : setupTracking(),
    ])
    video.srcObject = stream
    await video.play()
    cameraReady = true
    welcome.classList.add('hidden')
    setStatus('MediaPipe · live', 'ready')
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'NotAllowedError'
      ? '카메라 권한이 차단되었습니다. 주소창의 카메라 설정에서 권한을 허용해 주세요.'
      : '카메라 또는 손 인식 모델을 준비하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.'
    errorCopy.textContent = message
    errorPanel.hidden = false
    setStatus('Camera unavailable', 'error')
  } finally {
    startButton.disabled = false
    startButton.textContent = '카메라 켜기'
  }
}

function screenPoint(landmark: NormalizedLandmark): Point {
  const videoWidth = video.videoWidth || 1280
  const videoHeight = video.videoHeight || 720
  const scale = Math.max(width / videoWidth, height / videoHeight)
  const renderedWidth = videoWidth * scale
  const renderedHeight = videoHeight * scale
  const cropX = (renderedWidth - width) / 2
  const cropY = (renderedHeight - height) / 2
  return {
    x: width - (landmark.x * renderedWidth - cropX),
    y: landmark.y * renderedHeight - cropY,
  }
}

function calculateFist(points: Point[]) {
  const wrist = points[0]
  const palmSize = Math.max(36, distance(points[5], points[17]))
  const fingerPairs: [number, number][] = [[8, 6], [12, 10], [16, 14], [20, 18]]
  const curls = fingerPairs.map(([tip, joint]) => {
    const tipDistance = distance(points[tip], wrist)
    const jointDistance = distance(points[joint], wrist)
    return clamp((jointDistance * 1.23 - tipDistance) / (palmSize * .78), 0, 1)
  })
  const squeeze = curls.reduce((sum, value) => sum + value, 0) / curls.length
  const curledFingers = curls.filter((value) => value > .23).length
  return { fist: curledFingers >= 3 && squeeze > .18, squeeze }
}

function readHands(result: HandLandmarkerResult) {
  hands = result.landmarks.map((landmarks, index) => {
    const points = landmarks.map(screenPoint)
    const handednessName = result.handedness[index]?.[0]?.categoryName?.toLowerCase()
    const handedness = handednessName === 'left' ? 'left' : 'right'
    const palm = {
      x: (points[0].x + points[5].x + points[9].x + points[13].x + points[17].x) / 5,
      y: (points[0].y + points[5].y + points[9].y + points[13].y + points[17].y) / 5,
    }
    const gesture = calculateFist(points)
    return { handedness, points, palm, ...gesture }
  })
}

function readFace(result: FaceLandmarkerResult) {
  const landmarks = result.faceLandmarks[0]
  if (!landmarks) {
    mouth = null
    setMouthTip(mouthTip.textContent || '입을 벌리면 레몬 흡입!', false, false)
    return
  }
  const upperLip = screenPoint(landmarks[13])
  const lowerLip = screenPoint(landmarks[14])
  const faceTop = screenPoint(landmarks[10])
  const faceBottom = screenPoint(landmarks[152])
  const jawScore = result.faceBlendshapes[0]?.categories
    .find((category) => category.categoryName === 'jawOpen')?.score
  const landmarkOpenness = clamp((distance(upperLip, lowerLip) / Math.max(1, distance(faceTop, faceBottom)) - .012) / .105, 0, 1)
  const openness = clamp(jawScore ?? landmarkOpenness, 0, 1)
  const isOpen = mouthWasOpen ? openness > .18 : openness > .31
  if (isOpen && !mouthWasOpen) {
    mouthOpeningCount += 1
    mouthAction = mouthOpeningCount % 2 === 1 ? 'suck' : 'spit'
    if (mouthAction === 'spit') {
      spitStartedAt = performance.now()
      spitUntil = spitStartedAt + 1400
    }
  }
  mouthWasOpen = isOpen
  mouth = {
    x: (upperLip.x + lowerLip.x) / 2,
    y: (upperLip.y + lowerLip.y) / 2,
    openness,
    open: isOpen,
  }
  if (isOpen) {
    setMouthTip(mouthAction === 'suck' ? '레몬 흡입 중!' : '레몬즙 주르륵!', true, mouthAction === 'spit')
  } else {
    setMouthTip(mouthOpeningCount % 2 === 1 ? '한 번 더 벌리면 레몬즙 주르륵!' : '입을 벌리면 레몬 흡입!', false, false)
  }
}

function updateTracking() {
  const now = performance.now()
  const inferenceInterval = lowPowerDevice ? 42 : 32
  if (!cameraReady || !handLandmarker || !faceLandmarker || video.readyState < 2 || video.currentTime === lastDetectionTime || now - lastInferenceAt < inferenceInterval) return
  lastInferenceAt = now
  lastDetectionTime = video.currentTime
  try {
    const faceInterval = lowPowerDevice ? 126 : 96
    if (now - lastFaceInferenceAt >= faceInterval) {
      lastFaceInferenceAt = now
      readFace(faceLandmarker.detectForVideo(video, now))
    } else {
      readHands(handLandmarker.detectForVideo(video, now))
    }
  } catch {
    // Preserve the latest stable landmarks if a device drops an inference frame.
  }
}

function releaseHeldLemon() {
  if (!heldLemon || heldLemon.state === 'spent') return
  heldLemon.state = 'floating'
  heldLemon.vx = (Math.random() - .5) * 28
  heldLemon.vy = -18
  heldLemon.scaleY = Math.max(.76, heldLemon.scaleY)
  heldLemon = null
}

function spawnJuice(lemon: Lemon, amount: number) {
  const count = Math.max(1, Math.round(amount / .0032))
  for (let index = 0; index < count; index += 1) {
    drops.push({
      x: lemon.x + (Math.random() - .5) * lemon.radius * .35,
      y: lemon.y + lemon.radius * lemon.scaleY * .62,
      vx: (Math.random() - .5) * 34,
      vy: 92 + Math.random() * 55,
      radius: 3.2 + Math.random() * 2.4,
      amount: amount / count,
      life: 4,
    })
  }
}

function updateLemons(delta: number, time: number) {
  const leftHand = hands.find((hand) => hand.handedness === 'left')
  setGuideActive(leftGuide, Boolean(leftHand?.fist))

  if (!leftHand) releaseHeldLemon()
  const suctionActive = Boolean(mouth?.open && mouthAction === 'suck')
  const suctionRadius = clamp(Math.min(width, height) * .52, 190, 430)
  if (suctionActive && mouth) {
    if (heldLemon && distance(heldLemon, mouth) < suctionRadius) releaseHeldLemon()
    for (const lemon of lemons) {
      if (lemon.state === 'floating' && distance(lemon, mouth) < suctionRadius) lemon.state = 'sucked'
    }
  }

  if (leftHand?.fist && !heldLemon && !suctionActive) {
    let closest: Lemon | null = null
    let closestDistance = Number.POSITIVE_INFINITY
    for (const lemon of lemons) {
      if (lemon.state !== 'floating') continue
      const candidateDistance = distance(lemon, leftHand.palm)
      if (candidateDistance < lemon.radius + clamp(width * .08, 72, 115) && candidateDistance < closestDistance) {
        closest = lemon
        closestDistance = candidateDistance
      }
    }
    if (closest) {
      heldLemon = closest
      heldLemon.state = 'held'
    }
  }

  if (heldLemon && leftHand) {
    heldLemon.x += (leftHand.palm.x - heldLemon.x) * Math.min(1, delta * 16)
    heldLemon.y += (leftHand.palm.y - heldLemon.y) * Math.min(1, delta * 16)
    heldLemon.angle = Math.atan2(leftHand.points[5].y - leftHand.points[17].y, leftHand.points[5].x - leftHand.points[17].x)

    if (leftHand.fist) {
      const squeezeWave = .5 + .5 * Math.sin(time * .021)
      heldLemon.scaleY = clamp(1 - leftHand.squeeze * .5 - squeezeWave * .11, .38, .9)
      const used = Math.min(heldLemon.juice, delta * (.038 + leftHand.squeeze * .09))
      heldLemon.juice -= used
      if (used > 0) spawnJuice(heldLemon, used)
      if (heldLemon.juice <= .0001) {
        heldLemon.juice = 0
        heldLemon.state = 'spent'
        heldLemon.vx = (Math.random() - .5) * 55
        heldLemon.vy = 55
        heldLemon.angularVelocity = (Math.random() - .5) * 3.2
        heldLemon = null
      }
    } else {
      releaseHeldLemon()
    }
  }

  for (const lemon of lemons) {
    if (lemon.state === 'held') continue
    if (lemon.state === 'spent') {
      lemon.vy += 520 * delta
      lemon.x += lemon.vx * delta
      lemon.y += lemon.vy * delta
      lemon.angle += lemon.angularVelocity * delta
      lemon.scaleY += (.34 - lemon.scaleY) * Math.min(1, delta * 7)
      continue
    }
    if (lemon.state === 'sucked') {
      const mouthDistance = mouth ? distance(lemon, mouth) : Number.POSITIVE_INFINITY
      if (!suctionActive || !mouth || mouthDistance > suctionRadius * 1.18) {
        lemon.state = 'floating'
      } else {
        const toMouthX = mouth.x - lemon.x
        const toMouthY = mouth.y - lemon.y
        const safeDistance = Math.max(1, mouthDistance)
        const proximity = clamp(1 - mouthDistance / suctionRadius, 0, 1)
        const acceleration = 120 + proximity * proximity * 2650 + mouth.openness * proximity * 720
        const normalX = toMouthX / safeDistance
        const normalY = toMouthY / safeDistance
        const swirl = Math.sin(time * .012 + lemon.floatPhase) * proximity * 230
        lemon.vx += (normalX * acceleration - normalY * swirl) * delta
        lemon.vy += (normalY * acceleration + normalX * swirl) * delta
        const drag = Math.exp(-delta * (.62 + proximity * 1.45))
        lemon.vx *= drag
        lemon.vy *= drag
        const speed = Math.hypot(lemon.vx, lemon.vy)
        const maximumSpeed = 250 + proximity * 1050
        if (speed > maximumSpeed) {
          lemon.vx = lemon.vx / speed * maximumSpeed
          lemon.vy = lemon.vy / speed * maximumSpeed
        }
        lemon.x += lemon.vx * delta
        lemon.y += lemon.vy * delta
        lemon.angle += delta * (1.2 + proximity * 7 + mouth.openness * 2)
        const shrinkDistance = suctionRadius * .32
        const targetScale = mouthDistance < shrinkDistance
          ? clamp(mouthDistance / shrinkDistance, .08, 1)
          : 1
        lemon.suctionScale += (targetScale - lemon.suctionScale) * Math.min(1, delta * (5 + proximity * 7))
        if (mouthDistance < 22 + mouth.openness * 18) lemon.suctionScale = 0
        continue
      }
    }
    lemon.floatPhase += delta * .75
    lemon.x += lemon.vx * delta
    lemon.y += Math.sin(lemon.floatPhase) * 12 * delta + lemon.vy * delta
    lemon.angle += lemon.angularVelocity * delta
    lemon.scaleY += (1 - lemon.scaleY) * Math.min(1, delta * 4)
    lemon.suctionScale += (1 - lemon.suctionScale) * Math.min(1, delta * 5)
    if (lemon.x < lemon.radius * .55 || lemon.x > width - lemon.radius * .55) lemon.vx *= -1
    const minY = 95 + lemon.radius
    const maxY = height * .52
    if (lemon.y < minY) lemon.y = minY
    if (lemon.y > maxY) lemon.y = maxY
  }
  let lemonWriteIndex = 0
  for (const lemon of lemons) {
    if (lemon.y < height + lemon.radius * 3 && lemon.suctionScale > .035) lemons[lemonWriteIndex++] = lemon
  }
  lemons.length = lemonWriteIndex
  if (!lemons.length) {
    if (!emptySince) emptySince = time
    else if (time - emptySince > 1700) resetLemons()
  } else {
    emptySince = 0
  }
}

function spawnCupSpill(amount: number) {
  const count = Math.max(2, Math.ceil(amount / .0035))
  const rimX = cup.x + Math.sin(cup.rotation) * cup.height * .47
  const rimY = cup.y - Math.cos(cup.rotation) * cup.height * .47
  for (let index = 0; index < count; index += 1) {
    drops.push({
      x: rimX + (Math.random() - .5) * cup.width * .45,
      y: rimY + (Math.random() - .5) * 12,
      vx: cup.vx * .24 + (Math.random() - .5) * 290,
      vy: cup.vy * .18 - 105 - Math.random() * 190,
      radius: 4 + Math.random() * 4.5,
      amount: 0,
      life: 3.2,
    })
  }
}

function throwCup(velocity: Point) {
  cup.mode = 'thrown'
  cup.vx = velocity.x * .72
  cup.vy = velocity.y * .72 - 70
  cup.angularVelocity = clamp(velocity.x * .0055 + velocity.y * .002, -9, 9)
  const firstSpill = Math.min(targetLevel, .045)
  targetLevel -= firstSpill
  if (firstSpill > 0) spawnCupSpill(firstSpill)
  previousRightPalm = null
  smoothedRightVelocity = { x: 0, y: 0 }
}

function updateCup(delta: number, time: number) {
  const rightHand = hands.find((hand) => hand.handedness === 'right')
  if (cup.mode === 'thrown') {
    setGuideActive(rightGuide, false)
    cup.vy += 860 * delta
    cup.x += cup.vx * delta
    cup.y += cup.vy * delta
    cup.rotation += cup.angularVelocity * delta
    cup.angularVelocity *= Math.exp(-delta * .12)
    const speed = Math.hypot(cup.vx, cup.vy)
    const spilled = Math.min(targetLevel, delta * (.25 + speed / 1450))
    targetLevel -= spilled
    if (spilled > 0) spawnCupSpill(spilled)
    if (cup.y > height + cup.height || cup.x < -cup.width * 2 || cup.x > width + cup.width * 2) {
      cup.mode = 'returning'
      cup.returnAt = time + 650
      cup.x = width / 2
      cup.y = height + cup.height
      cup.vx = 0
      cup.vy = 0
      targetLevel = 0
    }
    lemonadeLevel += (targetLevel - lemonadeLevel) * Math.min(1, delta * 5)
    return
  }

  if (cup.mode === 'returning') {
    setGuideActive(rightGuide, false)
    if (time < cup.returnAt) return
    cup.mode = 'resting'
    cup.rotation = 0
  }

  setGuideActive(rightGuide, Boolean(rightHand))
  if (rightHand) {
    if (!previousRightPalm) {
      previousRightPalm = { ...rightHand.palm }
      previousRightSampleAt = time
      smoothedRightVelocity = { x: 0, y: 0 }
    } else if (distance(previousRightPalm, rightHand.palm) > .35) {
      const sampleDelta = clamp((time - previousRightSampleAt) / 1000, .016, .12)
      const sampleVelocity = {
        x: (rightHand.palm.x - previousRightPalm.x) / sampleDelta,
        y: (rightHand.palm.y - previousRightPalm.y) / sampleDelta,
      }
      smoothedRightVelocity.x += (sampleVelocity.x - smoothedRightVelocity.x) * .52
      smoothedRightVelocity.y += (sampleVelocity.y - smoothedRightVelocity.y) * .52
      previousRightPalm = { ...rightHand.palm }
      previousRightSampleAt = time
    }
    if (cup.mode !== 'held') {
      cup.mode = 'held'
      cup.heldSince = time
    }
    const throwThreshold = clamp(width * 1.25, 1050, 1550)
    if (time - cup.heldSince > 220 && Math.hypot(smoothedRightVelocity.x, smoothedRightVelocity.y) > throwThreshold) {
      throwCup(smoothedRightVelocity)
      return
    }
    cup.targetX = clamp(rightHand.palm.x, cup.width * .65, width - cup.width * .65)
    cup.targetY = clamp(rightHand.palm.y, cup.height * .55 + 70, height - cup.height * .5 - 82)
  } else {
    cup.mode = 'resting'
    previousRightPalm = null
    smoothedRightVelocity = { x: 0, y: 0 }
    cup.targetX = width / 2
    cup.targetY = height - cup.height * .5 - clamp(height * .11, 82, 104)
  }
  const smoothing = 1 - Math.exp(-delta * (rightHand ? 11 : 4.5))
  cup.x += (cup.targetX - cup.x) * smoothing
  cup.y += (cup.targetY - cup.y) * smoothing
  cup.rotation += (0 - cup.rotation) * Math.min(1, delta * 9)
  lemonadeLevel += (targetLevel - lemonadeLevel) * Math.min(1, delta * 4)
}

function spitStreamGeometry(time: number) {
  if (!mouth || mouthAction !== 'spit' || time >= spitUntil) return null
  const enter = clamp((time - spitStartedAt) / 150, 0, 1)
  const leave = clamp((spitUntil - time) / 230, 0, 1)
  const extension = Math.sin(Math.min(enter, leave) * Math.PI / 2)
  const sway = Math.sin(time * .013) * 8 + Math.sin(time * .0047) * 5
  const streamX = mouth.x + sway
  let endY = mouth.y + Math.max(52, (height - mouth.y + 35) * extension)
  const rimY = cup.y - cup.height * .48
  const cupCanCatch = cup.mode !== 'thrown'
    && streamX > cup.x - cup.width * .4
    && streamX < cup.x + cup.width * .4
    && rimY > mouth.y + 45
  if (cupCanCatch) endY = Math.min(endY, rimY + 4)
  return { streamX, endY, extension, cupCanCatch: cupCanCatch && endY >= rimY }
}

function updateMouthEffects(delta: number, time: number) {
  const stream = spitStreamGeometry(time)
  if (!stream) return
  if (stream.cupCanCatch) targetLevel = clamp(targetLevel + delta * .15, 0, 1)
}

function updateDrops(delta: number) {
  const left = cup.x - cup.width * .42
  const right = cup.x + cup.width * .42
  const rimY = cup.y - cup.height * .48
  const bottomY = cup.y + cup.height * .48

  for (const drop of drops) {
    drop.life -= delta
    drop.vy += 630 * delta
    drop.x += drop.vx * delta
    drop.y += drop.vy * delta

    if (cup.mode !== 'thrown' && drop.amount > 0 && drop.x > left && drop.x < right && drop.y >= rimY && drop.y <= bottomY && drop.vy > 0) {
      targetLevel = clamp(targetLevel + drop.amount, 0, 1)
      drop.life = 0
      for (let index = 0; index < 3; index += 1) {
        splashes.push({
          x: drop.x,
          y: Math.max(rimY + 8, bottomY - targetLevel * cup.height * .72),
          vx: (Math.random() - .5) * 74,
          vy: -35 - Math.random() * 45,
          life: .46,
          maxLife: .46,
        })
      }
    }
  }
  let dropWriteIndex = 0
  for (const drop of drops) {
    if (drop.life > 0 && drop.y < height + 35) drops[dropWriteIndex++] = drop
  }
  drops.length = dropWriteIndex

  for (const splash of splashes) {
    splash.life -= delta
    splash.vy += 180 * delta
    splash.x += splash.vx * delta
    splash.y += splash.vy * delta
  }
  let splashWriteIndex = 0
  for (const splash of splashes) {
    if (splash.life > 0) splashes[splashWriteIndex++] = splash
  }
  splashes.length = splashWriteIndex

  const displayPercent = Math.round(lemonadeLevel * 100)
  if (displayPercent !== lastFillDisplay) {
    lastFillDisplay = displayPercent
    fillPercent.textContent = `${displayPercent}%`
    meterFill.style.width = `${displayPercent}%`
  }
  if (displayPercent >= 88 && !completionShown) {
    completionShown = true
    completeToast.classList.remove('show')
    void completeToast.offsetWidth
    completeToast.classList.add('show')
  }
}

function drawLemon(lemon: Lemon) {
  const emptied = lemon.juice <= 0
  const squeezeX = emptied ? 1.18 : 1 + (1 - lemon.scaleY) * .18
  context.save()
  context.translate(lemon.x, lemon.y)
  context.rotate(lemon.angle)
  context.scale(squeezeX * lemon.suctionScale, lemon.scaleY * lemon.suctionScale)
  context.globalAlpha = emptied ? .72 : 1
  context.shadowColor = 'rgba(12, 20, 4, .4)'
  context.shadowBlur = 22
  context.shadowOffsetY = 10
  if (lemonImage.complete && lemonImage.naturalWidth) {
    const lemonHeight = lemon.radius * 1.62
    const lemonWidth = lemonHeight * lemonAspect
    context.drawImage(lemonRenderSource, -lemonWidth / 2, -lemonHeight / 2, lemonWidth, lemonHeight)
  } else {
    context.fillStyle = '#f0ed31'
    context.beginPath()
    context.ellipse(0, 0, lemon.radius, lemon.radius * .68, 0, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()

  if (lemon.state === 'floating') {
    const glowSize = lemon.radius * 2.7
    context.drawImage(lemonGlow, lemon.x - glowSize / 2, lemon.y - glowSize / 2, glowSize, glowSize)
  }
}

function drawSuction(time: number) {
  if (!mouth?.open || mouthAction !== 'suck') return
  context.save()
  context.lineCap = 'round'
  context.setLineDash([2, 11])
  context.lineDashOffset = -time * .045
  for (const lemon of lemons) {
    if (lemon.state !== 'sucked') continue
    const bend = Math.sin(lemon.floatPhase + time * .003) * 42
    context.strokeStyle = `rgba(239, 246, 57, ${.14 + mouth.openness * .27})`
    context.lineWidth = 2 + mouth.openness * 2
    context.beginPath()
    context.moveTo(lemon.x, lemon.y)
    context.bezierCurveTo(
      lemon.x + (mouth.x - lemon.x) * .34,
      lemon.y + bend,
      lemon.x + (mouth.x - lemon.x) * .73,
      mouth.y - bend * .45,
      mouth.x,
      mouth.y,
    )
    context.stroke()
  }
  context.restore()
}

function drawSpitStream(time: number) {
  const stream = spitStreamGeometry(time)
  if (!stream || !mouth) return
  const blobWidth = 20 + mouth.openness * 18
  const blobLength = 42 + mouth.openness * 22
  const neckY = mouth.y + blobLength
  const streamWidth = 5 + mouth.openness * 3 + Math.sin(time * .018) * .7
  const middleX = mouth.x + (stream.streamX - mouth.x) * .4

  context.save()
  context.shadowColor = 'rgba(205, 185, 18, .48)'
  context.shadowBlur = 12

  const blobGradient = context.createLinearGradient(mouth.x - blobWidth, mouth.y, mouth.x + blobWidth, neckY)
  blobGradient.addColorStop(0, '#fff58d')
  blobGradient.addColorStop(.42, '#f0df3c')
  blobGradient.addColorStop(1, '#cdb915')
  context.fillStyle = blobGradient
  context.beginPath()
  context.moveTo(mouth.x - blobWidth * .55, mouth.y - 2)
  context.bezierCurveTo(
    mouth.x - blobWidth * .72,
    mouth.y + blobLength * .28,
    mouth.x - blobWidth * .38,
    mouth.y + blobLength * .72,
    mouth.x - streamWidth * .5,
    neckY,
  )
  context.lineTo(mouth.x + streamWidth * .5, neckY)
  context.bezierCurveTo(
    mouth.x + blobWidth * .42,
    mouth.y + blobLength * .7,
    mouth.x + blobWidth * .72,
    mouth.y + blobLength * .27,
    mouth.x + blobWidth * .55,
    mouth.y - 2,
  )
  context.quadraticCurveTo(mouth.x, mouth.y + 9, mouth.x - blobWidth * .55, mouth.y - 2)
  context.fill()

  const streamGradient = context.createLinearGradient(mouth.x, neckY, stream.streamX, stream.endY)
  streamGradient.addColorStop(0, '#e9d52d')
  streamGradient.addColorStop(.55, '#e2ce26')
  streamGradient.addColorStop(1, '#c6b318')
  context.strokeStyle = streamGradient
  context.lineWidth = streamWidth
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(mouth.x, neckY - 2)
  context.bezierCurveTo(middleX - 5, neckY + 70, middleX + 5, stream.endY * .62 + neckY * .38, stream.streamX, stream.endY)
  context.stroke()

  context.shadowColor = 'transparent'
  context.strokeStyle = 'rgba(255, 255, 170, .58)'
  context.lineWidth = Math.max(1.2, streamWidth * .22)
  context.beginPath()
  context.moveTo(mouth.x - blobWidth * .18, mouth.y + 8)
  context.bezierCurveTo(mouth.x - 5, mouth.y + 31, middleX - 2, stream.endY * .62 + neckY * .38, stream.streamX - 1, stream.endY)
  context.stroke()

  if (!stream.cupCanCatch && stream.endY >= height - 4) {
    context.fillStyle = 'rgba(224, 203, 35, .62)'
    context.beginPath()
    context.ellipse(stream.streamX, height + 1, 26 + Math.sin(time * .02) * 4, 7, 0, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

function drawMouthTarget() {
  if (!mouth?.open) return
  if (mouthAction === 'spit') return
  const radius = 16 + mouth.openness * 19
  context.save()
  context.strokeStyle = `rgba(239, 246, 57, ${.42 + mouth.openness * .38})`
  context.fillStyle = `rgba(17, 23, 10, ${.12 + mouth.openness * .18})`
  context.lineWidth = 2.5
  context.shadowColor = 'rgba(233, 244, 49, .62)'
  context.shadowBlur = 18
  context.beginPath()
  context.ellipse(mouth.x, mouth.y, radius, radius * .7, 0, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.restore()
}

function cupPath() {
  const top = cup.y - cup.height / 2
  const bottom = cup.y + cup.height / 2
  context.beginPath()
  context.moveTo(cup.x - cup.width * .47, top)
  context.lineTo(cup.x - cup.width * .34, bottom)
  context.quadraticCurveTo(cup.x, bottom + 6, cup.x + cup.width * .34, bottom)
  context.lineTo(cup.x + cup.width * .47, top)
  context.closePath()
}

function drawLemonSlice(x: number, y: number, radius: number, angle: number) {
  context.save()
  context.translate(x, y)
  context.rotate(angle)
  context.fillStyle = '#f5ed59'
  context.strokeStyle = 'rgba(255, 255, 210, .82)'
  context.lineWidth = 3
  context.beginPath()
  context.arc(0, 0, radius, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.strokeStyle = 'rgba(255, 255, 221, .6)'
  context.lineWidth = 1.5
  for (let index = 0; index < 8; index += 1) {
    const angleStep = index * Math.PI / 4
    context.beginPath()
    context.moveTo(0, 0)
    context.lineTo(Math.cos(angleStep) * radius * .82, Math.sin(angleStep) * radius * .82)
    context.stroke()
  }
  context.restore()
}

function drawCup(time: number) {
  const top = cup.y - cup.height / 2
  const bottom = cup.y + cup.height / 2
  context.save()
  context.translate(cup.x, cup.y)
  context.rotate(cup.rotation)
  context.translate(-cup.x, -cup.y)

  context.shadowColor = 'rgba(0, 0, 0, .32)'
  context.shadowBlur = 26
  context.shadowOffsetY = 15
  cupPath()
  context.fillStyle = 'rgba(235, 255, 246, .08)'
  context.fill()
  context.shadowColor = 'transparent'

  context.save()
  cupPath()
  context.clip()
  const liquidHeight = cup.height * .74 * lemonadeLevel
  const liquidTop = bottom - 10 - liquidHeight
  const liquidGradient = context.createLinearGradient(0, liquidTop, 0, bottom)
  liquidGradient.addColorStop(0, 'rgba(244, 247, 77, .8)')
  liquidGradient.addColorStop(1, 'rgba(213, 226, 28, .9)')
  context.fillStyle = liquidGradient
  context.beginPath()
  context.rect(cup.x - cup.width, liquidTop, cup.width * 2, liquidHeight + 20)
  context.fill()
  context.fillStyle = 'rgba(255, 255, 184, .5)'
  context.beginPath()
  context.ellipse(cup.x, liquidTop, cup.width * .39, 6, 0, 0, Math.PI * 2)
  context.fill()

  const floatRise = lemonadeLevel * cup.height * .46
  const iceY = bottom - 49 - floatRise
  const icePositions = [-.22, .14, .31]
  for (let index = 0; index < icePositions.length; index += 1) {
    const iceX = cup.x + cup.width * icePositions[index]
    const bob = Math.sin(time * .002 + index * 1.7) * 4
    context.save()
    context.translate(iceX, iceY + bob + (index % 2) * 26)
    context.rotate((index - 1) * .24 + Math.sin(time * .001 + index) * .06)
    context.fillStyle = 'rgba(235, 255, 252, .38)'
    context.strokeStyle = 'rgba(255, 255, 255, .68)'
    context.lineWidth = 1.5
    context.beginPath()
    context.roundRect(-18, -15, 36, 30, 8)
    context.fill()
    context.stroke()
    context.restore()
  }
  drawLemonSlice(cup.x - cup.width * .12, bottom - 40 - floatRise * .82, cup.width * .21, -.35)
  context.restore()

  context.strokeStyle = 'rgba(241, 255, 249, .75)'
  context.lineWidth = 2
  cupPath()
  context.stroke()
  context.strokeStyle = 'rgba(255, 255, 255, .9)'
  context.lineWidth = 3
  context.beginPath()
  context.ellipse(cup.x, top, cup.width * .47, 10, 0, 0, Math.PI * 2)
  context.stroke()
  context.strokeStyle = 'rgba(255, 255, 255, .25)'
  context.lineWidth = 5
  context.beginPath()
  context.moveTo(cup.x - cup.width * .35, top + 23)
  context.lineTo(cup.x - cup.width * .27, bottom - 22)
  context.stroke()
  context.restore()
}

function drawDrops() {
  context.save()
  context.fillStyle = 'rgba(246, 249, 56, .92)'
  context.shadowColor = 'rgba(232, 244, 42, .62)'
  context.shadowBlur = 10
  for (const drop of drops) {
    context.save()
    context.translate(drop.x, drop.y)
    context.rotate(Math.atan2(drop.vy, drop.vx) - Math.PI / 2)
    context.beginPath()
    context.moveTo(0, -drop.radius * 1.6)
    context.bezierCurveTo(drop.radius, -.2 * drop.radius, drop.radius, drop.radius, 0, drop.radius * 1.2)
    context.bezierCurveTo(-drop.radius, drop.radius, -drop.radius, -.2 * drop.radius, 0, -drop.radius * 1.6)
    context.fill()
    context.restore()
  }
  context.restore()
  context.save()
  for (const splash of splashes) {
    context.globalAlpha = splash.life / splash.maxLife
    context.fillStyle = '#f5f646'
    context.beginPath()
    context.arc(splash.x, splash.y, 2.5, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

function drawHands() {
  for (const hand of hands) {
    const color = hand.handedness === 'left' ? '239, 246, 57' : '111, 239, 193'
    context.strokeStyle = `rgba(${color}, .5)`
    context.lineWidth = 2
    context.lineCap = 'round'
    for (const [start, end] of HAND_CONNECTIONS) {
      context.beginPath()
      context.moveTo(hand.points[start].x, hand.points[start].y)
      context.lineTo(hand.points[end].x, hand.points[end].y)
      context.stroke()
    }
    for (const point of hand.points) {
      context.fillStyle = `rgba(${color}, .72)`
      context.beginPath()
      context.arc(point.x, point.y, 2.5, 0, Math.PI * 2)
      context.fill()
    }
    context.strokeStyle = `rgba(${color}, ${hand.fist ? .9 : .35})`
    context.lineWidth = hand.fist ? 4 : 2
    context.beginPath()
    context.arc(hand.palm.x, hand.palm.y, hand.fist ? 28 : 18, 0, Math.PI * 2)
    context.stroke()
  }
}

function render(time: number) {
  if (!cameraReady && time - lastTime < 64) {
    requestAnimationFrame(render)
    return
  }
  const delta = Math.min(.033, (time - lastTime) / 1000)
  lastTime = time
  updateTracking()
  updateCup(delta, time)
  updateLemons(delta, time)
  updateMouthEffects(delta, time)
  updateDrops(delta)

  context.clearRect(0, 0, width, height)
  drawSuction(time)
  for (const lemon of lemons) drawLemon(lemon)
  drawSpitStream(time)
  drawCup(time)
  drawDrops()
  drawHands()
  drawMouthTarget()
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
  faceLandmarker?.close()
})

resize()
resetLemons()
requestAnimationFrame(render)
