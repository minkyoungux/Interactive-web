const assert = require('node:assert/strict'), path = require('node:path'), os = require('node:os')
let playwright
try { playwright = require('playwright') } catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }
;(async()=>{
  const browser = await playwright.chromium.launch({channel:'chrome',headless:true})
  try {
    const page = await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}), errors=[]
    page.on('pageerror', e=>errors.push(e.message))
    await page.goto('https://127.0.0.1:5173/season-forest.html')
    await page.waitForFunction(()=>document.querySelectorAll('#resident-roster option').length>5)
    await page.screenshot({path:'artifacts/resident-clear-overview.png'})
    await page.locator('#resident-roster').selectOption('forest-neighbour-v1-2')
    await page.waitForTimeout(1100)
    const gap=()=>page.evaluate(()=>document.querySelector('.resident-conversation').getBoundingClientRect().top-document.querySelector('.world-stage').getBoundingClientRect().bottom)
    assert.ok(await gap()>=8,'dialogue must be OUTSIDE the 3D viewport')
    assert.equal(await page.locator('.resident-chat-tools').getAttribute('open'),null)
    await page.screenshot({path:'artifacts/resident-clear-follow.png'})
    await page.locator('.resident-chat-tools>summary').click(); await page.waitForTimeout(150)
    assert.ok(await gap()>=8,'expanded tools also reserve scene space')
    await page.locator('#resident-chat-input').fill('안녕'); await page.locator('#resident-chat button').click()
    await page.locator('#resident-ui-toggle').click()
    assert.equal(await page.locator('.resident-conversation').isVisible(),false)
    await page.locator('#resident-ui-toggle').click()
    assert.equal(await page.locator('.resident-conversation').isVisible(),true)
    await page.locator('#resident-unfollow').click(); await page.locator('#resident-world-settings').click()
    await page.locator('.month-button[data-month="0"]').click()
    assert.equal(await page.locator('.month-button[data-month="0"]').getAttribute('aria-pressed'),'true')
    assert.deepEqual(errors,[])
    console.log('PASS: desktop scene/dialogue never overlap, expandable controls resize scene, UI visibility toggle, moved calendar still works. No multi-platform suite.')
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
