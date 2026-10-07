import './guestbook-music.css'
import { mountCDSwap } from './guestbook-cd'

type Controller = { destroy(): void; addListener(event: string, callback: (event: { data: { isPaused: boolean; isBuffering: boolean; position: number; duration: number } }) => void): void }
type EmbedAPI = { createController(element: HTMLElement, options: { uri: string; width: string; height: number }, callback: (controller: Controller) => void): void }
let apiPromise: Promise<EmbedAPI> | undefined
function getEmbedAPI() {
  if (apiPromise) return apiPromise
  apiPromise = new Promise<EmbedAPI>((resolve, reject) => {
    const script = document.createElement('script')
    const timer = window.setTimeout(() => { script.remove(); apiPromise = undefined; reject(new Error('Spotify timeout')) }, 12000)
    ;(window as Window & { onSpotifyIframeApiReady?: (api: EmbedAPI) => void }).onSpotifyIframeApiReady = api => { clearTimeout(timer); resolve(api) }
    script.src = 'https://open.spotify.com/embed/iframe-api/v1'
    script.onerror = () => { clearTimeout(timer); script.remove(); apiPromise = undefined; reject(new Error('Spotify unavailable')) }
    document.head.append(script)
  })
  return apiPromise
}

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
  const deck = document.createElement('div')
  deck.className = 'bgm-deck'
  deck.innerHTML = `<span class="bgm-deck-label">PORTABLE CD PLAYER · 01</span><div class="bgm-disc-well" aria-hidden="true"><div class="bgm-disc"><span class="bgm-disc-print">MY LITTLE SOUNDTRACK<br>♡ &nbsp; COMPACT DISC &nbsp; ♡</span><span class="bgm-disc-hub"></span></div></div><div class="bgm-lcd"><span class="bgm-track-number">CD —</span><b class="bgm-track-name">Choose your soundtrack</b><span class="bgm-track-artist">a little music, a little magic</span></div><span class="bgm-deck-caption">✧ DREAM SOUND SYSTEM ✧</span>`
  panel.querySelector('.bgm-body')!.prepend(deck)
  panel.querySelector('.bgm-title b')!.innerHTML = '♫ CD player.exe <small>my little soundtrack</small>'
  const trackNumber = panel.querySelector<HTMLElement>('.bgm-track-number')!
  const trackName = panel.querySelector<HTMLElement>('.bgm-track-name')!
  const trackArtist = panel.querySelector<HTMLElement>('.bgm-track-artist')!
  panel.querySelector('.bgm-notice')!.textContent += ' · CD와 음향 바는 재생 상태에 맞춘 장식 효과이며 실제 주파수 분석은 아니에요.'
  const player = panel.querySelector<HTMLElement>('.bgm-player')!
  const transport = document.createElement('div')
  transport.className = 'bgm-transport'
  transport.innerHTML = `<div class="bgm-equalizer" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => `<i style="--speed:${.45 + (i * 7 % 11) / 15}s;--delay:-${i * .17}s;--peak:${.4 + (i * 3 % 7) / 12}"></i>`).join('')}</div><span class="bgm-eq-label">STANDBY</span>`
  const playerArea = document.createElement('div')
  playerArea.className = 'bgm-player-area'
  player.before(playerArea)
  playerArea.append(player, transport)
  const eqLabel = transport.querySelector<HTMLElement>('.bgm-eq-label')!
  const setPlaying = (playing: boolean, buffering = false) => {
    panel.classList.toggle('is-playing', playing)
    eqLabel.textContent = buffering ? 'BUFFERING' : playing ? 'ON AIR' : 'STANDBY'
  }
  player.querySelector('.bgm-placeholder')!.firstChild!.textContent = '이 노래… 내 마음 대신이야。'
  const placeholder = player.innerHTML
  const close = panel.querySelector<HTMLButtonElement>('.bgm-close')!
  const status = panel.querySelector<HTMLElement>('.bgm-status')!
  const link = panel.querySelector<HTMLAnchorElement>('.bgm-link')!
  const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-song]'))
  let selected = -1
  let controller: Controller | undefined
  let generation = 0
  buttons.forEach((button, index) => button.addEventListener('click', async () => {
    if (selected === index) return
    selected = index
    const request = ++generation
    controller?.destroy(); controller = undefined
    setPlaying(false)
    const song = songs[index]
    panel.classList.add('has-disc')
    trackNumber.textContent = `CD 0${index + 1}`
    trackName.textContent = song.title
    trackArtist.textContent = song.artist
    buttons.forEach((b,i) => b.setAttribute('aria-pressed', String(i === index)))
    player.textContent = 'Spotify 연결 중…'
    status.textContent = `${song.artist} · ${song.title} 선택됨 — 플레이어의 ▶로 재생`
    link.href = `https://open.spotify.com/track/${song.id}`; link.hidden = false
    close.disabled = false
    try {
      const api = await getEmbedAPI()
      if (request !== generation) return
      const target = document.createElement('div')
      player.replaceChildren(target)
      api.createController(target, { uri: `spotify:track:${song.id}`, width: '100%', height: 152 }, embed => {
        if (request !== generation) { embed.destroy(); return }
        controller = embed
        embed.addListener('playback_update', event => {
          if (request !== generation) return
          const d = event.data
          setPlaying(!d.isPaused && !d.isBuffering && !(d.duration > 0 && d.position >= d.duration), d.isBuffering)
        })
      })
    } catch {
      if (request !== generation) return
      const frame = document.createElement('iframe')
      frame.src = `https://open.spotify.com/embed/track/${song.id}?theme=0`
      frame.title = `${song.artist} — ${song.title} Spotify 플레이어`
      frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'
      frame.height = '152'; frame.width = '100%'
      player.replaceChildren(frame)
      status.textContent = '기본 플레이어로 연결했어요. 음향 바 연동은 잠시 사용할 수 없어요.'
    }
  }))
  close.addEventListener('click', () => {
    generation++; controller?.destroy(); controller = undefined
    setPlaying(false)
    player.innerHTML = placeholder; selected = -1; close.disabled = true; link.hidden = true
    panel.classList.remove('has-disc')
    trackNumber.textContent = 'CD —'
    trackName.textContent = 'Choose your soundtrack'
    trackArtist.textContent = 'a little music, a little magic'
    buttons.forEach(b => b.setAttribute('aria-pressed', 'false'))
    status.textContent = '플레이어를 닫았어요. 곡을 선택하면 다시 열립니다.'
  })
  mountCDSwap(panel)
}
