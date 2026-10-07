import './guestbook-nostalgia.css'

export function mountNostalgia() {
  const moods = [
    ['괜히 센치…', '오늘은… 마음에도 비가 내려。'],
    ['건들지마', '나 지금… 나만의 세계에 있어。'],
    ['사랑인가봐♡', '자꾸 웃음이 나… 왜일까。'],
    ['집에 갈래', '회사라는 감옥에… 월급이라는 희망。'],
    ['영혼은 퇴근…', '몸은 사무실에… 영혼은 이미 집에。'],
    ['월급날만 기다려♡', '통장을 스친 너… 월급이라는 짧은 인연。'],
    ['커피로 버티는 중', '내 심장은… 아이스 아메리카노로 뛴다。'],
    ['회의 중… 잠수', '접속은 해 있지만… 내 마음은 오프라인。'],
  ]
  const mood = document.querySelector<HTMLElement>('.mini-window')!
  mood.removeAttribute('aria-hidden')
  mood.classList.add('today-mood')
  mood.innerHTML = `<div class="window-title">TODAY… 나의 기분 <span aria-hidden="true">♡</span></div><label class="sr-only" for="today-mood">오늘의 기분</label><select id="today-mood">${moods.map(([label], i) => `<option value="${i}">${label}</option>`).join('')}</select><p class="mood-message" role="status"></p>`
  const select = mood.querySelector<HTMLSelectElement>('select')!
  try {
    const saved = localStorage.getItem('guestbook-today-mood')
    if (saved !== null && moods[Number(saved)]) select.value = String(Number(saved))
  } catch { /* Storage may be blocked in private browsing. */ }
  const updateMood = () => {
    mood.querySelector('.mood-message')!.textContent = moods[Number(select.value)][1]
    try { localStorage.setItem('guestbook-today-mood', select.value) } catch { /* Keep the picker usable. */ }
  }
  select.addEventListener('change', updateMood)
  updateMood()
  document.querySelector('.hero-write')!.textContent = '➜ 그냥 가지 말구… 흔적 남겨줘 ♡'
  document.querySelector('.cat-copy h2')!.textContent = '너는 좋겠다… 회사 안 가서。'

  const windowBox = document.createElement('section')
  windowBox.className = 'fog-window'
  windowBox.setAttribute('aria-label', '김 서린 비밀 창문')
  windowBox.innerHTML = `<div class="window-title">secret_window.exe <span aria-hidden="true">…♡</span></div><div class="fog-glass"><p class="fog-secret" aria-hidden="true">퇴근아… 넌 가끔<br>내 생각 하니?<small>회사라는 감옥에 갇혀…<br>월급이라는 희망으로 버틴다。</small></p><canvas aria-hidden="true"></canvas></div><p class="fog-hint">마우스로 살살 닦아봐… 직장인의 속마음。</p><button class="fog-reveal" type="button" aria-expanded="false">비밀 읽기 ♡</button><p class="fog-accessible" hidden>퇴근아… 넌 가끔 내 생각 하니? 회사라는 감옥에 갇혀… 월급이라는 희망으로 버틴다。</p>`
  document.querySelector('.composer')!.append(windowBox)
  const glass = windowBox.querySelector<HTMLElement>('.fog-glass')!
  const canvas = windowBox.querySelector('canvas')!
  const ctx = canvas.getContext('2d')
  const reveal = windowBox.querySelector<HTMLButtonElement>('.fog-reveal')!
  const accessible = windowBox.querySelector<HTMLElement>('.fog-accessible')!
  let opened = false
  let refog: number | undefined
  let last: { x: number; y: number } | undefined
  const paint = () => {
    if (!ctx) return
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    gradient.addColorStop(0, '#dceaf1'); gradient.addColorStop(.5, '#d7d3ed'); gradient.addColorStop(1, '#f0dfeb')
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#ffffff65'
    for (let i = 0; i < 65; i++) {
      ctx.beginPath(); ctx.ellipse((i * 47 % 101) / 101 * canvas.width, (i * 31 % 97) / 97 * canvas.height, 1.5, 3, -.3, 0, Math.PI * 2); ctx.fill()
    }
  }
  new ResizeObserver(() => {
    const ratio = Math.min(devicePixelRatio || 1, 2)
    canvas.width = Math.round(glass.clientWidth * ratio); canvas.height = Math.round(glass.clientHeight * ratio)
    paint(); last = undefined
  }).observe(glass)
  const scheduleFog = () => {
    clearTimeout(refog)
    refog = window.setTimeout(() => {
      if (opened) return
      canvas.classList.add('refogging')
      // Repaint while transparent, then fade the condensation back in.
      paint(); last = undefined
      requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.remove('refogging')))
    }, 2200)
  }
  glass.addEventListener('pointermove', event => {
    if (!ctx || opened || (event.pointerType !== 'mouse' && event.buttons === 0)) return
    const rect = canvas.getBoundingClientRect()
    const ratio = canvas.width / rect.width
    const x = (event.clientX - rect.left) * ratio, y = (event.clientY - rect.top) * ratio
    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineWidth = 46 * ratio; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(last?.x ?? x, last?.y ?? y); ctx.lineTo(x + .01, y); ctx.stroke()
    last = { x, y }; scheduleFog()
  })
  glass.addEventListener('pointerleave', () => { last = undefined })
  glass.addEventListener('pointerup', () => { last = undefined })
  reveal.addEventListener('click', () => {
    opened = !opened; clearTimeout(refog)
    canvas.hidden = opened; accessible.hidden = !opened
    reveal.setAttribute('aria-expanded', String(opened))
    reveal.textContent = opened ? '다시 비밀로…' : '비밀 읽기 ♡'
    if (!opened) paint()
  })
}
