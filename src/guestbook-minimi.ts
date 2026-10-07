import './guestbook-minimi.css'

export function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff
}

export function minimi(seed: number): HTMLElement {
  let state = seed >>> 0
  const pick = (n: number) => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return Math.floor(state / 4294967296 * n) }
  const skin = ['#ffe0c4', '#efbc96', '#cb926c', '#895b49'][pick(4)]
  const hair = ['#473451', '#945940', '#f4ce74', '#e8aed0', '#88bbc9', '#aca2dd'][pick(6)]
  const outfit = ['#f28fbc', '#85ccdf', '#b9a0e4', '#a6d995', '#f1ce78', '#657dd0'][pick(6)]
  const style = pick(4), accessory = pick(4), eyes = pick(3)
  const stats = ['STR', 'DEX', 'INT', 'LUK'].map(label => `${label} ${4 + pick(10)}`)
  const hairShapes = [
    '<path d="M17 16h30v12H17zM13 24h7v25h-7zM44 24h7v25h-7z"/>',
    '<path d="M16 18h32v12H16zM20 12h8v10h-8zM32 10h10v12H32z"/>',
    '<path d="M17 17h30v12H17zM10 22h9v19h-9zM45 22h9v19h-9z"/>',
    '<path d="M15 19h34v13H15zM19 14h26v8H19zM15 29h6v9h-6z"/>',
  ]
  const accessories = [
    '', '<path fill="#fff1a8" d="M40 12h4v4h4v4h-4v4h-4v-4h-4v-4h4z"/>',
    '<path fill="#f98fba" d="M14 14h8v4h5v-4h8v10h-8v-3h-5v3h-8z"/>',
    '<path fill="#d6eaff" d="M17 29h12v8H17zM35 29h12v8H35z"/><path stroke="#655475" stroke-width="2" fill="none" d="M17 29h12v8H17zM35 29h12v8H35zM29 32h6"/>',
  ]
  const face = eyes === 0 ? '<path d="M24 30h3v5h-3zM37 30h3v5h-3z"/>' : eyes === 1 ? '<path d="M23 32h5v2h-5zM36 32h5v2h-5z"/>' : '<path d="M24 30h3v5h-3zM36 32h5v2h-5z"/>'
  const root = document.createElement('div')
  root.className = 'minimi'
  root.dataset.seed = String(seed)
  // All SVG fragments and colors are internal constants, never visitor markup.
  root.innerHTML = `<svg viewBox="0 0 64 76" role="img" aria-label="랜덤 픽셀 미니미" shape-rendering="crispEdges"><ellipse cx="32" cy="70" rx="23" ry="4" fill="#70558d" opacity=".15"/><path fill="#534360" d="M22 58h8v11H20v-5h2zM34 58h8v6h2v5H34z"/><path fill="${outfit}" d="M22 43h20v19H22zM17 46h5v11h-5zM42 46h5v11h-5z"/><path fill="${skin}" d="M16 54h6v6h-6zM42 54h6v6h-6zM27 39h10v8H27zM18 22h28v17h-4v5H22v-5h-4z"/><g fill="${hair}">${hairShapes[style]}</g><g fill="#423249">${face}</g><path fill="#ea95a0" d="M20 36h6v3h-6zM38 36h6v3h-6z"/><path fill="#ac626d" d="M29 38h6v2h-6z"/><path fill="#fff4dc" d="M27 48h10v3H27zM30 51h4v6h-4z"/>${accessories[accessory]}</svg><div class="minimi-stats">${stats.map(s => `<span>${s}</span>`).join('')}</div>`
  return root
}

export function mountMinimi(host: HTMLElement, changed: () => void) {
  let seed = randomSeed()
  host.innerHTML = '<div class="minimi-title">♡ My Minimi.exe <span>CHARACTER MAKER</span></div><div class="minimi-preview"></div><button type="button" class="minimi-roll">⚄ 주사위 돌리기</button><p class="minimi-hint" aria-live="polite">마음에 들 때까지! 이 미니미가 메모와 함께 남아요.</p>'
  const preview = host.querySelector('.minimi-preview')!
  const button = host.querySelector<HTMLButtonElement>('button')!
  const render = () => preview.replaceChildren(minimi(seed))
  render()
  button.addEventListener('click', () => {
    seed = randomSeed(); render(); changed()
    preview.classList.remove('is-rolling')
    void (preview as HTMLElement).offsetWidth
    preview.classList.add('is-rolling')
    host.querySelector('.minimi-hint')!.textContent = '새로운 나 등장! 마음에 들면 아래 작성하기를 눌러줘 ♡'
  })
  return () => seed
}
