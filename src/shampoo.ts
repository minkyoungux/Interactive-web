import './shampoo.css'
import { attach, blowSign, distance, extractScalp, getPose, local, newStroke, readGesture, resolve, scalpContains, strokeSamples, wipePalm, world, HAND_GRACE } from './shampoo-geometry'
import type { Anchor, Point, Pose, Scalp, Stroke } from './shampoo-geometry'
import type { HandSide, WorkerReply, WorkerRequest } from './shampoo-tracking'
import { FogGlass } from './shampoo-fog'
import { BubbleBath } from './shampoo-bath'
import type { Food } from './shampoo-bath'
import { foamSprites, soapSprites, duckSprites } from './shampoo-sprites'

document.body.classList.add('shampoo-page')
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="shampoo-app">
    <video class="camera" playsinline muted aria-label="좌우 반전된 실시간 카메라"></video>
    <canvas class="shampoo-canvas" aria-label="샴푸 거품과 쌓이는 비눗방울, 거품을 먹는 러버덕"></canvas>
    <canvas class="shampoo-fog" aria-label="왼손으로 닦을 수 있는 김 낀 유리"></canvas>
    <div class="shampoo-orb" aria-hidden="true"></div>
    <header class="shampoo-header">
      <a class="shampoo-brand" href="${import.meta.env.BASE_URL}"><b>Shampoo</b><small>EXPERIMENT 14</small></a>
      <div class="shampoo-state" role="status" aria-live="polite">카메라를 켜면 시작해요</div>
    </header>
    <section class="shampoo-intro"><p class="shampoo-kicker">A LITTLE EVERYDAY MAGIC</p><h1>Good hair.<br><em>Soft bubbles.</em></h1><p>검지 끝으로 작은 샴푸 거품, 주먹으로 풍성하게.<br>입 앞에서 O 사인을 만들면 비눗방울이 나와요.</p></section>
    <div class="shampoo-guide"><span>WIPE · LATHER · BLOW</span><br>왼손을 펴서 쓱쓱, 화면의 김 닦기<br>검지로 작게 그리기 · 주먹으로 크게<br>입 앞에 O 사인으로 비눗방울 불기<br>러버덕이 가끔 놀러 와서 냠냠!</div>
    <section class="shampoo-controls" aria-label="카메라와 거품 설정">
      <p class="shampoo-error" role="alert" hidden></p>
      <div class="shampoo-buttons"><button class="primary" id="camera-start" type="button">카메라 켜기</button><button id="foam-reset" type="button">거품 씻어내기 ↺</button><button id="fog-reset" type="button">김 다시 끼기</button></div>
      <p class="shampoo-note">영상은 기기 안에서만 처리돼요. 엄지·검지로 동그라미를 만들고 입 가까이 가져가 보세요.</p>
    </section>
  </main>`
const video = document.querySelector<HTMLVideoElement>('video')!
const canvas = document.querySelector<HTMLCanvasElement>('.shampoo-canvas')!
const ctx = canvas.getContext('2d')!
const fog = new FogGlass(document.querySelector<HTMLCanvasElement>('.shampoo-fog')!)
const button = document.querySelector<HTMLButtonElement>('#camera-start')!
const stateLabel = document.querySelector<HTMLElement>('.shampoo-state')!
const errorLabel = document.querySelector<HTMLElement>('.shampoo-error')!
const FACE_GRACE = 360, MASK_GRACE = 1000
let generation = 0, running = false, starting = false, disposed = false
let stream: MediaStream | null = null
let raf = 0, width = innerWidth, height = innerHeight, dpr = 1
let aspect = .75, face: Point[] = [], pose: Pose | null = null, scalp: Scalp | null = null
let faceAt = -Infinity, maskAt = -Infinity, lastSeg = -Infinity
type HandState = Stroke & { position?: Point; side?: HandSide; circle?: Point; blowAt: number; soapAt: number }
const newHand = (): HandState => ({ ...newStroke(), blowAt: -Infinity, soapAt: -Infinity })
let strokes: HandState[] = [newHand(), newHand()]
type Foam = { id: number; anchor: Anchor; radius: number; variant: number; born: number }
let foam: Foam[] = []
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
const random = (seed: number) => { const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v) }
// Every visual is drawn from cached Canvas sprites; no per-frame gradient allocation.
const sprites = foamSprites(), soap = soapSprites(), ducks = duckSprites()
const bath = new BubbleBath()
let eatenScalp: Point[] = [], nextFoamId = 0, lastRender = 0
const scalpWasEaten = (p: Point) => eatenScalp.some(e => distance(e, p) < .2)
function screenPoint(p: Point): Point {
  const renderedWidth = Math.max(width, height / aspect)
  return { x: (width + renderedWidth) / 2 - p.x * renderedWidth, y: (height - renderedWidth * aspect) / 2 + p.y * renderedWidth }
}
type Lane = { worker: Worker; busy: boolean; last: number; videoTime: number; reject?: (error: Error) => void; timeout?: number }
let handLane: Lane | null = null, humanLane: Lane | null = null
const liveFace = (now: number) => pose !== null && now - faceAt < FACE_GRACE
const liveMask = (now: number) => scalp !== null && now - maskAt < MASK_GRACE
const gesturing = (now: number) => now - fog.wipeAt < 300 || strokes.some(s => (s.gesture !== 'open' && now - s.seen < HAND_GRACE) || now - s.blowAt < HAND_GRACE)
function setStatus(text: string) { if (stateLabel.textContent !== text) stateLabel.textContent = text }
function resize() {
  width = innerWidth; height = innerHeight
  dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(3_000_000 / (width * height)))
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr)
  bath.resize(width, height)
  fog.resize(width, height)
}
function clearTracking() {
  face = []; pose = null; scalp = null; foam = []; strokes = [newHand(), newHand()]
  faceAt = maskAt = lastSeg = -Infinity
  eatenScalp = []; nextFoamId = lastRender = 0; bath.reset(width, height)
  fog.reset()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
}
function retire(lane: Lane | null) {
  if (!lane) return
  clearTimeout(lane.timeout)
  lane.reject?.(new Error('Session ended'))
  // Allow close() to release WASM graphs, then force termination if initialization/inference is stalled.
  const timeout = window.setTimeout(() => lane.worker.terminate(), 300)
  lane.worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
    if (data.type === 'closed') { clearTimeout(timeout); lane.worker.terminate() }
  }
  lane.worker.postMessage({ type: 'close' } satisfies WorkerRequest)
}
function stop() {
  generation++; running = starting = false
  cancelAnimationFrame(raf); raf = 0
  stream?.getTracks().forEach(track => track.stop()); stream = null
  video.pause(); video.srcObject = null
  retire(handLane); retire(humanLane); handLane = humanLane = null
  clearTracking(); document.body.classList.remove('camera-on')
  button.disabled = false; button.textContent = '카메라 켜기'; setStatus('카메라를 켜면 시작해요')
}
function fail(error: unknown) {
  stop(); errorLabel.hidden = false
  errorLabel.textContent = error instanceof DOMException && error.name === 'NotAllowedError'
    ? '카메라 권한을 허용한 뒤 다시 시도해 주세요.'
    : '카메라 또는 인식 모델을 준비하지 못했어요. 다시 시도해 주세요.'
  console.error('Shampoo:', error)
}
function createLane(role: 'hands' | 'human', token: number): { lane: Lane; ready: Promise<void> } {
  const worker = new Worker(new URL('./shampoo-worker.ts', import.meta.url), { type: 'module' })
  const lane: Lane = { worker, busy: false, last: -Infinity, videoTime: -1 }
  const ready = new Promise<void>((resolveReady, reject) => {
    lane.reject = reject
    lane.timeout = window.setTimeout(() => reject(new Error('Tracking initialization timed out')), 45000)
    worker.onerror = event => {
      if (token !== generation) return
      const error = new Error(event.message || 'Tracking worker failed')
      if (lane.reject) lane.reject(error); else fail(error)
    }
    worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      if (token !== generation) return
      if (data.type === 'ready') {
        clearTimeout(lane.timeout); lane.reject = undefined; resolveReady(); return
      }
      if (data.type === 'error') {
        if (lane.reject) lane.reject(new Error(data.message)); else fail(new Error(data.message))
        return
      }
      lane.busy = false
      if (!running || document.hidden) return
      if (data.type === 'human') {
        const points = data.face.map(p => ({ x: p.x, y: p.y * aspect }))
        const nextPose = getPose(points)
        if (nextPose) {
          if (data.time - faceAt > FACE_GRACE) { scalp = null; maskAt = -Infinity }
          face = points; pose = nextPose; faceAt = data.time
          if (data.mask) {
            const next = extractScalp(data.mask.data, data.mask.width, data.mask.height, aspect, face, pose)
            if (next) { scalp = next; maskAt = data.time }
          }
        }
      } else if (data.type === 'hands') {
        // Match by nearest previous palm, never array index/handedness (both can flip under occlusion).
        const available = new Set([0, 1])
        for (const [handIndex, hand] of data.hands.entries()) {
          if (hand.length !== 21) continue
          const palm = { x: hand[9].x, y: hand[9].y * aspect }
          const cost = (index: number) => strokes[index].position && data.time - strokes[index].seen < HAND_GRACE
            ? distance(strokes[index].position!, palm) : 2
          const index = [...available].sort((a, b) => cost(a) - cost(b))[0]
          if (index === undefined) break
          available.delete(index)
          const s = strokes[index], previous = data.time - s.seen < HAND_GRACE ? s.gesture : 'open'
          if (data.time - s.seen > HAND_GRACE) s.side = undefined
          const side = data.sides?.[handIndex]
          if (side?.side && side.score >= .6) s.side = side.side
          const gesture = readGesture(hand, previous, aspect)
          const circle = liveFace(data.time) && pose ? blowSign(hand, face, pose, aspect, data.time - s.blowAt < HAND_GRACE) : null
          s.position = palm
          if (circle) {
            if (s.side === 'left') fog.endStroke()
            s.circle = circle; s.blowAt = data.time
            strokeSamples(s, 'open', circle, data.time, false, pose!.scale)
            continue
          }
          // An explicit gesture release ends blowing immediately; a missing result gets grace.
          s.blowAt = -Infinity; s.circle = undefined
          if (s.side === 'left') {
            const wipe = gesture.gesture === 'open' ? wipePalm(hand, aspect) : null
            if (wipe) fog.wipe(screenPoint(wipe.point), wipe.span * Math.max(width, height / aspect) * .85, data.time)
            else fog.endStroke()
          }
          const hit = liveFace(data.time) && !!pose && (insideFace(gesture.point) || (liveMask(data.time) && scalpContains(local(gesture.point, pose), scalp!)))
          const samples = strokeSamples(s, gesture.gesture, gesture.point, data.time, hit, pose?.scale ?? .15)
          if (liveFace(data.time) && pose) for (const p of samples) emitFoam(p, gesture.gesture === 'fist', data.time)
        }
      }
    }
  })
  // Teardown may reject readiness before the caller has joined both worker promises.
  void ready.catch(() => undefined)
  worker.postMessage({ type: 'init', role, origin: new URL(import.meta.env.BASE_URL, location.origin).href.replace(/\/$/, '') } satisfies WorkerRequest)
  return { lane, ready }
}
const oval = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
function insideFace(p: Point) {
  let inside = false
  for (let i = 0, j = oval.length - 1; i < oval.length; j = i++) {
    const a = face[oval[i]], b = face[oval[j]]
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
function emitFoam(p: Point, large: boolean, now: number) {
  if (!pose) return
  const count = large ? 19 : 2
  for (let i = 0; i < count; i++) {
    // Bound memory without aging/removing existing permanent foam. Reset explicitly washes it away.
    if (foam.length >= 12000) return
    const angle = i * 2.39996 + random(foam.length) * .4
    const spread = large ? Math.sqrt(i / count) * pose.scale * .57 : pose.scale * .025
    const point = { x: p.x + Math.cos(angle) * spread, y: p.y + Math.sin(angle) * spread }
    foam.push({ id: nextFoamId++, anchor: attach(point, face, pose), radius: (large ? .15 : .018) + random(nextFoamId + 6) * (large ? .11 : .015), variant: nextFoamId % 4, born: now })
  }
}
async function start() {
  if (starting || disposed) return
  if (running) { stop(); return }
  starting = true; button.disabled = true; button.textContent = '준비하는 중…'; errorLabel.hidden = true
  setStatus('카메라와 거품을 준비하고 있어요')
  const token = ++generation
  try {
    // Start permission request with the user gesture; late streams are stopped even after teardown.
    // Keep the displayed camera sharp when cover enlarges it to fill the screen.
    // Only inference copies are reduced to 512px; the video retains the camera's HD frame.
    const cameraReady = navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } }, audio: false }).then(async media => {
      if (token !== generation) { media.getTracks().forEach(track => track.stop()); return }
      stream = media; video.srcObject = media
      media.getVideoTracks().forEach(track => track.addEventListener('ended', () => { if (token === generation) fail(new Error('Camera disconnected')) }, { once: true }))
      await video.play()
      if (token === generation) aspect = video.videoHeight / video.videoWidth
    })
    // Attach a rejection handler immediately, including failures while constructing workers.
    void cameraReady.catch(() => undefined)
    const hand = createLane('hands', token); handLane = hand.lane
    const human = createLane('human', token); humanLane = human.lane
    await Promise.all([cameraReady, hand.ready, human.ready])
    if (token !== generation) return
    bath.reset(width, height); fog.reset(); lastRender = 0
    running = true; starting = false; button.disabled = false; button.textContent = '카메라 끄기'
    document.body.classList.add('camera-on')
    if (document.hidden) { stream?.getTracks().forEach(t => { t.enabled = false }); video.pause() }
    else raf = requestAnimationFrame(render)
  } catch (error) { if (token === generation) fail(error) }
}
async function sendFrame(lane: Lane, now: number, segment = false) {
  lane.busy = true; lane.last = now; lane.videoTime = video.currentTime
  const token = generation
  try {
    const bitmap = await createImageBitmap(video, { resizeWidth: 512, resizeHeight: Math.round(512 * aspect) })
    if (token !== generation || document.hidden) { bitmap.close(); lane.busy = false; return }
    lane.worker.postMessage({ type: 'frame', bitmap, time: now, segment } satisfies WorkerRequest, [bitmap])
  } catch (error) { lane.busy = false; if (token === generation) fail(error) }
}
function render(now: number) {
  raf = 0
  if (!running || document.hidden) return
  const delta = lastRender ? (now - lastRender) / 1000 : 1 / 60
  lastRender = now
  const active = gesturing(now)
  const blowing = strokes.some(s => now - s.blowAt < HAND_GRACE) && liveFace(now)
  if (blowing && pose) {
    const mouth = screenPoint({ x: (face[13].x + face[14].x) / 2, y: (face[13].y + face[14].y) / 2 })
    for (const s of strokes) if (s.circle && now - s.blowAt < HAND_GRACE && now - s.soapAt > 95) {
      const point = screenPoint(s.circle)
      bath.emit(point, { x: point.x - mouth.x, y: point.y - mouth.y }, pose.scale * Math.max(width, height / aspect))
      s.soapAt = now
    }
  }
  const food: Food[] = []
  if ((bath.duck || bath.elapsed + delta >= bath.nextDuck) && liveFace(now) && pose) {
    for (const b of foam) food.push({ ...screenPoint(resolve(b.anchor, face, pose)), key: `foam:${b.id}`, radius: b.radius * pose.scale * Math.max(width, height / aspect) })
    if (liveMask(now) && scalp) for (const b of scalp.points) {
      if (!scalpWasEaten(b.point)) food.push({ ...screenPoint(world(b.point, pose)), key: `scalp:${b.seed}`, radius: 5 })
    }
  }
  const eaten = new Set(bath.update(delta, width, height, food))
  if (eaten.size) {
    foam = foam.filter(b => !eaten.has(`foam:${b.id}`))
    if (scalp) for (const b of scalp.points) if (eaten.has(`scalp:${b.seed}`) && !scalpWasEaten(b.point)) eatenScalp.push({ ...b.point })
  }
  if (video.readyState >= 2) {
    // Separate queues: HumanSeg can never block the hand worker, and neither queue accumulates frames.
    if (handLane && !handLane.busy && now - handLane.last >= (active ? 32 : 45) && handLane.videoTime !== video.currentTime) void sendFrame(handLane, now)
    if (humanLane && !humanLane.busy && now - humanLane.last >= (active ? 75 : 60) && humanLane.videoTime !== video.currentTime) {
      const segment = now - lastSeg >= (active ? 580 : 190)
      if (segment) lastSeg = now
      void sendFrame(humanLane, now, segment)
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height)
  const renderedWidth = Math.max(width, height / aspect), renderedHeight = renderedWidth * aspect
  // Identical mirrored object-fit:cover transform for video, landmarks, masks and foam.
  ctx.setTransform(-renderedWidth * dpr, 0, 0, renderedWidth * dpr, (width + renderedWidth) * dpr / 2, (height - renderedHeight) * dpr / 2)
  if (liveFace(now) && pose) {
    const alpha = Math.min(1, Math.max(0, (FACE_GRACE - (now - faceAt)) / 120))
    ctx.globalAlpha = alpha
    if (liveMask(now) && scalp) {
      ctx.globalAlpha = alpha * .38
      for (const b of scalp.points) {
        if (scalpWasEaten(b.point)) continue
        const phase = random(b.seed) * Math.PI * 2
        const t = reducedMotion.matches ? 0 : Math.sin(now * .0018 + phase) * .026
        const n = (b.edge ? .025 : 0) + (reducedMotion.matches ? 0 : Math.cos(now * .0013 + phase) * .013)
        const point = world({ x: b.point.x + (random(b.seed + 7) - .5) * .035 + b.normal.x * n - b.normal.y * t, y: b.point.y + (random(b.seed + 13) - .5) * .025 + b.normal.y * n + b.normal.x * t }, pose)
        drawBubble(point, pose.scale * (.042 + random(b.seed + 2) * .02), b.seed % 4)
      }
    }
    ctx.globalAlpha = alpha
    for (const b of foam) {
      const growth = reducedMotion.matches ? 1 : Math.min(1, .45 + (now - b.born) / 140)
      drawBubble(resolve(b.anchor, face, pose), b.radius * pose.scale * growth, b.variant)
    }
    ctx.globalAlpha = 1
    setStatus(blowing ? '후우— 투명한 비눗방울을 불고 있어요' : bath.duck ? '러버덕이 거품 먹으러 왔어요 · 냠냠!' : foam.length >= 12000 ? '거품이 가득해요 · 씻어내고 다시 시작해요' : active ? strokes.some(s => s.gesture === 'point' && now - s.seen < HAND_GRACE) ? '검지 끝으로 작은 샴푸 거품을 그리고 있어요' : '보글보글, 샴푸 거품을 만들고 있어요' : liveMask(now) ? '손끝으로 거품을 그려보세요' : '머리 윤곽을 찾고 있어요')
  } else setStatus('얼굴이 카메라에 보이도록 해주세요')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  for (const b of bath.bubbles) {
    const growth = Math.min(1, .3 + (bath.elapsed - b.born) / .22)
    const r = b.radius * growth
    ctx.drawImage(soap[b.variant], b.x - r, b.y - r, r * 2, r * 2)
  }
  const duck = bath.duck
  if (duck) {
    ctx.save(); ctx.translate(duck.x, duck.y + Math.sin(bath.elapsed * 5) * 2)
    ctx.scale(duck.direction, 1)
    ctx.rotate(Math.sin(bath.elapsed * 4) * .04)
    const chewing = bath.elapsed < duck.chewUntil
    const size = chewing ? 78 + Math.sin(bath.elapsed * 35) * 2 : 78
    ctx.drawImage(ducks[chewing ? 1 : 0], -size / 2, -size / 2, size, size)
    ctx.restore()
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  fog.paint(video, canvas, now)
  if (now - fog.wipeAt < 420) setStatus('쓱쓱— 왼손으로 김을 닦고 있어요')
  raf = requestAnimationFrame(render)
}
function drawBubble(p: Point, radius: number, variant: number) {
  ctx.drawImage(sprites[variant], p.x - radius, p.y - radius, radius * 2, radius * 2)
}
button.addEventListener('click', () => { void start() })
document.querySelector('#foam-reset')!.addEventListener('click', () => { foam = []; eatenScalp = []; strokes = [newHand(), newHand()]; bath.reset(width, height) })
document.querySelector('#fog-reset')!.addEventListener('click', () => { fog.reset() })
window.addEventListener('resize', resize)
function visibility() {
  if (!running) return
  cancelAnimationFrame(raf); raf = 0; lastRender = 0
  stream?.getTracks().forEach(track => { track.enabled = !document.hidden })
  strokes = [newHand(), newHand()]
  fog.endStroke()
  if (document.hidden) video.pause()
  else {
    faceAt = maskAt = lastSeg = -Infinity
    void video.play().then(() => { if (running && !document.hidden && !raf) raf = requestAnimationFrame(render) }).catch(fail)
  }
}
document.addEventListener('visibilitychange', visibility)
function dispose() { disposed = true; stop() }
window.addEventListener('interactive:dispose', dispose)
window.addEventListener('pagehide', stop)
window.addEventListener('beforeunload', stop)
if (import.meta.hot) import.meta.hot.dispose(() => {
  dispose(); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility)
  window.removeEventListener('interactive:dispose', dispose); window.removeEventListener('pagehide', stop); window.removeEventListener('beforeunload', stop)
})
resize()
