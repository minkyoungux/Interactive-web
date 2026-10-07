const assert = require('node:assert/strict')
const path = require('node:path')
const os = require('node:os')
let playwright
try { playwright = require('playwright') }
catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }
const base = process.argv[2] || 'https://127.0.0.1:5173'

;(async () => {
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') console.error(message.text()) })
    // Test-only instrumentation, never exposed by the application itself.
    await page.route('**/src/season-forest.ts*', async route => {
      const response = await route.fetch()
      const source = await response.text()
      assert.ok(source.includes('animateOcean(0);'))
      await route.fulfill({ response, body: source.replace('animateOcean(0);', 'animateOcean(0); window.__forestProbe = { trees, swimmers, camera, islands, controls };') })
    })
    await page.goto(`${base}/season-forest.html`)
    await page.waitForFunction(() => window.__forestProbe?.trees.length > 0, null, { timeout: 10000 }).catch(async error => {
      console.error(await page.evaluate(() => ({ url: location.href, probe: typeof window.__forestProbe, count: window.__forestProbe?.trees.length, error: document.querySelector('.render-error')?.hidden })))
      throw error
    })
    const target = await page.evaluate(() => {
      const { trees, camera } = window.__forestProbe
      const rect = document.querySelector('canvas').getBoundingClientRect()
      return trees.map((tree, index) => {
        const p = tree.group.position.clone().project(camera)
        return { index, x: rect.x + (p.x + 1) * rect.width / 2, y: rect.y + (1 - p.y) * rect.height / 2, z: tree.group.position.z }
      }).filter(p => p.z > 2).sort((a, b) => Math.hypot(a.x - 600, a.y - 380) - Math.hypot(b.x - 600, b.y - 380))[0]
    })
    const initial = await page.evaluate(index => {
      const { trees, camera } = window.__forestProbe, t = trees[index], part = t.parts[0]
      return { root: t.group.position.toArray(), matrix: Array.from(part.batch.instanceMatrix.array.slice(part.index * 16, (part.index + 1) * 16)), camera: camera.position.toArray() }
    }, target.index)
    async function stir(x, y) {
      await page.mouse.move(x - 45, y)
      for (let i = 0; i < 5; i++) await page.mouse.move(x + (i % 2 ? -45 : 45), y + (i % 2 ? -8 : 8), { steps: 8 })
    }
    await stir(target.x, target.y)
    const shaken = await page.evaluate(index => {
      const { trees, camera } = window.__forestProbe, t = trees[index], part = t.parts[0]
      return { tilt: Math.hypot(t.x, t.z), root: t.group.position.toArray(), matrix: Array.from(part.batch.instanceMatrix.array.slice(part.index * 16, (part.index + 1) * 16)), camera: camera.position.toArray() }
    }, target.index)
    assert.ok(shaken.tilt > .03, `tree tilt: ${shaken.tilt}`)
    assert.notDeepEqual(shaken.matrix, initial.matrix, 'GPU instance transforms actually change')
    assert.deepEqual(shaken.root, initial.root, 'roots remain fixed')
    assert.deepEqual(shaken.camera, initial.camera, 'hover interaction does not rotate the camera')
    await page.screenshot({ path: 'artifacts/season-forest-shaken.png' })
    const fish = await page.evaluate(() => {
      const { swimmers, camera } = window.__forestProbe
      const rect = document.querySelector('canvas').getBoundingClientRect()
      const swimmer = swimmers.filter(s => s.group.position.z > 2.6).sort((a, b) => b.group.position.z - a.group.position.z)[0]
      const p = swimmer.group.position.clone().project(camera)
      return { x: rect.x + (p.x + 1) * rect.width / 2, y: rect.y + (1 - p.y) * rect.height / 2 }
    })
    await stir(fish.x, fish.y)
    await page.waitForTimeout(180)
    const fleeing = await page.evaluate(() => window.__forestProbe.swimmers.map(s => ({ panic: s.reaction.panic, offset: Math.hypot(s.reaction.x, s.reaction.y) })))
    assert.ok(fleeing.some(s => s.panic > .3 && s.offset > .002), 'swimmers flee off their patrol route')
    await page.mouse.move(30, 30)
    await page.waitForTimeout(7500)
    const settled = await page.evaluate(() => ({ tilt: Math.max(...window.__forestProbe.trees.map(t => Math.hypot(t.x, t.z))), panic: Math.max(...window.__forestProbe.swimmers.map(s => s.reaction.panic)) }))
    assert.ok(settled.tilt < .002, `trees recover: ${settled.tilt}`)
    assert.ok(settled.panic < .01, `fish calm down: ${settled.panic}`)
    const safe = await page.evaluate(async () => {
      const { waterFootprint } = await import('/src/season-forest-ocean.ts')
      const { swimmers, islands } = window.__forestProbe
      return swimmers.every(s => {
        const p = s.group.position
        return waterFootprint(Math.asin(p.y / p.length()), Math.atan2(p.x, p.z), islands)
      })
    })
    assert.ok(safe, 'all swimmers remain offshore')
    await page.evaluate(() => dispatchEvent(new Event('interactive:dispose')))
    await page.waitForTimeout(100)
    assert.deepEqual(errors, [])
    console.log('PASS: pointer-driven tree GPU deformation, fixed roots, fish escape, recovery, shoreline safety and disposal.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
