import { minimi } from './guestbook-minimi'
import './guestbook-plaza.css'

type Resident = { id: string; author: string; minimi_seed?: number | null }
export function mountPlaza(host: HTMLElement, visit: (id: string) => void) {
  host.innerHTML = '<div class="plaza-title"><b>♡ Minimi Plaza.exe</b><button type="button" class="plaza-pause" aria-pressed="false">산책 멈추기</button></div><div class="plaza-scene"><div class="plaza-decor" aria-hidden="true"><span>✧</span><b>HELLO, LITTLE WORLD!</b><span>✧</span></div><p class="plaza-empty">미니미와 첫 메모를 남기면 이곳에 놀러 와요 ♡</p><div class="plaza-residents"></div></div><p class="plaza-caption">미니미를 누르면 그 친구의 메모로 이동해요.</p>'
  const stage = host.querySelector<HTMLElement>('.plaza-residents')!
  const empty = host.querySelector<HTMLElement>('.plaza-empty')!
  const pause = host.querySelector<HTMLButtonElement>('.plaza-pause')!
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  let paused = motion.matches, visible = true, frame = 0, last = 0
  const people = new Map<string, { button: HTMLButtonElement; x: number; y: number; dx: number; dy: number; remaining: number; hovering: boolean }>()
  const syncPause = () => { pause.textContent = paused ? '산책 시작하기' : '산책 멈추기'; pause.setAttribute('aria-pressed', String(paused)); host.classList.toggle('is-paused', paused) }
  pause.onclick = () => { paused = !paused; syncPause() }
  const preference = () => { paused = motion.matches; syncPause() }
  motion.addEventListener('change', preference)
  syncPause()
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting })
  observer.observe(host)
  function tick(now: number) {
    const dt = Math.min((now - last) / 1000, .05); last = now
    if (visible && !paused && !document.hidden) for (const p of people.values()) {
      if (p.hovering || p.button.matches(':focus-visible')) continue
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
      const p = { button, x: 5 + Math.random() * 90, y: Math.random() * 90, dx: 0, dy: 0, remaining: 0, hovering: false }
      button.style.left = `${p.x}%`; button.style.top = `${p.y}%`
      button.onpointerenter = () => { p.hovering = true }
      button.onpointerleave = () => { p.hovering = false }
      button.onclick = () => visit(row.id)
      stage.append(button); people.set(row.id, p)
    }
    host.querySelector('.plaza-caption')!.textContent = residents.length ? `미니미 ${residents.length}명 산책 중 · 누르면 메모로 이동해요. (최근 불러온 글 최대 24개)` : '미니미를 누르면 그 친구의 메모로 이동해요.'
  }
}
