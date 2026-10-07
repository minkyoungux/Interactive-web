import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const bundle = await build({ entryPoints: ['src/shampoo-geometry.ts'], bundle: true, format: 'esm', write: false })
const { getPose, attach, resolve, local, world, extractScalp, strokeSamples, newStroke, HAND_GRACE, readGesture } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const near = (a,b) => assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-8)
function faceFixture() {
  const face=Array.from({length:478},(_,i)=>({x:.5+Math.sin(i)*.09,y:.43+Math.cos(i)*.13}))
  face[234]={x:.34,y:.43};face[454]={x:.66,y:.43};face[152]={x:.5,y:.65};face[10]={x:.5,y:.25}
  const forehead=[54,103,67,109,10,338,297,332,284]
  forehead.forEach((id,i)=>{face[id]={x:.36+i*.035,y:.25+Math.abs(i-4)*.014}})
  return face
}
test('attachment follows translation, rotation, scale and local expression without drift',()=>{
 const face=faceFixture(), pose=getPose(face), p={x:.44,y:.48}, a=attach(p,face,pose)
 near(resolve(a,face,pose),p)
 const transform=p=>({x:.4+(p.x*Math.cos(.8)-p.y*Math.sin(.8))*1.6,y:-.2+(p.x*Math.sin(.8)+p.y*Math.cos(.8))*1.6})
 const moved=face.map(transform);near(resolve(a,moved,getPose(moved)),transform(p))
 const before=resolve(a,face,pose);face[a.ids[0]]={x:face[a.ids[0]].x+.02,y:face[a.ids[0]].y+.01}
 const after=resolve(a,face,pose);near(after,{x:before.x+.02*a.weights[0],y:before.y+.01*a.weights[0]})
 near(world(local(p,pose),pose),p)
})
test('only a valid selfie mask seeds a cap; disconnected regions are excluded',()=>{
 const f=faceFixture(),p=getPose(f),size=128,mask=new Float32Array(size*size)
 assert.equal(extractScalp(mask,size,size,.75,f,p),null)
 mask.fill(NaN);assert.equal(extractScalp(mask,size,size,.75,f,p),null)
 for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
  const vx=x/size,vy=y/size*.75
  mask[y*size+x]=((vx-.5)/.205)**2+((vy-.32)/.24)**2<1? .98: .01
  if(vx<.15&&vy<.2)mask[y*size+x]=.98
 }
 const scalp=extractScalp(mask,size,size,.75,f,p);assert.ok(scalp?.points.length>60)
 for(const b of scalp.points){const v=world(b.point,p);assert.ok(v.x>.25&&v.x<.75);assert.ok(v.y<.33)}
 assert.ok(scalp.points.some(b=>b.edge&&Math.hypot(b.normal.x,b.normal.y)>.99))
})
test('fist repeats at 410ms, interpolates outside face and resets on open or pinch',()=>{
 const s=newStroke(),p={x:.5,y:.3}
 assert.equal(strokeSamples(s,'fist',p,0,false,.2).length,0)
 assert.equal(strokeSamples(s,'fist',p,50,true,.2).length,1)
 for(let t=100;t<460;t+=50) assert.equal(strokeSamples(s,'fist',p,t,false,.2).length,0)
 assert.equal(strokeSamples(s,'fist',p,460,false,.2).length,1)
 const samples=strokeSamples(s,'fist',{x:1,y:.3},500,false,.2);assert.ok(samples.length>=8)
 let previous=p;for(const sample of samples){assert.ok(Math.hypot(sample.x-previous.x,sample.y-previous.y)<=.061);previous=sample}
 assert.equal(strokeSamples(s,'open',p,530,false,.2).length,0)
 assert.equal(strokeSamples(s,'fist',p,560,true,.2).length,1)
 assert.equal(strokeSamples(s,'pinch',p,590,true,.2).length,1)
 assert.equal(s.gesture,'pinch')
})
test('short hand misses bridge a stroke; long misses require a fresh surface contact',()=>{
 const s=newStroke();strokeSamples(s,'pinch',{x:.4,y:.3},0,true,.2)
 assert.ok(strokeSamples(s,'pinch',{x:.45,y:.3},HAND_GRACE-1,false,.2).length>1)
 assert.equal(strokeSamples(s,'pinch',{x:.6,y:.3},HAND_GRACE*3,false,.2).length,0)
 assert.ok(strokeSamples(s,'pinch',{x:.6,y:.3},HAND_GRACE*3+20,true,.2).length)
})
test('open, fist, open and pinch are independently recognized',()=>{
 function hand(mode){const h=Array.from({length:21},()=>({x:.5,y:.5}));h[0]={x:.5,y:.7};[5,9,13,17].forEach((id,i)=>{
  const x=.43+i*.045;h[id]={x,y:.52};h[id+1]={x,y:.41};h[id+2]={x,y:mode==='fist'?.52:.32};h[id+3]={x,y:mode==='fist'?.58:.24}
 });h[4]={x:mode==='pinch'?h[8].x+.005:.32,y:mode==='pinch'?h[8].y:.53};return h}
 assert.equal(readGesture(hand('open'),'fist',.75).gesture,'open')
 assert.equal(readGesture(hand('fist'),'open',.75).gesture,'fist')
 assert.equal(readGesture(hand('pinch'),'fist',.75).gesture,'pinch')
})

test('O sign only blows with a curled index, other fingers extended and contact near the mouth', async()=>{
 const { blowSign } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
 const face=faceFixture(),pose=getPose(face)
 face[13]={x:.5,y:.5};face[14]={x:.5,y:.52};face[61]={x:.46,y:.51};face[291]={x:.54,y:.51}
 const hand=Array.from({length:21},()=>({x:.5,y:.6,z:0}));hand[0]={x:.57,y:.8,z:0}
 hand[5]={x:.51,y:.69,z:0};hand[9]={x:.57,y:.66,z:0};hand[17]={x:.69,y:.69,z:0}
 hand[6]={x:.44,y:.62,z:0};hand[7]={x:.47,y:.57,z:0};hand[8]={x:.53,y:.68,z:0};hand[4]={x:.535,y:.68,z:0}
 for(const [base,pip,dip,tip,x] of [[9,10,11,12,.57],[13,14,15,16,.63],[17,18,19,20,.69]]) {
  hand[base]={x,y:.69,z:0};hand[pip]={x,y:.55,z:0};hand[dip]={x,y:.47,z:0};hand[tip]={x,y:.39,z:0}
 }
 const circle=blowSign(hand,face,pose,.75);assert.ok(circle)
 assert.equal(blowSign(hand.map(p=>({...p,x:p.x+.3})),face,pose,.75),null,'away from mouth remains pinch')
 const straight=structuredClone(hand);straight[6]={x:.53,y:.61};straight[7]={x:.53,y:.48};straight[8]={x:.53,y:.32};straight[4]={x:.535,y:.32}
 assert.equal(blowSign(straight,face,pose,.75),null,'straight pinch cannot blow')
 const fist=structuredClone(hand);for(const id of [12,16,20])fist[id]={x:hand[id].x,y:.72}
 assert.equal(blowSign(fist,face,pose,.75),null,'fist cannot blow')
 // Recognition is independent of horizontal camera mirroring.
 const mirror=p=>({...p,x:1-p.x});assert.ok(blowSign(hand.map(mirror),face.map(mirror),getPose(face.map(mirror)),.75))
})

test('index pointing is detected at landmark 8 before the other folded fingers can count as a fist',()=>{
 const hand=Array.from({length:21},()=>({x:.5,y:.6,z:0}));hand[0]={x:.5,y:.68,z:0}
 ;[5,9,13,17].forEach((id,i)=>{const x=.44+i*.04;hand[id]={x,y:.51,z:0};hand[id+1]={x,y:.45,z:0};hand[id+2]={x,y:.51,z:0};hand[id+3]={x,y:.57,z:0}})
 hand[6]={x:.44,y:.43,z:0};hand[7]={x:.44,y:.36,z:0};hand[8]={x:.44,y:.3,z:0};hand[4]={x:.32,y:.55,z:0}
 for(const previous of ['open','fist','pinch','point']){
  const result=readGesture(hand,previous,.75);assert.equal(result.gesture,'point');near(result.point,{x:.44,y:.225})
 }
 // Rigid rotations, including pointing towards the camera, preserve recognition.
 for(const angle of [0,.7,1.35,Math.PI/2]){
  const rotated=hand.map(p=>({x:p.x,y:.5+(p.y-.5)*Math.cos(angle),z:(p.y-.5)*.75*Math.sin(angle)}))
  assert.equal(readGesture(rotated,'open',.75).gesture,'point')
 }
 const palm=structuredClone(hand)
 ;[9,13,17].forEach(id=>{palm[id+2]={...palm[id],y:.34};palm[id+3]={...palm[id],y:.27}})
 assert.equal(readGesture(palm,'point',.75).gesture,'open','an open palm is not a drawing pointer')
 const s=newStroke();assert.ok(strokeSamples(s,'point',{x:.44,y:.225},0,true,.15).length)
 assert.ok(strokeSamples(s,'point',{x:.5,y:.225},80,false,.15).length>3,'pointer strokes interpolate')
})

test('wipe requires an open palm rather than pointing, pinching or making a fist',async()=>{
 const {wipePalm}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
 const h=Array.from({length:21},()=>({x:.5,y:.6,z:0}));h[0]={x:.5,y:.7,z:0}
 ;[5,9,13,17].forEach((id,i)=>{const x=.43+i*.045;h[id]={x,y:.52,z:0};h[id+1]={x,y:.41,z:0};h[id+2]={x,y:.32,z:0};h[id+3]={x,y:.24,z:0}})
 assert.ok(wipePalm(h,.75));assert.ok(wipePalm(h,.75).span>.1)
 const point=structuredClone(h);for(const id of [12,16,20])point[id]={...point[id],y:.58}
 assert.equal(wipePalm(point,.75),null)
 const fist=structuredClone(point);fist[8]={...fist[8],y:.58};assert.equal(wipePalm(fist,.75),null)
})

test('handedness from unmirrored camera input is normalized to the physical left/right hand',async()=>{
 const result=await build({entryPoints:['src/shampoo-tracking.ts'],bundle:true,format:'esm',write:false})
 const {cameraHandSide}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
 assert.equal(cameraHandSide('Right'),'left');assert.equal(cameraHandSide('Left'),'right');assert.equal(cameraHandSide(''),null)
})
