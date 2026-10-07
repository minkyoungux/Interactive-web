import './rubber-human.css'
import { FaceLandmarker, FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'
import { createRubberRenderer } from './rubber-human-renderer'
import { zero, length, localPoint, worldPoint, flowPoint, springStep, insidePolygon, type Point, type Pose } from './rubber-human-physics'

document.body.classList.add('rubber-page')
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <canvas class="rubber-canvas" tabindex="0" aria-label="고무 얼굴. 얼굴 위를 드래그하거나 카메라를 켜고 엄지와 검지로 집어 당겨보세요. Escape 키로 초기화."></canvas>
  <video class="rubber-camera" playsinline muted aria-hidden="true"></video>
  <header class="rubber-header">
    <a class="rubber-brand" href="${import.meta.env.BASE_URL}#rubber-human"><b>고무 인간</b><small>13 / RUBBER HUMAN</small></a>
    <div class="rubber-state" role="status" aria-live="polite">드래그로 먼저 만져보세요</div>
  </header>
  <section class="rubber-intro">
    <p class="rubber-kicker">A LITTLE STRETCH OF THE ORDINARY</p>
    <h1>말랑하게.<br>쭈우욱<em>—</em></h1>
    <p>오늘의 얼굴은 고무.<br>살짝 집고, 마음껏 늘리고, 톡 놓아보세요.</p>
  </section>
  <div class="rubber-guide"><span>PINCH → PULL → RELEASE</span><br>얼굴 위에서 엄지와 검지를 맞대고 당겨요.<br>손가락을 벌리면, 탱글하게 제자리로.</div>
  <section class="rubber-controls" aria-label="고무 인간 조작">
    <p class="rubber-error" role="alert" hidden></p>
    <div class="rubber-buttons">
      <button class="primary" id="camera-start" type="button">카메라 켜기 ↗</button>
      <button id="rubber-reset" type="button">다시 말랑하게</button>
    </div>
    <p class="rubber-note">영상은 이 기기에서만 처리됩니다. 마우스·터치로도 당길 수 있어요.</p>
  </section>
`
const canvas = document.querySelector<HTMLCanvasElement>('.rubber-canvas')!
const ctx = canvas.getContext('2d')!
const video = document.querySelector<HTMLVideoElement>('.rubber-camera')!
const state = document.querySelector<HTMLElement>('.rubber-state')!
const error = document.querySelector<HTMLElement>('.rubber-error')!
const cameraButton = document.querySelector<HTMLButtonElement>('#camera-start')!
const source = document.createElement('canvas')
source.width = source.height = 768
const sourceCtx = source.getContext('2d')!
// Fixed work surfaces avoid allocating multiple 768px canvases per texture refresh.
const makeSurface = () => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = source.width
  return { canvas, ctx: canvas.getContext('2d')! }
}
let workspace: { photo: ReturnType<typeof makeSurface>; rim: ReturnType<typeof makeSurface>;
  photoMask: ReturnType<typeof makeSurface>; silhouette: ReturnType<typeof makeSurface> } | null = null
let demoDots = new Path2D(), demoShadow = new Path2D()
const frame = document.createElement('canvas')
const frameCtx = frame.getContext('2d', { willReadFrequently: true })!
let rubber: ReturnType<typeof createRubberRenderer> | null = null
try { rubber = createRubberRenderer(source) } catch {
  error.hidden = false; error.textContent = '이 예제에는 WebGL이 필요해요. 브라우저의 그래픽 가속을 켠 뒤 다시 열어주세요.'
  cameraButton.disabled = true
}
const OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
let width = innerWidth, height = innerHeight, dpr = 1
let pose: Pose = { center: zero(), right: { x: 150, y: 0 }, down: { x: 0, y: 190 } }
let outline: Point[] = [], sourceOutline: Point[] = []
let cheekLeft = [199, 167, 126], cheekRight = [216, 185, 143]
let handModel: HandLandmarker | null = null, faceModel: FaceLandmarker | null = null
let stream: MediaStream | null = null
let cameraOn = false, starting = false, disposed = false, hasTexture = false
let faceSeen = 0, lastVideoTime = -1, lastInference = 0, lastFrame = performance.now(), animation = 0
let handPoint: Point | null = null, handWrist: Point | null = null, handSeen = 0, pinched = false
let handNear = false, pointerId: number | null = null, grip: 'hand' | 'pointer' | null = null
type Bandage = { point: Point; angle: number; appliedAt: number }
let bandages: Bandage[] = []
let pendingBandage: Omit<Bandage, 'appliedAt'> | null = null
let swelling = 0
let target = zero(), anchor = zero(), pull = zero(), velocity = zero()
let lastTextureAt = 0
let outlineRevision = 0, maskRevision = -1, frameRevision = 0, textureRevision = 0
let previousRenderState: number[] = []
let inFrame = false
function wakeLoop(resetClock = true) {
  if (disposed || document.hidden || animation) return
  if (resetClock && !inFrame) lastFrame = performance.now()
  animation = requestAnimationFrame(tick)
}
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
function say(text: string) { if (state.textContent !== text) state.textContent = text }
function reset() { bandages = []; pendingBandage = null; swelling = 0; grip = null; pull = zero(); velocity = zero(); anchor = zero(); pointerId = null; wakeLoop() }
function path(context: CanvasRenderingContext2D, points: Point[], expansion = 1) {
  context.beginPath()
  const last = points[points.length - 1], first = points[0]
  context.moveTo((last.x + first.x) * .5 * expansion, (last.y + first.y) * .5 * expansion)
  points.forEach((p, i) => {
    const next = points[(i + 1) % points.length]
    context.quadraticCurveTo(p.x * expansion, p.y * expansion, (p.x + next.x) * .5 * expansion, (p.y + next.y) * .5 * expansion)
  })
  context.closePath()
}
function demo() {
  const size = Math.min(width * (width < 640 ? .3 : .18), height * .265)
  pose = { center: { x: width * (width < 640 ? .52 : .61), y: height * .51 }, right: { x: size * .79, y: 0 }, down: { x: 0, y: size } }
  outline = Array.from({ length: 72 }, (_, i) => {
    const a = i / 72 * Math.PI * 2
    return { x: Math.cos(a) * (.94 - .08 * Math.sin(a)), y: Math.sin(a) }
  })
  outlineRevision++
  sourceOutline = outline.map(p => ({ ...p }))
  sourceCtx.setTransform(1, 0, 0, 1, 0, 0); sourceCtx.clearRect(0, 0, source.width, source.height)
  sourceCtx.setTransform(source.width / 2.5, 0, 0, source.height / 2.5, source.width / 2, source.height / 2)
  path(sourceCtx, outline)
  const gradient = sourceCtx.createRadialGradient(-.4, -.5, .1, .25, .2, 1.6)
  gradient.addColorStop(0, '#e7efb4'); gradient.addColorStop(.5, '#c4d78b'); gradient.addColorStop(1, '#8fa557')
  sourceCtx.fillStyle = gradient; sourceCtx.fill(); sourceCtx.save(); sourceCtx.clip()
  sourceCtx.restore()
  sourceCtx.fillStyle = '#273a24'
  for (const x of [-.34, .34]) { sourceCtx.beginPath(); sourceCtx.ellipse(x, -.2, .06, .1, 0, 0, Math.PI * 2); sourceCtx.fill() }
  sourceCtx.strokeStyle = '#607941'; sourceCtx.lineWidth = .025; sourceCtx.lineCap = 'round'
  sourceCtx.beginPath(); sourceCtx.moveTo(.01, -.07); sourceCtx.quadraticCurveTo(-.15, .22, .09, .17); sourceCtx.stroke()
  sourceCtx.strokeStyle = '#273a24'; sourceCtx.lineWidth = .033
  sourceCtx.beginPath(); sourceCtx.moveTo(-.3, .4); sourceCtx.bezierCurveTo(-.15, .6, .18, .6, .34, .36); sourceCtx.stroke()
  cheekLeft = [188, 205, 140]; cheekRight = [188, 205, 140]
  hasTexture = true; textureRevision++; rubber?.updateTexture()
}
function resize() {
  width = innerWidth; height = innerHeight; dpr = Math.min(devicePixelRatio || 1, 1.5)
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
  frame.width = Math.round(width); frame.height = Math.round(height)
  previousRenderState = []
  rubber?.resize(width, height, dpr)
  reset()
  if (!cameraOn) demo()
  else { hasTexture = false; faceSeen = 0; lastVideoTime = -1 }
  paintDemoBackground(); wakeLoop()
}
function videoPoint(p: NormalizedLandmark): Point {
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight)
  return { x: width / 2 + (.5 - p.x) * video.videoWidth * scale, y: height / 2 + (p.y - .5) * video.videoHeight * scale }
}
function paintCamera() {
  const scale = Math.max(width / video.videoWidth, height / video.videoHeight)
  frameCtx.setTransform(-scale, 0, 0, scale, (width + video.videoWidth * scale) / 2, (height - video.videoHeight * scale) / 2)
  frameCtx.drawImage(video, 0, 0)
  frameCtx.setTransform(1, 0, 0, 1, 0, 0)
  frameRevision++
}
function sampleCheek(p: Point) {
  const x = Math.max(0, Math.min(frame.width - 5, Math.round(p.x) - 2))
  const y = Math.max(0, Math.min(frame.height - 5, Math.round(p.y) - 2))
  const pixels = frameCtx.getImageData(x, y, 5, 5).data
  const channels: number[][] = [[], [], []]
  for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) channels[c].push(pixels[i + c])
  return channels.map(values => values.sort((a, b) => a - b)[12])
}
// Blend captured skin colors internally; never blur the cutout silhouette.
function softOval(context: CanvasRenderingContext2D, points: Point[], inner: number, outer: number, fill: string | CanvasGradient = '#fff') {
  context.save()
  context.fillStyle = fill
  let previousOpacity = 0
  // A smoothstep feather has zero slope at both ends, so neither a cutout
  // border nor a second ring appears where the blend starts and stops.
  for (let i = 1; i <= 96; i++) {
    const t = i / 96
    const opacity = t * t * (3 - 2 * t)
    context.globalAlpha = Math.min(1, (opacity - previousOpacity) / Math.max(.000001, 1 - previousOpacity))
    path(context, points, outer - (outer - inner) * t); context.fill()
    previousOpacity = opacity
  }
  context.restore()
}

function snapshotFace() {
  const { photo, rim, photoMask, silhouette } = workspace ?? (workspace = {
    photo: makeSurface(), rim: makeSurface(), photoMask: makeSurface(), silhouette: makeSurface(),
  })
  const s = source.width / 2.5
  const { right: r, down: d, center: c } = pose, det = r.x * d.y - r.y * d.x
  rim.ctx.setTransform(s, 0, 0, s, source.width / 2, source.height / 2)
  rim.ctx.transform(d.y / det, -r.y / det, -d.x / det, r.x / det, (d.x * c.y - d.y * c.x) / det, (r.y * c.x - r.x * c.y) / det)
  // drawImage does not clear areas outside the frame; clear the reused surface first.
  rim.ctx.save(); rim.ctx.setTransform(1, 0, 0, 1, 0, 0); rim.ctx.clearRect(0, 0, source.width, source.height); rim.ctx.restore()
  rim.ctx.drawImage(frame, 0, 0)
  if (maskRevision !== outlineRevision) {
    for (const mask of [photoMask, silhouette]) {
      mask.ctx.setTransform(1, 0, 0, 1, 0, 0); mask.ctx.clearRect(0, 0, source.width, source.height)
      mask.ctx.setTransform(s, 0, 0, s, source.width / 2, source.height / 2)
    }
    softOval(photoMask.ctx, outline, .88, .985)
    path(silhouette.ctx, outline, 1.012); silhouette.ctx.fillStyle = '#fff'; silhouette.ctx.fill()
    maskRevision = outlineRevision
  }
  photo.ctx.setTransform(1, 0, 0, 1, 0, 0)
  photo.ctx.globalCompositeOperation = 'copy'; photo.ctx.drawImage(rim.canvas, 0, 0)
  photo.ctx.globalCompositeOperation = 'destination-in'; photo.ctx.drawImage(photoMask.canvas, 0, 0)
  photo.ctx.globalCompositeOperation = 'source-over'
  sourceCtx.setTransform(1, 0, 0, 1, 0, 0); sourceCtx.clearRect(0, 0, source.width, source.height)
  sourceCtx.save()
  sourceCtx.translate(source.width / 2, source.height / 2); sourceCtx.scale(1.065, 1.065)
  sourceCtx.drawImage(rim.canvas, -source.width / 2, -source.height / 2); sourceCtx.restore()
  sourceCtx.drawImage(photo.canvas, 0, 0)
  sourceCtx.globalCompositeOperation = 'destination-in'; sourceCtx.drawImage(silhouette.canvas, 0, 0)
  sourceCtx.globalCompositeOperation = 'source-over'
  sourceOutline = outline.map(p => ({ ...p }))
  hasTexture = true; textureRevision++; rubber?.updateTexture()
}

function beginGrip(p: Point, kind: 'hand' | 'pointer') {
  if (!hasTexture || grip || (cameraOn && performance.now() - faceSeen > 180)) return
  // The inverse flow hit-tests the visible, already stretched surface.
  const rest = flowPoint(localPoint(p, pose), anchor, pull, true)
  if (!insidePolygon(rest, sourceOutline)) return
  // During rebound preserve the old field until it settles, avoiding a jump on re-grab.
  if (length(pull) > .025) return
  anchor = rest; target = { ...p }; pull = zero(); velocity = zero(); grip = kind; wakeLoop()
}
function release() {
  if (grip && length(pull) > .15) {
    pendingBandage = { point: { ...anchor }, angle: Math.atan2(pull.y, pull.x) + Math.PI / 2 }
  }
  grip = null; wakeLoop()
}
function bandagePoint(point: Point) {
  const d = { x: point.x - anchor.x, y: point.y - anchor.y }
  const bump = .65 * swelling * Math.exp(-(d.x * d.x + d.y * d.y) / .075)
  return flowPoint({ x: point.x + d.x * bump, y: point.y + d.y * bump }, anchor, pull)
}
function drawBandages(now: number) {
  for (const band of bandages) {
    const center = worldPoint(bandagePoint(band.point), pose)
    const cos = Math.cos(band.angle), sin = Math.sin(band.angle), e = .005
    const px = worldPoint(bandagePoint({ x: band.point.x + cos * e, y: band.point.y + sin * e }), pose)
    const py = worldPoint(bandagePoint({ x: band.point.x - sin * e, y: band.point.y + cos * e }), pose)
    const age = Math.max(0, now - band.appliedAt) / 1000
    const pop = reducedMotion.matches ? 1 : 1 - Math.exp(-age * 15) * Math.cos(age * 20)
    ctx.save()
    ctx.transform((px.x - center.x) / e * pop, (px.y - center.y) / e * pop,
      (py.x - center.x) / e * pop, (py.y - center.y) / e * pop, center.x, center.y)
    ctx.globalAlpha = Math.min(1, age * 10)
    // A soft adhesive strip, central gauze pad and tiny ventilation holes.
    ctx.fillStyle = '#ead0a4'
    ctx.beginPath(); ctx.roundRect(-.21, -.09, .42, .18, .065); ctx.fill()
    ctx.fillStyle = '#f7e8ce'
    ctx.beginPath(); ctx.roundRect(-.07, -.065, .14, .13, .02); ctx.fill()
    ctx.fillStyle = '#b99b7180'
    for (const side of [-1, 1]) for (let x = 0; x < 2; x++) for (const y of [-.033, .033]) {
      ctx.beginPath(); ctx.arc(side * (.12 + x * .045), y, .008, 0, Math.PI * 2); ctx.fill()
    }
    ctx.restore()
  }
}
function infer(now: number) {
  if (!handModel || !faceModel) return
  paintCamera()
  const hand = handModel.detectForVideo(video, now).landmarks[0]
  const face = faceModel.detectForVideo(video, now).faceLandmarks[0]
  let points: Point[] = []
  const wasPinched = pinched
  if (hand) {
    points = hand.map(videoPoint)
    const nextWrist = points[0]
    if (handWrist && Math.hypot(nextWrist.x - handWrist.x, nextWrist.y - handWrist.y) > Math.max(width, height) * .3) { release(); pinched = false }
    handWrist = nextWrist
    handPoint = { x: (points[4].x + points[8].x) / 2, y: (points[4].y + points[8].y) / 2 }
    const palm = Math.max(20, Math.hypot(points[5].x - points[17].x, points[5].y - points[17].y))
    const gap = Math.hypot(points[4].x - points[8].x, points[4].y - points[8].y) / palm
    pinched = gap < (pinched ? .56 : .36); handSeen = now
    if (!pinched && grip === 'hand') release()
  } else if (now - handSeen > 160) {
    if (grip === 'hand') release()
    pinched = false; handPoint = null; handWrist = null
  }
  if (face) {
    const top = videoPoint(face[10]), bottom = videoPoint(face[152])
    const left = videoPoint(face[234]), rightEdge = videoPoint(face[454])
    const center = { x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 }
    const right = { x: (left.x - rightEdge.x) / 2, y: (left.y - rightEdge.y) / 2 }
    const down = { x: (bottom.x - top.x) / 2, y: (bottom.y - top.y) / 2 }
    if (Math.abs(right.x * down.y - right.y * down.x) < 300) return
    if (faceSeen && (now - faceSeen > 500 || Math.hypot(center.x - pose.center.x, center.y - pose.center.y) > length(pose.right) * .9)) { reset(); hasTexture = false }
    pose = { center, right, down }
    let outlineChanged = outline.length !== OVAL.length
    for (let i = 0; i < OVAL.length; i++) {
      const next = localPoint(videoPoint(face[OVAL[i]]), pose), previous = outline[i]
      if (!previous || next.x !== previous.x || next.y !== previous.y) outlineChanged = true
      if (previous) { previous.x = next.x; previous.y = next.y } else outline[i] = next
    }
    outline.length = OVAL.length
    if (outlineChanged) outlineRevision++
    faceSeen = now
    // Freeze before fingers enter the face, so a captured hand is never stretched as skin.
    handNear = points.some(p => { const q = localPoint(p, pose); return q.x * q.x + q.y * q.y < 1.65 })
    if (!handNear && !grip && length(pull) < .008 && now - lastTextureAt > 65) {
      cheekLeft = sampleCheek(videoPoint(face[205])); cheekRight = sampleCheek(videoPoint(face[425]))
      snapshotFace(); lastTextureAt = now
    }
    if (hand && handPoint && pinched && !wasPinched) beginGrip(handPoint, 'hand')
    if (grip === 'hand' && handPoint) target = { ...handPoint }
  } else if (now - faceSeen > 180) {
    release()
  }
}
function drawUnderlay() {
  ctx.save()
  ctx.transform(pose.right.x, pose.right.y, pose.down.x, pose.down.y, pose.center.x, pose.center.y)
  const color = ctx.createLinearGradient(-1, 0, 1, 0)
  color.addColorStop(0, `rgb(${cheekLeft.join(',')})`); color.addColorStop(1, `rgb(${cheekRight.join(',')})`)
  softOval(ctx, outline, .72, .94, color)
  ctx.restore()
}

function paintDemoBackground() {
  demoDots = new Path2D(); demoShadow = new Path2D()
  for (let x = 24; x < width; x += 32) for (let y = 24; y < height; y += 32) {
    demoDots.moveTo(x + .7, y); demoDots.arc(x, y, .7, 0, Math.PI * 2)
  }
  demoShadow.ellipse(pose.center.x, pose.center.y + pose.down.y * 1.18, pose.right.x * .68, 13, 0, 0, Math.PI * 2)
}

function render(now: number) {
  const visible = hasTexture && (!cameraOn || now - faceSeen < 220)
  const effect = visible && (!cameraOn || length(pull) > .002 || swelling > .008)
  const youngBandage = bandages.some(b => now - b.appliedAt < 3000)
  const marker = !!(handPoint && cameraOn && now - handSeen < 160)
  const renderState = [Number(cameraOn), frameRevision, textureRevision, outlineRevision,
    pose.center.x, pose.center.y, pose.right.x, pose.right.y, pose.down.x, pose.down.y,
    anchor.x, anchor.y, pull.x, pull.y, swelling, Number(visible), Number(effect),
    grip === 'hand' ? 1 : grip === 'pointer' ? 2 : 0, Number(marker),
    marker ? handPoint!.x : 0, marker ? handPoint!.y : 0, Number(pinched),
    bandages.length, youngBandage ? now : 0]
  if (renderState.every((v, i) => v === previousRenderState[i])) return
  previousRenderState = renderState
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height)
  if (cameraOn) {
    ctx.drawImage(frame, 0, 0, width, height)
    if (effect) drawUnderlay()
  } else {
    ctx.fillStyle = '#e9eddf'; ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#64754922'; ctx.fill(demoDots)
    ctx.fillStyle = '#566d2620'; ctx.fill(demoShadow)
  }
  if (visible && rubber) {
    if (effect) { rubber.render(pose, anchor, pull, swelling); ctx.drawImage(rubber.canvas, 0, 0, width, height) }
    drawBandages(now)
  }
  if (grip && visible) {
    const p = worldPoint(flowPoint(anchor, anchor, pull), pose)
    ctx.strokeStyle = '#d4f57a'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill()
  } else if (handPoint && cameraOn && now - handSeen < 160) {
    ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(handPoint.x, handPoint.y, pinched ? 8 : 15, 0, Math.PI * 2); ctx.stroke()
  }
}
function tick(now: number) {
  animation = 0
  if (disposed || document.hidden) return
  inFrame = true
  const dt = Math.min((now - lastFrame) / 1000, .05); lastFrame = now
  if (cameraOn && !document.hidden && video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastInference > 33) {
    lastVideoTime = video.currentTime; lastInference = now
    try { infer(now) } catch (cause) { console.error(cause); stopCamera(); showError('추적을 계속할 수 없어요. 카메라를 다시 켜주세요.') }
  }
  if (grip) {
    const local = localPoint(target, pose)
    const next = { x: local.x - anchor.x, y: local.y - anchor.y }
    // Bound the simulation only far outside a normal viewport.
    const limit = Math.min(1, 8 / Math.max(.001, length(next)))
    next.x *= limit; next.y *= limit
    velocity = { x: (next.x - pull.x) / Math.max(dt, .008), y: (next.y - pull.y) / Math.max(dt, .008) }
    const speed = length(velocity)
    if (speed > 12) { velocity.x *= 12 / speed; velocity.y *= 12 / speed }
    pull = next
  } else if (pull.x || pull.y || velocity.x || velocity.y) {
    springStep(pull, velocity, dt, reducedMotion.matches)
    if (length(pull) < .001 && length(velocity) < .01) { pull = zero(); velocity = zero() }
  }
  if (!grip && pendingBandage && length(pull) < .035 && length(velocity) < .5) {
    const existing = bandages.find(b => Math.hypot(b.point.x - pendingBandage!.point.x, b.point.y - pendingBandage!.point.y) < .18)
    if (existing) { Object.assign(existing, pendingBandage); existing.appliedAt = now }
    else bandages.push({ ...pendingBandage, appliedAt: now })
    bandages = bandages.slice(-8)
    pendingBandage = null
  }
  const soreness = grip ? Math.min(1, length(pull) * .85) : 0
  swelling += (soreness - swelling) * (1 - Math.exp(-(grip ? 8 : .65) * dt))
  if (cameraOn) say(now - faceSeen > 220 ? '얼굴을 카메라에 보여주세요' : !hasTexture ? '손을 내려 얼굴을 준비해주세요' : grip ? '쭈우욱 — 잡고 있어요' : length(pull) > .025 ? '탱글하게 돌아오는 중' : '얼굴 위에서 손가락을 집어보세요')
  else say(grip ? '쭈우욱 — 놓으면 돌아와요' : '드래그로 먼저 만져보세요')
  render(now)
  const moving = grip || length(pull) || length(velocity) || pendingBandage || swelling || bandages.some(b => now - b.appliedAt < 3000)
  inFrame = false
  if (cameraOn || moving) wakeLoop(false)
}
async function setupTracking() {
  if (handModel && faceModel) return
  const vision = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}lemonade/mediapipe`)
  for (const delegate of ['GPU', 'CPU'] as const) {
    try {
      handModel = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}lemonade/mediapipe/hand_landmarker.task`, delegate }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: .55, minTrackingConfidence: .5 })
      faceModel = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}lemonade/mediapipe/face_landmarker.task`, delegate }, runningMode: 'VIDEO', numFaces: 1, minFaceDetectionConfidence: .5, minTrackingConfidence: .5 })
      return
    } catch (cause) {
      handModel?.close(); faceModel?.close(); handModel = null; faceModel = null
      if (delegate === 'CPU') throw cause
    }
  }
}
function showError(message: string) { error.textContent = message; error.hidden = false }
function stopCamera() {
  if (workspace) {
    for (const surface of Object.values(workspace)) surface.canvas.width = surface.canvas.height = 1
    workspace = null; maskRevision = -1
  }
  stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null
  cameraOn = false; handPoint = handWrist = null; pinched = false; handNear = false; faceSeen = 0
  reset(); document.body.classList.remove('camera-on'); cameraButton.textContent = '카메라 켜기 ↗'; demo(); paintDemoBackground(); wakeLoop()
}
async function startCamera() {
  if (starting || disposed || !rubber) return
  if (cameraOn) { stopCamera(); return }
  starting = true; cameraButton.disabled = true; cameraButton.textContent = '카메라 준비 중…'; error.hidden = true
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('카메라는 localhost 또는 HTTPS에서 사용할 수 있어요.')
    // Own the stream before awaiting models so failure can always stop every track.
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
    if (disposed) { stream.getTracks().forEach(t => t.stop()); return }
    video.srcObject = stream; await video.play(); await setupTracking()
    if (disposed) { stopCamera(); handModel?.close(); faceModel?.close(); return }
    reset(); hasTexture = false; cameraOn = true; faceSeen = 0; lastVideoTime = -1; lastTextureAt = 0
    document.body.classList.add('camera-on'); cameraButton.textContent = '카메라 끄기'
    if (document.hidden) stream.getVideoTracks().forEach(track => { track.enabled = false })
    wakeLoop()
    stream.getVideoTracks()[0]?.addEventListener('ended', () => { if (cameraOn) { stopCamera(); showError('카메라 연결이 끊겼어요. 다시 켜주세요.') } })
  } catch (cause) {
    stopCamera()
    const denied = cause instanceof DOMException && cause.name === 'NotAllowedError'
    showError(denied ? '카메라 권한이 필요해요. 주소창의 카메라 권한을 허용하고 다시 켜주세요.' : cause instanceof Error && cause.message.includes('HTTPS') ? cause.message : '카메라나 추적 모델을 준비하지 못했어요. 카메라 연결을 확인하고 다시 시도해주세요.')
    console.error(cause)
  } finally { starting = false; cameraButton.disabled = false }
}
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || pointerId !== null) return
  beginGrip({ x: event.clientX, y: event.clientY }, 'pointer')
  if (grip === 'pointer') { pointerId = event.pointerId; canvas.setPointerCapture(event.pointerId) }
})
canvas.addEventListener('pointermove', event => { if (event.pointerId === pointerId) target = { x: event.clientX, y: event.clientY } })
function endPointer(event: PointerEvent) { if (event.pointerId === pointerId) { release(); pointerId = null } }
canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer); canvas.addEventListener('lostpointercapture', endPointer)
window.addEventListener('keydown', event => { if (event.key === 'Escape') reset() })
window.addEventListener('blur', () => { release(); pointerId = null })
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    release(); pinched = false; handPoint = null; cancelAnimationFrame(animation); animation = 0
    stream?.getVideoTracks().forEach(track => { track.enabled = false })
  } else {
    stream?.getVideoTracks().forEach(track => { track.enabled = true })
    wakeLoop()
  }
})
document.querySelector('#rubber-reset')!.addEventListener('click', reset)
cameraButton.addEventListener('click', () => { void startCamera() })
window.addEventListener('resize', resize)
window.addEventListener('interactivecaptureprepare', () => render(performance.now()))
window.addEventListener('pagehide', () => {
  disposed = true; cancelAnimationFrame(animation); stopCamera(); handModel?.close(); faceModel?.close(); rubber?.dispose()
})
window.addEventListener('pageshow', event => { if (event.persisted) location.reload() })
resize(); wakeLoop()
