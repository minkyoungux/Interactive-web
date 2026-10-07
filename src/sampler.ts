import './sampler.css'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import {
  HeadPalette, MouthGate, SmoothCursor, calibratedGaze, clamp, headYaw, irisGaze, mouthOpenness,
  type Calibration, type Point,
} from './sampler-face-core'

const COLORS = [
  { name: '먹색', value: '#242227' }, { name: '토마토', value: '#f15c46' },
  { name: '살구', value: '#f4a261' }, { name: '라임', value: '#b8d84b' },
  { name: '하늘', value: '#54a8e8' }, { name: '보라', value: '#8d69d8' },
  { name: '분홍', value: '#ed7ca8' },
] as const
type Phase = 'idle' | 'loading' | 'calibrating' | 'live' | 'error'
type Stroke = { color: string; size: number; points: Point[] }
type CalibrationKey = keyof Calibration
const CALIBRATION_STEPS: { key: CalibrationKey; x: number; y: number; label: string }[] = [
  { key: 'center', x: .5, y: .5, label: '가운데' }, { key: 'left', x: .12, y: .5, label: '왼쪽' },
  { key: 'right', x: .88, y: .5, label: '오른쪽' }, { key: 'top', x: .5, y: .12, label: '위' },
  { key: 'bottom', x: .5, y: .88, label: '아래' },
]

document.body.classList.add('face-paint-page')
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="fp-app" data-phase="idle">
    <header class="fp-header">
      <a href="${import.meta.env.BASE_URL}#face-paint" class="fp-brand"><i aria-hidden="true"></i><span>FACE / PAINT<small>EXPRESSION DRAWING TOOL</small></span></a>
      <div class="fp-top-status" role="status" aria-live="polite"><i></i><span>카메라 꺼짐</span></div>
      <button class="fp-camera" type="button">카메라 시작 ↗</button>
    </header>
    <section class="fp-intro">
      <p>DRAW WITHOUT YOUR HANDS / 19</p><h1>표정으로<br><em>그리는 그림.</em></h1>
      <p class="fp-copy">눈으로 움직이고, 입으로 그리고,<br>고개를 흔들어 색을 고르세요.</p>
    </section>
    <section class="fp-workspace">
      <aside class="fp-tracker" aria-label="얼굴 입력 상태">
        <div class="fp-panel-label"><span>01</span><b>YOUR FACE</b></div>
        <div class="fp-preview">
          <video playsinline muted aria-hidden="true"></video><canvas aria-hidden="true"></canvas>
          <div class="fp-preview-placeholder"><span>◉</span><p>카메라를 켜면<br>얼굴이 보여요.</p></div><span class="fp-local">LOCAL ONLY</span>
        </div>
        <div class="fp-readouts">
          <div><span>GAZE</span><i><b class="fp-gaze-meter"></b></i><output class="fp-gaze-value">50 · 50</output></div>
          <div><span>MOUTH</span><i><b class="fp-mouth-meter"></b></i><output class="fp-mouth-value">CLOSED</output></div>
          <div><span>HEAD</span><i><b class="fp-head-meter"></b></i><output class="fp-head-value">CENTER</output></div>
        </div>
        <button class="fp-calibrate" type="button" disabled>시선 다시 맞추기</button>
        <p class="fp-privacy">영상과 얼굴 좌표는 이 기기 안에서만 처리됩니다.</p>
      </aside>
      <section class="fp-canvas-panel" aria-label="표정 드로잉 캔버스">
        <div class="fp-canvas-head">
          <div class="fp-panel-label"><span>02</span><b>YOUR CANVAS</b></div>
          <div class="fp-actions"><button type="button" data-action="undo">되돌리기</button><button type="button" data-action="clear">새 종이</button><button type="button" data-action="save">PNG 저장 ↓</button></div>
        </div>
        <div class="fp-paper">
          <canvas class="fp-drawing" aria-label="그림 영역. 마우스와 터치로도 그릴 수 있습니다."></canvas>
          <div class="fp-cursor" aria-hidden="true"><i></i></div>
          <div class="fp-calibration-target" hidden><i></i><span>여기를 보세요</span></div>
          <div class="fp-empty"><span>눈동자가 커서가 되고</span><strong>입을 벌리면 선이 시작돼요.</strong><small>카메라 없이 마우스나 터치로도 그릴 수 있어요.</small></div>
          <div class="fp-toast" role="status" aria-live="polite"></div>
        </div>
        <div class="fp-palette" role="group" aria-label="붓 색상">
          <span>HEAD SHAKE → COLOR</span>
          <div>${COLORS.map((color, index) => `<button type="button" style="--color:${color.value}" data-color="${color.value}" aria-label="${color.name}" aria-pressed="${index === 1}"><i></i><small>${String(index + 1).padStart(2, '0')}</small></button>`).join('')}</div>
          <output class="fp-color-name">토마토</output>
        </div>
      </section>
      <aside class="fp-guide">
        <div class="fp-panel-label"><span>03</span><b>HOW TO DRAW</b></div>
        <ol><li><i>◉</i><div><b>LOOK</b><span>눈동자로 커서를 옮겨요.</span></div></li><li><i>□</i><div><b>OPEN</b><span>입을 벌린 동안 선을 그려요.</span></div></li><li><i>↔</i><div><b>SHAKE</b><span>고개를 좌우로 돌려 색을 바꿔요.</span></div></li></ol>
        <div class="fp-live-note"><i></i><p><b>READY FOR A FACE</b><span>카메라를 시작해주세요.</span></p></div>
        <p class="fp-tip">TIP — 처음에는 고개를 움직이지 말고 눈동자만 점을 따라가세요. 그 다음부터는 마음껏 흔들어도 좋아요.</p>
      </aside>
    </section>
    <footer class="fp-footer"><span>YOUR FACE IS THE BRUSH.</span><span>NO HANDS, NO RULES. ✦</span></footer>
  </main>`

const app = document.querySelector<HTMLElement>('.fp-app')!, video = document.querySelector<HTMLVideoElement>('.fp-preview video')!
const preview = document.querySelector<HTMLCanvasElement>('.fp-preview canvas')!, previewCtx = preview.getContext('2d')!
const paper = document.querySelector<HTMLElement>('.fp-paper')!, canvas = document.querySelector<HTMLCanvasElement>('.fp-drawing')!, ctx = canvas.getContext('2d')!
const cameraButton = document.querySelector<HTMLButtonElement>('.fp-camera')!, calibrateButton = document.querySelector<HTMLButtonElement>('.fp-calibrate')!
const target = document.querySelector<HTMLElement>('.fp-calibration-target')!, cursor = document.querySelector<HTMLElement>('.fp-cursor')!
const empty = document.querySelector<HTMLElement>('.fp-empty')!, toast = document.querySelector<HTMLElement>('.fp-toast')!
const topStatus = document.querySelector<HTMLElement>('.fp-top-status span')!, topStatusDot = document.querySelector<HTMLElement>('.fp-top-status i')!
const liveNote = document.querySelector<HTMLElement>('.fp-live-note')!, gazeMeter = document.querySelector<HTMLElement>('.fp-gaze-meter')!
const mouthMeter = document.querySelector<HTMLElement>('.fp-mouth-meter')!, headMeter = document.querySelector<HTMLElement>('.fp-head-meter')!
const gazeValue = document.querySelector<HTMLOutputElement>('.fp-gaze-value')!, mouthValue = document.querySelector<HTMLOutputElement>('.fp-mouth-value')!
const headValue = document.querySelector<HTMLOutputElement>('.fp-head-value')!, colorName = document.querySelector<HTMLOutputElement>('.fp-color-name')!
const swatches = Array.from(document.querySelectorAll<HTMLButtonElement>('.fp-palette button'))

let phase: Phase = 'idle', stream: MediaStream | null = null, model: FaceLandmarker | null = null
let frame = 0, lastVideoTime = -1, lastInferenceAt = -Infinity, faceSeenAt = -Infinity, generation = 0, disposed = false, toastTimer = 0
let calibration: Calibration | null = null, calibrationIndex = 0, calibrationStartedAt = 0, calibrationLastAt = 0
let calibrationSamples: Point[] = [], calibrationYaw: number[] = [], calibrationValues: Partial<Calibration> = {}
let currentColor = 1, strokes: Stroke[] = [], activeStroke: Stroke | null = null, pointerId: number | null = null
const mouth = new MouthGate(), palette = new HeadPalette(), smooth = new SmoothCursor()
const inferenceCanvas = document.createElement('canvas'), inferenceCtx = inferenceCanvas.getContext('2d')!
const lifetime = new AbortController(), on = { signal: lifetime.signal }

function setPhase(next: Phase, message?: string) {
  phase = next; app.dataset.phase = next
  const content = { idle: ['카메라 꺼짐', 'READY FOR A FACE', '카메라를 시작해주세요.'], loading: ['인식 준비 중', 'SETTING THINGS UP', '카메라와 얼굴 모델을 여는 중이에요.'], calibrating: ['시선 맞추는 중', 'FOLLOW THE DOT', '고개는 고정하고 점을 눈으로 따라가세요.'], live: ['표정 인식 중', 'FACE CONNECTED', '눈으로 움직이고 입을 벌려 그려보세요.'], error: ['연결할 수 없음', 'TRY THAT AGAIN', message ?? '카메라 연결을 확인해주세요.'] }[next]
  topStatus.textContent = content[0]; topStatusDot.dataset.live = String(next === 'live' || next === 'calibrating')
  liveNote.innerHTML = `<i></i><p><b>${content[1]}</b><span>${content[2]}</span></p>`
  cameraButton.textContent = next === 'idle' || next === 'error' ? '카메라 시작 ↗' : next === 'loading' ? '준비 중…' : '카메라 끄기 ×'
  cameraButton.disabled = next === 'loading'; calibrateButton.disabled = next !== 'live'; target.hidden = next !== 'calibrating'; cursor.hidden = next !== 'live'
}
function showToast(message: string) { clearTimeout(toastTimer); toast.textContent = message; toast.classList.add('show'); toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1600) }
function drawBackground() {
  const width = canvas.clientWidth, height = canvas.clientHeight; ctx.fillStyle = '#fbfaf5'; ctx.fillRect(0, 0, width, height); ctx.fillStyle = 'rgba(59,54,49,.055)'
  for (let y = 13; y < height; y += 18) for (let x = 13 + ((y / 18) % 2) * 5; x < width; x += 18) ctx.fillRect(x, y, .7, .7)
}
function paintStroke(stroke: Stroke) {
  if (!stroke.points.length) return
  const width = canvas.clientWidth, height = canvas.clientHeight, points = stroke.points.map(point => ({ x: point.x * width, y: point.y * height }))
  ctx.strokeStyle = ctx.fillStyle = stroke.color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, Math.min(width, height) * stroke.size)
  if (points.length === 1) { ctx.beginPath(); ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); return }
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length - 1; index++) { const middle = { x: (points[index].x + points[index + 1].x) / 2, y: (points[index].y + points[index + 1].y) / 2 }; ctx.quadraticCurveTo(points[index].x, points[index].y, middle.x, middle.y) }
  ctx.lineTo(points.at(-1)!.x, points.at(-1)!.y); ctx.stroke()
}
function redraw() {
  const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2), width = Math.max(1, Math.round(rect.width * dpr)), height = Math.max(1, Math.round(rect.height * dpr))
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawBackground(); strokes.forEach(paintStroke); empty.hidden = strokes.length > 0 || phase !== 'idle'
}
function startStroke(point: Point) { activeStroke = { color: COLORS[currentColor].value, size: .011, points: [point] }; strokes.push(activeStroke); redraw() }
function sampleStroke(point: Point) { if (!activeStroke) startStroke(point); else { const previous = activeStroke.points.at(-1)!; if (Math.hypot(point.x - previous.x, point.y - previous.y) < .002) return; activeStroke.points.push(point); redraw() } }
function endStroke() { activeStroke = null }
function setColor(index: number, announce = false) { currentColor = (index + COLORS.length) % COLORS.length; swatches.forEach((button, item) => button.setAttribute('aria-pressed', String(item === currentColor))); colorName.textContent = COLORS[currentColor].name; if (activeStroke) endStroke(); if (announce) showToast(`${COLORS[currentColor].name} 붓`) }
function pointFromEvent(event: PointerEvent) { const rect = canvas.getBoundingClientRect(); return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) } }
function updateCursor(point: Point) { cursor.style.left = `${point.x * 100}%`; cursor.style.top = `${point.y * 100}%`; gazeValue.value = `${Math.round(point.x * 100)} · ${Math.round(point.y * 100)}`; gazeMeter.style.setProperty('--value', String(point.x)) }
function drawPreview(points: Point[]) {
  const rect = preview.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2); preview.width = Math.max(1, Math.round(rect.width * dpr)); preview.height = Math.max(1, Math.round(rect.height * dpr)); previewCtx.setTransform(dpr, 0, 0, dpr, 0, 0); previewCtx.clearRect(0, 0, rect.width, rect.height)
  if (!points.length) return
  const x = (index: number) => points[index].x * rect.width, y = (index: number) => points[index].y * rect.height
  previewCtx.strokeStyle = 'rgba(238,255,91,.72)'; previewCtx.fillStyle = '#edff5b'; previewCtx.lineWidth = 1
  ;[[468, 469, 470, 471, 472], [473, 474, 475, 476, 477]].forEach(indices => { const valid = indices.filter(index => points[index]); if (!valid.length) return; const center = valid.reduce((sum, index) => ({ x: sum.x + x(index), y: sum.y + y(index) }), { x: 0, y: 0 }); previewCtx.beginPath(); previewCtx.arc(center.x / valid.length, center.y / valid.length, 3.5, 0, Math.PI * 2); previewCtx.fill() })
  const oval = [10, 338, 284, 389, 454, 397, 379, 152, 176, 172, 234, 162]; previewCtx.beginPath(); oval.forEach((index, order) => order ? previewCtx.lineTo(x(index), y(index)) : previewCtx.moveTo(x(index), y(index))); previewCtx.closePath(); previewCtx.stroke()
}
function beginCalibration() { if (!model || !stream) return; calibration = null; calibrationValues = {}; calibrationIndex = 0; calibrationStartedAt = 0; calibrationLastAt = 0; calibrationSamples = []; calibrationYaw = []; smooth.reset(); mouth.reset(); endStroke(); setPhase('calibrating'); placeCalibrationTarget() }
function placeCalibrationTarget() { const step = CALIBRATION_STEPS[calibrationIndex]; target.style.left = `${step.x * 100}%`; target.style.top = `${step.y * 100}%`; target.querySelector('span')!.textContent = `${step.label}을 보세요 · ${calibrationIndex + 1}/5` }
function recordCalibration(gaze: Point, yaw: number, now: number) {
  if (calibrationLastAt && now - calibrationLastAt > 180) { calibrationStartedAt = now; calibrationSamples = []; calibrationYaw = [] }
  calibrationLastAt = now
  if (!calibrationStartedAt) calibrationStartedAt = now
  const elapsed = now - calibrationStartedAt; if (elapsed > 260) { calibrationSamples.push(gaze); calibrationYaw.push(yaw) }; target.style.setProperty('--progress', String(clamp(elapsed / 920)))
  if (elapsed < 920) return
  if (calibrationSamples.length < 4) { calibrationStartedAt = now; calibrationSamples = []; calibrationYaw = []; return }
  const value = calibrationSamples.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 }); value.x /= calibrationSamples.length; value.y /= calibrationSamples.length
  const key = CALIBRATION_STEPS[calibrationIndex].key; calibrationValues[key] = value
  if (key === 'center') palette.setNeutral(calibrationYaw.reduce((sum, item) => sum + item, 0) / calibrationYaw.length)
  calibrationIndex++; calibrationStartedAt = 0; calibrationLastAt = 0; calibrationSamples = []; calibrationYaw = []
  if (calibrationIndex < CALIBRATION_STEPS.length) { placeCalibrationTarget(); return }
  calibration = calibrationValues as Calibration; setPhase('live'); updateCursor({ x: .5, y: .5 }); showToast('준비됐어요 — 눈으로 움직여보세요')
}
function updateReadouts(open: number, yaw: number) { mouthMeter.style.setProperty('--value', String(open)); mouthValue.value = mouth.open ? 'DRAWING' : 'CLOSED'; const relativeYaw = clamp(yaw * 4 + .5); headMeter.style.setProperty('--value', String(relativeYaw)); headValue.value = relativeYaw < .34 ? 'LEFT' : relativeYaw > .66 ? 'RIGHT' : 'CENTER'; paper.classList.toggle('is-drawing', mouth.open) }
function processFace(points: Point[], scores: { categoryName?: string; score?: number }[], now: number) {
  const raw = irisGaze(points), yaw = headYaw(points), jaw = scores.find(score => score.categoryName === 'jawOpen')?.score ?? 0, openness = mouthOpenness(points, jaw)
  faceSeenAt = now; drawPreview(points)
  if (phase === 'calibrating' && raw) recordCalibration(raw, yaw, now)
  if (phase === 'live' && raw && calibration) { const point = smooth.update(calibratedGaze(raw, calibration), now); updateCursor(point); const wasOpen = mouth.open, open = mouth.update(openness, now); if (open && !wasOpen) startStroke(point); if (open) sampleStroke(point); if (!open && wasOpen) endStroke(); const change = palette.update(yaw, now); if (change) setColor(currentColor + change, true) }
  updateReadouts(openness, yaw)
}
function infer(now: number) {
  if (!model || video.readyState < 2 || video.currentTime === lastVideoTime || now - lastInferenceAt < 32) return
  lastVideoTime = video.currentTime; lastInferenceAt = now
  const width = navigator.hardwareConcurrency <= 4 ? 480 : 640, height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth)); if (inferenceCanvas.width !== width || inferenceCanvas.height !== height) { inferenceCanvas.width = width; inferenceCanvas.height = height }
  inferenceCtx.drawImage(video, 0, 0, width, height); const result = model.detectForVideo(inferenceCanvas, now), points = result.faceLandmarks[0] as Point[] | undefined
  if (points) processFace(points, result.faceBlendshapes[0]?.categories ?? [], now)
  else if (now - faceSeenAt > 260) { previewCtx.clearRect(0, 0, preview.width, preview.height); mouth.reset(); endStroke(); paper.classList.remove('is-drawing'); mouthValue.value = 'NO FACE' }
}
function loop(now: number) { frame = 0; if (disposed || phase === 'idle' || phase === 'error') return; try { infer(now); frame = requestAnimationFrame(loop) } catch (cause) { console.error('Face Paint inference failed', cause); stopSession(); setPhase('error', '얼굴 인식 중 문제가 생겼어요. 다시 시작해주세요.') } }
function closeModel() { model?.close(); model = null }
function stopSession() { generation++; cancelAnimationFrame(frame); frame = 0; stream?.getTracks().forEach(track => track.stop()); stream = null; video.pause(); video.srcObject = null; closeModel(); lastVideoTime = -1; lastInferenceAt = faceSeenAt = -Infinity; calibration = null; mouth.reset(); endStroke(); previewCtx.clearRect(0, 0, preview.width, preview.height); setPhase('idle'); updateReadouts(0, 0) }
async function createModel(token: number) {
  const vision = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`)
  for (const delegate of ['GPU', 'CPU'] as const) { let candidate: FaceLandmarker | null = null; try { if (disposed || token !== generation) return; candidate = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/face_landmarker.task`, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, minFaceDetectionConfidence: .5, minFacePresenceConfidence: .5, minTrackingConfidence: .5 }); if (disposed || token !== generation) { candidate.close(); return }; model = candidate; return } catch (cause) { candidate?.close(); if (delegate === 'CPU') throw cause } }
}
async function begin() {
  if (disposed || !['idle', 'error'].includes(phase)) return
  const token = ++generation; setPhase('loading'); let step: 'camera' | 'model' = 'camera'
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('secure')
    const camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } })
    if (disposed || token !== generation) { camera.getTracks().forEach(track => track.stop()); return }
    stream = camera; video.srcObject = camera; await video.play(); if (disposed || token !== generation) return
    step = 'model'; await createModel(token); if (disposed || token !== generation || !model) return
    camera.getVideoTracks()[0]?.addEventListener('ended', () => { if (token === generation) { stopSession(); setPhase('error', '카메라 연결이 끊겼어요.') } }, on)
    frame = requestAnimationFrame(loop); beginCalibration()
  } catch (cause) {
    if (disposed || token !== generation) return
    stopSession(); const denied = cause instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(cause.name)
    setPhase('error', cause instanceof Error && cause.message === 'secure' ? '카메라는 localhost 또는 HTTPS에서 사용할 수 있어요.' : denied ? '카메라 권한을 허용한 뒤 다시 시작해주세요.' : step === 'model' ? '얼굴 인식 모델을 열지 못했어요.' : '카메라를 열지 못했어요.')
  }
}
function saveDrawing() { canvas.toBlob(blob => { if (!blob) return; const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `face-paint-${new Date().toISOString().slice(0, 10)}.png`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 20_000); showToast('그림을 PNG로 저장했어요') }, 'image/png') }

cameraButton.addEventListener('click', () => { if (phase === 'idle' || phase === 'error') void begin(); else stopSession() }, on); calibrateButton.addEventListener('click', beginCalibration, on)
swatches.forEach((button, index) => button.addEventListener('click', () => setColor(index, true), on))
document.querySelector<HTMLButtonElement>('[data-action="undo"]')!.addEventListener('click', () => { endStroke(); strokes.pop(); redraw(); showToast('마지막 선을 되돌렸어요') }, on)
document.querySelector<HTMLButtonElement>('[data-action="clear"]')!.addEventListener('click', () => { endStroke(); strokes = []; redraw(); showToast('새 종이를 펼쳤어요') }, on)
document.querySelector<HTMLButtonElement>('[data-action="save"]')!.addEventListener('click', saveDrawing, on)
canvas.addEventListener('pointerdown', event => { pointerId = event.pointerId; canvas.setPointerCapture(event.pointerId); startStroke(pointFromEvent(event)); event.preventDefault() }, on)
canvas.addEventListener('pointermove', event => { if (pointerId === event.pointerId) sampleStroke(pointFromEvent(event)) }, on)
canvas.addEventListener('pointerup', event => { if (pointerId === event.pointerId) { pointerId = null; endStroke() } }, on); canvas.addEventListener('pointercancel', () => { pointerId = null; endStroke() }, on)
new ResizeObserver(redraw).observe(canvas)
function dispose() { if (disposed) return; disposed = true; lifetime.abort(); stopSession(); inferenceCanvas.width = inferenceCanvas.height = canvas.width = canvas.height = 1 }
window.addEventListener('interactive:dispose', dispose, on); window.addEventListener('pagehide', dispose, on); window.addEventListener('pageshow', event => { if (event.persisted) location.reload() }); if (import.meta.hot) import.meta.hot.dispose(dispose)
setColor(1); setPhase('idle'); redraw(); updateCursor({ x: .5, y: .5 })
