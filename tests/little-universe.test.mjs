import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const result = await build({ entryPoints: ['src/little-universe-core.ts'], bundle: true, format: 'esm', write: false })
const { OpenMouth, mouthOpenness, advanceTransition, universeScale } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const sample = (mouth, score, start, end) => { for(let t=start;t<=end;t+=40) mouth.update(score,t) }

test('closed lips, slight motion and one-frame noise leave the portrait intact', () => {
  const mouth = new OpenMouth()
  sample(mouth,.2,0,2000)
  assert.equal(mouth.open,false)
  mouth.update(.95,2040); mouth.update(0,2080)
  assert.equal(mouth.open,false)
  assert.equal(mouth.seconds(3000),0)
})
test('sustained mouth opening starts growth; closing the mouth immediately reverses the intent', () => {
  const mouth = new OpenMouth()
  sample(mouth,.6,0,2000)
  assert.equal(mouth.open,true)
  assert.ok(mouth.seconds(2000)>1)
  sample(mouth,.18,2040,2400)
  assert.equal(mouth.open,true)
  mouth.update(.03,2440)
  assert.equal(mouth.open,false)
  assert.equal(mouth.seconds(2440),0)
})
test('loss, pause and invalid confidence cannot count toward mouth-open time', () => {
  const mouth = new OpenMouth()
  sample(mouth,.7,0,1000)
  mouth.update(.7,12000)
  assert.equal(mouth.open,false)
  sample(mouth,.7,12040,13000)
  assert.equal(mouth.open,true)
  mouth.update(NaN,13040)
  assert.equal(mouth.open,false)
  sample(mouth,.7,13080,14000)
  mouth.release()
  assert.equal(mouth.seconds(15000),0)
})
test('lip geometry supplements jaw scores and stays consistent across zoom and aspect ratios', () => {
  const points = Array.from({length:468},()=>({x:.5,y:.5}))
  points[61]={x:.4,y:.5}; points[291]={x:.6,y:.5}
  points[13]={x:.5,y:.47}; points[14]={x:.5,y:.53}
  const score=mouthOpenness(points,2)
  assert.ok(score>.28)
  const zoomed=points.map(p=>({x:p.x*1.3-.1,y:p.y*1.3-.2}))
  assert.ok(Math.abs(mouthOpenness(zoomed,2)-score)<1e-8)
  points[13].y=.496; points[14].y=.504
  assert.ok(mouthOpenness(points,2)<.12)
  assert.equal(mouthOpenness(points,2,.8),.8)
})
test('particle travel remains visible for several seconds at different refresh rates', () => {
  for(const hz of [30,60,144]) {
    let progress=0
    for(let i=0;i<hz*2;i++) progress=advanceTransition(progress,true,1/hz)
    assert.ok(progress>.43 && progress<.46)
    for(let i=0;i<hz*3;i++) progress=advanceTransition(progress,true,1/hz)
    assert.equal(progress,1)
    for(let i=0;i<hz*4;i++) progress=advanceTransition(progress,false,1/hz)
    assert.equal(progress,0)
  }
})
test('mouth closing mid-flight reverses from the current position without a hold or jump', () => {
  const halfway=advanceTransition(.5,false,1/60)
  assert.ok(halfway<.5 && halfway>.49)
  assert.ok(advanceTransition(halfway,true,1/60)>halfway)
  assert.equal(advanceTransition(0,false,1),0)
  assert.equal(advanceTransition(1,true,1),1)
})
test('long mouth-open holds expand continuously to a finite visible scale', () => {
  assert.equal(universeScale(0),1)
  for(let t=0;t<100;t++) assert.ok(universeScale(t+1)>universeScale(t))
  assert.ok(universeScale(86400)<=1.9)
})
