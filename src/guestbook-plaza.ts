import { minimi } from './guestbook-minimi'
import './guestbook-plaza.css'

type Resident = { id: string; author: string; minimi_seed?: number | null }
export function mountPlaza(host: HTMLElement, visit: (id: string) => void) {
  host.innerHTML = '<div class="plaza-title"><b>♡ Minimi Plaza.exe</b><button type="button" class="plaza-pause" aria-pressed="false">산책 멈추기</button></div><div class="plaza-scene"><div class="plaza-decor" aria-hidden="true"><span>✧</span><b>HELLO, LITTLE WORLD!</b><span>✧</span></div><p class="plaza-empty">미니미와 첫 메모를 남기면 이곳에 놀러 와요 ♡</p><div class="plaza-residents"></div></div><p class="plaza-caption">미니미를 누르면 그 친구의 메모로 이동해요.</p>'
  const stage = host.querySelector<HTMLElement>('.plaza-residents')!
  const empty = host.querySelector<HTMLElement>('.plaza-empty')!
  const pause = host.querySelector<HTMLButtonElement>('.plaza-pause')!
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const scene = host.querySelector<HTMLElement>('.plaza-scene')!
  const snacks = document.createElement('div')
  snacks.className = 'plaza-snacks'
  snacks.innerHTML = '<button type="button" data-snack="커피">☕ 커피</button><button type="button" data-snack="붕어빵">🐟 붕어빵</button><span role="status">간식을 끌어 주거나, 고른 뒤 미니미를 눌러줘。</span>'
  scene.before(snacks)
  let snack = ''
  let consumedDrag = false
  const snackGhost = document.createElement('span')
  snackGhost.className = 'snack-ghost'; snackGhost.hidden = true
  document.body.append(snackGhost)
  const fed = new Map<string, number>()
  const feed = (button: HTMLButtonElement) => {
    if (!snack) return
    fed.set(button.dataset.entryId!, performance.now() + 3500)
    button.classList.add('is-fed')
    setTimeout(() => button.classList.remove('is-fed'), 3500)
    button.querySelector('.plaza-greeting')!.textContent = `${snack} 냠… 이 은혜 월급날 갚을게。`
    snacks.querySelector('span')!.textContent = `${snack} 잘 먹었어…♡`
    snack = ''
    snacks.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed','false'))
  }
  snacks.querySelectorAll<HTMLButtonElement>('button').forEach(b => {
    b.setAttribute('aria-pressed','false')
    b.onclick = () => {
      if (consumedDrag) { consumedDrag = false; return }
      snack = b.dataset.snack!
      snacks.querySelectorAll('button').forEach(n=>n.setAttribute('aria-pressed',String(n===b)))
      snacks.querySelector('span')!.textContent = `${snack} 준비 완료… 미니미를 골라줘。`
    }
    b.onpointerdown = e => { b.click(); b.setPointerCapture(e.pointerId) }
    b.onpointermove = e => {
      if (!b.hasPointerCapture(e.pointerId)) return
      snackGhost.hidden=false;snackGhost.textContent=b.dataset.snack==='커피'?'☕':'🐟'
      snackGhost.style.left=`${e.clientX}px`;snackGhost.style.top=`${e.clientY}px`
      pointer.x=e.clientX;pointer.y=e.clientY;pointer.active=true;pointer.speed=0
    }
    b.onpointerup = e => {
      snackGhost.hidden=true;pointer.active=false
      const target = document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLButtonElement>('.plaza-person')
      if(target) { feed(target); consumedDrag=true;setTimeout(()=>{consumedDrag=false},0);e.preventDefault() }
    }
    b.onpointercancel = () => { snackGhost.hidden=true;pointer.active=false }
  })
  scene.addEventListener('click', e => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.plaza-person')
    if(snack && target) { e.stopImmediatePropagation(); e.preventDefault(); feed(target) }
  }, true)
  const pointer = { x: 0, y: 0, active: false, time: 0, speed: 0, since: 0 }
  scene.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return
    const now = performance.now()
    pointer.speed = pointer.active ? Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) / Math.max(16, now - pointer.time) : 0
    if (!pointer.active) pointer.since = now
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.time = now; pointer.active = true
  })
  scene.addEventListener('pointerleave', () => { pointer.active = false })
  let paused = motion.matches, visible = true, frame = 0, last = 0
  const people = new Map<string, { button: HTMLButtonElement; x: number; y: number; dx: number; dy: number; remaining: number; hovering: boolean; fear: number; cooldown: number }>()
  const syncPause = () => {
    pause.textContent = paused ? '산책 시작하기' : '산책 멈추기'; pause.setAttribute('aria-pressed', String(paused)); host.classList.toggle('is-paused', paused)
    if (paused) for (const p of people.values()) {
      p.button.classList.remove('is-curious', 'is-startled'); p.fear = 0
      for (const key of ['--gaze-x','--gaze-y','--head-x','--head-angle']) p.button.style.removeProperty(key)
      p.button.querySelector('.plaza-greeting')!.textContent = '안녕! 내 메모 볼래? ♡'
    }
  }
  pause.onclick = () => { paused = !paused; syncPause() }
  const preference = () => { paused = motion.matches; syncPause() }
  motion.addEventListener('change', preference)
  syncPause()
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting })
  observer.observe(host)
  function tick(now: number) {
    const dt = Math.min((now - last) / 1000, .05); last = now
    const area = stage.getBoundingClientRect()
    if (visible && !paused && !document.hidden) for (const p of people.values()) {
      const vx = pointer.x - (area.left + area.width * p.x / 100)
      const vy = pointer.y - (area.top + area.height * p.y / 100 + 35)
      const distance = Math.hypot(vx, vy)
      const near = pointer.active && distance < 150 && !motion.matches
      const greeting = p.button.querySelector<HTMLElement>('.plaza-greeting')!
      if ((fed.get(p.button.dataset.entryId!) ?? 0) > now) continue
      p.button.classList.remove('is-fed')
      if (near && !snack && pointer.speed > .9 && now - pointer.time < 90 && now > p.cooldown) {
        p.fear = now + 700; p.cooldown = now + 1700
        p.dx = -vx / Math.max(distance, 1) * 24; p.dy = -vy / Math.max(distance, 1) * 34
        p.remaining = 1.4
      }
      const scared = now < p.fear
      p.button.classList.toggle('is-startled', scared)
      p.button.classList.toggle('is-curious', near && !scared)
      p.button.style.setProperty('--gaze-x', near ? `${Math.max(-1.3, Math.min(1.3, vx / 35))}px` : '0px')
      p.button.style.setProperty('--gaze-y', near ? `${Math.max(-.7, Math.min(.7, vy / 65))}px` : '0px')
      p.button.style.setProperty('--head-x', near ? `${Math.sign(vx)}px` : '0px')
      p.button.style.setProperty('--head-angle', near ? `${Math.max(-5, Math.min(5, vx / 15))}deg` : '0deg')
      greeting.textContent = near && snack ? '나도 한 입…♡' : scared ? '앗, 깜짝이야…!' : near ? '뭐 하고 있어? ♡' : '안녕! 내 메모 볼래? ♡'
      if ((p.hovering && !scared) || p.button.matches(':focus-visible')) continue
      if (near && !scared) {
        if (now - pointer.since > 550 && distance > 65) {
          p.dx = vx / distance * (snack ? 12 : 3); p.dy = vy / distance * (snack ? 18 : 6)
        } else { p.dx = 0; p.dy = 0 }
        p.remaining = .3
      }
      p.remaining -= dt
      if (p.remaining <= 0) {
        const angle = Math.random() * Math.PI * 2
        p.dx = Math.cos(angle) * 3; p.dy = Math.sin(angle) * 6; p.remaining = 2 + Math.random() * 4
      }
      p.x += p.dx * dt; p.y += p.dy * dt
      if (p.x < 0 || p.x > 100) { p.dx *= -1; p.x = Math.max(0, Math.min(100, p.x)) }
      if (p.y < 0 || p.y > 100) { p.dy *= -1; p.y = Math.max(0, Math.min(100, p.y)) }
      p.button.style.left = `${p.x}%`; p.button.style.top = `${p.y}%`
      p.button.style.zIndex = String(Math.round(p.y))
    }
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  window.addEventListener('pagehide', () => { cancelAnimationFrame(frame); observer.disconnect(); motion.removeEventListener('change', preference) }, { once: true })
  return (rows: Resident[]) => {
    const residents = rows.filter(r => Number.isInteger(r.minimi_seed) && r.minimi_seed! >= 0 && r.minimi_seed! <= 2147483647).slice(0, 24)
    const ids = new Set(residents.map(r => r.id))
    for (const [id, p] of people) if (!ids.has(id)) { p.button.remove(); people.delete(id) }
    empty.hidden = residents.length > 0
    for (const row of residents) {
      if (people.has(row.id)) continue
      const button = document.createElement('button'); button.type = 'button'; button.className = 'plaza-person'
      button.dataset.entryId = row.id
      button.setAttribute('aria-label', `${row.author}의 방명록 보기`)
      const avatar = minimi(row.minimi_seed!)
      avatar.querySelector('.minimi-stats')?.remove()
      const name = document.createElement('span'); name.className = 'plaza-name'; name.textContent = row.author
      const greeting = document.createElement('span'); greeting.className = 'plaza-greeting'; greeting.textContent = '안녕! 내 메모 볼래? ♡'
      button.append(greeting, avatar, name)
      const p = { button, x: 5 + Math.random() * 90, y: Math.random() * 90, dx: 0, dy: 0, remaining: 0, hovering: false, fear: 0, cooldown: 0 }
      button.style.left = `${p.x}%`; button.style.top = `${p.y}%`
      button.onpointerenter = () => { p.hovering = true }
      button.onpointerleave = () => { p.hovering = false }
      button.onclick = () => visit(row.id)
      stage.append(button); people.set(row.id, p)
    }
    host.querySelector('.plaza-caption')!.textContent = residents.length ? `미니미 ${residents.length}명 산책 중 · 누르면 메모로 이동해요. (최근 불러온 글 최대 24개)` : '미니미를 누르면 그 친구의 메모로 이동해요.'
  }
}
