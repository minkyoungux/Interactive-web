import './guestbook-music.css'

const songs = [
  { artist: 'ILLIT', title: 'Magnetic', id: '1aKvZDoLGkNMxoRYgkckZG' },
  { artist: 'TUIDE', title: 'SUN KISS', id: '7Jpb9OejYYIwsBIVQwceRy' },
  { artist: 'NewJeans', title: 'Ditto', id: '3r8RuvgbX9s7ammBn07D3W' },
]

export function mountMusic() {
  const panel = document.createElement('section')
  panel.className = 'bgm-window'; panel.setAttribute('aria-label', '미니홈피 배경음악')
  panel.innerHTML = `<div class="bgm-title"><b>♫ BGM.exe <small>my little soundtrack</small></b><button type="button" class="bgm-close" disabled>음악 닫기 ×</button></div><div class="bgm-body"><div class="bgm-tracks" aria-label="곡 선택">${songs.map((s,i) => `<button type="button" data-song="${i}" aria-pressed="false"><span>0${i+1} ♡ ${s.artist}</span><b>${s.title}</b></button>`).join('')}</div><div class="bgm-player"><p class="bgm-placeholder">좋아하는 곡을 골라줘 ♡<br><small>Spotify 플레이어가 열리면 ▶를 눌러주세요.</small></p></div><div class="bgm-foot"><span class="bgm-status" role="status">곡을 선택하면 Spotify에 연결됩니다.</span><a class="bgm-link" target="_blank" rel="noopener noreferrer" hidden>Spotify에서 열기 ↗</a></div><p class="bgm-notice">자동 재생되지 않아요 · 재생 환경에 따라 로그인 또는 미리듣기가 제공될 수 있어요.</p></div>`
  document.querySelector('.intro')!.after(panel)
  const player = panel.querySelector<HTMLElement>('.bgm-player')!
  const placeholder = player.innerHTML
  const close = panel.querySelector<HTMLButtonElement>('.bgm-close')!
  const status = panel.querySelector<HTMLElement>('.bgm-status')!
  const link = panel.querySelector<HTMLAnchorElement>('.bgm-link')!
  const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-song]'))
  let selected = -1
  buttons.forEach((button, index) => button.addEventListener('click', () => {
    if (selected === index) return
    selected = index
    const song = songs[index]
    buttons.forEach((b,i) => b.setAttribute('aria-pressed', String(i === index)))
    const frame = document.createElement('iframe')
    frame.src = `https://open.spotify.com/embed/track/${song.id}?theme=0`
    frame.title = `${song.artist} — ${song.title} Spotify 플레이어`
    frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'
    frame.allowFullscreen = true; frame.height = '152'; frame.width = '100%'
    // Replacing the frame also stops the previous song; never play two embeds together.
    player.replaceChildren(frame)
    status.textContent = `${song.artist} · ${song.title} 선택됨 — 플레이어의 ▶로 재생`
    link.href = `https://open.spotify.com/track/${song.id}`; link.hidden = false
    close.disabled = false
  }))
  close.addEventListener('click', () => {
    player.innerHTML = placeholder; selected = -1; close.disabled = true; link.hidden = true
    buttons.forEach(b => b.setAttribute('aria-pressed', 'false'))
    status.textContent = '플레이어를 닫았어요. 곡을 선택하면 다시 열립니다.'
  })
}
