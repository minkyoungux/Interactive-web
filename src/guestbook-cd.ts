import './guestbook-cd.css'

/** Decorates existing selection controls; Spotify remains the only playback control. */
export function mountCDSwap(panel: HTMLElement) {
  const well = panel.querySelector<HTMLElement>('.bgm-disc-well')!
  const deck = panel.querySelector<HTMLElement>('.bgm-deck')!
  const disc = well.querySelector<HTMLElement>('.bgm-disc')!
  const close = panel.querySelector<HTMLButtonElement>('.bgm-close')!
  const tracks = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-song]'))
  const colors = ['#eda7dd', '#a6e7d5', '#afc4ff']
  const lid = document.createElement('div'); lid.className = 'cd-lid'; lid.setAttribute('aria-hidden', 'true'); lid.textContent = '✧ DREAM SOUND ✧'; well.append(lid)
  const hint = document.createElement('p'); hint.className = 'cd-hint'; hint.textContent = 'CD를 여기로 끌어 넣어줘 ♡'
  deck.append(hint)
  const eject = document.createElement('button'); eject.type = 'button'; eject.className = 'cd-eject'; eject.textContent = '⏏ CD 꺼내기'; eject.disabled = true
  deck.append(eject); eject.onclick = () => close.click()
  tracks.forEach((button, i) => {
    const art = document.createElement('span'); art.className = 'cd-sleeve-disc'; art.setAttribute('aria-hidden','true')
    art.innerHTML = `<i>0${i+1}</i><em>♡</em>`
    button.prepend(art); button.style.setProperty('--cd-tint', colors[i]); button.title = '플레이어에 드래그하거나 클릭해서 넣기'
  })
  const ghost = document.createElement('div'); ghost.className = 'cd-drag-ghost'; ghost.hidden = true; ghost.setAttribute('aria-hidden','true'); document.body.append(ghost)
  let drag: { source: HTMLElement; id: number; x: number; y: number; index: number; moved: boolean } | undefined
  let suppressClick = false, suppressTimer: number | undefined, lidTimer: number | undefined
  const resetDrag = () => {
    if (drag?.source.hasPointerCapture(drag.id)) drag.source.releasePointerCapture(drag.id)
    drag = undefined; ghost.hidden = true; panel.classList.remove('cd-dragging','cd-drop-ready')
  }
  const bind = (source: HTMLElement, index: () => number) => {
    source.addEventListener('pointerdown', e => {
      if (e.button !== 0 || drag) return
      const chosen = index(); if (chosen < 0) return
      drag = { source, id:e.pointerId,x:e.clientX,y:e.clientY,index:chosen,moved:false }
      source.setPointerCapture(e.pointerId)
    })
    source.addEventListener('pointermove', e => {
      if (!drag || drag.source !== source || drag.id !== e.pointerId) return
      if (!drag.moved && Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<7) return
      drag.moved=true; ghost.hidden=false; ghost.style.setProperty('--cd-tint',colors[drag.index]); ghost.textContent=`0${drag.index+1}`
      ghost.style.left=`${e.clientX}px`;ghost.style.top=`${e.clientY}px`
      panel.classList.add('cd-dragging')
      const r=well.getBoundingClientRect()
      panel.classList.toggle('cd-drop-ready',e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)
    })
    source.addEventListener('pointerup', e => {
      if(!drag || drag.source!==source || drag.id!==e.pointerId)return
      const {moved,index}=drag
      const r=well.getBoundingClientRect()
      const inside=e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom
      resetDrag()
      if(!moved)return
      if(source===well) { if(!inside)close.click() }
      else if(inside)tracks[index].click()
      suppressClick=true;clearTimeout(suppressTimer);suppressTimer=window.setTimeout(()=>{suppressClick=false},0)
    })
    source.addEventListener('pointercancel',resetDrag)
    source.addEventListener('lostpointercapture',()=>{if(drag?.source===source)resetDrag()})
  }
  panel.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopImmediatePropagation()}},true)
  tracks.forEach((button,i)=>bind(button,()=>i))
  bind(well,()=>tracks.findIndex(b=>b.getAttribute('aria-pressed')==='true'))
  const sync = () => {
    const index=tracks.findIndex(b=>b.getAttribute('aria-pressed')==='true')
    eject.disabled=index<0
    panel.classList.toggle('cd-loaded',index>=0)
    hint.textContent=index<0?'CD를 여기로 끌어 넣어줘 ♡':'꺼낼 땐 CD를 밖으로 드래그 · ⏏'
    clearTimeout(lidTimer)
    panel.classList.remove('cd-inserting')
    if(index>=0) {
      deck.style.setProperty('--cd-tint',colors[index])
      disc.querySelector('.bgm-disc-print')!.textContent=tracks[index].querySelector('b')!.textContent
      void deck.offsetWidth
      panel.classList.add('cd-inserting')
      lidTimer=window.setTimeout(()=>panel.classList.remove('cd-inserting'),750)
    }
  }
  const observer=new MutationObserver(sync)
  tracks.forEach(b=>observer.observe(b,{attributes:true,attributeFilter:['aria-pressed']}))
  sync()
  document.addEventListener('keydown',e=>{if(e.key==='Escape')resetDrag()})
  window.addEventListener('pagehide',()=>{resetDrag();clearTimeout(lidTimer);clearTimeout(suppressTimer);observer.disconnect();ghost.remove()},{once:true})
}
