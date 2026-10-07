const assert = require('node:assert/strict')
const path = require('node:path')
const os = require('node:os')
let playwright
try { playwright = require('playwright') } catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }
;(async () => {
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage(), errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/src/season-forest-resident-life.ts*', async route => {
      const response = await route.fetch(), source = await response.text()
      await route.fulfill({ response, body: source.replace('const ready = store.all()', 'window.__communityTest = {residents, social, expeditions, ready:()=>!loading}; const ready = store.all()') })
    })
    await page.goto((process.argv[2] || 'https://127.0.0.1:5173') + '/season-forest.html')
    await page.waitForFunction(() => window.__communityTest?.ready())
    const result = await page.evaluate(async () => {
      const { residents, social, expeditions } = window.__communityTest
      const aliens = residents.filter(r => r.model.appearance.design.species === 'alien')
      const animal = residents.find(r => r.model.appearance.design.species === 'rabbit'), alien = aliens[0]
      residents.forEach(r => r.socialCooldown = 100)
      animal.x = .2; animal.y = -.2; alien.x = .02; alien.y = -.2
      animal.socialCooldown = alien.socialCooldown = 0
      social(.016); const mission = expeditions.missions.get(alien.id), chasing = mission?.target === animal
      expeditions.cancel(alien); const rested = mission?.phase === 'rest' && !animal.capturedBy
      const { makeVillager } = await import('/src/season-forest-villager.ts')
      const { snapshotAppearance, restoreResident } = await import('/src/season-forest-resident-store.ts')
      const photo = document.createElement('canvas'); photo.width = photo.height = 128
      const g = photo.getContext('2d'); g.fillStyle = '#e92354'; g.fillRect(0, 0, 128, 128)
      const design = { species:'rabbit', color:'#dcceb7', shirt:'#a9c8b3', variant:0, personal:true, personality:'gentle' }
      const model = makeVillager(design, { face:photo,torso:photo,whole:photo,wholeAspect:1,arms:[],hands:[],legs:[] })
      const appearance = await snapshotAppearance(model)
      const restored = await restoreResident({version:1,id:'test',name:'test',island:0,x:0,y:0,conversation:[],appearance})
      const restoredPhoto = [...restored.appearance.texture.getContext('2d').getImageData(64,64,1,1).data]
      const bodySource = model.root.userData.modelSource
      model.dispose(); restored.dispose()
      return { count:residents.length, alienCount:aliens.length, variants:new Set(aliens.map(r=>r.model.appearance.design.variant)).size, nets:aliens.every(r=>!!r.model.root.getObjectByName('gentle-explorer-net')), chasing, rested, bodySource, restoredPhoto }
    })
    assert.equal(result.count, 12); assert.equal(result.alienCount, 4); assert.equal(result.variants, 4)
    assert.ok(result.nets && result.chasing && result.rested)
    assert.equal(result.bodySource, 'animal-miniature'); assert.deepEqual(result.restoredPhoto, [233,35,84,255])
    await page.locator('#resident-roster').selectOption('forest-neighbour-v1-2')
    await page.waitForTimeout(1500)
    await page.locator('#resident-chat-input').fill('잠자리채로 잡는 거야?'); await page.locator('#resident-chat button').click()
    assert.match(await page.locator('.dialogue-line').innerText(), /우주선/)
    await page.screenshot({ path:'artifacts/community-alien.png' })
    await page.locator('#resident-unfollow').click(); await page.waitForTimeout(250); await page.locator('#resident-meeting').click()
    await page.waitForFunction(() => document.querySelector('#resident-meeting').getAttribute('aria-pressed') === 'true')
    await page.waitForTimeout(4300)
    await page.screenshot({ path:'artifacts/community-meeting.png' })
    await page.reload(); await page.waitForFunction(() => window.__communityTest?.ready())
    assert.equal(await page.evaluate(() => window.__communityTest.residents.length), 12)
    assert.deepEqual(errors, [])
    console.log('PASS: 12 neighbours, four net-carrying alien variants, gentle chase/rest, personality chat, animal body/photo atlas persistence, no duplicate seeding. Desktop smoke only; no camera/sample person used.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
