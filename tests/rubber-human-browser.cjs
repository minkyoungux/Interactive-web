// Exercise pinch, rebound, idle scheduling, visibility and both capture modes.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch (error) {
  if (process.env.PLAYWRIGHT_MODULE) throw error;
  playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}
const { chromium } = playwright;
const baseUrl = process.env.RUBBER_BROWSER_URL || 'http://127.0.0.1:5173';
const artifacts = fs.mkdtempSync(path.join(os.tmpdir(), 'rubber-browser-check-'));
let activeBrowser;
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.RUBBER_CHROME_EXECUTABLE || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 activeBrowser=browser;
 const page=await browser.newPage({viewport:{width:960,height:640}}); const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error') console.log('BROWSER ERROR',m.text())});
 await page.route('**/@mediapipe_tasks-vision.js*',route=>route.fulfill({contentType:'text/javascript',body:`
 export const FilesetResolver={forVisionTasks:async()=>({})};
 export class HandLandmarker { static async createFromOptions(){return new this} close(){} detectForVideo(){window.inferCount++;return {landmarks:window.fixture.hand?[window.fixture.hand]:[]}} }
 export class FaceLandmarker { static async createFromOptions(){return new this} close(){} detectForVideo(){window.inferCount++;return {faceLandmarks:window.fixture.face?[window.fixture.face]:[]}} }
 `}));
 await page.addInitScript(()=>{ const raf=window.requestAnimationFrame.bind(window);window.rafCount=0;window.requestAnimationFrame=cb=>{window.rafCount++;return raf(cb)};window.inferCount=0;
 const oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
 const face=Array.from({length:478},()=>({x:.5,y:.5,z:0}));
 oval.forEach((id,i)=>{const a=-Math.PI/2+i/36*Math.PI*2;face[id]={x:.5+Math.cos(a)*.16,y:.5+Math.sin(a)*.3,z:0}});
 face[205]={x:.4,y:.55,z:0};face[425]={x:.6,y:.55,z:0};
 window.fixture={face,originalFace:face,hand:null};
 navigator.mediaDevices.getUserMedia=async()=>{
 const c=document.createElement('canvas'); window.fixture.cameraCanvas=c; c.width=960;c.height=640;const x=c.getContext('2d');
 const draw=()=>{x.fillStyle='#e7e6e1';x.fillRect(0,0,960,640);const g=x.createRadialGradient(420,255,15,485,335,230);g.addColorStop(0,'#efc7a4');g.addColorStop(.55,'#c89572');g.addColorStop(1,'#6f4838');x.fillStyle=g;x.beginPath();x.ellipse(480,320,154,193,0,0,7);x.fill();x.fillStyle='#102060';for(const cx of [424,536]){x.beginPath();x.ellipse(cx,288,14,19,0,0,7);x.fill()}x.fillStyle='#802030';x.fillRect(438,397,84,14)};draw();const t=setInterval(draw,33);const stream=c.captureStream(30);stream.getTracks()[0].addEventListener('ended',()=>clearInterval(t));return stream;
 };
 });
 await page.goto(`${baseUrl}/rubber-human.html`);await page.locator('#camera-start').click();await page.waitForFunction(()=>document.querySelector('.rubber-state').textContent.includes('얼굴 위에서'));
 await page.screenshot({path:path.join(artifacts,'idle.png')});
 const idleCheck=await page.evaluate(()=>{const a=document.querySelector('.rubber-canvas').getContext('2d'),b=window.fixture.cameraCanvas.getContext('2d');return [[480,130],[335,320],[400,250],[600,350]].map(([x,y])=>{const actual=Array.from(a.getImageData(x,y,1,1).data),expected=Array.from(b.getImageData(959-x,y,1,1).data);return {x,y,actual,expected}})});
 for(const p of idleCheck) assert.deepEqual(p.actual,p.expected,`idle changed at ${p.x},${p.y}`);
 console.log('idle matches original camera pixels:',idleCheck.length);
 
 async function hand(x,y,gap){await page.evaluate(({x,y,gap})=>{const h=Array.from({length:21},()=>({x,y:y+.2,z:0}));h[5]={x:x-.055,y:y+.12,z:0};h[17]={x:x+.055,y:y+.12,z:0};h[4]={x:x-gap/2,y,z:0};h[8]={x:x+gap/2,y,z:0};window.fixture.hand=h},{x,y,gap});await page.waitForTimeout(150)}
 await hand(.441,.45,.065); await hand(.441,.45,.018);
 await page.waitForFunction(()=>document.querySelector('.rubber-state').textContent.includes('잡고'));
 for(let i=1;i<=8;i++) await hand(.441-i*.03,.45-i*.01,.018);
 await page.screenshot({path:path.join(artifacts,'pull.png')});
 const backgroundCheck=await page.evaluate(()=>{const a=document.querySelector('.rubber-canvas').getContext('2d');return [[480,100],[305,300],[480,540],[820,300]].map(([x,y])=>Array.from(a.getImageData(x,y,1,1).data))});
 for(const pixel of backgroundCheck) assert.deepEqual(pixel,[231,230,225,255]);
 console.log('outside face has no skin ring or blur:',backgroundCheck.length);
 console.log('synthetic pinch:',await page.locator('.rubber-state').innerText());
 await hand(.2,.37,.085);await page.waitForTimeout(1700);await page.screenshot({path:path.join(artifacts,'return.png')});
 assert.ok(!(await page.locator('.rubber-state').innerText()).includes('잡고'));
 await page.evaluate(()=>window.fixture.face=null);await page.waitForTimeout(350);console.log('face loss:',await page.locator('.rubber-state').innerText());
 await page.locator('#camera-start').click();await page.waitForFunction(()=>document.querySelector('video').srcObject===null); assert.equal(await page.locator('video').evaluate(v=>v.srcObject),null);

 await page.waitForTimeout(250);const idle=await page.evaluate(()=>window.rafCount);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window.rafCount),idle);console.log('camera-off idle schedules no animation frames');
 await page.evaluate(()=>{window.fixture.face=window.fixture.originalFace;window.fixture.hand=null});await page.locator('#camera-start').click();await page.waitForFunction(()=>document.body.classList.contains('camera-on'));await page.waitForTimeout(200);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))});
 const paused=await page.evaluate(()=>({raf:window.rafCount,infer:window.inferCount,enabled:document.querySelector('video').srcObject.getVideoTracks()[0].enabled}));assert.equal(paused.enabled,false);await page.waitForTimeout(200);assert.deepEqual(await page.evaluate(()=>({raf:window.rafCount,infer:window.inferCount})),{raf:paused.raf,infer:paused.infer});
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'))});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.querySelector('video').srcObject.getVideoTracks()[0].enabled),true);assert.ok(await page.evaluate(()=>window.inferCount)>paused.infer);console.log('hidden view pauses inference, rendering and tracks; return resumes');
 const photo=page.waitForEvent('download',{timeout:30000});await page.locator('.capture-button').press('Enter');const picture=await photo;assert.ok(picture.suggestedFilename().endsWith('.png'));console.log('photo saved',picture.suggestedFilename());
 await page.locator('.capture-button').focus();await page.keyboard.down('Space');await page.waitForTimeout(650);await page.keyboard.up('Space');await page.waitForFunction(()=>document.querySelector('.capture-button').classList.contains('is-recording'),{},{timeout:30000});await page.waitForTimeout(600);const recording=page.waitForEvent('download',{timeout:30000});await page.locator('.capture-button').press('Enter');const movie=await recording;const fs=require('node:fs');const size=fs.statSync(await movie.path()).size;assert.ok(size>1000);console.log('video saved',movie.suggestedFilename(),size,'bytes');
 assert.deepEqual(errors,[]);console.log('errors',errors);console.log('Screenshots:',artifacts);await browser.close();
})().catch(async e=>{console.error(e);await activeBrowser?.close();process.exitCode=1});
