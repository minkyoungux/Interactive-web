(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))a(i);new MutationObserver(i=>{for(const u of i)if(u.type==="childList")for(const f of u.addedNodes)f.tagName==="LINK"&&f.rel==="modulepreload"&&a(f)}).observe(document,{childList:!0,subtree:!0});function l(i){const u={};return i.integrity&&(u.integrity=i.integrity),i.referrerPolicy&&(u.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?u.credentials="include":i.crossOrigin==="anonymous"?u.credentials="omit":u.credentials="same-origin",u}function a(i){if(i.ep)return;i.ep=!0;const u=l(i);fetch(i.href,u)}})();const V="./assets/anyma-performer-8UqIbHZb.png",G="./assets/anyma-performer-web-DnaE9VOz.png",ee="./assets/hero-CLDdwZDr.png",H="data:image/svg+xml,%3csvg%20xmlns='http://www.w3.org/2000/svg'%20aria-hidden='true'%20width='32'%20height='32'%20viewBox='0%200%20256%20256'%3e%3cpath%20fill='%23007ACC'%20d='M0%20128v128h256V0H0z'/%3e%3cpath%20fill='%23FFF'%20d='m56.612%20128.85l-.081%2010.483h33.32v94.68h23.568v-94.68h33.321v-10.28c0-5.69-.122-10.444-.284-10.566c-.122-.162-20.4-.244-44.983-.203l-44.74.122l-.121%2010.443Zm149.955-10.742c6.501%201.625%2011.459%204.51%2016.01%209.224c2.357%202.52%205.851%207.111%206.136%208.208c.08.325-11.053%207.802-17.798%2011.988c-.244.162-1.22-.894-2.317-2.52c-3.291-4.795-6.745-6.867-12.028-7.233c-7.76-.528-12.759%203.535-12.718%2010.321c0%201.992.284%203.17%201.097%204.795c1.707%203.536%204.876%205.649%2014.832%209.956c18.326%207.883%2026.168%2013.084%2031.045%2020.48c5.445%208.249%206.664%2021.415%202.966%2031.208c-4.063%2010.646-14.14%2017.879-28.323%2020.276c-4.388.772-14.79.65-19.504-.203c-10.28-1.828-20.033-6.908-26.047-13.572c-2.357-2.6-6.949-9.387-6.664-9.874c.122-.163%201.178-.813%202.356-1.504c1.138-.65%205.446-3.129%209.509-5.485l7.355-4.267l1.544%202.276c2.154%203.29%206.867%207.801%209.712%209.305c8.167%204.307%2019.383%203.698%2024.909-1.26c2.357-2.153%203.332-4.388%203.332-7.68c0-2.966-.366-4.266-1.91-6.501c-1.99-2.845-6.054-5.242-17.595-10.24c-13.206-5.69-18.895-9.224-24.096-14.832c-3.007-3.25-5.852-8.452-7.03-12.8c-.975-3.617-1.22-12.678-.447-16.335c2.723-12.76%2012.353-21.659%2026.25-24.3c4.51-.853%2014.994-.528%2019.424.569Z'/%3e%3c/svg%3e",B="./assets/vite-BF8QNONU.svg";function te(e){let t=0;const l=a=>{t=a,e.innerHTML=`Count is ${t}`};e.addEventListener("click",()=>l(t+1)),l(0)}document.querySelector("#app").innerHTML=`
<section id="center">
  <div class="hero">
    <img src="${ee}" class="base" width="170" height="179">
    <img src="${H}" class="framework" alt="TypeScript logo"/>
    <img src="${B}" class="vite" alt="Vite logo" />
  </div>
  <div>
    <h1>Get started</h1>
    <p>Edit <code>src/main.ts</code> and save to test <code>HMR</code></p>
  </div>
  <button id="counter" type="button" class="counter"></button>
</section>

<div class="ticks"></div>

<section id="next-steps">
  <div id="docs">
    <svg class="icon" role="presentation" aria-hidden="true"><use href="./icons.svg#documentation-icon"></use></svg>
    <h2>Documentation</h2>
    <p>Your questions, answered</p>
    <ul>
      <li>
        <a href="https://vite.dev/" target="_blank">
          <img class="logo" src="${B}" alt="" />
          Explore Vite
        </a>
      </li>
      <li>
        <a href="https://www.typescriptlang.org" target="_blank">
          <img class="button-icon" src="${H}" alt="">
          Learn more
        </a>
      </li>
    </ul>
  </div>
  <div id="social">
    <svg class="icon" role="presentation" aria-hidden="true"><use href="./icons.svg#social-icon"></use></svg>
    <h2>Connect with us</h2>
    <p>Join the Vite community</p>
    <ul>
      <li><a href="https://github.com/vitejs/vite" target="_blank"><svg class="button-icon" role="presentation" aria-hidden="true"><use href="./icons.svg#github-icon"></use></svg>GitHub</a></li>
      <li><a href="https://chat.vite.dev/" target="_blank"><svg class="button-icon" role="presentation" aria-hidden="true"><use href="./icons.svg#discord-icon"></use></svg>Discord</a></li>
      <li><a href="https://x.com/vite_js" target="_blank"><svg class="button-icon" role="presentation" aria-hidden="true"><use href="./icons.svg#x-icon"></use></svg>X.com</a></li>
      <li><a href="https://bsky.app/profile/vite.dev" target="_blank"><svg class="button-icon" role="presentation" aria-hidden="true"><use href="./icons.svg#bluesky-icon"></use></svg>Bluesky</a></li>
    </ul>
  </div>
</section>

<div class="ticks"></div>
<section id="spacer"></section>
`;te(document.querySelector("#counter"));function se(e){const t=e.getContext("2d"),l=e.closest(".welcome-scene");let a=-.16,i=0,u=0,f=.004,b=!1,X=0,$=0;const Y=s=>{const g=Math.cos(i),E=Math.sin(i),S=s.x*g+s.z*E,v=-s.x*E+s.z*g,w=Math.cos(a),p=Math.sin(a);return{x:S,y:s.y*w-v*p,z:s.y*p+v*w}},L=(s,g)=>Y({x:Math.cos(s)*Math.sin(g),y:Math.sin(s),z:Math.cos(s)*Math.cos(g)}),A=()=>{const s=e.getBoundingClientRect(),g=Math.min(window.devicePixelRatio||1,2),E=Math.max(1,Math.round(s.width*g)),S=Math.max(1,Math.round(s.height*g));(e.width!==E||e.height!==S)&&(e.width=E,e.height=S),t.setTransform(g,0,0,g,0,0),t.clearRect(0,0,s.width,s.height);const v=s.width/2,w=s.height/2,p=Math.min(s.width,s.height)*.43,k=t.createRadialGradient(v-p*.3,w-p*.36,p*.06,v,w,p);k.addColorStop(0,"#ffffff"),k.addColorStop(.28,"#8fe8ff"),k.addColorStop(.72,"#50378b"),k.addColorStop(1,"#090b20"),t.beginPath(),t.arc(v,w,p,0,Math.PI*2),t.fillStyle=k,t.fill();const F=[],C=14,I=28;for(let n=0;n<C;n+=1){const r=-Math.PI/2+n/C*Math.PI,P=-Math.PI/2+(n+1)/C*Math.PI;for(let m=0;m<I;m+=1){const c=m/I*Math.PI*2,y=(m+1)/I*Math.PI*2,d=[L(r,c),L(r,y),L(P,y),L(P,c)],h=d.reduce((M,x)=>M+x.z,0)/d.length;h>-.05&&F.push({points:d,depth:h,row:n,column:m})}}F.sort((n,r)=>n.depth-r.depth);for(const n of F){const r=n.points.reduce((M,x)=>({x:M.x+x.x/4,y:M.y+x.y/4,z:M.z+x.z/4}),{x:0,y:0,z:0}),P=Math.max(0,r.x*-.42+r.y*-.58+r.z*.7),m=(n.row+n.column)%5,c=Math.round(70+P*170+(m===0?28:0)),y=Math.min(255,c+(m===2?34:0)),d=Math.min(255,c+(m===0?26:0)),h=Math.min(255,c+45);t.beginPath(),n.points.forEach((M,x)=>{const N=v+M.x*p,D=w+M.y*p;x===0?t.moveTo(N,D):t.lineTo(N,D)}),t.closePath(),t.fillStyle=`rgb(${y} ${d} ${h})`,t.fill(),t.strokeStyle="rgba(8, 12, 30, 0.72)",t.lineWidth=Math.max(.65,p/190),t.stroke()}const O=t.createRadialGradient(v-p*.33,w-p*.38,0,v-p*.33,w-p*.38,p*.48);O.addColorStop(0,"rgba(255,255,255,0.9)"),O.addColorStop(.22,"rgba(171,235,255,0.28)"),O.addColorStop(1,"rgba(255,255,255,0)"),t.beginPath(),t.arc(v,w,p,0,Math.PI*2),t.fillStyle=O,t.fill();const _=50+Math.sin(i)*38,z=43+Math.sin(a)*28,q=100-_,o=(i*57.2958%360+360)%360;l.style.setProperty("--disco-light-x",`${_.toFixed(2)}%`),l.style.setProperty("--disco-light-y",`${z.toFixed(2)}%`),l.style.setProperty("--disco-light-opposite-x",`${q.toFixed(2)}%`),l.style.setProperty("--disco-hue",`${o.toFixed(1)}deg`),l.style.setProperty("--disco-opposite-hue",`${(-o*.55).toFixed(1)}deg`),b||(a+=u,i+=f,u*=.985,f=f*.985+.004*.015),requestAnimationFrame(A)};e.addEventListener("pointerdown",s=>{s.preventDefault(),s.stopPropagation(),b=!0,X=s.clientX,$=s.clientY,u=0,f=0,e.setPointerCapture(s.pointerId),e.classList.add("is-dragging")}),e.addEventListener("pointermove",s=>{if(!b)return;s.preventDefault(),s.stopPropagation();const g=s.clientX-X,E=s.clientY-$;i+=g*.012,a+=E*.01,f=g*.0015,u=E*.0012,X=s.clientX,$=s.clientY});const T=s=>{b&&(s.stopPropagation(),b=!1,e.classList.remove("is-dragging"),e.hasPointerCapture(s.pointerId)&&e.releasePointerCapture(s.pointerId))};e.addEventListener("pointerup",T),e.addEventListener("pointercancel",T),e.addEventListener("click",s=>s.stopPropagation()),requestAnimationFrame(A)}function ie(){const e=document.createElement("div");e.className="welcome-scene",e.innerHTML=`
    <div class="star-field" aria-hidden="true"></div>
    <div class="club-lights" aria-hidden="true">
      <span class="laser laser--one"></span>
      <span class="laser laser--two"></span>
      <span class="laser laser--three"></span>
      <span class="laser laser--four"></span>
    </div>
    <div class="neon-marquee" role="marquee" aria-label="Welcome to Las Vegas">
      <div class="neon-marquee__track" aria-hidden="true">
        <div class="neon-marquee__group">
          <span>WELCOME TO LAS VEGAS</span><i>✦</i>
          <span>WELCOME TO LAS VEGAS</span><i>✦</i>
          <span>WELCOME TO LAS VEGAS</span><i>✦</i>
        </div>
        <div class="neon-marquee__group">
          <span>WELCOME TO LAS VEGAS</span><i>✦</i>
          <span>WELCOME TO LAS VEGAS</span><i>✦</i>
          <span>WELCOME TO LAS VEGAS</span><i>✦</i>
        </div>
      </div>
    </div>
    <div class="club-equalizer" aria-hidden="true"></div>
    <div class="pointer-scripture" aria-hidden="true"></div>
    <div class="disco-controller">
      <canvas id="disco-ball" class="disco-ball" role="img" aria-label="드래그해서 회전하는 미러볼"></canvas>
      <span class="disco-controller__hint">DRAG TO SPIN</span>
    </div>
    <div id="anyma-character" class="anyma-stage" role="img" aria-label="포인터를 바라보며 공연하는 미래형 안드로이드">
      <picture class="anyma-picture">
        <source media="(orientation: portrait)" srcset="${V}" />
        <img class="anyma-image" src="${G}" alt="" />
      </picture>
      <picture class="anyma-picture anyma-face-layer" aria-hidden="true">
        <source media="(orientation: portrait)" srcset="${V}" />
        <img class="anyma-image" src="${G}" alt="" />
      </picture>
      <div class="anyma-gaze" aria-hidden="true">
        <span class="anyma-eye anyma-eye--left"><span class="anyma-pupil"></span></span>
        <span class="anyma-eye anyma-eye--right"><span class="anyma-pupil"></span></span>
      </div>
      <div class="lightstick-rig" aria-hidden="true">
        <span class="lightstick-aura"></span>
        <span class="lightstick-head"><i class="lightstick-core"></i></span>
        <span class="lightstick-neck"></span>
        <span class="lightstick-handle"><i></i></span>
      </div>
      <span class="performance-scan" aria-hidden="true"></span>
    </div>
  `;const t=e.querySelector(".star-field"),l=e.querySelector(".club-equalizer"),a=e.querySelector("#disco-ball"),i=e.querySelector("#anyma-character"),u=e.querySelector(".pointer-scripture");for(let o=0;o<72;o+=1){const n=document.createElement("span");n.className="twinkling-star",n.style.setProperty("--star-left",`${Math.random()*100}%`),n.style.setProperty("--star-top",`${Math.random()*100}%`),n.style.setProperty("--star-size",`${2+Math.random()*7}px`),n.style.setProperty("--star-delay",`${Math.random()*1.8}s`),n.style.setProperty("--star-duration",`${.75+Math.random()*1.5}s`),t.append(n)}for(let o=0;o<32;o+=1){const n=document.createElement("span");n.style.setProperty("--bar-delay",`${Math.random()*.8}s`),n.style.setProperty("--bar-speed",`${.38+Math.random()*.5}s`),n.style.setProperty("--bar-height",`${24+Math.random()*76}%`),l.append(n)}let f=0,b=0,X=0,$=0,Y=0,L=0,A=0,T=0,s=0,g=0,E=0,S=0,v=0,w=0,p=0,k=0,F=0,C=0;const I=["빛은 우리를 선택하지 않았다","모든 심장은 하나의 BPM으로 뛴다","회전하는 빛을 따라가라","의심은 입구에 두고 오라","영원은 세 번째 박자에서 시작된다","출구는 처음부터 존재하지 않았다"],O=(o,n)=>{const r=performance.now(),P=Math.hypot(o-w,n-p);if(r-v<145||P<28)return;const m=o-w,c=n-p,y=Math.hypot(m,c)||1,d=document.createElement("span"),h=105+Math.random()*65,M=-m/y*h,x=-c/y*h-28,N=Math.atan2(c,m)*(180/Math.PI);d.className="pointer-scripture__fragment",d.textContent=I[k%I.length],d.style.left=`${o}px`,d.style.top=`${n}px`,d.style.setProperty("--scripture-x",`${M.toFixed(2)}px`),d.style.setProperty("--scripture-y",`${x.toFixed(2)}px`),d.style.setProperty("--scripture-angle",`${N.toFixed(2)}deg`),d.style.setProperty("--scripture-size",`${22+Math.random()*12}px`),u.append(d),d.addEventListener("animationend",()=>d.remove(),{once:!0}),k+=1,v=r,w=o,p=n},_=()=>{const o=i.getBoundingClientRect(),r=window.matchMedia("(orientation: portrait)").matches?{width:1024,height:1536,leftEyeX:474,rightEyeX:552,eyeY:411,eyeSize:24,faceX:512,faceY:412,faceMaskX:122,faceMaskY:166,stickX:820,stickY:865}:{width:1672,height:941,leftEyeX:807,rightEyeX:865,eyeY:208,eyeSize:24,faceX:836,faceY:208,faceMaskX:92,faceMaskY:120,stickX:1300,stickY:590},P=r.width,m=r.height,c=Math.max(o.width/P,o.height/m),y=(o.width-P*c)/2,d=(o.height-m*c)/2,h=(M,x)=>{i.style.setProperty(M,`${x.toFixed(2)}px`)};h("--left-eye-x",y+r.leftEyeX*c),h("--right-eye-x",y+r.rightEyeX*c),h("--eye-center-y",d+r.eyeY*c),h("--eye-size",Math.max(19,r.eyeSize*c)),h("--face-center-x",y+r.faceX*c),h("--face-center-y",d+r.faceY*c),h("--face-mask-x",r.faceMaskX*c),h("--face-mask-y",r.faceMaskY*c),E=y+r.stickX*c,S=d+r.stickY*c,h("--stick-anchor-x",E),h("--stick-anchor-y",S)},z=(o,n)=>{const r=i.getBoundingClientRect(),P=o-(r.left+r.width/2),m=n-(r.top+r.height/2),c=Math.hypot(P,m)||1,y=Math.min(c/Math.max(window.innerWidth,window.innerHeight)*2.2,1),d=P/c,h=m/c;f=d*y*7,b=h*y*5.5,X=d*y*10.5,$=h*y*8;const M=o-(r.left+E),x=n-(r.top+S);s=Math.max(-58,Math.min(58,M/window.innerWidth*105+x/window.innerHeight*12)),e.style.setProperty("--stick-hue",`${Math.round(o/window.innerWidth*110-35)}deg`),O(o,n)},q=o=>{Y+=(f-Y)*.13,L+=(b-L)*.13,A+=(X-A)*.18,T+=($-T)*.18,g+=(s-g)*.11,i.style.setProperty("--face-x",`${Y.toFixed(2)}px`),i.style.setProperty("--face-y",`${L.toFixed(2)}px`),i.style.setProperty("--eye-x",`${A.toFixed(2)}px`),i.style.setProperty("--eye-y",`${T.toFixed(2)}px`),i.style.setProperty("--face-turn",`${(Y*.16).toFixed(2)}deg`),i.style.setProperty("--stick-angle",`${(g+Math.sin(o*.0045)*2.8).toFixed(2)}deg`),requestAnimationFrame(q)};window.addEventListener("pointermove",o=>z(o.clientX,o.clientY)),window.addEventListener("resize",_),document.documentElement.addEventListener("pointerleave",()=>{f=0,b=0,X=0,$=0,s=0}),window.addEventListener("pointerdown",o=>{!o.isPrimary||o.button!==0||(z(o.clientX,o.clientY),i.classList.remove("is-winking"),i.offsetWidth,i.classList.add("is-winking"),window.clearTimeout(F),F=window.setTimeout(()=>i.classList.remove("is-winking"),680),e.classList.remove("beat-hit"),e.offsetWidth,e.classList.add("beat-hit"),window.clearTimeout(C),C=window.setTimeout(()=>e.classList.remove("beat-hit"),240))}),document.body.append(e),se(a),_(),requestAnimationFrame(q)}ie();const ne=45,oe=7,Z=58,re=280,ae=96,j=["♪","♫","♬","♩"],R=new Map;let U=0,J=0,K=0;function Q(e,t,l){const a=document.createElement("div");return a.className="pointer-note",a.setAttribute("aria-hidden","true"),a.textContent=j[Math.floor(Math.random()*j.length)],a.style.left=`${e}px`,a.style.top=`${t}px`,a.style.setProperty("--note-size",`${l}px`),document.body.append(a),a}function W(e){const t=R.get(e);if(!t)return;cancelAnimationFrame(t.frameId),R.delete(e);const l=Math.round(Math.random()*80-40);t.element.classList.remove("pointer-note--growing"),t.element.classList.add("pointer-note--released"),t.element.style.setProperty("--note-drift",`${l}px`),t.element.style.setProperty("--note-drift-mid",`${Math.round(l*.35)}px`),t.element.addEventListener("animationend",()=>t.element.remove(),{once:!0})}window.addEventListener("pointermove",e=>{if(e.pointerType==="touch")return;const t=performance.now(),l=Math.hypot(e.clientX-J,e.clientY-K);if(t-U<ne||l<oe)return;U=t,J=e.clientX,K=e.clientY;const a=Q(e.clientX,e.clientY,38+Math.random()*20);a.classList.add("pointer-note--trail"),a.style.setProperty("--note-drift",`${Math.round(Math.random()*36-18)}px`),a.addEventListener("animationend",()=>a.remove(),{once:!0})});window.addEventListener("pointerdown",e=>{if(!e.isPrimary||e.button!==0)return;W(e.pointerId);const t=Q(e.clientX,e.clientY,Z);t.classList.add("pointer-note--growing");const l={element:t,frameId:0,startedAt:performance.now()},a=i=>{const u=(i-l.startedAt)/1e3,f=Math.min(Z+u*ae,re);t.style.setProperty("--note-size",`${f}px`),l.frameId=requestAnimationFrame(a)};R.set(e.pointerId,l),l.frameId=requestAnimationFrame(a)});window.addEventListener("pointerup",e=>W(e.pointerId));window.addEventListener("pointercancel",e=>W(e.pointerId));window.addEventListener("blur",()=>{for(const e of R.keys())W(e)});
