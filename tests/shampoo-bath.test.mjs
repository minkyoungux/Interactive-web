import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const result=await build({entryPoints:['src/shampoo-bath.ts'],bundle:true,format:'esm',write:false})
const {BubbleBath}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
const tick=(bath,seconds,food=[])=>{const eaten=new Set();for(let i=0;i<seconds*60;i++)for(const key of bath.update(1/60,640,480,food))eaten.add(key);return eaten}
test('transparent bubble bodies rise briefly then fall, collide and form a persistent pile',()=>{
 const bath=new BubbleBath();bath.reset(640,480);bath.nextDuck=Infinity
 bath.emit({x:320,y:150},{x:1,y:0},130)
 const start=bath.bubbles[0].y;tick(bath,.2);assert.ok(bath.bubbles[0].y<start)
 for(let i=1;i<14;i++)bath.emit({x:100+(i%7)*70,y:100-Math.floor(i/7)*40},{x:1,y:0},130)
 tick(bath,15);assert.equal(bath.bubbles.length,14)
 const floor=472
 for(const b of bath.bubbles){assert.ok(Number.isFinite(b.x)&&Number.isFinite(b.y));assert.ok(b.x>=b.radius-.01&&b.x<=640-b.radius+.01);assert.ok(b.y<=floor-b.radius+.01);assert.ok(b.y>0);assert.ok(b.radius>=18&&b.radius<=84)}
 assert.ok(bath.bubbles.some(b=>b.y<floor-b.radius-6),'some bubbles sit above other bubbles')
 let worst=0;for(let i=0;i<bath.bubbles.length;i++)for(let j=0;j<i;j++){const a=bath.bubbles[i],b=bath.bubbles[j];worst=Math.max(worst,a.radius+b.radius-Math.hypot(a.x-b.x,a.y-b.y))}
 assert.ok(worst<3,`pile interpenetration ${worst}`)
})
test('duck periodically arrives, consumes both bubble and head food, leaves and returns',()=>{
 const bath=new BubbleBath();bath.reset(640,480)
 bath.emit({x:36,y:336},{x:1,y:0},100)
 // Position duck on food to make consumption deterministic, independent of random launch speed.
 bath.duck={x:13,y:346,direction:1,until:12,leaving:false,target:null,retarget:0,chewUntil:0}
 const key=`bubble:${bath.bubbles[0].id}`
 const eaten=bath.update(1/60,640,480,[{key:'foam:1',x:36,y:336,radius:5},{key:'scalp:1',x:37,y:337,radius:5}])
 assert.ok(eaten.includes(key));assert.ok(eaten.includes('foam:1'));assert.ok(eaten.includes('scalp:1'));assert.equal(bath.bubbles.length,0)
 tick(bath,18);assert.equal(bath.duck,null);assert.ok(bath.nextDuck>bath.elapsed)
 tick(bath,12);assert.ok(bath.duck,'second visit')
})
test('resize keeps screen particles relative to the new cover area and reset releases all state',()=>{
 const bath=new BubbleBath();bath.reset(640,480);bath.emit({x:320,y:240},{x:0,y:0},100)
 bath.resize(320,960);assert.equal(bath.bubbles[0].x,160);assert.equal(bath.bubbles[0].y,480)
 bath.reset(320,960);assert.equal(bath.bubbles.length,0);assert.equal(bath.duck,null);assert.equal(bath.elapsed,0);assert.equal(bath.nextDuck,10)
 for(let i=0;i<600;i++)bath.emit({x:100,y:100},{x:1,y:0},100)
 assert.equal(bath.bubbles.length,420)
})
