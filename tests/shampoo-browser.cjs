const assert = require('node:assert/strict')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
let playwright
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright') }
catch { playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')) }
const base = process.env.SHAMPOO_BROWSER_URL || 'http://127.0.0.1:5174'
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'shampoo-browser-'))
let browser
const errors = []
async function prepare(context, synthetic) {
 await context.addInitScript(({ synthetic }) => {
  window.metrics={frames:0,hands:0,human:0,segments:0,closed:0,stopped:0,maxBusy:0,busy:0}
  const face=Array.from({length:478},(_,i)=>({x:.5+Math.sin(i)*.1,y:.5+Math.cos(i)*.17,z:0}))
  const oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
  oval.forEach((id,i)=>{const a=-Math.PI/2+i/36*Math.PI*2;face[id]={x:.5+Math.cos(a)*.16,y:.5+Math.sin(a)*.28,z:0}})
  window.fixture={face,hand:null,mask:false}
  if (synthetic) {
   window.scene={soap:[],foam:[],duck:[]}
   const nativeDraw=CanvasRenderingContext2D.prototype.drawImage, kinds=new WeakMap()
   CanvasRenderingContext2D.prototype.drawImage=function(source,...args){
    if(this.canvas.classList?.contains('shampoo-canvas')&&source instanceof HTMLCanvasElement&&args.length===4){
     let kind=kinds.get(source)
     if(!kind){kind=source.width===192?'duck':source.getContext('2d').getImageData(source.width/2,source.height/2,1,1).data[3]<20?'soap':'foam';kinds.set(source,kind)}
     const [x,y,w,h]=args,m=this.getTransform(),scale=this.canvas.width/innerWidth
     window.scene[kind].push({x:(m.a*(x+w/2)+m.c*(y+h/2)+m.e)/scale,y:(m.b*(x+w/2)+m.d*(y+h/2)+m.f)/scale,r:Math.abs(m.a*w/2)/scale})
    }
    return nativeDraw.call(this,source,...args)
   }
  }
  const nativeRaf=requestAnimationFrame
  window.requestAnimationFrame=cb=>nativeRaf(t=>{window.metrics.frames++;if(synthetic)window.scene={soap:[],foam:[],duck:[]};cb(t)})
 navigator.mediaDevices.getUserMedia=async constraints=>{
   window.cameraConstraints=constraints
   const c=document.createElement('canvas');c.width=960;c.height=720;const g=c.getContext('2d')
   const img=new Image();if(window.portraitData){img.src=window.portraitData;await img.decode()}
   const draw=()=>{g.fillStyle='#dfebed';g.fillRect(0,0,960,720);if(img.complete&&img.naturalWidth)g.drawImage(img,180,0,600,720);else{g.fillStyle='#99755c';g.beginPath();g.ellipse(480,335,175,230,0,0,7);g.fill()}if(synthetic)for(let y=310;y<410;y+=8)for(let x=540;x<650;x+=8){g.fillStyle=((x-540)/8+(y-310)/8)%2?'#fff':'#000';g.fillRect(x,y,8,8)}}
   draw();const timer=setInterval(draw,33);const stream=c.captureStream(30)
   window.cameraTrack=stream.getVideoTracks()[0];const stop=window.cameraTrack.stop.bind(window.cameraTrack)
   window.cameraTrack.stop=()=>{window.metrics.stopped++;clearInterval(timer);stop()}
   return stream
  }
  if(synthetic)window.Worker=class{
   onmessage=null;onerror=null;role='';constructor(){}
   postMessage(m){
    if(m.type==='init'){this.role=m.role;setTimeout(()=>this.onmessage?.({data:{type:'ready'}}),5);return}
    if(m.type==='close'){window.metrics.closed++;this.onmessage?.({data:{type:'closed'}});return}
    if(m.type!=='frame')return
    m.bitmap.close();window.metrics.busy++;window.metrics.maxBusy=Math.max(window.metrics.maxBusy,window.metrics.busy)
    setTimeout(()=>{window.metrics.busy--;let data
     if(this.role==='hands'){window.metrics.hands++;data={type:'hands',hands:window.fixture.hand?[window.fixture.hand]:[],sides:window.fixture.side?[{side:window.fixture.side,score:.98}]:undefined,time:m.time}}
     else{window.metrics.human++;data={type:'human',face:window.fixture.face??[],time:m.time};if(m.segment){window.metrics.segments++;if(window.fixture.mask){const mask=new Float32Array(128*128);for(let y=0;y<128;y++)for(let x=0;x<128;x++)mask[y*128+x]=((x/128-.5)/.195)**2+((y/128-.43)/.35)**2<1?.99:0;data.mask={data:mask,width:128,height:128}}}}
     this.onmessage?.({data})
    },12)
   }
   terminate(){}
  }
 },{synthetic})
}
async function ink(page) {return page.locator('.shampoo-canvas').evaluate(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<p.length;i+=4)if(p[i])n++;return n})}
async function fogAlpha(page,x,y){return page.locator('.shampoo-fog').evaluate((c,{x,y})=>c.getContext('2d').getImageData(Math.round(x/innerWidth*c.width),Math.round(y/innerHeight*c.height),1,1).data[3],{x,y})}
async function hand(page,mode,x=.5,y=.5){await page.evaluate(({mode,x,y})=>{
 if(!mode){window.fixture.hand=null;return}
 const h=Array.from({length:21},()=>({x,y,z:0}));h[0]={x,y:y+.13,z:0}
 ;[5,9,13,17].forEach((id,i)=>{const px=x-.06+i*.04;h[id]={x:px,y:y-.02,z:0};h[id+1]={x:px,y:y-.10,z:0};h[id+2]={x:px,y:y+(mode==='fist'?.01:-.17),z:0};h[id+3]={x:px,y:y+(mode==='fist'?.04:-.23),z:0}})
 h[4]={x:mode==='pinch'?h[8].x+.004:x-.18,y:mode==='pinch'?h[8].y:y,z:0}
 window.fixture.hand=h
 },{mode,x,y});await page.waitForTimeout(110)}
(async()=>{
 browser=await playwright.chromium.launch({executablePath:process.env.SHAMPOO_CHROME_EXECUTABLE||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':undefined),headless:true})
 // Real WASM/model startup and inference, optionally with an actual portrait fixture.
 const real=await browser.newContext({viewport:{width:960,height:720}});await prepare(real,false)
 if(process.env.SHAMPOO_PORTRAIT)await real.addInitScript(data=>window.portraitData=data,'data:image/jpeg;base64,'+fs.readFileSync(process.env.SHAMPOO_PORTRAIT).toString('base64'))
 const p=await real.newPage();p.on('pageerror',e=>errors.push(e.message))
 await p.goto(base+'/shampoo.html');await p.locator('#camera-start').click()
 await p.waitForFunction(()=>document.body.classList.contains('camera-on'),{},{timeout:50000})
 if(process.env.SHAMPOO_PORTRAIT){await p.waitForFunction(()=>document.querySelector('.shampoo-state').textContent.includes('그려보세요'),{},{timeout:20000});assert.ok(await ink(p)>1000)}
 else await p.waitForTimeout(1000)
 await p.screenshot({path:path.join(artifacts,'real-model.png')})
 await p.locator('#camera-start').click();assert.equal(await p.evaluate(()=>window.cameraTrack.readyState),'ended')
 await real.close();console.log('real Worker models initialized, inferred and stopped')
 const context=await browser.newContext({viewport:{width:960,height:720}});await prepare(context,true)
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message))
 await page.goto(base+'/shampoo.html');await page.locator('#camera-start').click();await page.waitForTimeout(550)
 assert.equal(await ink(page),0,'must not draw fallback cap before a valid mask')
 await page.evaluate(()=>window.fixture.mask=true);await page.waitForTimeout(350);assert.ok(await ink(page)>1000)
 await page.screenshot({path:path.join(artifacts,'scalp.png')})
 await page.evaluate(()=>window.fixture.mask=false);await page.waitForTimeout(1250);assert.equal(await ink(page),0,'expired masks cannot leave a phantom cap')
 await hand(page,'pinch',.48,.64);for(let x=.48;x<=.7;x+=.035)await hand(page,'pinch',x,.64)
 await hand(page,'open',.7,.64);const pinchInk=await ink(page);assert.ok(pinchInk>600)
 await page.waitForTimeout(600);assert.ok(await ink(page)>=pinchInk*.95,'pinch foam remains')
 await page.locator('#foam-reset').click();await page.waitForTimeout(70);assert.equal(await ink(page),0)
 // A raised index with three folded fingers must draw small shampoo foam at
 // landmark 8, rather than being mistaken for a fist or requiring a pinch.
 await page.evaluate(()=>{
  const h=Array.from({length:21},()=>({x:.5,y:.6,z:0}));h[0]={x:.5,y:.68,z:0}
  ;[5,9,13,17].forEach((id,i)=>{const x=.44+i*.04;h[id]={x,y:.51,z:0};h[id+1]={x,y:.45,z:0};h[id+2]={x,y:.51,z:0};h[id+3]={x,y:.57,z:0}})
  h[6]={x:.44,y:.43,z:0};h[7]={x:.44,y:.36,z:0};h[8]={x:.44,y:.30,z:0};h[4]={x:.32,y:.55,z:0}
  window.pointHand=h;window.fixture.hand=h
 })
 await page.waitForTimeout(300)
 let fingerFoam=await page.evaluate(()=>window.scene.foam)
 assert.ok(fingerFoam.length>=2,'index alone draws shampoo foam')
 assert.ok(fingerFoam.every(b=>b.r<6),'index foam stays small')
 assert.ok(fingerFoam.every(b=>Math.abs(b.x-537.6)<12&&Math.abs(b.y-216)<12),'foam attaches at the actual fingertip')
 assert.equal(await page.evaluate(()=>window.scene.soap.length),0)
 await page.screenshot({path:path.join(artifacts,'index-shampoo.png')})
 for(let i=0;i<5;i++){
  await page.evaluate(()=>{for(const id of [5,6,7,8])window.fixture.hand[id].x-=.035});await page.waitForTimeout(100)
 }
 assert.ok(await page.evaluate(()=>window.scene.foam.length)>fingerFoam.length,'index path creates continuous small lather')
 await hand(page,'open');await page.locator('#foam-reset').click();await page.waitForTimeout(70)
 await hand(page,'fist');const first=await ink(page);await page.waitForTimeout(950);assert.ok(await ink(page)>first,'stationary fist repeats')
 const fistFoam=await page.evaluate(()=>window.scene.foam)
 assert.ok(Math.max(...fistFoam.map(b=>b.r))>25,'fist makes much bigger shampoo lather')
 assert.equal(await page.evaluate(()=>window.scene.soap.length),0,'fist cannot emit blown soap bubbles')
 for(let x=.5;x<=.87;x+=.04)await hand(page,'fist',x,.5)
 await page.waitForFunction(()=>window.scene.foam.some(b=>b.x<250&&b.y>280&&b.y<430),{},{polling:100,timeout:2000})
 await page.screenshot({path:path.join(artifacts,'fist-trail.png')})
 await hand(page,'open');const stopped=await ink(page);await page.waitForTimeout(700);assert.ok(Math.abs(await ink(page)-stopped)<20,'open hand stops emission')
 await hand(page,'fist',.52,.7);await hand(page,'pinch',.42,.65);await page.waitForTimeout(250)
 assert.ok((await page.locator('.shampoo-state').innerText()).includes('보글보글'))
 // Brief face loss retains foam, long loss hides it, reacquisition restores permanent anchors.
 await hand(page,null);await page.evaluate(()=>{window.savedFace=window.fixture.face;window.fixture.face=null});await page.waitForTimeout(100);assert.ok(await ink(page)>0)
 await page.waitForTimeout(450);assert.equal(await ink(page),0)
 await page.evaluate(()=>window.fixture.face=window.savedFace);await page.waitForTimeout(200);assert.ok(await ink(page)>0)
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))});await page.waitForTimeout(100)
 const counts=await page.evaluate(()=>({...window.metrics}));assert.equal(await page.evaluate(()=>window.cameraTrack.enabled),false)
 await page.waitForTimeout(250);assert.equal((await page.evaluate(()=>window.metrics)).frames,counts.frames)
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'))});await page.waitForTimeout(200)
 assert.equal(await page.evaluate(()=>window.cameraTrack.enabled),true)
 await page.locator('#camera-start').click();await page.waitForTimeout(100)
 assert.equal(await page.evaluate(()=>window.cameraTrack.readyState),'ended');assert.equal(await page.evaluate(()=>window.metrics.closed),2)
 const off=await page.evaluate(()=>window.metrics.frames);await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>window.metrics.frames),off)
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(artifacts,'mobile.png')})
 // Hub invokes teardown synchronously before changing iframe URL.
 await page.goto(base+'/#shampoo');const frame=page.frameLocator('#example-frame');await frame.locator('#camera-start').click();await frame.locator('body.camera-on').waitFor()
 await page.evaluate(()=>{window.oldView=document.querySelector('iframe').contentWindow;window.oldTrack=window.oldView.cameraTrack})
 await page.locator('#tab-sampler').click();assert.equal(await page.evaluate(()=>window.oldTrack.readyState),'ended')
 await frame.locator('canvas').first().waitFor();assert.equal(await page.locator('#tab-sampler').getAttribute('aria-selected'),'true')
 // Permission can resolve after a route switch. The late stream must still stop.
 await page.goto(base+'/shampoo.html')
 await page.evaluate(()=>{const get=navigator.mediaDevices.getUserMedia;navigator.mediaDevices.getUserMedia=()=>get().then(stream=>new Promise(resolve=>{window.lateTrack=stream.getVideoTracks()[0];window.resolveCamera=()=>resolve(stream)}))})
 await page.locator('#camera-start').click();await page.waitForFunction(()=>!!window.resolveCamera)
 await page.evaluate(()=>{dispatchEvent(new Event('interactive:dispose'));window.resolveCamera()})
 await page.waitForFunction(()=>window.lateTrack.readyState==='ended')
 assert.equal(await page.locator('video').evaluate(v=>v.srcObject),null)
 // The actual left open palm wipes a persistent, interpolated window into fog.
 await page.setViewportSize({width:960,height:720});await page.goto(base+'/shampoo.html')
 await page.locator('#camera-start').click();await page.waitForTimeout(350)
 assert.deepEqual(await page.evaluate(()=>({width:window.cameraConstraints.video.width.ideal,height:window.cameraConstraints.video.height.ideal})),{width:1920,height:1080},'display requests full HD rather than the inference resolution')
 assert.ok(await fogAlpha(page,480,353)>200)
 assert.equal(await page.locator('video').evaluate(v=>getComputedStyle(v).filter),'none','original video has no blur filter')
 await page.locator('.shampoo-fog').evaluate(c=>c.style.visibility='hidden')
 const clearReference=await page.screenshot({clip:{x:350,y:340,width:40,height:24}})
 await page.locator('.shampoo-fog').evaluate(c=>c.style.visibility='')
 await page.evaluate(()=>{window.fixture.side='right';window.fixture.face=null})
 for(const x of [.28,.43,.58,.73])await hand(page,'open',x,.48)
 assert.ok(await fogAlpha(page,480,353)>200,'right hand must not clear the glass')
 await page.evaluate(()=>window.fixture.side='left');await hand(page,'open',.5,.48);await page.waitForTimeout(250)
 assert.ok(await fogAlpha(page,480,353)>200,'a stationary palm is not a wipe')
 for(const x of [.52,.6,.68,.75])await hand(page,'open',x,.48)
 assert.ok(await fogAlpha(page,370,353)<5,'left palm makes a clear window at its mirrored screen position')
 const wipedImage=await page.screenshot({clip:{x:350,y:340,width:40,height:24}})
 const fidelity=await page.evaluate(async([a,b])=>{
  const read=async(src)=>{const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return g.getImageData(0,0,c.width,c.height).data}
  const [reference,wiped]=await Promise.all([read(a),read(b)]);let difference=0,low=255,high=0
  for(let i=0;i<reference.length;i+=4){low=Math.min(low,wiped[i]);high=Math.max(high,wiped[i]);for(let j=0;j<3;j++)difference+=Math.abs(reference[i+j]-wiped[i+j])}
  return {difference:difference/(reference.length/4*3),contrast:high-low}
 },[clearReference,wipedImage].map(b=>'data:image/png;base64,'+b.toString('base64')))
 assert.ok(fidelity.difference<3,`wiped video matches the original rather than a blurred copy: ${JSON.stringify(fidelity)}`)
 assert.ok(fidelity.contrast>230,'fine black/white details stay sharp after wiping')
 assert.ok(await fogAlpha(page,60,600)>200,'untouched fog remains')
 assert.equal(await ink(page),0,'wiping does not draw shampoo foam')
 await page.screenshot({path:path.join(artifacts,'left-hand-wipe.png')})
 await hand(page,null);await page.waitForTimeout(350);await hand(page,'open',.15,.12)
 assert.ok(await fogAlpha(page,816,94)>200,'long detection gaps do not draw a teleporting wipe')
 for(let i=1;i<=7;i++)await hand(page,'open',.15+i*.003,.12)
 assert.ok(await fogAlpha(page,816,94)<5,'slow motion accumulates rather than being discarded by the movement threshold')
 await hand(page,null);await page.waitForTimeout(250)
 await page.setViewportSize({width:640,height:480});await page.waitForTimeout(200)
 assert.ok(await fogAlpha(page,370*2/3,353*2/3)<5,'resizing preserves the cleared window')
 await page.locator('#fog-reset').click();await page.waitForTimeout(100)
 assert.ok(await fogAlpha(page,370*2/3,353*2/3)>200,'refog restores the glass')
 await page.locator('#camera-start').click();await page.waitForTimeout(70)
 assert.equal(await page.locator('.shampoo-fog').evaluate(c=>getComputedStyle(c).opacity),'0')
 // New gesture and world simulation: no mask or drawing foam is needed to blow.
 await page.setViewportSize({width:960,height:720});await page.goto(base+'/shampoo.html')
 await page.evaluate(()=>{
  const f=window.fixture.face;f[13]={x:.5,y:.68,z:0};f[14]={x:.5,y:.70,z:0};f[61]={x:.45,y:.69,z:0};f[291]={x:.55,y:.69,z:0}
  const h=Array.from({length:21},()=>({x:.5,y:.8,z:0}));h[0]={x:.57,y:.81,z:0}
  h[5]={x:.51,y:.70,z:0};h[6]={x:.44,y:.63,z:0};h[7]={x:.47,y:.58,z:0};h[8]={x:.53,y:.69,z:0};h[4]={x:.535,y:.69,z:0}
  for(const [base,pip,dip,tip,x] of [[9,10,11,12,.57],[13,14,15,16,.63],[17,18,19,20,.69]]){
   h[base]={x,y:.70,z:0};h[pip]={x,y:.56,z:0};h[dip]={x,y:.48,z:0};h[tip]={x,y:.40,z:0}
  }
  window.oHand=h;window.fixture.hand=h
 })
 await page.locator('#camera-start').click()
 await page.waitForFunction(()=>document.querySelector('.shampoo-state').textContent.includes('비눗방울을 불고'))
 await page.waitForTimeout(1700)
 let soap=await page.evaluate(()=>window.scene.soap)
 assert.ok(soap.length>=10);assert.equal(await page.evaluate(()=>window.scene.foam.length),0,'O emits soap instead of attached pinch foam')
 assert.ok(Math.max(...soap.map(b=>b.r))-Math.min(...soap.map(b=>b.r))>20,'varied giant sizes')
 assert.ok(Math.max(...soap.map(b=>b.r))>60,'O bubbles are dramatically larger')
 assert.ok(Math.max(...soap.map(b=>b.r))<=84)
 await page.screenshot({path:path.join(artifacts,'soap-blowing.png')})
 await hand(page,null);await page.waitForTimeout(350)
 const count=await page.evaluate(()=>window.scene.soap.length)
 await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.scene.soap.length),count,'missing O beyond grace stops emission')
 await page.evaluate(()=>window.fixture.hand=window.oHand);await page.waitForTimeout(400)
 assert.ok(await page.evaluate(()=>window.scene.soap.length)>count,'O can reenter')
 await hand(page,'open');await page.waitForTimeout(350)
 const released=await page.evaluate(()=>window.scene.soap.length)
 await page.waitForTimeout(3200)
 soap=await page.evaluate(()=>window.scene.soap)
 assert.equal(soap.length,released)
 assert.ok(soap.reduce((sum,b)=>sum+b.y,0)/soap.length>420,'large bubbles fall and form a deep pile')
 assert.ok(soap.some(b=>Math.abs(b.y+b.r-712)<6),'bottom bubbles land on the floor')
 assert.ok(soap.some(b=>b.y<712-b.r-4),'bubbles stack on other bubbles')
 await page.screenshot({path:path.join(artifacts,'soap-pile.png')})
 await page.waitForFunction(()=>window.scene.duck.length>0,{},{timeout:8000,polling:100})
 await page.screenshot({path:path.join(artifacts,'duck-arrival.png')})
 await page.waitForFunction(n=>window.scene.soap.length<n,released,{timeout:6000,polling:100})
 await page.screenshot({path:path.join(artifacts,'duck-eating.png')})
 // Seed head food as well: the duck must eat it and mask updates must not restore it.
 await page.evaluate(()=>window.fixture.mask=true);await page.waitForTimeout(900)
 await page.waitForFunction(()=>window.scene.foam.length>30,{},{polling:100})
 const headFood=await page.evaluate(()=>window.scene.foam.length)
 await page.waitForFunction(n=>window.scene.foam.length<n*.8,headFood,{timeout:20000,polling:100})
 await page.screenshot({path:path.join(artifacts,'duck-head-foam.png')})
 await page.locator('#foam-reset').click();await page.waitForTimeout(100)
 assert.equal(await page.evaluate(()=>window.scene.soap.length+window.scene.duck.length),0)
 await page.locator('#camera-start').click();assert.equal(await page.evaluate(()=>window.cameraTrack.readyState),'ended')
 assert.deepEqual(errors,[])
 console.log('mask gating, permanent pinch, repeated/interpolated fist, transitions, grace, visibility, stop and hub switch passed')
 console.log('O sign/reentry/release, transparent varied bubbles, gravity/stacking and duck eating soap/head foam passed')
 console.log('left-only open-palm wipe, slow/interpolated path, no-face operation, persistence, resize and refog passed')
 console.log('Screenshots:',artifacts)
 await browser.close()
})().catch(async e=>{console.error(e);await browser?.close();process.exitCode=1})
