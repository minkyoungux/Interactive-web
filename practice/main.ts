type PlaceId = 'greenhouse' | 'monk' | 'moktak' | 'pond' | 'vista'

interface PlaceInfo {
  id: PlaceId
  name: string
  x: number
  y: number
  enterRadius: number
}

interface RoomStation {
  id: string
  label: string
  x: number
  y: number
}

const places: PlaceInfo[] = [
  { id: 'greenhouse', name: '숨의 온실', x: 325, y: 540, enterRadius: 225 },
  { id: 'monk', name: '무문암', x: 960, y: 470, enterRadius: 235 },
  { id: 'moktak', name: '울림 마루', x: 1570, y: 585, enterRadius: 225 },
  { id: 'pond', name: '비움 연못', x: 385, y: 930, enterRadius: 260 },
  { id: 'vista', name: '바람 전망대', x: 1365, y: 970, enterRadius: 245 },
]

const world = document.querySelector<HTMLElement>('#world')!
const viewport = document.querySelector<HTMLElement>('#worldViewport')!
const player = document.querySelector<HTMLElement>('#player')!
const mapPlayer = document.querySelector<HTMLElement>('#mapPlayer')!
const prompt = document.querySelector<HTMLElement>('#interactionPrompt')!
const promptPlace = document.querySelector<HTMLElement>('#promptPlace')!
const locationName = document.querySelector<HTMLElement>('#locationName')!
const welcome = document.querySelector<HTMLElement>('#welcomeCard')!
const scene = document.querySelector<HTMLElement>('#scene')!
const sceneContent = document.querySelector<HTMLElement>('#sceneContent')!

const state = {
  x: 960,
  y: 930,
  started: false,
  currentPlace: null as PlaceInfo | null,
  scene: null as PlaceId | 'help' | null,
  sound: true,
  taps: 0,
  breaths: 0,
  selectedSeed: 'lotus',
  pots: [0, 0, 0, 0, 0, 0],
  roomX: 50,
  roomY: 86,
  roomStation: null as RoomStation | null,
}

const roomStations: Record<PlaceId, RoomStation[]> = {
  greenhouse: [
    { id: 'pot-0', label: '첫 번째 화분 돌보기', x: 38, y: 37 },
    { id: 'pot-1', label: '두 번째 화분 돌보기', x: 62, y: 37 },
    { id: 'pot-2', label: '세 번째 화분 돌보기', x: 34, y: 53 },
    { id: 'pot-3', label: '네 번째 화분 돌보기', x: 66, y: 53 },
    { id: 'pot-4', label: '다섯 번째 화분 돌보기', x: 39, y: 68 },
    { id: 'pot-5', label: '여섯 번째 화분 돌보기', x: 61, y: 68 },
    { id: 'exit', label: '고요의 들판으로 나가기', x: 50, y: 91 },
  ],
  monk: [
    { id: 'monk', label: 'AI 스님과 마주 앉기', x: 50, y: 38 },
    { id: 'exit', label: '고요의 들판으로 나가기', x: 50, y: 91 },
  ],
  moktak: [
    { id: 'moktak', label: '목탁의 울림 듣기', x: 50, y: 31 },
    { id: 'exit', label: '고요의 들판으로 나가기', x: 50, y: 91 },
  ],
  pond: [
    { id: 'pond', label: '생각 하나 흘려보내기', x: 53, y: 52 },
    { id: 'dock', label: '물고기 바라보기', x: 35, y: 50 },
    { id: 'exit', label: '고요의 들판으로 나가기', x: 50, y: 92 },
  ],
  vista: [
    { id: 'breathe', label: '매트 위에서 숨 고르기', x: 50, y: 35 },
    { id: 'bell', label: '바람 종 울리기', x: 25, y: 28 },
    { id: 'exit', label: '고요의 들판으로 나가기', x: 50, y: 92 },
  ],
}

const keys = new Set<string>()
let lastTime = performance.now()
let breathTimer = 0
let audioContext: AudioContext | null = null
const petalCooldown = new WeakSet<HTMLElement>()

function cameraPosition() {
  const scale = Math.max(.7, Math.min(1, viewport.clientWidth / 1250))
  const targetX = viewport.clientWidth / 2 - state.x * scale
  const targetY = viewport.clientHeight / 2 - state.y * scale
  const minX = viewport.clientWidth - 1920 * scale
  const minY = viewport.clientHeight - 1080 * scale
  const x = Math.min(0, Math.max(minX, targetX))
  const y = Math.min(0, Math.max(minY, targetY))
  world.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
}

function updatePlayer() {
  player.style.setProperty('--px', `${state.x}px`)
  player.style.setProperty('--py', `${state.y}px`)
  mapPlayer.style.left = `${(state.x / 1920) * 100}%`
  mapPlayer.style.top = `${(state.y / 1080) * 100}%`
  cameraPosition()

  let closest: PlaceInfo | null = null
  let distance = Infinity
  for (const place of places) {
    const d = Math.hypot(place.x - state.x, place.y - state.y)
    if (d < distance) { closest = place; distance = d }
  }
  const near = closest && distance < closest.enterRadius ? closest : null
  if (near?.id !== state.currentPlace?.id) {
    document.querySelectorAll('.place').forEach((node) => node.classList.remove('near'))
    if (near) document.querySelector(`[data-place="${near.id}"]`)?.classList.add('near')
  }
  state.currentPlace = near
  prompt.classList.toggle('visible', Boolean(near) && state.started && !state.scene)
  if (near) {
    promptPlace.textContent = near.name
    locationName.textContent = `${near.name} 앞`
  } else {
    locationName.textContent = '고요의 들판'
  }
}

function tick(now: number) {
  const delta = Math.min(32, now - lastTime) / 1000
  lastTime = now
  if (state.started && !state.scene) {
    const left = keys.has('arrowleft') || keys.has('a')
    const right = keys.has('arrowright') || keys.has('d')
    const up = keys.has('arrowup') || keys.has('w')
    const down = keys.has('arrowdown') || keys.has('s')
    let dx = Number(right) - Number(left)
    let dy = Number(down) - Number(up)
    if (dx || dy) {
      const length = Math.hypot(dx, dy)
      dx /= length; dy /= length
      state.x = Math.max(80, Math.min(1840, state.x + dx * 245 * delta))
      state.y = Math.max(150, Math.min(1030, state.y + dy * 245 * delta))
      player.classList.add('walking')
      setPlayerDirection(player, dx, dy)
      updatePlayer()
    } else {
      player.classList.remove('walking')
    }
  } else if (state.scene && state.scene !== 'help' && !document.querySelector('.room-dialogue.open')) {
    moveInsideRoom(delta)
  }
  requestAnimationFrame(tick)
}

function getDirection() {
  const left = keys.has('arrowleft') || keys.has('a')
  const right = keys.has('arrowright') || keys.has('d')
  const up = keys.has('arrowup') || keys.has('w')
  const down = keys.has('arrowdown') || keys.has('s')
  return { dx: Number(right) - Number(left), dy: Number(down) - Number(up) }
}

function setPlayerDirection(character: HTMLElement, dx: number, dy: number) {
  let direction = 'front'
  if (Math.abs(dx) > Math.abs(dy)) direction = dx < 0 ? 'left' : 'right'
  else if (dy < 0) direction = 'back'
  character.classList.remove('dir-front','dir-back','dir-left','dir-right','face-left')
  character.classList.add(`dir-${direction}`)
}

function moveInsideRoom(delta: number) {
  const { dx: rawX, dy: rawY } = getDirection()
  let dx = rawX
  let dy = rawY
  const roomPlayer = document.querySelector<HTMLElement>('#roomPlayer')
  if (!roomPlayer) return
  if (dx || dy) {
    const length = Math.hypot(dx, dy)
    dx /= length; dy /= length
    state.roomX = Math.max(12, Math.min(88, state.roomX + dx * 30 * delta))
    state.roomY = Math.max(34, Math.min(89, state.roomY + dy * 30 * delta))
    roomPlayer.classList.add('walking')
    setPlayerDirection(roomPlayer, dx, dy)
    updateRoomPlayer()
  } else {
    roomPlayer.classList.remove('walking')
  }
}

function updateRoomPlayer() {
  const roomPlayer = document.querySelector<HTMLElement>('#roomPlayer')
  const roomPrompt = document.querySelector<HTMLElement>('#roomPrompt')
  if (!roomPlayer || !roomPrompt || !state.scene || state.scene === 'help') return
  roomPlayer.style.left = `${state.roomX}%`
  roomPlayer.style.top = `${state.roomY}%`
  const stations = roomStations[state.scene]
  let nearest: RoomStation | null = null
  let distance = Infinity
  for (const station of stations) {
    const d = Math.hypot(station.x - state.roomX, station.y - state.roomY)
    if (d < distance) { nearest = station; distance = d }
  }
  state.roomStation = distance < 14 ? nearest : null
  roomPrompt.classList.toggle('visible', Boolean(state.roomStation))
  const label = roomPrompt.querySelector<HTMLElement>('span')
  if (label) label.textContent = state.roomStation?.label || ''
  document.querySelectorAll<HTMLElement>('.room-object').forEach((object) => {
    object.classList.toggle('near', object.dataset.station === state.roomStation?.id)
  })
}

function startWalk() {
  state.started = true
  welcome.classList.add('hidden')
  viewport.focus()
  updatePlayer()
}

function openScene(id: PlaceId | 'help') {
  const template = document.querySelector<HTMLTemplateElement>(`#${id}Template`)
  if (!template) return
  state.scene = id
  scene.dataset.place = id
  if (id === 'help') {
    sceneContent.replaceChildren(template.content.cloneNode(true))
  } else {
    createRoom(id)
  }
  scene.classList.add('open')
  scene.setAttribute('aria-hidden', 'false')
  document.body.classList.add('scene-open')
  locationName.textContent = id === 'help' ? '노는 법' : places.find((place) => place.id === id)?.name || '마음절'
  if (id === 'help') window.setTimeout(() => document.querySelector<HTMLElement>('.scene-close')?.focus(), 50)
}

function closeScene() {
  if (breathTimer) window.clearTimeout(breathTimer)
  breathTimer = 0
  sceneContent.classList.remove('room-breathing')
  state.scene = null
  state.roomStation = null
  delete scene.dataset.place
  scene.classList.remove('open')
  scene.setAttribute('aria-hidden', 'true')
  document.body.classList.remove('scene-open')
  viewport.focus()
}

function createRoom(id: PlaceId) {
  state.roomX = 50
  state.roomY = 86
  const roomName = places.find((place) => place.id === id)?.name || ''
  const stations = roomStations[id]
  sceneContent.innerHTML = `
    ${createRoomAmbience(id)}
    <div class="room-title"><small>MAEUMJEOL / ${id.toUpperCase()}</small><b>${roomName}</b></div>
    <div class="room-guide">WASD / 방향키로 걷기　·　E 상호작용　·　ESC 나가기</div>
    <div class="room-objects">
      ${stations.map((station) => `<button class="room-object ${station.id.startsWith('pot') ? `plant-stage-${state.pots[Number(station.id.slice(4))]}` : ''}" data-station="${station.id}" style="--sx:${station.x}%;--sy:${station.y}%" aria-label="${station.label}" type="button"><i></i></button>`).join('')}
    </div>
    ${id === 'monk' ? '<div class="pixel-monk" aria-hidden="true"><i></i><b></b></div>' : ''}
    <div class="player room-player dir-back" id="roomPlayer" aria-label="실내를 걷는 여행자"><span class="player-shadow"></span><span class="body"></span><span class="head"></span><span class="satchel"></span></div>
    <div class="room-prompt" id="roomPrompt"><kbd>E</kbd><span></span></div>
    <div class="room-feedback" id="roomFeedback" aria-live="polite"></div>
    <div class="room-effects" id="roomEffects"></div>
    <div class="room-touch" aria-label="실내 이동 패드"><button data-room-move="up">↑</button><button data-room-move="left">←</button><button data-room-move="down">↓</button><button data-room-move="right">→</button></div>
  `
  sceneContent.querySelectorAll<HTMLButtonElement>('.room-object').forEach((object) => {
    object.addEventListener('click', () => interactRoom(object.dataset.station || ''))
  })
  sceneContent.querySelectorAll<HTMLButtonElement>('[data-room-move]').forEach((button) => {
    const map: Record<string,string> = { up:'arrowup',down:'arrowdown',left:'arrowleft',right:'arrowright' }
    const key = map[button.dataset.roomMove || '']
    const start = (event: Event) => { event.preventDefault(); keys.add(key) }
    const stop = () => keys.delete(key)
    button.addEventListener('pointerdown', start); button.addEventListener('pointerup', stop); button.addEventListener('pointerleave', stop)
  })
  sceneContent.addEventListener('pointermove', updateRoomWind)
  sceneContent.addEventListener('pointerleave', () => resetEnvironment(sceneContent))
  if (id === 'pond') {
    sceneContent.addEventListener('pointerdown', (event) => {
      if ((event.target as HTMLElement).closest('button')) return
      const rect = sceneContent.getBoundingClientRect()
      const x = ((event.clientX - rect.left) / rect.width) * 100
      const y = ((event.clientY - rect.top) / rect.height) * 100
      addRoomEffect('pixel-water-ring', x, y)
      scareFish(x, y)
      playDrop()
    })
  }
  updateRoomPlayer()
}

function createRoomAmbience(id: PlaceId) {
  if (id === 'greenhouse') return `
    <div class="ambient-layer room-ambience greenhouse-ambience" aria-hidden="true">
      <i class="glass-glint gg1"></i><i class="glass-glint gg2"></i>
      <i class="plant-sway gp1"></i><i class="plant-sway gp2"></i><i class="plant-sway gp3"></i><i class="plant-sway gp4"></i>
      <i class="pixel-bug bug1"></i><i class="pixel-bug bug2"></i>
      <i class="hanging-herb hh1"></i><i class="hanging-herb hh2"></i><i class="butterfly gb1"></i><i class="butterfly gb2"></i>
    </div>`
  if (id === 'monk') return `
    <div class="ambient-layer room-ambience temple-ambience" aria-hidden="true">
      <i class="lantern-flicker tl1"></i><i class="lantern-flicker tl2"></i><i class="lantern-flicker tl3"></i><i class="lantern-flicker tl4"></i>
      <i class="candle-flame"></i><i class="incense-smoke is1"></i><i class="incense-smoke is2"></i>
      <i class="dust-mote d1"></i><i class="dust-mote d2"></i><i class="dust-mote d3"></i><i class="dust-mote d4"></i>
      <i class="wind-chime-interactive temple-chime"></i>
    </div>`
  if (id === 'moktak') return `
    <div class="ambient-layer room-ambience moktak-ambience" aria-hidden="true">
      <i class="chime-sway ch1"></i><i class="chime-sway ch2"></i><i class="chime-sway ch3"></i>
      <i class="bamboo-sway bs1"></i><i class="bamboo-sway bs2"></i>
      <i class="wind-streak ws1"></i><i class="wind-streak ws2"></i><i class="wind-streak ws3"></i>
      <i class="floating-leaf rl1"></i><i class="floating-leaf rl2"></i>
    </div>`
  if (id === 'pond') return `
    <div class="ambient-layer room-ambience pond-ambience" aria-hidden="true">
      <i class="pond-shimmer room-water"></i>
      <i class="pixel-fish rf1"></i><i class="pixel-fish rf2"></i><i class="pixel-fish rf3"></i><i class="pixel-fish rf4"></i><i class="pixel-fish rf5"></i><i class="pixel-fish rf6"></i><i class="pixel-fish rf7"></i><i class="pixel-fish rf8"></i><i class="pixel-fish rf9"></i><i class="pixel-fish rf10"></i>
      <i class="grass-sway pg1"></i><i class="grass-sway pg2"></i><i class="grass-sway pg3"></i><i class="grass-sway pg4"></i><i class="grass-sway pg5"></i><i class="grass-sway pg6"></i>
      <i class="reed-sway pr1"></i><i class="reed-sway pr2"></i><i class="reed-sway pr3"></i><i class="reed-sway pr4"></i><i class="reed-sway pr5"></i>
      <i class="dragonfly df1"></i><i class="dragonfly df2"></i><i class="dragonfly df3"></i><i class="dragonfly df4"></i><i class="pixel-frog pf1"></i><i class="pixel-frog pf2"></i>
    </div>`
  return `
    <div class="ambient-layer room-ambience vista-ambience" aria-hidden="true">
      <i class="mist-band vm1"></i><i class="mist-band vm2"></i><i class="mist-band vm3"></i>
      <i class="pine-branch pb1"></i><i class="pine-branch pb2"></i>
      <i class="bell-swing"></i><i class="wind-chime-interactive vista-chime"></i><i class="cherry-tree vista-cherry"></i><i class="floating-leaf vl1"></i><i class="floating-leaf vl2"></i><i class="floating-leaf vl3"></i>
      <i class="wind-streak vw1"></i><i class="wind-streak vw2"></i>
    </div>`
}

function updateRoomWind(event: PointerEvent) {
  const rect = sceneContent.getBoundingClientRect()
  const wind = ((event.clientX - rect.left) / rect.width - .5) * 10
  sceneContent.style.setProperty('--wind', `${wind}deg`)
  sceneContent.style.setProperty('--pointer-x', `${event.clientX - rect.left}px`)
  sceneContent.style.setProperty('--pointer-y', `${event.clientY - rect.top}px`)
  reactEnvironment(event, sceneContent)
}

function reactEnvironment(event: PointerEvent, root: HTMLElement) {
  const flora = root.querySelectorAll<HTMLElement>('.grass-sway, .plant-sway, .bamboo-sway, .pine-branch, .reed-sway, .hanging-herb')
  flora.forEach((plant) => {
    const rect = plant.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const dx = centerX - event.clientX
    const dy = centerY - event.clientY
    const distance = Math.hypot(dx, dy)
    if (distance < 105) {
      const direction = dx < 0 ? -1 : 1
      const strength = 1 - distance / 105
      plant.style.rotate = `${direction * (6 + strength * 38)}deg`
      plant.style.scale = `1 ${Math.max(.72, 1 - strength * .24)}`
      plant.classList.add('bent')
    } else {
      plant.style.rotate = '0deg'
      plant.style.scale = '1'
      plant.classList.remove('bent')
    }
  })

  root.querySelectorAll<HTMLElement>('.pixel-fish, .butterfly, .pixel-bug, .dragonfly, .pixel-frog').forEach((creature) => {
    const rect = creature.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const dx = centerX - event.clientX
    const dy = centerY - event.clientY
    const distance = Math.hypot(dx, dy)
    const radius = creature.classList.contains('pixel-fish') ? 125 : creature.classList.contains('pixel-frog') ? 115 : 90
    if (distance < radius) {
      const safeDistance = Math.max(distance, 1)
      const strength = 1 - distance / radius
      const power = (creature.classList.contains('pixel-fish') ? 48 : creature.classList.contains('pixel-frog') ? 75 : 62) * strength
      creature.style.translate = `${(dx / safeDistance) * power}px ${(dy / safeDistance) * power}px`
      creature.classList.add('fleeing')
    } else {
      creature.style.translate = '0 0'
      creature.classList.remove('fleeing')
    }
  })

  root.querySelectorAll<HTMLElement>('.wind-chime-interactive, .bell-swing').forEach((chime) => {
    const rect = chime.getBoundingClientRect()
    const distance = Math.hypot(rect.left + rect.width / 2 - event.clientX, rect.top + rect.height / 2 - event.clientY)
    chime.classList.toggle('ringing', distance < 105)
  })

  root.querySelectorAll<HTMLElement>('.cherry-tree').forEach((tree) => {
    const rect = tree.getBoundingClientRect()
    const distance = Math.hypot(rect.left + rect.width / 2 - event.clientX, rect.top + rect.height / 2 - event.clientY)
    tree.classList.toggle('shaking', distance < 145)
    if (distance < 105) burstPetals(root, tree)
  })

  root.querySelectorAll<HTMLElement>('.lantern-flicker, .firefly').forEach((light) => {
    const rect = light.getBoundingClientRect()
    const distance = Math.hypot(rect.left + rect.width / 2 - event.clientX, rect.top + rect.height / 2 - event.clientY)
    light.classList.toggle('glowing', distance < 90)
  })

  root.querySelectorAll<HTMLElement>('.pixel-monk').forEach((monk) => {
    const rect = monk.getBoundingClientRect()
    const distance = Math.hypot(rect.left + rect.width / 2 - event.clientX, rect.top + rect.height / 2 - event.clientY)
    monk.classList.toggle('greeting', distance < 145)
  })
}

function burstPetals(root: HTMLElement, tree: HTMLElement) {
  if (petalCooldown.has(tree)) return
  petalCooldown.add(tree)
  const layer = tree.closest<HTMLElement>('.ambient-layer') || root.querySelector<HTMLElement>('.ambient-layer')
  if (!layer) return
  const layerRect = layer.getBoundingClientRect()
  const treeRect = tree.getBoundingClientRect()
  const originX = ((treeRect.left + treeRect.width * .55 - layerRect.left) / layerRect.width) * 100
  const originY = ((treeRect.top + treeRect.height * .4 - layerRect.top) / layerRect.height) * 100
  for (let index = 0; index < 18; index += 1) {
    const petal = document.createElement('i')
    petal.className = 'cherry-petal'
    petal.style.left = `${originX + (Math.random() - .5) * 8}%`
    petal.style.top = `${originY + (Math.random() - .5) * 7}%`
    petal.style.setProperty('--petal-x', `${40 + Math.random() * 130}px`)
    petal.style.setProperty('--petal-y', `${45 + Math.random() * 110}px`)
    petal.style.setProperty('--petal-delay', `${Math.random() * .35}s`)
    petal.style.setProperty('--petal-turn', `${180 + Math.random() * 540}deg`)
    layer.append(petal)
    window.setTimeout(() => petal.remove(), 2500)
  }
  window.setTimeout(() => petalCooldown.delete(tree), 1100)
}

function resetEnvironment(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('.bent').forEach((item) => { item.style.rotate = '0deg'; item.style.scale = '1'; item.classList.remove('bent') })
  root.querySelectorAll<HTMLElement>('.fleeing').forEach((item) => { item.style.translate = '0 0'; item.classList.remove('fleeing') })
  root.querySelectorAll<HTMLElement>('.ringing, .shaking, .glowing, .greeting').forEach((item) => item.classList.remove('ringing','shaking','glowing','greeting'))
}

function scareFish(x: number, y: number) {
  document.querySelectorAll<HTMLElement>('.pond-ambience .pixel-fish').forEach((fish, index) => {
    const direction = Number(fish.className.match(/\d/)?.[0] || index) % 2 ? -1 : 1
    fish.style.translate = `${direction * (14 + index * 3)}px ${y > 50 ? -16 : 16}px`
    fish.classList.add('startled')
    window.setTimeout(() => { fish.style.translate = '0 0'; fish.classList.remove('startled') }, 520)
  })
  sceneContent.style.setProperty('--last-ripple-x', `${x}%`)
}

function showRoomFeedback(message: string) {
  const feedback = document.querySelector<HTMLElement>('#roomFeedback')
  if (!feedback) return
  feedback.textContent = message
  feedback.classList.remove('show')
  void feedback.offsetWidth
  feedback.classList.add('show')
}

function addRoomEffect(className: string, x: number, y: number) {
  const layer = document.querySelector<HTMLElement>('#roomEffects')
  if (!layer) return
  const effect = document.createElement('i')
  effect.className = className
  effect.style.left = `${x}%`; effect.style.top = `${y}%`
  layer.append(effect)
  window.setTimeout(() => effect.remove(), 1500)
}

function interactRoom(stationId = state.roomStation?.id || '') {
  if (!state.scene || state.scene === 'help' || !stationId) return
  if (stationId === 'exit') { closeScene(); return }
  if (state.scene === 'greenhouse' && stationId.startsWith('pot-')) {
    const index = Number(stationId.slice(4))
    if (state.pots[index] < 3) state.pots[index] += 1
    const object = document.querySelector<HTMLElement>(`[data-station="${stationId}"]`)
    if (object) object.className = `room-object plant-stage-${state.pots[index]} near`
    addRoomEffect('pixel-sparkle', roomStations.greenhouse[index].x, roomStations.greenhouse[index].y - 5)
    showRoomFeedback(state.pots[index] === 3 ? '꽃이 피었어요. 서두르지 않아도 자라는 것이 있네요.' : '물을 한 모금 건넸어요.')
    playDrop()
  }
  if (state.scene === 'monk' && stationId === 'monk') openMonkDialogue()
  if (state.scene === 'moktak' && stationId === 'moktak') hitRoomMoktak()
  if (state.scene === 'pond') {
    addRoomEffect('pixel-water-ring', 53, 53)
    showRoomFeedback(stationId === 'dock' ? '물고기는 서두르지 않고도 잘 흘러갑니다.' : '생각 하나가 물결이 되어 멀어집니다.')
    playDrop()
  }
  if (state.scene === 'vista' && stationId === 'breathe') beginRoomBreath()
  if (state.scene === 'vista' && stationId === 'bell') {
    addRoomEffect('pixel-sparkle', 25, 25)
    showRoomFeedback('바람이 종을 한 번 지나갑니다.')
    playDrop()
  }
}

function hitRoomMoktak() {
  state.taps += 1
  addRoomEffect('pixel-sound-ring', 50, 31)
  const lines = ['한 번의 소리에 한 번의 생각을 놓아요','소리는 머물지 않아서 아름다워요','지금 여기, 이 울림이면 충분해요','비운 만큼 고요가 들어옵니다']
  showRoomFeedback(`${state.taps}번째 울림 · ${lines[state.taps % lines.length]}`)
  playMoktak()
}

function beginRoomBreath() {
  if (breathTimer) return
  sceneContent.classList.add('room-breathing')
  showRoomFeedback('누른 채 천천히 들이쉬어요…')
  breathTimer = window.setTimeout(() => {
    state.breaths += 1
    breathTimer = 0
    sceneContent.classList.remove('room-breathing')
    showRoomFeedback(`${state.breaths}번째 고요한 호흡 · 이제 길게 내쉬어요.`)
  }, 4000)
}

function openMonkDialogue() {
  if (document.querySelector('.room-dialogue')) return
  const template = document.querySelector<HTMLTemplateElement>('#monkTemplate')!
  const dialogue = document.createElement('div')
  dialogue.className = 'room-dialogue open'
  dialogue.append(template.content.cloneNode(true))
  sceneContent.append(dialogue)
  setupMonk()
  window.setTimeout(() => document.querySelector<HTMLInputElement>('#chatInput')?.focus(), 50)
}

function setupGreenhouse() {
  const bed = document.querySelector<HTMLElement>('#plantBed')!
  const renderPots = () => {
    bed.innerHTML = state.pots.map((stage, index) => `
      <button class="pot stage-${stage}" data-pot="${index}" type="button" aria-label="${index + 1}번 화분, 성장 ${stage}단계">
        <span class="sprout"><i></i></span>
      </button>`).join('')
    document.querySelector<HTMLElement>('#gardenCount')!.textContent = `${state.pots.filter((x) => x === 3).length} / 6`
    bed.querySelectorAll<HTMLButtonElement>('.pot').forEach((pot) => {
      pot.addEventListener('click', () => {
        const index = Number(pot.dataset.pot)
        if (state.pots[index] < 3) state.pots[index] += 1
        const drop = document.createElement('span')
        drop.className = 'water-drop'; drop.textContent = state.pots[index] === 1 ? '✦' : '♢'
        pot.append(drop)
        playDrop()
        window.setTimeout(renderPots, 420)
      })
    })
  }
  document.querySelectorAll<HTMLButtonElement>('.seed').forEach((button) => {
    button.classList.toggle('active', button.dataset.seed === state.selectedSeed)
    button.addEventListener('click', () => {
      state.selectedSeed = button.dataset.seed || 'lotus'
      document.querySelectorAll('.seed').forEach((seed) => seed.classList.remove('active'))
      button.classList.add('active')
    })
  })
  renderPots()
}

function getAudioContext() {
  if (!audioContext) audioContext = new AudioContext()
  return audioContext
}

function playMoktak() {
  if (!state.sound) return
  const ctx = getAudioContext()
  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  osc.type = 'triangle'; osc.frequency.setValueAtTime(480, now); osc.frequency.exponentialRampToValueAtTime(185, now + .09)
  filter.type = 'bandpass'; filter.frequency.value = 720; filter.Q.value = 1.2
  gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.38, now + .006); gain.gain.exponentialRampToValueAtTime(.0001, now + .38)
  osc.connect(filter).connect(gain).connect(ctx.destination); osc.start(now); osc.stop(now + .4)
}

function playDrop() {
  if (!state.sound) return
  const ctx = getAudioContext(); const now = ctx.currentTime
  const osc = ctx.createOscillator(); const gain = ctx.createGain()
  osc.type = 'sine'; osc.frequency.setValueAtTime(620, now); osc.frequency.exponentialRampToValueAtTime(900, now + .12)
  gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.09, now + .01); gain.gain.exponentialRampToValueAtTime(.0001, now + .25)
  osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(now + .26)
}

function hitMoktak() {
  const button = document.querySelector<HTMLElement>('#bigMoktak')
  const rings = document.querySelector<HTMLElement>('#soundRings')
  if (!button || !rings) return
  state.taps += 1
  document.querySelector<HTMLElement>('#tapCount')!.textContent = String(state.taps)
  const ring = document.createElement('i'); ring.className = 'sound-ring'; rings.append(ring)
  window.setTimeout(() => ring.remove(), 1200)
  button.classList.add('hit'); window.setTimeout(() => button.classList.remove('hit'), 140)
  const lines = ['한 번의 소리에 한 번의 생각을 놓아요','소리는 머물지 않아서 아름다워요','지금 여기, 이 울림이면 충분해요','비운 만큼 고요가 들어옵니다']
  document.querySelector<HTMLElement>('#mantra')!.textContent = lines[state.taps % lines.length]
  playMoktak()
}

function setupMoktak() {
  document.querySelector('#bigMoktak')?.addEventListener('click', hitMoktak)
  document.querySelector<HTMLElement>('#tapCount')!.textContent = String(state.taps)
}

const monkAnswers = [
  '복잡한 마음을 당장 정리하려 하지 않아도 괜찮아요. 구름이 지나가듯, 생각도 제 길을 찾을 거예요.',
  '잘 쉬는 것은 멈추는 기술이 아니라, 지금의 나를 재촉하지 않는 마음에 더 가까워요.',
  '오늘 여기까지 온 것만으로도 충분히 잘했어요. 숨을 한 번 길게 내쉬어 볼까요?',
  '답을 서둘러 찾지 말고, 그 마음 옆에 조용히 앉아 있어 보세요. 마음은 들여다볼 때 조금씩 느슨해져요.',
]

// Replace this local adapter with the user's API call when the AI prompt is ready.
async function askMonk(message: string): Promise<string> {
  await new Promise((resolve) => window.setTimeout(resolve, 650))
  if (/쉬|피곤|지쳤/.test(message)) return monkAnswers[1]
  if (/위로|힘들|슬퍼|속상/.test(message)) return monkAnswers[2]
  if (/복잡|생각|걱정|불안/.test(message)) return monkAnswers[0]
  return monkAnswers[3]
}

function setupMonk() {
  const form = document.querySelector<HTMLFormElement>('#chatForm')!
  const input = document.querySelector<HTMLInputElement>('#chatInput')!
  const log = document.querySelector<HTMLElement>('#chatLog')!
  const submitMessage = async (message: string) => {
    if (!message.trim()) return
    const userBubble = document.createElement('div'); userBubble.className = 'bubble user-bubble'; userBubble.textContent = message
    log.append(userBubble); input.value = ''; log.scrollTop = log.scrollHeight
    const thinking = document.createElement('div'); thinking.className = 'bubble monk-bubble'; thinking.textContent = '잠시 마음을 바라보는 중…'; log.append(thinking)
    thinking.textContent = await askMonk(message)
    log.scrollTop = log.scrollHeight
  }
  form.addEventListener('submit', (event) => { event.preventDefault(); void submitMessage(input.value) })
  document.querySelectorAll<HTMLButtonElement>('.quick-prompts button').forEach((button) => button.addEventListener('click', () => void submitMessage(button.textContent || '')))
}

function makeWaterRing(x: number, y: number) {
  const pond = document.querySelector<HTMLElement>('#pondScene')
  if (!pond) return
  const ring = document.createElement('i'); ring.className = 'water-ring'; ring.style.left = `${x}px`; ring.style.top = `${y}px`; pond.append(ring)
  window.setTimeout(() => ring.remove(), 1600); playDrop()
}

function setupPond() {
  const pond = document.querySelector<HTMLElement>('#pondScene')!
  const messages = ['오늘도 충분했어요','모든 마음은 지나갑니다','서두르지 않아도 괜찮아요','나는 나의 속도로 갑니다']
  let messageIndex = 0
  pond.addEventListener('pointerdown', (event) => {
    const rect = pond.getBoundingClientRect(); makeWaterRing(event.clientX - rect.left, event.clientY - rect.top)
  })
  document.querySelector('#releaseButton')?.addEventListener('click', () => {
    messageIndex = (messageIndex + 1) % messages.length
    const message = document.querySelector<HTMLElement>('#pondMessage')!; message.style.opacity = '0'
    window.setTimeout(() => { message.textContent = messages[messageIndex]; message.style.opacity = '1'; makeWaterRing(pond.clientWidth / 2, pond.clientHeight / 2) }, 450)
  })
}

function holdBreath() {
  if (state.scene !== 'vista' || breathTimer) return
  const orb = document.querySelector<HTMLElement>('#breathOrb'); if (!orb) return
  orb.classList.add('holding'); document.querySelector<HTMLElement>('#breathText')!.textContent = '천천히 들이쉬어요…'
  breathTimer = window.setTimeout(() => {
    state.breaths += 1; document.querySelector<HTMLElement>('#breathCount')!.textContent = String(state.breaths)
    document.querySelector<HTMLElement>('#breathText')!.textContent = '이제 길게 내쉬어요'
    breathTimer = 0; window.setTimeout(() => releaseBreath(false), 1800)
  }, 4000)
}

function releaseBreath(cancel = true) {
  if (breathTimer && cancel) window.clearTimeout(breathTimer)
  breathTimer = 0
  if (sceneContent.classList.contains('room-breathing')) {
    sceneContent.classList.remove('room-breathing')
    if (cancel) showRoomFeedback('괜찮아요. 준비되면 다시 천천히 시작해요.')
  }
  const orb = document.querySelector<HTMLElement>('#breathOrb'); if (!orb) return
  orb.classList.remove('holding'); const text = document.querySelector<HTMLElement>('#breathText'); if (text) text.textContent = '누르고 숨 쉬기'
}

function setupVista() {
  const orb = document.querySelector<HTMLElement>('#breathOrb')!
  document.querySelector<HTMLElement>('#breathCount')!.textContent = String(state.breaths)
  orb.addEventListener('pointerdown', holdBreath); orb.addEventListener('pointerup', () => releaseBreath()); orb.addEventListener('pointerleave', () => releaseBreath())
}

document.querySelector('#startButton')?.addEventListener('click', startWalk)
document.querySelector('#sceneClose')?.addEventListener('click', closeScene)
document.querySelector('#helpButton')?.addEventListener('click', () => openScene('help'))
document.querySelector('#dayToggle')?.addEventListener('click', () => {
  document.body.classList.toggle('night')
  const button = document.querySelector<HTMLButtonElement>('#dayToggle')!
  button.textContent = document.body.classList.contains('night') ? '☾' : '☼'
})
document.querySelector('#soundToggle')?.addEventListener('click', () => {
  state.sound = !state.sound
  const button = document.querySelector<HTMLButtonElement>('#soundToggle')!
  button.textContent = state.sound ? '♪' : '×'
  button.setAttribute('aria-label', state.sound ? '소리 끄기' : '소리 켜기')
  button.setAttribute('title', state.sound ? '소리 끄기' : '소리 켜기')
})
document.querySelectorAll<HTMLButtonElement>('[data-place]').forEach((button) => button.addEventListener('click', () => openScene(button.dataset.place as PlaceId)))
document.querySelectorAll<HTMLButtonElement>('[data-map-place]').forEach((button) => button.addEventListener('click', () => {
  const place = places.find((item) => item.id === button.dataset.mapPlace); if (!place) return
  state.x = place.x; state.y = place.y + 95; startWalk(); updatePlayer()
}))

function controlKey(event: KeyboardEvent) {
  const byCode: Record<string,string> = {
    KeyW:'w', KeyA:'a', KeyS:'s', KeyD:'d', KeyE:'e',
    ArrowUp:'arrowup', ArrowDown:'arrowdown', ArrowLeft:'arrowleft', ArrowRight:'arrowright',
    Space:' ', Escape:'escape',
  }
  return byCode[event.code] || event.key.toLowerCase()
}

window.addEventListener('keydown', (event) => {
  const key = controlKey(event)
  if (['arrowleft','arrowright','arrowup','arrowdown','w','a','s','d','e','escape',' '].includes(key)) {
    if ((event.target as HTMLElement).tagName !== 'INPUT') event.preventDefault()
  }
  if (key === 'escape' && document.querySelector('.room-dialogue.open')) {
    document.querySelector('.room-dialogue')?.remove()
    viewport.focus()
    return
  }
  if (key === 'escape' && state.scene) closeScene()
  if ((event.target as HTMLElement).tagName === 'INPUT') return
  keys.add(key)
  if (key === 'e' && state.currentPlace && !state.scene) {
    openScene(state.currentPlace.id)
    keys.delete(key)
    return
  }
  if (key === 'e' && state.scene && state.scene !== 'help' && !event.repeat) interactRoom()
  if (key === ' ' && state.scene === 'moktak' && state.roomStation?.id === 'moktak' && !event.repeat) hitRoomMoktak()
  if (key === ' ' && state.scene === 'vista' && state.roomStation?.id === 'breathe' && !event.repeat) beginRoomBreath()
})
window.addEventListener('keyup', (event) => {
  const key = controlKey(event); keys.delete(key)
  if (key === ' ' && state.scene === 'vista') releaseBreath()
})
window.addEventListener('blur', () => { keys.clear(); releaseBreath() })
window.addEventListener('resize', updatePlayer)
scene.querySelector('.scene-backdrop')?.addEventListener('click', closeScene)

document.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((button) => {
  const map: Record<string,string> = { up:'arrowup',down:'arrowdown',left:'arrowleft',right:'arrowright' }
  const key = map[button.dataset.move || '']
  const start = (event: Event) => { event.preventDefault(); startWalk(); keys.add(key) }
  const stop = () => keys.delete(key)
  button.addEventListener('pointerdown', start); button.addEventListener('pointerup', stop); button.addEventListener('pointerleave', stop)
})

viewport.addEventListener('pointermove', (event) => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const nx = event.clientX / viewport.clientWidth - .5
  const ny = event.clientY / viewport.clientHeight - .5
  world.style.setProperty('--wind', `${nx * 10}deg`)
  reactEnvironment(event, world)
  document.querySelectorAll<HTMLElement>('.parallax').forEach((layer) => {
    const depth = Number(layer.dataset.depth || .2)
    layer.style.marginLeft = `${nx * depth * 25}px`; layer.style.marginTop = `${ny * depth * 18}px`
  })
})
viewport.addEventListener('pointerleave', () => resetEnvironment(world))

updatePlayer()
requestAnimationFrame(tick)
