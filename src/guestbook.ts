import { createClient } from '@supabase/supabase-js'
import { supabaseUrl as url, supabasePublishableKey as key } from './supabase-config'
import './guestbook.css'
import { mountStickers } from './guestbook-stickers'
import { createReplies } from './guestbook-replies'
import { minimi, mountMinimi } from './guestbook-minimi'
import { mountPlaza } from './guestbook-plaza'
import { mountPaperTouch } from './guestbook-touch'
import { mountStardust } from './guestbook-stardust'
import { mountMusic } from './guestbook-music'

const colors = ['butter', 'rose', 'mint', 'sky', 'lavender'] as const
const colorNames = ['버터 옐로', '로즈 핑크', '민트', '하늘색', '라벤더']
type Entry = { id: string; author: string; message: string; color: string; created_at: string; minimi_seed?: number | null }
const pageSize = 30
const fields = '*'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="guest-header">
    <a class="guest-brand" href="${import.meta.env.BASE_URL}"><span class="brand-symbol" aria-hidden="true">▦</span><span>Interactive Lab<small>Guestbook Explorer</small></span></a>
    <a class="back-link" href="${import.meta.env.BASE_URL}">작품으로 돌아가기 <span aria-hidden="true">↗</span></a>
  </header>
  <main>
    <section class="intro">
      <div class="planet" aria-hidden="true"><span>✦</span></div>
      <span class="desktop-star star-one" aria-hidden="true">✦</span><span class="desktop-star star-two" aria-hidden="true">✧</span>
      <div class="hero-copy"><p class="eyebrow">★ WELCOME TO MY LITTLE HOMEPAGE ★</p>
      <h1>GUEST<br><span>BOOK</span><em>Club!</em><span class="sr-only">방명록</span></h1>
      <p class="intro-copy">인터넷 어딘가에서 만난 우리.<br>그냥 가기 없기! 방명록에 흔적 남겨줘 ♡</p>
      <a class="hero-write" href="#guest-name">➜ Click here to leave a note!</a></div>
      <div class="welcome-window"><div class="window-title">Welcome.exe <span class="window-dots" aria-hidden="true">— □ ×</span></div>
        <div class="window-menu" aria-hidden="true">File&nbsp;&nbsp; Edit&nbsp;&nbsp; View&nbsp;&nbsp; Favorites</div>
        <div class="welcome-screen"><div class="pixel-computer" aria-hidden="true"><div class="monitor"><span>♥</span></div><div class="computer-base"></div></div><b>You've got a visitor!</b><p>작은 인사 한 줄도 환영합니다.</p><span class="online-badge">● YOU ARE NOW CONNECTED</span></div>
        <div class="window-status">♡ Best viewed with an open heart.</div>
      </div>
      <div class="mini-window" aria-hidden="true"><div class="window-title">My mood today <span>×</span></div><p>100% <span>ONLINE</span></p><div class="progress-blocks"></div></div>
      <div class="dream-strip"><span>✦ HELLO, WORLD!</span><span>방명록에 오신 것을 환영합니다 ♡</span><span>MAKE YOURSELF AT HOME ✦</span></div>
    </section>
    <div class="guest-layout">
      <aside class="composer">
        <div class="compose-heading"><span>▤ Sign Guestbook</span><span class="window-dots" aria-hidden="true">— □ ×</span></div>
        <form id="guest-form">
          <fieldset id="write-fields" disabled>
            <label for="guest-name">ScreenName <span>이름 또는 별명</span></label>
            <input id="guest-name" name="author" maxlength="30" required autocomplete="nickname" placeholder="너의 이름은?" />
            <div id="minimi-maker" class="minimi-maker"></div>
            <label for="guest-message">Message <span>하고 싶은 말</span></label>
            <textarea id="guest-message" name="message" rows="7" maxlength="500" required placeholder="오늘의 조각을 여기에… ♡"></textarea>
            <div class="message-count"><span>모두에게 공개되는 글이에요.</span><span id="char-count">0 / 500</span></div>
            <fieldset class="color-picker"><legend>포스트잇 색상</legend>${colors.map((color, i) => `<label class="swatch" style="--swatch:var(--${color})"><input type="radio" name="color" value="${color}" ${i === 0 ? 'checked' : ''}/><span title="${colorNames[i]}"><span class="sr-only">${colorNames[i]}</span></span></label>`).join('')}</fieldset>
            <button class="submit-button" type="submit">작성하기 <span aria-hidden="true">Send message ➜</span></button>
          </fieldset>
          <p id="form-status" role="status" aria-live="polite"></p>
        </form>
        <p class="compose-foot">✉ 보내주신 마음은 소중하게 보관됩니다.</p>
      </aside>
      <section class="board-section" aria-labelledby="board-title">
        <section id="minimi-plaza" class="minimi-plaza" aria-label="미니미 광장"></section>
        <div class="board-heading"><h2 id="board-title">▤ Guestbook entries <span id="note-count">0</span></h2><div class="board-tools"><span id="connection-status" role="status">연결 중</span><button id="refresh" type="button">새로고침 ↻</button></div></div>
        <p id="board-status" role="status" aria-live="polite">방명록을 불러오고 있어요.</p>
        <div id="note-board" class="note-board" aria-busy="true"></div>
        <button id="load-more" class="load-more" type="button" hidden>이전 방명록 더 보기 ↓</button>
      </section>
    </div>
  </main><footer><a class="start-button" href="${import.meta.env.BASE_URL}">▦ Start</a><span class="task-active">▤ Guestbook Explorer</span><span class="task-clock">♡ Connected · ${new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit' }).format(new Date())}</span></footer>
`

mountStickers()
mountStardust()
mountMusic()

const el = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T
const form = el<HTMLFormElement>('guest-form')
const nameInput = el<HTMLInputElement>('guest-name')
const messageInput = el<HTMLTextAreaElement>('guest-message')
const writeFields = el<HTMLFieldSetElement>('write-fields')
const formStatus = el('form-status')
const boardStatus = el('board-status')
const board = el('note-board')
mountPaperTouch(board)
const more = el<HTMLButtonElement>('load-more')
const refresh = el<HTMLButtonElement>('refresh')
const connection = el('connection-status')
const entries = new Map<string, Entry>()
const nodes = new Map<string, HTMLElement>()
let cursor: Entry | undefined
let loading = false
let saving = false
let draftId: string | undefined
const getMinimiSeed = mountMinimi(el('minimi-maker'), () => { draftId = undefined; formStatus.textContent = '' })
const updatePlaza = mountPlaza(el('minimi-plaza'), id => {
  const note = nodes.get(id)
  if (!note) return
  document.querySelector('.plaza-selected')?.classList.remove('plaza-selected')
  note.classList.add('plaza-selected'); note.tabIndex = -1
  note.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' })
  note.focus({ preventScroll: true })
})

function isEntry(row: unknown): row is Entry {
  if (!row || typeof row !== 'object') return false
  const r = row as Entry
  return typeof r.id === 'string' && typeof r.author === 'string' && typeof r.message === 'string'
    && colors.includes(r.color as typeof colors[number]) && Number.isFinite(Date.parse(r.created_at))
}

function merge(rows: unknown[], animate = false) {
  const fresh = new Set<string>()
  for (const row of rows) if (isEntry(row)) {
    if (!entries.has(row.id)) fresh.add(row.id)
    entries.set(row.id, row)
  }
  const sorted = [...entries.values()].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
  for (const row of sorted) {
    let note = nodes.get(row.id)
    if (!note) {
      note = document.createElement('article')
      note.className = 'note'
      note.dataset.id = row.id
      note.style.setProperty('--paper', `var(--${row.color})`)
      const tilt = [...row.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 7 - 3
      note.style.setProperty('--tilt', `${tilt * .6}deg`)
      const text = document.createElement('p')
      text.className = 'note-message'
      text.textContent = row.message
      const bottom = document.createElement('div')
      bottom.className = 'note-bottom'
      const author = document.createElement('strong')
      author.textContent = row.author
      const time = document.createElement('time')
      time.dateTime = row.created_at
      time.textContent = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(row.created_at))
      bottom.append(author, time)
      const title = document.createElement('div')
      title.className = 'note-title'
      const filename = document.createElement('span')
      filename.textContent = `${row.author}.txt`
      const chrome = document.createElement('span')
      chrome.className = 'window-dots'
      chrome.setAttribute('aria-hidden', 'true')
      chrome.textContent = '— □ ×'
      title.append(filename, chrome)
      note.append(title)
      if (Number.isInteger(row.minimi_seed) && row.minimi_seed! >= 0 && row.minimi_seed! <= 2147483647) note.append(minimi(row.minimi_seed!))
      note.append(text, bottom)
      attachReplies?.(note, row.id)
      nodes.set(row.id, note)
    }
    board.append(note)
    if (animate && fresh.has(row.id)) {
      note.classList.add('just-posted')
      note.addEventListener('animationend', () => note!.classList.remove('just-posted'), { once: true })
    }
  }
  el('note-count').textContent = String(entries.size)
  updatePlaza(sorted)
  if (entries.size) boardStatus.textContent = ''
}

// Only public client keys belong in a static website bundle.
function validConfig() {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || url.includes('YOUR_PROJECT')) return false
    if (key.startsWith('sb_publishable_') && !key.includes('YOUR_KEY')) return true
    const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.role === 'anon'
  } catch { return false }
}
const supabase = validConfig() ? createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}) : null
const attachReplies = supabase ? createReplies(supabase) : null

async function load(older = false, quiet = false) {
  if (!supabase || loading) return
  loading = true
  more.disabled = true
  refresh.disabled = true
  board.setAttribute('aria-busy', 'true')
  if (!quiet) boardStatus.textContent = '방명록을 불러오고 있어요.'
  try {
    let query = supabase.from('guestbook_entries').select(fields).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(pageSize)
    if (older && cursor) query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
    const { data, error } = await query.abortSignal(AbortSignal.timeout(15000))
    if (error) {
      if (['PGRST205', '42P01', '42501'].includes(error.code)) {
        connection.textContent = '준비 중'
        boardStatus.textContent = '방명록을 준비하고 있어요. 잠시 후 다시 방문해주세요.'
        formStatus.textContent = '연결 준비가 끝나면 작성할 수 있어요.'
        writeFields.disabled = true
        return
      }
      throw error
    }
    if (!saving) writeFields.disabled = false
    if (formStatus.textContent === '연결 준비가 끝나면 작성할 수 있어요.') formStatus.textContent = ''
    const rows = (data ?? []).filter(isEntry)
    merge(rows, quiet)
    if (older || !cursor) {
      cursor = rows.at(-1) ?? cursor
      more.hidden = rows.length < pageSize
    }
    boardStatus.textContent = entries.size ? '' : '아직 인사가 없어요. 첫 번째 포스트잇을 붙여주세요!'
  } catch {
    boardStatus.textContent = '방명록을 불러오지 못했어요. 잠시 후 새로고침을 눌러주세요.'
  } finally {
    loading = false
    more.disabled = false
    refresh.disabled = false
    board.setAttribute('aria-busy', 'false')
  }
}

form.addEventListener('input', () => {
  el('char-count').textContent = `${messageInput.value.length} / 500`
  draftId = undefined
  formStatus.textContent = ''
})
form.addEventListener('submit', async event => {
  event.preventDefault()
  if (!supabase || saving) return
  if (el('minimi-maker').getAttribute('aria-busy') === 'true') {
    formStatus.textContent = '주사위가 멈추면 작성할 수 있어요!'
    return
  }
  const author = nameInput.value.trim(), message = messageInput.value.trim()
  if (!author || !message) {
    formStatus.textContent = '이름과 하고 싶은 말을 모두 적어주세요.'
    ;(!author ? nameInput : messageInput).focus()
    return
  }
  const color = String(new FormData(form).get('color'))
  draftId ??= crypto.randomUUID()
  const id = draftId
  saving = true
  writeFields.disabled = true
  formStatus.textContent = '포스트잇을 붙이고 있어요…'
  try {
    let { data, error } = await supabase.from('guestbook_entries').insert({ id, author, message, color, minimi_seed: getMinimiSeed() }).select(fields).abortSignal(AbortSignal.timeout(15000)).single()
    if (error?.code === 'PGRST204' || error?.code === '42501') {
      formStatus.textContent = '미니미 저장 설정이 필요해요. 관리자가 추가 SQL(202610070003_guestbook_minimi.sql)을 실행한 뒤 다시 작성해주세요. 입력은 유지돼요.'
      return
    }
    // Retrying an uncertain network response uses the same id, so it cannot post twice.
    if (error?.code === '23505') {
      const existing = await supabase.from('guestbook_entries').select(fields).eq('id', id).abortSignal(AbortSignal.timeout(15000)).single()
      data = existing.data
      error = existing.error
    }
    if (error || !isEntry(data)) throw error ?? new Error('Invalid entry')
    merge([data], true)
    messageInput.value = ''
    el('char-count').textContent = '0 / 500'
    draftId = undefined
    formStatus.textContent = '마음이 도착했어요. 방명록에 붙였어요!'
  } catch {
    formStatus.textContent = '저장 여부를 확인하지 못했어요. 입력한 글은 그대로 있으니 다시 작성하기를 눌러주세요.'
  } finally {
    saving = false
    writeFields.disabled = false
  }
})
refresh.addEventListener('click', () => void load())
more.addEventListener('click', () => void load(true))

if (!supabase) {
  connection.textContent = '준비 중'
  boardStatus.textContent = '방명록을 준비하고 있어요. 곧 이곳에서 인사를 나눠요.'
  formStatus.textContent = '연결 준비가 끝나면 작성할 수 있어요.'
  board.setAttribute('aria-busy', 'false')
  refresh.disabled = true
} else {
  void load()
  const channel = supabase.channel('guestbook-inserts').on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'guestbook_entries',
  }, payload => merge([payload.new], true)).subscribe(status => {
    connection.textContent = status === 'SUBSCRIBED' ? '● 실시간 연결' : '주기적으로 새 글 확인 중'
    // Refresh after subscription/reconnection to cover messages sent while disconnected.
    if (status === 'SUBSCRIBED') void load(false, true)
  })
  const refreshVisible = () => { if (!document.hidden && navigator.onLine) void load(false, true) }
  const timer = window.setInterval(refreshVisible, 30000)
  document.addEventListener('visibilitychange', refreshVisible)
  window.addEventListener('online', refreshVisible)
  window.addEventListener('pagehide', () => {
    clearInterval(timer)
    void supabase.removeChannel(channel)
  }, { once: true })
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload() })
}
