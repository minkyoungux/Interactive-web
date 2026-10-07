import './paper-face.css'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

type Phase = 'idle' | 'loading' | 'live' | 'error'
type Point = { x: number; y: number; z?: number }
type Crop = { x: number; y: number; width: number; height: number }
type Tile = { col: number; row: number; x: number; y: number; width: number; height: number; dx: number; dy: number; rotation: number; depth: number; curl: boolean; falling: boolean; fallen: boolean; fallX: number; fallY: number; fallVx: number; fallVy: number; fallAngle: number; fallSpin: number }

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <main class="pf-app" data-phase="idle">
    <canvas class="pf-canvas" tabindex="0" aria-label="포스트잇 조각으로 재구성되는 라이브 얼굴 포스터. 고개를 좌우로 흔들면 종이가 한 장씩 떨어집니다."></canvas>
    <video class="pf-video" playsinline muted aria-hidden="true"></video>
    <header class="pf-header">
      <a class="pf-brand" href="${import.meta.env.BASE_URL}#paper-face"><i aria-hidden="true"></i><span>PAPER FACE<small>LIVE PORTRAIT / 20</small></span></a>
      <div class="pf-status" role="status" aria-live="polite"><i></i><span>CAMERA OFF</span></div>
    </header>
    <section class="pf-intro">
      <p>PORTRAIT STUDY · 2026</p>
      <h1>A FACE,<br><em>IN PIECES.</em></h1>
      <span>한 장의 얼굴을 여러 장의 종이로.<br>움직일 때마다 조금씩 다른 포스터가 됩니다.</span>
    </section>
    <div class="pf-sidecopy" aria-hidden="true">CUT · SHIFT · REASSEMBLE</div>
    <section class="pf-controls" aria-label="Paper Face 설정">
      <div class="pf-control-head"><span>LIVE COLLAGE</span><b>01 / CAMERA</b></div>
      <label><span>종이 들뜸 <output id="pf-lift-value">54%</output></span><input id="pf-lift" type="range" min="10" max="100" value="54" /></label>
      <div class="pf-motion" aria-live="polite"><i></i><span>고개를 좌우로 흔들어보세요</span></div>
      <p class="pf-error" role="alert" hidden></p>
      <div class="pf-actions"><button class="pf-camera" type="button">카메라 켜기 ↗</button><button class="pf-remix" type="button">다시 섞기</button><button class="pf-save" type="button" aria-label="포스터 PNG 저장">↓</button></div>
      <small>얼굴 영상은 이 기기 안에서만 처리됩니다.</small>
    </section>
    <footer class="pf-footer"><span>MOVE CLOSER · FILL THE FRAME</span><span>YOUR FACE / YOUR POSTER</span></footer>
  </main>
`

const root = document.querySelector<HTMLElement>('.pf-app')!
const canvas = document.querySelector<HTMLCanvasElement>('.pf-canvas')!
const ctx = canvas.getContext('2d')!
const video = document.querySelector<HTMLVideoElement>('.pf-video')!
const cameraButton = document.querySelector<HTMLButtonElement>('.pf-camera')!
const remixButton = document.querySelector<HTMLButtonElement>('.pf-remix')!
const saveButton = document.querySelector<HTMLButtonElement>('.pf-save')!
const status = document.querySelector<HTMLElement>('.pf-status span')!
const error = document.querySelector<HTMLElement>('.pf-error')!
const liftInput = document.querySelector<HTMLInputElement>('#pf-lift')!
const liftValue = document.querySelector<HTMLOutputElement>('#pf-lift-value')!
const motion = document.querySelector<HTMLElement>('.pf-motion')!
const motionText = motion.querySelector<HTMLElement>('span')!

const portrait = document.createElement('canvas')
portrait.width = 760
portrait.height = 1000
const portraitCtx = portrait.getContext('2d')!
const inference = document.createElement('canvas')
const inferenceCtx = inference.getContext('2d')!
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const lifetime = new AbortController()
const on = { signal: lifetime.signal }

let phase: Phase = 'idle'
let stream: MediaStream | null = null
let model: FaceLandmarker | null = null
let frame = 0
let disposed = false
let generation = 0
let lastVideoTime = -1
let lastInferenceAt = -Infinity
let faceSeenAt = -Infinity
let faceFound = false
let presence = 0
let seed = 20260923
let tiles: Tile[] = []
let lift = .54
let crop: Crop | null = null
let targetCrop: Crop | null = null
let pointer = { x: .5, y: .5, active: false }
let width = innerWidth
let height = innerHeight
let dpr = 1
let lastFrame = performance.now()
let smoothYaw = 0
let shakeSide = 0
let shakeExtremeAt = -Infinity
let shakeNeedsCenter = false
let shakeCooldownUntil = -Infinity

const xStops = [0, .18, .39, .61, .82, 1]
const yStops = [0, .145, .315, .49, .68, .855, 1]
const noteSets = [
  ['FRAGMENTS\nOF TODAY', 'NOT QUITE\nSYMMETRICAL', 'A FACE IS\nNEVER STILL', 'KEEP THIS\nVERSION'],
  ['LOOK HERE,\nTHEN MOVE', 'PAPER / SKIN\nLIGHT / SHADOW', 'ONE OF ONE\nLIVE EDITION', 'ASSEMBLED\nBY CAMERA'],
  ['CUT ALONG\nTHE FEELING', 'A SMALL\nSELF PORTRAIT', 'SHIFTED BUT\nSTILL YOURS', 'DO NOT\nSMOOTH OUT'],
]

function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 4294967296
}

function makeTiles() {
  const next: Tile[] = []
  for (let row = 0; row < yStops.length - 1; row++) for (let col = 0; col < xStops.length - 1; col++) {
    const x = xStops[col], y = yStops[row]
    next.push({
      col, row, x, y,
      width: xStops[col + 1] - x,
      height: yStops[row + 1] - y,
      dx: (random() - .5) * 2,
      dy: (random() - .5) * 2,
      rotation: (random() - .5) * 2,
      depth: .3 + random() * .7,
      curl: random() > .72,
      falling: false, fallen: false,
      fallX: 0, fallY: 0, fallVx: 0, fallVy: 0, fallAngle: 0, fallSpin: 0,
    })
  }
  tiles = next
}

function setPhase(next: Phase, message?: string) {
  phase = next
  root.dataset.phase = next
  error.hidden = next !== 'error'
  if (next === 'error') error.textContent = message ?? '카메라를 열지 못했어요.'
  cameraButton.disabled = next === 'loading'
  cameraButton.textContent = next === 'loading' ? '준비 중…' : next === 'live' ? '카메라 끄기 ×' : '카메라 켜기 ↗'
  if (next === 'idle') status.textContent = 'CAMERA OFF'
  if (next === 'loading') status.textContent = 'PREPARING CAMERA'
  if (next === 'error') status.textContent = 'CAMERA UNAVAILABLE'
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2)
  context.beginPath()
  context.moveTo(x + r, y)
  context.arcTo(x + w, y, x + w, y + h, r)
  context.arcTo(x + w, y + h, x, y + h, r)
  context.arcTo(x, y + h, x, y, r)
  context.arcTo(x, y, x + w, y, r)
  context.closePath()
}

function posterRect() {
  const mobile = width < 700
  const maxWidth = width - (mobile ? 42 : 410)
  const posterHeight = Math.min(height * (mobile ? .68 : .76), maxWidth / .76)
  const posterWidth = posterHeight * .76
  return { x: (width - posterWidth) / 2, y: (height - posterHeight) / 2 - (mobile ? 13 : 1), width: posterWidth, height: posterHeight }
}

function coverCrop(points: Point[]): Crop {
  let minX = 1, minY = 1, maxX = 0, maxY = 0
  const oval = [10, 338, 297, 332, 284, 389, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
  oval.forEach(index => {
    const point = points[index]
    if (!point) return
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y)
  })
  const videoWidth = video.videoWidth || 960, videoHeight = video.videoHeight || 720
  const faceWidth = (maxX - minX) * videoWidth, faceHeight = (maxY - minY) * videoHeight
  let cropHeight = Math.max(faceHeight * 1.78, faceWidth * 1.42 / .76)
  let cropWidth = cropHeight * .76
  if (cropHeight > videoHeight) { cropHeight = videoHeight; cropWidth = cropHeight * .76 }
  if (cropWidth > videoWidth) { cropWidth = videoWidth; cropHeight = cropWidth / .76 }
  const centerX = (minX + maxX) * .5 * videoWidth
  const centerY = (minY + maxY) * .5 * videoHeight + faceHeight * .11
  return {
    x: Math.max(0, Math.min(videoWidth - cropWidth, centerX - cropWidth / 2)),
    y: Math.max(0, Math.min(videoHeight - cropHeight, centerY - cropHeight / 2)),
    width: cropWidth,
    height: cropHeight,
  }
}

function updatePortrait() {
  if (!crop || video.readyState < 2) return
  portraitCtx.save()
  portraitCtx.clearRect(0, 0, portrait.width, portrait.height)
  portraitCtx.translate(portrait.width, 0)
  portraitCtx.scale(-1, 1)
  portraitCtx.filter = 'contrast(1.055) saturate(.78) brightness(1.05)'
  portraitCtx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, portrait.width, portrait.height)
  portraitCtx.restore()
  const gradient = portraitCtx.createLinearGradient(0, 0, portrait.width, portrait.height)
  gradient.addColorStop(0, 'rgba(207,215,220,.06)')
  gradient.addColorStop(.52, 'rgba(255,245,218,.035)')
  gradient.addColorStop(1, 'rgba(91,102,110,.08)')
  portraitCtx.fillStyle = gradient
  portraitCtx.fillRect(0, 0, portrait.width, portrait.height)
}

function drawPaperTile(tile: Tile, poster: ReturnType<typeof posterRect>, now: number) {
  if (tile.fallen) return
  const baseX = poster.x + tile.x * poster.width
  const baseY = poster.y + tile.y * poster.height
  const tileWidth = tile.width * poster.width + 1.2
  const tileHeight = tile.height * poster.height + 1.2
  const centerX = baseX + tileWidth / 2
  const centerY = baseY + tileHeight / 2
  const outwardX = (centerX - width / 2) / Math.max(1, poster.width / 2)
  const outwardY = (centerY - height / 2) / Math.max(1, poster.height / 2)
  const idleScatter = (1 - presence) * (18 + tile.depth * 35)
  const motion = reducedMotion.matches ? 0 : Math.sin(now * .00065 + tile.col * 1.7 + tile.row * 2.1) * 1.2 * presence
  const offsetX = tile.dx * (2 + lift * 8) + outwardX * idleScatter + (pointer.x - .5) * tile.depth * 7 + tile.fallX
  const offsetY = tile.dy * (2 + lift * 7) + outwardY * idleScatter + motion + (pointer.y - .5) * tile.depth * 5 + tile.fallY
  const angle = (tile.rotation * (1.1 + lift * 1.8) + (1 - presence) * tile.rotation * 2.4) * Math.PI / 180 + tile.fallAngle

  ctx.save()
  ctx.translate(centerX + offsetX, centerY + offsetY)
  ctx.rotate(angle)
  ctx.shadowColor = `rgba(35, 38, 39, ${.12 + tile.depth * .15})`
  ctx.shadowBlur = 5 + tile.depth * 11
  ctx.shadowOffsetX = 1 + tile.depth * 3
  ctx.shadowOffsetY = 4 + tile.depth * 8
  ctx.fillStyle = '#e9e6dc'
  roundedRect(ctx, -tileWidth / 2, -tileHeight / 2, tileWidth, tileHeight, 1.2)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.save()
  roundedRect(ctx, -tileWidth / 2, -tileHeight / 2, tileWidth, tileHeight, 1)
  ctx.clip()
  if (presence > .015) {
    ctx.globalAlpha = Math.min(1, presence * 1.3)
    ctx.drawImage(
      portrait,
      Math.round(tile.x * portrait.width), Math.round(tile.y * portrait.height),
      Math.ceil(tile.width * portrait.width), Math.ceil(tile.height * portrait.height),
      -tileWidth / 2, -tileHeight / 2, tileWidth, tileHeight,
    )
    ctx.globalAlpha = 1
  } else {
    const shade = 234 - ((tile.col * 7 + tile.row * 5) % 13)
    ctx.fillStyle = `rgb(${shade},${shade + 1},${shade - 3})`
    ctx.fillRect(-tileWidth / 2, -tileHeight / 2, tileWidth, tileHeight)
  }
  ctx.fillStyle = 'rgba(255,250,234,.045)'
  ctx.fillRect(-tileWidth / 2, -tileHeight / 2, tileWidth, tileHeight)
  ctx.restore()
  ctx.strokeStyle = 'rgba(66,66,61,.13)'
  ctx.lineWidth = .65
  roundedRect(ctx, -tileWidth / 2, -tileHeight / 2, tileWidth, tileHeight, 1.2)
  ctx.stroke()
  if (tile.curl) {
    const curl = Math.min(12, tileWidth * .13, tileHeight * .18)
    ctx.beginPath(); ctx.moveTo(tileWidth / 2 - curl, tileHeight / 2); ctx.lineTo(tileWidth / 2, tileHeight / 2 - curl); ctx.lineTo(tileWidth / 2, tileHeight / 2); ctx.closePath()
    ctx.fillStyle = 'rgba(246,244,233,.78)'; ctx.fill()
    ctx.strokeStyle = 'rgba(50,48,43,.12)'; ctx.beginPath(); ctx.moveTo(tileWidth / 2 - curl, tileHeight / 2); ctx.lineTo(tileWidth / 2, tileHeight / 2 - curl); ctx.stroke()
  }
  ctx.restore()
}

function drawNote(x: number, y: number, w: number, h: number, angle: number, text: string, tone: number) {
  ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(angle)
  ctx.shadowColor = 'rgba(35,38,39,.22)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 7
  ctx.fillStyle = ['#eee9d7', '#e7e6dc', '#f0e9c8'][tone % 3]
  ctx.fillRect(-w / 2, -h / 2, w, h); ctx.shadowColor = 'transparent'
  const wash = ctx.createLinearGradient(0, -h / 2, 0, h / 2)
  wash.addColorStop(.72, 'rgba(255,255,255,0)'); wash.addColorStop(1, 'rgba(91,87,72,.08)')
  ctx.fillStyle = wash; ctx.fillRect(-w / 2, -h / 2, w, h)
  ctx.fillStyle = '#34332e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.font = `italic 600 ${Math.max(8, w * .096)}px Georgia, serif`
  const lines = text.split('\n')
  lines.forEach((line, index) => ctx.fillText(line, 0, (index - (lines.length - 1) / 2) * w * .13))
  ctx.restore()
}

function drawBackground(now: number) {
  const gradient = ctx.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#dde1e3'); gradient.addColorStop(.55, '#d5dade'); gradient.addColorStop(1, '#cbd1d5')
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = 'rgba(68,78,84,.055)'; ctx.lineWidth = 1
  for (let i = 0; i < 13; i++) {
    const x = ((i * 137.3) % width), y = ((i * 81.7) % height)
    ctx.beginPath(); ctx.moveTo(x - 90, y + Math.sin(i + now * .00003) * 2); ctx.quadraticCurveTo(x, y - 7, x + 140, y + 5); ctx.stroke()
  }
  ctx.fillStyle = 'rgba(47,57,62,.08)'
  for (let y = 5; y < height; y += 13) for (let x = 7 + (y % 3); x < width; x += 17) ctx.fillRect(x, y, .55, .55)
}

function drawPoster(now: number) {
  const poster = posterRect()
  ctx.save(); ctx.shadowColor = 'rgba(47,52,55,.16)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 15
  ctx.fillStyle = '#d7d6cf'; ctx.fillRect(poster.x + 2, poster.y + 2, poster.width - 4, poster.height - 4); ctx.restore()
  tiles.filter(tile => !tile.falling).forEach(tile => drawPaperTile(tile, poster, now))
  tiles.filter(tile => tile.falling).forEach(tile => drawPaperTile(tile, poster, now))

  const noteWidth = Math.max(70, poster.width * .25), noteHeight = noteWidth * .72
  const notes = noteSets[Math.abs(seed) % noteSets.length]
  if (width > 620) {
    drawNote(poster.x - noteWidth * .62, poster.y + poster.height * .13, noteWidth, noteHeight, -.065, notes[0], 0)
    drawNote(poster.x + poster.width - noteWidth * .34, poster.y + poster.height * .07, noteWidth, noteHeight, .035, notes[1], 2)
    drawNote(poster.x - noteWidth * .48, poster.y + poster.height * .70, noteWidth, noteHeight, .045, notes[2], 2)
    drawNote(poster.x + poster.width - noteWidth * .58, poster.y + poster.height * .82, noteWidth, noteHeight, -.03, notes[3], 0)
  }

  ctx.fillStyle = '#31373a'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  ctx.font = `500 ${Math.max(9, Math.min(13, width * .009))}px Arial, sans-serif`
  ctx.letterSpacing = '3px'
  ctx.fillText(faceFound ? 'LIVE PORTRAIT · HOLD STILL / OR DON’T' : 'SHOW YOUR FACE TO ASSEMBLE THE PORTRAIT', width / 2, Math.max(25, poster.y - 27))
  ctx.font = `300 ${Math.max(22, Math.min(39, poster.width * .075))}px Arial, sans-serif`
  ctx.letterSpacing = '7px'
  ctx.fillText('PAPER / FACE', width / 2, Math.min(height - 24, poster.y + poster.height + 48))
  ctx.letterSpacing = '0px'
}

function render(now: number) {
  drawBackground(now)
  drawPoster(now)
}

function resize() {
  width = innerWidth; height = innerHeight; dpr = Math.min(devicePixelRatio || 1, 1.75)
  canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr))
  canvas.style.width = `${width}px`; canvas.style.height = `${height}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

function processFace(points: Point[], now: number) {
  const reacquired = now - faceSeenAt > 420
  targetCrop = coverCrop(points)
  if (!crop) crop = { ...targetCrop }
  faceSeenAt = now
  if (reacquired) resetShake()
  trackHeadShake(points, now)
}

function infer(now: number) {
  if (!model || video.readyState < 2 || video.currentTime === lastVideoTime || now - lastInferenceAt < 70) return
  lastVideoTime = video.currentTime; lastInferenceAt = now
  const inferWidth = navigator.hardwareConcurrency <= 4 ? 400 : 520
  const inferHeight = Math.max(1, Math.round(inferWidth * video.videoHeight / video.videoWidth))
  if (inference.width !== inferWidth || inference.height !== inferHeight) { inference.width = inferWidth; inference.height = inferHeight }
  inferenceCtx.drawImage(video, 0, 0, inferWidth, inferHeight)
  const result = model.detectForVideo(inference, now)
  const points = result.faceLandmarks[0] as Point[] | undefined
  if (points?.length >= 468) processFace(points, now)
}

function dropOne() {
  const available = tiles.filter(tile => !tile.falling && !tile.fallen)
  if (!available.length) { motionText.textContent = '모두 떨어졌어요 · 다시 섞어주세요'; return false }
  // Edge and lower pieces loosen first, so the collage keeps a readable face for longer.
  const weighted = available.map(tile => ({ tile, weight: 1 + tile.row * .4 + (tile.col === 0 || tile.col === 4 ? 1.1 : 0) }))
  let pick = random() * weighted.reduce((sum, item) => sum + item.weight, 0)
  let tile = weighted.at(-1)!.tile
  for (const item of weighted) { pick -= item.weight; if (pick <= 0) { tile = item.tile; break } }
  tile.falling = true
  tile.fallVx = (random() - .5) * width * .13
  tile.fallVy = -height * (.035 + random() * .055)
  tile.fallSpin = (random() < .5 ? -1 : 1) * (.8 + random() * 1.7)
  tile.fallAngle = 0
  motionText.textContent = 'WHOOSH · 종이 한 장이 떨어졌어요'
  motion.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-2px)' }, { transform: 'translateY(0)' }], { duration: 260 })
  return true
}

function updateFalling(dt: number) {
  const poster = posterRect()
  for (const tile of tiles) {
    if (!tile.falling || tile.fallen) continue
    tile.fallVy += height * 1.46 * dt
    tile.fallX += tile.fallVx * dt
    tile.fallY += tile.fallVy * dt
    tile.fallAngle += tile.fallSpin * dt
    const originalY = poster.y + (tile.y + tile.height / 2) * poster.height
    if (originalY + tile.fallY > height + tile.height * poster.height + 50) tile.fallen = true
  }
}

function resetShake(message = '고개를 좌우로 흔들어보세요') {
  smoothYaw = 0; shakeSide = 0; shakeExtremeAt = -Infinity; shakeNeedsCenter = false; shakeCooldownUntil = -Infinity
  motion.style.setProperty('--turn-x', '50%')
  motionText.textContent = message
}

function trackHeadShake(points: Point[], now: number) {
  const left = points[234], right = points[454], nose = points[1]
  if (!left || !right || !nose) return
  const span = Math.abs(right.x - left.x)
  if (span < .03) return
  const midpoint = (left.x + right.x) / 2
  const rawYaw = Math.max(-1, Math.min(1, (nose.x - midpoint) / span * 4.2))
  smoothYaw += (rawYaw - smoothYaw) * .42
  motion.style.setProperty('--turn-x', `${Math.max(7, Math.min(93, 50 + smoothYaw * 43))}%`)

  if (now < shakeCooldownUntil) return
  if (shakeNeedsCenter) {
    if (Math.abs(smoothYaw) < .11) {
      shakeNeedsCenter = false; shakeSide = 0
      if (tiles.some(tile => !tile.falling && !tile.fallen)) motionText.textContent = '다음 한 장 · 다시 좌우로 흔들어보세요'
    }
    return
  }

  const side = smoothYaw > .24 ? 1 : smoothYaw < -.24 ? -1 : 0
  if (!side) {
    if (shakeSide && now - shakeExtremeAt > 1400) { shakeSide = 0; motionText.textContent = '조금 더 크게 좌우로 흔들어보세요' }
    return
  }
  if (!shakeSide) {
    shakeSide = side; shakeExtremeAt = now
    motionText.textContent = '좋아요 · 이제 반대쪽으로!'
    return
  }
  if (side !== shakeSide) {
    if (now - shakeExtremeAt <= 1400) {
      dropOne(); shakeNeedsCenter = true; shakeCooldownUntil = now + 260
    } else {
      shakeSide = side; shakeExtremeAt = now; motionText.textContent = '한 번 더 반대쪽으로 흔들어보세요'
    }
  }
}

function tick(now: number) {
  frame = 0
  if (disposed || document.hidden) return
  const dt = Math.min(.05, (now - lastFrame) / 1000); lastFrame = now
  if (phase === 'live') {
    try { infer(now) } catch (cause) { console.error('Paper Face inference failed', cause); stopCamera(); setPhase('error', '얼굴 인식 중 문제가 생겼어요. 다시 시작해주세요.') }
  }
  const wasFaceFound = faceFound
  faceFound = phase === 'live' && now - faceSeenAt < 420
  if (wasFaceFound && !faceFound) resetShake('얼굴을 다시 보여주세요')
  const targetPresence = faceFound ? 1 : 0
  presence += (targetPresence - presence) * (1 - Math.exp(-dt * (targetPresence > presence ? 5.5 : 2.6)))
  if (crop && targetCrop) {
    const ease = 1 - Math.exp(-dt * 7)
    crop.x += (targetCrop.x - crop.x) * ease; crop.y += (targetCrop.y - crop.y) * ease
    crop.width += (targetCrop.width - crop.width) * ease; crop.height += (targetCrop.height - crop.height) * ease
    updatePortrait()
  }
  updateFalling(dt)
  if (phase === 'live') status.textContent = faceFound ? 'FACE FOUND · ASSEMBLING' : 'LOOK HERE · WAITING FOR A FACE'
  render(now)
  frame = requestAnimationFrame(tick)
}

async function createModel(token: number) {
  const vision = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`)
  for (const delegate of ['GPU', 'CPU'] as const) {
    let candidate: FaceLandmarker | null = null
    try {
      if (disposed || token !== generation) return
      candidate = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/face_landmarker.task`, delegate },
        runningMode: 'VIDEO', numFaces: 1,
        minFaceDetectionConfidence: .48, minFacePresenceConfidence: .48, minTrackingConfidence: .48,
      })
      if (disposed || token !== generation) { candidate.close(); return }
      model = candidate; return
    } catch (cause) {
      candidate?.close()
      if (delegate === 'CPU') throw cause
    }
  }
}

function stopCamera() {
  generation++
  stream?.getTracks().forEach(track => track.stop()); stream = null
  video.pause(); video.srcObject = null
  model?.close(); model = null
  lastVideoTime = -1; lastInferenceAt = faceSeenAt = -Infinity
  targetCrop = crop = null; faceFound = false
  resetShake()
  setPhase('idle')
}

async function startCamera() {
  if (disposed || phase === 'loading') return
  if (phase === 'live') { stopCamera(); return }
  const token = ++generation
  setPhase('loading')
  let step: 'camera' | 'model' = 'camera'
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('secure')
    const acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } })
    if (disposed || token !== generation) { acquired.getTracks().forEach(track => track.stop()); return }
    stream = acquired; video.srcObject = acquired; await video.play()
    step = 'model'; await createModel(token)
    if (disposed || token !== generation || !model) return
    acquired.getVideoTracks()[0]?.addEventListener('ended', () => { if (token === generation) { stopCamera(); setPhase('error', '카메라 연결이 끊겼어요.') } }, { once: true })
    setPhase('live')
  } catch (cause) {
    if (disposed || token !== generation) return
    stream?.getTracks().forEach(track => track.stop()); stream = null
    video.srcObject = null; model?.close(); model = null
    const denied = cause instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(cause.name)
    setPhase('error', cause instanceof Error && cause.message === 'secure' ? '카메라는 localhost 또는 HTTPS에서 사용할 수 있어요.' : denied ? '카메라 권한을 허용한 뒤 다시 시작해주세요.' : step === 'model' ? '얼굴 인식 모델을 열지 못했어요.' : '카메라를 열지 못했어요.')
  }
}

function remix() {
  seed = (Date.now() ^ Math.round(Math.random() * 0xffffffff)) >>> 0
  makeTiles()
  resetShake()
  remixButton.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-5deg)' }, { transform: 'rotate(0)' }], { duration: 280 })
}

function savePoster() {
  canvas.toBlob(blob => {
    if (!blob) return
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = `paper-face-${new Date().toISOString().slice(0, 10)}.png`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 20_000)
  }, 'image/png')
}

function pointerPosition(event: PointerEvent) { pointer.x = event.clientX / width; pointer.y = event.clientY / height }
canvas.addEventListener('pointermove', event => { pointerPosition(event); pointer.active = true }, on)
canvas.addEventListener('pointerleave', () => { pointer.active = false; pointer.x = pointer.y = .5 }, on)
canvas.addEventListener('pointerdown', event => { pointerPosition(event); remix() }, on)
canvas.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); remix() }
}, on)
cameraButton.addEventListener('click', () => { void startCamera() }, on)
remixButton.addEventListener('click', remix, on)
saveButton.addEventListener('click', savePoster, on)
liftInput.addEventListener('input', () => { lift = Number(liftInput.value) / 100; liftValue.value = `${liftInput.value}%` }, on)
window.addEventListener('resize', resize, on)
document.addEventListener('visibilitychange', () => {
  stream?.getTracks().forEach(track => { track.enabled = !document.hidden })
  if (document.hidden) { cancelAnimationFrame(frame); frame = 0 }
  else if (!frame && !disposed) { lastFrame = performance.now(); frame = requestAnimationFrame(tick) }
}, on)
function dispose() {
  if (disposed) return
  disposed = true; lifetime.abort(); cancelAnimationFrame(frame)
  stream?.getTracks().forEach(track => track.stop()); video.srcObject = null; model?.close(); model = null
  inference.width = inference.height = portrait.width = portrait.height = canvas.width = canvas.height = 1
}
window.addEventListener('interactive:dispose', dispose, on)
window.addEventListener('pagehide', dispose, on)
window.addEventListener('pageshow', event => { if (event.persisted) location.reload() }, on)
if (import.meta.hot) import.meta.hot.dispose(dispose)

makeTiles(); resize(); setPhase('idle'); frame = requestAnimationFrame(tick)
