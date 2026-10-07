import './guestbook-webcam.css'
import { drawCamFrame } from './guestbook-cam-frame'

export function mountWebcam() {
  const open = document.createElement('button')
  open.type = 'button'; open.className = 'webcam-open'; open.textContent = '✧ 하두리 감성 캠'
  document.querySelector('.play-tools')!.append(open)
  const booth = document.createElement('dialog')
  booth.className = 'retro-cam'
  booth.innerHTML = `<div class="window-title"><b>♡ MY CAM.exe — 그때 그 감성</b><button type="button" class="cam-close" aria-label="카메라 부스 닫기">×</button></div>
    <div class="cam-menu">File　Photo　Memories <span>320 × 240 · RETRO WEBCAM</span></div>
    <div class="cam-layout"><div><div class="cam-screen"><canvas width="480" height="360" aria-label="필터가 적용된 카메라 미리보기"></canvas><span class="cam-off">CAMERA OFF<br><small>그 시절의 나를 만나러…☆</small></span></div>
    <p class="cam-status" role="status">카메라 켜기를 누르면 권한을 요청해요.</p></div>
    <div class="cam-settings"><b>오늘의 셀카 설정…♡</b><label>화질 감성<select class="cam-filter"><option value="retro">2003 저화질</option><option value="pink">딸기우유 뽀샤시</option><option value="mono">흑백 감성</option></select></label>
    <label>스티커 프레임<select class="cam-frame"><option value="hearts">01 · Windows 98 / Sign On</option><option value="stars">02 · Pastel Cyber / 핑크 행성</option><option value="office">03 · My Old Web / 웹 콜라주</option></select></label>
    <label>사진 속 한마디<input class="cam-caption" maxlength="24" value="나… 오늘 좀 괜찮은 듯♡"></label><label class="cam-mirror"><input type="checkbox" checked> 거울 모드</label>
    <button type="button" class="cam-start">카메라 켜기</button><button type="button" class="cam-shoot" disabled>찰칵! 사진 찍기</button><button type="button" class="cam-stop" disabled>카메라 끄기</button>
    <p class="cam-privacy">마이크는 사용하지 않아요.<br>영상·사진은 서버로 전송하지 않으며 저장 버튼으로만 내려받아요.</p></div></div>
    <section class="cam-result" hidden><b>오늘의 흑역사… 아니 추억 저장♡</b><img alt="방금 찍은 필터 사진"><a download="my-y2k-memory.png">사진 저장 ↓</a><button type="button" class="cam-delete">사진 지우기</button></section>`
  document.body.append(booth)
  const q = <T extends HTMLElement>(s: string) => booth.querySelector<T>(s)!
  const canvas = q<HTMLCanvasElement>('canvas'), ctx = canvas.getContext('2d')!
  const small = document.createElement('canvas'); small.width = 320; small.height = 240
  const sc = small.getContext('2d')!
  const video = document.createElement('video'); video.muted = true; video.playsInline = true
  const start = q<HTMLButtonElement>('.cam-start'), stop = q<HTMLButtonElement>('.cam-stop'), shoot = q<HTMLButtonElement>('.cam-shoot')
  const status = q('.cam-status'), off = q('.cam-off')
  let stream: MediaStream | undefined, frame = 0, version = 0, photoUrl = '', capturing = false
  const drawFrame = () => drawCamFrame(ctx,q<HTMLSelectElement>('.cam-frame').value,q<HTMLInputElement>('.cam-caption').value)
  const preview = () => {
    if(stream)return
    const g=ctx.createLinearGradient(0,0,480,360);g.addColorStop(0,'#83d6ef');g.addColorStop(1,'#eab6d8');ctx.fillStyle=g;ctx.fillRect(0,0,480,360)
    ctx.fillStyle='#ffffff45';for(let i=0;i<6;i++){ctx.beginPath();ctx.ellipse(80+i*85,135+(i%2)*60,48,15,0,0,Math.PI*2);ctx.fill()}
    drawFrame()
  }
  q<HTMLSelectElement>('.cam-frame').addEventListener('change',preview)
  q<HTMLInputElement>('.cam-caption').addEventListener('input',preview)
  const removePhoto = () => {
    if(photoUrl) URL.revokeObjectURL(photoUrl)
    photoUrl='';q<HTMLImageElement>('.cam-result img').removeAttribute('src');q<HTMLAnchorElement>('.cam-result a').removeAttribute('href');q('.cam-result').hidden=true
  }
  const shutdown = () => {
    version++;cancelAnimationFrame(frame);stream?.getTracks().forEach(t=>t.stop());stream=undefined
    video.pause();video.srcObject=null;ctx.clearRect(0,0,480,360)
    start.disabled=false;stop.disabled=true;shoot.disabled=true;off.hidden=false;capturing=false
    status.textContent='카메라가 꺼졌어요. 저장하지 않은 사진은 창을 닫으면 사라져요.'
    preview()
  }
  const render = () => {
    if(!stream)return
    if(video.readyState>=2 && video.videoWidth) {
      const vw=video.videoWidth,vh=video.videoHeight,ratio=4/3
      const sw=Math.min(vw,vh*ratio),sh=sw/ratio
      sc.save();sc.clearRect(0,0,320,240)
      if(q<HTMLInputElement>('.cam-mirror input').checked){sc.translate(320,0);sc.scale(-1,1)}
      const filter=q<HTMLSelectElement>('.cam-filter').value
      sc.filter=filter==='mono'?'grayscale(1) contrast(1.15)':filter==='pink'?'brightness(1.16) saturate(.75) blur(.6px)':'contrast(1.16) saturate(.7)'
      sc.drawImage(video,(vw-sw)/2,(vh-sh)/2,sw,sh,0,0,320,240);sc.restore()
      ctx.imageSmoothingEnabled=filter!=='retro';ctx.drawImage(small,0,0,480,360)
      ctx.fillStyle=filter==='pink'?'#ffb8d52b':'#a19bf212';ctx.fillRect(0,0,480,360)
      if(filter==='retro'){ctx.fillStyle='#29223913';for(let y=0;y<360;y+=3)ctx.fillRect(0,y,480,1)}
      drawFrame()
    }
    frame=requestAnimationFrame(render)
  }
  open.onclick=()=>{booth.showModal();preview()}
  q<HTMLButtonElement>('.cam-close').onclick=()=>booth.close()
  booth.addEventListener('close',()=>{shutdown();removePhoto();open.focus()})
  stop.onclick=shutdown
  start.onclick=async()=>{
    if(!navigator.mediaDevices?.getUserMedia){status.textContent='이 브라우저에서는 카메라를 사용할 수 없어요. HTTPS 주소의 최신 브라우저에서 열어주세요.';return}
    const request=++version;start.disabled=true;stop.disabled=false;status.textContent='카메라 권한을 기다리는 중…'
    try {
      const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false})
      if(request!==version||!booth.open){media.getTracks().forEach(t=>t.stop());return}
      stream=media;video.srcObject=media;await video.play()
      if(request!==version)return
      stream.getVideoTracks()[0]?.addEventListener('ended',()=>{if(request===version)shutdown()},{once:true})
      off.hidden=true;shoot.disabled=false;status.textContent='LIVE… 필터와 프레임을 골라봐♡';render()
    }catch(error){
      if(request!==version)return
      shutdown()
      status.textContent=error instanceof DOMException&&error.name==='NotAllowedError'?'카메라 권한이 꺼져 있어요. 주소창의 사이트 권한에서 허용한 뒤 다시 켜주세요.':'카메라를 연결하지 못했어요. 장치 연결과 다른 앱의 카메라 사용을 확인해주세요.'
    }
  }
  shoot.onclick=()=>{
    if(!stream||video.readyState<2||capturing)return
    capturing=true;shoot.disabled=true;const request=version
    canvas.toBlob(blob=>{
      if(request!==version||!booth.open)return
      capturing=false;shoot.disabled=false
      if(!blob){status.textContent='사진을 만들지 못했어요. 다시 찍어주세요.';return}
      removePhoto();photoUrl=URL.createObjectURL(blob);q<HTMLImageElement>('.cam-result img').src=photoUrl
      q<HTMLAnchorElement>('.cam-result a').href=photoUrl;q('.cam-result').hidden=false
      status.textContent='찰칵! 아래에서 사진을 확인하고 저장해줘♡'
    },'image/png')
  }
  q<HTMLButtonElement>('.cam-delete').onclick=removePhoto
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&booth.open)shutdown()})
  window.addEventListener('pagehide',()=>{shutdown();removePhoto()},{once:true})
}
