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
    let failCat = false
    await page.route('https://cataas.com/**', route => failCat ? route.abort() : route.fulfill({
      contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="140"><rect width="160" height="140" fill="pink"/></svg>',
    }))
    await expect(page.locator('.cat-photo img')).toHaveCount(0)
    await page.locator('.cat-next').click()
    await expect(page.locator('.cat-photo img')).toHaveCount(1)
    await expect(page.locator('.cat-status')).toContainText('충전 완료')
    const firstCat = await page.locator('.cat-photo img').getAttribute('src')
    failCat = true
    await page.locator('.cat-next').click()
    await expect(page.locator('.cat-status')).toContainText('다시 불러볼까요')
    assert.equal(await page.locator('.cat-photo img').getAttribute('src'), firstCat)
    failCat = false
    await page.locator('.cat-next').click()
    await expect(page.locator('.cat-status')).toContainText('충전 완료')
    assert.notEqual(await page.locator('.cat-photo img').getAttribute('src'), firstCat)
    await page.route('https://open.spotify.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Spotify mock player</p>' }))
    await page.route('https://open.spotify.com/embed/iframe-api/v1', route => route.fulfill({ contentType: 'application/javascript', body: `
      window.onSpotifyIframeApiReady({createController(target, options, callback) {
        const frame = document.createElement('iframe'); frame.src = 'https://open.spotify.com/embed/track/' + options.uri.split(':').pop(); target.replaceWith(frame);
        const listeners = {}; let paused = true;
        const update = () => listeners.playback_update?.({data:{isPaused:paused,isBuffering:false,position:100,duration:10000}});
        window.mockSpotifyToggle = () => {paused=!paused;update()};
        callback({destroy(){frame.remove()},addListener(name,fn){listeners[name]=fn;if(name==='ready')setTimeout(fn,0)}});
      }});
    ` }))
    await expect(page.locator('.bgm-player iframe')).toHaveCount(0)
    for (const [i, id] of ['1aKvZDoLGkNMxoRYgkckZG','7Jpb9OejYYIwsBIVQwceRy','3r8RuvgbX9s7ammBn07D3W'].entries()) {
      await page.locator(`[data-song="${i}"]`).click()
      await expect(page.locator('.bgm-player iframe')).toHaveCount(1)
      assert.ok((await page.locator('.bgm-player iframe').getAttribute('src')).includes(id))
      assert.equal(await page.locator('.bgm-link').getAttribute('href'), `https://open.spotify.com/track/${id}`)
      await expect(page.locator('.bgm-toggle')).toHaveCount(0)
      await page.evaluate(() => window.mockSpotifyToggle())
      await expect(page.locator('.bgm-eq-label')).toContainText('ON AIR')
      assert.equal(await page.locator('.bgm-disc').evaluate(el => getComputedStyle(el).animationPlayState), 'running')
      await page.evaluate(() => window.mockSpotifyToggle())
      await expect(page.locator('.bgm-eq-label')).toContainText('STANDBY')
      assert.equal(await page.locator('.bgm-disc').evaluate(el => getComputedStyle(el).animationPlayState), 'paused')
    }
    await page.locator('.bgm-close').click()
    await expect(page.locator('.bgm-player iframe')).toHaveCount(0)
    await page.mouse.move(400, 150)
    await page.mouse.move(550, 240, { steps: 12 })
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.cursor-stardust')
      return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 0)
    })
    assert.equal(await page.locator('.cursor-stardust').evaluate(el => getComputedStyle(el).pointerEvents), 'none')
    await page.locator('.stardust-toggle').click()
    assert.equal(await page.locator('.stardust-toggle').getAttribute('aria-pressed'), 'false')
    assert.equal(await page.locator('.cursor-stardust').evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some(v => v !== 0)), false)
    await page.locator('.stardust-toggle').click()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    assert.equal(await page.locator('.cursor-stardust').isVisible(), false)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const initialSeed = await page.locator('.minimi-preview .minimi').getAttribute('data-seed')
    await page.locator('.minimi-roll').click()
    assert.equal(await page.locator('#minimi-maker').getAttribute('aria-busy'), 'true')
    assert.equal(await page.locator('.minimi-roll').isDisabled(), true)
    await page.waitForFunction(() => document.querySelector('#minimi-maker').getAttribute('aria-busy') === 'false')
    const chosenSeed = await page.locator('.minimi-preview .minimi').getAttribute('data-seed')
    assert.notEqual(chosenSeed, initialSeed)
    const chosenArt = await page.locator('.minimi-preview .minimi').innerHTML()
    await page.locator('#guest-name').fill('  민경  ')
    await page.locator('#guest-message').fill('  반가워요! <img src=x onerror=alert(1)>  ')
    await page.locator('input[value=mint]').check()
    await page.locator('.submit-button').click()
    await expect(page.locator('.note')).toHaveCount(4)
    assert.equal(rows[0].minimi_seed, Number(chosenSeed))
    assert.equal(await page.locator('.note > .minimi').first().innerHTML(), chosenArt)
    await expect(page.locator('.plaza-person')).toHaveCount(1)
    await page.locator('#minimi-plaza').scrollIntoViewIfNeeded()
    await page.mouse.move(0, 0)
    const startPosition = await page.locator('.plaza-person').getAttribute('style')
    await page.waitForFunction(start => document.querySelector('.plaza-person').getAttribute('style') !== start, startPosition)
    await page.locator('.plaza-scene').dispatchEvent('pointerleave')
    const residentBox = await page.locator('.plaza-person').boundingBox()
    await page.locator('.plaza-scene').dispatchEvent('pointermove', {pointerType:'mouse',clientX:residentBox.x + 50,clientY:residentBox.y + 30})
    await expect(page.locator('.plaza-person.is-curious')).toHaveCount(1)
    await page.locator('.plaza-scene').dispatchEvent('pointermove', {pointerType:'mouse',clientX:residentBox.x + 110,clientY:residentBox.y + 30})
    await expect(page.locator('.plaza-person.is-startled')).toHaveCount(1)
    await page.locator('.plaza-scene').dispatchEvent('pointerleave')
    await page.locator('.plaza-pause').click()
    await page.locator('.plaza-person').click()
    await expect(page.locator('.note.plaza-selected')).toHaveCount(1)
    assert.equal(await page.locator('.note.plaza-selected').getAttribute('data-id'), rows[0].id)
    const paper = page.locator('.note.plaza-selected')
    const paperBox = await paper.boundingBox()
    await paper.locator('.note-message').dispatchEvent('pointermove', {pointerType:'mouse',clientX:paperBox.x + 30,clientY:paperBox.y + 50})
    await expect(page.locator('.note.paper-touch')).toHaveCount(1)
    await paper.locator('.note-message').dispatchEvent('pointerdown', {pointerType:'mouse',button:0})
    assert.equal(await paper.evaluate(el => el.style.getPropertyValue('--paper-press')), '.985')
    await page.locator('body').dispatchEvent('pointerup')
    await expect(page.locator('.note.paper-touch')).toHaveCount(0)
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
    assert.equal(await page.locator('.note > .minimi').first().innerHTML(), chosenArt, 'Saved minimi must survive reload')
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
    for (let look = 0; look < 8; look++) {
      const entry = { id: `00000000-0000-4000-8000-00000000010${look}`, author: `코디 ${look + 1}`, message: '8종 이미지 확인', color: 'rose', minimi_seed: look, created_at: new Date(Date.now() + look * 1000).toISOString() }
      rows.unshift(entry); broadcast(entry)
      await expect(page.locator(`.note[data-id="${entry.id}"] > .minimi[data-look="${look}"]`)).toHaveCount(1)
    }
    const imagesLoaded = await page.evaluate(async () => {
      const urls = [...new Set([...document.querySelectorAll('.minimi image')].map(el => el.getAttribute('href')))]
      return Promise.all(urls.map(url => new Promise(resolve => {
        const img = new Image(); img.onload = () => resolve(img.naturalWidth > 0); img.onerror = () => resolve(false); img.src = url
      })))
    })
    assert.equal(imagesLoaded.length, 6)
    assert.ok(imagesLoaded.every(Boolean))
    await page.screenshot({ path: 'artifacts/guestbook-eight-minimi.png', fullPage: true })
    assert.deepEqual(errors, [])
    console.log('PASS: dice animation, persisted minimi, plaza walking and note navigation; guestbook/replies realtime, reload and retries. Mock API only.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
