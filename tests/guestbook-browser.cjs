// Local Supabase HTTP/WebSocket simulation. Never writes into the real project.
// Run after a Pages build, with preview serving /Interactive-web/ on port 4178.
const assert = require('node:assert/strict')
const path = require('node:path'), os = require('node:os')
let playwright
try { playwright = require('playwright') }
catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }
const origin = process.env.GUESTBOOK_TEST_ORIGIN || 'http://127.0.0.1:4178/Interactive-web/'
const expect = locator => {
  const wait = async (read, expected, includes = false) => {
    const deadline = Date.now() + 8000
    let actual
    do {
      actual = await read()
      if (includes ? actual.includes(expected) : actual === expected) return
      await new Promise(resolve => setTimeout(resolve, 50))
    } while (Date.now() < deadline)
    assert.fail(`Expected ${expected}; received ${actual}`)
  }
  return {
    toHaveCount: n => wait(() => locator.count(), n),
    toContainText: text => wait(() => locator.innerText(), text, true),
    toHaveValue: text => wait(() => locator.inputValue(), text),
  }
}

;(async () => {
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } })
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    let failWrite = false, socket
    const joined = new Map(), replyRows = []
    const rows = [
      { id: '00000000-0000-4000-8000-000000000001', author: '산책자', message: '작은 지구를 한참 바라보다 가요.\n오늘도 좋은 하루 보내세요 🌿', color: 'butter', created_at: '2026-10-07T08:00:00Z' },
      { id: '00000000-0000-4000-8000-000000000002', author: '느린 고래', message: '심해에서 만난 작은 세계가 정말 포근했어요.', color: 'sky', created_at: '2026-10-07T07:00:00Z' },
      { id: '00000000-0000-4000-8000-000000000003', author: '별', message: '다음에 또 놀러올게요!', color: 'rose', created_at: '2026-10-07T06:00:00Z' },
    ]
    const broadcast = (row, table = 'guestbook_entries') => {
      const frame = joined.get(table)
      socket.send(JSON.stringify([frame[0], null, frame[2], 'postgres_changes', {
        ids: [42], data: { schema: 'public', table, type: 'INSERT', commit_timestamp: row.created_at, columns: [], record: row, old_record: {}, errors: null },
      }]))
    }
    await page.routeWebSocket('**/realtime/v1/websocket**', ws => {
      socket = ws
      ws.onMessage(message => {
        const packet = JSON.parse(String(message))
        if (packet[3] === 'phx_join') {
          const table = packet[4].config.postgres_changes[0].table
          joined.set(table, packet)
          ws.send(JSON.stringify([packet[0], packet[1], packet[2], 'phx_reply', { status: 'ok', response: { postgres_changes: [{ id: 42, event: 'INSERT', schema: 'public', table }] } }]))
        } else if (packet[3] === 'heartbeat') {
          ws.send(JSON.stringify([packet[0], packet[1], packet[2], 'phx_reply', { status: 'ok', response: {} }]))
        }
      })
    })
    await page.route('https://envvunfvyabiiwurfpoa.supabase.co/rest/v1/**', async route => {
      const request = route.request(), url = new URL(request.url())
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
      let body, status = 200
      const table = url.pathname.endsWith('/guestbook_replies') ? 'guestbook_replies' : 'guestbook_entries'
      const targetRows = table === 'guestbook_replies' ? replyRows : rows
      if (request.method() === 'POST') {
        const entry = { ...request.postDataJSON(), created_at: new Date().toISOString() }
        if (targetRows.some(row => row.id === entry.id)) { status = 409; body = { code: '23505', message: 'duplicate' } }
        else {
          targetRows.unshift(entry)
          if (failWrite) { status = 503; body = { message: 'simulated uncertain response' }; failWrite = false }
          else { body = entry; broadcast(entry, table) }
        }
      } else if (url.searchParams.has('id')) body = targetRows.find(row => row.id === url.searchParams.get('id').slice(3))
      else body = url.searchParams.has('entry_id') ? targetRows.filter(row => row.entry_id === url.searchParams.get('entry_id').slice(3)) : targetRows
      return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
    })
    await page.goto(origin + 'guestbook.html')
    await expect(page.locator('.note')).toHaveCount(3)
    await expect(page.locator('#connection-status')).toContainText('실시간 연결')
    await page.locator('#guest-name').fill('  민경  ')
    await page.locator('#guest-message').fill('  반가워요! <img src=x onerror=alert(1)>  ')
    await page.locator('input[value=mint]').check()
    await page.locator('.submit-button').click()
    await expect(page.locator('.note')).toHaveCount(4)
    assert.equal(await page.locator('.note img').count(), 0, 'User content must be text, not HTML')
    assert.equal(await page.locator('.note strong').first().textContent(), '민경')
    await expect(page.locator('#guest-message')).toHaveValue('')
    const remote = { id: '00000000-0000-4000-8000-000000000004', author: '다른 창의 방문자', message: '실시간으로 인사해요!', color: 'lavender', created_at: new Date(Date.now() + 1000).toISOString() }
    rows.unshift(remote)
    broadcast(remote)
    await expect(page.locator('.note')).toHaveCount(5)
    await page.reload()
    await expect(page.locator('.note')).toHaveCount(5)
    await page.screenshot({ path: 'artifacts/guestbook-desktop.png', fullPage: true })
    failWrite = true
    await page.locator('#guest-name').fill('재시도')
    await page.locator('#guest-message').fill('응답이 끊겨도 두 번 저장되지 않는 글')
    await page.locator('.submit-button').click()
    await expect(page.locator('#form-status')).toContainText('확인하지 못했어요')
    await expect(page.locator('#guest-message')).toHaveValue('응답이 끊겨도 두 번 저장되지 않는 글')
    await page.locator('.submit-button').click()
    await expect(page.locator('#form-status')).toContainText('마음이 도착했어요')
    assert.equal(rows.filter(row => row.author === '재시도').length, 1)
    const note = page.locator('.note').filter({ hasText: '응답이 끊겨도 두 번 저장되지 않는 글' })
    await note.locator('summary').click()
    await note.locator('[name=author]').fill('답글 친구')
    await note.locator('[name=message]').fill('<img src=x onerror=alert(1)> 안녕!')
    await note.locator('.reply-submit').click()
    await expect(note.locator('.reply-item')).toHaveCount(1)
    await expect(note.locator('.reply-status')).toContainText('답글을 남겼어요')
    assert.equal(replyRows[0].parent_id, null)
    assert.equal(replyRows[0].entry_id, rows.find(row => row.author === '재시도').id)
    assert.equal(await note.locator('.reply-item img').count(), 0)
    const parentId = replyRows[0].id
    await note.locator('.reply-to').click()
    await expect(note.locator('.reply-target')).toContainText('답글 친구님에게')
    await note.locator('[name=message]').fill('대댓글도 반가워!')
    await note.locator('.reply-submit').click()
    await expect(note.locator('.reply-item')).toHaveCount(2)
    await expect(note.locator('.reply-status')).toContainText('답글을 남겼어요')
    assert.equal(replyRows[0].parent_id, parentId)
    await expect(note.locator('.is-child .reply-parent')).toContainText('답글 친구에게')
    const remoteReply = { id: '00000000-0000-4000-8000-000000000099', entry_id: replyRows[0].entry_id, parent_id: null, author: '먼 곳의 친구', message: '나도 인사!', created_at: new Date().toISOString() }
    replyRows.push(remoteReply)
    broadcast(remoteReply, 'guestbook_replies')
    broadcast(remoteReply, 'guestbook_replies')
    await expect(note.locator('.reply-item')).toHaveCount(3)
    failWrite = true
    await note.locator('[name=message]').fill('답글 재시도')
    await note.locator('.reply-submit').click()
    await expect(note.locator('.reply-status')).toContainText('확인하지 못했어요')
    await expect(note.locator('[name=message]')).toHaveValue('답글 재시도')
    await note.locator('.reply-submit').click()
    await expect(note.locator('.reply-status')).toContainText('답글을 남겼어요')
    assert.equal(replyRows.filter(row => row.message === '답글 재시도').length, 1)
    await page.reload()
    await note.locator('summary').click()
    await expect(note.locator('.reply-item')).toHaveCount(4)
    assert.deepEqual(errors, [])
    console.log('PASS: guestbook + replies + nested replies, realtime deduplication, reload, safe text and idempotent retries. Mock API only.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
