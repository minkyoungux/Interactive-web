import * as THREE from 'three'
import { ResidentStore, restoreResident, snapshotAppearance, type AppearanceRecord, type ResidentModel, type ResidentRecord } from './season-forest-resident-store'
import './season-forest-resident-life.css'
import { makeVillager, personalityNames, residentReply, type Species, type Personality } from './season-forest-villager'
import { setupExpeditions } from './season-forest-expedition'

export type Island = { lat: number; lon: number; width: number; height: number }
export type ResidentControls = { enabled: boolean; autoRotate: boolean; target: THREE.Vector3; minDistance: number; maxDistance: number; update: (delta?: number) => void }
type Resident = {
  id: string; name: string; model: ResidentModel; anchor: THREE.Group; island: number; x: number; y: number
  target: number; targetY: number; rest: number; time: number; removed: boolean; revision: number
  appearance?: AppearanceRecord; conversation: ResidentRecord['conversation']; label: HTMLButtonElement
  bubble: HTMLSpanElement; speechUntil: number; socialCooldown: number; capturedBy?: string; speed: number
  transfer?: { from: THREE.Vector3; to: THREE.Vector3; elapsed: number; duration: number; x: number; y: number }
}
type Options = {
  world: THREE.Group; camera: THREE.PerspectiveCamera; controls: ResidentControls; stage: HTMLElement
  islands: Island[]; homeIsland: Island; reducedMotion: boolean; busy: () => boolean
  point: (lat: number, lon: number, radius: number) => THREE.Vector3
}
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x))
const cleanName = (value: string) => value.trim().replace(/[\u0000-\u001f]/g, '').slice(0, 24) || '새 이웃'

export function setupResidentLife(o: Options) {
  const { world, camera, controls, stage, point, islands } = o
  const abort = new AbortController(), store = new ResidentStore(), residents: Resident[] = []
  let disposed = false, loading = true, following: Resident | undefined, meeting = false, saveTime = 0
  const canvas = stage.querySelector<HTMLCanvasElement>('canvas')!
  const homeIndex = Math.max(0, islands.indexOf(o.homeIsland)), home = islands[homeIndex]
  const on = (target: EventTarget, type: string, listener: EventListener, capture = false) => target.addEventListener(type, listener, { signal: abort.signal, capture })
  const app = document.querySelector('.forest-app')!
  app.classList.add('resident-scene-first')
  const displayTools = document.createElement('div'); displayTools.className = 'resident-display-tools'
  displayTools.innerHTML = '<button id="resident-world-settings" type="button" aria-expanded="false" aria-controls="resident-world-drawer">세계 설정</button><button id="resident-label-toggle" type="button" aria-pressed="false">이름표</button><button id="resident-ui-toggle" type="button" aria-pressed="false">UI 숨기기</button>'
  app.append(displayTools)
  const worldDrawer = document.createElement('aside'); worldDrawer.id = 'resident-world-drawer'; worldDrawer.hidden = true; worldDrawer.setAttribute('aria-label', '계절과 지도 설정')
  const movedSettings = ['.season-notes', '.calendar', '.map-options', '.motion-control'].map(selector => { const node = app.querySelector<HTMLElement>(selector)!; const marker = document.createComment('world-setting'); node.before(marker); worldDrawer.append(node); return { node, marker } })
  app.append(worldDrawer)
  const toolbar = document.createElement('div'); toolbar.className = 'resident-toolbar'
  toolbar.innerHTML = '<span id="settlement-population">주민 불러오는 중…</span><select id="resident-roster" aria-label="추적할 주민 선택"><option value="">주민 찾기</option></select><button id="resident-meeting" type="button">주민 회의</button><button id="resident-pit-view" type="button">구덩이 찾기</button><small id="resident-storage" role="status">이 브라우저에 자동 저장</small>'
  app.append(toolbar)
  const panel = document.createElement('section'); panel.className = 'resident-conversation'; panel.hidden = true
  panel.innerHTML = '<header><strong id="resident-speaker"></strong><button id="resident-unfollow" type="button">추적 종료 ×</button></header><small>주민 추적 중 · 로컬 대화</small><div id="resident-chat-log" role="log" aria-live="polite"></div><form id="resident-chat"><input id="resident-chat-input" aria-label="주민에게 할 말" placeholder="주민에게 말을 걸어보세요" maxlength="120" autocomplete="off"><button type="submit">말하기</button></form><div class="resident-chat-actions"><button type="button" data-say="안녕">인사하기</button><button type="button" data-say="산책은 어때?">산책 이야기</button><button type="button" id="resident-edit">텍스처 수정</button></div><form id="resident-rename"><input id="resident-rename-input" aria-label="주민 이름 변경" maxlength="24"><button type="submit">이름 변경</button></form>'
  const dialogue = document.createElement('div'); dialogue.className = 'resident-dialogue-card'; dialogue.innerHTML = '<span class="dialogue-name"></span><p class="dialogue-line"></p><span class="dialogue-caret" aria-hidden="true"></span>'
  panel.insertBefore(dialogue, panel.querySelector('#resident-chat-log'))
  const historyDetails = document.createElement('details'); historyDetails.className = 'resident-chat-history'; historyDetails.innerHTML = '<summary>이전 대화 · 이름 변경</summary>'; historyDetails.append(panel.querySelector('#resident-chat-log')!, panel.querySelector('#resident-rename')!); panel.append(historyDetails)
  const chatTools = document.createElement('details'); chatTools.className = 'resident-chat-tools'; chatTools.innerHTML = '<summary>말 걸기 · 꾸미기</summary>'; chatTools.append(panel.querySelector('#resident-chat')!, panel.querySelector('.resident-chat-actions')!, historyDetails); panel.append(chatTools)
  app.append(panel)
  const panelObserver = new ResizeObserver(() => { if (!panel.hidden) (app as HTMLElement).style.setProperty('--resident-dialogue-height', `${Math.ceil(panel.getBoundingClientRect().height)}px`) }); panelObserver.observe(panel)
  const ambient = document.createElement('div'); ambient.className = 'resident-ambient'; ambient.hidden = true; ambient.setAttribute('aria-live', 'off'); app.append(ambient)
  let ambientUntil = 0
  const labels = document.createElement('div'); labels.className = 'resident-labels'; stage.append(labels)
  const pitLabel = document.createElement('span'); pitLabel.className = 'resident-pit-label'; pitLabel.textContent = '방출 구덩이'; labels.append(pitLabel)
  const notice = document.createElement('div'); notice.className = 'resident-life-notice'; notice.hidden = true; notice.setAttribute('role', 'status'); app.append(notice)
  const undo = document.createElement('button'); undo.type = 'button'; undo.id = 'resident-undo-release'; undo.className = 'resident-undo-release'; undo.hidden = true; app.append(undo)
  const $ = <T extends HTMLElement>(s: string) => app.querySelector<T>(s)!
  const roster = $<HTMLSelectElement>('#resident-roster'), meetingButton = $<HTMLButtonElement>('#resident-meeting')
  on($('#resident-world-settings'), 'click', () => { worldDrawer.hidden = !worldDrawer.hidden; $('#resident-world-settings').setAttribute('aria-expanded', String(!worldDrawer.hidden)) })
  on($('#resident-label-toggle'), 'click', () => { const shown = app.classList.toggle('resident-show-labels'); $('#resident-label-toggle').setAttribute('aria-pressed', String(shown)) })
  on($('#resident-ui-toggle'), 'click', () => { const hidden = app.classList.toggle('resident-ui-hidden'); $('#resident-ui-toggle').textContent = hidden ? 'UI 보기' : 'UI 숨기기'; $('#resident-ui-toggle').setAttribute('aria-pressed', String(hidden)); worldDrawer.hidden = true; $('#resident-world-settings').setAttribute('aria-expanded', 'false') })
  let noticeUntil = 0
  function tell(message: string) { notice.textContent = message; notice.hidden = false; noticeUntil = performance.now() + 4500 }
  function storageError() { $('#resident-storage').textContent = '저장 실패 · 현재 탭에서만 유지돼요'; toolbar.dataset.storage = 'error' }
  function location(index: number, x: number, y: number, radius = 3.145) { const island = islands[index] ?? home; return point(island.lat + y * island.height, island.lon + x * island.width, radius) }
  const plazaPoint = location(homeIndex, .02, -.52), pitPoint = location(homeIndex, .57, -.48)
  const landscape = new THREE.Group(); world.add(landscape)
  const landscapeGeometry: THREE.BufferGeometry[] = [], landscapeMaterials: THREE.Material[] = []
  function disc(center: THREE.Vector3, radius: number, color: string, outer?: number) {
    const geo = outer ? new THREE.RingGeometry(radius, outer, 64) : new THREE.CircleGeometry(radius, 64)
    const normal = center.clone().normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
    const pos = geo.getAttribute('position'), p = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) { p.set(pos.getX(i), pos.getY(i), 0).applyQuaternion(q).add(center).normalize().multiplyScalar(center.length()); pos.setXYZ(i, p.x, p.y, p.z) }
    geo.computeVertexNormals(); const mat = new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide })
    landscapeGeometry.push(geo); landscapeMaterials.push(mat); const mesh = new THREE.Mesh(geo, mat); landscape.add(mesh); return mesh
  }
  disc(plazaPoint.clone().normalize().multiplyScalar(3.132), .45, '#dfcd9b')
  disc(plazaPoint.clone().normalize().multiplyScalar(3.137), .43, '#b3ac76', .46)
  const hole = disc(pitPoint.clone().normalize().multiplyScalar(3.15), .13, '#2a3029')
  disc(pitPoint.clone().normalize().multiplyScalar(3.154), .13, '#aa855c', .163)
  hole.name = 'resident-release-pit'
  function population() {
    $('#settlement-population').textContent = `우리 숲의 주민 ${residents.length}명`
    roster.replaceChildren(new Option('주민 찾기', ''))
    residents.forEach(r => roster.add(new Option(r.name, r.id)))
    roster.value = following?.id ?? ''; meetingButton.disabled = !residents.length || loading
  }
  const pendingSaves = new Set<Promise<void>>()
  function persist(r: Resident, changed = false) {
    const task = persistWork(r, changed); pendingSaves.add(task); void task.finally(() => pendingSaves.delete(task)); return task
  }
  async function persistWork(r: Resident, changed = false) {
    const revision = ++r.revision
    if (changed) r.appearance = undefined
    try {
      const appearance = changed || !r.appearance ? await snapshotAppearance(r.model) : r.appearance
      if (r.removed || revision !== r.revision) return
      r.appearance = appearance
      await store.put({ version: 1, id: r.id, name: r.name, island: r.island, x: r.x, y: r.y, conversation: r.conversation.slice(-20), appearance })
      if (!disposed) { $('#resident-storage').textContent = '이 브라우저에 저장됨'; toolbar.dataset.storage = 'saved' }
    } catch { if (!disposed) storageError() }
  }
  let savedView: { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3; min: number; max: number } | undefined
  function stopFollowing() {
    following = undefined; panel.hidden = true; roster.value = ''; app.classList.remove('resident-following')
    if (savedView) { camera.position.copy(savedView.position); camera.up.copy(savedView.up); controls.target.copy(savedView.target); controls.minDistance = savedView.min; controls.maxDistance = savedView.max; savedView = undefined }
    controls.enabled = true; controls.update(); camera.updateMatrixWorld()
    residents.forEach(r => projectLabel(r.label, r.anchor.position.clone().normalize().multiplyScalar(r.anchor.position.length() + .51)))
  }
  function showConversation(r: Resident) {
    $('#resident-speaker').textContent = r.name; $<HTMLInputElement>('#resident-rename-input').value = r.name
    const design = r.model.appearance.design
    panel.querySelector('small')!.textContent = `주민 추적 중 · ${design?.species === 'alien' ? '평화로운 탐사대' : '숲의 이웃'} · ${personalityNames[design?.personality ?? 'gentle']} · 규칙 기반 대화`
    const log = $('#resident-chat-log'); log.replaceChildren()
    const messages = r.conversation.length ? r.conversation : [{ who: 'resident', text: `안녕! 나는 ${r.name}. 같이 숲을 둘러볼래?` }]
    dialogue.querySelector('.dialogue-name')!.textContent = r.name
    dialogue.querySelector('.dialogue-line')!.textContent = [...messages].reverse().find(m => m.who === 'resident')?.text ?? '안녕!'
    if (!design) { const note = document.createElement('p'); note.textContent = '이전 윤곽형으로 저장된 주민이에요. 동물 몸체에 내 사진을 입히려면 입주하기에서 다시 촬영해 주세요. 기존 주민은 자동 삭제하지 않아요.'; log.append(note) }
    messages.forEach(m => { const p = document.createElement('p'); p.className = m.who; p.textContent = `${m.who === 'me' ? '나' : r.name} · ${m.text}`; log.append(p) }); log.scrollTop = log.scrollHeight
  }
  function focus(r: Resident) {
    if (r.removed || o.busy()) return
    if (!savedView) savedView = { position: camera.position.clone(), target: controls.target.clone(), up: camera.up.clone(), min: controls.minDistance, max: controls.maxDistance }
    following = r; panel.hidden = false; roster.value = r.id; app.classList.add('resident-following'); controls.autoRotate = false; controls.enabled = false
    worldDrawer.hidden = true; $('#resident-world-settings').setAttribute('aria-expanded', 'false')
    ;(app as HTMLElement).style.setProperty('--resident-dialogue-height', `${Math.ceil(panel.getBoundingClientRect().height)}px`)
    document.querySelector('#auto-rotate')?.setAttribute('aria-pressed', 'false')
    showConversation(r)
  }
  function chat(message: string) {
    const r = following, text = message.trim().slice(0, 120); if (!r || !text) return
    const design = r.model.appearance.design
    const replies = [residentReply(design?.personality ?? 'gentle', r.name, design?.species === 'alien', text, Math.floor(r.conversation.length / 2))]
    r.conversation.push({ who: 'me', text }, { who: 'resident', text: replies[Math.floor(r.conversation.length / 2) % replies.length] }); r.conversation = r.conversation.slice(-20)
    showConversation(r); void persist(r)
  }
  on($('#resident-chat'), 'submit', e => { e.preventDefault(); const input = $<HTMLInputElement>('#resident-chat-input'); chat(input.value); input.value = '' })
  panel.querySelectorAll<HTMLElement>('[data-say]').forEach(b => on(b, 'click', () => chat(b.dataset.say!)))
  on($('#resident-rename'), 'submit', e => { e.preventDefault(); if (following) { following.name = cleanName($<HTMLInputElement>('#resident-rename-input').value); following.label.textContent = following.name; showConversation(following); population(); void persist(following) } })
  on($('#resident-unfollow'), 'click', stopFollowing)
  on(roster, 'change', () => { const r = residents.find(r => r.id === roster.value); if (r) focus(r) })
  on(document.querySelector('#reset-view')!, 'click', stopFollowing, true)
  on($('#resident-pit-view'), 'click', () => { stopFollowing(); controls.autoRotate = false; camera.position.copy(pitPoint).normalize().multiplyScalar(7.2); controls.update(); tell('주민을 누른 채 이 구덩이에 놓으면 방출돼요. 10초 안에 되돌릴 수 있어요.') })
  function orient(r: Resident) {
    const dx = r.target - r.x, dy = r.targetY - r.y, d = Math.hypot(dx, dy); if (d < .003) return
    const n = r.anchor.position.clone().normalize(), f = location(r.island, r.x + dx / d * .003, r.y + dy / d * .003).sub(location(r.island, r.x, r.y)); f.addScaledVector(n, -f.dot(n)).normalize()
    const right = new THREE.Vector3().crossVectors(n, f).normalize(), matrix = new THREE.Matrix4().makeBasis(right, n, f)
    r.anchor.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(matrix), .14)
  }
  function add(model: ResidentModel, name: string, island: Island, restored?: ResidentRecord) {
    const index = restored ? clamp(Math.floor(restored.island), 0, islands.length - 1) : Math.max(0, islands.indexOf(island))
    const anchor = new THREE.Group(); world.add(anchor); anchor.add(model.root); model.root.rotation.set(0, 0, 0); model.root.scale.setScalar(.34)
    const label = document.createElement('button'); label.type = 'button'; label.className = 'resident-name-tag'; labels.append(label)
    const bubble = document.createElement('span'); bubble.className = 'resident-speech'; bubble.hidden = true; labels.append(bubble)
    const r: Resident = { id: restored?.id ?? crypto.randomUUID(), name: cleanName(name), model, anchor, island: index, x: clamp(restored?.x ?? -.2, -.85, .85), y: clamp(restored?.y ?? -.23, -.85, .85), target: .25, targetY: -.20, rest: 1, time: 0, removed: false, revision: 0, label, bubble, speechUntil: 0, socialCooldown: 2 + Math.random() * 4, speed: .055, conversation: Array.isArray(restored?.conversation) ? restored.conversation.filter(m => (m.who === 'me' || m.who === 'resident') && typeof m.text === 'string').slice(-20).map(m => ({ who: m.who, text: m.text.slice(0, 200) })) : [], appearance: restored?.appearance }
    label.dataset.residentId = r.id; label.textContent = r.name; label.setAttribute('aria-label', `${r.name} 추적하고 대화하기`)
    on(label, 'click', e => { if ((e as MouseEvent).detail === 0) focus(r) })
    anchor.name = `resident-${r.id}`; anchor.position.copy(location(index, r.x, r.y)); anchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), anchor.position.clone().normalize())
    residents.push(r); population(); if (!restored) { void persist(r); tell(`${r.name}, 입주를 환영해요! 주민을 누르면 대화할 수 있어요.`) }
    return r
  }
  on(meetingButton, 'click', () => {
    if (o.busy() || loading) return
    stopFollowing(); meeting = !meeting; meetingButton.textContent = meeting ? '회의 마치기' : '주민 회의'; meetingButton.setAttribute('aria-pressed', String(meeting))
    if (meeting) {
      camera.position.copy(plazaPoint).normalize().multiplyScalar(7.3); controls.update()
      residents.forEach((r, i) => {
        expeditions.cancel(r); r.socialCooldown = 8
        const a = i / Math.max(1, residents.length) * Math.PI * 2, radius = residents.length === 1 ? 0 : .24
        const x = .02 + Math.cos(a) * radius, y = -.52 + Math.sin(a) * radius * .8
        r.transfer = { from: r.anchor.position.clone(), to: location(homeIndex, x, y), elapsed: 0, duration: o.reducedMotion ? .05 : 2.8 + i * .06, x, y }; r.model.root.scale.setScalar(.22 * Math.min(1, Math.sqrt(8 / residents.length)))
      }); tell('주민들이 공터로 모이고 있어요.')
    } else {
      residents.forEach(r => { r.transfer = undefined; r.model.root.scale.setScalar(.34); r.rest = Math.random(); r.target = -.60 + Math.random() * 1.2; r.targetY = -.18 + Math.sin(r.target * 4) * .07 })
      tell('회의가 끝났어요. 다시 산책을 시작해요.')
    }
  })
  let released: { r: Resident; deadline: number; elapsed: number; position: THREE.Vector3; x: number; y: number; island: number } | undefined
  function release(r: Resident) {
    expeditions.cancel(r)
    if (released) { released.r.model.dispose(); released.r.anchor.removeFromParent() }
    if (following === r) stopFollowing()
    r.removed = true; r.revision++; residents.splice(residents.indexOf(r), 1); r.label.remove(); r.bubble.hidden = true
    released = { r, deadline: performance.now() + 10000, elapsed: 0, position: pitPoint.clone(), x: r.x, y: r.y, island: r.island }
    r.anchor.position.copy(pitPoint); r.anchor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pitPoint.clone().normalize())
    void store.remove(r.id).catch(storageError); undo.textContent = `${r.name} 방출됨 · 되돌리기`; undo.hidden = false; population()
  }
  on(undo, 'click', () => {
    if (!released) return
    const { r, x, y, island } = released; released = undefined; r.removed = false; r.island = island; r.x = x; r.y = y; r.anchor.visible = true; r.model.root.scale.setScalar(.34); r.anchor.position.copy(location(island, x, y)); residents.push(r); labels.append(r.label); camera.updateMatrixWorld(); projectLabel(r.label, r.anchor.position.clone().normalize().multiplyScalar(3.655)); undo.hidden = true; population(); void persist(r); tell(`${r.name}의 방출을 취소했어요.`)
  })
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), sphere = new THREE.Sphere(new THREE.Vector3(), 3.145)
  function ray(e: PointerEvent) { const b = canvas.getBoundingClientRect(); pointer.set((e.clientX - b.left) / b.width * 2 - 1, 1 - (e.clientY - b.top) / b.height * 2); camera.updateMatrixWorld(); world.updateMatrixWorld(true); raycaster.setFromCamera(pointer, camera) }
  function ground(e: PointerEvent) { ray(e); return raycaster.ray.intersectSphere(sphere, new THREE.Vector3()) }
  function pick(e: PointerEvent) {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-resident-id]')?.dataset.residentId
    if (id) return residents.find(r => r.id === id)
    ray(e); const hit = raycaster.intersectObjects(residents.map(r => r.anchor), true)[0]; if (!hit) return
    return residents.find(r => { let object: THREE.Object3D | null = hit.object; while (object) { if (object === r.anchor) return r.anchor.position.dot(camera.position.clone().sub(r.anchor.position)) > 0 ? r : undefined; object = object.parent } return false })
  }
  let drag: { r: Resident; pointerId: number; startX: number; startY: number; moved: boolean; origin: THREE.Vector3; destination?: { island: number; x: number; y: number }; pit: boolean } | undefined
  function finishDrag(cancel = false) {
    if (!drag) return
    const d = drag; drag = undefined; stage.classList.remove('resident-dragging'); pitLabel.classList.remove('active')
    if (canvas.hasPointerCapture(d.pointerId)) canvas.releasePointerCapture(d.pointerId)
    if (!cancel && d.moved && d.pit) { release(d.r) }
    else if (!cancel && d.moved && d.destination) { const p = d.destination; d.r.island = p.island; d.r.x = p.x; d.r.y = p.y; d.r.target = p.x; d.r.targetY = p.y; d.r.rest = 2; d.r.anchor.position.copy(location(p.island, p.x, p.y)); void persist(d.r); tell(`${d.r.name}의 자리를 옮겼어요.`) }
    else { d.r.anchor.position.copy(d.origin); if (!cancel && !d.moved) focus(d.r); else if (!cancel && d.moved) tell('섬의 땅 위에 놓아주세요. 원래 자리로 돌아왔어요.') }
    controls.enabled = !following; panel.hidden = !following
  }
  on(stage, 'pointerdown', event => {
    const e = event as PointerEvent; if (e.button !== 0 || o.busy() || editor.open) return
    if (drag) { e.preventDefault(); e.stopImmediatePropagation(); return }
    const r = pick(e); if (!r) { if (following && e.target === canvas) stopFollowing(); return }
    e.preventDefault(); e.stopImmediatePropagation(); expeditions.cancel(r); r.transfer = undefined
    drag = { r, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, origin: r.anchor.position.clone(), pit: false }; controls.enabled = false; canvas.setPointerCapture(e.pointerId)
  }, true)
  on(stage, 'pointermove', event => {
    const e = event as PointerEvent; if (!drag || e.pointerId !== drag.pointerId) return
    e.preventDefault(); e.stopImmediatePropagation()
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6 && !drag.moved) return
    drag.moved = true; panel.hidden = true; stage.classList.add('resident-dragging'); const p = ground(e); drag.destination = undefined; drag.pit = false
    if (p) {
      drag.r.anchor.position.copy(p).normalize().multiplyScalar(3.34); drag.pit = p.distanceTo(pitPoint) < .165
      const lat = Math.asin(p.y / p.length()), lon = Math.atan2(p.x, p.z)
      islands.some((island, i) => { const dx = Math.atan2(Math.sin(lon - island.lon), Math.cos(lon - island.lon)), x = dx / island.width, y = (lat - island.lat) / island.height; if (Math.hypot(x, y) < .80 && Math.hypot((x + .36) / .3, (y - .12) / .25) > 1) { drag!.destination = { island: i, x, y }; return true } return false })
    }
    pitLabel.classList.toggle('active', drag.pit)
  }, true)
  on(stage, 'pointerup', e => { if (drag && (e as PointerEvent).pointerId === drag.pointerId) { e.preventDefault(); e.stopImmediatePropagation(); finishDrag() } }, true)
  on(stage, 'pointercancel', () => finishDrag(true), true)
  on(canvas, 'lostpointercapture', () => finishDrag(true))
  on(window, 'blur', () => finishDrag(true))

  const editor = document.createElement('dialog'); editor.className = 'resident-texture-editor'
  editor.innerHTML = '<header><h2>텍스처를 문질러 수정하기</h2><button type="button" id="texture-cancel">취소 ×</button></header><p>수정한 모습이 주민에게 바로 보여요. 저장을 눌러 확정해주세요.</p><div id="texture-canvas-slot"></div><div class="texture-tools"><label>도구<select id="texture-mode"><option value="smudge">문질러 섞기</option><option value="paint">색칠하기</option><option value="restore">편집 전으로 문지르기</option></select></label><label>크기<input id="texture-size" type="range" min="3" max="50" value="16"></label><label>색<input id="texture-color" type="color" value="#82ad8a"></label></div><footer><button id="texture-undo" type="button">한 단계 되돌리기</button><button id="texture-save" type="button">수정 저장</button></footer>'
  document.body.append(editor)
  let editing: Resident | undefined, baseline: ImageData | undefined, stroke: { id: number; x: number; y: number } | undefined, history: ImageData[] = []
  const eq = <T extends HTMLElement>(s: string) => editor.querySelector<T>(s)!
  const copy = document.createElement('canvas'), original = document.createElement('canvas')
  function finishEdit(save: boolean) {
    if (!editing || !baseline) return
    const r = editing; if (!save) r.model.appearance.texture.getContext('2d')!.putImageData(baseline, 0, 0)
    r.model.updateTexture(); r.model.appearance.texture.remove(); editing = undefined; baseline = undefined; stroke = undefined; history = []; editor.close()
    if (save) { void persist(r, true); tell('수정한 텍스처를 저장하고 있어요.') }
  }
  on($('#resident-edit'), 'click', () => {
    if (!following) return; editing = following; const texture = editing.model.appearance.texture
    baseline = texture.getContext('2d')!.getImageData(0, 0, texture.width, texture.height); history = []
    original.width = copy.width = texture.width; original.height = copy.height = texture.height; original.getContext('2d')!.putImageData(baseline, 0, 0)
    texture.id = 'resident-texture-canvas'; texture.setAttribute('aria-label', '문질러 편집하는 주민 텍스처'); eq('#texture-canvas-slot').replaceChildren(texture); editor.showModal()
  })
  on(eq('#texture-cancel'), 'click', () => finishEdit(false)); on(editor, 'cancel', e => { e.preventDefault(); finishEdit(false) })
  on(eq('#texture-save'), 'click', () => finishEdit(true))
  on(eq('#texture-undo'), 'click', () => { const prev = history.pop(); if (editing && prev) { editing.model.appearance.texture.getContext('2d')!.putImageData(prev, 0, 0); editing.model.updateTexture() } })
  function brush(e: PointerEvent) {
    if (!editing || !stroke) return
    const texture = editing.model.appearance.texture, ctx = texture.getContext('2d')!, b = texture.getBoundingClientRect()
    const x = clamp((e.clientX - b.left) / b.width * texture.width, 0, texture.width), y = clamp((e.clientY - b.top) / b.height * texture.height, 0, texture.height)
    const size = Number(eq<HTMLInputElement>('#texture-size').value), mode = eq<HTMLSelectElement>('#texture-mode').value
    const dx = x - stroke.x, dy = y - stroke.y, steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / Math.max(1, size / 3)))
    for (let i = 1; i <= steps; i++) {
      const px = stroke.x + dx * i / steps, py = stroke.y + dy * i / steps
      copy.getContext('2d')!.clearRect(0, 0, copy.width, copy.height); copy.getContext('2d')!.drawImage(texture, 0, 0)
      ctx.save(); ctx.beginPath(); ctx.arc(px, py, size, 0, Math.PI * 2); ctx.clip()
      if (mode === 'paint') { ctx.globalAlpha = .45; ctx.fillStyle = eq<HTMLInputElement>('#texture-color').value; ctx.fillRect(px - size, py - size, size * 2, size * 2) }
      else if (mode === 'restore') { ctx.clearRect(px - size, py - size, size * 2, size * 2); ctx.drawImage(original, 0, 0) }
      else { ctx.globalAlpha = .6; ctx.drawImage(copy, dx / steps, dy / steps) }
      ctx.restore()
    }
    const painted = ctx.getImageData(0, 0, texture.width, texture.height), mask = editing.model.appearance.shape.getContext('2d')!.getImageData(0, 0, texture.width, texture.height)
    for (let i = 0; i < painted.data.length; i += 4) { painted.data[i + 3] = Math.min(painted.data[i + 3], mask.data[i + 3]); if (!painted.data[i + 3]) painted.data[i] = painted.data[i + 1] = painted.data[i + 2] = 0 }
    ctx.putImageData(painted, 0, 0)
    stroke.x = x; stroke.y = y; editing.model.updateTexture()
  }
  on(editor, 'pointerdown', event => {
    const e = event as PointerEvent; if (!editing || e.target !== editing.model.appearance.texture || e.button !== 0) return
    e.preventDefault(); const t = editing.model.appearance.texture, b = t.getBoundingClientRect(); history.push(t.getContext('2d')!.getImageData(0, 0, t.width, t.height)); if (history.length > 12) history.shift()
    stroke = { id: e.pointerId, x: (e.clientX - b.left) / b.width * t.width, y: (e.clientY - b.top) / b.height * t.height }; t.setPointerCapture(e.pointerId); brush(e)
  })
  on(editor, 'pointermove', e => { if (stroke?.id === (e as PointerEvent).pointerId) brush(e as PointerEvent) })
  on(editor, 'pointerup', () => { stroke = undefined }); on(editor, 'pointercancel', () => { stroke = undefined })
  on(document, 'keydown', e => { if ((e as KeyboardEvent).key === 'Escape' && !editor.open && !o.busy()) { finishDrag(true); stopFollowing() } })
  function safeGround(x: number, y: number, island: number) {
    return Math.hypot(x, y) < .72 && Math.hypot((x + .36) / .32, (y - .12) / .28) > 1 && (island !== homeIndex || Math.hypot(x - .57, y + .48) > .22)
  }
  function wander(r: Resident) {
    for (let i = 0; i < 20; i++) {
      const x = r.x + (Math.random() - .5) * .7, y = r.y + (Math.random() - .5) * .7
      if (safeGround(x, y, r.island)) { r.target = x; r.targetY = y; return }
    }
    r.target = .1; r.targetY = -.25
  }
  function say(r: Resident, text: string) {
    r.bubble.replaceChildren(); const name = document.createElement('span'), line = document.createElement('span')
    name.className = 'speech-name'; name.textContent = r.name; line.className = 'speech-line'; line.textContent = text; r.bubble.append(name, line); r.speechUntil = r.time + 4.5
    const speaker = document.createElement('b'), sentence = document.createElement('span'); speaker.textContent = r.name; sentence.textContent = text; ambient.replaceChildren(speaker, sentence); ambientUntil = performance.now() + 4500
    r.conversation.push({ who: 'resident', text }); r.conversation = r.conversation.slice(-20)
    if (following === r) showConversation(r)
  }
  const expeditions = setupExpeditions({ world, actors: residents, location, safe: safeGround, say: (r, text) => say(r as Resident, text), blocked: r => !!r.transfer || drag?.r === r || r.removed })
  function social(delta: number) {
    for (const r of residents) { r.speed = r.model.appearance.design?.personality === 'sleepy' ? .038 : .06; r.socialCooldown = Math.max(0, r.socialCooldown - delta); r.model.root.userData.running = false }
    expeditions.update(delta, false)
    for (const r of residents) {
      if (r.transfer || drag?.r === r || expeditions.owns(r) || r.model.appearance.design?.species === 'alien') continue
      if (r.socialCooldown > 0) continue
      const friend = residents.filter(f => f !== r && f.island === r.island && f !== following && f !== drag?.r && !f.transfer && !expeditions.owns(f) && f.model.appearance.design?.species !== 'alien' && f.socialCooldown <= 0)
        .sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y))[0]
      if (!friend) continue
      const d = Math.hypot(friend.x - r.x, friend.y - r.y), fd = friend.model.appearance.design
      if (d < .24) {
        r.rest = friend.rest = 3.5; r.socialCooldown = friend.socialCooldown = 13
        const rd = r.model.appearance.design
        say(r, `${friend.name}! ${residentReply(rd?.personality ?? 'gentle', r.name, false, '안녕', Math.floor(r.time / 12))}`)
        say(friend, residentReply(fd?.personality ?? 'gentle', friend.name, fd?.species === 'alien', '안녕', Math.floor(friend.time / 12)))
      }
    }
  }
  async function seedCommunity() {
    if (disposed || await store.communitySeeded()) return
    const cast: [string, Species, string, string, Personality][] = [
      ['모모', 'rabbit', '#ecc6c3', '#8bbfa9', 'shy'], ['도토', 'squirrel', '#d79b68', '#8cb5cb', 'sunny'], ['루미', 'alien', '#a6d9bf', '#e1b8d8', 'curious'],
      ['밤비', 'deer', '#d4aa79', '#b4c597', 'gentle'], ['우유', 'cat', '#e7decd', '#e5b36d', 'sleepy'], ['삐코', 'alien', '#c7b5e6', '#ecd891', 'precise'],
      ['쿠키', 'bear', '#c9a586', '#b7c7e4', 'gentle'], ['보리', 'dog', '#dfc989', '#b3d4ad', 'sunny'], ['포롱', 'alien', '#b6dbe9', '#e3b0a5', 'curious'],
      ['솜이', 'rabbit', '#ddd9ed', '#d4c495', 'sleepy'], ['단추', 'cat', '#e6ba8e', '#9ebfc0', 'shy'], ['젤로', 'alien', '#e5c7a0', '#b9ccad', 'gentle'],
    ]
    const saves: Promise<void>[] = []
    for (let i = 0; i < cast.length; i++) {
      if (disposed) return
      // Stable IDs make interrupted first-time seeding idempotent, without resurrecting released neighbours.
      const id = `forest-neighbour-v1-${i}`; if (residents.some(r => r.id === id)) continue
      const [name, species, color, shirt, personality] = cast[i], index = Math.floor(i / 3) % Math.min(4, islands.length)
      const model = makeVillager({ species, color, shirt, personality, variant: Math.floor(i / 3), personal: false })
      const appearance = await snapshotAppearance(model)
      if (disposed) { model.dispose(); return }
      const r = add(model, name, islands[index], { version: 1, id, name, island: index, x: -.2 + i % 3 * .22, y: -.28 + i % 2 * .12, conversation: [], appearance })
      wander(r); saves.push(persist(r))
    }
    await Promise.all(saves); if (!disposed && toolbar.dataset.storage !== 'error') await store.markCommunitySeeded()
  }
  const ready = store.all().then(async records => {
    for (const record of records) {
      if (disposed) break
      try { const model = await restoreResident(record); if (disposed) model.dispose(); else add(model, record.name, islands[record.island] ?? home, record) } catch { storageError() }
    }
    await seedCommunity()
  }).catch(storageError).finally(() => { loading = false; if (!disposed) population() })
  function projectLabel(element: HTMLElement, p: THREE.Vector3) {
    const visible = p.dot(camera.position.clone().sub(p)) > 0, q = p.clone().project(camera), box = canvas.getBoundingClientRect(), parent = stage.getBoundingClientRect()
    element.hidden = !visible || q.z > 1 || Math.abs(q.x) > 1.1 || Math.abs(q.y) > 1.1 || o.busy()
    element.style.left = `${box.left - parent.left + (q.x + 1) * box.width / 2}px`; element.style.top = `${box.top - parent.top + (1 - q.y) * box.height / 2}px`
  }
  function flush() { residents.forEach(r => { void persist(r) }) }
  on(document, 'visibilitychange', () => { if (document.hidden) { finishDrag(true); flush() } })
  on(window, 'pagehide', flush)
  return {
    residents, ready, add, stopFollowing,
    focusNewest() { const r = residents.at(-1); if (r) focus(r) },
    update(delta: number) {
      if (disposed) return
      if (!o.busy() && !editor.open && !meeting && !o.reducedMotion) social(delta)
      else expeditions.update(0, true)
      let visibleSpeech = 0
      residents.forEach(r => {
        const paused = o.busy() || editor.open || drag?.r === r || !!r.capturedBy
        let walking = false
        if (!paused && r.transfer) {
          const t = r.transfer; t.elapsed += delta; const u = Math.min(1, t.elapsed / t.duration)
          r.anchor.position.copy(t.from).lerp(t.to, u).normalize().multiplyScalar(3.145 + Math.sin(u * Math.PI) * .32)
          if (u === 1) { r.island = homeIndex; r.x = t.x; r.y = t.y; r.transfer = undefined; void persist(r) }
          walking = true
        } else if (!paused && !meeting && !o.reducedMotion) {
          if (r.rest > 0) r.rest -= delta
          else {
            const dx = r.target - r.x, dy = r.targetY - r.y, distance = Math.hypot(dx, dy), step = Math.min(distance, delta * r.speed)
            if (distance > .004) {
              const x = r.x + dx / distance * step, y = r.y + dy / distance * step
              if (safeGround(x, y, r.island)) { r.x = x; r.y = y; walking = true } else { wander(r); r.rest = .3 }
            } else { r.rest = .7 + Math.random() * 2; wander(r) }
          }
          r.anchor.position.copy(location(r.island, r.x, r.y))
        }
        if (!paused && !r.transfer) orient(r)
        r.time += delta; r.model.walk(r.time, walking && !o.reducedMotion)
      })
      expeditions.render()
      if (following && !drag && !o.busy()) {
        const p = following.anchor.position, n = p.clone().normalize(), front = new THREE.Vector3(0, 0, 1).applyQuaternion(following.anchor.quaternion)
        const right = new THREE.Vector3().crossVectors(n, front).normalize()
        const target = p.clone().addScaledVector(n, .23), desired = p.clone().addScaledVector(n, 1.3).addScaledVector(front, 1.4).addScaledVector(right, .35)
        const f = o.reducedMotion ? 1 : 1 - Math.exp(-delta * 5)
        controls.target.lerp(target, f); camera.position.lerp(desired, f); camera.up.lerp(n, f).normalize(); controls.minDistance = 1.2; controls.maxDistance = 22; camera.lookAt(controls.target)
      }
      if (released) {
        released.elapsed += delta; const t = Math.min(1, released.elapsed / .8), r = released.r
        r.anchor.position.copy(released.position).normalize().multiplyScalar(3.145 - t * .6); r.model.root.scale.setScalar(.34 * (1 - t * .8)); r.anchor.visible = t < 1
        if (performance.now() > released.deadline) { r.model.dispose(); r.anchor.removeFromParent(); released = undefined; undo.hidden = true }
      }
      camera.updateMatrixWorld()
      residents.forEach(r => {
        projectLabel(r.label, r.anchor.position.clone().normalize().multiplyScalar(r.anchor.position.length() + .65))
        projectLabel(r.bubble, r.anchor.position.clone().normalize().multiplyScalar(r.anchor.position.length() + .84))
        if (meeting || r.time > r.speechUntil || !r.speechUntil || visibleSpeech >= 3 || (following && r.anchor.position.distanceTo(following.anchor.position) > .7)) r.bubble.hidden = true
        if (!r.bubble.hidden) visibleSpeech++
      })
      projectLabel(pitLabel, pitPoint.clone().normalize().multiplyScalar(3.18))
      if (performance.now() > noticeUntil) notice.hidden = true
      saveTime += delta; if (saveTime > 4 && !editing) { saveTime = 0; flush() }
      toolbar.hidden = o.busy()
      ambient.hidden = !!following || o.busy() || meeting || performance.now() > ambientUntil
      displayTools.hidden = o.busy()
    },
    dispose() {
      finishDrag(true); finishEdit(false); flush(); disposed = true; abort.abort(); stopFollowing()
      expeditions.dispose(); residents.forEach(r => { r.model.dispose(); r.anchor.removeFromParent() }); released?.r.model.dispose(); released?.r.anchor.removeFromParent()
      landscape.removeFromParent(); landscapeGeometry.forEach(g => g.dispose()); landscapeMaterials.forEach(m => m.dispose())
      panelObserver.disconnect(); movedSettings.forEach(({ node, marker }) => marker.replaceWith(node)); worldDrawer.remove(); displayTools.remove(); ambient.remove(); app.classList.remove('resident-scene-first', 'resident-ui-hidden', 'resident-show-labels'); (app as HTMLElement).style.removeProperty('--resident-dialogue-height')
      toolbar.remove(); panel.remove(); labels.remove(); notice.remove(); undo.remove(); editor.remove(); void Promise.all([...pendingSaves]).then(() => store.close())
    },
  }
}
