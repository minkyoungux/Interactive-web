import './expression-lab.css'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { BlinkPulse, SignalSmoother, clamp01, expressionFromFace, type Blendshape, type ExpressionSignal, type FacePoint } from './expression-core'

type Phase = 'idle' | 'loading' | 'live' | 'error'
type Pulse = { x: number; y: number; born: number; color: string; strength: number }

const icon = (name: 'camera' | 'capture' | 'arrow') => ({
  camera: '<rect x="3" y="6" width="18" height="14" rx="4"/><path d="m8 6 1.5-2h5L16 6"/><circle cx="12" cy="13" r="3.5"/>',
  capture: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/>',
  arrow: '<path d="M5 12h14M14 7l5 5-5 5"/>',
})[name]
const svg = (name: Parameters<typeof icon>[0]) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icon(name)}</svg>`

document.body.classList.add('signal-page')
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="signal-shell" data-phase="idle">
    <header class="signal-header">
      <a class="signal-brand" href="${import.meta.env.BASE_URL}#face-signal" aria-label="인터랙티브 랩으로 돌아가기"><i></i><span>FACE SIGNAL<small>EXPRESSION SYNTHESIZER</small></span></a>
      <div class="signal-state" role="status" aria-live="polite"><i></i><span>DEMO SIGNAL</span></div>
      <button class="camera-button" type="button">${svg('camera')}<span>카메라 연결</span></button>
    </header>

    <section class="signal-hero">
      <div class="signal-copy">
        <p>EXPERIMENT 21 · HUMAN INPUT</p>
        <h1>표정은<br><em>빛이 된다.</em></h1>
      </div>
      <p class="signal-intro">감정을 이름 붙이지 않고,<br>얼굴의 작은 움직임을 시각 신호로 바꿉니다.</p>
    </section>

    <section class="signal-workspace">
      <aside class="signal-controls">
        <div class="section-label"><span>01</span><b>SIGNAL MAP</b></div>
        <p class="control-lead">얼굴을 움직여 다섯 개의<br>시각 채널을 연주해보세요.</p>
        <div class="channel-list">
          <button type="button" data-demo="smile"><i style="--channel:#ff643d"></i><span><b>SMILE</b><small>빛이 피어나요</small></span><output>00</output></button>
          <button type="button" data-demo="mouth"><i style="--channel:#5cf2d6"></i><span><b>MOUTH</b><small>파동이 퍼져요</small></span><output>00</output></button>
          <button type="button" data-demo="blink"><i style="--channel:#f2ff62"></i><span><b>BLINK</b><small>순간을 찍어요</small></span><output>00</output></button>
          <button type="button" data-demo="brow"><i style="--channel:#b9a7ff"></i><span><b>BROW</b><small>빛을 끌어올려요</small></span><output>00</output></button>
          <button type="button" data-demo="tilt"><i style="--channel:#8be4ff"></i><span><b>TILT</b><small>공간이 기울어요</small></span><output>00</output></button>
        </div>
        <p class="local-note"><i></i> 영상과 얼굴 좌표는 저장되거나 전송되지 않고 이 기기에서만 처리됩니다.</p>
      </aside>

      <section class="signal-stage" aria-label="얼굴 신호 시각화">
        <video playsinline muted aria-hidden="true"></video>
        <div class="stage-placeholder" aria-hidden="true"><div class="demo-face"><i></i><i></i><span></span></div><p>MOVE YOUR POINTER</p></div>
        <canvas class="signal-canvas"></canvas>
        <div class="stage-grid" aria-hidden="true"></div>
        <div class="stage-top"><span><i></i> <b class="stage-mode">POINTER PREVIEW</b></span><span>LOCAL PROCESS · 30 FPS</span></div>
        <div class="stage-message"><span>YOUR FACE IS A</span><strong>LIVE SIGNAL</strong></div>
        <div class="stage-hint">카메라 없이 움직여 보기 <b>↗</b></div>
        <button class="capture-button" type="button" disabled>${svg('capture')}<span>CAPTURE</span></button>
        <div class="flash" aria-hidden="true"></div>
      </section>

      <aside class="signal-data">
        <div class="section-label"><span>02</span><b>LIVE READOUT</b></div>
        <div class="signal-orb" aria-hidden="true"><i></i><i></i><i></i><b></b></div>
        <div class="primary-readout"><span>ACTIVE CHANNEL</span><strong>WAITING</strong><small>— 000</small></div>
        <div class="data-grid"><div><span>HTA</span><output>+00.0</output></div><div><span>EAP</span><output>+00.0</output></div><div><span>SMV</span><output>+00.0</output></div></div>
        <div class="history"><span>RECENT SIGNAL</span><canvas></canvas></div>
        <p class="data-note">표정은 분류되지 않습니다.<br>움직임의 크기만 실시간으로 번역합니다.</p>
      </aside>
    </section>

    <footer class="signal-footer"><span>SMILE · OPEN · BLINK · RAISE · TILT</span><span>NO EMOTION LABELS / ONLY MOVEMENT</span></footer>
  </main>`

const shell = document.querySelector<HTMLElement>('.signal-shell')!
const stage = document.querySelector<HTMLElement>('.signal-stage')!
const video = document.querySelector<HTMLVideoElement>('.signal-stage video')!
const canvas = document.querySelector<HTMLCanvasElement>('.signal-canvas')!
const ctx = canvas.getContext('2d')!
const historyCanvas = document.querySelector<HTMLCanvasElement>('.history canvas')!
const historyCtx = historyCanvas.getContext('2d')!
const cameraButton = document.querySelector<HTMLButtonElement>('.camera-button')!
const captureButton = document.querySelector<HTMLButtonElement>('.capture-button')!
const stateText = document.querySelector<HTMLElement>('.signal-state span')!
const modeText = document.querySelector<HTMLElement>('.stage-mode')!
const activeText = document.querySelector<HTMLElement>('.primary-readout strong')!
const activeValue = document.querySelector<HTMLElement>('.primary-readout small')!
const readouts = Array.from(document.querySelectorAll<HTMLOutputElement>('.channel-list output'))
const dataOutputs = Array.from(document.querySelectorAll<HTMLOutputElement>('.data-grid output'))
const demoButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-demo]'))
const inferenceCanvas = document.createElement('canvas'), inferenceCtx = inferenceCanvas.getContext('2d')!
const smoother = new SignalSmoother(), blinkPulse = new BlinkPulse(), lifetime = new AbortController(), on = { signal: lifetime.signal }

let phase: Phase = 'idle', stream: MediaStream | null = null, model: FaceLandmarker | null = null
let frame = 0, generation = 0, disposed = false, lastVideoTime = -1, lastInferenceAt = -Infinity, faceSeenAt = -Infinity
let facePoints: FacePoint[] = [], current: ExpressionSignal = { smile: .18, mouth: .08, blink: 0, brow: .14, tilt: 0, energy: .18 }
let pointer = { x: .5, y: .5, active: false }, demoUntil = 0, demoChannel: keyof ExpressionSignal | null = null, lastPulseAt = 0
const pulses: Pulse[] = [], history: number[] = Array(84).fill(0)

const channelInfo: Record<'smile' | 'mouth' | 'blink' | 'brow' | 'tilt', { label: string; color: string }> = {
  smile: { label: 'BLOOM', color: '#ff643d' }, mouth: { label: 'WAVE', color: '#5cf2d6' }, blink: { label: 'SHUTTER', color: '#f2ff62' },
  brow: { label: 'LIFT', color: '#b9a7ff' }, tilt: { label: 'SHIFT', color: '#8be4ff' },
}

function setPhase(next: Phase, detail?: string) {
  phase = next; shell.dataset.phase = next
  const copy = { idle: 'DEMO SIGNAL', loading: 'CONNECTING', live: 'FACE CONNECTED', error: detail ?? 'CAMERA ERROR' }[next]
  stateText.textContent = copy; modeText.textContent = next === 'live' ? 'LIVE FACE INPUT' : next === 'loading' ? 'LOADING MODEL' : next === 'error' ? 'POINTER FALLBACK' : 'POINTER PREVIEW'
  cameraButton.querySelector('span')!.textContent = next === 'live' ? '카메라 끄기' : next === 'loading' ? '연결 중…' : '카메라 연결'
  cameraButton.disabled = next === 'loading'; captureButton.disabled = next !== 'live'
}

function dominant(signal: ExpressionSignal) {
  const values = { smile: signal.smile, mouth: signal.mouth, blink: signal.blink, brow: signal.brow, tilt: Math.abs(signal.tilt) }
  return (Object.entries(values).sort((a, b) => b[1] - a[1])[0] ?? ['smile', 0]) as [keyof typeof values, number]
}

function demoSignal(now: number): ExpressionSignal {
  if (demoChannel && now < demoUntil) {
    const wave = .65 + Math.sin(now / 115) * .22
    return { smile: demoChannel === 'smile' ? wave : .08, mouth: demoChannel === 'mouth' ? wave : .04, blink: demoChannel === 'blink' ? wave : 0, brow: demoChannel === 'brow' ? wave : .08, tilt: demoChannel === 'tilt' ? Math.sin(now / 280) * .8 : (pointer.x - .5) * .3, energy: wave }
  }
  demoChannel = null
  const dx = pointer.x - .5, dy = pointer.y - .5
  return { smile: clamp01(.12 + Math.max(0, dx) * 1.2), mouth: clamp01(.04 + Math.max(0, dy) * 1.1), blink: 0, brow: clamp01(.12 + Math.max(0, -dy) * .85), tilt: dx * .9, energy: clamp01(.18 + Math.hypot(dx, dy) * .8) }
}

function updateUI(signal: ExpressionSignal) {
  const values = [signal.smile, signal.mouth, signal.blink, signal.brow, Math.abs(signal.tilt)]
  readouts.forEach((output, index) => output.value = String(Math.round(values[index] * 99)).padStart(2, '0'))
  demoButtons.forEach((button, index) => button.style.setProperty('--level', String(values[index])))
  const [name, value] = dominant(signal), info = channelInfo[name]
  activeText.textContent = value < .18 ? 'LISTENING' : info.label; activeText.style.color = value < .18 ? '' : info.color
  activeValue.textContent = `— ${String(Math.round(value * 999)).padStart(3, '0')}`
  dataOutputs[0].value = `${signal.tilt >= 0 ? '+' : '−'}${(Math.abs(signal.tilt) * 49).toFixed(1)}`
  dataOutputs[1].value = `+${(signal.energy * 72).toFixed(1)}`
  dataOutputs[2].value = `+${(signal.smile * 88).toFixed(1)}`
  shell.style.setProperty('--energy', String(signal.energy)); shell.style.setProperty('--tilt', `${signal.tilt * 2.2}deg`); shell.style.setProperty('--active', info.color)
}

function resizeCanvas(target: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  const rect = target.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2)
  const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.max(1, Math.round(rect.height * dpr))
  if (target.width !== width || target.height !== height) { target.width = width; target.height = height }
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  return rect
}

function mapPoint(point: FacePoint, width: number, height: number) {
  const sourceW = video.videoWidth || 640, sourceH = video.videoHeight || 480, scale = Math.max(width / sourceW, height / sourceH)
  const drawW = sourceW * scale, drawH = sourceH * scale
  return { x: (1 - point.x) * drawW + (width - drawW) / 2, y: point.y * drawH + (height - drawH) / 2 }
}

const LINES = [
  [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10],
  [33, 160, 158, 133, 153, 144, 33], [362, 385, 387, 263, 373, 380, 362],
  [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291], [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
  [70, 63, 105, 66, 107], [336, 296, 334, 293, 300], [168, 6, 197, 195, 5, 4, 1],
]

function addPulse(x: number, y: number, now: number, color: string, strength: number) { pulses.push({ x, y, born: now, color, strength }); if (pulses.length > 18) pulses.shift() }

function drawVisual(now: number) {
  const rect = resizeCanvas(canvas, ctx), w = rect.width, h = rect.height
  ctx.clearRect(0, 0, w, h)
  const hasFace = facePoints.length > 0 && phase === 'live', center = hasFace ? mapPoint(facePoints[1], w, h) : { x: w * (.5 + current.tilt * .05), y: h * .46 }
  const mouthCenter = hasFace ? mapPoint(facePoints[13], w, h) : { x: center.x, y: center.y + h * .16 }

  if ((current.mouth > .48 || current.smile > .62) && now - lastPulseAt > 190) { addPulse(mouthCenter.x, mouthCenter.y, now, current.mouth > current.smile ? '#5cf2d6' : '#ff643d', Math.max(current.mouth, current.smile)); lastPulseAt = now }
  for (let index = pulses.length - 1; index >= 0; index--) if (now - pulses[index].born > 1050) pulses.splice(index, 1)
  pulses.forEach(pulse => {
    const age = (now - pulse.born) / 1050
    ctx.save(); ctx.globalAlpha = (1 - age) * .65; ctx.strokeStyle = pulse.color; ctx.lineWidth = 1.2
    ctx.beginPath(); ctx.ellipse(pulse.x, pulse.y, 18 + age * w * .28 * pulse.strength, 9 + age * h * .16 * pulse.strength, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore()
  })

  if (current.brow > .15) {
    const gradient = ctx.createLinearGradient(0, h, 0, 0); gradient.addColorStop(0, 'rgba(185,167,255,0)'); gradient.addColorStop(1, `rgba(185,167,255,${current.brow * .35})`)
    ctx.fillStyle = gradient
    for (let x = -30; x < w + 30; x += 34) { const lift = (Math.sin(x * .035 + now * .002) + 1) * 14; ctx.fillRect(x + current.tilt * 30, h * .72, 1, -h * (.16 + current.brow * .48) - lift) }
  }

  if (current.smile > .12) {
    ctx.save(); ctx.translate(center.x, center.y); ctx.rotate(current.tilt * .16); ctx.globalCompositeOperation = 'screen'
    const count = 9
    for (let i = 0; i < count; i++) { const angle = i / count * Math.PI * 2 + now * .00012; const radius = 58 + current.smile * Math.min(w, h) * .25; const size = 2 + current.smile * 5; ctx.fillStyle = i % 2 ? '#ff643d' : '#ffc56e'; ctx.globalAlpha = .25 + current.smile * .5; ctx.beginPath(); ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, size, 0, Math.PI * 2); ctx.fill() }
    ctx.restore()
  }

  if (hasFace) {
    ctx.save(); ctx.strokeStyle = `rgba(102,239,221,${.34 + current.energy * .5})`; ctx.lineWidth = 1
    ctx.shadowColor = '#4eeee1'; ctx.shadowBlur = 5 + current.energy * 9
    LINES.forEach(indices => { ctx.beginPath(); indices.forEach((index, order) => { const point = mapPoint(facePoints[index], w, h); order ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y) }); ctx.stroke() })
    ctx.shadowBlur = 0; ctx.fillStyle = '#f2ff62'
    ;[1, 33, 263, 61, 291, 13, 14].forEach(index => { const point = mapPoint(facePoints[index], w, h); ctx.beginPath(); ctx.arc(point.x, point.y, 2.1, 0, Math.PI * 2); ctx.fill() })
    const left = mapPoint(facePoints[234], w, h), right = mapPoint(facePoints[454], w, h), top = mapPoint(facePoints[10], w, h), bottom = mapPoint(facePoints[152], w, h)
    ctx.strokeStyle = 'rgba(242,255,98,.55)'; ctx.setLineDash([4, 5]); ctx.strokeRect(left.x - 18, top.y - 24, right.x - left.x + 36, bottom.y - top.y + 43); ctx.setLineDash([])
    drawCallout(right.x + 12, center.y - 28, 'SMV', current.smile, '#ff795b', w)
    drawCallout(left.x - 86, mouthCenter.y + 30, 'EAP', current.mouth, '#5cf2d6', w)
    ctx.restore()
  }
  if (current.blink > .62) { ctx.fillStyle = `rgba(242,255,98,${(current.blink - .62) * 1.6})`; ctx.fillRect(0, 0, w, h) }
}

function drawCallout(x: number, y: number, label: string, value: number, color: string, width: number) {
  x = Math.max(8, Math.min(width - 80, x)); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18, y - 15); ctx.lineTo(x + 54, y - 15); ctx.stroke()
  ctx.font = '600 8px ui-monospace, monospace'; ctx.fillText(`${label}  ${(value * 99).toFixed(1)}`, x + 20, y - 20)
}

function drawHistory(value: number) {
  history.push(value); history.shift()
  const rect = resizeCanvas(historyCanvas, historyCtx), w = rect.width, h = rect.height
  historyCtx.clearRect(0, 0, w, h); historyCtx.strokeStyle = getComputedStyle(shell).getPropertyValue('--active').trim() || '#ff643d'; historyCtx.lineWidth = 1.3; historyCtx.beginPath()
  history.forEach((item, index) => { const x = index / (history.length - 1) * w, y = h - 2 - item * (h - 5); index ? historyCtx.lineTo(x, y) : historyCtx.moveTo(x, y) }); historyCtx.stroke()
}

function processFace(points: FacePoint[], shapes: Blendshape[], now: number) {
  faceSeenAt = now; facePoints = points
  modeText.textContent = 'LIVE FACE INPUT'
  const raw = expressionFromFace(points, shapes)
  current = smoother.update(raw, now)
  if (blinkPulse.update(raw.blink)) { const center = mapPoint(points[1], canvas.clientWidth, canvas.clientHeight); addPulse(center.x, center.y, now, '#f2ff62', 1); stage.classList.remove('blink-shot'); void stage.offsetWidth; stage.classList.add('blink-shot') }
}

function infer(now: number) {
  if (!model || video.readyState < 2 || video.currentTime === lastVideoTime || now - lastInferenceAt < 32) return
  lastVideoTime = video.currentTime; lastInferenceAt = now
  const width = navigator.hardwareConcurrency <= 4 ? 480 : 640, height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth))
  if (inferenceCanvas.width !== width || inferenceCanvas.height !== height) { inferenceCanvas.width = width; inferenceCanvas.height = height }
  inferenceCtx.drawImage(video, 0, 0, width, height)
  const result = model.detectForVideo(inferenceCanvas, now), points = result.faceLandmarks[0] as FacePoint[] | undefined
  if (points) processFace(points, result.faceBlendshapes[0]?.categories ?? [], now)
  else if (now - faceSeenAt > 320) { facePoints = []; current = smoother.update({ smile: 0, mouth: 0, blink: 0, brow: 0, tilt: 0, energy: 0 }, now); modeText.textContent = 'FACE NOT FOUND' }
}

function loop(now: number) {
  frame = 0; if (disposed) return
  try {
    if (phase === 'live') infer(now)
    else current = smoother.update(demoSignal(now), now)
    updateUI(current); drawVisual(now); drawHistory(current.energy)
    frame = requestAnimationFrame(loop)
  } catch (cause) { console.error('Face Signal render failed', cause); stopSession(); setPhase('error', 'SIGNAL ERROR'); frame = requestAnimationFrame(loop) }
}

async function createModel(token: number) {
  const vision = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`)
  for (const delegate of ['GPU', 'CPU'] as const) {
    let candidate: FaceLandmarker | null = null
    try {
      candidate = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/face_landmarker.task`, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true, minFaceDetectionConfidence: .5, minFacePresenceConfidence: .5, minTrackingConfidence: .5 })
      if (disposed || token !== generation) { candidate.close(); return }
      model = candidate; return
    } catch (cause) { candidate?.close(); if (delegate === 'CPU') throw cause }
  }
}

async function begin() {
  if (disposed || !['idle', 'error'].includes(phase)) return
  const token = ++generation; setPhase('loading'); let step: 'camera' | 'model' = 'camera'
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('secure')
    const camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 }, frameRate: { ideal: 30, max: 30 } } })
    if (disposed || token !== generation) { camera.getTracks().forEach(track => track.stop()); return }
    stream = camera; video.srcObject = camera; await video.play(); if (disposed || token !== generation) return
    step = 'model'; await createModel(token); if (disposed || token !== generation || !model) return
    smoother.reset(); blinkPulse.reset(); facePoints = []; faceSeenAt = performance.now(); setPhase('live')
  } catch (cause) {
    if (disposed || token !== generation) return
    stopSession()
    const denied = cause instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(cause.name)
    setPhase('error', cause instanceof Error && cause.message === 'secure' ? 'HTTPS REQUIRED' : denied ? 'CAMERA DENIED' : step === 'model' ? 'MODEL ERROR' : 'CAMERA ERROR')
  }
}

function stopSession() {
  generation++; stream?.getTracks().forEach(track => track.stop()); stream = null; video.pause(); video.srcObject = null; model?.close(); model = null
  lastVideoTime = -1; lastInferenceAt = faceSeenAt = -Infinity; facePoints = []; smoother.reset(); blinkPulse.reset(); setPhase('idle')
}

function capture() {
  if (phase !== 'live' || video.readyState < 2) return
  const shot = document.createElement('canvas'), width = 1200, height = Math.round(width * stage.clientHeight / stage.clientWidth); shot.width = width; shot.height = height
  const shotCtx = shot.getContext('2d')!, sourceRatio = video.videoWidth / video.videoHeight, targetRatio = width / height
  let sw = video.videoWidth, sh = video.videoHeight, sx = 0, sy = 0
  if (sourceRatio > targetRatio) { sw = video.videoHeight * targetRatio; sx = (video.videoWidth - sw) / 2 } else { sh = video.videoWidth / targetRatio; sy = (video.videoHeight - sh) / 2 }
  shotCtx.save(); shotCtx.translate(width, 0); shotCtx.scale(-1, 1); shotCtx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height); shotCtx.restore(); shotCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, width, height)
  shot.toBlob(blob => { if (!blob) return; const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `face-signal-${new Date().toISOString().slice(0, 10)}.png`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 20_000) }, 'image/png')
  stage.classList.remove('capture-shot'); void stage.offsetWidth; stage.classList.add('capture-shot')
}

stage.addEventListener('pointermove', event => { const rect = stage.getBoundingClientRect(); pointer = { x: clamp01((event.clientX - rect.left) / rect.width), y: clamp01((event.clientY - rect.top) / rect.height), active: true } }, on)
stage.addEventListener('pointerleave', () => { pointer.active = false }, on)
demoButtons.forEach(button => button.addEventListener('click', () => { demoChannel = button.dataset.demo as keyof ExpressionSignal; demoUntil = performance.now() + 2200 }, on))
cameraButton.addEventListener('click', () => phase === 'live' ? stopSession() : void begin(), on)
captureButton.addEventListener('click', capture, on)

function dispose() { if (disposed) return; disposed = true; lifetime.abort(); cancelAnimationFrame(frame); stopSession(); canvas.width = canvas.height = historyCanvas.width = historyCanvas.height = 1 }
window.addEventListener('interactive:dispose', dispose, on); window.addEventListener('pagehide', dispose, on); if (import.meta.hot) import.meta.hot.dispose(dispose)
setPhase('idle'); frame = requestAnimationFrame(loop)
