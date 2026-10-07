import './type-vessel.css'
import { FilesetResolver, HandLandmarker, type NormalizedLandmark, type HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { clamp, localPoint, worldPoint, radiusAt, shapeProfile, cupCrossing, trackAngle, anchoredPose, type Point, type Pose } from './type-vessel-physics'

type Grip = { row: number; since: number; active: boolean }
type Hand = { id: string; palm: Point; pinchPoint: Point; open: boolean; closed: boolean; pinch: boolean; angle: number; seen: number; grip: Grip | null }
type BottleHold = { id: string; anchor: Point; handAngle: number; angle: number; seen: number; releaseSince: number; grabbed: boolean }
type Word = Point & { px: number; py: number; vx: number; vy: number; angle: number; spin: number; text: string; age: number }
type CaughtWord = { text: string; angle: number }
type SpillLetter = Point & { text: string; vx: number; vy: number; angle: number; spin: number; age: number; delay: number; onRim: boolean }

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <canvas class="type-canvas" aria-label="마우스나 손으로 빚는 문자 꽃병"></canvas>
  <video class="type-camera" playsinline muted aria-hidden="true"></video>
  <header class="type-header">
    <a class="type-brand" href="${import.meta.env.BASE_URL}#type-vessel"><strong>Type Vessel</strong><small>12 / a handful of words</small></a>
    <p class="type-state" role="status" aria-live="polite">손에 담는 문장.</p>
  </header>
  <p class="type-count">00 words collected</p>
  <section class="type-controls" aria-label="문자 꽃병 설정">
    <label class="type-word">word <input aria-label="따를 단어" value="love" maxlength="12" spellcheck="false"></label>
    <div class="type-buttons">
      <button id="type-camera" type="button">카메라 켜기</button>
      <button id="type-reset" type="button">다시 담기</button>
      <button id="type-pour" type="button" aria-pressed="false">기울이기</button>
    </div>
  </section>
  <p class="type-guide">꽃병 옆면을 드래그해 빚어보세요.<br>받침은 이동, 기울이기는 단어 따르기.</p>
  <p class="type-error" role="alert" hidden></p>
`

const canvas = document.querySelector<HTMLCanvasElement>('.type-canvas')!
const ctx = canvas.getContext('2d')!
const video = document.querySelector<HTMLVideoElement>('.type-camera')!
const cameraButton = document.querySelector<HTMLButtonElement>('#type-camera')!
const pourButton = document.querySelector<HTMLButtonElement>('#type-pour')!
const resetButton = document.querySelector<HTMLButtonElement>('#type-reset')!
const wordInput = document.querySelector<HTMLInputElement>('.type-word input')!
const status = document.querySelector<HTMLElement>('.type-state')!
const guide = document.querySelector<HTMLElement>('.type-guide')!
const countLabel = document.querySelector<HTMLElement>('.type-count')!
const error = document.querySelector<HTMLElement>('.type-error')!
const lowPower = (navigator.hardwareConcurrency || 8) <= 4
const ROWS = 25, CAPACITY = 64, CUP_CAPACITY = 36
const MAX_SPILL_LETTERS = lowPower ? 140 : 240
const profile = new Float32Array(ROWS)
const hands = new Map<string, Hand>()
const vessel: Pose = { x: 0, y: 0, angle: 0 }
const vesselTarget: Pose = { x: 0, y: 0, angle: 0 }
const cup = { x: 0, y: 0 }
const cupTarget = { x: 0, y: 0 }
const cameraFrame = document.createElement('canvas')
const cameraCtx = cameraFrame.getContext('2d')!
let width = innerWidth, height = innerHeight, dpr = 1, vaseHeight = 300, vaseWidth = 95, cupHeight = 115, cupWidth = 70
let model: HandLandmarker | null = null
let stream: MediaStream | null = null
let cameraOn = false, disposed = false, cameraPainted = false, manualPour = false
let supportId: string | null = null
let bottleHold: BottleHold | null = null
let pendingHold: { id: string; since: number } | null = null
let particles: Word[] = [], caught: CaughtWord[] = []
let spillLetters: SpillLetter[] = [], overflowCount = 0
let remaining = CAPACITY, emissionTime = 0, tiltSince = 0
let lastTime = performance.now(), lastInference = 0, lastVideoTime = -1, lastCameraPaint = 0
let pointer: { id: number; mode: 'shape' | 'vessel' | 'cup'; row: number; offset: Point } | null = null
let highlightedRow = -1

// One small, stable grain tile; no random per-frame texture churn.
const paper = document.createElement('canvas')
paper.width = paper.height = 160
const paperCtx = paper.getContext('2d')!
const grain = paperCtx.createImageData(160, 160)
let seed = 33219
for (let i = 0; i < grain.data.length; i += 4) {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0
  const n = seed >>> 24
  grain.data[i] = 93; grain.data[i + 1] = 75; grain.data[i + 2] = 36; grain.data[i + 3] = n % 17
}
paperCtx.putImageData(grain, 0, 0)
const paperPattern = ctx.createPattern(paper, 'repeat')!

function say(message: string) { if (status.textContent !== message) status.textContent = message }
function word() { return wordInput.value.trim().replace(/\s+/g, ' ').slice(0, 12) || 'love' }
function font(size: number) { return `${size}px "Courier New", ui-monospace, monospace` }

function reset() {
  for (let i = 0; i < ROWS; i++) {
    const t = i / (ROWS - 1)
    profile[i] = t < .28 ? .46 - Math.sin(t / .28 * Math.PI) * .12 : .46 + Math.sin((t - .28) / .72 * Math.PI) * .59
  }
  particles = []; caught = []; remaining = CAPACITY; tiltSince = 0; emissionTime = 0
  spillLetters = []; overflowCount = 0
  manualPour = false; pourButton.setAttribute('aria-pressed', 'false')
  supportId = null; bottleHold = null; pendingHold = null; hands.forEach((hand) => { hand.grip = null })
  vesselTarget.x = width * .31; vesselTarget.y = height * .72; vesselTarget.angle = 0
  cupTarget.x = width * .77; cupTarget.y = height * .73
  Object.assign(vessel, vesselTarget); Object.assign(cup, cupTarget)
  countLabel.textContent = '00 words collected'
}

function resize() {
  const sx = innerWidth / width, sy = innerHeight / height
  width = innerWidth; height = innerHeight
  vaseHeight = Math.min(height * .49, width * .88, 410)
  vaseWidth = vaseHeight * .30; cupWidth = Math.min(vaseHeight * .20, width * .18); cupHeight = vaseHeight * .37
  dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt((lowPower ? 1_800_000 : 3_000_000) / (width * height)))
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  vessel.x *= sx; vessel.y *= sy; vesselTarget.x *= sx; vesselTarget.y *= sy
  cup.x *= sx; cup.y *= sy; cupTarget.x *= sx; cupTarget.y *= sy
  hands.clear(); bottleHold = null; supportId = null; pendingHold = null; pointer = null; cameraPainted = false
  const scale = Math.min(1, Math.sqrt(900_000 / (width * height)))
  cameraFrame.width = Math.round(width * scale); cameraFrame.height = Math.round(height * scale)
}

function screenPoint(p: NormalizedLandmark): Point {
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720
  const scale = Math.max(width / vw, height / vh)
  return { x: width - (p.x * vw * scale - (vw * scale - width) / 2), y: p.y * vh * scale - (vh * scale - height) / 2 }
}

async function setupTracking() {
  const vision = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}lemonade/mediapipe`)
  const options = { runningMode: 'VIDEO' as const, numHands: 2, minHandDetectionConfidence: .55, minHandPresenceConfidence: .5, minTrackingConfidence: .5 }
  try {
    return await HandLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}lemonade/mediapipe/hand_landmarker.task`, delegate: 'GPU' } })
  } catch {
    return await HandLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}lemonade/mediapipe/hand_landmarker.task`, delegate: 'CPU' } })
  }
}

function stopCamera() {
  stream?.getTracks().forEach((track) => track.stop()); stream = null
  video.pause(); video.srcObject = null
  cameraOn = cameraPainted = false; hands.clear(); supportId = null; bottleHold = null; pendingHold = null
  Object.assign(vesselTarget, vessel)
  cameraButton.textContent = '카메라 켜기'
  guide.innerHTML = '꽃병 옆면을 드래그해 빚어보세요.<br>받침은 이동, 기울이기는 단어 따르기.'
}

async function toggleCamera() {
  if (cameraOn) { stopCamera(); return }
  cameraButton.disabled = true; error.hidden = true; say('카메라를 준비하고 있어요.')
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
    if (disposed) { stopCamera(); return }
    if (!model) model = await setupTracking()
    if (disposed) { stopCamera(); model?.close(); model = null; return }
    video.srcObject = stream; await video.play()
    cameraOn = true; lastVideoTime = -1; supportId = null
    cameraButton.textContent = '카메라 끄기'
    guide.innerHTML = '병 몸통에서 주먹을 쥐고 손목을 기울여요.<br>손을 펴면 놓기 · 반대 손 핀치로 빚기.'
  } catch (reason) {
    stopCamera()
    error.textContent = reason instanceof DOMException && reason.name === 'NotAllowedError'
      ? '카메라 권한을 허용해주세요. 지금은 마우스나 터치로 체험할 수 있어요.'
      : '카메라 또는 손 추적을 준비하지 못했어요. 마우스나 터치로 먼저 체험할 수 있어요.'
    error.hidden = false
  } finally { cameraButton.disabled = false }
}

function readHands(result: HandLandmarkerResult, now: number) {
  result.landmarks.forEach((landmarks, index) => {
    const id = result.handedness[index]?.[0]?.categoryName ?? `hand-${index}`
    const p = landmarks.map(screenPoint)
    const span = Math.max(28, Math.hypot(p[5].x - p[17].x, p[5].y - p[17].y))
    const ratio = Math.hypot(p[4].x - p[8].x, p[4].y - p[8].y) / span
    const previous = hands.get(id)
    const pinch = ratio < (previous?.pinch ? .57 : .37)
    let extended = 0
    for (const tip of [8, 12, 16, 20]) {
      if (Math.hypot(p[tip].x - p[0].x, p[tip].y - p[0].y) > Math.hypot(p[tip - 2].x - p[0].x, p[tip - 2].y - p[0].y) * 1.12) extended++
    }
    const palm = { x: (p[0].x + p[5].x + p[9].x + p[13].x + p[17].x) / 5, y: (p[0].y + p[5].y + p[9].y + p[13].y + p[17].y) / 5 }
    // Wrist-to-knuckles stays directed when the palm turns sideways or closes.
    const dx = (p[5].x + p[9].x + p[13].x + p[17].x) / 4 - p[0].x
    const dy = (p[5].y + p[9].y + p[13].y + p[17].y) / 4 - p[0].y
    const measured = Math.atan2(dy, dx) + Math.PI / 2
    const dt = previous ? clamp((now - previous.seen) / 1000, .001, .15) : .06
    const angle = previous
      ? Math.hypot(dx, dy) < span * .35 ? previous.angle : trackAngle(previous.angle, measured, dt)
      : measured
    const hand: Hand = previous ?? { id, palm, pinchPoint: p[8], open: false, closed: false, pinch, angle, seen: now, grip: null }
    const blend = previous ? 1 - Math.exp(-dt * 18) : 1
    hand.palm = { x: hand.palm.x + (palm.x - hand.palm.x) * blend, y: hand.palm.y + (palm.y - hand.palm.y) * blend }
    hand.angle = angle
    hand.pinchPoint = { x: (p[4].x + p[8].x) / 2, y: (p[4].y + p[8].y) / 2 }
    hand.open = !pinch && extended >= 3; hand.closed = extended === 0 || (extended <= 1 && !pinch); hand.pinch = pinch; hand.seen = now
    if (!pinch) hand.grip = null
    hands.set(id, hand)
  })
}

function edgeAt(point: Point) {
  const p = localPoint(point, vessel)
  const row = (p.y + vaseHeight) / vaseHeight * (ROWS - 1)
  if (row < -1 || row > ROWS) return null
  const radius = radiusAt(profile, row) * vaseWidth
  return Math.abs(Math.abs(p.x) - radius) < 24 ? { row: Math.round(clamp(row, 0, ROWS - 1)), p } : null
}

function holdBottle(hand: Hand, now: number, grabbed: boolean) {
  supportId = hand.id
  bottleHold = { id: hand.id, anchor: grabbed ? localPoint(hand.palm, vessel) : { x: 0, y: 0 },
    handAngle: hand.angle, angle: vessel.angle, seen: now, releaseSince: 0, grabbed }
  pendingHold = null; hand.grip = null
  manualPour = false; pourButton.setAttribute('aria-pressed', 'false')
}

function updateBottleHold(now: number) {
  if (pointer) return
  if (!supportId) {
    const first = Array.from(hands.values()).find((hand) => hand.open && now - hand.seen < 150)
    if (first) holdBottle(first, now, false)
  }
  const candidate = Array.from(hands.values()).find((hand) => {
    if (!hand.closed || now - hand.seen > 150 || (bottleHold?.grabbed && bottleHold.id === hand.id)) return false
    if (bottleHold?.grabbed) return false
    const p = localPoint(hand.palm, vessel)
    const row = (p.y + vaseHeight) / vaseHeight * (ROWS - 1)
    return row >= 0 && row < ROWS && Math.abs(p.x) < radiusAt(profile, row) * vaseWidth + 24
  })
  if (!candidate) pendingHold = null
  else if (pendingHold?.id !== candidate.id) pendingHold = { id: candidate.id, since: now }
  else if (now - pendingHold.since >= 140) holdBottle(candidate, now, true)

  const hold = bottleHold, hand = hold ? hands.get(hold.id) : null
  // Missing observations leave the last pose intact, never spring it upright.
  if (!hold || !hand || now - hand.seen > 150) {
    if (hold) hold.releaseSince = 0
    return
  }
  if (now - hold.seen > 220) {
    hold.handAngle = hand.angle; hold.angle = vessel.angle
    hold.anchor = localPoint(hand.palm, vessel)
  }
  hold.seen = hand.seen
  if (hold.grabbed && hand.open) {
    if (!hold.releaseSince) hold.releaseSince = now
    if (now - hold.releaseSince >= 180) {
      Object.assign(vesselTarget, vessel); bottleHold = null
      return
    }
  } else hold.releaseSince = 0
  const angle = clamp(hold.angle + hand.angle - hold.handAngle, -1.45, 1.45)
  Object.assign(vesselTarget, anchoredPose(hold.anchor, hand.palm, angle))
}

function updateTracking(now: number) {
  for (const [id, hand] of hands) if (now - hand.seen > 220) hands.delete(id)
  if (!cameraOn || !model || video.readyState < 2) return
  if (now - lastInference > (lowPower ? 83 : 62) && video.currentTime !== lastVideoTime) {
    lastInference = now; lastVideoTime = video.currentTime
    try { readHands(model.detectForVideo(video, now), now) } catch { /* Brief missing frames do not change roles or deform the vessel. */ }
  }
  updateBottleHold(now)
  highlightedRow = -1
  hands.forEach((hand) => {
    if (hand.id === supportId) return
    if (hand.open && !pointer) { cupTarget.x = hand.palm.x; cupTarget.y = hand.palm.y }
    if (!hand.pinch || hand.closed) return
    if (!hand.grip) {
      const edge = edgeAt(hand.pinchPoint)
      if (edge) hand.grip = { row: edge.row, since: now, active: false }
      return
    }
    const grip = hand.grip
    if (!grip.active) {
      if (!edgeAt(hand.pinchPoint)) { hand.grip = null; return }
      if (now - grip.since < 160) return
      grip.active = true
    }
    const p = localPoint(hand.pinchPoint, vessel)
    shapeProfile(profile, grip.row, Math.abs(p.x) / vaseWidth)
    highlightedRow = grip.row
  })
}

function updatePoses(delta: number) {
  const blend = 1 - Math.exp(-delta * 12)
  const angle = manualPour ? .72 : vesselTarget.angle
  vessel.angle += (angle - vessel.angle) * blend
  vessel.x += (vesselTarget.x - vessel.x) * blend
  vessel.y += (vesselTarget.y - vessel.y) * blend
  // A held bottle is allowed beyond the viewport; containment must not fight the hand.
  if (!cameraOn && !supportId) {
    vessel.y = clamp(vessel.y, vaseHeight + 75, Math.max(vaseHeight + 75, height - 155))
    let min = 0, max = 0
    for (let i = 0; i < ROWS; i++) {
      for (const sign of [-1, 1]) {
        const p = worldPoint({ x: profile[i] * vaseWidth * sign, y: -vaseHeight + i / (ROWS - 1) * vaseHeight }, { x: 0, y: 0, angle: vessel.angle })
        min = Math.min(min, p.x); max = Math.max(max, p.x)
      }
    }
    vessel.x = clamp(vessel.x, 15 - min, Math.max(15 - min, width - 15 - max))
  }
  cup.x += (cupTarget.x - cup.x) * blend; cup.y += (cupTarget.y - cup.y) * blend
  cup.x = clamp(cup.x, cupWidth + 12, width - cupWidth - 12)
  cup.y = clamp(cup.y, cupHeight + 120, Math.max(cupHeight + 120, height - 150))
}

function emit(now: number) {
  if (Math.abs(vessel.angle) < .43 || !remaining) { tiltSince = 0; return }
  if (!tiltSince) tiltSince = now
  if (now - tiltSince < 180 || now < emissionTime || particles.length >= 90) return
  const direction = Math.sign(vessel.angle)
  const lip = worldPoint({ x: profile[0] * vaseWidth * direction, y: -vaseHeight }, vessel)
  particles.push({ ...lip, px: lip.x, py: lip.y, vx: direction * (10 + Math.abs(vessel.angle) * 15), vy: 10,
    angle: vessel.angle * .3, spin: (Math.random() - .5) * .7, text: word(), age: 0 })
  remaining--
  emissionTime = now + 135 + (1 - Math.abs(vessel.angle)) * 170
}

function overflowWord(text: string, entryX: number) {
  const letters = Array.from(text).filter((letter) => !/\s/.test(letter))
  overflowCount++
  for (let i = 0; i < letters.length; i++) {
    const x = clamp(entryX + (i - (letters.length - 1) / 2) * 9, -cupWidth + 8, cupWidth - 8)
    const direction = Math.abs(x) < 3 ? (i % 2 ? 1 : -1) : Math.sign(x)
    spillLetters.push({ text: letters[i], x, y: -cupHeight - 9, vx: direction * (12 + i % 3 * 3), vy: 0,
      angle: 0, spin: direction * (.35 + i % 3 * .18), age: 0, delay: i * .045, onRim: true })
  }
  // Fixed budget even for long custom words; no growing particle history.
  if (spillLetters.length > MAX_SPILL_LETTERS) spillLetters.splice(0, spillLetters.length - MAX_SPILL_LETTERS)
  countLabel.textContent = `${caught.length} held · ${overflowCount} broken`
}

function updateSpill(delta: number, previousCup: Point) {
  spillLetters = spillLetters.filter((p) => {
    p.age += delta
    if (p.age < p.delay) return true
    if (p.onRim) {
      const direction = Math.sign(p.vx)
      p.vx = direction * Math.min(72, Math.abs(p.vx) + 42 * delta)
      p.x += p.vx * delta
      p.y = -cupHeight - 9 - Math.sin((p.age - p.delay) * 5) * 2
      p.angle += p.spin * delta * .25
      if (Math.abs(p.x) >= cupWidth + 5) {
        p.onRim = false; p.x += cup.x; p.y += cup.y
        p.vx = p.vx * .35 + clamp((cup.x - previousCup.x) / delta, -100, 100) * .25
        p.vy = 16 + clamp((cup.y - previousCup.y) / delta, -40, 80) * .2
      }
    } else {
      p.vy += 155 * delta; p.vx *= Math.exp(-.7 * delta)
      p.x += p.vx * delta; p.y += p.vy * delta; p.angle += p.spin * delta
    }
    return p.age < 9 && (p.onRim || (p.y < height + 60 && p.x > -100 && p.x < width + 100))
  })
}

function updateWords(delta: number, previousCup: Point) {
  particles = particles.filter((p) => {
    p.px = p.x; p.py = p.y
    p.vy += 235 * delta; p.vx *= Math.exp(-.30 * delta)
    p.x += p.vx * delta; p.y += p.vy * delta; p.angle += p.spin * delta; p.age += delta
    const entryX = cupCrossing({ x: p.px, y: p.py }, p, previousCup, cup, cupWidth, cupHeight)
    if (entryX !== null) {
      const displaced = caught.length >= CUP_CAPACITY ? caught.shift() : null
      caught.push({ text: p.text, angle: (Math.random() - .5) * .12 })
      if (displaced) overflowWord(displaced.text, entryX)
      else countLabel.textContent = `${String(caught.length).padStart(2, '0')} words collected`
      return false
    }
    return p.y < height + 80 && p.x > -160 && p.x < width + 160 && p.age < 8
  })
}

function paintPaper(now: number) {
  ctx.fillStyle = '#e8e1ca'; ctx.fillRect(0, 0, width, height)
  if (cameraOn && video.readyState >= 2 && now - lastCameraPaint > (lowPower ? 83 : 42)) {
    lastCameraPaint = now
    const w = cameraFrame.width, h = cameraFrame.height
    const scale = Math.max(w / video.videoWidth, h / video.videoHeight)
    cameraCtx.save()
    cameraCtx.clearRect(0, 0, w, h)
    cameraCtx.translate(w, 0); cameraCtx.scale(-1, 1)
    cameraCtx.filter = 'grayscale(1) sepia(.8) contrast(.72) brightness(1.12)'
    cameraCtx.drawImage(video, (w - video.videoWidth * scale) / 2, (h - video.videoHeight * scale) / 2, video.videoWidth * scale, video.videoHeight * scale)
    cameraCtx.restore(); cameraPainted = true
  }
  if (cameraPainted) {
    ctx.globalAlpha = .49; ctx.drawImage(cameraFrame, 0, 0, width, height); ctx.globalAlpha = 1
  }
  ctx.fillStyle = paperPattern; ctx.fillRect(0, 0, width, height)
}

function paintVessel(now: number) {
  const size = clamp(vaseHeight / ROWS * 1.03, 11, 19)
  const letters = Array.from(word())
  ctx.save(); ctx.translate(vessel.x, vessel.y); ctx.rotate(vessel.angle)
  ctx.font = font(size); ctx.fillStyle = '#2622bb'; ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  const rim = Math.max(4, Math.round(profile[0] * vaseWidth * 2 / (size * .60)))
  ctx.fillText('_'.repeat(rim), 0, -vaseHeight - size * .8)
  for (let i = 0; i < ROWS; i++) {
    const y = -vaseHeight + i / (ROWS - 1) * vaseHeight
    const r = profile[i] * vaseWidth
    const slope = profile[Math.min(ROWS - 1, i + 1)] - profile[Math.max(0, i - 1)]
    const glyph = i % 6 === 0 ? '*' : Math.abs(slope) < .025 ? ':' : slope > 0 ? '/' : '\\'
    ctx.textAlign = 'left'; ctx.fillText(glyph, -r, y)
    const count = clamp(Math.round(r / size * .82), 2, 7)
    // Ink at the right edge gives the vase its distinctive typographic weight.
    ctx.textAlign = 'right'; ctx.fillText(letters[i % letters.length].repeat(count), r, y)
    if (i === highlightedRow) { ctx.textAlign = 'center'; ctx.fillText(']', r + size, y) }
  }
  ctx.textAlign = 'center'
  const base = Math.round(profile[ROWS - 1] * vaseWidth * 1.8 / (size * .60))
  ctx.fillText('e'.repeat(Math.max(3, base)), 0, 0)
  // Sparse interior words show the remaining contents without filling the silhouette.
  ctx.globalAlpha = .45
  ctx.font = font(size * .72)
  const rows = Math.ceil(remaining / 8)
  for (let i = 0; i < rows; i++) {
    ctx.fillText(word(), Math.sin(i * 2.3) * vaseWidth * .16, -size * (1.9 + i * 1.5))
  }
  ctx.globalAlpha = 1
  if (!cameraOn) {
    ctx.font = font(12); ctx.globalAlpha = .55
    ctx.fillText('— drag —', 0, 22 + Math.sin(now * .001) * 1.5)
  }
  ctx.restore()
}

function paintCup() {
  const size = clamp(cupHeight / 9, 11, 16)
  ctx.save(); ctx.translate(cup.x, cup.y); ctx.font = font(size); ctx.fillStyle = '#2622bb'; ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText('_'.repeat(Math.max(4, Math.round(cupWidth * 2 / (size * .6)))), 0, -cupHeight - 8)
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, x = cupWidth * (1 - t * .23)
    ctx.fillText('\\', -x, -cupHeight + t * cupHeight)
    ctx.fillText('/', x, -cupHeight + t * cupHeight)
  }
  ctx.fillText('_'.repeat(Math.max(4, Math.round(cupWidth * 1.45 / (size * .6)))), 0, 0)
  ctx.beginPath(); ctx.rect(-cupWidth * .70, -cupHeight - 2, cupWidth * 1.4, cupHeight - size * .25 + 2); ctx.clip()
  ctx.font = font(12)
  const available = cupWidth * 1.4
  const longest = Math.max(24, ...caught.map((p) => ctx.measureText(p.text).width))
  const columns = clamp(Math.floor(available / (longest + 6)), 1, 3)
  const rows = Math.max(2, Math.floor((cupHeight - size) / 14))
  const rowHeight = (cupHeight - size - 8) / (rows - 1)
  const visible = caught.slice(-columns * rows)
  const occupiedRows = Math.ceil(visible.length / columns)
  const fill = Math.min(1, caught.length / CUP_CAPACITY)
  const stackHeight = (rows - 1) * rowHeight * fill
  for (let i = 0; i < visible.length; i++) {
    const p = visible[i], x = ((i % columns) - (columns - 1) / 2) * available / columns
    const y = -size - Math.floor(i / columns) * stackHeight / Math.max(1, occupiedRows - 1)
    ctx.save(); ctx.translate(x, y); ctx.rotate(p.angle)
    ctx.fillText(p.text, 0, 0, available / columns - 4); ctx.restore()
  }
  ctx.restore()
}

function render(now: number) {
  const delta = clamp((now - lastTime) / 1000, .001, .04); lastTime = now
  if (!document.hidden && !disposed) {
    const oldCup = { ...cup }
    updateTracking(now); updatePoses(delta); emit(now); updateWords(delta, oldCup); updateSpill(delta, oldCup)
    paintPaper(now); paintVessel(now); paintCup()
    ctx.fillStyle = '#2622bb'; ctx.font = font(clamp(vaseHeight / 23, 12, 17)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    for (const p of particles) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle); ctx.fillText(p.text, 0, 0); ctx.restore()
    }
    for (const p of spillLetters) {
      ctx.save()
      ctx.translate(p.x + (p.onRim ? cup.x : 0), p.y + (p.onRim ? cup.y : 0)); ctx.rotate(p.angle)
      ctx.globalAlpha = Math.min(1, (9 - p.age) / .8)
      ctx.fillText(p.text, 0, 0); ctx.restore()
    }
    if (overflowCount) say('사랑은, 넘치면 부서진다.')
    else if (!remaining) say('모두 따랐어요. 담긴 단어는 여기 남아요.')
    else if (caught.length === CUP_CAPACITY) say('가득 찼어요. 더 따르면, 단어가 넘쳐요.')
    else if (highlightedRow >= 0) say('집은 채로 천천히 빚어보세요.')
    else if (Math.abs(vessel.angle) > .43) say('흐르는 단어를 컵으로 받아보세요.')
    else if (cameraOn && !hands.size) say('편 손바닥을 보여주세요.')
    else if (bottleHold?.grabbed) say('잡은 손목을 기울여요. 손을 펴면 놓아요.')
    else if (cameraOn) say('몸통에서 주먹으로 잡고, 핀치로 빚어요.')
    else say('손에 담는 문장.')
  }
  if (!disposed) requestAnimationFrame(render)
}

function pointerPoint(event: PointerEvent) { const r = canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top } }
canvas.addEventListener('pointerdown', (event) => {
  if (pointer) return
  const p = pointerPoint(event), edge = edgeAt(p), local = localPoint(p, vessel)
  if (p.x > cup.x - cupWidth - 15 && p.x < cup.x + cupWidth + 15 && p.y > cup.y - cupHeight - 15 && p.y < cup.y + 35) {
    pointer = { id: event.pointerId, mode: 'cup', row: 0, offset: { x: p.x - cupTarget.x, y: p.y - cupTarget.y } }
  } else if (local.y > -25 && local.y < 45 && Math.abs(local.x) < vaseWidth) {
    pointer = { id: event.pointerId, mode: 'vessel', row: 0, offset: { x: p.x - vesselTarget.x, y: p.y - vesselTarget.y } }
  } else if (edge) pointer = { id: event.pointerId, mode: 'shape', row: edge.row, offset: { x: 0, y: 0 } }
  if (pointer) { canvas.setPointerCapture(event.pointerId); event.preventDefault() }
})
canvas.addEventListener('pointermove', (event) => {
  if (!pointer || pointer.id !== event.pointerId) return
  const p = pointerPoint(event)
  if (pointer.mode === 'shape') {
    const local = localPoint(p, vessel); shapeProfile(profile, pointer.row, Math.abs(local.x) / vaseWidth); highlightedRow = pointer.row
  } else {
    const target = pointer.mode === 'cup' ? cupTarget : vesselTarget
    target.x = p.x - pointer.offset.x; target.y = p.y - pointer.offset.y
  }
})
function releasePointer(event: PointerEvent) { if (pointer?.id === event.pointerId) { pointer = null; highlightedRow = -1 } }
canvas.addEventListener('pointerup', releasePointer)
canvas.addEventListener('pointercancel', releasePointer)
canvas.addEventListener('lostpointercapture', releasePointer)
pourButton.addEventListener('click', () => {
  manualPour = !manualPour; pourButton.setAttribute('aria-pressed', String(manualPour))
  if (manualPour && !cameraOn) {
    // Put the demo cup under the stream once; it remains freely draggable afterward.
    const pose = { ...vessel, angle: .72 }
    let rightmost = 0
    for (let i = 0; i < ROWS; i++) {
      rightmost = Math.max(rightmost, worldPoint({ x: profile[i] * vaseWidth, y: -vaseHeight + i / (ROWS - 1) * vaseHeight }, { x: 0, y: 0, angle: pose.angle }).x)
    }
    pose.x = Math.min(pose.x, width - 15 - rightmost)
    const lip = worldPoint({ x: profile[0] * vaseWidth, y: -vaseHeight }, pose)
    const fallTime = Math.sqrt(Math.max(0, cup.y - cupHeight - lip.y) * 2 / 235)
    cupTarget.x = lip.x + 20.8 * fallTime
  }
})
cameraButton.addEventListener('click', () => void toggleCamera())
resetButton.addEventListener('click', reset)
window.addEventListener('resize', resize)
document.addEventListener('visibilitychange', () => {
  hands.clear(); pointer = null
  stream?.getVideoTracks().forEach((track) => { track.enabled = !document.hidden })
  if (document.hidden) video.pause()
  else if (cameraOn) void video.play().catch(() => stopCamera())
})
window.addEventListener('pagehide', () => { disposed = true; stopCamera(); model?.close(); model = null })
resize(); reset(); requestAnimationFrame(render)
