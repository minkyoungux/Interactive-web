const assert = require('node:assert/strict')
const path = require('node:path'), os = require('node:os')
let playwright
try { playwright = require('playwright') } catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }
;(async () => {
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width:1440, height:1000 } }), errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/src/season-forest-resident-life.ts*', async route => {
      const response = await route.fetch(), source = await response.text()
      await route.fulfill({response,body:source.replace('const ready = store.all()', 'window.__expeditionTest = {residents, expeditions, ready:()=>!loading}; const ready = store.all()')})
    })
    await page.route('**/src/season-forest-settlement.ts*', async route => {
      const response = await route.fetch(), source = await response.text()
      await route.fulfill({response,body:source.replace('const residents = life.residents;', 'const residents = life.residents; window.__lifeStep = (d)=>life.update(d);')})
    })
    await page.goto('https://127.0.0.1:5173/season-forest.html'); await page.waitForFunction(()=>window.__expeditionTest?.ready())
    // Tracking must not suppress the behaviour we are watching.
    await page.locator('#resident-roster').selectOption('forest-neighbour-v1-2')
    const result = await page.evaluate(() => {
      const {residents,expeditions}=window.__expeditionTest
      residents.forEach(r=>r.socialCooldown=0)
      const phases=new Set(), mission=expeditions.missions.get('forest-neighbour-v1-2')
      let sprint=false, captured=false, netSwing=false
      for(let i=0;i<3600;i++) {
        window.__lifeStep(1/60); phases.add(mission.phase)
        sprint ||= mission.phase==='chase' && mission.actor.speed>=.29
        captured ||= !!mission.target?.capturedBy
        netSwing ||= mission.phase==='catch' && mission.actor.model.root.getObjectByName('gentle-explorer-net').rotation.x>.8
        if(mission.phase==='research')break
      }
      return {phases:[...phases],sprint,captured,netSwing,phase:mission.phase,ship:!!mission.ship.parent,beam:mission.beam.visible,x:mission.actor.x,y:mission.actor.y}
    })
    console.log('Mission:',result)
    assert.ok(result.sprint && result.captured && result.netSwing && result.ship)
    assert.equal(result.phase,'research'); assert.ok(result.phases.includes('return'))
    await page.waitForTimeout(400)
    await page.screenshot({path:'artifacts/expedition-dialogue.png'})
    const finish=await page.evaluate(()=>{
      const {expeditions}=window.__expeditionTest, m=expeditions.missions.get('forest-neighbour-v1-2'), friend=m.target
      for(let i=0;i<600 && m.success===0;i++) window.__lifeStep(1/60)
      return {success:m.success,phase:m.phase,free:!friend.capturedBy,scale:friend.model.root.scale.x,line:document.querySelector('.dialogue-line').textContent,name:document.querySelector('.dialogue-name').textContent}
    })
    assert.ok(finish.success>0 && finish.free); assert.equal(finish.scale,.34); assert.equal(finish.phase,'depart'); assert.equal(finish.name,'루미')
    assert.match(finish.line,/탐사 완료/)
    // Meeting interrupts missions without leaving any animal attached or shrunken.
    await page.locator('#resident-unfollow').click(); await page.waitForTimeout(250); await page.locator('#resident-meeting').click()
    assert.equal(await page.evaluate(()=>window.__expeditionTest.residents.some(r=>!!r.capturedBy)),false)
    assert.deepEqual(errors,[])
    console.log('PASS: tracked alien sprints, swings net, captures, returns to UFO, scans, releases unharmed and launches; reference dialogue card; interruption cleanup. Desktop-only targeted smoke.')
  } finally { await browser.close() }
})().catch(e=>{console.error(e);process.exitCode=1})
