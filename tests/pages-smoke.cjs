// Run after: npm run build -- --base=/interactive/
const assert = require('node:assert/strict')
const path = require('node:path')
const os = require('node:os')
let playwright
try { playwright = require('playwright') }
catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }

;(async () => {
  const { preview } = await import('vite')
  const base = process.env.PAGES_TEST_BASE || '/interactive/'
  const server = await preview({ base, preview: { host: '127.0.0.1', port: 0, open: false } })
  let browser
  try {
    const address = server.httpServer.address()
    const origin = `http://127.0.0.1:${address.port}`
    browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const errors = [], failed = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('response', response => {
      if (response.url().startsWith(origin) && response.status() >= 400) failed.push(response.url())
    })
    await page.goto(`${origin}${base}#season-forest`)
    const frameElement = page.locator('iframe')
    await frameElement.waitFor()
    assert.equal(await frameElement.getAttribute('src'), `${base}season-forest.html`)
    assert.equal(await page.locator('#open-example').getAttribute('href'), `${base}season-forest.html`)
    const forest = page.frameLocator('iframe')
    await forest.locator('.world-stage canvas').waitFor()
    await forest.locator('#resident-roster option').nth(5).waitFor({ state: 'attached' })
    assert.equal(await forest.locator('.forest-brand').getAttribute('href'), `${base}#season-forest`)

    // Check real model/image responses, not Vite's HTML fallback.
    for (const asset of [
      'mediapipe/vision_wasm_internal.wasm',
      'mediapipe/pose_landmarker_lite.task',
      'mediapipe/interactive_segmentation.task',
      'shampoo/selfie_segmenter.tflite',
      'lemonade/mediapipe/hand_landmarker.task',
      'lemonade/lemon.png',
      'prism-face/canonical-face.json',
      'assets/nodd-dogs/golden.jpg',
    ]) {
      const response = await page.request.head(`${origin}${base}${asset}`)
      assert.equal(response.status(), 200, asset)
      assert.ok(!response.headers()['content-type'].includes('text/html'), asset)
    }
    await page.goto(`${origin}${base}anyma.html`)
    assert.equal(await page.locator('.cat-game-link').getAttribute('href'), `${base}game.html`)
    await page.waitForLoadState('networkidle')
    assert.deepEqual(errors, [], 'Browser runtime errors')
    assert.deepEqual(failed, [], 'Failed local asset requests')
    console.log('PASS: Pages subpath, hub → forest, resident initialization, home links and model/image paths. No camera capture or multi-platform tests.')
  } finally {
    await browser?.close()
    await new Promise(resolve => server.httpServer.close(resolve))
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
