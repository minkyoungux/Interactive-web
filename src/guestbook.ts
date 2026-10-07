import { createClient } from '@supabase/supabase-js'
import { supabaseUrl as url, supabasePublishableKey as key } from './supabase-config'
import './guestbook.css'

const colors = ['butter', 'rose', 'mint', 'sky', 'lavender'] as const
const colorNames = ['버터 옐로', '로즈 핑크', '민트', '하늘색', '라벤더']
type Entry = { id: string; author: string; message: string; color: string; created_at: string }
const pageSize = 30
const fields = 'id,author,message,color,created_at'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="guest-header">
    <a class="guest-brand" href="${import.meta.env.BASE_URL}"><span class="brand-symbol" aria-hidden="true">✧</span><span>INTERACTIVE<small>LAB · DREAM DIARY</small></span></a>
    <a class="back-link" href="${import.meta.env.BASE_URL}">작품으로 돌아가기 <span aria-hidden="true">↗</span></a>
  </header>
  <main>
    <section class="intro">
      <div class="orbit orbit-one" aria-hidden="true"></div><div class="orbit orbit-two" aria-hidden="true"></div>
      <span class="dream-spark spark-one" aria-hidden="true">✧</span><span class="dream-spark spark-two" aria-hidden="true">✦</span><span class="dream-spark spark-three" aria-hidden="true">✧</span>
      <span class="dream-heart" aria-hidden="true">♡</span>
      <p class="eyebrow"><span aria-hidden="true">✳</span> A TINY CORNER OF OUR UNIVERSE</p>
      <h1>Dream <em>diary</em><span class="title-star" aria-hidden="true">✶</span><span class="sr-only">방명록</span></h1>
      <p class="intro-copy">꿈에서 만난 것처럼, 우연히 여기에.<br>오늘의 기분을 살짝 남겨줘 <span aria-hidden="true">♡</span></p>
      <span class="hero-sticker">you were here! <span aria-hidden="true">↗</span></span>
      <div class="dream-strip" aria-hidden="true"><span>˚ ༘♡ little messages</span><span>made of stardust ✧</span><span>stay a little longer ♡</span></div>
    </section>
    <div class="guest-layout">
      <aside class="composer">
        <div class="compose-heading"><span><i aria-hidden="true">♡</i> new_message.txt</span><span class="window-dots" aria-hidden="true">— □ ×</span></div>
        <form id="guest-form">
          <fieldset id="write-fields" disabled>
            <label for="guest-name">from. <span>이름 또는 별명</span></label>
            <input id="guest-name" name="author" maxlength="30" required autocomplete="nickname" placeholder="너의 이름은?" />
            <label for="guest-message">dear diary, <span>하고 싶은 말</span></label>
            <textarea id="guest-message" name="message" rows="7" maxlength="500" required placeholder="오늘의 조각을 여기에… ♡"></textarea>
            <div class="message-count"><span>모두에게 공개되는 글이에요.</span><span id="char-count">0 / 500</span></div>
            <fieldset class="color-picker"><legend>포스트잇 색상</legend>${colors.map((color, i) => `<label class="swatch" style="--swatch:var(--${color})"><input type="radio" name="color" value="${color}" ${i === 0 ? 'checked' : ''}/><span title="${colorNames[i]}"><span class="sr-only">${colorNames[i]}</span></span></label>`).join('')}</fieldset>
            <button class="submit-button" type="submit">작성하기 <span aria-hidden="true">send with love ↗</span></button>
          </fieldset>
          <p id="form-status" role="status" aria-live="polite"></p>
        </form>
        <p class="compose-foot">₊˚⊹ a little note, a little magic ⊹˚₊</p>
      </aside>
      <section class="board-section" aria-labelledby="board-title">
        <div class="board-heading"><h2 id="board-title"><span class="board-star" aria-hidden="true">✧</span> our little notes <span id="note-count">0</span></h2><div class="board-tools"><span id="connection-status" role="status">연결 중</span><button id="refresh" type="button">새로고침 ↻</button></div></div>
        <p id="board-status" role="status" aria-live="polite">방명록을 불러오고 있어요.</p>
        <div id="note-board" class="note-board" aria-busy="true"></div>
        <button id="load-more" class="load-more" type="button" hidden>이전 방명록 더 보기 ↓</button>
      </section>
    </div>
  </main><footer>INTERACTIVE LAB <span>see you in another dream ♡</span><span>✧ DREAM DIARY CLUB</span></footer>
`

const el = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T
const form = el<HTMLFormElement>('guest-form')
const nameInput = el<HTMLInputElement>('guest-name')
const messageInput = el<HTMLTextAreaElement>('guest-message')
const writeFields = el<HTMLFieldSetElement>('write-fields')
const formStatus = el('form-status')
const boardStatus = el('board-status')
const board = el('note-board')
const more = el<HTMLButtonElement>('load-more')
const refresh = el<HTMLButtonElement>('refresh')
const connection = el('connection-status')
const entries = new Map<string, Entry>()
const nodes = new Map<string, HTMLElement>()
let cursor: Entry | undefined
let loading = false
let saving = false
let draftId: string | undefined

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
      note.append(text, bottom)
      nodes.set(row.id, note)
    }
    board.append(note)
    if (animate && fresh.has(row.id)) {
      note.classList.add('just-posted')
      note.addEventListener('animationend', () => note!.classList.remove('just-posted'), { once: true })
    }
  }
  el('note-count').textContent = String(entries.size)
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
    let { data, error } = await supabase.from('guestbook_entries').insert({ id, author, message, color }).select(fields).abortSignal(AbortSignal.timeout(15000)).single()
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
