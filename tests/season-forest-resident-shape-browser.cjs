const assert = require('node:assert/strict')
const path = require('node:path')
const os = require('node:os')
let playwright
try { playwright = require('playwright') } catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }
;(async () => {
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
  try {
    const page = await browser.newPage({ ignoreHTTPSErrors: true })
    await page.goto((process.argv[2] || 'https://127.0.0.1:5173') + '/season-forest.html')
    const results = await page.evaluate(async () => {
      const { makeImageResident } = await import('/src/season-forest-resident-model.ts')
      const make = (kind) => {
        const c = document.createElement('canvas'); c.width = 240; c.height = 320
        const g = c.getContext('2d'); g.fillStyle = '#deb9ae'
        if (kind === 'rabbit') {
          for (const x of [80,160]) { g.beginPath(); g.ellipse(x,62,18,52,0,0,Math.PI*2); g.fill() }
          g.beginPath(); g.ellipse(120,145,72,63,0,0,Math.PI*2); g.fill()
          g.fillRect(85,195,70,70); g.fillRect(85,255,25,55); g.fillRect(135,255,25,55)
        } else if (kind === 'cat') {
          g.beginPath(); g.moveTo(55,65); g.lineTo(80,15); g.lineTo(109,64); g.lineTo(165,16); g.lineTo(183,121); g.lineTo(60,140); g.closePath(); g.fill()
          g.beginPath(); g.ellipse(119,130,66,53,0,0,Math.PI*2); g.fill(); g.fillRect(88,163,64,100)
          g.fillRect(88,250,23,61); g.fillRect(132,250,23,61)
          g.lineWidth=17; g.strokeStyle='#deb9ae'; g.beginPath(); g.moveTo(148,234); g.bezierCurveTo(228,274,215,155,184,192); g.stroke()
        } else { g.fillRect(50,100,145,165); g.beginPath(); g.ellipse(195,150,35,28,0,0,Math.PI*2); g.fill(); g.clearRect(190,132,21,35); g.fillRect(68,75,104,30) }
        return c
      }
      const photo = document.createElement('canvas'); photo.width = photo.height = 256
      const pc = photo.getContext('2d'); pc.fillStyle='#3c8576'; pc.fillRect(0,0,256,256); pc.fillStyle='#ba6948'; pc.fillRect(48,24,150,200)
      const photos = { face:photo, torso:photo, arms:[photo,photo], hands:[photo,photo], legs:[photo,photo], whole:photo, wholeAspect:.7 }
      const output = []
      for (const kind of ['rabbit','cat','object']) {
        const shape = make(kind), assets = { shape, photos, humanoid:kind!=='object', style:{kind:kind==='object'?'object':'long-ear',fur:'#deb9ae'} }
        const model = makeImageResident(assets), mesh = model.root.children[0].children[0]
        const geometry = mesh.geometry, pos = geometry.getAttribute('position'), indices = geometry.getIndex()
        const projected = document.createElement('canvas'); projected.width=shape.width; projected.height=shape.height
        const ctx = projected.getContext('2d'), scale = Math.min(1.5/shape.height,1.8/shape.width)
        for (let i=0;i<geometry.groups[0].count;i+=3) {
          ctx.beginPath()
          for (let j=0;j<3;j++) { const v=indices.getX(i+j), x=pos.getX(v)/scale+shape.width/2, y=shape.height-pos.getY(v)/scale; j?ctx.lineTo(x,y):ctx.moveTo(x,y) }
          ctx.closePath();ctx.fill()
        }
        const a=shape.getContext('2d').getImageData(0,0,240,320).data,b=ctx.getImageData(0,0,240,320).data
        let intersection=0,union=0
        for(let i=3;i<a.length;i+=4) { const x=a[i]>120,y=b[i]>120;if(x&&y)intersection++;if(x||y)union++ }
        const before=Array.from(pos.array); model.walk(1,true)
        const unchanged=before.every((v,i)=>v===pos.array[i])
        let textureDisposed=0; mesh.material[0].map.addEventListener('dispose',()=>textureDisposed++)
        const atlas=mesh.material[0].map.image, detail=atlas.getContext('2d').getImageData(0,0,240,320).data
        let photoPixels=0;for(let i=0;i<detail.length;i+=4)if(detail[i]===186&&detail[i+1]===105&&detail[i+2]===72)photoPixels++
        const source=model.root.userData.modelSource,regions=model.root.userData.photoRegions
        model.dispose();output.push({kind,iou:intersection/union,source,regions,photoPixels,textureDisposed,unchanged,vertices:pos.count})
      }
      return output
    })
    for (const r of results) {
      assert.equal(r.source,'uploaded-silhouette')
      assert.ok(r.iou>.95, `${r.kind} silhouette IoU ${r.iou} must preserve ears/tail/holes`)
      assert.ok(r.photoPixels>100, 'actual person image remains on the uploaded exterior')
      assert.ok(r.regions.includes(r.kind==='object'?'person':'face'))
      assert.equal(r.textureDisposed,1);assert.equal(r.unchanged,true)
    }
    assert.notEqual(results[0].vertices,results[1].vertices,'different references cannot reuse a fixed body')
    console.log('PASS: uploaded silhouette IoU, distinct geometries, ears/tail/holes, real photo atlas, connected walking and disposal.',results.map(r=>({kind:r.kind,iou:r.iou})))
  } finally { await browser.close() }
})().catch(error=>{console.error(error);process.exitCode=1})
