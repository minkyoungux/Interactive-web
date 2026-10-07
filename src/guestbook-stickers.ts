import './guestbook-stickers.css'

const storageKey = 'interactive-guestbook-stickers-v1'
const drawings = [
  ['하트', '<path d="M48 81 13 47C-7 22 25 1 48 27 72 0 103 23 83 47Z" fill="#ff81c6" stroke="#532566" stroke-width="3"/><path d="M20 29Q25 19 35 24" fill="none" stroke="white" stroke-width="6" stroke-linecap="round"/>'],
  ['반짝별', '<path d="m48 5 10 29 30 1-24 19 8 31-24-18-25 18 9-31L8 35l30-1Z" fill="#fbff93" stroke="#6151a1" stroke-width="3"/><path d="m48 20 5 20 19 1" fill="none" stroke="white" stroke-width="4"/>'],
  ['체리', '<path d="M29 56Q61 30 60 9 81 31 71 62" fill="none" stroke="#377b54" stroke-width="5"/><path d="M60 12Q33 2 32 24q17 7 28-12" fill="#a3f585" stroke="#377b54" stroke-width="2"/><circle cx="28" cy="65" r="20" fill="#f962a2" stroke="#732951" stroke-width="3"/><circle cx="70" cy="70" r="19" fill="#ed4284" stroke="#732951" stroke-width="3"/><path d="m20 56-4 6m46-1-3 5" stroke="#fff" stroke-width="5" stroke-linecap="round"/>'],
  ['나비', '<path d="M47 46C5-12-10 33 32 55 4 85 39 97 48 61 61 99 95 82 65 54 107 20 79-9 47 46Z" fill="#bda4ff" stroke="#55378d" stroke-width="3"/><path d="m46 44-6-19m9 19 11-20" stroke="#55378d" stroke-width="3"/><path d="M47 46v20" stroke="#543783" stroke-width="6" stroke-linecap="round"/><path d="M16 29q6-9 16 3m34 3q10-13 17-8" fill="none" stroke="#edfdff" stroke-width="5"/>'],
  ['CD', '<defs><linearGradient id="disc"><stop stop-color="#c0fcff"/><stop offset=".3" stop-color="#fbe4ff"/><stop offset=".55" stop-color="#a9a0df"/><stop offset=".75" stop-color="#faffc6"/><stop offset="1" stop-color="#9deeff"/></linearGradient></defs><circle cx="48" cy="48" r="40" fill="url(#disc)" stroke="#626280" stroke-width="3"/><path d="m21 20 17 19m21 20 16 17M17 29l20 13m21 13 23 13" stroke="white" stroke-width="3" opacity=".8"/><circle cx="48" cy="48" r="12" fill="#b0aec4" stroke="#77758f"/><circle cx="48" cy="48" r="6" fill="#fff"/>'],
  ['데이지', '<g fill="#fff7ff" stroke="#9471ab" stroke-width="2"><ellipse cx="48" cy="24" rx="12" ry="20"/><ellipse cx="48" cy="72" rx="12" ry="20"/><ellipse cx="24" cy="48" rx="20" ry="12"/><ellipse cx="72" cy="48" rx="20" ry="12"/><ellipse cx="31" cy="31" rx="12" ry="19" transform="rotate(-45 31 31)"/><ellipse cx="65" cy="65" rx="12" ry="19" transform="rotate(-45 65 65)"/></g><circle cx="48" cy="48" r="17" fill="#fff282" stroke="#9471ab" stroke-width="2"/><circle cx="42" cy="46" r="2"/><circle cx="54" cy="46" r="2"/><path d="M42 53q6 6 12 0" fill="none" stroke="#765980" stroke-width="2"/>'],
  ['러브레터', '<path d="M7 22h82v57H7Z" fill="#fff0fd" stroke="#74618e" stroke-width="3"/><path d="m8 24 40 30 40-30M8 78l28-28m52 28L61 50" fill="none" stroke="#aa87b3" stroke-width="2"/><path d="M48 66 35 52c-9-12 7-20 13-9 8-11 22-2 13 9Z" fill="#ff86bc" stroke="#a8588b" stroke-width="2"/>'],
  ['외계인', '<path d="M15 40C15-3 81-3 81 40 80 68 53 91 48 91S16 68 15 40" fill="#b9fba8" stroke="#3c6858" stroke-width="3"/><ellipse cx="32" cy="46" rx="10" ry="17" transform="rotate(-30 32 46)" fill="#252752"/><ellipse cx="64" cy="46" rx="10" ry="17" transform="rotate(30 64 46)" fill="#252752"/><path d="M40 72q8 6 16 0" fill="none" stroke="#3c6858" stroke-width="3"/>'],
] as const
type Sticker = { id: string; kind: number; x: number; y: number; angle: number }
const svg = (kind: number, id: string) => `<svg viewBox="0 0 96 96" aria-hidden="true">${drawings[kind][1].replaceAll('disc', `disc-${id}`)}</svg>`

export function mountStickers() {
  const main = document.querySelector('main')!
  const toolbar = document.createElement('section')
  toolbar.className = 'sticker-toolbar'
  toolbar.setAttribute('aria-label', '미니홈피 스티커 꾸미기')
  toolbar.innerHTML = `<button class="sticker-toggle" type="button" aria-expanded="false">✦ 스티커 꾸미기</button><div class="sticker-tray" hidden><div class="window-title">Sticker box.exe <button class="sticker-close" type="button" aria-label="꾸미기 완료">완료 ✓</button></div><p>골라 붙이고, 끌어서 옮겨보세요.</p><div class="sticker-choices">${drawings.map(([name], i) => `<button type="button" data-kind="${i}" aria-label="${name} 스티커 추가" title="${name}">${svg(i, `picker-${i}`)}<span>${name}</span></button>`).join('')}</div><div class="sticker-actions"><button type="button" data-action="left">↶ 회전</button><button type="button" data-action="right">회전 ↷</button><button type="button" data-action="remove">삭제 ×</button></div><p class="sticker-help">선택 후 방향키로 이동 · Delete로 삭제<br>이 브라우저에 저장돼요. 다른 방문자에게는 보이지 않아요.</p><p class="sticker-status" role="status"></p></div>`
  document.querySelector('.dream-strip')!.after(toolbar)
  const layer = document.createElement('div')
  layer.className = 'sticker-layer'
  main.append(layer)
  const toggle = toolbar.querySelector<HTMLButtonElement>('.sticker-toggle')!
  const tray = toolbar.querySelector<HTMLElement>('.sticker-tray')!
  const status = toolbar.querySelector<HTMLElement>('.sticker-status')!
  let items: Sticker[] = []
  let selected: string | undefined
  let editing = false
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]')
    if (Array.isArray(saved)) items = saved.filter(s => typeof s.id === 'string' && /^s[a-z0-9-]+$/.test(s.id) && Number.isInteger(s.kind) && s.kind >= 0 && s.kind < drawings.length && [s.x, s.y, s.angle].every(Number.isFinite)).slice(0, 40).map(s => ({ ...s, x: Math.max(0, Math.min(1,s.x)), y: Math.max(0,s.y) }))
  } catch { /* Storage may be disabled; decorating still works in this visit. */ }
  const save = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(items)); status.textContent = '스티커 배치를 저장했어요.' }
    catch { status.textContent = '브라우저 저장이 차단돼 이번 방문에서만 유지돼요.' }
  }
  const nodes = new Map<string, HTMLButtonElement>()
  const position = (s: Sticker) => {
    const node = nodes.get(s.id)!
    const size = node.offsetWidth || 76
    node.style.left = `${s.x * Math.max(0, main.clientWidth - size)}px`
    node.style.top = `${Math.min(s.y, Math.max(0, main.clientHeight - size))}px`
    node.style.transform = `rotate(${s.angle}deg)`
    node.classList.toggle('selected', editing && selected === s.id)
    node.disabled = !editing
    node.tabIndex = editing ? 0 : -1
    node.setAttribute('aria-pressed', String(selected === s.id))
  }
  const select = (id?: string) => {
    selected = id
    items.forEach(position)
    toolbar.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b => b.disabled = !id)
  }
  const setEditing = (value: boolean) => {
    editing = value
    tray.hidden = !value
    toggle.setAttribute('aria-expanded', String(value))
    layer.classList.toggle('editing', value)
    select(value ? selected : undefined)
  }
  const create = (s: Sticker) => {
    const node = document.createElement('button')
    node.type = 'button'
    node.className = 'placed-sticker'
    node.setAttribute('aria-label', `${drawings[s.kind][0]} 스티커 — 드래그 또는 방향키로 이동`)
    node.innerHTML = svg(s.kind,s.id)
    nodes.set(s.id, node)
    layer.append(node)
    node.addEventListener('focus', () => select(s.id))
    node.addEventListener('pointerdown', e => {
      if (!editing || e.button !== 0) return
      e.preventDefault()
      select(s.id)
      node.focus({ preventScroll: true })
      node.setPointerCapture(e.pointerId)
      const startX = e.clientX, startY = e.clientY
      const originX = s.x * (main.clientWidth - node.offsetWidth), originY = Math.min(s.y, main.clientHeight - node.offsetHeight)
      const move = (ev: PointerEvent) => {
        s.x = Math.max(0,Math.min(1,(originX + ev.clientX - startX) / Math.max(1,main.clientWidth-node.offsetWidth)))
        s.y = Math.max(0,Math.min(main.clientHeight-node.offsetHeight,originY+ev.clientY-startY))
        position(s)
      }
      const end = () => {
        node.removeEventListener('pointermove', move)
        node.removeEventListener('pointerup', end)
        node.removeEventListener('pointercancel', end)
        node.removeEventListener('lostpointercapture', end)
        save()
      }
      node.addEventListener('pointermove', move)
      node.addEventListener('pointerup', end)
      node.addEventListener('pointercancel', end)
      node.addEventListener('lostpointercapture', end)
    })
    node.addEventListener('keydown', e => {
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return }
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return
      e.preventDefault()
      const step = e.shiftKey ? 20 : 5
      s.x = Math.max(0,Math.min(1,s.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0)/Math.max(1,main.clientWidth-node.offsetWidth)))
      s.y = Math.max(0,Math.min(main.clientHeight-node.offsetHeight,s.y+(e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0)))
      position(s); save()
    })
    position(s)
  }
  const remove = () => {
    if (!selected) return
    nodes.get(selected)?.remove(); nodes.delete(selected)
    items = items.filter(s => s.id !== selected)
    select(); save()
  }
  items.forEach(create)
  select()
  toggle.addEventListener('click', () => setEditing(!editing))
  toolbar.querySelector('.sticker-close')!.addEventListener('click', () => { setEditing(false); toggle.focus() })
  toolbar.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach(button => button.addEventListener('click', () => {
    if (items.length >= 40) { status.textContent = '스티커는 40개까지 붙일 수 있어요. 하나를 지우고 다시 골라주세요.'; return }
    const s: Sticker = { id: `s${crypto.randomUUID()}`, kind: Number(button.dataset.kind), x: .46 + (items.length % 4)*.07, y: Math.max(20, Math.min(main.clientHeight-90, window.scrollY-main.offsetTop+180+(items.length%3)*35)), angle: -12+(items.length%5)*6 }
    items.push(s); create(s); select(s.id); save()
  }))
  toolbar.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.action === 'remove') { remove(); return }
    const s = items.find(s => s.id === selected)
    if (s) { s.angle = (s.angle + (button.dataset.action === 'left' ? -15 : 15)) % 360; position(s); save() }
  }))
  new ResizeObserver(() => items.forEach(position)).observe(main)
}
