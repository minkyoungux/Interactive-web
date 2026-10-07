import './guestbook-stardust.css'

type Spark = { x: number; y: number; vx: number; vy: number; size: number; age: number; life: number; angle: number; color: string; star: boolean }

export function mountStardust() {
  const canvas = document.createElement('canvas')
  canvas.className = 'cursor-stardust'
  canvas.setAttribute('aria-hidden', 'true')
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const toggle = document.createElement('button')
  toggle.type = 'button'; toggle.className = 'stardust-toggle'
  document.querySelector('.guest-header')!.append(toggle)
  document.body.append(canvas)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  let enabled = true
  try { enabled = localStorage.getItem('guestbook-stardust') !== 'off' } catch { /* storage is optional */ }
  let sparks: Spark[] = [], frame = 0, previous = 0, lastEmit = 0
  let lastPointer: { x: number; y: number } | null = null
  let width = innerWidth, height = innerHeight
  const palette = ['#ffe0f3', '#cff6ff', '#e9dbff', '#fff6cc', '#ffffff']
  const clear = () => {
    cancelAnimationFrame(frame); frame = 0; sparks = []; lastPointer = null
    ctx.clearRect(0, 0, width, height)
  }
  const sync = () => {
    toggle.disabled = reduced.matches
    toggle.setAttribute('aria-pressed', String(enabled && !reduced.matches))
    toggle.textContent = reduced.matches ? '✧ 별가루 · 동작 줄임' : `✧ 별가루 ${enabled ? 'ON' : 'OFF'}`
    toggle.title = reduced.matches ? '기기의 동작 줄이기 설정에 따라 효과를 껐어요.' : '마우스를 따라오는 별가루 켜기 / 끄기'
    if (!enabled || reduced.matches) clear()
  }
  const resize = () => {
    width = innerWidth; height = innerHeight
    const scale = Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale)
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    clear()
  }
  const draw = (now: number) => {
    const dt = Math.min((now - previous) / 1000, .04); previous = now
    ctx.clearRect(0, 0, width, height)
    sparks = sparks.filter(s => s.age < s.life)
    for (const s of sparks) {
      s.age += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += dt * 8
      const progress = Math.min(1, s.age / s.life)
      const alpha = Math.min(1, progress * 12) * (1 - progress) * .85
      const size = s.size * (1 - progress * .35)
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.angle + progress * .5)
      ctx.globalAlpha = alpha; ctx.fillStyle = s.color
      ctx.shadowColor = s.color; ctx.shadowBlur = s.star ? 7 : 3
      ctx.beginPath()
      if (s.star) {
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4, r = i % 2 ? size * .22 : size
          const x = Math.cos(a) * r, y = Math.sin(a) * r
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.closePath()
      } else ctx.arc(0, 0, size, 0, Math.PI * 2)
      ctx.fill(); ctx.restore()
    }
    if (sparks.length) frame = requestAnimationFrame(draw)
    else { frame = 0; ctx.clearRect(0, 0, width, height) }
  }
  const move = (event: PointerEvent) => {
    if (!enabled || reduced.matches || document.hidden || event.pointerType !== 'mouse') return
    const now = performance.now()
    if (now - lastEmit < 24) return
    const x = event.clientX, y = event.clientY
    if (lastPointer && Math.hypot(x - lastPointer.x, y - lastPointer.y) < 3) return
    lastPointer = { x, y }; lastEmit = now
    for (let i = 0; i < 3; i++) {
      const star = i === 0
      sparks.push({ x: x + (Math.random() - .5) * 12, y: y + (Math.random() - .5) * 12,
        vx: (Math.random() - .5) * 18, vy: 5 + Math.random() * 13,
        size: star ? 3 + Math.random() * 4 : .7 + Math.random() * 1.1,
        age: 0, life: .55 + Math.random() * .55, angle: Math.random(),
        color: palette[Math.floor(Math.random() * palette.length)], star })
    }
    if (sparks.length > 90) sparks.splice(0, sparks.length - 90)
    if (!frame) { previous = now; frame = requestAnimationFrame(draw) }
  }
  toggle.onclick = () => {
    enabled = !enabled
    try { localStorage.setItem('guestbook-stardust', enabled ? 'on' : 'off') } catch { /* optional */ }
    sync()
  }
  const visibility = () => { if (document.hidden) clear() }
  resize(); sync()
  window.addEventListener('pointermove', move, { passive: true })
  window.addEventListener('resize', resize)
  window.addEventListener('blur', clear)
  document.addEventListener('visibilitychange', visibility)
  reduced.addEventListener('change', sync)
  window.addEventListener('pagehide', clear)
}
