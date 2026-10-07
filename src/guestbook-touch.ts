import './guestbook-touch.css'

export function mountPaperTouch(board: HTMLElement) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  let active: HTMLElement | null = null
  const reset = () => {
    if (!active) return
    active.classList.remove('paper-touch')
    for (const key of ['--paper-x', '--paper-y', '--paper-press']) active.style.removeProperty(key)
    active = null
  }
  const controls = 'button,a,input,textarea,summary,label,select'
  board.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || reduced.matches) return
    const target = e.target as HTMLElement
    const note = target.closest<HTMLElement>('.note')
    if (!note || target.closest(controls)) { reset(); return }
    if (note !== active) { reset(); active = note }
    const rect = note.getBoundingClientRect()
    const x = Math.max(-1, Math.min(1, (e.clientX - rect.left) / rect.width * 2 - 1))
    const y = Math.max(-1, Math.min(1, (e.clientY - rect.top) / rect.height * 2 - 1))
    note.classList.add('paper-touch')
    note.style.setProperty('--paper-x', `${-y * 2.5}deg`)
    note.style.setProperty('--paper-y', `${x * 2.5}deg`)
  })
  board.addEventListener('pointerdown', e => {
    if (e.button !== 0 || reduced.matches || (e.target as HTMLElement).closest(controls)) return
    const note = (e.target as HTMLElement).closest<HTMLElement>('.note')
    if (note) { if (active !== note) reset(); active = note; note.style.setProperty('--paper-press', '.985') }
  })
  board.addEventListener('pointerleave', reset)
  window.addEventListener('pointerup', reset)
  window.addEventListener('pointercancel', reset)
  window.addEventListener('blur', reset)
  reduced.addEventListener('change', reset)
}
