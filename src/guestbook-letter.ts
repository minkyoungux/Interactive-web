const letters = [
  '오늘 별일 없었어도… 잘 버틴 거야。',
  '답장이 없어도 괜찮아… 그냥 네 편이라고 말하고 싶었어。',
  '퇴근길엔 회사에 두고 와… 오늘의 무거운 마음도。',
  '너의 속도로 걸어도 돼… 여기선 아무도 재촉 안 해♡',
  '월급 말고도… 널 웃게 할 일이 생겼으면 좋겠다。',
  '내일의 걱정은 내일의 너에게… 오늘은 좀 쉬어☆',
]
export function mountSecretLetter(scene: HTMLElement) {
  const letter = document.createElement('button')
  letter.type = 'button'; letter.className = 'plaza-letter'; letter.hidden = true
  letter.textContent = '✉ 몰래 온 쪽지'; letter.setAttribute('aria-haspopup', 'dialog')
  scene.append(letter)
  const dialog = document.createElement('dialog')
  dialog.className = 'secret-letter-dialog'
  dialog.innerHTML = '<div class="window-title">To. 오늘의 너…♡</div><p></p><small>광장에서 보내는 작은 응원 · 자동 쪽지</small><button type="button">읽었어… 날려 보내기 ↗</button>'
  document.body.append(dialog)
  let elapsed = 0, visible = false, opened = false, last = -1, leaving: number | undefined
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting })
  observer.observe(scene)
  const timer = window.setInterval(() => {
    if (!visible || document.hidden || opened || !letter.hidden) return
    elapsed++
    if (elapsed >= 12) { letter.hidden = false; elapsed = 0 }
  }, 1000)
  letter.onclick = () => {
    if (opened) return
    let index = Math.floor(Math.random() * (letters.length - 1))
    if (index >= last && last >= 0) index++
    last = index
    dialog.querySelector('p')!.textContent = letters[index]
    opened = true; dialog.showModal()
  }
  const close = () => dialog.close()
  dialog.querySelector('button')!.onclick = close
  dialog.addEventListener('close', () => {
    letter.textContent = '➤'; letter.classList.add('flying'); letter.disabled = true
    leaving = window.setTimeout(() => {
      letter.hidden = true; letter.disabled = false; letter.classList.remove('flying')
      letter.textContent = '✉ 몰래 온 쪽지'; elapsed = -25; opened = false
    }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 850)
  })
  window.addEventListener('pagehide', () => { clearInterval(timer); clearTimeout(leaving); observer.disconnect() }, { once: true })
}
