const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
let playwright
try { playwright = require('playwright') }
catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }
const base = process.argv[2] || 'http://127.0.0.1:5173'
const artifacts = path.resolve('artifacts/doodleface')
fs.mkdirSync(artifacts, { recursive: true })
let browser, diagnosticPage
const errors = [], remote = []
const mock = `
export const FilesetResolver = { forVisionTasks: async path => { window.metrics.fileset = path; return {} } };
class Model {
 constructor(options) { this.options = options; this.closed = false }
 close() { if (!this.closed) { this.closed = true; window.metrics.closed++ } }
 static async createFromOptions(_, options) {
   window.metrics.options.push(options);
   if (window.fixture.failGpu && options.baseOptions.delegate === 'GPU') throw new Error('GPU fixture failure');
   if (window.fixture.failCpu) throw new Error('model fixture failure');
   if (window.fixture.delayModel === true || (window.fixture.delayModel === 'hands' && options.numHands)) await new Promise(resolve => window.resolveModel = resolve);
   return new this(options);
 }
 count() { const m = window.metrics; m.inferences++; m.perFrame[m.frame] = (m.perFrame[m.frame] || 0) + 1 }
}
export class FaceLandmarker extends Model { detectForVideo() { this.count(); window.metrics.faces++; return { faceLandmarks: window.fixture.faces } } }
export class HandLandmarker extends Model { detectForVideo() { this.count(); window.metrics.hands++; return { landmarks: window.fixture.hands } } }
// Vite's shared production chunk exports the three classes under these aliases.
export { FilesetResolver as a, HandLandmarker as b, FaceLandmarker as m };
`
async function prepare(context, synthetic = true) {
  await context.addInitScript(() => {
    const now = performance.now.bind(performance), raf = requestAnimationFrame.bind(window)
    window.clockOffset = 0
    performance.now = () => now() + window.clockOffset
    window.metrics = { camera: 0, closed: 0, stopped: 0, frame: 0, perFrame: {}, options: [], inferences: 0, faces: 0, hands: 0, copies: [] }
    requestAnimationFrame = callback => raf(time => { window.metrics.frame++; callback(time + window.clockOffset) })
    const oval = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
    const makeFace = x => {
      const f = Array.from({ length: 478 }, () => ({ x, y: .5, z: 0 }))
      oval.forEach((id, i) => { const angle = -Math.PI / 2 + i / oval.length * Math.PI * 2; f[id] = { x: x + Math.cos(angle) * .12, y: .5 + Math.sin(angle) * .25, z: 0 } })
      f[33] = { x: x - .05, y: .43, z: 0 }; f[263] = { x: x + .05, y: .43, z: 0 }
      return f
    }
    window.fixture = { faces: [makeFace(.75), makeFace(.25)], hands: [] }
    const nativeDraw = CanvasRenderingContext2D.prototype.drawImage
    CanvasRenderingContext2D.prototype.drawImage = function(source, ...args) {
      if (source instanceof HTMLVideoElement && this.canvas.className === 'df-canvas') window.metrics.copies.push(args.slice(0, 4))
      return nativeDraw.call(this, source, ...args)
    }
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.metrics.camera++; window.metrics.constraints = constraints
      if (window.fixture.denied) throw new DOMException('denied', 'NotAllowedError')
      const c = document.createElement('canvas'); c.width = 1280; c.height = 720
      window.rawCamera = c
      const g = c.getContext('2d')
      const draw = () => {
        g.fillStyle = '#d8b69b'; g.fillRect(0, 0, 640, 720)
        g.fillStyle = '#a6bfc7'; g.fillRect(640, 0, 640, 720)
        for (let x = 0; x < 1280; x += 80) { g.fillStyle = x % 160 ? '#bfbdab' : '#c3d3d7'; g.fillRect(x, 0, 16, 720) }
        g.fillStyle = '#333'; g.font = '32px Arial'; g.fillText('RAW LEFT', 190, 90); g.fillText('RAW RIGHT', 825, 90)
      }
      draw(); const refresh = setInterval(draw, 33), stream = c.captureStream(30), track = stream.getVideoTracks()[0], stop = track.stop.bind(track)
      track.stop = () => { window.metrics.stopped++; clearInterval(refresh); stop() }
      window.cameraTrack = track
      if (window.fixture.delayCamera) await new Promise(resolve => window.resolveCamera = () => resolve(stream))
      return stream
    }
  })
  if (synthetic) {
    await context.route(/(?:@mediapipe_tasks-vision\.js|vision_bundle-[^/]+\.js)/, route => route.fulfill({ contentType: 'text/javascript', body: mock }))
  }
}
function monitor(page) {
  diagnosticPage = page
  page.on('pageerror', e => errors.push(e.message))
  page.on('request', request => {
    // Existing examples (e.g. Sampler) own their fonts. Inspect DoodleFace requests only.
    if (request.frame().url().includes('/doodleface.html') && !request.url().startsWith(base) && /^https?:/.test(request.url())) remote.push(request.url())
  })
}
async function phase(page, expected) { await page.waitForFunction(p => document.querySelector('.df-app').dataset.phase === p, expected, { timeout: 30000 }) }
async function hand(page, side, u, v, pinch = true) {
  await page.evaluate(({ side, u, v, pinch }) => {
    const x = 1 - (side + u) / 2, gap = pinch ? .004 : .12
    const h = Array.from({ length: 21 }, () => ({ x, y: v + .12, z: 0 }))
    h[5] = { x: x - .05, y: v + .12, z: 0 }; h[17] = { x: x + .05, y: v + .12, z: 0 }
    h[4] = { x: x - gap / 2, y: v, z: 0 }; h[8] = { x: x + gap / 2, y: v, z: 0 }
    window.fixture.hands = [h]
  }, { side, u, v, pinch })
  await page.waitForTimeout(190)
}
async function redInk(page) {
  return page.locator('.df-canvas').first().evaluate(c => {
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0; for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 1] < 115 && data[i + 2] < 120) n++
    return n
  })
}
async function cameraPixels(page, swapped) {
  const samples = await page.locator('.df-canvas').evaluateAll((canvases, swapped) => canvases.flatMap((c, i) => {
    const source = window.rawCamera, t = Math.max(c.width / (source.width / 2), c.height / source.height)
    const w = source.width / 2 * t, h = source.height * t, dx = (c.width - w) / 2, dy = (c.height - h) / 2
    const side = swapped ? 1 - i : i
    return [[.3, .62], [.64, .8]].map(([u, v]) => {
      const x = Math.floor(c.width * u), y = Math.floor(c.height * v)
      const sx = Math.floor((side === 0 ? 640 : 0) + 640 - (x - dx) / t), sy = Math.floor((y - dy) / t)
      return { actual: [...c.getContext('2d').getImageData(x, y, 1, 1).data], expected: [...source.getContext('2d').getImageData(sx, sy, 1, 1).data] }
    })
  }), swapped)
  samples.forEach(s => assert.deepEqual(s.actual, s.expected, 'half-camera cover and mirror pixels'))
}
(async () => {
  browser = await playwright.chromium.launch({ executablePath: process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined, headless: true })
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 })
  await prepare(context)
  const page = await context.newPage(); monitor(page)
  await page.goto(base + '/doodleface.html')
  await page.screenshot({ path: path.join(artifacts, 'lobby-desktop.png') })
  assert.equal(await page.locator('.df-swatch').count(), 20)
  await page.locator('.df-help').click(); assert.equal(await page.locator('#df-instructions').isVisible(), true)
  await page.evaluate(() => { window.fixture.faces = [] })
  await page.locator('.df-start').click(); await phase(page, 'waiting')
  await page.waitForTimeout(200); await cameraPixels(page, false)
  assert.equal(await page.locator('.df-waiting:visible').count(), 2)
  assert.equal(await page.evaluate(() => window.metrics.camera), 1)
  assert.equal(await page.evaluate(() => window.metrics.constraints.audio), false)
  assert.equal(await page.evaluate(() => window.metrics.constraints.video.facingMode), 'user')
  assert.equal(await page.evaluate(() => window.metrics.fileset), '/mediapipe')
  assert.equal(await page.evaluate(() => window.metrics.options[0].numFaces), 2)
  assert.equal(await page.evaluate(() => window.metrics.options[1].numHands), 2)
  await page.screenshot({ path: path.join(artifacts, 'waiting-camera.png') })
  await page.evaluate(() => location.reload()); await page.locator('.df-start').click(); await phase(page, 'countdown')
  await page.evaluate(() => window.clockOffset += 5100); await phase(page, 'swapping')
  await page.waitForTimeout(360)
  const slide = await page.locator('.df-snapshot').evaluateAll(cs => cs.map(c => ({ x: new DOMMatrix(getComputedStyle(c).transform).m41, y: new DOMMatrix(getComputedStyle(c).transform).m42 })))
  assert.equal(slide.length, 2); assert.ok(slide[0].x > 5 && slide[1].x < -5); assert.ok(Math.abs(slide[0].y) < 1)
  assert.equal(await page.locator('.df-timer').innerText(), '60\nSEC')
  await page.screenshot({ path: path.join(artifacts, 'swap-horizontal.png') })
  await phase(page, 'playing'); await page.evaluate(() => window.playStart = performance.now()); await cameraPixels(page, true)
  assert.deepEqual(await page.locator('.df-panel-title').allTextContents(), ['PLAYER 2', 'PLAYER 1'])
  assert.equal(await page.locator('.df-snapshot').count(), 0)
  const player2Color = await page.locator('.df-panel').nth(1).locator('[aria-pressed="true"]').getAttribute('data-color')
  await page.locator('.df-panel').first().locator('[data-color="#91c65b"]').click()
  assert.equal(await page.locator('.df-panel').nth(1).locator('[aria-pressed="true"]').getAttribute('data-color'), player2Color)
  // Pinch-select a palette swatch using the exact inverse of camera cover.
  const swatchPoint = await page.locator('.df-panel').first().evaluate(el => {
    const r = el.querySelector('.df-picture').getBoundingClientRect(), b = el.querySelector('[data-color="#ed5657"]').getBoundingClientRect()
    const s = Math.max(r.width / 640, r.height / 720), w = 640 * s, h = 720 * s
    return { u: (b.x + b.width / 2 - r.x - (r.width - w) / 2) / w, v: (b.y + b.height / 2 - r.y - (r.height - h) / 2) / h }
  })
  await hand(page, 0, swatchPoint.u, swatchPoint.v)
  await page.waitForFunction(() => document.querySelector('.df-panel [aria-pressed="true"]').dataset.color === '#ed5657')
  assert.equal(await page.locator('.df-panel').first().locator('[aria-pressed="true"]').getAttribute('data-color'), '#ed5657')
  await hand(page, 0, .5, .5, false); await page.waitForTimeout(160)
  await hand(page, 0, .5, .5)
  for (const u of [.54, .58, .62, .67, .74, .79]) await hand(page, 0, u, .5)
  await page.screenshot({ path: path.join(artifacts, 'pencil-tip.png') })
  await page.evaluate(() => { window.fixture.hands = [] }); await page.waitForTimeout(90)
  await hand(page, 0, .81, .53)
  await hand(page, 0, .81, .53, false); await page.waitForTimeout(180)
  await page.evaluate(() => { window.fixture.hands = [] }); await page.waitForTimeout(280)
  const pixels = await redInk(page); assert.ok(pixels > 100, 'ink remains after stable pinch release')
  await page.screenshot({ path: path.join(artifacts, 'doodled-desktop.png') })
  await hand(page, 1, .5, .5); await hand(page, 1, .58, .54)
  await hand(page, 1, .58, .54, false); await page.waitForTimeout(180)
  await page.evaluate(() => { window.fixture.hands = [] }); await page.waitForTimeout(280)
  const blue = await page.locator('.df-canvas').nth(1).evaluate(c => {
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let n = 0; for (let i = 0; i < data.length; i += 4) if (data[i] < 120 && data[i + 1] > 100 && data[i + 1] < 190 && data[i + 2] > 200) n++
    return n
  })
  assert.ok(blue > 100, 'PLAYER 2 draws blue ink in right opponent panel independently')
  await page.evaluate(() => { window.fixture.faces.forEach(f => f.forEach(p => { p.y += .03 })) })
  await page.waitForTimeout(250); assert.ok(await redInk(page) > 100, 'ink follows moving opponent')
  assert.equal(await page.evaluate(() => Math.max(...Object.values(window.metrics.perFrame))), 1)
  assert.ok(await page.evaluate(() => window.metrics.hands) > 10)
  // The finish guide lasts 2.4 seconds, then the swapped result lasts ten seconds.
  await page.evaluate(() => window.clockOffset += 60010 - (performance.now() - window.playStart)); await phase(page, 'reveal'); assert.equal(await page.locator('.df-notice').isVisible(), true)
  await page.evaluate(() => window.clockOffset += 2450); await phase(page, 'result'); assert.equal(await page.locator('.df-notice').isVisible(), false)
  await page.screenshot({ path: path.join(artifacts, 'result.png') })
  await page.evaluate(() => window.clockOffset += 10050); await phase(page, 'lobby')
  assert.equal(await page.evaluate(() => window.cameraTrack.readyState), 'ended')
  assert.equal(await page.evaluate(() => window.metrics.closed), 2)
  const stoppedFrames = await page.evaluate(() => window.metrics.frame); await page.waitForTimeout(150)
  assert.equal(await page.evaluate(() => window.metrics.frame), stoppedFrames)
  console.log('PASS desktop: local halves, countdown, moving swap, pinch palette, attached ink, one inference/frame, finish and cleanup')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => { Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2 }); Object.defineProperty(window, 'devicePixelRatio', { value: 3 }) })
  await page.reload()
  await page.screenshot({ path: path.join(artifacts, 'lobby-mobile.png') })
  await page.locator('.df-start').click(); await phase(page, 'countdown')
  assert.equal(await page.evaluate(() => window.metrics.constraints.video.frameRate.max), 24)
  assert.ok(await page.locator('.df-canvas').first().evaluate(c => Math.abs(c.width - c.getBoundingClientRect().width) < 1), 'low device caps canvas DPR at one')
  await page.evaluate(() => window.clockOffset += 5100); await phase(page, 'swapping'); await page.waitForTimeout(350)
  const vertical = await page.locator('.df-snapshot').evaluateAll(cs => cs.map(c => ({ x: new DOMMatrix(getComputedStyle(c).transform).m41, y: new DOMMatrix(getComputedStyle(c).transform).m42 })))
  assert.ok(vertical[0].y > 5 && vertical[1].y < -5); assert.ok(Math.abs(vertical[0].x) < 1)
  await page.screenshot({ path: path.join(artifacts, 'swap-vertical.png') })
  await phase(page, 'playing'); await cameraPixels(page, true)
  assert.ok(await page.locator('.df-stage').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), 'both mobile panels fit on screen while playing')
  await page.screenshot({ path: path.join(artifacts, 'playing-mobile.png') })
  await page.locator('.df-exit').click(); await phase(page, 'lobby')
  console.log('PASS mobile: vertical slide and swapped half-camera pixels')

  await page.reload(); await page.evaluate(() => window.fixture.failGpu = true)
  await page.locator('.df-start').click(); await phase(page, 'waiting')
  assert.ok(await page.evaluate(() => window.metrics.options.some(o => o.baseOptions.delegate === 'CPU')))
  await page.locator('.df-exit').click()
  await page.evaluate(() => window.fixture.denied = true); await page.locator('.df-start').click(); await phase(page, 'lobby')
  assert.match(await page.locator('.df-error').innerText(), /권한/)
  await page.evaluate(() => { window.fixture.denied = false; window.fixture.failCpu = true })
  await page.locator('.df-start').click(); await phase(page, 'lobby'); assert.match(await page.locator('.df-error').innerText(), /모델/)
  assert.equal(await page.evaluate(() => window.cameraTrack.readyState), 'ended')
  await page.evaluate(() => { window.fixture.failCpu = false; window.fixture.failGpu = false })
  await page.locator('.df-start').click(); await phase(page, 'waiting'); await page.locator('.df-exit').click()
  console.log('PASS GPU fallback, camera denial, model failure and retry')

  // Hub route switch tears down synchronously; other tabs still work.
  await page.setViewportSize({ width: 1100, height: 900 }); await page.goto(base + '/#doodleface')
  const frame = page.frameLocator('#example-frame'); await frame.locator('.df-start').click(); await frame.locator('.df-app[data-phase="waiting"]').waitFor()
  await page.evaluate(() => { window.outgoing = document.querySelector('iframe').contentWindow; window.oldTrack = window.outgoing.cameraTrack })
  await page.locator('#tab-sampler').click(); assert.equal(await page.evaluate(() => window.oldTrack.readyState), 'ended')
  await frame.locator('canvas').first().waitFor(); assert.equal(await page.locator('#tab-sampler').getAttribute('aria-selected'), 'true')
  await page.locator('#tab-doodleface').click(); await frame.locator('.df-start').waitFor()
  await page.screenshot({ path: path.join(artifacts, 'hub-menu.png') })
  await page.goto(base + '/doodleface.html'); await page.evaluate(() => window.fixture.delayCamera = true)
  await page.locator('.df-start').click(); await page.waitForFunction(() => !!window.resolveCamera)
  await page.evaluate(() => { dispatchEvent(new Event('interactive:dispose')); window.resolveCamera() })
  await page.waitForFunction(() => window.cameraTrack.readyState === 'ended')
  await page.goto(base + '/doodleface.html'); await page.evaluate(() => window.fixture.delayModel = true)
  await page.locator('.df-start').click(); await page.waitForFunction(() => !!window.resolveModel)
  await page.evaluate(() => { dispatchEvent(new Event('interactive:dispose')); window.resolveModel() })
  await page.waitForFunction(() => window.metrics.closed === 1)
  assert.equal(await page.evaluate(() => window.cameraTrack.readyState), 'ended')
  await page.goto(base + '/doodleface.html'); await page.evaluate(() => window.fixture.delayModel = 'hands')
  await page.locator('.df-start').click(); await page.waitForFunction(() => !!window.resolveModel)
  await page.evaluate(() => dispatchEvent(new Event('interactive:dispose')))
  assert.equal(await page.evaluate(() => window.metrics.closed), 1, 'face graph closes immediately while hand graph initializes')
  await page.evaluate(() => window.resolveModel()); await page.waitForFunction(() => window.metrics.closed === 2)
  await page.goto(base + '/doodleface.html'); await page.locator('.df-start').click(); await phase(page, 'countdown')
  await page.evaluate(() => window.clockOffset += 5100); await phase(page, 'swapping')
  await page.evaluate(() => dispatchEvent(new Event('interactive:dispose')))
  assert.equal(await page.locator('.df-snapshot').count(), 0)
  assert.equal(await page.evaluate(() => window.cameraTrack.readyState), 'ended')
  assert.equal(await page.evaluate(() => window.metrics.closed), 2)
  await page.goto(base + '/doodleface.html'); await page.evaluate(() => Object.defineProperty(window, 'isSecureContext', { value: false }))
  await page.locator('.df-start').click(); await phase(page, 'lobby'); assert.match(await page.locator('.df-error').innerText(), /HTTPS/)
  assert.equal(await page.evaluate(() => window.metrics.camera), 0)
  console.log('PASS route integration, late async cleanup and insecure-context message')

  // Actual MediaPipe, local WASM and both local models. No mocked inference module.
  const real = await browser.newContext({ viewport: { width: 1100, height: 900 } }); await prepare(real, false)
  const realPage = await real.newPage(); monitor(realPage)
  await realPage.goto(base + '/doodleface.html'); await realPage.locator('.df-start').click(); await phase(realPage, 'waiting')
  await realPage.waitForTimeout(600); await cameraPixels(realPage, false)
  assert.equal(await realPage.locator('.df-waiting:visible').count(), 2)
  await realPage.screenshot({ path: path.join(artifacts, 'real-local-models.png') })
  await realPage.locator('.df-exit').click(); assert.equal(await realPage.evaluate(() => window.cameraTrack.readyState), 'ended')
  await real.close()
  assert.deepEqual(errors, []); assert.deepEqual(remote, [])
  console.log('PASS real local MediaPipe initialization and face inference; no external HTTP requests or page errors')
  console.log('Screenshots:', artifacts)
  await browser.close()
})().catch(async e => {
  console.error(e); console.error('Page errors:', errors)
  if (diagnosticPage && !diagnosticPage.isClosed()) {
    console.error('State:', await diagnosticPage.evaluate(() => ({ phase: document.querySelector('.df-app')?.dataset.phase, error: document.querySelector('.df-error')?.textContent, metrics: window.metrics })))
    await diagnosticPage.screenshot({ path: path.join(artifacts, 'failure.png') })
  }
  await browser?.close(); process.exitCode = 1
})
