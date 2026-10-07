export class Filaments {
  constructor(count = 360, segments = 48) {
    this.count=count;this.segments=segments;
    this.positions=new Float32Array(count*segments*3);
    this.home=new Float32Array(count*segments*2);
    this.offset=new Float32Array(count*segments*2);
    this.velocity=new Float32Array(count*segments*2);
    this.previous=new Float32Array(count*segments*2);
    this.seeds=new Float32Array(count);
    this.reset();
  }
  random(i){return (Math.sin(i*127.1+311.7)*43758.5453)%1+.5;}
  reset(){this.offset.fill(0);this.velocity.fill(0);this.step(0,0,[],false);}
  step(dt,time,touches,held){
    const frames=Math.min(dt*60,1.5), n=this.segments;
    this.previous.set(this.offset);
    for(let f=0;f<this.count;f++){
      const seed=Math.abs(Math.sin(f*127.1));this.seeds[f]=seed;
      const fan=Math.floor(f/30), within=(f%30)/29-.5;
      const base=fan*Math.PI*2/12+within*.20+Math.sin(fan*2.4)*.13;
      const extent=.62+Math.sin(fan*3.7)*.15+seed*.06;
      for(let s=0;s<n;s++){
        const t=s/(n-1), index=f*n+s, k=index*2;
        const r=t*extent;
        const curve=Math.sin(t*3.5+fan*2.1+time*.17)*t*.23;
        const micro=Math.sin(t*12+time*(.45+seed*.4)+f*.37)*t*.006;
        const angle=base+curve+micro;
        const hx=Math.cos(angle)*r,hy=Math.sin(angle)*r;
        this.home[k]=hx;this.home[k+1]=hy;
        let ox=this.offset[k],oy=this.offset[k+1],vx=this.velocity[k],vy=this.velocity[k+1];
        const spring=.0028+seed*.002;
        vx-=ox*spring*frames;vy-=oy*spring*frames;
        if(s>0&&s<n-1){
          // Elastic coupling transmits a local bend along the strand.
          vx+=(this.previous[k-2]+this.previous[k+2]-2*ox)*.085*frames;
          vy+=(this.previous[k-1]+this.previous[k+3]-2*oy)*.085*frames;
        }
        for(const touch of touches){
          const dx=hx+ox-touch.x,dy=hy+oy-touch.y;
          const dist=Math.hypot(dx,dy),radius=.30;
          const force=Math.exp(-dist*dist/(radius*radius*.42));
          const speed=Math.min(.06,Math.hypot(touch.vx,touch.vy));
          // Gentle entrainment follows a moving hand; a still hand barely disturbs light.
          const mobility=.65+seed*.35;
          const follow=touch.down ? .105 : .065;
          vx+=(touch.vx*follow-dy*speed*.025)*force*mobility*frames;
          vy+=(touch.vy*follow+dx*speed*.025)*force*mobility*frames;
          if(touch.down){
            vx-=dx*.00065*force*t*frames;
            vy-=dy*.00065*force*t*frames;
          }
        }
        if(held){vx-=hx*.00018*t*frames;vy-=hy*.00018*t*frames;}
        const damping=Math.pow(.95+seed*.014,frames);
        vx=Math.max(-.010,Math.min(.010,vx*damping));vy=Math.max(-.010,Math.min(.010,vy*damping));
        ox+=vx*frames;oy+=vy*frames;
        if(s===0){ox=oy=vx=vy=0;}
        this.offset[k]=ox;this.offset[k+1]=oy;this.velocity[k]=vx;this.velocity[k+1]=vy;
        this.positions[index*3]=hx+ox;this.positions[index*3+1]=hy+oy;this.positions[index*3+2]=0;
      }
    }
  }
}
