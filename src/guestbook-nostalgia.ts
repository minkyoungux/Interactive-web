import './guestbook-nostalgia.css'

const secrets = [
  ['퇴근아… 넌 가끔\n내 생각 하니?', '회사라는 감옥에 갇혀…\n월급이라는 희망으로 버틴다。'],
  ['월요일… 우리\n그만 만날까。', '널 잊을 만하면…\n넌 또 내게 돌아오지。'],
  ['통장을 스친 너…\n월급이라는 인연。', '짧아서 더 아름다웠ㄷr…\n다음 달엔 오래 머물러줘♡'],
  ['몸은 사무실에…\n영혼은 집에。', '로그인은 했지만…\n마음까지 출근한 건 아니야。'],
  ['커피야… 오늘도\n나를 부탁해。', '심장은 카페인으로 뛰고…\n눈빛은 퇴근을 향한다☆'],
  ['연차 한 장…\n그게 내 로망。', '거창한 꿈은 없어…\n알람 없이 눈뜨고 싶을 뿐。'],
  ['회의는 길고…\n내 영혼은 짧다。', '좋은 의견입니다…\n사실 저녁 메뉴 생각했어。'],
  ['넌… 내 즐겨찾기에\n저장된 사람♡', '접속하지 않아도…\n삭제하지 않을게。'],
  ['답장은 늦어도…\n마음은 실시간。', '읽씹 아니야…\n너에게 할 말을 고르는 중。'],
  ['퇴근길 노을…\n오늘의 배경화면。', '하루 종일 버틴 나에게…\n하늘이 보내준 쪽지☆'],
  ['나 가끔…\n칼퇴를 꿈꾼다。', '시계는 여섯 시인데…\n왜 내 하루는 안 끝날까。'],
  ['일촌은 적어도…\n진심은 많아。', '퍼가요~♡\n좋은 마음만 가져가。'],
  ['오늘도 버틴 너…\n제법 멋진걸。', '대단한 일이 없어도…\n무사히 보낸 하루면 됐어。'],
  ['마음은 잠시…\n자리 비움。', '돌아오면 웃어줄게…\n조금만 충전하고 올게。'],
  ['내 상태 메시지…\n퇴근하고 싶음。', '바꿀 생각은 없어…\n월요일부터 금요일까지。'],
  ['우린 각자의 속도로…\n집에 가는 중。', '조금 늦어도 괜찮아…\n너의 밤은 아직 남았으니까。'],
]

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
  const secret = windowBox.querySelector<HTMLElement>('.fog-secret')!
  let previous = -1
  try { const saved = localStorage.getItem('guestbook-last-secret'); if(saved !== null && secrets[Number(saved)]) previous = Number(saved) } catch { /* Optional storage. */ }
  const changeSecret = () => {
    const choices = secrets.map((_,i)=>i).filter(i=>i!==previous)
    previous = choices[Math.floor(Math.random()*choices.length)]
    const [title, body] = secrets[previous]
    const small = document.createElement('small'); small.textContent = body
    secret.replaceChildren(document.createTextNode(title), small)
    accessible.textContent = `${title.replaceAll('\n',' ')} ${body.replaceAll('\n',' ')}`
    try { localStorage.setItem('guestbook-last-secret', String(previous)) } catch { /* Still random without storage. */ }
  }
  secret.style.whiteSpace = 'pre-line'
  changeSecret()
  let opened = false
  let refog: number | undefined
  let nextSecret: number | undefined
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
    clearTimeout(nextSecret)
    refog = window.setTimeout(() => {
      if (opened) return
      canvas.classList.add('refogging')
      // Repaint while transparent, then fade the condensation back in.
      paint(); last = undefined
      requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.remove('refogging')))
      // Change only after the condensation fully covers the old message.
      nextSecret = window.setTimeout(() => { if(!opened) changeSecret() }, 1750)
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
    opened = !opened; clearTimeout(refog); clearTimeout(nextSecret)
    canvas.hidden = opened; accessible.hidden = !opened
    reveal.setAttribute('aria-expanded', String(opened))
    reveal.textContent = opened ? '다시 비밀로…' : '비밀 읽기 ♡'
    if (!opened) { canvas.classList.remove('refogging'); paint(); changeSecret() }
  })
  window.addEventListener('pagehide', () => { clearTimeout(refog); clearTimeout(nextSecret) }, { once:true })
}
