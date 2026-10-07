const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
let playwright
try { playwright = require('playwright') }
catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }

const base = process.argv[2] || 'http://127.0.0.1:5173'
const artifacts = path.resolve('artifacts/face-paint')
fs.mkdirSync(artifacts, { recursive: true })
const mock = `
export const FilesetResolver = { forVisionTasks: async path => { window.metrics.fileset = path; return {} } };
function face() {
  const target = document.querySelector('.fp-calibration-target');
  const tx = target ? parseFloat(target.style.left) : 50, ty = target ? parseFloat(target.style.top) : 50;
  const gx = window.fixture.gaze ?? (tx < 30 ? .35 : tx > 70 ? .65 : .5);
  const gy = window.fixture.gazeY ?? (ty < 30 ? .35 : ty > 70 ? .65 : .5);
  const p = Array.from({ length: 478 }, () => ({ x: .5, y: .5, z: 0 }));
  p[33]={x:.30,y:.42};p[133]={x:.43,y:.42};p[159]=p[160]={x:.36,y:.39};p[144]=p[145]={x:.36,y:.45};
  p[362]={x:.57,y:.42};p[263]={x:.70,y:.42};p[385]=p[386]={x:.64,y:.39};p[374]=p[380]={x:.64,y:.45};
  for(const i of [468,469,470,471,472])p[i]={x:.30+gx*.13,y:.39+gy*.06};
  for(const i of [473,474,475,476,477])p[i]={x:.57+gx*.13,y:.39+gy*.06};
  p[234]={x:.28,y:.5};p[454]={x:.72,y:.5};p[1]={x:.5+(window.fixture.yaw||0),y:.5};
  p[61]={x:.42,y:.58};p[291]={x:.58,y:.58};p[13]={x:.5,y:.577};p[14]={x:.5,y:.583};
  for(const i of [10,338,284,389,397,379,152,176,172,162]) if(!p[i]) p[i]={x:.5,y:.5};
  return p;
}
export class FaceLandmarker {
  static async createFromOptions(_, options) { window.metrics.options = options; return new FaceLandmarker() }
  detectForVideo() { return { faceLandmarks: [face()], faceBlendshapes: [{ categories: [{ categoryName: 'jawOpen', score: window.fixture.jaw }] }] } }
  close() { window.metrics.closed++ }
}
export { FilesetResolver as a, FaceLandmarker as m };
`

;(async () => {
  const browser = await playwright.chromium.launch({ executablePath: process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined, headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 })
  await context.addInitScript(() => {
    const nativeRaf = requestAnimationFrame.bind(window), nativeNow = performance.now.bind(performance)
    window.clockOffset = 0; performance.now = () => nativeNow() + window.clockOffset
    requestAnimationFrame = callback => nativeRaf(time => { window.clockOffset += 38; callback(time + window.clockOffset) })
    window.fixture = { jaw: 0, yaw: 0 }; window.metrics = { stopped: 0, closed: 0 }
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.metrics.constraints = constraints
      const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 720
      const draw = () => { const g = canvas.getContext('2d'); g.fillStyle = '#443f49'; g.fillRect(0,0,960,720); g.fillStyle='#d9ad91'; g.beginPath(); g.ellipse(480,360,190,260,0,0,Math.PI*2); g.fill() }
      draw(); const timer = setInterval(draw, 33), stream = canvas.captureStream(30), track = stream.getVideoTracks()[0], stop = track.stop.bind(track)
      track.stop = () => { clearInterval(timer); window.metrics.stopped++; stop() }; window.cameraTrack = track; return stream
    }
  })
  await context.route(/(?:@mediapipe_tasks-vision\.js|vision_bundle-[^/]+\.js)/, route => route.fulfill({ contentType: 'text/javascript', body: mock }))
  const page = await context.newPage(), errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(base + '/face-paint.html')
  await page.screenshot({ path: path.join(artifacts, 'idle-desktop.png'), fullPage: true })
  assert.equal(await page.locator('h1').innerText(), '표정으로\n그리는 그림.')
  await page.locator('.fp-camera').click()
  await page.locator('.fp-app[data-phase="live"]').waitFor({ timeout: 15000 })
  assert.equal(await page.evaluate(() => window.metrics.constraints.audio), false)
  assert.equal(await page.evaluate(() => window.metrics.options.outputFaceBlendshapes), true)
  await page.evaluate(() => { window.fixture.gaze = .66; window.fixture.gazeY = .58; window.fixture.jaw = .9 })
  await page.waitForTimeout(420)
  await page.evaluate(() => { window.fixture.jaw = 0 })
  await page.waitForTimeout(180)
  assert.equal(await page.locator('.fp-mouth-value').textContent(), 'CLOSED')
  const ink = await page.locator('.fp-drawing').evaluate(canvas => { const data = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data; let count=0; for(let i=0;i<data.length;i+=4) if(data[i]>210&&data[i+1]<130&&data[i+2]<110) count++; return count })
  assert.ok(ink > 10, 'mouth-open frames create a colored stroke')
  const before = await page.locator('.fp-color-name').innerText()
  await page.evaluate(() => { window.fixture.yaw = .06 }); await page.waitForTimeout(300)
  await page.evaluate(() => { window.fixture.yaw = 0 }); await page.waitForTimeout(100)
  assert.notEqual(await page.locator('.fp-color-name').innerText(), before)
  await page.screenshot({ path: path.join(artifacts, 'live-drawing.png'), fullPage: true })
  await page.locator('.fp-camera').click(); await page.locator('.fp-app[data-phase="idle"]').waitFor()
  assert.equal(await page.evaluate(() => window.cameraTrack.readyState), 'ended')
  assert.equal(await page.evaluate(() => window.metrics.closed), 1)
  await page.goto(base + '/#face-paint')
  await page.locator('#tab-face-paint[aria-selected="true"]').waitFor()
  await page.frameLocator('#example-frame').locator('.fp-app').waitFor()
  assert.equal(await page.locator('#tab-face-paint span').innerText(), '19')
  assert.match(await page.locator('#open-example').getAttribute('href'), /face-paint\.html$/)
  assert.deepEqual(errors, [])
  await browser.close()
  console.log('PASS face paint: layout, calibration, mouth ink, head palette, cleanup and gallery route')
})().catch(error => { console.error(error); process.exitCode = 1 })
