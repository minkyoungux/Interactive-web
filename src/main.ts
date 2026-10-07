import './style.css'
import plushCatLookUpSrc from './assets/plush-cat-look-up.png'
import plushCatHissSrc from './assets/plush-cat-hiss.png'

type LetterDrop = {
  id: number
  char: string
  x: number
  y: number
  vx: number
  vy: number
  size: number
  boxWidth: number
  angle: number
  spin: number
  color: string
}

type RainDrop = {
  x: number
  y: number
  vx: number
  vy: number
  length: number
  life: number
  maxLife: number
}

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main class="page-shell">
    <header class="topbar">
      <a class="brand" href="${import.meta.env.BASE_URL}" aria-label="애니마 화면으로 돌아가기">
        <span class="brand-mark">a</span>
        <span>타닥타닥 냥이</span>
      </a>
      <div class="topbar-copy">
        <span>제시된 한글 · 영문 단어를 입력해요</span>
        <span class="divider" aria-hidden="true"></span>
        <span>고양이는 안전한 곳을 찾아 움직여요</span>
      </div>
    </header>

    <section class="game-card" aria-labelledby="game-title">
      <div class="game-heading">
        <div>
          <p class="eyebrow">KEYBOARD RAIN</p>
          <h1 id="game-title">글자 비를 피해라!</h1>
        </div>
        <div class="scoreboard" aria-live="polite">
          <div><span>떨어진 단어</span><strong id="score">0</strong></div>
          <div><span>생존 시간</span><strong id="timer">0.0초</strong></div>
        </div>
      </div>

      <div class="game-stage" id="game-stage">
        <canvas id="game-canvas" aria-label="키보드로 만든 알파벳을 피하는 고양이 게임"></canvas>
        <div class="word-challenge" id="word-challenge">
          <p>화면의 단어를 그대로 입력하세요</p>
          <div class="target-word" id="target-word" aria-live="polite"></div>
          <small id="input-guide">엔터 없이 완성하면 바로 떨어져요</small>
        </div>
        <input class="word-input" id="word-input" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="제시된 단어 입력" />
        <div class="hiss" id="hiss" aria-hidden="true">하악—!</div>
        <div class="game-over" id="game-over" hidden>
          <div class="rain-icon" aria-hidden="true"><i></i><i></i><i></i></div>
          <p class="over-label">OH NO!</p>
          <h2>글자 비에 맞았어요</h2>
          <p id="final-score">0개의 글자를 피했어요.</p>
          <button id="restart" type="button">다시 시작 <span aria-hidden="true">↻</span></button>
        </div>
        <div class="stage-label" aria-hidden="true">TYPE THE WORD</div>
      </div>

      <div class="game-footer">
        <p><span class="status-dot"></span><strong>TIP</strong> 한글과 영문 단어가 무작위로 나타나요.</p>
        <button class="sound-button" id="sound-button" type="button" aria-pressed="true" aria-label="효과음 끄기">
          <span class="sound-bars" aria-hidden="true"><i></i><i></i><i></i></span>
          효과음 켜짐
        </button>
      </div>
    </section>

    <footer class="page-footer">
      <span>화면의 단어를 입력해보세요</span>
      <span class="footer-cat" aria-hidden="true">⌁</span>
      <span>고양이는 스스로 피해요</span>
    </footer>
  </main>
`

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')!
const context = canvas.getContext('2d')!
const stage = document.querySelector<HTMLDivElement>('#game-stage')!
const scoreElement = document.querySelector<HTMLElement>('#score')!
const timerElement = document.querySelector<HTMLElement>('#timer')!
const wordChallenge = document.querySelector<HTMLDivElement>('#word-challenge')!
const targetWordElement = document.querySelector<HTMLDivElement>('#target-word')!
const wordInput = document.querySelector<HTMLInputElement>('#word-input')!
const hissElement = document.querySelector<HTMLDivElement>('#hiss')!
const gameOverElement = document.querySelector<HTMLDivElement>('#game-over')!
const finalScoreElement = document.querySelector<HTMLParagraphElement>('#final-score')!
const restartButton = document.querySelector<HTMLButtonElement>('#restart')!
const soundButton = document.querySelector<HTMLButtonElement>('#sound-button')!

const colors = ['#56c7e8', '#6edbd0', '#7caeff', '#a78eea', '#4bc0d4', '#8dd8ff']
const words = [
  '고양이', '구름', '달빛', '마음', '바다', '바람', '별자리', '보라빛', '산책', '소나기',
  '우주', '여름', '자몽', '초록', '포근함', '하늘', '행운', '호기심',
  'APPLE', 'BUBBLE', 'CLOUD', 'DREAM', 'FOREST', 'GALAXY', 'HAPPY', 'JELLY',
  'KITTY', 'LEMON', 'MAGIC', 'MOON', 'ORANGE', 'RAINBOW', 'SPARK', 'TWINKLE',
]
const catLookUpImage = new Image()
const catHissImage = new Image()
catLookUpImage.src = plushCatLookUpSrc
catHissImage.src = plushCatHissSrc
let width = 0
let height = 0
let dpr = 1
let letters: LetterDrop[] = []
let rain: RainDrop[] = []
let score = 0
let elapsed = 0
let started = false
let gameOver = false
let impactTime = 0
let soundOn = true
let lastFrame = performance.now()
let nextId = 0
let catX = 0
let catTargetX = 0
let catLean = 0
let catVelocity = 0
let catUrgency = 0
let targetWord = ''
let validInput = ''
let composing = false

function resizeCanvas() {
  const rect = stage.getBoundingClientRect()
  const oldWidth = width
  width = rect.width
  height = rect.height
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  context.setTransform(dpr, 0, 0, dpr, 0, 0)

  if (!catX) catX = width / 2
  else if (oldWidth) catX = (catX / oldWidth) * width
  catTargetX = catX
}

function roundedRect(x: number, y: number, w: number, h: number, radius: number) {
  context.beginPath()
  context.roundRect(x, y, w, h, radius)
}

function drawBackground() {
  context.fillStyle = '#e8f7f2'
  context.fillRect(0, 0, width, height)

  const grid = Math.max(28, width / 30)
  context.strokeStyle = 'rgba(31, 78, 77, 0.055)'
  context.lineWidth = 1
  context.beginPath()
  for (let x = grid / 2; x < width; x += grid) {
    context.moveTo(x, 0)
    context.lineTo(x, height)
  }
  for (let y = grid / 2; y < height; y += grid) {
    context.moveTo(0, y)
    context.lineTo(width, y)
  }
  context.stroke()

  const groundY = height - Math.max(28, height * 0.07)
  context.fillStyle = '#d7eee8'
  context.fillRect(0, groundY, width, height - groundY)
  context.strokeStyle = '#bfded6'
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(0, groundY)
  context.lineTo(width, groundY)
  context.stroke()
}

function drawLetter(letter: LetterDrop) {
  context.save()
  context.translate(letter.x, letter.y)

  const speedStretch = Math.min(28, letter.vy * 0.045)
  context.strokeStyle = 'rgba(55, 160, 208, .28)'
  context.lineWidth = Math.max(2, letter.size * 0.06)
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(0, -letter.size * 0.5 - 3)
  context.lineTo(-letter.vx * 0.025, -letter.size * 0.5 - 14 - speedStretch)
  context.stroke()
  context.fillStyle = 'rgba(88, 186, 224, .34)'
  context.beginPath()
  context.arc(letter.size * 0.25, -letter.size * 0.72 - speedStretch, Math.max(2.5, letter.size * 0.065), 0, Math.PI * 2)
  context.arc(-letter.size * 0.28, -letter.size * 0.9 - speedStretch * 0.55, Math.max(1.8, letter.size * 0.045), 0, Math.PI * 2)
  context.fill()

  context.rotate(letter.angle)

  const halfWidth = letter.boxWidth / 2
  const halfHeight = letter.size / 2
  context.fillStyle = 'rgba(27, 48, 56, 0.14)'
  roundedRect(-halfWidth + 4, -halfHeight + 7, letter.boxWidth, letter.size, letter.size * 0.2)
  context.fill()

  context.fillStyle = letter.color
  roundedRect(-halfWidth, -halfHeight, letter.boxWidth, letter.size, letter.size * 0.2)
  context.fill()
  context.strokeStyle = '#17383e'
  context.lineWidth = Math.max(2, letter.size * 0.045)
  context.stroke()

  context.fillStyle = 'rgba(255,255,255,.36)'
  roundedRect(-halfWidth + letter.size * 0.1, -halfHeight + letter.size * 0.09, letter.boxWidth - letter.size * 0.2, letter.size * 0.13, 20)
  context.fill()

  context.fillStyle = '#17383e'
  const fontSize = letter.char.length > 5 ? letter.size * 0.48 : letter.size * 0.56
  context.font = `900 ${fontSize}px "Gowun Dodum", ui-rounded, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(letter.char, 0, letter.size * 0.04)
  context.restore()
}

function drawRainDrop(drop: RainDrop) {
  const opacity = Math.max(0, drop.life / drop.maxLife)
  context.save()
  context.translate(drop.x, drop.y)
  context.rotate(Math.atan2(drop.vy, drop.vx) - Math.PI / 2)
  context.strokeStyle = `rgba(52, 153, 212, ${opacity})`
  context.fillStyle = `rgba(91, 190, 233, ${opacity})`
  context.lineWidth = 3
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(0, -drop.length)
  context.quadraticCurveTo(drop.length * 0.46, -drop.length * 0.18, 0, drop.length * 0.28)
  context.quadraticCurveTo(-drop.length * 0.46, -drop.length * 0.18, 0, -drop.length)
  context.fill()
  context.stroke()
  context.restore()
}

function drawCat() {
  const catImage = gameOver ? catHissImage : catLookUpImage
  const catHeight = Math.max(132, Math.min(184, width * 0.18))
  const fallbackRatio = gameOver ? 1199 / 1312 : 1190 / 1322
  const catWidth = catHeight * (catImage.naturalWidth && catImage.naturalHeight
    ? catImage.naturalWidth / catImage.naturalHeight
    : fallbackRatio)
  const baseY = height - Math.max(28, height * 0.07) + 4
  const now = performance.now()
  const running = Math.min(1, Math.abs(catVelocity) / 430)
  const step = Math.sin(now / (running > 0.12 ? 62 : 260))
  const bob = gameOver ? 0 : Math.abs(step) * -(1.5 + running * 5)
  const hissProgress = gameOver ? Math.min(1, (now - impactTime) / 260) : 0
  const shake = gameOver ? Math.sin(now / 24) * (1 - Math.min(1, (now - impactTime) / 650)) * 6 : 0

  context.save()
  context.translate(catX + shake, baseY + bob)
  context.rotate(catLean * 0.11 - hissProgress * 0.035)

  if (!gameOver && running > 0.12) {
    const trailSide = catVelocity > 0 ? -1 : 1
    context.save()
    context.strokeStyle = `rgba(52, 145, 166, ${0.12 + running * 0.32})`
    context.lineWidth = 2.5
    context.lineCap = 'round'
    for (let i = 0; i < 3; i += 1) {
      const y = -11 - i * 11
      const startX = trailSide * (catWidth * 0.37 + i * 5)
      context.beginPath()
      context.moveTo(startX, y)
      context.quadraticCurveTo(startX + trailSide * 18, y - 4, startX + trailSide * (31 + running * 18), y + 1)
      context.stroke()
    }
    context.restore()
  }

  context.fillStyle = 'rgba(31, 67, 70, .14)'
  context.beginPath()
  context.ellipse(0, 1, catWidth * 0.39, 8, 0, 0, Math.PI * 2)
  context.fill()

  if (catImage.complete && catImage.naturalWidth) {
    context.filter = 'drop-shadow(0 5px 4px rgba(16, 42, 45, .22))'
    context.drawImage(catImage, -catWidth / 2, -catHeight - hissProgress * 8, catWidth, catHeight)
    context.filter = 'none'
  } else {
    context.fillStyle = '#17191c'
    context.beginPath()
    context.ellipse(0, -catHeight * 0.5, catWidth * 0.4, catHeight * 0.47, 0, 0, Math.PI * 2)
    context.fill()
  }

  context.restore()

  return {
    x: catX - catWidth * 0.32,
    y: baseY - catHeight * 0.91,
    width: catWidth * 0.64,
    height: catHeight * 0.9,
  }
}

function pickSafeTarget() {
  if (!started || gameOver) return { x: catX, urgency: 0 }
  const padding = Math.max(48, width * 0.045)
  if (!letters.length) {
    return {
      x: width / 2 + Math.sin(elapsed * 1.7) * Math.min(54, width * 0.06),
      urgency: 0.08,
    }
  }

  const samples = 31
  const catCollisionY = height - Math.max(28, height * 0.07) - Math.max(105, Math.min(155, width * 0.155))
  let bestX = catX
  let bestRisk = Number.POSITIVE_INFINITY
  let urgency = 0

  const predictions = letters.map((letter) => {
    const distanceY = Math.max(0, catCollisionY - letter.y)
    const gravity = 255
    const time = distanceY === 0
      ? 0
      : Math.max(0, (-letter.vy + Math.sqrt(letter.vy ** 2 + 2 * gravity * distanceY)) / gravity)
    return {
      x: letter.x + letter.vx * time,
      time,
      halfWidth: letter.boxWidth / 2 + 48,
    }
  })

  for (const prediction of predictions) {
    const currentGap = Math.max(0, Math.abs(catX - prediction.x) - prediction.halfWidth)
    if (currentGap < 42) urgency = Math.max(urgency, Math.max(0, 1 - prediction.time / 2.25))
  }

  for (let i = 0; i < samples; i += 1) {
    const candidate = padding + (i / (samples - 1)) * (width - padding * 2)
    let risk = Math.abs(candidate - catX) * 0.00038
    for (const prediction of predictions) {
      const gap = Math.max(0, Math.abs(candidate - prediction.x) - prediction.halfWidth)
      const timeWeight = 1 / (0.16 + prediction.time * prediction.time)
      risk += Math.exp(-gap / 34) * timeWeight * 7
    }
    risk += 0.08 * Math.abs(candidate - width / 2) / width
    if (risk < bestRisk) {
      bestRisk = risk
      bestX = candidate
    }
  }
  return { x: bestX, urgency }
}

const initials = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
const medials = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ']
const finals = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']

function breakWordApart(word: string) {
  const fragments: string[] = []
  for (const character of Array.from(word)) {
    const code = character.charCodeAt(0)
    if (code >= 0xac00 && code <= 0xd7a3) {
      const syllableIndex = code - 0xac00
      fragments.push(initials[Math.floor(syllableIndex / 588)])
      fragments.push(medials[Math.floor((syllableIndex % 588) / 28)])
      const final = finals[syllableIndex % 28]
      if (final) fragments.push(final)
    } else if (/^[a-zA-Z]$/.test(character)) {
      fragments.push(character.toUpperCase())
    }
  }
  return fragments
}

function spawnWord(word: string) {
  const fragments = breakWordApart(word)
  const size = Math.max(39, Math.min(54, width * 0.053))
  const spacing = Math.min(size * 0.78, (width - size * 2) / Math.max(1, fragments.length))
  const spread = spacing * Math.max(0, fragments.length - 1)
  const clusterX = size + spread / 2 + Math.random() * Math.max(1, width - size * 2 - spread)

  fragments.forEach((char, index) => {
    const offset = (index - (fragments.length - 1) / 2) * spacing
    const x = Math.max(size / 2, Math.min(width - size / 2, clusterX + offset + (Math.random() - 0.5) * 9))
    letters.push({
      id: nextId++,
      char,
      x,
      y: -size * (0.55 + Math.random() * 1.7) - index * 3,
      vx: (index - (fragments.length - 1) / 2) * 5 + (Math.random() - 0.5) * 48,
      vy: 10 + Math.random() * 42,
      size,
      boxWidth: size,
      angle: (Math.random() - 0.5) * 0.8,
      spin: (Math.random() - 0.5) * 4.2,
      color: colors[(nextId + index) % colors.length],
    })
  })

  makeRainBurst(clusterX, 8, Math.min(26, 8 + fragments.length * 2))
  score += 1
  scoreElement.textContent = String(score)
  scoreElement.classList.remove('bump')
  void scoreElement.offsetWidth
  scoreElement.classList.add('bump')
  playPop()
}

function normalized(value: string) {
  return value.normalize('NFC').toLocaleUpperCase('ko-KR')
}

function renderTarget(typedCount = 0, hasComposition = false) {
  targetWordElement.replaceChildren()
  Array.from(targetWord).forEach((character, index) => {
    const span = document.createElement('span')
    span.textContent = character
    if (index < typedCount) span.className = 'typed'
    else if (index === typedCount && hasComposition) span.className = 'composing'
    targetWordElement.append(span)
  })
}

function setNextWord() {
  let next = targetWord
  while (next === targetWord) next = words[Math.floor(Math.random() * words.length)]
  targetWord = next
  validInput = ''
  wordInput.value = ''
  wordChallenge.classList.remove('swap')
  void wordChallenge.offsetWidth
  wordChallenge.classList.add('swap')
  renderTarget()
}

function commonPrefixLength(value: string, target: string) {
  const inputCharacters = Array.from(normalized(value))
  const targetCharacters = Array.from(normalized(target))
  let count = 0
  while (count < inputCharacters.length && inputCharacters[count] === targetCharacters[count]) count += 1
  return count
}

function completeTarget() {
  wordChallenge.classList.remove('launch')
  void wordChallenge.offsetWidth
  wordChallenge.classList.add('launch')
  spawnWord(targetWord)
  setNextWord()
}

function evaluateInput(isComposing: boolean) {
  if (gameOver) return
  const candidate = wordInput.value.normalize('NFC')
  const candidateNormalized = normalized(candidate)
  const targetNormalized = normalized(targetWord)

  if (!started && candidate.length > 0) started = true

  if (candidateNormalized === targetNormalized) {
    renderTarget(Array.from(targetWord).length)
    if (!isComposing) completeTarget()
    return
  }

  if (targetNormalized.startsWith(candidateNormalized)) {
    validInput = candidate
    renderTarget(Array.from(candidateNormalized).length)
    return
  }

  if (isComposing) {
    renderTarget(commonPrefixLength(candidate, targetWord), true)
    return
  }

  wordInput.value = validInput
  renderTarget(Array.from(normalized(validInput)).length)
  wordChallenge.classList.remove('wrong')
  void wordChallenge.offsetWidth
  wordChallenge.classList.add('wrong')
}

function makeRainBurst(x: number, y: number, amount = 38) {
  for (let i = 0; i < amount; i += 1) {
    const angle = Math.random() * Math.PI * 2
    const speed = 45 + Math.random() * 220
    rain.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 65,
      length: 8 + Math.random() * 10,
      life: 0.75 + Math.random() * 0.65,
      maxLife: 1.4,
    })
  }
}

function collide(letter: LetterDrop, cat: ReturnType<typeof drawCat>) {
  const radiusX = letter.boxWidth * 0.46
  const radiusY = letter.size * 0.42
  const nearX = Math.max(cat.x, Math.min(letter.x, cat.x + cat.width))
  const nearY = Math.max(cat.y, Math.min(letter.y, cat.y + cat.height))
  return ((letter.x - nearX) / radiusX) ** 2 + ((letter.y - nearY) / radiusY) ** 2 < 1
}

function endGame(letter: LetterDrop) {
  gameOver = true
  impactTime = performance.now()
  letters = letters.filter((item) => item.id !== letter.id)
  makeRainBurst(letter.x, letter.y)
  hissElement.classList.add('show')
  hissElement.setAttribute('aria-hidden', 'false')
  playHiss()

  window.setTimeout(() => {
    finalScoreElement.textContent = `${Math.max(0, score - 1)}개의 단어를 피했어요.`
    gameOverElement.hidden = false
    gameOverElement.classList.add('show')
    restartButton.focus({ preventScroll: true })
  }, 720)
}

function resetGame() {
  letters = []
  rain = []
  score = 0
  elapsed = 0
  started = false
  gameOver = false
  impactTime = 0
  catX = width / 2
  catTargetX = catX
  catVelocity = 0
  catUrgency = 0
  catLean = 0
  scoreElement.textContent = '0'
  timerElement.textContent = '0.0초'
  gameOverElement.hidden = true
  gameOverElement.classList.remove('show')
  hissElement.classList.remove('show')
  hissElement.setAttribute('aria-hidden', 'true')
  composing = false
  setNextWord()
  window.setTimeout(() => wordInput.focus({ preventScroll: true }), 0)
}

let audioContext: AudioContext | null = null

function audio() {
  if (!audioContext) audioContext = new AudioContext()
  if (audioContext.state === 'suspended') void audioContext.resume()
  return audioContext
}

function playPop() {
  if (!soundOn) return
  const ctx = audio()
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(330 + Math.random() * 150, ctx.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(190, ctx.currentTime + 0.09)
  gain.gain.setValueAtTime(0.055, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1)
  oscillator.connect(gain).connect(ctx.destination)
  oscillator.start()
  oscillator.stop(ctx.currentTime + 0.11)
}

function playHiss() {
  if (!soundOn) return
  const ctx = audio()
  const length = Math.floor(ctx.sampleRate * 0.52)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) channel[i] = (Math.random() * 2 - 1) * (1 - i / length)
  const source = ctx.createBufferSource()
  const filter = ctx.createBiquadFilter()
  const gain = ctx.createGain()
  filter.type = 'highpass'
  filter.frequency.value = 1600
  gain.gain.setValueAtTime(0.13, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.52)
  source.buffer = buffer
  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start()
}

function update(delta: number) {
  if (started && !gameOver) {
    elapsed += delta
    timerElement.textContent = `${elapsed.toFixed(1)}초`
    const dodge = pickSafeTarget()
    catTargetX = dodge.x
    catUrgency += (dodge.urgency - catUrgency) * Math.min(1, delta * 12)
    const distance = catTargetX - catX
    const maxSpeed = 330 + catUrgency * 490 + Math.min(100, letters.length * 5)
    const desiredVelocity = Math.abs(distance) < 3
      ? 0
      : Math.max(-maxSpeed, Math.min(maxSpeed, distance * (5.4 + catUrgency * 2.6)))
    const responsiveness = 8 + catUrgency * 14
    catVelocity += (desiredVelocity - catVelocity) * Math.min(1, delta * responsiveness)
    catX += catVelocity * delta
    const catPadding = Math.max(42, width * 0.035)
    if (catX < catPadding || catX > width - catPadding) {
      catX = Math.max(catPadding, Math.min(width - catPadding, catX))
      catVelocity *= 0.25
    }
    const leanTarget = Math.max(-1, Math.min(1, catVelocity / Math.max(1, maxSpeed)))
    catLean += (leanTarget - catLean) * Math.min(1, delta * 14)

    for (const letter of letters) {
      letter.vy += 255 * delta
      letter.x += letter.vx * delta
      letter.y += letter.vy * delta
      letter.angle += letter.spin * delta
      if (letter.x < letter.boxWidth / 2 || letter.x > width - letter.boxWidth / 2) {
        letter.vx *= -0.72
        letter.x = Math.max(letter.boxWidth / 2, Math.min(width - letter.boxWidth / 2, letter.x))
      }
    }

    const groundY = height - Math.max(28, height * 0.07)
    const landed = letters.filter((letter) => letter.y + letter.size / 2 >= groundY)
    for (const fragment of landed) makeRainBurst(fragment.x, groundY - 3, 7)
    if (landed.length) {
      const landedIds = new Set(landed.map((letter) => letter.id))
      letters = letters.filter((letter) => !landedIds.has(letter.id))
    }
  }

  for (const drop of rain) {
    drop.vy += 410 * delta
    drop.x += drop.vx * delta
    drop.y += drop.vy * delta
    drop.life -= delta
  }
  rain = rain.filter((drop) => drop.life > 0 && drop.y < height + 40)
}

function frame(now: number) {
  const delta = Math.min(0.034, (now - lastFrame) / 1000)
  lastFrame = now
  update(delta)
  drawBackground()

  for (const letter of letters) drawLetter(letter)
  const catBounds = drawCat()
  for (const drop of rain) drawRainDrop(drop)

  if (!gameOver) {
    const hit = letters.find((letter) => collide(letter, catBounds))
    if (hit) endGame(hit)
  }

  letters = letters.filter((letter) => letter.y < height + letter.size * 1.5)
  requestAnimationFrame(frame)
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && gameOver) {
    resetGame()
    return
  }
  if (event.key === 'Enter') event.preventDefault()
  if (!gameOver && !event.metaKey && !event.ctrlKey && !event.altKey && event.key !== 'Enter') {
    wordInput.focus({ preventScroll: true })
  }
})

wordInput.addEventListener('compositionstart', () => { composing = true })
wordInput.addEventListener('compositionend', () => {
  composing = false
  evaluateInput(false)
})
wordInput.addEventListener('input', (event) => {
  evaluateInput((event as InputEvent).isComposing || composing)
})
stage.addEventListener('pointerdown', (event) => {
  if ((event.target as HTMLElement).closest('button')) return
  wordInput.focus({ preventScroll: true })
})

restartButton.addEventListener('click', resetGame)
soundButton.addEventListener('click', () => {
  soundOn = !soundOn
  soundButton.setAttribute('aria-pressed', String(soundOn))
  soundButton.setAttribute('aria-label', soundOn ? '효과음 끄기' : '효과음 켜기')
  soundButton.lastChild!.textContent = soundOn ? ' 효과음 켜짐' : ' 효과음 꺼짐'
})

window.addEventListener('resize', resizeCanvas)
resizeCanvas()
setNextWord()
wordInput.focus({ preventScroll: true })
requestAnimationFrame(frame)
