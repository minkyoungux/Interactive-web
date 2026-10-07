import './guestbook-minimi.css'

const boySeeds = [2147483600, 2147483601, 2147483602]
export function randomSeed(boysOnly = false) {
  // Small catalogue IDs keep new selections stable; older random seeds retain their trio mapping.
  const catalogue = boysOnly ? boySeeds : [0,1,2,3,4,5,6,7,...boySeeds]
  return catalogue[crypto.getRandomValues(new Uint32Array(1))[0] % catalogue.length]
}

export function minimi(seed: number): HTMLElement {
  let state = seed >>> 0
  const pick = (n: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return Math.floor(state / 4294967296 * n) }
  // Advance the original six appearance draws so saved ability scores stay stable.
  for (const n of [4,6,6,4,4,3]) pick(n)
  const stats = ['STR', 'DEX', 'INT', 'LUK'].map(label => `${label} ${4 + pick(10)}`)
  const root = document.createElement('div')
  root.className = 'minimi'
  root.dataset.seed = String(seed)
  const boy = boySeeds.indexOf(seed)
  const look = boy >= 0 ? 8 + boy : seed >= 0 && seed < 8 ? seed : (seed >>> 0) % 3
  const labels = ['긴 머리 · 핑크 카디건', '단발 · 하늘색 후드', '양갈래 · 라벤더 리본', '데이지 · 민트 가디건', '땋은 머리 · 데님 멜빵', '파란 리본 · 세일러', '안경 · 피치 후드', '베레모 · 라일락 원피스', '남캐 · 검정 머리와 데님 재킷', '남캐 · 안경과 민트 줄무늬 니트', '남캐 · 헤드폰과 라벤더 후드']
  const crops = ['45 145 435 750', '545 145 400 750', '995 145 515 750']
  const files = ['mint', 'denim', 'navy', 'peach', 'lilac', 'boy-denim', 'boy-knit', 'boy-headphones']
  root.dataset.look = String(look)
  // Viewport crops the approved sheet without redrawing its characters.
  const sprite = look < 3
    ? `<svg width="515" height="750" viewBox="${crops[look]}" overflow="hidden"><image href="${import.meta.env.BASE_URL}minimi/selected-trio-v1.png" width="1536" height="1024" /></svg>`
    : `<svg width="515" height="750" viewBox="240 70 800 1160" overflow="hidden"><image href="${import.meta.env.BASE_URL}minimi/${files[look - 3]}-v1.png" width="1280" height="1280" /></svg>`
  root.innerHTML = `<svg class="minimi-selected-art" viewBox="0 0 515 750" role="img" aria-label="${labels[look]}">${sprite}</svg><div class="minimi-stats">${stats.map(s => `<span>${s}</span>`).join('')}</div>`
  return root
}

export function mountMinimi(host: HTMLElement, changed: () => void) {
  let seed = randomSeed()
  host.innerHTML = '<div class="minimi-title">♡ My Minimi.exe <span>CHARACTER MAKER</span></div><div class="minimi-preview"></div><button type="button" class="minimi-roll">⚄ 주사위 돌리기</button><p class="minimi-hint" aria-live="polite">마음에 들 때까지! 이 미니미가 메모와 함께 남아요.</p>'
  const preview = host.querySelector('.minimi-preview')!
  const button = host.querySelector<HTMLButtonElement>('button')!
  const render = (value = seed) => preview.replaceChildren(minimi(value))
  const dice = document.createElement('span'); dice.className = 'minimi-dice'; dice.textContent = '⚄'; dice.setAttribute('aria-hidden', 'true')
  button.replaceChildren(dice, document.createTextNode(' 주사위 돌리기'))
  let rolling = false, timer = 0
  const filter = document.createElement('select')
  filter.setAttribute('aria-label', '미니미 뽑기 종류')
  filter.innerHTML = '<option value="all">전체 미니미 · 11종</option><option value="boys">새 남캐만 · 3종</option>'
  filter.style.cssText = 'width:100%;padding:7px;margin:8px 0;background:#f6eafa;color:#65507b;border:2px inset white'
  button.before(filter)
  filter.addEventListener('change', () => { seed = randomSeed(filter.value === 'boys'); render(); changed() })
  render()
  button.addEventListener('click', () => {
    if (rolling) return
    rolling = true; button.disabled = true; filter.disabled = true; host.setAttribute('aria-busy', 'true')
    preview.classList.add('is-rolling')
    button.classList.add('is-rolling')
    const hint = host.querySelector('.minimi-hint')!
    hint.textContent = '데굴데굴… 어떤 내가 나올까?'
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    let step = 0
    const finish = () => {
      const previousSeed = seed
      do { seed = randomSeed(filter.value === 'boys') } while (seed === previousSeed)
      render(); changed()
      rolling = false; button.disabled = false; filter.disabled = false; host.setAttribute('aria-busy', 'false')
      preview.classList.remove('is-rolling'); button.classList.remove('is-rolling')
      dice.textContent = ['⚀','⚁','⚂','⚃','⚄','⚅'][seed % 6]
      hint.textContent = '짜잔! 새로운 나 등장 ♡ 이 모습으로 메모를 남겨봐!'
    }
    const tumble = () => {
      if (reduced || step >= 8) { finish(); return }
      render(randomSeed(filter.value === 'boys')); dice.textContent = ['⚀','⚁','⚂','⚃','⚄','⚅'][step % 6]
      timer = window.setTimeout(tumble, 65 + step++ * 22)
    }
    tumble()
  })
  window.addEventListener('pagehide', () => clearTimeout(timer), { once: true })
  return () => seed
}
