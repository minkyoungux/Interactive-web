const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
let playwright
try { playwright = require('playwright') }
catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }
const base = process.argv[2] || 'https://127.0.0.1:5173'
// Never use a stock person as the user's camera. This legacy integration suite is opt-in.
const cameraPhoto = process.env.RESIDENT_TEST_PHOTO
if (!cameraPhoto) { console.log('SKIP: RESIDENT_TEST_PHOTO에 사용자가 허용한 테스트 사진 경로를 지정해주세요. 기본 인물 사진은 사용하지 않습니다.'); process.exit(0) }
const fixture = `data:image/jpeg;base64,${fs.readFileSync(cameraPhoto).toString('base64')}`

;(async () => {
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true })
    const errors = [], uploads = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', m => { if (m.type() === 'error') console.log('BROWSER:', m.text().slice(0, 300)) })
    page.on('request', request => { if (request.method() === 'POST') uploads.push(request.url()) })
    await page.addInitScript(({ fixture }) => {
      window.__cameraTest = { mode: 'ok', stopped: 0, captures: [] }
      const original = CanvasRenderingContext2D.prototype.drawImage
      CanvasRenderingContext2D.prototype.drawImage = function (image, ...args) {
        if (image instanceof HTMLVideoElement) window.__cameraTest.captures.push(performance.now())
        return original.call(this, image, ...args)
      }
      navigator.mediaDevices.getUserMedia = async () => {
        if (window.__cameraTest.mode === 'deny') throw new DOMException('denied', 'NotAllowedError')
        const img = new Image(); img.src = fixture; await img.decode()
        const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 512
        const ctx = canvas.getContext('2d'), draw = () => ctx.drawImage(img, 0, 0, 768, 512)
        draw(); const timer = setInterval(draw, 33), stream = canvas.captureStream(30)
        for (const track of stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { window.__cameraTest.stopped++; clearInterval(timer); stop() } }
        if (window.__cameraTest.mode === 'delay') await new Promise(resolve => window.__releaseCamera = () => resolve())
        return stream
      }
    }, { fixture })
    await page.route('**/src/season-forest-settlement.ts*', async route => {
      const response = await route.fetch(), source = await response.text()
      assert.ok(source.includes('const residents = life.residents;'))
      await route.fulfill({ response, body: source.replace('const residents = life.residents;', 'const residents = life.residents; window.__settlementRead = () => ({ phase, residents: residents.map(r => ({ position:r.anchor.position.toArray(), target:r.target, x:r.x })), pending:!!pending });').replace('pending = makeImageResident(assets);', 'window.__assetTest = { humanoid: assets.humanoid, kind: assets.style.kind, pose: analysis.sourcePose.length, targetPose: analysis.targetPose.length, photoMaps:0 }; pending = makeImageResident(assets); pending.root.traverse(o => { if(o.isMesh) for(const m of (Array.isArray(o.material)?o.material:[o.material])) if(m.map) window.__assetTest.photoMaps++; });') })
    })
    await page.goto(`${base}/season-forest.html`)
    await page.locator('#resident-enter').click()
    await page.locator('#settlement-name').fill('첫 번째 주민')
    await page.waitForFunction(() => document.querySelector('#settlement-video').readyState >= 2)
    await page.screenshot({ path: 'artifacts/settlement-intake.png' })
    const uploadedAt = await page.evaluate(() => performance.now())
    await page.locator('#settlement-file').setInputFiles(cameraPhoto)
    await page.waitForFunction(() => document.querySelector('.settlement-dialog').dataset.phase === 'countdown')
    assert.equal(await page.locator('#settlement-count').innerText(), '5')
    await page.waitForFunction(() => window.__cameraTest.captures.length === 1, null, { timeout: 25000 }).catch(async error => { console.log('Capture diagnostic', await page.evaluate(() => ({ camera:window.__cameraTest, phase:document.querySelector('.settlement-dialog').dataset.phase, message:document.querySelector('#settlement-message').textContent, hidden:document.hidden })), errors); throw error })
    const metrics = await page.evaluate(() => window.__cameraTest)
    assert.ok(metrics.captures[0] - uploadedAt >= 4900, 'capture waits the full five seconds')
    assert.ok(metrics.stopped >= 1, 'camera stops immediately after capture')
    await page.waitForFunction(() => ['reveal', 'landing', 'closed'].includes(document.querySelector('.settlement-dialog').dataset.phase), null, { timeout: 90000 }).catch(async error => { console.log(await page.locator('#settlement-message').innerText()); throw error })
    await page.screenshot({ path: 'artifacts/settlement-result.png' })
    assert.equal(await page.evaluate(() => window.__assetTest.kind), 'human')
    assert.ok(await page.evaluate(() => window.__assetTest.photoMaps) >= 1, 'actual HumanSeg atlas appears on the reference mesh')
    await page.waitForFunction(() => window.__settlementRead().residents.length === 1, null, { timeout: 40000 }).catch(async error => { console.log('Landing diagnostic', await page.evaluate(() => window.__settlementRead()), errors); throw error })
    const first = await page.evaluate(() => window.__settlementRead())
    assert.ok((await page.locator('#resident-roster').innerText()).includes('첫 번째 주민'), 'creation name is used for the resident')
    await page.waitForTimeout(2500)
    const next = await page.evaluate(() => window.__settlementRead())
    assert.notDeepEqual(first.residents[0].position, next.residents[0].position, 'resident walks after landing')
    await page.screenshot({ path: 'artifacts/settlement-landed.png' })
    const bunny = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 240; c.height = 340
      const g = c.getContext('2d'); g.fillStyle = '#efbdd2'
      g.beginPath(); g.ellipse(82, 60, 23, 55, -.15, 0, Math.PI * 2); g.ellipse(158, 60, 23, 55, .15, 0, Math.PI * 2); g.fill()
      g.beginPath(); g.ellipse(120, 136, 74, 65, 0, 0, Math.PI * 2); g.fill()
      g.fillStyle = '#77ac8b'; g.fillRect(76, 184, 88, 100); g.fillRect(45, 196, 31, 58); g.fillRect(164, 196, 31, 58)
      g.fillStyle = '#efbdd2'; g.fillRect(80, 276, 30, 56); g.fillRect(132, 276, 30, 56)
      return c.toDataURL().split(',')[1]
    })
    await page.locator('#resident-enter').click()
    await page.waitForFunction(() => document.querySelector('#settlement-video').readyState >= 2)
    await page.locator('#settlement-file').setInputFiles({ name: 'rabbit.png', mimeType: 'image/png', buffer: Buffer.from(bunny, 'base64') })
    await page.waitForFunction(() => document.querySelector('.settlement-dialog').dataset.phase === 'reveal', null, { timeout: 90000 })
    await page.screenshot({ path: 'artifacts/settlement-rabbit-result.png' })
    assert.equal(await page.evaluate(() => window.__assetTest.humanoid), true, 'two-legged reference receives miniature anatomy')
    assert.equal(await page.evaluate(() => window.__assetTest.kind), 'long-ear', 'reference ears influence the miniature silhouette')
    assert.ok(await page.evaluate(() => window.__assetTest.photoMaps) >= 1, 'animal miniature also receives actual photo surfaces')
    await page.waitForFunction(() => window.__settlementRead().residents.length === 2, null, { timeout: 40000 })
    await page.locator('#resident-enter').click()
    await page.waitForFunction(() => document.querySelector('#settlement-video').readyState >= 2)
    await page.evaluate(async fixture => {
      const data = await fetch(fixture).then(r => r.blob()), file = new File([data], 'dragged.jpg', { type: 'image/jpeg' })
      const transfer = new DataTransfer(); transfer.items.add(file)
      document.querySelector('#settlement-drop').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }))
    }, fixture)
    await page.waitForFunction(() => document.querySelector('.settlement-dialog').dataset.phase === 'countdown')
    await page.locator('#settlement-close').click()
    await page.waitForTimeout(5200)
    assert.equal(await page.evaluate(() => window.__cameraTest.captures.length), 2, 'close cancels pending capture')
    assert.equal(await page.evaluate(() => window.__settlementRead().residents.length), 2, 'cancel preserves existing residents')
    await page.evaluate(() => { window.__cameraTest.mode = 'deny' })
    await page.locator('#resident-enter').click()
    await page.locator('#settlement-camera-retry').waitFor({ state: 'visible' })
    assert.ok((await page.locator('#settlement-camera-note').innerText()).includes('권한'))
    await page.locator('#settlement-close').click()
    await page.evaluate(() => { window.__cameraTest.mode = 'delay' })
    await page.locator('#resident-enter').click()
    await page.waitForFunction(() => !!window.__releaseCamera)
    await page.locator('#settlement-close').click()
    const beforeLate = await page.evaluate(() => window.__cameraTest.stopped)
    await page.evaluate(() => window.__releaseCamera())
    await page.waitForTimeout(300)
    assert.ok(await page.evaluate(() => window.__cameraTest.stopped) > beforeLate, 'late camera stream is stopped after close')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.evaluate(() => { window.__cameraTest.mode = 'ok' })
    await page.locator('#resident-enter').click()
    const boxes = await page.locator('.settlement-pane').evaluateAll(elements => elements.map(el => ({ x: el.getBoundingClientRect().x, width: el.getBoundingClientRect().width, y: el.getBoundingClientRect().y })))
    assert.ok(Math.abs(boxes[0].y - boxes[1].y) < 2 && boxes[1].x > boxes[0].x, 'mobile retains camera/image halves')
    assert.ok(Math.abs(boxes[0].width - boxes[1].width) < 2)
    await page.screenshot({ path: 'artifacts/settlement-mobile.png' })
    await page.evaluate(() => dispatchEvent(new Event('interactive:dispose')))
    assert.deepEqual(errors, [])
    assert.equal(uploads.length, 0, 'camera and reference images are not uploaded')
    console.log('PASS: real HumanSeg/Pose inference, actual masked photo materials, reference-specific ears, five-second capture, reveal/landing/walking, drag-drop, cancel, denied/late camera, mobile halves, local-only processing.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
