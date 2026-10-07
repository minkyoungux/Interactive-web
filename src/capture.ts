import './capture.css'

type CaptureSource = HTMLCanvasElement | HTMLVideoElement

const captureRoot = document.createElement('div')
captureRoot.className = 'universal-capture'
captureRoot.dataset.captureUi = 'true'
captureRoot.innerHTML = `
  <p class="capture-status" id="capture-status" role="status" aria-live="polite"></p>
  <button class="capture-button" id="capture-button" type="button" aria-label="짧게 눌러 사진 촬영, 길게 눌러 동영상 촬영"></button>
`
document.body.append(captureRoot)

const button = captureRoot.querySelector<HTMLButtonElement>('#capture-button')!
const status = captureRoot.querySelector<HTMLElement>('#capture-status')!

let holdTimer = 0
let statusTimer = 0
let activePointer: number | null = null
let longPressStarted = false
let recorder: MediaRecorder | null = null
let recordingStream: MediaStream | null = null
let recordingCanvas: HTMLCanvasElement | null = null
let recordingBackdrop: HTMLCanvasElement | null = null
let recordingSources: CaptureSource[] = []
let recordingFrame = 0
let lastRecordingPaintAt = 0
let chunks: Blob[] = []
let domFramePending = false

function showStatus(message: string, mode: 'normal' | 'recording' = 'normal', timeout = 1800) {
  window.clearTimeout(statusTimer)
  status.textContent = message
  status.classList.add('show')
  status.classList.toggle('recording', mode === 'recording')
  if (timeout > 0) statusTimer = window.setTimeout(() => status.classList.remove('show'), timeout)
}

function visibleCaptureSources() {
  return Array.from(document.querySelectorAll<CaptureSource>('video, canvas'))
    .filter((element) => {
      if (element.closest('[data-capture-ui]')) return false
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 40 && rect.height > 40 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0
    })
    .sort((a, b) => {
      const aIndex = Number.parseInt(getComputedStyle(a).zIndex, 10) || 0
      const bIndex = Number.parseInt(getComputedStyle(b).zIndex, 10) || 0
      return aIndex - bIndex
    })
}

function makeOutputCanvas() {
  const output = document.createElement('canvas')
  const longestEdge = Math.max(innerWidth, innerHeight)
  const scale = Math.min(devicePixelRatio || 1, 1920 / Math.max(1, longestEdge))
  output.width = Math.max(1, Math.round(innerWidth * scale))
  output.height = Math.max(1, Math.round(innerHeight * scale))
  return output
}

function paintVideo(context: CanvasRenderingContext2D, video: HTMLVideoElement, x: number, y: number, width: number, height: number) {
  if (!video.videoWidth || !video.videoHeight) return
  const sourceAspect = video.videoWidth / video.videoHeight
  const destinationAspect = width / height
  let sourceX = 0
  let sourceY = 0
  let sourceWidth = video.videoWidth
  let sourceHeight = video.videoHeight
  if (sourceAspect > destinationAspect) {
    sourceWidth = video.videoHeight * destinationAspect
    sourceX = (video.videoWidth - sourceWidth) / 2
  } else {
    sourceHeight = video.videoWidth / destinationAspect
    sourceY = (video.videoHeight - sourceHeight) / 2
  }
  const mirrored = getComputedStyle(video).transform.startsWith('matrix(-') || video.classList.contains('camera')
  context.save()
  if (mirrored) {
    context.translate(x + width, y)
    context.scale(-1, 1)
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height)
  } else {
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height)
  }
  context.restore()
}

function paintSources(output: HTMLCanvasElement, sources: CaptureSource[], clear = true) {
  window.dispatchEvent(new Event('interactivecaptureprepare'))
  const context = output.getContext('2d')!
  const scaleX = output.width / innerWidth
  const scaleY = output.height / innerHeight
  const background = getComputedStyle(document.body).backgroundColor
  context.setTransform(1, 0, 0, 1, 0, 0)
  if (clear) {
    context.clearRect(0, 0, output.width, output.height)
    context.fillStyle = background === 'rgba(0, 0, 0, 0)' ? '#111' : background
    context.fillRect(0, 0, output.width, output.height)
  }
  context.scale(scaleX, scaleY)

  for (const source of sources) {
    const rect = source.getBoundingClientRect()
    try {
      if (source instanceof HTMLVideoElement) paintVideo(context, source, rect.left, rect.top, rect.width, rect.height)
      else context.drawImage(source, rect.left, rect.top, rect.width, rect.height)
    } catch {
      // A single unavailable frame should not interrupt an active recording.
    }
  }
}

async function paintDom(output: HTMLCanvasElement) {
  const { default: html2canvas } = await import('html2canvas')
  const rendered = await html2canvas(document.body, {
    backgroundColor: getComputedStyle(document.body).backgroundColor,
    scale: Math.min(devicePixelRatio || 1, 1.5),
    useCORS: true,
    logging: false,
    ignoreElements: (element) => element instanceof HTMLElement && element.dataset.captureUi === 'true',
  })
  const context = output.getContext('2d')!
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, output.width, output.height)
  context.drawImage(rendered, 0, 0, output.width, output.height)
}

async function snapshot() {
  const output = makeOutputCanvas()
  const sources = visibleCaptureSources()
  try {
    await paintDom(output)
    if (sources.length) paintSources(output, sources, false)
  } catch {
    if (sources.length) paintSources(output, sources)
    else throw new Error('화면을 캡처할 수 없습니다.')
  }
  return output
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = .94) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('이미지를 만들 수 없습니다.')), type, quality)
  })
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 45_000)
}

async function saveBlob(blob: Blob, filename: string, title: string) {
  const file = new File([blob], filename, { type: blob.type })
  const touchDevice = navigator.maxTouchPoints > 0
  if (touchDevice && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  downloadBlob(blob, filename)
}

async function takePhoto() {
  button.disabled = true
  showStatus('사진 처리 중…', 'normal', 0)
  try {
    const frame = await snapshot()
    const blob = await canvasToBlob(frame)
    await saveBlob(blob, `interactive-${timestamp()}.png`, 'Interactive photo')
    showStatus('사진이 저장됐어요')
  } catch {
    showStatus('사진을 저장하지 못했어요')
  } finally {
    button.disabled = false
  }
}

function supportedVideoType() {
  const types = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
}

async function updateRecordingFrame(time = performance.now()) {
  if (!recorder || recorder.state !== 'recording' || !recordingCanvas) return
  if (time - lastRecordingPaintAt < 32) {
    recordingFrame = requestAnimationFrame((nextTime) => void updateRecordingFrame(nextTime))
    return
  }
  lastRecordingPaintAt = time
  const sources = recordingSources
  if (sources.length) {
    if (recordingBackdrop) {
      const context = recordingCanvas.getContext('2d')!
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.drawImage(recordingBackdrop, 0, 0)
      paintSources(recordingCanvas, sources, false)
    } else {
      paintSources(recordingCanvas, sources)
    }
  } else if (!domFramePending) {
    domFramePending = true
    try { await paintDom(recordingCanvas) } catch { /* Keep the previous frame. */ }
    domFramePending = false
  }
  recordingFrame = requestAnimationFrame((nextTime) => void updateRecordingFrame(nextTime))
}

async function startRecording() {
  if (!('MediaRecorder' in window) || !HTMLCanvasElement.prototype.captureStream) {
    showStatus('이 브라우저에서는 영상 촬영을 지원하지 않아요')
    return
  }
  try {
    recordingCanvas = await snapshot()
    recordingBackdrop = document.createElement('canvas')
    recordingBackdrop.width = recordingCanvas.width
    recordingBackdrop.height = recordingCanvas.height
    recordingBackdrop.getContext('2d')!.drawImage(recordingCanvas, 0, 0)
    recordingSources = visibleCaptureSources()
    lastRecordingPaintAt = 0
    recordingStream = recordingCanvas.captureStream(30)
    const mimeType = supportedVideoType()
    recorder = new MediaRecorder(recordingStream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 7_000_000,
    })
    chunks = []
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) chunks.push(event.data)
    })
    recorder.addEventListener('stop', () => {
      const finalType = recorder?.mimeType || mimeType || 'video/webm'
      const extension = finalType.includes('mp4') ? 'mp4' : 'webm'
      const blob = new Blob(chunks, { type: finalType })
      recordingStream?.getTracks().forEach((track) => track.stop())
      recordingStream = null
      recordingCanvas = null
      recordingBackdrop = null
      recordingSources = []
      recorder = null
      void saveBlob(blob, `interactive-${timestamp()}.${extension}`, 'Interactive video')
        .then(() => showStatus('영상이 저장됐어요'))
        .catch(() => showStatus('영상을 저장하지 못했어요'))
    }, { once: true })
    recorder.start(250)
    button.classList.add('is-recording')
    button.setAttribute('aria-label', '동영상 촬영 종료')
    showStatus('REC 00:00 · 다시 눌러 종료', 'recording', 0)
    const startedAt = performance.now()
    const updateTimer = window.setInterval(() => {
      if (!recorder || recorder.state !== 'recording') {
        window.clearInterval(updateTimer)
        return
      }
      const seconds = Math.floor((performance.now() - startedAt) / 1000)
      const minutesText = String(Math.floor(seconds / 60)).padStart(2, '0')
      const secondsText = String(seconds % 60).padStart(2, '0')
      showStatus(`REC ${minutesText}:${secondsText} · 다시 눌러 종료`, 'recording', 0)
    }, 500)
    void updateRecordingFrame()
  } catch {
    showStatus('영상 촬영을 시작하지 못했어요')
  }
}

function stopRecording() {
  if (!recorder || recorder.state !== 'recording') return
  cancelAnimationFrame(recordingFrame)
  recorder.stop()
  button.classList.remove('is-recording')
  button.setAttribute('aria-label', '짧게 눌러 사진 촬영, 길게 눌러 동영상 촬영')
  showStatus('영상 처리 중…', 'normal', 0)
}

function beginPress(pointerId: number) {
  if (activePointer !== null) return
  activePointer = pointerId
  longPressStarted = false
  if (recorder?.state === 'recording') return
  button.classList.add('is-holding')
  holdTimer = window.setTimeout(() => {
    longPressStarted = true
    button.classList.remove('is-holding')
    void startRecording()
  }, 580)
}

function endPress(pointerId: number, cancelled = false) {
  if (activePointer !== pointerId) return
  activePointer = null
  window.clearTimeout(holdTimer)
  button.classList.remove('is-holding')
  if (cancelled) return
  if (recorder?.state === 'recording' && !longPressStarted) {
    stopRecording()
  } else if (!longPressStarted && !recorder) {
    void takePhoto()
  }
}

button.addEventListener('pointerdown', (event) => {
  event.preventDefault()
  event.stopPropagation()
  button.setPointerCapture(event.pointerId)
  beginPress(event.pointerId)
})
button.addEventListener('pointerup', (event) => {
  event.preventDefault()
  event.stopPropagation()
  endPress(event.pointerId)
})
button.addEventListener('pointercancel', (event) => endPress(event.pointerId, true))
button.addEventListener('contextmenu', (event) => event.preventDefault())

button.addEventListener('keydown', (event) => {
  if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
    event.preventDefault()
    event.stopPropagation()
    beginPress(-1)
  }
})
button.addEventListener('keyup', (event) => {
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    endPress(-1)
  }
})

window.addEventListener('pagehide', () => {
  if (recorder?.state === 'recording') recorder.stop()
  recordingStream?.getTracks().forEach((track) => track.stop())
})
