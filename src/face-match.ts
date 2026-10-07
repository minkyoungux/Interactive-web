import './face-match.css'
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { HeadGestureDetector, facePose, type FaceMatrix, type FacePoint, type Gesture } from './face-match-core'

type Profile = { kind: 'dog'; name: string; age: number; job: string; distance: string; bio: string; tags: string[]; photo: string }
type Trap = { kind: 'trap'; name: string; age: number; job: string; distance: string; bio: string; tags: string[]; photo: string; revealName: string; revealCopy: string; crop: string }
type Card = Profile | Trap
type Phase = 'idle' | 'loading' | 'calibrating' | 'live' | 'error'

const PROFILES: Profile[] = [
  { kind: 'dog', name: '보리', age: 4, job: '골든 리트리버 · 성수', distance: '2 km', bio: '꽃 냄새와 사람을 정말 좋아해요.\n느긋하게 오래 산책할 친구를 찾아요.', tags: ['꽃시장', '공놀이', '순둥이'], photo: `${import.meta.env.BASE_URL}assets/nodd-dogs/golden.jpg` },
  { kind: 'dog', name: '몽글', age: 2, job: '토이 푸들 · 연남', distance: '3 km', bio: '카페 의자에 얌전히 앉아 있기 만렙.\n작지만 호기심은 아주 커요.', tags: ['카페', '애교', '간식'], photo: `${import.meta.env.BASE_URL}assets/nodd-dogs/poodle.jpg` },
  { kind: 'dog', name: '후추', age: 5, job: '닥스훈트 · 서울숲', distance: '1 km', bio: '짧은 다리로 누구보다 빠르게 달려요.\n풀밭 냄새 맡기가 제일 좋아요.', tags: ['공원', '탐험', '달리기'], photo: `${import.meta.env.BASE_URL}assets/nodd-dogs/dachshund.jpg` },
  { kind: 'dog', name: '설이', age: 3, job: '사모예드 · 잠실', distance: '5 km', bio: '웃는 얼굴과 폭신한 털이 매력이에요.\n호숫가 산책이라면 매일도 좋아요.', tags: ['호수', '미소', '겨울'], photo: `${import.meta.env.BASE_URL}assets/nodd-dogs/samoyed.jpg` },
  { kind: 'dog', name: '마루', age: 4, job: '시바 이누 · 서촌', distance: '4 km', bio: '처음엔 조금 도도하지만 금방 친해져요.\n조용한 골목 산책을 좋아합니다.', tags: ['골목', '독립적', '낮잠'], photo: `${import.meta.env.BASE_URL}assets/nodd-dogs/shiba.jpg` },
  { kind: 'dog', name: '코코', age: 3, job: '웰시 코기 · 망원', distance: '2 km', bio: '정원만 보면 신나서 엉덩이가 바빠져요.\n친구에게 먼저 다가가는 편이에요.', tags: ['정원', '사교왕', '터그'], photo: `${import.meta.env.BASE_URL}assets/nodd-dogs/corgi.jpg` },
  { kind: 'dog', name: '두부', age: 2, job: '카바푸 · 합정', distance: '3 km', bio: '책방 구석과 포근한 무릎을 좋아해요.\n조용한 오후를 함께 보내요.', tags: ['책방', '포근함', '껌딱지'], photo: `${import.meta.env.BASE_URL}assets/nodd-dogs/cavapoo.jpg` },
  { kind: 'dog', name: '밤이', age: 5, job: '래브라도 · 송정', distance: '7 km', bio: '바다만 보면 바로 뛰어드는 물개 강아지.\n모래사장 달리기 친구를 찾아요.', tags: ['바다', '수영', '에너지'], photo: `${import.meta.env.BASE_URL}assets/nodd-dogs/labrador.jpg` },
  { kind: 'dog', name: '소금', age: 6, job: '슈나우저 · 한남', distance: '4 km', bio: '그림 구경할 때 꽤 진지한 편이에요.\n수염 칭찬은 언제나 환영입니다.', tags: ['미술', '수염', '차분함'], photo: `${import.meta.env.BASE_URL}assets/nodd-dogs/schnauzer.jpg` },
  { kind: 'dog', name: '루키', age: 3, job: '비글 · 북한산', distance: '8 km', bio: '숲길의 모든 냄새를 확인해야 직성이 풀려요.\n주말 등산 메이트를 기다려요.', tags: ['숲', '등산', '호기심'], photo: `${import.meta.env.BASE_URL}assets/nodd-dogs/beagle.jpg` },
]

const TRAPS: Trap[] = [
  { kind: 'trap', name: '몽실', age: 3, job: '웰시 코기 · 망원', distance: '2 km', bio: '포근한 낮잠과 따뜻한 햇살을 좋아해요.\n가까이 와서 인사해볼래요?', tags: ['포근함', '빵실함', '낮잠'], photo: `${import.meta.env.BASE_URL}assets/nodd-traps/corgi-loaf.jpg`, revealName: '식빵', revealCopy: '버터를 바를 뻔했어요.', crop: '50% 66%' },
  { kind: 'trap', name: '구름', age: 2, job: '화이트 푸들 · 서촌', distance: '1 km', bio: '복슬복슬한 털이 매력 포인트예요.\n집 안 구석구석 산책을 좋아해요.', tags: ['복슬이', '깔끔이', '실내파'], photo: `${import.meta.env.BASE_URL}assets/nodd-traps/poodle-mop.jpg`, revealName: '대걸레', revealCopy: '산책 대신 바닥 청소 어때요?', crop: '50% 57%' },
  { kind: 'trap', name: '보송', age: 1, job: '비숑 프리제 · 연희', distance: '4 km', bio: '동그랗고 하얀 얼굴을 자랑해요.\n바느질 옆에서 얌전히 기다릴게요.', tags: ['솜사탕', '동글이', '포근함'], photo: `${import.meta.env.BASE_URL}assets/nodd-traps/bichon-cotton.jpg`, revealName: '솜뭉치', revealCopy: '단추 눈에 완전히 속았네요.', crop: '50% 47%' },
]

const FEED: Card[] = [PROFILES[0], PROFILES[1], PROFILES[2], TRAPS[0], PROFILES[3], PROFILES[4], PROFILES[5], PROFILES[6], TRAPS[1], PROFILES[7], PROFILES[8], TRAPS[2], PROFILES[9]]

const icon = (name: 'spark' | 'camera' | 'x' | 'heart' | 'undo' | 'user' | 'chat') => ({
  spark: '<path d="M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z"/><path d="m19 17 .7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7L19 17Z"/>',
  camera: '<rect x="3" y="6" width="18" height="14" rx="4"/><path d="m8 6 1.4-2h5.2L16 6"/><circle cx="12" cy="13" r="3.2"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>', heart: '<path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z"/>',
  undo: '<path d="M9 7H4v-5M4.6 7.4A8 8 0 1 1 5 17"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>', chat: '<path d="M21 13a7 7 0 0 1-7 7H6l-4 2 1.4-4A8 8 0 1 1 21 13Z"/>',
})[name]
const svg = (name: Parameters<typeof icon>[0]) => `<svg viewBox="0 0 24 24" aria-hidden="true">${icon(name)}</svg>`

document.body.classList.add('nodd-page')
document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="nodd-shell">
    <header class="nodd-header">
      <a class="nodd-logo" href="${import.meta.env.BASE_URL}#face-match" aria-label="NODD 홈"><span>${svg('spark')}</span><b>nodd</b></a>
      <div class="nodd-mode"><span>FACE MODE</span><i></i><strong>OFF</strong></div>
      <button class="nodd-camera-button" type="button">${svg('camera')}<span>얼굴 모드 켜기</span></button>
    </header>
    <section class="nodd-content">
      <aside class="nodd-rail" aria-label="주요 메뉴">
        <button class="is-active" type="button" aria-label="프로필 탐색">${svg('spark')}<span>DISCOVER</span></button>
        <button type="button" aria-label="매칭 목록">${svg('heart')}<span>MATCHES</span><i class="match-count">0</i></button>
        <button type="button" aria-label="메시지">${svg('chat')}<span>MESSAGES</span></button>
        <button type="button" aria-label="내 프로필">${svg('user')}<span>PROFILE</span></button>
      </aside>
      <section class="nodd-stage" aria-label="프로필 카드">
        <div class="nodd-stage-copy"><div class="stage-eyebrow"><span>오늘의 인연</span><strong>GOOD NOSE <b>0</b></strong></div><h1>말없이도,<br><em>마음은 움직이니까.</em></h1></div>
        <div class="nodd-deck-wrap">
          <div class="nodd-card-stack"></div>
          <div class="gesture-stamp is-pass">PASS</div><div class="gesture-stamp is-like">NODD!</div>
        </div>
        <div class="nodd-actions">
          <button class="action-undo" type="button" aria-label="이전 프로필">${svg('undo')}</button>
          <button class="action-pass" type="button" aria-label="패스">${svg('x')}</button>
          <div class="nodd-hint"><b>고개를 좌우로</b><span>PASS</span></div>
          <button class="action-like" type="button" aria-label="매칭">${svg('heart')}</button>
          <div class="nodd-hint"><b>고개를 끄덕</b><span>LIKE</span></div>
        </div>
      </section>
      <aside class="nodd-face-panel">
        <div class="face-panel-head"><span>FACE TRACKING</span><i>LOCAL ONLY</i></div>
        <div class="face-preview"><video playsinline muted></video><canvas></canvas><div class="face-placeholder">${svg('camera')}<b>카메라가 꺼져 있어요</b><span>얼굴 모드를 켜주세요</span></div><span class="face-scan"></span></div>
        <div class="face-status" role="status" aria-live="polite"><i></i><div><b>READY WHEN YOU ARE</b><span>버튼으로도 둘러볼 수 있어요.</span></div></div>
        <div class="face-guide"><p><span>01</span><b>TURN</b><small>왼쪽 또는 오른쪽으로<br>고개를 돌리면 패스</small></p><p><span>02</span><b>NOD</b><small>아래로 끄덕였다 돌아오면<br>좋아요 &amp; 매칭</small></p></div>
        <p class="face-privacy">영상은 저장되거나 전송되지 않으며<br>이 기기 안에서만 처리됩니다.</p>
      </aside>
    </section>
    <footer class="nodd-footer"><span>NOD TO CONNECT · TURN TO MOVE ON</span><span>DEMO PROFILES · 2026</span></footer>
  </main>
  <div class="match-modal" role="dialog" aria-modal="true" aria-labelledby="match-title" hidden>
    <div class="match-burst" aria-hidden="true"></div><div class="match-dialog"><button class="match-close" type="button" aria-label="닫기">×</button><span class="match-kicker">IT'S A MATCH</span><h2 id="match-title">서로 마음이<br><em>통했어요!</em></h2><div class="match-faces"><div class="match-me">ME</div><div class="match-them"></div><i>${svg('heart')}</i></div><div class="trap-photo" aria-hidden="true"></div><p><b class="match-name">보리</b><span class="match-copy">도 함께 산책하고 싶대요.</span></p><button class="match-message" type="button">인사 보내기</button><button class="match-continue" type="button">계속 둘러보기</button></div>
  </div>
  <div class="nose-toast" role="status" aria-live="polite"><b>GOOD NOSE!</b><span>함정을 알아봤어요.</span></div>`

const stack = document.querySelector<HTMLElement>('.nodd-card-stack')!
const cameraButton = document.querySelector<HTMLButtonElement>('.nodd-camera-button')!
const mode = document.querySelector<HTMLElement>('.nodd-mode')!, video = document.querySelector<HTMLVideoElement>('.face-preview video')!
const preview = document.querySelector<HTMLCanvasElement>('.face-preview canvas')!, previewCtx = preview.getContext('2d')!
const faceStatus = document.querySelector<HTMLElement>('.face-status')!, modal = document.querySelector<HTMLElement>('.match-modal')!
const detector = new HeadGestureDetector(), inferenceCanvas = document.createElement('canvas'), inferenceCtx = inferenceCanvas.getContext('2d')!
const lifetime = new AbortController(), on = { signal: lifetime.signal }
let phase: Phase = 'idle', stream: MediaStream | null = null, model: FaceLandmarker | null = null, frame = 0
let lastVideoTime = -1, lastInferenceAt = -Infinity, faceSeenAt = -Infinity, generation = 0, disposed = false
let profileIndex = 0, matched = 0, goodNose = 0, busy = false, pointerId: number | null = null, dragStartX = 0, dragX = 0, toastTimer = 0

function profileAt(offset = 0) { return FEED[(profileIndex + offset) % FEED.length] }
function cardMarkup(profile: Card, depth: number) {
  const trapStyle = profile.kind === 'trap' ? `;--trap-focus:${profile.crop}` : ''
  return `<article class="profile-card${profile.kind === 'trap' ? ' is-trap' : ''}" data-depth="${depth}" data-kind="${profile.kind}" style="--photo:url('${profile.photo}')${trapStyle}">
    <div class="profile-photo" role="img" aria-label="${profile.name}의 프로필 사진"></div><div class="photo-shade"></div>
    <div class="profile-distance"><i></i>${profile.distance} away</div>
    <div class="profile-info"><div class="profile-name"><h2>${profile.name}</h2><strong>${profile.age}</strong><i title="인증된 가상 프로필">✓</i></div><p>${profile.job}</p><div class="profile-tags">${profile.tags.map(tag => `<span>${tag}</span>`).join('')}</div><blockquote>${profile.bio.replace('\n', '<br>')}</blockquote></div>
    ${profile.kind === 'trap' ? `<div class="trap-card-reveal"><span>WAIT—</span><strong>NOT A DOG</strong><small>${profile.revealName}</small></div>` : ''}
  </article>`
}
function renderCards() {
  stack.innerHTML = [2, 1, 0].map(depth => cardMarkup(profileAt(depth), depth)).join('')
  bindTopCard()
}
function topCard() { return stack.querySelector<HTMLElement>('[data-depth="0"]') }
function bindTopCard() {
  const card = topCard(); if (!card) return
  card.addEventListener('pointerdown', event => { if (busy) return; pointerId = event.pointerId; dragStartX = event.clientX; dragX = 0; card.setPointerCapture(event.pointerId); card.classList.add('is-dragging') }, on)
  card.addEventListener('pointermove', event => { if (pointerId !== event.pointerId) return; dragX = event.clientX - dragStartX; card.style.setProperty('--drag-x', `${dragX}px`); card.style.setProperty('--drag-r', `${dragX / 24}deg`); updateStamp(dragX) }, on)
  const finish = (event: PointerEvent) => { if (pointerId !== event.pointerId) return; pointerId = null; card.classList.remove('is-dragging'); if (Math.abs(dragX) > Math.min(105, card.clientWidth * .27)) act(dragX < 0 ? 'pass-left' : 'pass-right'); else { card.style.setProperty('--drag-x', '0px'); card.style.setProperty('--drag-r', '0deg'); updateStamp(0) } }
  card.addEventListener('pointerup', finish, on); card.addEventListener('pointercancel', finish, on)
}
function updateStamp(value: number, kind?: 'like') {
  const pass = document.querySelector<HTMLElement>('.gesture-stamp.is-pass')!, like = document.querySelector<HTMLElement>('.gesture-stamp.is-like')!
  pass.style.opacity = String(kind ? 0 : Math.min(1, Math.abs(value) / 95)); pass.style.transform = `rotate(-10deg) scale(${.82 + Math.min(1, Math.abs(value) / 95) * .18})`
  like.style.opacity = String(kind ? 1 : 0)
}
function updateGoodNose() {
  const badge = document.querySelector<HTMLElement>('.stage-eyebrow strong')!
  badge.querySelector('b')!.textContent = String(goodNose); badge.classList.toggle('has-score', goodNose > 0)
}
function showNoseToast(trap: Trap) {
  const toast = document.querySelector<HTMLElement>('.nose-toast')!
  toast.querySelector('b')!.textContent = `GOOD NOSE ×${goodNose}`; toast.querySelector('span')!.textContent = `${trap.revealName}을 알아봤어요!`
  toast.classList.remove('show'); void toast.offsetWidth; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('show'), 1800)
}
function act(gesture: Exclude<Gesture, null>) {
  if (busy || !modal.hidden) return
  const card = topCard(); if (!card) return
  busy = true
  if (gesture === 'match') {
    updateStamp(0, 'like'); card.classList.add('is-match')
    const profile = profileAt()
    if (profile.kind === 'trap') {
      goodNose = 0; updateGoodNose()
      window.setTimeout(() => { card.classList.add('is-trap-revealed'); updateStamp(0) }, 280)
      window.setTimeout(() => { showTrap(profile); busy = false }, 1050)
    } else window.setTimeout(() => { updateStamp(0); showMatch(profile); busy = false }, 430)
    return
  }
  const direction = gesture === 'pass-left' ? -1 : 1
  const profile = profileAt()
  if (profile.kind === 'trap') {
    goodNose++; updateGoodNose(); showNoseToast(profile)
    const pass = document.querySelector<HTMLElement>('.gesture-stamp.is-pass')!; pass.textContent = 'GOOD NOSE'; pass.classList.add('is-correct')
  }
  updateStamp(direction * 120); card.style.setProperty('--exit', String(direction)); card.classList.add('is-passing')
  window.setTimeout(() => { profileIndex = (profileIndex + 1) % FEED.length; renderCards(); const pass = document.querySelector<HTMLElement>('.gesture-stamp.is-pass')!; pass.textContent = 'PASS'; pass.classList.remove('is-correct'); updateStamp(0); busy = false }, 430)
}
function showMatch(profile: Profile) {
  matched++; document.querySelector<HTMLElement>('.match-count')!.textContent = String(matched)
  modal.classList.remove('is-trap')
  document.querySelector<HTMLElement>('.match-kicker')!.textContent = "IT'S A MATCH"
  document.querySelector<HTMLElement>('#match-title')!.innerHTML = '서로 마음이<br><em>통했어요!</em>'
  document.querySelector<HTMLElement>('.match-name')!.textContent = profile.name
  document.querySelector<HTMLElement>('.match-copy')!.textContent = '도 함께 산책하고 싶대요.'
  document.querySelector<HTMLElement>('.match-them')!.style.setProperty('--photo', `url('${profile.photo}')`)
  document.querySelector<HTMLButtonElement>('.match-message')!.textContent = '인사 보내기'
  modal.hidden = false; requestAnimationFrame(() => modal.classList.add('show'))
}
function showTrap(trap: Trap) {
  modal.classList.add('is-trap')
  document.querySelector<HTMLElement>('.match-kicker')!.textContent = 'CAUGHT YOU NODDING'
  document.querySelector<HTMLElement>('#match-title')!.innerHTML = '강아지가<br><em>아니었어요!</em>'
  document.querySelector<HTMLElement>('.match-name')!.textContent = trap.revealName
  document.querySelector<HTMLElement>('.match-copy')!.textContent = `과 매칭됐어요. ${trap.revealCopy}`
  document.querySelector<HTMLElement>('.trap-photo')!.style.setProperty('--photo', `url('${trap.photo}')`)
  document.querySelector<HTMLButtonElement>('.match-message')!.textContent = '다시 집중하기'
  modal.hidden = false; requestAnimationFrame(() => modal.classList.add('show'))
}
function closeMatch() {
  modal.classList.remove('show'); window.setTimeout(() => { modal.hidden = true; modal.classList.remove('is-trap'); profileIndex = (profileIndex + 1) % FEED.length; renderCards() }, 220)
}
function setPhase(next: Phase, detail?: string) {
  phase = next; mode.dataset.phase = next; mode.querySelector('strong')!.textContent = next === 'live' ? 'ON' : next === 'calibrating' ? 'SYNC' : next === 'loading' ? '···' : 'OFF'
  const copy = {
    idle: ['READY WHEN YOU ARE', '얼굴 모드를 켜거나 버튼을 사용하세요.'], loading: ['OPENING CAMERA', '얼굴 인식 모델을 준비하고 있어요.'], calibrating: ['HOLD STILL', '정면을 보고 잠시만 기다려주세요.'], live: ['FACE CONNECTED', '고개를 돌리거나 끄덕여보세요.'], error: ['CAMERA UNAVAILABLE', detail ?? '버튼으로 계속 둘러볼 수 있어요.'],
  }[next]
  faceStatus.querySelector('b')!.textContent = copy[0]; faceStatus.querySelector('span')!.textContent = copy[1]
  cameraButton.querySelector('span')!.textContent = ['idle', 'error'].includes(next) ? '얼굴 모드 켜기' : next === 'loading' ? '연결 중…' : '얼굴 모드 끄기'
  cameraButton.disabled = next === 'loading'; document.body.dataset.face = next
}
function drawPreview(points: FacePoint[]) {
  const rect = preview.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2)
  preview.width = Math.max(1, Math.round(rect.width * dpr)); preview.height = Math.max(1, Math.round(rect.height * dpr))
  previewCtx.setTransform(dpr, 0, 0, dpr, 0, 0); previewCtx.clearRect(0, 0, rect.width, rect.height)
  const x = (index: number) => (1 - points[index].x) * rect.width, y = (index: number) => points[index].y * rect.height
  const oval = [10, 338, 284, 389, 454, 397, 379, 152, 176, 172, 234, 162]
  previewCtx.strokeStyle = 'rgba(255,255,255,.82)'; previewCtx.lineWidth = 1.4; previewCtx.beginPath()
  oval.forEach((index, order) => order ? previewCtx.lineTo(x(index), y(index)) : previewCtx.moveTo(x(index), y(index))); previewCtx.closePath(); previewCtx.stroke()
  previewCtx.fillStyle = '#ff4458'; [1, 33, 263].forEach(index => { previewCtx.beginPath(); previewCtx.arc(x(index), y(index), 2.6, 0, Math.PI * 2); previewCtx.fill() })
}
function updateGestureUI() {
  const yawAmount = Math.min(1, Math.abs(detector.yaw) * 6)
  const status = detector.status === 'turning' ? ['TURN DETECTED', '그대로 잠깐 유지하면 패스해요.'] : detector.status === 'nodding' ? ['NOD DETECTED', '정면으로 돌아오면 매칭해요.'] : detector.status === 'recenter' ? ['BACK TO CENTER', '다음 동작을 위해 정면을 봐주세요.'] : ['FACE CONNECTED', '좌우로 돌리면 패스 · 끄덕이면 매칭']
  faceStatus.querySelector('b')!.textContent = status[0]; faceStatus.querySelector('span')!.textContent = status[1]
  document.documentElement.style.setProperty('--face-turn', String(yawAmount))
}
function processFace(points: FacePoint[], matrix: FaceMatrix | undefined, now: number) {
  faceSeenAt = now; drawPreview(points)
  const pose = facePose(points, matrix), gesture = detector.update(pose.yaw, pose.pitch, now)
  if (phase === 'calibrating' && detector.ready) setPhase('live')
  if (phase === 'calibrating') faceStatus.querySelector('span')!.textContent = `정면 기준을 맞추는 중 · ${Math.round(detector.progress * 100)}%`
  if (phase === 'live') updateGestureUI()
  if (gesture) act(gesture)
}
function infer(now: number) {
  if (!model || video.readyState < 2 || video.currentTime === lastVideoTime || now - lastInferenceAt < 32) return
  lastVideoTime = video.currentTime; lastInferenceAt = now
  const width = navigator.hardwareConcurrency <= 4 ? 480 : 640, height = Math.max(1, Math.round(width * video.videoHeight / video.videoWidth))
  if (inferenceCanvas.width !== width || inferenceCanvas.height !== height) { inferenceCanvas.width = width; inferenceCanvas.height = height }
  inferenceCtx.drawImage(video, 0, 0, width, height)
  const result = model.detectForVideo(inferenceCanvas, now), points = result.faceLandmarks[0] as FacePoint[] | undefined
  if (points) processFace(points, result.facialTransformationMatrixes?.[0] as FaceMatrix | undefined, now)
  else if (now - faceSeenAt > 300) { previewCtx.clearRect(0, 0, preview.width, preview.height); faceStatus.querySelector('b')!.textContent = 'LOOK AT THE CAMERA'; faceStatus.querySelector('span')!.textContent = '얼굴이 화면 안에 보이게 해주세요.' }
}
function loop(now: number) { frame = 0; if (disposed || ['idle', 'error'].includes(phase)) return; try { infer(now); frame = requestAnimationFrame(loop) } catch (cause) { console.error('NODD face tracking failed', cause); stopSession(); setPhase('error', '얼굴 인식 중 문제가 생겼어요.') } }
async function createModel(token: number) {
  const vision = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}mediapipe`)
  for (const delegate of ['GPU', 'CPU'] as const) {
    let candidate: FaceLandmarker | null = null
    try { candidate = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/face_landmarker.task`, delegate }, runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true, minFaceDetectionConfidence: .5, minFacePresenceConfidence: .5, minTrackingConfidence: .5 }); if (disposed || token !== generation) { candidate.close(); return }; model = candidate; return }
    catch (cause) { candidate?.close(); if (delegate === 'CPU') throw cause }
  }
}
async function begin() {
  if (disposed || !['idle', 'error'].includes(phase)) return
  const token = ++generation; setPhase('loading'); let step: 'camera' | 'model' = 'camera'
  try {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('secure')
    const camera = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } })
    if (disposed || token !== generation) { camera.getTracks().forEach(track => track.stop()); return }
    stream = camera; video.srcObject = camera; await video.play(); if (disposed || token !== generation) return
    step = 'model'; await createModel(token); if (disposed || token !== generation || !model) return
    detector.reset(); setPhase('calibrating'); frame = requestAnimationFrame(loop)
  } catch (cause) {
    if (disposed || token !== generation) return
    stopSession(); const denied = cause instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(cause.name)
    setPhase('error', cause instanceof Error && cause.message === 'secure' ? 'localhost 또는 HTTPS에서 카메라를 사용할 수 있어요.' : denied ? '카메라 권한을 허용해주세요.' : step === 'model' ? '얼굴 모델을 열지 못했어요.' : '카메라를 열지 못했어요.')
  }
}
function stopSession() { generation++; cancelAnimationFrame(frame); frame = 0; stream?.getTracks().forEach(track => track.stop()); stream = null; video.pause(); video.srcObject = null; model?.close(); model = null; detector.reset(); lastVideoTime = -1; previewCtx.clearRect(0, 0, preview.width, preview.height); setPhase('idle') }

cameraButton.addEventListener('click', () => { if (['idle', 'error'].includes(phase)) void begin(); else stopSession() }, on)
document.querySelector<HTMLButtonElement>('.action-pass')!.addEventListener('click', () => act('pass-left'), on)
document.querySelector<HTMLButtonElement>('.action-like')!.addEventListener('click', () => act('match'), on)
document.querySelector<HTMLButtonElement>('.action-undo')!.addEventListener('click', () => { if (busy || !modal.hidden) return; profileIndex = (profileIndex - 1 + FEED.length) % FEED.length; renderCards() }, on)
document.querySelectorAll<HTMLButtonElement>('.match-close,.match-continue').forEach(button => button.addEventListener('click', closeMatch, on))
document.querySelector<HTMLButtonElement>('.match-message')!.addEventListener('click', closeMatch, on)
window.addEventListener('keydown', event => { if (!modal.hidden && event.key === 'Escape') closeMatch(); else if (event.key === 'ArrowLeft') act('pass-left'); else if (event.key === 'ArrowRight') act('pass-right'); else if (event.key === 'Enter') act('match') }, on)
function dispose() { if (disposed) return; disposed = true; lifetime.abort(); clearTimeout(toastTimer); stopSession(); inferenceCanvas.width = inferenceCanvas.height = 1 }
window.addEventListener('interactive:dispose', dispose, on); window.addEventListener('pagehide', dispose, on); if (import.meta.hot) import.meta.hot.dispose(dispose)
renderCards(); updateGoodNose(); setPhase('idle')
