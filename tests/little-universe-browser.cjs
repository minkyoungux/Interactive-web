const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const base = process.env.UNIVERSE_BROWSER_URL || 'http://127.0.0.1:5173';
const canonical = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/prism-face/canonical-face.json'), 'utf8'));
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'little-universe-browser-'));
let browser;
(async () => {
  browser = await playwright.chromium.launch({
    executablePath: process.env.UNIVERSE_CHROME_EXECUTABLE || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
    headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && /THREE|WebGL/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${base}/little-universe.html`);
  await page.locator('#universe-camera').click();
  await page.waitForFunction(() => document.querySelector('#universe-camera').textContent === '카메라 끄기', {}, { timeout: 30000 });
  await page.locator('#universe-camera').click();
  assert.equal(await page.locator('video').evaluate(v => v.srcObject), null);
  console.log('real local face + blendshape worker initializes');

  await page.addInitScript(({ vertices }) => {
    window.fixture = { mouth: 0, left: .95, right: .95, found: true, inferred: 0, terminated: 0, frames: 0 };
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => { window.fixture.frames++; return raf(callback); };
    window.Worker = class {
      postMessage(data) {
        if (data.type === 'init') { setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 20); return; }
        if (data.type !== 'frame') return;
        data.bitmap.close(); window.fixture.inferred++;
        const points = window.fixture.found ? vertices.map(([x,y,z]) => ({ x: .5-x*.025, y: .5-y*.034, z: -(z-3)*.025 })) : [];
        this.onmessage?.({ data: { type: 'face', points, mouth: window.fixture.mouth, left: window.fixture.left, right: window.fixture.right, time: data.time } });
      }
      terminate() { window.fixture.terminated++; }
    };
  }, { vertices: canonical.vertices });
  await page.reload(); await page.locator('#universe-camera').click();
  await page.waitForFunction(() => document.querySelector('.prism-status').textContent.includes('MOUTH CLOSED'));
  assert.equal(await page.locator('#universe-preview').isDisabled(), true);
  // Eye scores are deliberately high while the mouth stays closed.
  await page.waitForTimeout(600);
  assert.ok(await page.locator('canvas.prism-world').evaluate(c => Number(c.dataset.dream)) < .01);
  await page.evaluate(() => { window.fixture.mouth = .95; });
  await page.waitForTimeout(80);
  await page.evaluate(() => { window.fixture.mouth = 0; });
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#open-seconds').innerText(), '0.0');
  console.log('eye closure and brief lip noise do not trigger the universe');

  await page.evaluate(() => { window.fixture.mouth = .95; });
  await page.waitForFunction(() => Number(document.querySelector('canvas.prism-world').dataset.dream) > .24);
  const midway = await page.locator('canvas.prism-world').evaluate(c => Number(c.dataset.dream));
  assert.ok(midway < .6);
  await page.screenshot({ path: path.join(artifacts, 'flight-early.png') });
  await page.evaluate(() => { window.fixture.mouth = 0; });
  await page.waitForFunction(start => Number(document.querySelector('canvas.prism-world').dataset.dream) < start - .08, midway, { timeout: 2500 });
  await page.waitForFunction(() => Number(document.querySelector('canvas.prism-world').dataset.dream) < .01);
  console.log('mouth closing during flight reverses movement immediately');

  await page.evaluate(() => { window.fixture.mouth = .95; });
  await page.waitForFunction(() => Number(document.querySelector('canvas.prism-world').dataset.dream) > .42);
  await page.screenshot({ path: path.join(artifacts, 'flight-middle.png') });
  await page.waitForFunction(() => Number(document.querySelector('canvas.prism-world').dataset.dream) > .70);
  await page.screenshot({ path: path.join(artifacts, 'flight-late.png') });
  await page.waitForFunction(() => Number(document.querySelector('canvas.prism-world').dataset.dream) > .99, {}, { timeout: 12000 });
  const firstScale = Number(await page.locator('#open-seconds').innerText());
  await page.waitForTimeout(1000);
  assert.ok(Number(await page.locator('#open-seconds').innerText()) > firstScale + .5);
  await page.screenshot({ path: path.join(artifacts, 'mouth-open-galaxy.png') });
  console.log('mouth opening produces distinct intermediate flight frames before the galaxy');
  await page.evaluate(() => { window.fixture.mouth = 0; });
  await page.waitForFunction(() => document.querySelector('.prism-status').textContent.includes('COMING HOME'));
  assert.equal(await page.locator('#open-seconds').innerText(), '0.0');
  await page.waitForFunction(() => Number(document.querySelector('canvas.prism-world').dataset.dream) < .01, {}, { timeout: 12000 });
  await page.screenshot({ path: path.join(artifacts, 'mouth-closed-portrait.png') });
  console.log('mouth closing returns the particles to the face without a viewing delay');

  await page.evaluate(() => { window.fixture.mouth = .95; });
  await page.waitForFunction(() => Number(document.querySelector('#open-seconds').textContent) > .5);
  await page.evaluate(() => { window.fixture.found = false; });
  await page.waitForFunction(() => document.querySelector('.prism-status').textContent.includes('얼굴을 비춰'));
  assert.equal(await page.locator('#open-seconds').innerText(), '0.0');
  await page.evaluate(() => { window.fixture.found = true; window.fixture.mouth = 0; });
  await page.waitForFunction(() => document.querySelector('.prism-status').textContent.includes('MOUTH CLOSED'));
  console.log('tracking loss resets mouth-open time; reacquisition resumes');

  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(100);
  const paused = await page.evaluate(() => ({ frames: window.fixture.frames, inferred: window.fixture.inferred }));
  assert.equal(await page.locator('video').evaluate(v => v.srcObject.getVideoTracks()[0].enabled), false);
  await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(() => ({ frames: window.fixture.frames, inferred: window.fixture.inferred })), paused);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  assert.equal(await page.locator('video').evaluate(v => v.srcObject.getVideoTracks()[0].enabled), true);
  await page.evaluate(() => { window.lastTrack = document.querySelector('video').srcObject.getVideoTracks()[0]; });
  await page.locator('#universe-camera').click();
  assert.equal(await page.evaluate(() => window.lastTrack.readyState), 'ended');
  assert.equal(await page.locator('video').evaluate(v => v.srcObject), null);
  console.log('hidden tab pauses camera and inference; camera off releases tracks');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#universe-preview').focus(); await page.keyboard.down('Space');
  await page.waitForFunction(() => document.querySelector('canvas.prism-world').dataset.dream > .9);
  await page.screenshot({ path: path.join(artifacts, 'mobile-universe.png') });
  await page.keyboard.up('Space');
  await page.locator('#universe-reset').click();
  await page.waitForFunction(() => Number(document.querySelector('canvas.prism-world').dataset.dream) < .03);
  console.log('mobile and keyboard preview return particles without a hold');
  const photoEvent = page.waitForEvent('download');
  await page.locator('.capture-button').press('Enter');
  const photo = await photoEvent;
  assert.ok(fs.statSync(await photo.path()).size > 10000);
  await page.locator('.capture-button').focus(); await page.keyboard.down('Space');
  await page.waitForTimeout(650); await page.keyboard.up('Space');
  await page.waitForFunction(() => document.querySelector('.capture-button').classList.contains('is-recording'), {}, { timeout: 30000 });
  await page.waitForTimeout(700);
  const movieEvent = page.waitForEvent('download'); await page.locator('.capture-button').press('Enter');
  const movie = await movieEvent;
  assert.ok(fs.statSync(await movie.path()).size > 1000);
  console.log('photos and videos record the moving particles');

  await page.locator('#universe-camera').click();
  await page.waitForFunction(() => document.querySelector('.prism-status').textContent.includes('MOUTH CLOSED'));
  await page.evaluate(() => { window.lastTrack = document.querySelector('video').srcObject.getVideoTracks()[0]; window.dispatchEvent(new Event('interactive:dispose')); });
  assert.equal(await page.evaluate(() => window.lastTrack.readyState), 'ended');
  assert.equal(await page.evaluate(() => window.fixture.terminated), 2);
  console.log('hub disposal terminates worker and camera');
  assert.deepEqual(errors, []);
  await browser.close(); console.log('Little Universe browser checks passed:', artifacts);
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });
