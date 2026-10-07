import type { SupabaseClient } from '@supabase/supabase-js'
import './guestbook-replies.css'

type Reply = { id: string; entry_id: string; parent_id: string | null; author: string; message: string; created_at: string }
const fields = 'id,entry_id,parent_id,author,message,created_at'
const valid = (value: unknown): value is Reply => {
  if (!value || typeof value !== 'object') return false
  const r = value as Reply
  return [r.id,r.entry_id,r.author,r.message].every(s => typeof s === 'string')
    && (r.parent_id === null || typeof r.parent_id === 'string') && Number.isFinite(Date.parse(r.created_at))
}

export function createReplies(client: SupabaseClient) {
  const threads = new Map<string, { merge: (rows: unknown[]) => void; refresh: () => void }>()
  const channel = client.channel('guestbook-replies').on('postgres_changes', {
    event: 'INSERT', schema: 'public', table: 'guestbook_replies',
  }, ({ new: row }) => { if (valid(row)) threads.get(row.entry_id)?.merge([row]) })
    .subscribe(status => { if (status === 'SUBSCRIBED') threads.forEach(t => t.refresh()) })
  const refresh = () => { if (!document.hidden && navigator.onLine) threads.forEach(t => t.refresh()) }
  const timer = window.setInterval(refresh, 30000)
  window.addEventListener('online', refresh)
  document.addEventListener('visibilitychange', refresh)
  window.addEventListener('pagehide', () => { clearInterval(timer); void client.removeChannel(channel) }, { once: true })

  return (note: HTMLElement, entryId: string) => {
    const details = document.createElement('details')
    details.className = 'reply-thread'
    details.innerHTML = `<summary>↳ 답글 보기 / 쓰기</summary><div class="reply-content"><div class="reply-list"></div><button class="reply-more" type="button" hidden>이전 순서의 답글 더 보기 ↓</button><form class="reply-form"><p class="reply-target">방명록에 답글 남기기</p><button class="reply-cancel" type="button" hidden>대댓글 취소 ×</button><fieldset disabled><label>이름<input name="author" required maxlength="30" autocomplete="nickname" placeholder="이름 또는 별명" /></label><label>답글<textarea name="message" required maxlength="500" rows="3" placeholder="따뜻한 한마디를 남겨주세요."></textarea></label><small>최대 500자 · 모두에게 공개돼요.</small><button class="reply-submit" type="submit">답글 작성하기 ↵</button></fieldset></form><p class="reply-status" role="status" aria-live="polite"></p><button class="reply-retry" type="button">답글 새로고침 ↻</button></div>`
    note.append(details)
    const list = details.querySelector<HTMLElement>('.reply-list')!
    const form = details.querySelector<HTMLFormElement>('form')!
    const fieldset = form.querySelector('fieldset')!
    const name = form.elements.namedItem('author') as HTMLInputElement
    const message = form.elements.namedItem('message') as HTMLTextAreaElement
    const status = details.querySelector<HTMLElement>('.reply-status')!
    const more = details.querySelector<HTMLButtonElement>('.reply-more')!
    const cancel = details.querySelector<HTMLButtonElement>('.reply-cancel')!
    const retry = details.querySelector<HTMLButtonElement>('.reply-retry')!
    const targetLabel = details.querySelector<HTMLElement>('.reply-target')!
    const rows = new Map<string,Reply>()
    const elements = new Map<string,HTMLElement>()
    let target: Reply | null = null, cursor: Reply | undefined, loading = false, saving = false, draftId: string | undefined
    const setTarget = (row: Reply | null) => {
      if (saving) return
      target = row; draftId = undefined
      targetLabel.textContent = row ? `↳ ${row.author}님에게 답글` : '방명록에 답글 남기기'
      cancel.hidden = !row
      if (row) message.focus()
    }
    const merge = (incoming: unknown[]) => {
      incoming.forEach(r => { if (valid(r) && r.entry_id === entryId) rows.set(r.id,r) })
      const sorted = [...rows.values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
      for (const row of sorted) {
        let item = elements.get(row.id)
        if (!item) {
          item = document.createElement('article')
          item.className = `reply-item${row.parent_id ? ' is-child' : ''}`
          item.dataset.replyId = row.id
          const heading = document.createElement('div')
          heading.className = 'reply-meta'
          const author = document.createElement('b'); author.textContent = row.author
          const date = document.createElement('time'); date.dateTime = row.created_at
          date.textContent = new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(row.created_at))
          heading.append(author,date)
          const parent = document.createElement('small'); parent.className = 'reply-parent'
          const text = document.createElement('p'); text.textContent = row.message
          const button = document.createElement('button'); button.type = 'button'; button.className = 'reply-to'; button.textContent = '↳ 답글 달기'
          button.addEventListener('click', () => setTarget(row))
          item.append(heading,parent,text,button)
          elements.set(row.id,item)
        }
        item.querySelector('.reply-parent')!.textContent = row.parent_id ? `↳ ${rows.get(row.parent_id)?.author ?? '이전 답글'}에게` : ''
        list.append(item)
      }
      details.querySelector('summary')!.textContent = `↳ 답글 ${rows.size} · 보기 / 쓰기`
    }
    async function load(older = false, quiet = false) {
      if (loading || !details.open) return
      loading = true; more.disabled = true; retry.disabled = true
      if (!quiet) status.textContent = '답글을 불러오고 있어요.'
      try {
        let query = client.from('guestbook_replies').select(fields).eq('entry_id',entryId).order('created_at').order('id').limit(30)
        if (older && cursor) query = query.or(`created_at.gt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.gt.${cursor.id})`)
        const { data, error } = await query.abortSignal(AbortSignal.timeout(15000))
        if (error) {
          if (['PGRST205','42P01','42501'].includes(error.code)) { fieldset.disabled = true; status.textContent = '답글 기능을 준비 중이에요. 잠시 후 다시 확인해주세요.'; return }
          throw error
        }
        const received = (data ?? []).filter(valid)
        merge(received)
        if (older || !cursor) { cursor = received.at(-1) ?? cursor; more.hidden = received.length < 30 }
        if (!saving) fieldset.disabled = false
        if (!quiet || status.textContent?.includes('준비 중')) status.textContent = rows.size ? '' : '첫 답글을 남겨보세요!'
      } catch { if (!quiet) status.textContent = '답글을 불러오지 못했어요. 새로고침을 눌러주세요.' }
      finally { loading = false; more.disabled = false; retry.disabled = false }
    }
    threads.set(entryId,{merge,refresh: () => void load(false,true)})
    details.addEventListener('toggle', () => { if (details.open) void load() })
    retry.addEventListener('click', () => void load())
    more.addEventListener('click', () => void load(true))
    cancel.addEventListener('click', () => setTarget(null))
    form.addEventListener('input', () => { draftId = undefined; status.textContent = '' })
    form.addEventListener('submit', async event => {
      event.preventDefault()
      if (saving) return
      const author = name.value.trim(), text = message.value.trim()
      if (!author || !text) { status.textContent = '이름과 답글을 모두 입력해주세요.'; return }
      draftId ??= crypto.randomUUID()
      const id = draftId
      saving = true; fieldset.disabled = true; cancel.disabled = true
      status.textContent = '답글을 저장하고 있어요.'
      try {
        let {data,error} = await client.from('guestbook_replies').insert({id,entry_id:entryId,parent_id:target?.id ?? null,author,message:text}).select(fields).abortSignal(AbortSignal.timeout(15000)).single()
        if (error?.code === '23505') {
          const existing = await client.from('guestbook_replies').select(fields).eq('id',id).abortSignal(AbortSignal.timeout(15000)).single()
          data = existing.data; error = existing.error
        }
        if (error || !valid(data)) throw error ?? new Error('Invalid reply')
        merge([data]); message.value = ''; draftId = undefined; target = null
        cancel.hidden = true; targetLabel.textContent = '방명록에 답글 남기기'
        status.textContent = '답글을 남겼어요!'
      } catch { status.textContent = '저장 여부를 확인하지 못했어요. 입력은 유지되니 다시 시도해주세요.' }
      finally { saving = false; fieldset.disabled = false; cancel.disabled = false }
    })
  }
}
