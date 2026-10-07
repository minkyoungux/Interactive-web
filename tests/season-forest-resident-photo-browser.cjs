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
    const result = await page.evaluate(async () => {
      const { makePhotoSurfaces } = await import('/src/season-forest-resident-photo.ts')
      const { makeToyResident } = await import('/src/season-forest-resident-style.ts')
      const { makeImageResident } = await import('/src/season-forest-resident-model.ts')
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128
      const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(128, 128), mask = new Float32Array(128 * 128)
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        const inside = x >= 12 && x < 116 && y >= 4 && y < 124, i = y * 128 + x
        pixels.data.set(inside ? [x, y, (x + y) % 128, 255] : [255, 0, 255, 255], i * 4); mask[i] = inside ? 1 : 0
      }
      ctx.putImageData(pixels, 0, 0)
      const pose = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0 }))
      for (const [i, x, y] of [[0,.5,.22],[2,.44,.18],[5,.56,.18],[7,.36,.22],[8,.64,.22],[11,.3,.4],[12,.7,.4],[13,.22,.55],[14,.78,.55],[15,.15,.7],[16,.85,.7],[23,.4,.65],[24,.6,.65],[25,.4,.8],[26,.6,.8],[27,.4,.94],[28,.6,.94]]) pose[i] = { x, y, visibility: 1 }
      const analysis = { human: { width: 128, height: 128, data: mask }, sourcePose: pose, targetPose: [] }
      const photos = makePhotoSurfaces(canvas, analysis)
      const surfaces = [photos.face, photos.torso, ...photos.arms, ...photos.hands, ...photos.legs, photos.whole]
      let background = 0, opaque = 0, colors = new Set(), transparentRgb = 0
      for (const c of surfaces) {
        if (!c) continue
        const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]) { opaque++; if (data[i] === 255 && data[i + 2] === 255) background++; colors.add(`${data[i]}:${data[i+1]}:${data[i+2]}`) }
          else if (data[i] || data[i+1] || data[i+2]) transparentRgb++
        }
      }
      const style = { kind: 'long-ear', fur: '#eccbdd', skin: '#deb58d', hair: '#5f4d44', shirt: '#669077', accent: '#bca76b', headWidth:.4, headHeight:.3, earLength:.8 }
      const model = makeToyResident(style, photos), maps = [], photoMeshes = []
      model.root.traverse(o => { if (o.isMesh && o.material.map) { maps.push(o.material.map); photoMeshes.push(o) } })
      let disposed = 0; maps.forEach(m => m.addEventListener('dispose', () => disposed++))
      const names = photoMeshes.map(m => m.name)
      const finite = photoMeshes.every(m => Array.from(m.geometry.getAttribute('position').array).every(Number.isFinite))
      model.walk(1, true); model.dispose()
      const hidden = makePhotoSurfaces(canvas, { ...analysis, sourcePose: [] })
      const shape = document.createElement('canvas'); shape.width = shape.height = 32; shape.getContext('2d').fillRect(3,3,26,26)
      const object = makeImageResident({ shape, humanoid:false, style:{...style,kind:'object'}, photos })
      let objectMap = false; object.root.traverse(o => { if (o.name === 'humanseg-reference' && o.material[0].map) objectMap = true }); object.dispose()
      return { background, opaque, colors:colors.size, transparentRgb, count:surfaces.filter(Boolean).length, names, finite, disposed, missingFace:!hidden.face, missingLimbs:hidden.arms.every(p => !p), objectMap }
    })
    assert.equal(result.background, 0, 'no background pixels enter the texture')
    assert.equal(result.transparentRgb, 0, 'transparent pixels do not retain background RGB')
    assert.ok(result.opaque > 10000 && result.colors > 100, 'preserves actual photograph detail rather than a palette')
    assert.equal(result.count, 9)
    assert.ok(result.names.includes('humanseg-face') && result.names.includes('humanseg-torso'))
    assert.equal(result.finite, true); assert.equal(result.disposed, 8)
    assert.equal(result.missingFace, true); assert.equal(result.missingLimbs, true); assert.equal(result.objectMap, true)
    console.log('PASS: masked pixel provenance, image detail, face/body/limb maps, missing-landmark fallback, object photo, GPU texture disposal.')
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
