import * as THREE from 'three'
import './season-forest-resident.css'
import { makeImageResident, prepareCharacter } from './season-forest-reference'

type Costume = 'bear' | 'rabbit' | 'human'
type Appearance = { costume: Costume; color: string; face?: HTMLCanvasElement; outfit?: HTMLCanvasElement; placement?: { x: number; y: number; size: number } }

function makeResident(appearance: Appearance) {
  if (appearance.outfit) return makeImageResident(appearance.outfit, appearance.face, appearance.placement ?? { x: .5, y: .3, size: .4 })
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group()
  root.add(body)
  body.add(head)
  head.position.y = 1.18
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [], textures: THREE.Texture[] = []
  const geo = <T extends THREE.BufferGeometry>(value: T) => { geometries.push(value); return value }
  const material = (color: string) => {
    const result = new THREE.MeshStandardMaterial({ color, roughness: .85 })
    materials.push(result)
    return result
  }
  const texture = (canvas: HTMLCanvasElement) => {
    const result = new THREE.CanvasTexture(canvas)
    result.colorSpace = THREE.SRGBColorSpace
    textures.push(result)
    return result
  }
  const ball = geo(new THREE.SphereGeometry(1, 24, 18))
  const fur = material(appearance.costume === 'rabbit' ? '#ebddc1' : '#bd956e')
  const skin = material('#ebc5a3'), pink = material('#dfa9a5'), shoes = material('#775c48')
  const shirt = material(appearance.color), pants = material('#667c74'), eye = material('#3f4942')
  function piece(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) {
    const mesh = new THREE.Mesh(ball, mat)
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz)
    mesh.castShadow = true; mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  piece(body, shirt, 0, .77, 0, .225, .28, .16)
  piece(body, pants, 0, .49, 0, .18, .10, .13)
  piece(head, fur, 0, 0, 0, .32, .31, .28)
  piece(head, skin, 0, -.015, .135, .25, .25, .16)
  if (appearance.costume === 'human') {
    piece(head, shoes, 0, .16, -.025, .315, .18, .27)
    piece(head, shoes, -.23, .01, -.005, .085, .20, .15)
    piece(head, shoes, .23, .01, -.005, .085, .20, .15)
  } else {
    for (const side of [-1, 1]) {
      const rabbit = appearance.costume === 'rabbit'
      piece(head, fur, side * .22, rabbit ? .39 : .24, -.025, rabbit ? .075 : .12, rabbit ? .25 : .12, .075)
      piece(head, pink, side * .22, rabbit ? .40 : .25, .044, rabbit ? .037 : .068, rabbit ? .18 : .068, .013)
    }
  }
  if (appearance.face) {
    const faceMat = new THREE.MeshStandardMaterial({ map: texture(appearance.face), transparent: true, roughness: 1, depthWrite: false })
    materials.push(faceMat)
    const faceGeo = geo(new THREE.SphereGeometry(.286, 40, 32, .55, Math.PI - 1.10, .49, 2.08))
    const face = new THREE.Mesh(faceGeo, faceMat)
    face.position.set(0, -.006, .054)
    head.add(face)
  } else {
    for (const side of [-1, 1]) {
      piece(head, eye, side * .085, .02, .288, .018, .025, .012)
      piece(head, pink, side * .14, -.05, .272, .038, .02, .012)
    }
    piece(head, shoes, 0, -.056, .295, .025, .017, .014)
  }
  if (appearance.outfit) {
    const emblemMat = new THREE.MeshStandardMaterial({ map: texture(appearance.outfit), roughness: 1 })
    materials.push(emblemMat)
    const emblem = new THREE.Mesh(geo(new THREE.PlaneGeometry(.23, .22)), emblemMat)
    emblem.position.set(0, .80, .164)
    body.add(emblem)
  } else {
    piece(body, skin, 0, .83, .152, .043, .04, .014)
  }
  const arms: THREE.Group[] = [], legs: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .23, .90, 0); body.add(arm)
    piece(arm, shirt, side * .025, -.09, 0, .07, .135, .075)
    piece(arm, skin, side * .03, -.22, 0, .062, .065, .062)
    arms.push(arm)
    const leg = new THREE.Group(); leg.position.set(side * .09, .46, 0); body.add(leg)
    piece(leg, pants, 0, -.13, 0, .07, .17, .075)
    piece(leg, shoes, 0, -.32, .035, .083, .075, .12)
    legs.push(leg)
  }
  return {
    root,
    walk(time: number, walking: boolean) {
      const stride = walking ? Math.sin(time * 7) * .48 : 0
      legs.forEach((leg, i) => { leg.rotation.x = stride * (i ? -1 : 1) })
      arms.forEach((arm, i) => { arm.rotation.x = stride * (i ? 1 : -1) * .7 })
      body.position.y = walking ? Math.abs(Math.sin(time * 7)) * .025 : 0
      head.rotation.z = walking ? Math.sin(time * 3.5) * .025 : 0
    },
    dispose() { root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()) },
  }
}

export function setupResidents(options: {
  world: THREE.Group; camera: THREE.PerspectiveCamera; controls: { autoRotate: boolean; update: () => void };
  stage: HTMLElement; reducedMotion: boolean; point: (lat: number, lon: number, radius: number) => THREE.Vector3;
  homeIsland: { lat: number; lon: number; width: number; height: number };
}) {
  const { world, camera, controls, point, homeIsland } = options
  const abort = new AbortController()
  const on = (target: EventTarget, event: string, callback: EventListener) => target.addEventListener(event, callback, { signal: abort.signal })
  const enter = document.createElement('button')
  enter.className = 'resident-enter'; enter.id = 'resident-enter'; enter.textContent = '＋ 입주하기'
  document.querySelector('.forest-header')!.append(enter)
  const dialog = document.createElement('dialog')
  dialog.className = 'resident-dialog'
  dialog.setAttribute('aria-labelledby', 'resident-title')
  dialog.innerHTML = `
    <div class="resident-heading"><div><small>WELCOME TO YOUR LITTLE WORLD</small><h2 id="resident-title">숲의 새 주민을 소개합니다.</h2></div><button type="button" id="resident-close" aria-label="입주 창 닫기">×</button></div>
    <div class="resident-editor">
      <div class="resident-preview"><canvas id="resident-preview-canvas" aria-label="내 얼굴이 적용되는 3D 주민 미리보기"></canvas><span>작은 숲에서 만날 또 다른 나</span></div>
      <div class="resident-form">
        <label class="resident-field">주민 이름<input id="resident-name" maxlength="12" placeholder="어떻게 불러드릴까요?" value="새싹" autocomplete="off"></label>
        <fieldset><legend>캐릭터 모양</legend><div class="costume-options"><button type="button" data-costume="bear" aria-pressed="true">곰돌이</button><button type="button" data-costume="rabbit" aria-pressed="false">토끼</button><button type="button" data-costume="human" aria-pressed="false">꼬마 주민</button></div></fieldset>
        <label class="resident-upload">내 캐릭터 이미지 <small>윤곽 그대로 입체화 · 투명 PNG / 단색 배경 권장</small><input id="resident-outfit" type="file" accept="image/png,image/jpeg,image/webp"></label>
        <div id="resident-reference-tools" hidden><canvas id="resident-reference-map" width="180" height="180" tabindex="0" aria-label="캐릭터의 얼굴 위치 선택. 클릭하거나 방향키로 조정하세요."></canvas><div><p>캐릭터의 얼굴 부분을 눌러주세요.</p><label>얼굴 크기<input id="resident-reference-size" type="range" min=".15" max=".8" value=".4" step=".01"></label><button id="resident-reference-clear" type="button">기본 캐릭터로 돌아가기</button></div></div>
        <div class="resident-face-area"><video id="resident-camera" autoplay muted playsinline hidden></video><canvas id="resident-portrait" width="256" height="256" hidden></canvas><div class="resident-face-guide" aria-hidden="true"></div><p id="resident-face-hint">얼굴 사진으로 나를 닮은 주민 만들기</p></div>
        <div class="resident-photo-actions"><button type="button" id="resident-camera-start">카메라 켜기</button><button type="button" id="resident-capture" hidden disabled>찰칵, 사진 찍기</button><label>사진 올리기<input id="resident-face-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></label></div>
        <div id="resident-crop" hidden><label>얼굴 확대<input id="resident-crop-zoom" type="range" min="1" max="3" step=".05" value="1"></label><label>좌우 위치<input id="resident-crop-x" type="range" min="-1" max="1" step=".02" value="0"></label><label>위아래 위치<input id="resident-crop-y" type="range" min="-1" max="1" step=".02" value="0"></label></div>
        <p id="resident-message" role="status" aria-live="polite">정면 얼굴이 타원 안에 들어오도록 맞춰주세요.</p>
      </div>
    </div>
    <div class="resident-bottom"><p>사진은 서버로 전송하지 않아요.<br>입주 정보는 새로고침 전까지 이 탭에 머물러요.</p><button type="button" id="resident-confirm" disabled>이 모습으로 입주하기 ↗</button></div>
  `
  document.body.append(dialog)
  const card = document.createElement('div')
  card.className = 'resident-card'; card.hidden = true
  card.innerHTML = `<span>♧</span><div><strong id="resident-card-name"></strong><small>숲마을의 새 이웃</small></div><button id="resident-find" type="button">내 주민 찾기</button><button id="resident-walk" type="button" aria-pressed="true">산책 멈추기</button>`
  document.querySelector('.forest-app')!.append(card)
  const marker = document.createElement('span'); marker.className = 'resident-marker'; marker.hidden = true
  options.stage.append(marker)
  const $ = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!
  const video = $<HTMLVideoElement>('#resident-camera')
  const portrait = $<HTMLCanvasElement>('#resident-portrait')
  const message = $('#resident-message')
  const confirm = $<HTMLButtonElement>('#resident-confirm')
  const cameraButton = $<HTMLButtonElement>('#resident-camera-start')
  const capture = $<HTMLButtonElement>('#resident-capture')
  let disposed = false, cameraVersion = 0, faceVersion = 0, outfitVersion = 0
  let stream: MediaStream | undefined, source: HTMLCanvasElement | undefined
  let appearance: Appearance = { costume: 'bear', color: '#dea557' }
  let previewRenderer: THREE.WebGLRenderer | undefined, preview: ReturnType<typeof makeResident> | undefined
  const previewScene = new THREE.Scene(), previewCamera = new THREE.PerspectiveCamera(33, 1, .1, 20)
  previewCamera.position.set(.75, 1.05, 3.7); previewCamera.lookAt(0, .85, 0)
  previewScene.add(new THREE.HemisphereLight('#fff9e7', '#a2b3a2', 3))
  const key = new THREE.DirectionalLight('#fff1dd', 3); key.position.set(-3, 5, 4); previewScene.add(key)
  let resident: ReturnType<typeof makeResident> | undefined, residentTime = 0, walking = !options.reducedMotion
  const anchor = new THREE.Group(); anchor.name = 'my-resident'; world.add(anchor)
  const walkButton = card.querySelector<HTMLButtonElement>('#resident-walk')!
  const syncWalking = () => { walkButton.setAttribute('aria-pressed', String(walking)); walkButton.textContent = walking ? '산책 멈추기' : '산책하기' }
  syncWalking()
  function stopCamera() {
    cameraVersion++
    stream?.getTracks().forEach(track => track.stop()); stream = undefined
    video.srcObject = null; video.hidden = true
    cameraButton.disabled = false; cameraButton.textContent = '카메라 켜기'
    capture.hidden = true; capture.disabled = true
    portrait.hidden = !source
    $('#resident-face-hint').hidden = !!source
  }
  function rebuildPreview() {
    preview?.dispose(); preview = makeResident(appearance); previewScene.add(preview.root)
  }
  function drawReference() {
    if (!appearance.outfit) return
    const c = $<HTMLCanvasElement>('#resident-reference-map'), ctx = c.getContext('2d')!, p = appearance.placement!
    ctx.clearRect(0, 0, 180, 180)
    ctx.drawImage(appearance.outfit, 0, 0, 180, 180)
    ctx.strokeStyle = '#a16442'; ctx.lineWidth = 2; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.ellipse(p.x * 180, p.y * 180, p.size * 90, p.size * 100 * appearance.outfit.width / appearance.outfit.height, 0, 0, Math.PI * 2); ctx.stroke()
  }
  function renderPreview() {
    if (!dialog.open || !previewRenderer) return
    const c = $<HTMLCanvasElement>('#resident-preview-canvas'), width = c.clientWidth, height = c.clientHeight
    if (!width || !height) return
    previewRenderer.setSize(width, height, false)
    previewCamera.aspect = width / height; previewCamera.updateProjectionMatrix()
    previewRenderer.render(previewScene, previewCamera)
  }
  function close() { stopCamera(); faceVersion++; outfitVersion++; if (dialog.open) dialog.close(); enter.focus() }
  on(enter, 'click', () => {
    controls.autoRotate = false
    document.querySelector('#auto-rotate')?.setAttribute('aria-pressed', 'false')
    dialog.showModal()
    try {
      if (!previewRenderer) {
        previewRenderer = new THREE.WebGLRenderer({ canvas: $<HTMLCanvasElement>('#resident-preview-canvas'), antialias: true, alpha: true })
        previewRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); previewRenderer.toneMapping = THREE.ACESFilmicToneMapping
        previewRenderer.toneMappingExposure = 1.3
      }
      rebuildPreview(); renderPreview()
    } catch { message.textContent = '3D 미리보기를 열 수 없어요. 창을 닫고 다시 시도해주세요.'; confirm.disabled = true }
  })
  on($('#resident-close'), 'click', close)
  on(dialog, 'cancel', event => { event.preventDefault(); close() })
  on(dialog, 'click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); const e = event as MouseEvent; if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close() } })
  dialog.querySelectorAll<HTMLButtonElement>('[data-costume]').forEach(button => on(button, 'click', () => {
    appearance.costume = button.dataset.costume as Costume
    appearance.outfit = undefined; $('#resident-reference-tools').hidden = true
    dialog.querySelectorAll('[data-costume]').forEach(el => el.setAttribute('aria-pressed', String(el === button)))
    rebuildPreview()
  }))
  async function readImage(file: File) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('PNG, JPG, WebP 이미지를 골라주세요.')
    if (file.size > 15 * 1024 * 1024) throw new Error('15MB 이하 이미지를 골라주세요.')
    const url = URL.createObjectURL(file)
    try {
      const img = new Image(); img.src = url; await img.decode()
      const c = document.createElement('canvas'), ratio = Math.min(1, 1024 / Math.max(img.width, img.height))
      c.width = Math.max(1, Math.round(img.width * ratio)); c.height = Math.max(1, Math.round(img.height * ratio))
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      return c
    } finally { URL.revokeObjectURL(url) }
  }
  function cropFace() {
    if (!source) return
    const zoom = Number($<HTMLInputElement>('#resident-crop-zoom').value)
    const size = Math.min(source.width, source.height) / zoom
    const x = (source.width - size) / 2 * (1 + Number($<HTMLInputElement>('#resident-crop-x').value))
    const y = (source.height - size) / 2 * (1 + Number($<HTMLInputElement>('#resident-crop-y').value))
    const face = document.createElement('canvas'); face.width = face.height = 512
    const ctx = face.getContext('2d')!
    ctx.drawImage(source, x, y, size, size, 0, 0, 512, 512)
    portrait.getContext('2d')!.clearRect(0, 0, 256, 256)
    portrait.getContext('2d')!.drawImage(face, 0, 0, 256, 256)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.beginPath(); ctx.ellipse(256, 256, 246, 252, 0, 0, Math.PI * 2); ctx.fill()
    appearance.face = face
    confirm.disabled = false
    rebuildPreview()
  }
  function setFace(canvas: HTMLCanvasElement) {
    stopCamera(); source = canvas
    $<HTMLInputElement>('#resident-crop-zoom').value = '1'
    $<HTMLInputElement>('#resident-crop-x').value = $<HTMLInputElement>('#resident-crop-y').value = '0'
    portrait.hidden = false; $('#resident-face-hint').hidden = true; $('#resident-crop').hidden = false
    message.textContent = '얼굴 위치를 맞춘 뒤, 3D 주민을 확인하고 입주해요.'
    cropFace()
  }
  for (const selector of ['#resident-crop-zoom', '#resident-crop-x', '#resident-crop-y']) on($(selector), 'input', cropFace)
  on($('#resident-face-file'), 'change', async event => {
    const input = event.currentTarget as HTMLInputElement, file = input.files?.[0], version = ++faceVersion
    if (!file) return
    try { const image = await readImage(file); if (!disposed && dialog.open && version === faceVersion) setFace(image) }
    catch (error) { if (version === faceVersion) message.textContent = (error as Error).message }
    finally { input.value = '' }
  })
  on($('#resident-outfit'), 'change', async event => {
    const input = event.currentTarget as HTMLInputElement, file = input.files?.[0], version = ++outfitVersion
    if (!file) return
    try {
      const image = prepareCharacter(await readImage(file))
      if (disposed || !dialog.open || version !== outfitVersion) return
      appearance.outfit = image; appearance.placement = { x: .5, y: .3, size: .4 }
      $<HTMLInputElement>('#resident-reference-size').value = '.4'
      $('#resident-reference-tools').hidden = false
      dialog.querySelectorAll('[data-costume]').forEach(el => el.setAttribute('aria-pressed', 'false'))
      drawReference(); rebuildPreview(); message.textContent = '윤곽과 색을 살려 입체화했어요. 얼굴을 붙일 위치를 눌러주세요. 뒷면은 앞면을 바탕으로 둥글게 보완해요.'
    } catch (error) { if (version === outfitVersion) message.textContent = (error as Error).message }
    finally { input.value = '' }
  })
  on($('#resident-reference-map'), 'click', event => {
    if (!appearance.placement) return
    const r = (event.currentTarget as HTMLElement).getBoundingClientRect(), e = event as MouseEvent
    appearance.placement.x = THREE.MathUtils.clamp((e.clientX - r.left) / r.width, .05, .95)
    appearance.placement.y = THREE.MathUtils.clamp((e.clientY - r.top) / r.height, .05, .8)
    drawReference(); rebuildPreview()
  })
  on($('#resident-reference-map'), 'keydown', event => {
    if (!appearance.placement) return
    const e = event as KeyboardEvent, p = appearance.placement
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
    e.preventDefault()
    p.x = THREE.MathUtils.clamp(p.x + (e.key === 'ArrowRight' ? .02 : e.key === 'ArrowLeft' ? -.02 : 0), .05, .95)
    p.y = THREE.MathUtils.clamp(p.y + (e.key === 'ArrowDown' ? .02 : e.key === 'ArrowUp' ? -.02 : 0), .05, .8)
    drawReference(); rebuildPreview()
  })
  on($('#resident-reference-size'), 'input', event => {
    if (!appearance.placement) return
    appearance.placement.size = Number((event.currentTarget as HTMLInputElement).value); drawReference(); rebuildPreview()
  })
  on($('#resident-reference-clear'), 'click', () => {
    appearance.outfit = undefined; $('#resident-reference-tools').hidden = true
    dialog.querySelector(`[data-costume="${appearance.costume}"]`)!.setAttribute('aria-pressed', 'true'); rebuildPreview()
  })
  on(cameraButton, 'click', async () => {
    stopCamera()
    if (!navigator.mediaDevices?.getUserMedia) { message.textContent = '카메라를 지원하지 않는 환경이에요. 사진 올리기를 이용해 주세요.'; return }
    const version = cameraVersion
    cameraButton.disabled = true; cameraButton.textContent = '카메라 연결 중…'
    try {
      const requested = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } }, audio: false })
      if (disposed || !dialog.open || cameraVersion !== version) { requested.getTracks().forEach(track => track.stop()); return }
      stream = requested; video.srcObject = stream; video.hidden = false; portrait.hidden = true; $('#resident-face-hint').hidden = true
      await video.play()
      if (disposed || !dialog.open || cameraVersion !== version) return
      capture.hidden = false; capture.disabled = false; cameraButton.textContent = '카메라 사용 중'
      message.textContent = '타원 안에 얼굴을 맞추고 사진을 찍어주세요.'
    } catch {
      if (cameraVersion !== version || disposed) return
      stopCamera(); message.textContent = '카메라를 열지 못했어요. 권한을 허용하거나 사진을 올려주세요.'
    }
  })
  on(capture, 'click', () => {
    if (video.readyState < 2 || !video.videoWidth) return
    faceVersion++
    const photo = document.createElement('canvas'); photo.width = photo.height = 768
    const ctx = photo.getContext('2d')!, size = Math.min(video.videoWidth, video.videoHeight)
    ctx.translate(768, 0); ctx.scale(-1, 1)
    ctx.drawImage(video, (video.videoWidth - size) / 2, (video.videoHeight - size) / 2, size, size, 0, 0, 768, 768)
    setFace(photo)
  })
  const normal = new THREE.Vector3(), forward = new THREE.Vector3(), right = new THREE.Vector3(), basis = new THREE.Matrix4()
  function placeResident(time: number) {
    const x = -.25 + Math.sin(time * .18) * .38
    const lat = homeIsland.lat + (-.18 + Math.sin(x * 4) * .07) * homeIsland.height
    const lon = homeIsland.lon + x * homeIsland.width
    anchor.position.copy(point(lat, lon, 3.15))
    normal.copy(anchor.position).normalize()
    const direction = Math.cos(time * .18) >= 0 ? 1 : -1, nextX = x + direction * .001
    forward.copy(point(homeIsland.lat + (-.18 + Math.sin(nextX * 4) * .07) * homeIsland.height, homeIsland.lon + nextX * homeIsland.width, 3.15)).sub(anchor.position)
    forward.addScaledVector(normal, -forward.dot(normal)).normalize(); right.crossVectors(normal, forward).normalize()
    basis.makeBasis(right, normal, forward)
    const target = new THREE.Quaternion().setFromRotationMatrix(basis)
    anchor.quaternion.slerp(target, .14)
  }
  function findResident() {
    if (!resident) return
    controls.autoRotate = false; document.querySelector('#auto-rotate')?.setAttribute('aria-pressed', 'false')
    camera.position.copy(anchor.position).normalize().multiplyScalar(7.4)
    controls.update()
  }
  on(confirm, 'click', () => {
    if (!appearance.face) return
    resident?.dispose(); resident = makeResident(appearance); resident.root.scale.setScalar(.43); anchor.add(resident.root)
    residentTime = 0; placeResident(0)
    const name = $<HTMLInputElement>('#resident-name').value.trim() || '새싹'
    card.querySelector('#resident-card-name')!.textContent = `${name}의 작은 산책`
    marker.textContent = name; card.hidden = false
    enter.textContent = '♧ 주민 꾸미기'; close(); findResident()
  })
  on(card.querySelector('#resident-find')!, 'click', findResident)
  on(walkButton, 'click', () => { walking = !walking; syncWalking() })
  on(document, 'visibilitychange', () => { if (document.hidden) stopCamera() })
  return {
    update(delta: number) {
      if (disposed) return
      if (dialog.open) renderPreview()
      if (!resident) return
      if (walking && !dialog.open) residentTime += delta
      placeResident(residentTime); resident.walk(residentTime, walking && !dialog.open)
      const p = anchor.position.clone().addScaledVector(anchor.position.clone().normalize(), .83)
      const facing = anchor.position.dot(camera.position.clone().sub(anchor.position)) > 0
      p.project(camera)
      marker.hidden = !facing || Math.abs(p.x) > .95 || Math.abs(p.y) > .94 || dialog.open
      marker.style.left = `${(p.x + 1) * options.stage.clientWidth / 2}px`; marker.style.top = `${(1 - p.y) * options.stage.clientHeight / 2}px`
    },
    dispose() {
      disposed = true; faceVersion++; outfitVersion++; stopCamera(); abort.abort()
      resident?.dispose(); preview?.dispose(); previewRenderer?.dispose(); anchor.removeFromParent()
      dialog.remove(); card.remove(); marker.remove(); enter.remove(); source = undefined; appearance = { costume: 'bear', color: '#dea557' }
    },
  }
}
