import './hub.css'

type Example = {
  id: string
  number: string
  title: string
  shortTitle: string
  path: string
  color: string
}

const examples: Example[] = [
  { id: 'anyma', number: '01', title: 'Anyma Performer', shortTitle: 'Anyma', path: `${import.meta.env.BASE_URL}anyma.html`, color: '#6ee7ff' },
  { id: 'typing-cat', number: '02', title: '타닥타닥 냥이', shortTitle: 'Typing Cat', path: `${import.meta.env.BASE_URL}game.html`, color: '#65d7cb' },
  { id: 'lucky-claw', number: '03', title: 'Lucky Claw', shortTitle: 'Claw', path: `${import.meta.env.BASE_URL}claw.html`, color: '#ff74d4' },
  { id: 'bakery', number: '05', title: '냥빵 공장', shortTitle: 'Bakery', path: `${import.meta.env.BASE_URL}bakery.html`, color: '#f4b65f' },
  { id: 'maeumjeol', number: '06', title: '마음절', shortTitle: 'Maeumjeol', path: `${import.meta.env.BASE_URL}practice/index.html`, color: '#83d39c' },
  { id: 'lemonade', number: '07', title: 'Lemonade', shortTitle: 'Lemonade', path: `${import.meta.env.BASE_URL}lemonade.html`, color: '#edf43e' },
  { id: 'water-touch', number: '08', title: 'WaterTouch', shortTitle: 'WaterTouch', path: `${import.meta.env.BASE_URL}water.html`, color: '#72e8ff' },
  { id: 'balloon', number: '09', title: 'Balloon', shortTitle: 'Balloon', path: `${import.meta.env.BASE_URL}balloon.html`, color: '#ff79b7' },
  { id: 'air-pottery', number: '10', title: '공중 도예', shortTitle: 'Air Pottery', path: `${import.meta.env.BASE_URL}air-pottery.html`, color: '#e99a69' },
  { id: 'asmr-lab', number: '11', title: 'ASMR Lab', shortTitle: 'ASMR Lab', path: `${import.meta.env.BASE_URL}asmr.html`, color: '#a7ffdc' },
  { id: 'type-vessel', number: '12', title: 'Type Vessel', shortTitle: 'Type Vessel', path: `${import.meta.env.BASE_URL}type-vessel.html`, color: '#8b8cfa' },
  { id: 'rubber-human', number: '13', title: '고무 인간', shortTitle: '고무 인간', path: `${import.meta.env.BASE_URL}rubber-human.html`, color: '#d4f57a' },
  { id: 'shampoo', number: '14', title: 'Shampoo', shortTitle: 'Shampoo', path: `${import.meta.env.BASE_URL}shampoo.html`, color: '#b9e4ec' },
  { id: 'doodleface', number: '15', title: 'DoodleFace', shortTitle: 'DoodleFace', path: `${import.meta.env.BASE_URL}doodleface.html`, color: '#ff885e' },
  { id: 'prism-face', number: '16', title: 'Prism Face', shortTitle: 'Prism Face', path: `${import.meta.env.BASE_URL}prism-face.html`, color: '#c5beef' },
  { id: 'little-universe', number: '17', title: '입을 벌리면 작은 우주', shortTitle: 'Little Universe', path: `${import.meta.env.BASE_URL}little-universe.html`, color: '#abbdec' },
  { id: 'face-match', number: '18', title: 'NODD Face Match', shortTitle: 'NODD', path: `${import.meta.env.BASE_URL}face-match.html`, color: '#ff4458' },
  { id: 'face-paint', number: '19', title: '표정으로 그리는 그림', shortTitle: 'Face Paint', path: `${import.meta.env.BASE_URL}face-paint.html`, color: '#f15c46' },
  { id: 'paper-face', number: '20', title: 'Paper Face', shortTitle: 'Paper Face', path: `${import.meta.env.BASE_URL}paper-face.html`, color: '#f1e4a4' },
  { id: 'season-forest', number: '21', title: '계절의 숲', shortTitle: '계절의 숲', path: `${import.meta.env.BASE_URL}season-forest.html`, color: '#9cbf83' },
]

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main class="lab-shell">
    <header class="lab-header">
      <a class="lab-brand" href="${import.meta.env.BASE_URL}" aria-label="첫 번째 예제로 이동">
        <span class="lab-mark" aria-hidden="true"><i></i><i></i><i></i></span>
        <span><strong>INTERACTIVE</strong><small>LAB · 01—21</small></span>
      </a>

      <nav class="example-tabs" role="tablist" aria-label="인터랙티브 예제 선택">
        ${examples.map((example) => `
          <button class="example-tab" id="tab-${example.id}" type="button" role="tab" aria-controls="example-frame" aria-selected="false" tabindex="-1" data-example="${example.id}" style="--tab-color:${example.color}">
            <span>${example.number}</span><strong>${example.shortTitle}</strong>
          </button>
        `).join('')}
      </nav>

      <a class="guestbook-link" href="${import.meta.env.BASE_URL}guestbook.html">방명록 <span aria-hidden="true">↗</span></a>
      <a class="open-example" id="open-example" href="${import.meta.env.BASE_URL}anyma.html" target="_blank" rel="noopener" aria-label="현재 예제를 새 창에서 열기">
        <span>OPEN</span><b aria-hidden="true">↗</b>
      </a>
    </header>

    <section class="example-viewport" id="example-panel" role="tabpanel" aria-labelledby="tab-anyma">
      <div class="frame-loading" id="frame-loading" aria-live="polite">
        <span></span><p><b id="loading-number">01</b> LOADING EXPERIMENT</p>
      </div>
      <iframe id="example-frame" title="Anyma Performer 인터랙티브 예제" allow="camera; microphone; autoplay; fullscreen" allowfullscreen></iframe>
    </section>
  </main>
`

const frame = document.querySelector<HTMLIFrameElement>('#example-frame')!
const panel = document.querySelector<HTMLElement>('#example-panel')!
const loading = document.querySelector<HTMLElement>('#frame-loading')!
const loadingNumber = document.querySelector<HTMLElement>('#loading-number')!
const openExample = document.querySelector<HTMLAnchorElement>('#open-example')!
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.example-tab'))
let activeId = ''

function exampleFromHash() {
  const id = location.hash.replace(/^#/, '')
  return examples.find((example) => example.id === id) ?? examples[0]
}

function selectExample(example: Example, updateHash = true) {
  if (activeId === example.id) return
  // Give the outgoing same-origin example a synchronous teardown opportunity.
  try { frame.contentWindow?.dispatchEvent(new Event('interactive:dispose')) }
  catch { /* An example may have navigated cross-origin; navigation still replaces it. */ }
  activeId = example.id
  loading.classList.remove('hidden')
  loadingNumber.textContent = example.number
  panel.style.setProperty('--active-color', example.color)
  panel.setAttribute('aria-labelledby', `tab-${example.id}`)
  frame.title = `${example.title} 인터랙티브 예제`
  frame.src = example.path
  openExample.href = example.path
  openExample.setAttribute('aria-label', `${example.title} 예제를 새 창에서 열기`)

  tabs.forEach((tab) => {
    const selected = tab.dataset.example === example.id
    tab.setAttribute('aria-selected', String(selected))
    tab.tabIndex = selected ? 0 : -1
    if (selected) tab.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })

  if (updateHash) history.replaceState(null, '', `#${example.id}`)
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => {
    const example = examples.find((item) => item.id === tab.dataset.example)
    if (example) selectExample(example)
  })
  tab.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    let nextIndex = index
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = tabs.length - 1
    tabs[nextIndex].focus()
    selectExample(examples[nextIndex])
  })
})

frame.addEventListener('load', () => loading.classList.add('hidden'))
window.addEventListener('hashchange', () => selectExample(exampleFromHash(), false))
document.querySelector<HTMLAnchorElement>('.lab-brand')!.addEventListener('click', (event) => {
  event.preventDefault()
  selectExample(examples[0])
})

selectExample(exampleFromHash(), false)
