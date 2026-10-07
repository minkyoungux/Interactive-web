import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
const canvas=document.querySelector('#light');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true});}catch{document.querySelector('#fallback').hidden=false;}
if(renderer)start();
function start(){
  renderer.setClearColor('#030304');renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,20);camera.position.z=5;
  const ribbons=[],touches=new Map(),clock=new THREE.Clock();
  let paused=reduced.matches,time=0,width=1,height=1,compression=0;
  const material=new THREE.ShaderMaterial({
    side:THREE.DoubleSide,transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,
    uniforms:{uTime:{value:0}},
    vertexShader:`varying vec2 vUv;varying float vFold;void main(){vUv=uv;vFold=position.z;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`
      varying vec2 vUv;varying float vFold;uniform float uTime;
      void main(){
        float t=vUv.x,w=vUv.y;
        float fringe=pow(abs(w-.5)*2.0,12.0);
        float cap=exp(-pow((t-.96)*37.0,2.0));
        float crease=exp(-pow((w-(.48+sin(t*4.0)*.08))*35.0,2.0));
        float striation=.72+.28*sin(w*340.0+t*7.0+sin(t*5.0)*3.0);
        float bands=.48+.52*pow(.5+.5*sin(t*15.0+w*3.0+vFold*5.0),4.0);
        float spectral=w*1.15+t*.35+vFold*.65;
        vec3 color=.58+.42*cos(6.28318*(spectral+vec3(.03,.32,.62)));
        color=mix(vec3(.75,.81,.88),color,.42+fringe*.35+cap*.25);
        float alpha=(.10+fringe*.43+crease*.11+cap*.72)*bands*striation;
        alpha*=smoothstep(0.0,.12,t)*(1.0-smoothstep(.975,1.0,t));
        gl_FragColor=vec4(color*1.6,alpha);
      }`,
  });
  const rows=72,columns=38;
  for(let f=0;f<13;f++){
    const vertices=new Float32Array((rows+1)*(columns+1)*3),uvs=new Float32Array((rows+1)*(columns+1)*2),indices=[];
    for(let r=0;r<=rows;r++)for(let c=0;c<=columns;c++){
      const i=r*(columns+1)+c;uvs[i*2]=r/rows;uvs[i*2+1]=c/columns;
      if(r<rows&&c<columns){const a=i,b=i+1,d=i+columns+1,e=d+1;indices.push(a,d,b,b,d,e);}
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));geometry.setIndex(indices);
    const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
    ribbons.push({geometry,vertices,offset:new Float32Array((rows+1)*2),velocity:new Float32Array((rows+1)*2),previous:new Float32Array((rows+1)*2),f});
  }
  const core=new THREE.Mesh(new THREE.PlaneGeometry(.33,.33),new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,vertexShader:'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec2 v;void main(){float r=length(v-.5)*2.0;gl_FragColor=vec4(.9,.95,1.0,exp(-r*r*9.0)*.98+exp(-r*r*2.8)*.2);}'}));scene.add(core);
  const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));composer.addPass(new UnrealBloomPass(new THREE.Vector2(1,1),.8,.65,.32));composer.addPass(new OutputPass());
  function shape(dt){
    const frames=Math.min(dt*60,1.5),active=[...touches.values()];
    compression+=( (active.some(t=>t.down)?.22:0)-compression)*(1-Math.exp(-dt*3));
    for(const ribbon of ribbons){
      const {f,vertices,offset,velocity,previous}=ribbon;previous.set(offset);
      const base=f*Math.PI*2/13+Math.sin(f*2.3)*.12;
      const extent=(.66+Math.sin(f*3.1)*.12+Math.cos(f*1.7)*.08)*(1-compression);
      for(let r=0;r<=rows;r++){
        const t=r/rows,k=r*2;
        const twist=Math.sin(t*3.0+f*1.8+time*.13)*.12*t;
        const angle=base+twist;
        const cx=Math.cos(angle)*extent*t,cy=Math.sin(angle)*extent*t;
        let vx=velocity[k],vy=velocity[k+1];
        vx-=offset[k]*.0035*frames;vy-=offset[k+1]*.0035*frames;
        if(r>0&&r<rows){vx+=(previous[k-2]+previous[k+2]-2*previous[k])*.08*frames;vy+=(previous[k-1]+previous[k+3]-2*previous[k+1])*.08*frames;}
        for(const touch of active){const dx=cx+offset[k]-touch.x,dy=cy+offset[k+1]-touch.y;const force=Math.exp(-(dx*dx+dy*dy)/.035);vx+=touch.vx*.09*force*frames;vy+=touch.vy*.09*force*frames;if(touch.down){vx-=dx*.0006*force*frames;vy-=dy*.0006*force*frames;}}
        vx*=Math.pow(.95,frames);vy*=Math.pow(.95,frames);velocity[k]=vx;velocity[k+1]=vy;
        offset[k]+=vx*frames;offset[k+1]+=vy*frames;if(r===0){offset[k]=offset[k+1]=velocity[k]=velocity[k+1]=0;}
        const fanWidth=Math.pow(t,1.28)*(.09+.025*Math.sin(f*2.2));
        for(let c=0;c<=columns;c++){
          const w=c/columns-.5,index=(r*(columns+1)+c)*3;
          const fold=Math.sin(w*6.5+t*4.0+f*.9+time*.16);
          const side=w*fanWidth*2.0;
          const curl=fold*fanWidth*.28;
          const radial=extent*t+Math.sin(w*5.0+f)*Math.pow(t,7)*.055;
          vertices[index]=Math.cos(angle)*radial-Math.sin(angle)*(side+curl)+offset[k]*t;
          vertices[index+1]=Math.sin(angle)*radial+Math.cos(angle)*(side+curl)+offset[k+1]*t;
          vertices[index+2]=Math.sin(w*5.0+t*3.0+f)*fanWidth*.9+Math.sin(t*5.0+f)*t*.12;
        }
      }
      ribbon.geometry.attributes.position.needsUpdate=true;
    }
    material.uniforms.uTime.value=time;
  }
  function locate(e){const rect=canvas.getBoundingClientRect(),x=((e.clientX-rect.left)/width*2-1)*camera.right,y=(-(e.clientY-rect.top)/height*2+1)*camera.top;let t=touches.get(e.pointerId);if(!t){if(touches.size>=5)return null;t={x,y,targetX:x,targetY:y,vx:0,vy:0,down:false};touches.set(e.pointerId,t);}t.targetX=x;t.targetY=y;return t;}
  canvas.addEventListener('pointermove',locate);canvas.addEventListener('pointerdown',e=>{const t=locate(e);if(t){t.down=true;canvas.setPointerCapture(e.pointerId);}});
  function release(e){const t=touches.get(e.pointerId);if(t)t.down=false;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(e.pointerType!=='mouse')touches.delete(e.pointerId);}
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);canvas.addEventListener('lostpointercapture',e=>touches.delete(e.pointerId));canvas.addEventListener('pointerleave',e=>{if(!canvas.hasPointerCapture(e.pointerId))touches.delete(e.pointerId);});window.addEventListener('blur',()=>touches.clear());
  const key={x:0,y:0,targetX:0,targetY:0,vx:0,vy:0,down:false};
  canvas.addEventListener('keydown',e=>{const m={ArrowLeft:[-.05,0],ArrowRight:[.05,0],ArrowUp:[0,.05],ArrowDown:[0,-.05]}[e.key];if(m){e.preventDefault();key.targetX=THREE.MathUtils.clamp(key.targetX+m[0],-1,1);key.targetY=THREE.MathUtils.clamp(key.targetY+m[1],-1,1);touches.set('key',key);}if(e.code==='Space'){e.preventDefault();key.down=true;touches.set('key',key);}});canvas.addEventListener('keyup',e=>{if(e.code==='Space'){e.preventDefault();key.down=false;}});canvas.addEventListener('blur',()=>touches.delete('key'));
  function setPaused(value){paused=value;touches.clear();document.querySelector('#pause').setAttribute('aria-pressed',String(value));document.querySelector('#pause-icon').textContent=value?'▷':'Ⅱ';document.querySelector('#pause-label').textContent=value?'재생':'일시정지';}
  document.querySelector('#pause').addEventListener('click',()=>setPaused(!paused));reduced.addEventListener('change',()=>setPaused(reduced.matches));
  document.querySelector('#reset').addEventListener('click',()=>{time=compression=0;touches.clear();ribbons.forEach(r=>{r.offset.fill(0);r.velocity.fill(0);});shape(0);composer.render();});
  function resize(){width=canvas.clientWidth;height=canvas.clientHeight;if(!width||!height)return;const aspect=width/height,fit=.96/Math.min(1,aspect);camera.left=-aspect*fit;camera.right=aspect*fit;camera.top=fit;camera.bottom=-fit;camera.updateProjectionMatrix();const ratio=Math.min(devicePixelRatio||1,1.5);renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);composer.setPixelRatio(ratio);composer.setSize(width,height);composer.render();}
  new ResizeObserver(resize).observe(canvas);shape(0);setPaused(paused);resize();
  renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),1/40);if(paused||document.hidden)return;time+=dt;const easing=1-Math.exp(-dt*9);for(const t of touches.values()){const x=t.x,y=t.y;t.x+=(t.targetX-t.x)*easing;t.y+=(t.targetY-t.y)*easing;t.vx=(t.x-x)/Math.max(.25,dt*60);t.vy=(t.y-y)/Math.max(.25,dt*60);}shape(dt);composer.render();});
}
