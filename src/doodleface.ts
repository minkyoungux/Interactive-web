import './doodleface.css'
import { FaceLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { COLORS, OVAL, TIMING, Ink, Pinch, Round, center, cover, local, other, owner, pose, predict, project, resolve } from './doodleface-core'
import type { Cover, Point, Pose, Side } from './doodleface-core'

const faceGraphic = (second: boolean) => `<svg viewBox="0 0 300 310" fill="none" aria-hidden="true"><path d="M58 139C43 31 247 17 242 140" fill="${second ? '#8584bc' : '#e9a14f'}" stroke="currentColor" stroke-width="3"/><path d="M73 131C64 64 232 65 227 137L217 220C190 285 112 289 81 221Z" fill="${second ? '#e8c3b4' : '#f2cd95'}" stroke="currentColor" stroke-width="3"/><path d="M92 114Q119 99 142 112M166 112Q191 95 214 113M132 218Q158 234 181 212M154 131L144 185L168 187" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><ellipse cx="119" cy="142" rx="5" ry="8" fill="currentColor"/><ellipse cx="190" cy="142" rx="5" ry="8" fill="currentColor"/><path d="${second ? 'M88 164Q109 181 131 163M173 165Q197 184 216 164' : 'M94 170L130 177M94 180L128 169M174 169L211 180M175 180L208 168'}" stroke="${second ? '#ef83b1' : '#ed5657'}" stroke-width="7" stroke-linecap="round"/><path d="M123 208Q155 181 183 206" stroke="#499de5" stroke-width="6" stroke-linecap="round"/><path d="M37 68L44 50L53 69L73 74L55 85L51 104L40 89L19 88Z" stroke="#91a461" stroke-width="3"/><path d="M234 246L252 256M241 233L263 230M227 261L225 280" stroke="#ef835c" stroke-width="4" stroke-linecap="round"/></svg>`
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="df-app" data-phase="lobby">
    <header class="df-header"><a href="${import.meta.env.BASE_URL}#doodleface" class="df-brand">DoodleFace<span>15 / A LITTLE FRIENDLY MISCHIEF</span></a><span class="df-local"><i></i> ONE CAMERA · TWO FRIENDS</span><button class="df-exit" type="button" hidden>게임 종료 ↗</button></header>
    <section class="df-intro"><p>MAKE A FACE. MAKE A MESS.</p><h1>Your face.<br><em>My masterpiece.</em><span class="df-spark" aria-hidden="true">✳</span></h1><div>친구의 얼굴이 오늘의 캔버스.<br>나란히 앉아서, 60초 동안 마음껏 그려요.</div></section>
    <div class="df-hud"><span class="df-status" role="status" aria-live="polite">둘이 함께, 조금 엉뚱하게.</span><span class="df-timer" aria-label="남은 게임 시간">60<span>SEC</span></span></div>
    <section class="df-stage" aria-label="두 사람의 얼굴과 낙서 화면">
      ${[0, 1].map(i => `<article class="df-panel" data-player="${i + 1}"><div class="df-panel-heading"><span class="df-panel-title">PLAYER ${i + 1}</span><small class="df-owner">YOUR LITTLE CANVAS</small></div><div class="df-picture"><div class="df-palette" role="group" aria-label="PLAYER ${i + 1} 펜 색">${COLORS.map((color, j) => `<button type="button" class="df-swatch" style="--ink:${color}" aria-label="${['검정','흰색','빨강','주황','노랑','초록','민트','파랑','보라','분홍'][j]}" aria-pressed="${j === (i === 0 ? 2 : 7)}" data-color="${color}"></button>`).join('')}</div><canvas class="df-canvas" aria-label="PLAYER ${i + 1} 카메라와 얼굴 낙서"></canvas><div class="df-demo">${faceGraphic(i === 1)}<span>${i === 0 ? 'THE ARTIST' : 'THE MUSE'}<b aria-hidden="true">↝</b></span></div><span class="df-waiting" hidden>WAITING · 얼굴을 보여주세요</span></div><div class="df-panel-footer"><span class="df-pen-label">PLAYER ${i + 1} · PEN</span><span>PINCH & DRAW <b aria-hidden="true">✎</b></span></div></article>`).join('')}
    </section>
    <div class="df-notice" role="status" hidden></div>
    <section class="df-controls"><p class="df-error" role="alert" hidden></p><div class="df-buttons"><button class="df-start" type="button">2인 게임 시작 ＋</button><button class="df-help" type="button" aria-expanded="false" aria-controls="df-instructions">게임 방법 ?</button></div><p>한 PC · 한 브라우저 · 한 카메라. 영상은 이 기기 안에서만 처리돼요.</p></section>
    <section id="df-instructions" class="df-instructions" hidden><h2>둘이 나란히, 손은 하나씩.</h2><ol><li>거울 화면 왼쪽은 PLAYER 1, 오른쪽은 PLAYER 2예요. 가운데 선을 넘지 않고 앉아주세요.</li><li>두 얼굴이 보이면 5초 뒤 화면을 교환해요. 왼쪽의 PLAYER 1은 친구 PLAYER 2의 얼굴에, 오른쪽의 PLAYER 2는 친구 PLAYER 1의 얼굴에 그려요.</li><li>엄지와 검지 끝의 가운데가 연필 끝이에요. 친구 얼굴 안에서 두 손가락을 맞대고 움직여요. 손가락을 벌리면 그리기를 멈춰요.</li><li>위쪽 색 위에서 손가락을 맞대거나 색 버튼을 클릭해 바꿔요. 손이 화면 밖으로 나가면 잠시 뒤 펜이 사라져요.</li><li>60초 뒤 완성된 얼굴을 보여주세요. 잠시 감상한 뒤 자동으로 처음으로 돌아와요.</li></ol></section>
    <footer class="df-footer"><span>NO RULES FOR GOOD TASTE.</span><span>JUST BE NICE TO YOUR FRIEND. <b>☺</b></span></footer>
    <video class="df-video" playsinline muted aria-hidden="true"></video>
  </main>`

const app = document.querySelector<HTMLElement>('.df-app')!
const video = document.querySelector<HTMLVideoElement>('.df-video')!
const stage = document.querySelector<HTMLElement>('.df-stage')!
const start = document.querySelector<HTMLButtonElement>('.df-start')!
const exit = document.querySelector<HTMLButtonElement>('.df-exit')!
const error = document.querySelector<HTMLElement>('.df-error')!
const status = document.querySelector<HTMLElement>('.df-status')!
const timer = document.querySelector<HTMLElement>('.df-timer')!
const notice = document.querySelector<HTMLElement>('.df-notice')!
const instructions = document.querySelector<HTMLElement>('#df-instructions')!
const panels = Array.from(document.querySelectorAll<HTMLElement>('.df-panel')).map(el => ({
  el, picture: el.querySelector<HTMLElement>('.df-picture')!, canvas: el.querySelector<HTMLCanvasElement>('canvas')!,
  ctx: el.querySelector<HTMLCanvasElement>('canvas')!.getContext('2d')!, badge: el.querySelector<HTMLElement>('.df-waiting')!,
  title: el.querySelector<HTMLElement>('.df-panel-title')!, owner: el.querySelector<HTMLElement>('.df-owner')!,
  swatches: Array.from(el.querySelectorAll<HTMLButtonElement>('.df-swatch')),
  rect: { x: 0, y: 0, width: 1, height: 1 }, transform: cover(1, 1, 1, 1),
  swatchRects: [] as DOMRect[],
}))
const lowDevice = navigator.hardwareConcurrency <= 4 || ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4
let quality = lowDevice ? 1 : 0
let round = new Round()
let pinches = [new Pinch(), new Pinch()]
let inks = [new Ink(), new Ink()]
let colors = [COLORS[2], COLORS[7]]
let faces: (Pose | null)[] = [null, null], previous: (Pose | null)[] = [null, null]
let stream: MediaStream | null = null
let faceModel: FaceLandmarker | null = null, handModel: HandLandmarker | null = null
const ownedModels = new Set<FaceLandmarker | HandLandmarker>()
let disposed = false, generation = 0, swapped = false
let frameId = 0, lastRender = -Infinity, lastInference = -Infinity, faceAt = -Infinity, handAt = -Infinity, lastVideoTime = -1
let inferenceCost = 0, costSamples = 0
let snapshots: HTMLCanvasElement[] = [], animations: Animation[] = []
const inference = document.createElement('canvas'), inferenceCtx = inference.getContext('2d')!
const sides: Side[] = [0, 1]
const lifetime = new AbortController()
const on = { signal: lifetime.signal }
function setColor(side: Side, color: string) {
  colors[side] = color
  panels[side].swatches.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.color === color)))
}
panels.forEach((panel, i) => panel.swatches.forEach(button => button.addEventListener('click', () => setColor(i as Side, button.dataset.color!), on)))

// Every render reads each panel and each swatch once. No DOM reads in point/ink loops.
function measure() {
  panels.forEach(panel => {
    const rect = panel.picture.getBoundingClientRect()
    panel.rect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    const dpr = Math.min(devicePixelRatio || 1, quality ? 1 : 1.75)
    const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr))
    if (panel.canvas.width !== w || panel.canvas.height !== h) { panel.canvas.width = w; panel.canvas.height = h }
    panel.ctx.setTransform(w / rect.width, 0, 0, h / rect.height, 0, 0)
    panel.transform = cover(video.videoWidth / 2 || 1, video.videoHeight || 1, rect.width, rect.height)
    panel.swatchRects = panel.swatches.map(button => button.getBoundingClientRect())
  })
}
function currentFace(side: Side, now: number) {
  const latest = faces[side]
  return latest && now - latest.time < 300 ? predict(previous[side], latest, now) : null
}
function drawCamera(side: Side, ctx: CanvasRenderingContext2D, t: Cover) {
  if (!video.videoWidth || video.readyState < 2) return
  const half = video.videoWidth / 2
  ctx.save(); ctx.translate(t.x + t.width, t.y); ctx.scale(-1, 1)
  // PLAYER 1 is in the RIGHT raw half because the camera is mirrored.
  ctx.drawImage(video, side === 0 ? half : 0, 0, half, video.videoHeight, 0, 0, t.width, t.height)
  ctx.restore()
}
function drawPencil(ctx: CanvasRenderingContext2D, point: Point, color: string, down: boolean) {
  ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(-.62)
  ctx.lineJoin = 'round'; ctx.lineWidth = 1.6; ctx.strokeStyle = '#29282e'
  ctx.shadowColor = 'rgba(0,0,0,.24)'; ctx.shadowBlur = 5
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, -18); ctx.lineTo(-8, -68); ctx.quadraticCurveTo(0, -77, 8, -68); ctx.lineTo(8, -18); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); ctx.stroke()
  ctx.shadowBlur = 0; ctx.fillStyle = '#e9c798'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-8, -18); ctx.lineTo(8, -18); ctx.closePath(); ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#29282e'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-2.7, -6); ctx.lineTo(2.7, -6); ctx.closePath(); ctx.fill()
  ctx.fillStyle = '#f1a3ac'; ctx.fillRect(-7, -68, 14, 8); ctx.fillStyle = '#b7c3bb'; ctx.fillRect(-7, -60, 14, 5)
  ctx.strokeStyle = 'rgba(255,255,255,.65)'; ctx.beginPath(); ctx.moveTo(-3, -53); ctx.lineTo(-3, -23); ctx.stroke()
  if (down) { ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.stroke() }
  ctx.restore()
}
function render(now: number, measureLayout = true) {
  if (measureLayout) measure()
  sides.forEach(side => {
    const panel = panels[side], { width, height } = panel.rect, ctx = panel.ctx
    ctx.clearRect(0, 0, width, height)
    drawCamera(swapped ? other(side) : side, ctx, panel.transform)
    const face = currentFace(swapped ? other(side) : side, now)
    panel.badge.hidden = round.phase === 'lobby' || !!face
    panel.title.textContent = `PLAYER ${(swapped ? other(side) : side) + 1}`
    panel.owner.textContent = swapped ? `DRAWN BY PLAYER ${side + 1}` : 'YOUR LITTLE CANVAS'
    if (swapped && face) {
      ctx.lineCap = ctx.lineJoin = 'round'
      inks[side].strokes.forEach(stroke => {
        if (!stroke.points.length) return
        ctx.strokeStyle = ctx.fillStyle = stroke.color
        ctx.lineWidth = Math.max(2.5, face.size * panel.transform.height * .014)
        ctx.beginPath()
        stroke.points.forEach((a, i) => { const p = project(resolve(a, face), panel.transform); if (!i) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y) })
        if (stroke.points.length === 1) { const p = project(resolve(stroke.points[0], face), panel.transform); ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill() }
        else ctx.stroke()
      })
    }
    const pinch = pinches[side]
    if (round.phase === 'playing' && pinch.point && now - pinch.seen <= TIMING.handGrace) drawPencil(ctx, project(pinch.point, panel.transform), colors[side], pinch.down)
  })
}
function updateHud(now: number) {
  app.dataset.phase = round.phase
  const phase = round.phase
  start.hidden = phase !== 'lobby'; exit.hidden = phase === 'lobby'
  const messages = { lobby: '둘이 함께, 조금 엉뚱하게.', loading: '카메라와 연필을 준비하고 있어요…', waiting: '둘이 나란히 앉아 얼굴을 보여주세요.', countdown: '준비됐나요? 잠시 뒤 얼굴이 바뀌어요!', swapping: '친구의 얼굴이 내 캔버스로!', playing: '친구 얼굴 위에서 PINCH & DRAW!', reveal: '멋진 작품이 완성됐어요.', result: '서로의 작품을 감상해요. 곧 처음으로 돌아가요.' }
  if (status.textContent !== messages[phase]) status.textContent = messages[phase]
  const seconds = phase === 'playing' ? Math.min(60, Math.max(0, Math.ceil((round.deadline - now) / 1000))) : phase === 'countdown' ? Math.max(1, Math.ceil((round.deadline - now) / 1000)) : phase === 'reveal' || phase === 'result' ? 0 : 60
  const html = `${seconds}<span>${phase === 'countdown' ? 'READY' : 'SEC'}</span>`
  if (timer.innerHTML !== html) timer.innerHTML = html
  notice.hidden = phase !== 'reveal'
  notice.textContent = phase === 'reveal' ? '완성된 얼굴을 보여주세요' : ''
}
function readFaces(result: Point[][], now: number) {
  const assigned: (Point[] | null)[] = [null, null]
  result.forEach(points => {
    if (points.length < 468) return
    const side = owner(center(OVAL.map(i => points[i])))
    const candidate = points.map(p => local(p, side))
    if (!assigned[side] || Math.abs(candidate[152].y - candidate[10].y) > Math.abs(assigned[side]![152].y - assigned[side]![10].y)) assigned[side] = candidate
  })
  sides.forEach(side => {
    if (assigned[side]) { previous[side] = faces[side]; faces[side] = pose(assigned[side]!, video.videoWidth / 2 / video.videoHeight, now) }
    else { faces[side] = previous[side] = null }
  })
  round.faces(assigned.map(Boolean), now)
}
function readHands(result: Point[][], now: number) {
  const assigned: (Point[] | null)[] = [null, null]
  result.forEach(points => {
    if (points.length < 21) return
    const side = owner(center([0, 5, 9, 13, 17].map(i => points[i])))
    if (!assigned[side]) assigned[side] = points.map(p => local(p, side))
  })
  sides.forEach(side => {
    const pinch = pinches[side], change = pinch.update(assigned[side], now, video.videoWidth / 2 / video.videoHeight)
    if (change.ended) inks[side].end()
    if (round.phase !== 'playing' || !pinch.point) return
    const panel = panels[side], pixel = project(pinch.point, panel.transform)
    const x = pixel.x + panel.rect.x, y = pixel.y + panel.rect.y
    const swatch = panel.swatchRects.findIndex(r => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)
    if (pinch.down && swatch >= 0) setColor(side, COLORS[swatch])
    inks[side].sample(pinch.point, currentFace(other(side), now), change.started, pinch.down, colors[side], swatch >= 0)
  })
}
function infer(now: number) {
  if (!faceModel || !handModel || round.phase === 'swapping' || video.readyState < 2 || video.currentTime === lastVideoTime || now - lastInference < (quality ? 32 : 24)) return
  const drawing = round.phase === 'playing', active = pinches.some(p => p.down)
  const faceDue = now - faceAt >= (drawing && active ? (quality ? 150 : 100) : (quality ? 110 : 75))
  const trackingHands = drawing || round.phase === 'waiting' || round.phase === 'countdown'
  const handDue = trackingHands && now - handAt >= (active ? (quality ? 50 : 32) : (quality ? 80 : 55))
  if (!faceDue && !handDue) return
  lastVideoTime = video.currentTime; lastInference = now
  const width = quality ? 480 : 640, height = Math.round(width * video.videoHeight / video.videoWidth)
  if (inference.width !== width || inference.height !== height) { inference.width = width; inference.height = height }
  inferenceCtx.drawImage(video, 0, 0, width, height)
  const began = performance.now()
  // ONE inference per animation frame. Hands get the intervening frames during a pinch.
  if (faceDue) { readFaces(faceModel.detectForVideo(inference, now).faceLandmarks, now); faceAt = now }
  else if (handDue) { readHands(handModel.detectForVideo(inference, now).landmarks, now); handAt = now }
  inferenceCost += performance.now() - began; costSamples++
  if (!quality && costSamples >= 24 && inferenceCost / costSamples > 24) {
    quality = 1
    void stream?.getVideoTracks()[0]?.applyConstraints({ frameRate: { ideal: 24, max: 24 } }).catch(() => {})
  }
}
async function exchange() {
  const token = generation
  render(performance.now(), false)
  const stageRect = stage.getBoundingClientRect()
  const rects = panels.map(p => p.rect)
  snapshots = panels.map((p, i) => {
    const canvas = document.createElement('canvas')
    canvas.className = 'df-snapshot'; canvas.width = p.canvas.width; canvas.height = p.canvas.height
    canvas.getContext('2d')!.drawImage(p.canvas, 0, 0)
    Object.assign(canvas.style, { left: `${rects[i].x - stageRect.x}px`, top: `${rects[i].y - stageRect.y}px`, width: `${rects[i].width}px`, height: `${rects[i].height}px` })
    stage.append(canvas); return canvas
  })
  app.classList.add('df-exchanging')
  animations = snapshots.map((canvas, i) => canvas.animate([
    { transform: 'translate(0, 0)' },
    { transform: `translate(${rects[1 - i].x - rects[i].x}px, ${rects[1 - i].y - rects[i].y}px)` },
  ], { duration: TIMING.swap, easing: 'cubic-bezier(.65,0,.3,1)', fill: 'forwards' }))
  try {
    await Promise.all(animations.map(a => a.finished))
    if (disposed || token !== generation) return
    swapped = true
    // Clock begins at the actual animation finish, not at countdown expiry.
    round.swapped(performance.now())
    pinches = [new Pinch(), new Pinch()]
    render(performance.now()); updateHud(performance.now())
  } catch { /* Cancellation is part of teardown. */ }
  finally { if (token === generation) removeExchange() }
}
function removeExchange() {
  animations.forEach(a => a.cancel()); animations = []
  snapshots.forEach(c => { c.remove(); c.width = c.height = 1 }); snapshots = []
  app.classList.remove('df-exchanging')
}
function loop(now: number) {
  frameId = 0
  if (disposed || round.phase === 'lobby') return
  try {
    if (round.tick(now) === 'lobby') { resetSession(); return }
    if (now - lastRender >= (quality ? 1000 / 24 : 1000 / 60) - 1) {
      measure()
      infer(now)
      sides.forEach(side => { if (now - pinches[side].seen > TIMING.handGrace) { pinches[side].update(null, now, 1); inks[side].end() } })
      if (round.phase !== 'playing') inks.forEach(ink => ink.end())
      render(now, false); updateHud(now); lastRender = now
      if (round.phase === 'swapping' && !snapshots.length) void exchange()
    }
    frameId = requestAnimationFrame(loop)
  } catch (cause) {
    console.error('DoodleFace inference failed', cause)
    resetSession(); showError('얼굴·손 인식에 문제가 생겼어요. 다시 시작해주세요.')
  }
}
function showError(message: string) { error.textContent = message; error.hidden = false }
function closeModel(model: FaceLandmarker | HandLandmarker | null) {
  if (model && ownedModels.delete(model)) model.close()
}
function resetSession() {
  generation++
  cancelAnimationFrame(frameId); frameId = 0
  removeExchange()
  stream?.getTracks().forEach(track => track.stop()); stream = null
  video.pause(); video.srcObject = null
  ownedModels.forEach(model => closeModel(model)); faceModel = handModel = null
  round = new Round(); pinches = [new Pinch(), new Pinch()]; inks = [new Ink(), new Ink()]
  faces = [null, null]; previous = [null, null]; swapped = false
  quality = lowDevice ? 1 : 0; inferenceCost = costSamples = 0
  lastRender = lastInference = faceAt = handAt = -Infinity; lastVideoTime = -1
  inference.width = inference.height = 1
  setColor(0, COLORS[2]); setColor(1, COLORS[7])
  start.disabled = false; start.textContent = '2인 게임 시작 ＋'
  app.classList.remove('df-camera-on'); updateHud(performance.now()); render(performance.now())
}
async function models(token: number) {
  const vision = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`)
  for (const delegate of ['GPU', 'CPU'] as const) {
    let face: FaceLandmarker | null = null, hands: HandLandmarker | null = null
    try {
      if (disposed || token !== generation) return
      face = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/face_landmarker.task`, delegate }, runningMode: 'VIDEO', numFaces: 2, minFaceDetectionConfidence: .45, minFacePresenceConfidence: .45, minTrackingConfidence: .45 })
      ownedModels.add(face)
      if (disposed || token !== generation) { closeModel(face); return }
      hands = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/hand_landmarker.task`, delegate }, runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .45, minHandPresenceConfidence: .45, minTrackingConfidence: .45 })
      ownedModels.add(hands)
      if (disposed || token !== generation) { closeModel(face); closeModel(hands); return }
      faceModel = face; handModel = hands; return
    } catch (cause) {
      closeModel(face); closeModel(hands)
      if (disposed || token !== generation) return
      if (delegate === 'CPU') throw cause
    }
  }
}
async function begin() {
  if (disposed || round.phase !== 'lobby') return
  const token = ++generation
  round.phase = 'loading'; start.disabled = true; error.hidden = true
  instructions.hidden = true; document.querySelector('.df-help')!.setAttribute('aria-expanded', 'false')
  updateHud(performance.now())
  let step = 'camera'
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('secure')
    const camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: quality ? 960 : 1280 }, height: { ideal: quality ? 540 : 720 }, frameRate: { ideal: quality ? 24 : 30, max: quality ? 24 : 30 } } })
    if (disposed || token !== generation) { camera.getTracks().forEach(track => track.stop()); return }
    stream = camera; video.srcObject = stream; await video.play()
    if (disposed || token !== generation) return
    app.classList.add('df-camera-on'); frameId = requestAnimationFrame(loop)
    camera.getVideoTracks()[0]?.addEventListener('ended', () => { if (token === generation) { resetSession(); showError('카메라 연결이 끊겼어요. 다시 시작해주세요.') } }, on)
    step = 'models'; await models(token)
    if (disposed || token !== generation) return
    round.phase = 'waiting'
  } catch (cause) {
    if (disposed || token !== generation) return
    resetSession()
    const denied = cause instanceof DOMException && (cause.name === 'NotAllowedError' || cause.name === 'PermissionDeniedError')
    showError(cause instanceof Error && cause.message === 'secure' ? '카메라는 localhost 또는 HTTPS에서 사용할 수 있어요.' : denied ? '카메라 권한을 허용한 뒤 다시 시작해주세요.' : step === 'models' ? '인식 모델을 열지 못했어요. 다시 시작해주세요.' : '카메라를 열지 못했어요. 연결을 확인하고 다시 시작해주세요.')
  }
}
function dispose() {
  if (disposed) return
  disposed = true; lifetime.abort(); resetSession()
  panels.forEach(p => { p.canvas.width = p.canvas.height = 1 })
}
start.addEventListener('click', () => { void begin() }, on)
exit.addEventListener('click', resetSession, on)
document.querySelector<HTMLButtonElement>('.df-help')!.addEventListener('click', event => {
  instructions.hidden = !instructions.hidden
  ;(event.currentTarget as HTMLElement).setAttribute('aria-expanded', String(!instructions.hidden))
}, on)
window.addEventListener('interactive:dispose', dispose, on)
window.addEventListener('pagehide', dispose, on)
window.addEventListener('pageshow', event => { if (event.persisted) location.reload() })
window.addEventListener('resize', () => { if (round.phase === 'lobby') render(performance.now()) }, on)
if (import.meta.hot) import.meta.hot.dispose(dispose)
updateHud(performance.now()); render(performance.now())
