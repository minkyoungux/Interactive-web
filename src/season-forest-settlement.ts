import * as THREE from 'three'
import { ResidentVision } from './season-forest-resident-vision'
import { buildResidentAssets, makeImageResident } from './season-forest-resident-model'
import type { Species } from './season-forest-villager'
import './season-forest-settlement.css'
import { setupResidentLife, type ResidentControls } from './season-forest-resident-life'

type Phase = 'closed' | 'input' | 'countdown' | 'processing' | 'reveal' | 'landing'
type Island = { lat: number; lon: number; width: number; height: number }
type Model = ReturnType<typeof makeImageResident>

export function setupResidents(options: {
  world: THREE.Group; camera: THREE.PerspectiveCamera; controls: ResidentControls;
  stage: HTMLElement; reducedMotion: boolean; point: (lat: number, lon: number, radius: number) => THREE.Vector3;
  homeIsland: Island; islands?: Island[]; allIslands?: Island[];
}) {
  const { camera, controls, point, homeIsland } = options
  const abort = new AbortController(), vision = new ResidentVision()
  const on = (target: EventTarget, type: string, listener: EventListener) => target.addEventListener(type, listener, { signal: abort.signal })
  const enter = document.createElement('button'); enter.id = 'resident-enter'; enter.className = 'settlement-enter'; enter.innerHTML = '<span aria-hidden="true">♧</span> 입주하기 <small>나만의 작은 주민</small>'
  document.querySelector('.forest-app')!.append(enter)
  const dialog = document.createElement('dialog'); dialog.className = 'settlement-dialog'; dialog.setAttribute('aria-labelledby', 'settlement-title')
  dialog.innerHTML = `
    <header class="settlement-heading"><div><small>MOVE INTO YOUR LITTLE WORLD</small><h2 id="settlement-title">어떤 모습으로 이사 올까요?</h2></div><button id="settlement-close" type="button" aria-label="입주 취소하고 닫기">×</button></header>
    <label class="resident-name-field">주민 이름<input id="settlement-name" maxlength="24" placeholder="새 주민의 이름" autocomplete="off"></label>
    <label class="resident-name-field">동물 몸체<select id="settlement-species"><option value="rabbit">토끼</option><option value="cat">고양이</option><option value="bear">곰</option><option value="dog">강아지</option><option value="squirrel">다람쥐</option><option value="deer">사슴</option></select><small>외형은 동물 · 표면은 내 실제 사진</small></label>
    <div class="settlement-inputs">
      <section class="settlement-pane"><div class="settlement-pane-label"><b>01</b> 지금의 나 <span>CAMERA</span></div><div class="settlement-camera"><video id="settlement-video" autoplay muted playsinline></video><canvas id="settlement-photo" hidden></canvas><div id="settlement-camera-note">카메라를 준비하고 있어요.</div><div id="settlement-count" hidden aria-live="off">5</div><span class="settlement-live" hidden>● LIVE</span></div><p>얼굴과 팔다리가 보이면 더 잘 맞출 수 있어요.</p><button id="settlement-camera-retry" type="button" hidden>카메라 다시 켜기</button></section>
      <section class="settlement-pane"><div class="settlement-pane-label"><b>02</b> 동물 주민 참고 이미지 <span>BODY REFERENCE</span></div><button id="settlement-drop" class="settlement-drop" type="button" aria-label="동물 주민 참고 이미지 선택"><span class="settlement-plus">+</span><strong>동물 주민 이미지를 추가해 주세요</strong><small>끌어 놓거나 클릭 · 몸체는 위에서 선택해요</small><canvas id="settlement-reference" hidden></canvas><span id="settlement-file-name" hidden></span></button><input id="settlement-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><p>참고 이미지는 기본 색상에만 사용해요. 표면에는 왼쪽에서 촬영한 내 사진만 입혀요.</p></section>
    </div>
    <div id="settlement-result" hidden><canvas id="settlement-result-canvas" aria-label="배경을 제거한 내 사진이 입혀진 미니어처 주민 미리보기"></canvas><p>잠시 후, 작은 숲으로 이사해요.</p></div>
    <div class="settlement-status"><span id="settlement-status-icon">✦</span><p id="settlement-message" role="status" aria-live="polite">이미지를 넣으면 5초 카운트 후 자동으로 사진을 찍어요.</p><button id="settlement-retry" type="button" hidden>다시 촬영하기</button></div>
    <footer class="settlement-footer"><span>카메라의 내 사진 → HumanSeg → 동물 몸체의 얼굴·몸·팔다리</span><span>샘플 인물 사진을 사용하지 않아요.</span></footer>
  `
  document.body.append(dialog)
  const $ = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!
  const video = $<HTMLVideoElement>('#settlement-video'), photo = $<HTMLCanvasElement>('#settlement-photo')
  const reference = $<HTMLCanvasElement>('#settlement-reference'), fileInput = $<HTMLInputElement>('#settlement-file')
  const drop = $<HTMLButtonElement>('#settlement-drop'), status = $('#settlement-message'), count = $('#settlement-count')
  const retryCamera = $<HTMLButtonElement>('#settlement-camera-retry'), retry = $<HTMLButtonElement>('#settlement-retry')
  const resultView = $('#settlement-result'), resultCanvas = $<HTMLCanvasElement>('#settlement-result-canvas')
  const toast = document.createElement('div'); toast.className = 'settlement-toast'; toast.hidden = true; toast.setAttribute('role', 'status'); document.body.append(toast)
  const landing = document.createElement('div'); landing.className = 'settlement-flight'; landing.hidden = true; document.body.append(landing)
  let phase: Phase = 'closed', disposed = false, run = 0, cameraRun = 0, fileRun = 0
  let selected = false, transparent = false, seed = { x: .5, y: .5 }, stream: MediaStream | undefined
  let countdown: ReturnType<typeof setInterval> | undefined, deadline = 0
  let pending: Model | undefined, previewRenderer: THREE.WebGLRenderer | undefined, phaseTime = 0, pendingIsland = homeIsland, pendingName = ''
  let flightStart = { x: 0, y: 0, size: 0 }, toastTime = 0
  const previewScene = new THREE.Scene(), previewCamera = new THREE.PerspectiveCamera(32, 1, .1, 20)
  previewCamera.position.set(.65, .86, 4); previewCamera.lookAt(0, .76, 0)
  previewScene.add(new THREE.HemisphereLight('#fff9e8', '#849c8a', 2.8))
  const light = new THREE.DirectionalLight('#fff0dd', 3); light.position.set(-3, 5, 4); previewScene.add(light)
  const life = setupResidentLife({ ...options, islands: options.allIslands ?? options.islands ?? [homeIsland], busy: () => phase !== 'closed' })
  const residents = life.residents
  enter.disabled = true; void life.ready.then(() => { if (!disposed && phase === 'closed') enter.disabled = false })
  const setPhase = (value: Phase) => { phase = value; dialog.dataset.phase = value; phaseTime = 0 }
  const cameraReady = () => !!stream?.getVideoTracks().some(track => track.readyState === 'live' && !track.muted) && video.readyState >= 2 && video.videoWidth > 0
  const cancelCountdown = () => { if (countdown) clearInterval(countdown); countdown = undefined; count.hidden = true; if (phase === 'countdown') setPhase('input') }
  function stopCamera() {
    cameraRun++; stream?.getTracks().forEach(track => track.stop()); stream = undefined; video.srcObject = null
    $('.settlement-live').hidden = true
  }
  function resetResult() {
    pending?.dispose(); pending = undefined; resultView.hidden = true; landing.hidden = true; landing.style.cssText = ''
    dialog.insertBefore(resultView, $('.settlement-status'))
  }
  function close() {
    run++; fileRun++; cancelCountdown(); stopCamera(); vision.dispose(); resetResult()
    if (dialog.open) dialog.close()
    setPhase('closed'); enter.disabled = false; enter.focus()
  }
  function fail(message: string) {
    $<HTMLInputElement>('#settlement-name').disabled = false
    cancelCountdown(); setPhase('input'); status.textContent = message; retry.hidden = !selected; retry.disabled = false; drop.disabled = false
  }
  async function startCamera() {
    stopCamera(); cancelCountdown(); const token = cameraRun
    retryCamera.hidden = true; video.hidden = false; photo.hidden = true; $('#settlement-camera-note').hidden = false
    $('#settlement-camera-note').textContent = '카메라 권한을 허용해 주세요.'
    if (!navigator.mediaDevices?.getUserMedia) { $('#settlement-camera-note').textContent = 'HTTPS 또는 localhost에서 카메라를 사용할 수 있어요.'; retryCamera.hidden = false; return }
    try {
      const requested = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false })
      if (disposed || token !== cameraRun || !dialog.open) { requested.getTracks().forEach(track => track.stop()); return }
      stream = requested; video.srcObject = stream; await video.play()
      if (disposed || token !== cameraRun || !dialog.open) return
      $('#settlement-camera-note').hidden = true; $('.settlement-live').hidden = false
      stream.getVideoTracks().forEach(track => {
        track.onended = () => { if (token === cameraRun) { cancelCountdown(); fail('카메라 연결이 끊겼어요. 다시 연결해 주세요.'); retryCamera.hidden = false } }
        track.onmute = () => { if (token === cameraRun && phase === 'countdown') { cancelCountdown(); status.textContent = '카메라가 일시 정지되어 촬영을 멈췄어요.'; retry.hidden = false } }
      })
      maybeCountdown()
    } catch {
      if (disposed || token !== cameraRun) return
      stopCamera(); $('#settlement-camera-note').textContent = '카메라를 열 수 없어요. 브라우저의 카메라 권한을 확인해 주세요.'; retryCamera.hidden = false
      status.textContent = selected ? '이미지는 준비됐어요. 카메라 연결 후 5초 카운트가 시작돼요.' : '카메라를 연결하고 원하는 이미지를 넣어주세요.'
    }
  }
  async function acceptFile(file?: File) {
    if (!file || ['processing', 'reveal', 'landing'].includes(phase)) return
    cancelCountdown(); const token = ++fileRun; selected = false; retry.hidden = true
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { status.textContent = 'PNG, JPG, WebP 이미지를 넣어주세요.'; return }
    if (file.size > 15 * 1024 * 1024) { status.textContent = '15MB 이하의 이미지를 넣어주세요.'; return }
    const url = URL.createObjectURL(file)
    try {
      const image = new Image(); image.src = url; await image.decode()
      if (disposed || !dialog.open || token !== fileRun) return
      const ratio = Math.min(1, 640 / Math.max(image.width, image.height))
      reference.width = Math.max(1, Math.round(image.width * ratio)); reference.height = Math.max(1, Math.round(image.height * ratio))
      const ctx = reference.getContext('2d')!; ctx.drawImage(image, 0, 0, reference.width, reference.height)
      const data = ctx.getImageData(0, 0, reference.width, reference.height).data
      let clear = 0, weight = 0, sx = 0, sy = 0
      const bg = [data[0], data[1], data[2]]
      for (let y = 0; y < reference.height; y += 3) for (let x = 0; x < reference.width; x += 3) {
        const i = (y * reference.width + x) * 4
        if (data[i + 3] < 40) clear++
        const score = data[i + 3] > 180 ? Math.min(1, Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]) / 100) : 0
        const center = Math.exp(-Math.pow(x / reference.width - .5, 2) * 8 - Math.pow(y / reference.height - .5, 2) * 8)
        sx += x / reference.width * score * center; sy += y / reference.height * score * center; weight += score * center
      }
      transparent = clear > reference.width * reference.height / 9 * .01
      seed = weight ? { x: sx / weight, y: sy / weight } : { x: .5, y: .5 }
      selected = true; reference.hidden = false; drop.classList.add('has-image')
      $('#settlement-file-name').hidden = false; $('#settlement-file-name').textContent = file.name
      maybeCountdown()
      if (!cameraReady()) { status.textContent = '이미지를 받았어요. 카메라가 준비되면 5초 후 촬영해요.'; if (!stream) void startCamera() }
    } catch { if (token === fileRun) fail('이미지를 읽지 못했어요. 다른 파일을 넣어주세요.') }
    finally { URL.revokeObjectURL(url); fileInput.value = '' }
  }
  function maybeCountdown() {
    if (!selected || !cameraReady() || !dialog.open || phase !== 'input' || document.hidden) return
    cancelCountdown(); setPhase('countdown'); deadline = performance.now() + 5000; count.hidden = false; count.textContent = '5'; retry.hidden = true
    status.textContent = '5초 후 사진을 찍어요. 카메라를 보고 잠시 기다려주세요.'
    countdown = setInterval(() => {
      if (phase !== 'countdown') return
      if (document.hidden || !cameraReady()) { cancelCountdown(); status.textContent = '촬영을 멈췄어요. 준비되면 다시 촬영하기를 눌러주세요.'; retry.hidden = false; return }
      const remaining = Math.ceil((deadline - performance.now()) / 1000)
      count.textContent = String(Math.max(1, remaining))
      if (remaining <= 0) { cancelCountdown(); void captureAndBuild() }
    }, 100)
  }
  async function captureAndBuild() {
    if (!cameraReady() || !selected) return
    const token = ++run
    pendingName = $<HTMLInputElement>('#settlement-name').value.trim().slice(0, 24) || `주민 ${residents.length + 1}`
    $<HTMLInputElement>('#settlement-name').disabled = true
    setPhase('processing'); drop.disabled = true; retry.hidden = true
    const ratio = Math.min(1, 768 / Math.max(video.videoWidth, video.videoHeight))
    photo.width = Math.round(video.videoWidth * ratio); photo.height = Math.round(video.videoHeight * ratio)
    const ctx = photo.getContext('2d')!; ctx.setTransform(-1, 0, 0, 1, photo.width, 0); ctx.drawImage(video, 0, 0, photo.width, photo.height); ctx.resetTransform()
    photo.hidden = false; video.hidden = true; stopCamera()
    status.textContent = '촬영했어요. 사람 영역과 신체 부위, 이미지의 형체를 살펴보고 있어요…'
    try {
      const analysis = await vision.analyze(photo, reference, transparent, seed)
      if (disposed || token !== run || !dialog.open) return
      status.textContent = '사람 영역만 잘라 얼굴·몸·팔다리 사진을 미니어처 표면에 입히고 있어요…'
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      if (disposed || token !== run) return
      const assets = buildResidentAssets(reference, photo, analysis)
      pending = makeImageResident(assets, $<HTMLSelectElement>('#settlement-species').value as Species)
      if (!previewRenderer) {
        previewRenderer = new THREE.WebGLRenderer({ canvas: resultCanvas, antialias: true, alpha: true })
        previewRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); previewRenderer.setSize(560, 560, false)
        previewRenderer.toneMapping = THREE.ACESFilmicToneMapping; previewRenderer.toneMappingExposure = 1.2
      }
      previewScene.add(pending.root); pendingIsland = (options.islands ?? [homeIsland])[residents.length % (options.islands?.length ?? 1)]
      resultView.hidden = false; setPhase('reveal')
      $('#settlement-title').textContent = '작은 숲의 새 이웃이 태어났어요.'
      status.textContent = assets.photos.face ? '배경을 제거한 내 얼굴과 검출된 신체 부위의 실제 사진을 입혔어요.' : '사람 사진을 적용했어요. 얼굴이나 가려진 부위는 검출되지 않아 기본 재질을 유지해요.'
      vision.dispose()
    } catch (error) {
      if (disposed || token !== run) return
      resetResult(); fail((error as Error).message); retryCamera.hidden = false
    }
  }
  function open() {
    if (phase !== 'closed' || disposed) return
    life.stopFollowing(); $<HTMLInputElement>('#settlement-name').disabled = false; $<HTMLInputElement>('#settlement-name').value = `주민 ${residents.length + 1}`
    run++; selected = false; setPhase('input'); resetResult(); drop.disabled = false; drop.classList.remove('has-image'); reference.hidden = true
    $('#settlement-file-name').hidden = true; retry.hidden = true; count.hidden = true
    $('#settlement-title').textContent = '어떤 모습으로 이사 올까요?'
    status.textContent = '이미지를 넣으면 5초 카운트 후 자동으로 사진을 찍어요.'
    controls.autoRotate = false; document.querySelector('#auto-rotate')?.setAttribute('aria-pressed', 'false')
    dialog.showModal(); void startCamera()
    void vision.start().catch(error => { if (!disposed && dialog.open && phase === 'input') status.textContent = (error as Error).message })
  }
  on(enter, 'click', open)
  on($('#settlement-close'), 'click', close)
  on(dialog, 'cancel', event => { event.preventDefault(); close() })
  on(drop, 'click', () => fileInput.click())
  on(fileInput, 'change', () => { void acceptFile(fileInput.files?.[0]) })
  on(drop, 'dragover', event => { event.preventDefault(); if (!drop.disabled) drop.classList.add('dragging') })
  on(drop, 'dragleave', () => drop.classList.remove('dragging'))
  on(drop, 'drop', event => { event.preventDefault(); drop.classList.remove('dragging'); void acceptFile((event as DragEvent).dataTransfer?.files[0]) })
  on(retryCamera, 'click', () => { void startCamera() })
  on(retry, 'click', () => { setPhase('input'); if (cameraReady()) maybeCountdown(); else void startCamera() })
  on(document, 'visibilitychange', () => {
    if (document.hidden && ['input', 'countdown'].includes(phase)) { cancelCountdown(); stopCamera(); status.textContent = '화면을 떠나 촬영을 멈췄어요. 카메라를 다시 켜주세요.'; retryCamera.hidden = false }
  })
  function location(island: Island, x: number, offset = 0) {
    return point(island.lat + (-.18 + Math.sin(x * 4) * .07 + offset) * island.height, island.lon + x * island.width, 3.145)
  }
  function beginLanding() {
    if (!pending) return
    const rect = resultCanvas.getBoundingClientRect()
    flightStart = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: rect.width }
    landing.style.width = `${rect.width}px`; landing.style.height = `${rect.height}px`
    landing.append(resultView); landing.hidden = false; dialog.close(); setPhase('landing'); enter.disabled = true
    camera.position.copy(location(pendingIsland, -.2)).normalize().multiplyScalar(11.5); controls.update()
  }
  function completeLanding() {
    if (!pending) return
    life.add(pending, pendingName, pendingIsland); pending = undefined
    landing.hidden = true; dialog.insertBefore(resultView, $('.settlement-status')); resultView.hidden = true
    setPhase('closed'); enter.disabled = false
    toast.textContent = '입주를 환영해요! 새 이웃이 산책을 시작했어요.'; toast.hidden = false; toastTime = 4
    enter.focus()
  }
  return {
    update(delta: number) {
      if (disposed) return
      if (pending && previewRenderer && (phase === 'reveal' || phase === 'landing')) {
        phaseTime += delta
        if (phase === 'reveal') {
          pending.root.rotation.y = options.reducedMotion ? 0 : Math.sin(phaseTime * .8) * .35
          if (phaseTime > (options.reducedMotion ? 4 : 3.5)) beginLanding()
        } else {
          const t = Math.min(1, phaseTime / (options.reducedMotion ? .3 : 1.8)), ease = t * t * (3 - 2 * t)
          const target = location(pendingIsland, -.2).addScaledVector(location(pendingIsland, -.2).normalize(), .25).project(camera)
          const rect = options.stage.getBoundingClientRect(), x = rect.left + (target.x + 1) * rect.width / 2, y = rect.top + (1 - target.y) * rect.height / 2
          landing.style.left = `${flightStart.x + (x - flightStart.x) * ease}px`; landing.style.top = `${flightStart.y + (y - flightStart.y) * ease}px`
          landing.style.transform = `translate(-50%, -50%) scale(${1 - ease * .91})`; landing.style.opacity = String(1 - Math.max(0, t - .85) / .15)
          if (t >= 1) completeLanding()
        }
        previewRenderer.render(previewScene, previewCamera)
      }
      life.update(delta)
      if (toastTime > 0) { toastTime -= delta; toast.hidden = toastTime <= 0 }
    },
    dispose() {
      disposed = true; run++; fileRun++; cancelCountdown(); stopCamera(); vision.dispose(); abort.abort(); resetResult()
      life.dispose(); previewRenderer?.dispose()
      dialog.remove(); landing.remove(); toast.remove(); enter.remove()
    },
  }
}
