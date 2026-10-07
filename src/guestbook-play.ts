import './guestbook-play.css'

export const stamps = ['잘 버텼다', '퇴근 기원', '나도 그래…']
export function splitStamp(message: string) {
  const match = message.match(/\n\n\[우표: (잘 버텼다|퇴근 기원|나도 그래…)\]$/)
  return { text: match ? message.slice(0, match.index) : message, stamp: match?.[1] }
}

export function mountPlay() {
  const toolbar = document.createElement('div')
  toolbar.className = 'play-tools'
  toolbar.innerHTML = '<button type="button" class="boss-open">▦ 상사 왔다!</button><button type="button" class="draw-open">✎ 낙서하기</button><button type="button" class="stress-open">♲ 스트레스 버리기</button>'
  document.querySelector('.guest-header')!.after(toolbar)
  const dialog = document.createElement('dialog')
  dialog.className = 'boss-sheet'
  dialog.innerHTML = `<div class="sheet-title">업무 현황.xlsx <button type="button">업무 화면 닫기 · ESC</button></div><p>파일　홈　삽입　수식　데이터　검토</p><div class="sheet-formula">fx　= SUM(열정, 커피, 퇴근욕구)</div><table><caption>주간 업무 현황 보고서 (가상 화면)</caption><thead><tr><th></th><th>A</th><th>B</th><th>C</th></tr></thead><tbody>${['항목|진행률|비고','열정|3%|충전 필요','퇴근 욕구|200%|초과 달성','커피|4잔|정상 가동','회의|진행 중|영혼 접속 대기','월급|대기 중|입금 즉시 로그아웃',...Array(12).fill(' | | ')].map((r,i)=>`<tr><th>${i+1}</th>${r.split('|').map(v=>`<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`
  document.body.append(dialog)
  toolbar.querySelector('.boss-open')!.addEventListener('click', () => dialog.showModal())
  dialog.querySelector('button')!.onclick = () => dialog.close()

  const draw = document.createElement('div')
  draw.className = 'doodle-overlay'; draw.hidden = true
  draw.innerHTML = `<canvas aria-label="마우스나 손가락으로 그리는 낙서판"></canvas><div class="doodle-controls"><b>낙서장.exe</b><select aria-label="낙서 도구"><option value="pen">형광펜</option>${['퇴근시켜줘','결재 안 함','월급루팡 인증'].map(s=>`<option>${s}</option>`).join('')}</select><input type="color" value="#e986ce" aria-label="낙서 색상"><button type="button" data-clear>지우기</button><button type="button" data-done>완료 · ESC</button><small>이번 방문에서만 유지돼요 · 확대/화면 크기 변경 시 초기화</small></div>`
  document.body.append(draw)
  const canvas = draw.querySelector('canvas')!, ctx = canvas.getContext('2d')!
  const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight }
  resize(); window.addEventListener('resize', resize)
  let drawing = false
  let returnFocus: HTMLElement | null = null
  const controls = draw.querySelector<HTMLElement>('.doodle-controls')!
  const finish = () => { drawing = false; draw.classList.remove('editing'); controls.hidden = true; returnFocus?.focus() }
  toolbar.querySelector('.draw-open')!.addEventListener('click', () => { returnFocus = document.activeElement as HTMLElement; draw.hidden = false; controls.hidden = false; draw.classList.add('editing'); draw.querySelector<HTMLSelectElement>('select')!.focus() })
  draw.querySelector<HTMLButtonElement>('[data-done]')!.onclick = finish
  draw.querySelector<HTMLButtonElement>('[data-clear]')!.onclick = () => ctx.clearRect(0,0,canvas.width,canvas.height)
  canvas.onpointerdown = e => {
    canvas.setPointerCapture(e.pointerId)
    ctx.strokeStyle = ctx.fillStyle = draw.querySelector<HTMLInputElement>('input')!.value
    const tool = draw.querySelector('select')!.value
    if (tool !== 'pen') {
      ctx.save(); ctx.translate(e.clientX,e.clientY); ctx.rotate(-.13); ctx.lineWidth=2; ctx.font='bold 20px sans-serif'; const w=ctx.measureText(tool).width; ctx.strokeRect(-w/2-10,-24,w+20,36); ctx.fillText(tool,-w/2,0); ctx.restore(); return
    }
    drawing=true;ctx.lineWidth=12;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(e.clientX,e.clientY);ctx.lineTo(e.clientX+.1,e.clientY);ctx.stroke()
  }
  canvas.onpointermove=e=>{if(drawing){ctx.lineTo(e.clientX,e.clientY);ctx.stroke();ctx.beginPath();ctx.moveTo(e.clientX,e.clientY)}}
  canvas.onpointerup=canvas.onpointercancel=()=>{drawing=false}
  document.addEventListener('keydown', e=>{if(e.key==='Escape' && draw.classList.contains('editing')) finish()})

  const stress = document.createElement('dialog')
  stress.className='stress-window'
  stress.innerHTML='<div class="window-title">휴지통.exe <button type="button" data-close>닫기 ×</button></div><p>종이를 끌어 넣거나, 선택 후 휴지통을 눌러줘。</p><div class="stress-papers"></div><button class="stress-bin" type="button" aria-label="선택한 스트레스 버리기">🗑<small>여기에 버리기</small></button><p class="stress-status" role="status">업무 말고… 마음의 짐만 비워요。</p><button type="button" data-reset>새 종이 꺼내기</button>'
  document.body.append(stress)
  toolbar.querySelector('.stress-open')!.addEventListener('click',()=>stress.showModal())
  stress.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>stress.close()
  let selected: HTMLButtonElement | null=null
  const bin=stress.querySelector<HTMLButtonElement>('.stress-bin')!
  const discard=()=>{if(!selected)return;selected.classList.add('crumpled');selected.disabled=true; const old=selected;setTimeout(()=>old.remove(),350);selected=null;stress.querySelector('.stress-status')!.textContent='업무는 삭제되지 않았지만… 마음은 조금 가벼워졌다。'}
  const reset=()=>{
    selected=null
    const papers=stress.querySelector('.stress-papers')!;papers.replaceChildren()
    for(const label of ['회의','야근','월요일']) {
      const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed','false');papers.append(b)
      let origin = { x: 0, y: 0 }
      b.onclick=()=>{papers.querySelectorAll('button').forEach(p=>p.setAttribute('aria-pressed',String(p===b)));selected=b}
      b.onpointerdown=e=>{origin={x:e.clientX,y:e.clientY};b.click();b.setPointerCapture(e.pointerId)}
      b.onpointermove=e=>{if(b.hasPointerCapture(e.pointerId))b.style.transform=`translate(${e.clientX-origin.x}px, ${e.clientY-origin.y}px)`}
      b.onpointerup=e=>{b.style.transform='';const r=bin.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)discard()}
      b.onpointercancel=()=>{b.style.transform=''}
    }
    stress.querySelector('.stress-status')!.textContent='업무 말고… 마음의 짐만 비워요。'
  }
  reset();bin.onclick=discard;stress.querySelector<HTMLButtonElement>('[data-reset]')!.onclick=reset
}

export function mountStamp() {
  const box=document.createElement('fieldset');box.className='postage-picker'
  box.innerHTML=`<legend>마지막에 우표 꾹…♡</legend><select aria-label="방명록 우표"><option value="">우표 없음</option>${stamps.map(s=>`<option>${s}</option>`).join('')}</select><button type="button" class="stamp-press">여기에 찍기</button><small>우표는 글과 함께 공개 저장돼요.</small>`
  document.querySelector('.submit-button')!.before(box)
  let chosen=''
  const select=box.querySelector('select')!, press=box.querySelector<HTMLButtonElement>('button')!
  select.onchange=()=>{chosen='';press.textContent='여기에 찍기';press.classList.remove('stamped');box.dispatchEvent(new Event('input',{bubbles:true}))}
  press.onclick=()=>{chosen=select.value;press.textContent=chosen||'우표 없음';press.classList.toggle('stamped',!!chosen);box.dispatchEvent(new Event('input',{bubbles:true}))}
  return { suffix:()=>chosen?`\n\n[우표: ${chosen}]`:'', reset:()=>{chosen='';select.value='';press.textContent='여기에 찍기';press.classList.remove('stamped')} }
}
