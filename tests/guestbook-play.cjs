const assert = require('node:assert/strict')
const { chromium } = require(require('node:path').join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 950 } })
    const errors=[];page.on('pageerror',e=>errors.push(e.message))
    const rows=[{id:'00000000-0000-4000-8000-000000000001',author:'테스트',message:'안녕',color:'rose',minimi_seed:3,created_at:new Date().toISOString()}]
    await page.route('**/rest/v1/**',async route=>{
      const request=route.request()
      if(request.method()==='POST') {
        const row={...request.postDataJSON(),created_at:new Date().toISOString()};rows.unshift(row)
        return route.fulfill({json:row})
      }
      return route.fulfill({json:request.url().includes('guestbook_replies')?[]:rows})
    })
    await page.goto('http://127.0.0.1:4178/Interactive-web/guestbook.html')
    await page.locator('.boss-open').click();assert.equal(await page.locator('.boss-sheet').evaluate(d=>d.open),true)
    await page.keyboard.press('Escape');assert.equal(await page.locator('.boss-sheet').evaluate(d=>d.open),false)
    await page.locator('.draw-open').click();await page.mouse.move(100,250);await page.mouse.down();await page.mouse.move(220,280,{steps:5});await page.mouse.up()
    assert.ok(await page.locator('.doodle-overlay canvas').evaluate(c=>c.getContext('2d').getImageData(150,260,1,1).data[3]>0))
    await page.keyboard.press('Escape');assert.equal(await page.locator('.doodle-overlay').evaluate(e=>e.classList.contains('editing')),false)
    await page.locator('.stress-open').click();await page.locator('.stress-papers button').first().click();await page.locator('.stress-bin').click()
    await page.waitForFunction(()=>document.querySelectorAll('.stress-papers button').length===2)
    await page.locator('[data-reset]').click();assert.equal(await page.locator('.stress-papers button').count(),3)
    await page.keyboard.press('Escape')
    await page.locator('.plaza-pause').click()
    await page.locator('[data-snack="커피"]').click();await page.locator('.plaza-person').first().click()
    assert.match(await page.locator('.plaza-person .plaza-greeting').first().innerText(),/커피 냠/)
    await page.locator('#guest-name').fill('우표 테스트');await page.locator('#guest-message').fill('오늘도 버텼다')
    await page.locator('.postage-picker select').selectOption('퇴근 기원');await page.locator('.stamp-press').click()
    await page.locator('.submit-button').click();await page.waitForFunction(()=>document.querySelector('.note-postage'))
    assert.match(rows[0].message,/\[우표: 퇴근 기원\]$/)
    await page.reload();await page.locator('.note-postage').waitFor();assert.equal(await page.locator('.note-postage').first().innerText(),'퇴근 기원')
    assert.deepEqual(errors,[])
    console.log('PASS: boss/ESC, drawing, trash/reset, snacks, stamp save/reload (mock DB only)')
  } finally { await browser.close() }
})().catch(e=>{console.error(e);process.exit(1)})
