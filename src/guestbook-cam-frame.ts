// Code-drawn frames keep live preview and downloaded photos identical.
export function drawCamFrame(c: CanvasRenderingContext2D, theme: string, caption: string) {
  c.save();c.textAlign='left';c.textBaseline='alphabetic'
  const gradient=(x:number,y:number,w:number,h:number,a:string,b:string)=>{const g=c.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,a);g.addColorStop(1,b);c.fillStyle=g;c.fillRect(x,y,w,h)}
  const bevel=(x:number,y:number,w:number,h:number)=>{
    c.fillStyle='#c3c3c3';c.fillRect(x,y,w,h)
    c.strokeStyle='#fff';c.lineWidth=2;c.beginPath();c.moveTo(x,y+h);c.lineTo(x,y);c.lineTo(x+w,y);c.stroke()
    c.strokeStyle='#57515e';c.beginPath();c.moveTo(x+w,y);c.lineTo(x+w,y+h);c.lineTo(x,y+h);c.stroke()
  }
  const text=(s:string,x:number,y:number,color='#433650',font='10px monospace')=>{c.fillStyle=color;c.font=font;c.fillText(s,x,y)}
  const star=(x:number,y:number,r:number)=>{c.save();c.translate(x,y);c.fillStyle='#fffcea';c.strokeStyle='#a494c5';c.lineWidth=1;c.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,rr=i%2?r*.24:r;c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr)}c.closePath();c.fill();c.stroke();c.restore()}
  const sticker=(label:string,x:number,y:number,w:number,color:string,angle:number)=>{
    c.save();c.translate(x,y);c.rotate(angle);c.fillStyle='#49356544';c.fillRect(3,4,w,24);c.fillStyle=color;c.fillRect(0,0,w,24);c.strokeStyle='#fff';c.lineWidth=2;c.strokeRect(0,0,w,24);text(label,7,16,'#4e3968','bold 10px monospace');c.restore()
  }
  const planet=(x:number,y:number)=>{
    c.save();c.translate(x,y);const g=c.createLinearGradient(-20,-20,20,20);g.addColorStop(0,'#fff');g.addColorStop(.4,'#9ff2ff');g.addColorStop(1,'#ffabd8');c.fillStyle=g;c.beginPath();c.arc(0,0,17,0,Math.PI*2);c.fill();c.strokeStyle='#858ec0';c.lineWidth=1.3;c.beginPath();c.ellipse(0,0,31,8,-.5,0,Math.PI*2);c.stroke();c.restore()
  }
  const classic=theme==='hearts', collage=theme==='office'
  // Wallpaper visible around the central webcam window, never across the face.
  gradient(0,0,480,40,classic?'#478caf':'#6edcff',classic?'#a1c4de':'#ffb9da')
  gradient(0,40,22,260,'#70d4ed','#d9b6e6');gradient(458,40,22,260,'#c0d7ef','#ffb5d6')
  gradient(0,298,480,62,'#9edcea','#f9b5d8')
  c.strokeStyle='#ffffff60';c.lineWidth=1
  for(let x=0;x<480;x+=16){c.beginPath();c.moveTo(x,0);c.lineTo(x,36);c.moveTo(x,300);c.lineTo(x,360);c.stroke()}
  for(let y=0;y<360;y+=16){c.beginPath();c.moveTo(0,y);c.lineTo(20,y);c.moveTo(460,y);c.lineTo(480,y);c.stroke()}
  bevel(19,12,442,27);gradient(22,15,436,20,classic?'#050984':'#8b78cf',classic?'#469bd5':'#ffc2d8')
  text(classic?'My Webcam - Internet Explorer':collage?'welcome to my little web…☆':'DreamCam.exe — digital daydream',29,29,'#fff','bold 10px monospace')
  for(let i=0;i<3;i++){bevel(407+i*16,18,13,13);text(['_','□','×'][i],410+i*16,28,'#333','11px monospace')}
  c.fillStyle='#c3c3c3';c.fillRect(20,39,440,19);text('File   Edit   View   Favorites   Help',28,52,'#333','9px monospace')
  c.strokeStyle='#eee';c.lineWidth=3;c.strokeRect(20,58,440,240);c.strokeStyle='#58525d';c.lineWidth=1;c.strokeRect(23,60,434,235)
  bevel(20,298,440,42)
  text('♥',30,322,'#ac609e','16px serif');c.fillStyle='#fff4fb';c.fillRect(50,304,397,21)
  c.fillStyle='#574270';c.font='bold 13px sans-serif';c.fillText(caption,58,320,381)
  text('Connected  •  MY PRIVATE LITTLE WORLD',28,336,'#69616e','8px monospace')
  const d=new Date();const date=`${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`
  text('♡ best viewed with you',24,353,'#685080','9px monospace');text(date,385,353,'#685080','9px monospace')
  if(classic){
    sticker('YOU’VE GOT MAIL ♡',30,68,128,'#f6ffc6',-.045)
    bevel(355,253,90,35);gradient(359,257,22,18,'#91dcf8','#a896db');text('ONLINE',388,273,'#353b80','bold 10px monospace');text('56K…♡',388,283,'#5e596d','8px monospace')
    star(451,87,12);star(30,278,11)
  }else if(!collage){
    planet(43,84);star(442,80,15);star(425,107,7);star(38,249,10)
    sticker('★ LIMITED EDITION ME',277,271,165,'#fff1b3',-.045)
    sticker('dream girl.exe',35,276,114,'#efcaff',.04)
  }else{
    sticker('UNDER CONSTRUCTION',24,67,155,'#f2ff93',-.035)
    sticker('일촌공개 ♡',350,70,100,'#ffd1e8',.045)
    planet(441,263);star(25,233,9)
    bevel(32,251,142,40);gradient(35,254,136,12,'#1262af','#b6def5');text('away_message.txt',39,263,'white','8px monospace');text('마음은 이미 퇴근…',39,280,'#554472','11px sans-serif')
  }
  c.restore()
}
