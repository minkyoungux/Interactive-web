// Real model startup, then deterministic yaw / face-loss and resource lifecycle checks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const base = process.env.PRISM_BROWSER_URL || 'http://127.0.0.1:5173';
const canonical = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/prism-face/canonical-face.json'), 'utf8'));
let browser;
(async () => {
  browser = await playwright.chromium.launch({
    executablePath: process.env.PRISM_CHROME_EXECUTABLE || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
    headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/prism-face.html`);
  await page.locator('#prism-camera').click();
  await page.waitForFunction(() => document.querySelector('#prism-camera').textContent === '카메라 끄기', {}, { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.locator('#prism-camera').click();
  assert.equal(await page.locator('video').evaluate(v => v.srcObject), null);
  console.log('real local MediaPipe worker initializes and stops');

  await page.addInitScript(({ vertices }) => {
    window.fixture = { yaw: 0, found: true, inferred: 0, terminated: 0, frames: 0 };
    const raf = requestAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => { window.fixture.frames++; return raf(callback); };
    window.Worker = class {
      postMessage(data) {
        if (data.type === 'init') { setTimeout(() => this.onmessage?.({ data: { type: 'ready' } }), 20); return; }
        if (data.type !== 'frame') return;
        data.bitmap.close(); window.fixture.inferred++;
        const a = window.fixture.yaw, c = Math.cos(a), s = Math.sin(a);
        const points = window.fixture.found ? vertices.map(([x,y,z]) => ({ x: .5 - (x*c+(z-3)*s)*.025, y: .5-y*.034, z: (x*s-(z-3)*c)*.025 })) : [];
        this.onmessage?.({ data: { type: 'face', points, matrix: [c,0,s,0,0,1,0,0,-s,0,c,0,0,0,0,1], time: data.time } });
      }
      terminate() { window.fixture.terminated++; }
    };
  }, { vertices: canonical.vertices });
  await page.reload(); await page.locator('#prism-camera').click();
  await page.waitForFunction(() => document.querySelector('.prism-status').textContent.includes('TRACKING'));
  await page.evaluate(() => { window.fixture.yaw = .8; });
  await page.waitForFunction(() => parseInt(document.querySelector('.prism-percent').textContent) > 65);
  console.log('head rotation disperses particles');
  await page.evaluate(() => { window.fixture.yaw = 0; });
  await page.waitForFunction(() => parseInt(document.querySelector('.prism-percent').textContent) < 8, {}, { timeout: 12000 });
  console.log('front pose reassembles particles');
  await page.evaluate(() => { window.fixture.yaw = .8; });
  await page.waitForFunction(() => parseInt(document.querySelector('.prism-percent').textContent) > 65);
  await page.locator('#prism-reset').click();
  await page.waitForFunction(() => parseInt(document.querySelector('.prism-percent').textContent) < 8);
  await page.locator('#prism-camera').click();
  await page.locator('#prism-camera').click();
  await page.waitForFunction(() => document.querySelector('.prism-status').textContent.includes('TRACKING'));
  await page.waitForFunction(() => parseInt(document.querySelector('.prism-percent').textContent) < 8);
  console.log('reset and camera restart calibrate the current pose');
  await page.evaluate(() => { window.fixture.found = false; });
  await page.waitForFunction(() => document.querySelector('.prism-status').textContent.includes('얼굴을 비춰'));
  await page.evaluate(() => { window.fixture.found = true; });
  await page.waitForFunction(() => document.querySelector('.prism-status').textContent.includes('TRACKING'));
  console.log('face loss and reacquisition update the portrait');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(100);
  const paused = await page.evaluate(() => ({ frames: window.fixture.frames, inferred: window.fixture.inferred }));
  assert.equal(await page.locator('video').evaluate(v => v.srcObject.getVideoTracks()[0].enabled), false);
  await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(() => ({ frames: window.fixture.frames, inferred: window.fixture.inferred })), paused);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(200);
  assert.equal(await page.locator('video').evaluate(v => v.srcObject.getVideoTracks()[0].enabled), true);
  console.log('hidden tab pauses rendering, inference and camera track');
  await page.evaluate(() => { window.lastTrack = document.querySelector('video').srcObject.getVideoTracks()[0]; window.dispatchEvent(new Event('interactive:dispose')); });
  assert.equal(await page.evaluate(() => window.lastTrack.readyState), 'ended');
  assert.equal(await page.locator('video').evaluate(v => v.srcObject), null);
  assert.equal(await page.evaluate(() => window.fixture.terminated), 2);
  console.log('hub disposal releases stream and worker');

  const denied = await browser.newPage();
  denied.on('pageerror', e => errors.push(e.message));
  await denied.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  await denied.goto(`${base}/prism-face.html`); await denied.locator('#prism-camera').click();
  await denied.locator('.prism-error').waitFor({ state: 'visible' });
  assert.match(await denied.locator('.prism-error').innerText(), /권한/);
  assert.equal(await denied.locator('#prism-camera').isEnabled(), true);
  console.log('permission denial leaves retry and preview available');
  assert.deepEqual(errors, []);
  await browser.close(); console.log('Prism Face browser checks passed');
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });
