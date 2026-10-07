import './guestbook-cat.css'

export function mountDailyCat() {
  const panel = document.createElement('section')
  panel.className = 'daily-cat'
  panel.setAttribute('aria-label', '오늘의 고양이')
  panel.innerHTML = `
    <div class="cat-title">오늘의 고양이.exe <span aria-hidden="true">♡ &nbsp;— □</span></div>
    <div class="cat-body">
      <div class="cat-photo"><span class="cat-placeholder" aria-hidden="true"> /\_/\\<br>( o.o )<br> &gt; ♡ &lt;</span></div>
      <div class="cat-copy"><small>YOUR DAILY DOSE OF MEOW</small><h2>잠깐, 고양이 보고 갈래?</h2>
        <p class="cat-status" role="status" aria-live="polite">버튼을 누르면 랜덤 고양이가 놀러 와요.</p>
        <button class="cat-next" type="button">고양이 만나기 ♡</button>
        <a href="https://cataas.com/" target="_blank" rel="noopener noreferrer">Photos by CATAAS ↗</a>
      </div>
    </div>`
  document.querySelector('#minimi-plaza')!.before(panel)
  const photo = panel.querySelector<HTMLDivElement>('.cat-photo')!
  const button = panel.querySelector<HTMLButtonElement>('.cat-next')!
  const status = panel.querySelector<HTMLParagraphElement>('.cat-status')!
  button.addEventListener('click', () => {
    if (button.disabled) return
    button.disabled = true
    photo.setAttribute('aria-busy', 'true')
    status.textContent = '고양이가 오는 중… 잠깐만 기다려줘 ♡'
    const image = new Image()
    image.alt = 'CATAAS에서 놀러 온 랜덤 고양이 사진'
    image.referrerPolicy = 'no-referrer'
    let finished = false
    const finish = (success: boolean) => {
      if (finished) return
      finished = true
      window.clearTimeout(timeout)
      image.onload = image.onerror = null
      button.disabled = false
      photo.setAttribute('aria-busy', 'false')
      if (success) {
        photo.replaceChildren(image)
        status.textContent = '오늘도 귀여움 충전 완료. 냥 ♡'
        button.textContent = '다른 고양이 ↻'
      } else {
        image.removeAttribute('src')
        status.textContent = '고양이가 길을 잃었나 봐요. 다시 불러볼까요?'
        button.textContent = '다시 불러보기 ↻'
      }
    }
    const timeout = window.setTimeout(() => finish(false), 15000)
    image.onload = () => finish(true)
    image.onerror = () => finish(false)
    image.src = `https://cataas.com/cat?width=480&v=${crypto.randomUUID()}`
  })
}
