import * as THREE from 'three'
import { makeToyResident, type ToyStyle } from './season-forest-resident-style'
import { photoSurface, type PhotoSurfaces } from './season-forest-resident-photo'

export type Species = 'rabbit' | 'cat' | 'bear' | 'dog' | 'squirrel' | 'deer' | 'alien'
export type Personality = 'shy' | 'sunny' | 'sleepy' | 'curious' | 'gentle' | 'precise'
export type VillagerDesign = { species: Species; color: string; shirt: string; variant: number; personal: boolean; personality: Personality }
export const personalityNames: Record<Personality, string> = { shy: '수줍음', sunny: '명랑함', sleepy: '느긋함', curious: '호기심', gentle: '다정함', precise: '꼼꼼함' }
const tileSize = 128
function canvas(w = 512, h = 256) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }

/** Geometry is an animal/alien miniature. Only the camera's HumanSeg pixels become photo decals. */
export function makeVillager(design: VillagerDesign, source?: PhotoSurfaces, savedTexture?: HTMLCanvasElement) {
  const atlas = canvas(), ctx = atlas.getContext('2d')!, shape = canvas(), mask = shape.getContext('2d')!
  mask.fillStyle = '#fff'; mask.fillRect(0, 0, 512, 256)
  const sources = [source?.face, source?.torso, source?.arms[0], source?.arms[1], source?.hands[0], source?.hands[1], source?.legs[0], source?.legs[1]]
  for (let i = 0; i < 8; i++) {
    const x = i % 4 * tileSize, y = Math.floor(i / 4) * tileSize
    ctx.fillStyle = i > 0 && i < 4 ? design.shirt : design.color; ctx.fillRect(x, y, tileSize, tileSize)
    if (sources[i]) ctx.drawImage(sources[i]!, x, y, tileSize, tileSize)
  }
  if (!design.personal) {
    ctx.fillStyle = '#fff5db'; ctx.beginPath(); ctx.ellipse(64, 78, 48, 42, 0, 0, Math.PI * 2); ctx.fill()
    for (const x of [42, 86]) {
      ctx.fillStyle = '#303e3c'; ctx.beginPath(); ctx.ellipse(x, 62, 8, design.personality === 'sleepy' ? 4 : 13, 0, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 2, 57, 2.7, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#edac9f'; ctx.beginPath(); ctx.ellipse(x - (x < 64 ? 8 : -8), 84, 11, 6, 0, 0, Math.PI * 2); ctx.fill()
    }
    ctx.strokeStyle = '#485047'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(64, 88, 10, .15, Math.PI - .15); ctx.stroke()
    ctx.fillStyle = '#536258'; ctx.beginPath(); ctx.ellipse(64, 78, 5, 3, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff3cf'; for (let y = 30; y < 128; y += 27) { ctx.fillRect(128, y, 128, 6) }
  }
  if (savedTexture) { ctx.clearRect(0, 0, 512, 256); ctx.drawImage(savedTexture, 0, 0, 512, 256) }
  const tiles = Array.from({ length: 8 }, () => canvas(tileSize, tileSize))
  function refreshTiles() { tiles.forEach((tile, i) => { const g = tile.getContext('2d')!; g.clearRect(0, 0, 128, 128); g.drawImage(atlas, i % 4 * 128, Math.floor(i / 4) * 128, 128, 128, 0, 0, 128, 128) }) }
  refreshTiles()
  const photos: PhotoSurfaces = { face: tiles[0], torso: tiles[1], arms: [tiles[2], tiles[3]], hands: [tiles[4], tiles[5]], legs: [tiles[6], tiles[7]], whole: atlas, wholeAspect: 2 }
  const kind: ToyStyle['kind'] = design.species === 'rabbit' ? 'long-ear' : design.species === 'cat' || design.species === 'deer' ? 'point-ear' : design.species === 'dog' ? 'floppy-ear' : 'round-ear'
  const toy = design.species !== 'alien' ? makeToyResident({ kind, fur: design.color, skin: design.color, hair: design.color, shirt: design.shirt, accent: '#eee1b7', headWidth: design.species === 'bear' ? .43 : .38, headHeight: .33, earLength: .85 }, photos) : undefined
  const root = toy?.root ?? new THREE.Group(), extras: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [], decals: (() => void)[] = []
  function material(color: string) { const m = new THREE.MeshStandardMaterial({ color, roughness: .8 }); mats.push(m); return m }
  const fur = material(design.color), cream = material('#fff6dc'), ink = material('#334655'), accent = material(design.shirt)
  function mesh(g: THREE.BufferGeometry, m: THREE.Material, parent = root) { extras.push(g); const obj = new THREE.Mesh(g, m); obj.castShadow = true; parent.add(obj); return obj }
  function ball(parent: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) {
    const p = mesh(new THREE.SphereGeometry(1, 20, 14), m, parent as THREE.Group); p.position.set(x, y, z); p.scale.set(sx, sy, sz); return p
  }
  function rod(parent: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, width: number, m: THREE.Material) {
    const p = mesh(new THREE.CylinderGeometry(width, width, a.distanceTo(b), 8), m, parent); p.position.copy(a).add(b).multiplyScalar(.5); p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); return p
  }
  const limbs: THREE.Group[] = [], net = new THREE.Group()
  if (design.species === 'alien') {
    const v = design.variant % 4, head = new THREE.Group(); root.add(head); head.position.y = 1.10
    const body = ball(root, accent, 0, .6, 0, v === 2 ? .27 : .20, .30, .19); decals.push(photoSurface(body, tiles[1], 'torso'))
    ball(head, fur, 0, 0, 0, v === 0 ? .46 : v === 1 ? .31 : .38, v === 1 ? .43 : .30, .29)
    if (v === 2) { const cap = ball(head, accent, 0, .22, 0, .49, .14, .34); cap.rotation.z = -.12 }
    if (v === 3) for (const side of [-1, 1]) ball(head, fur, side * .40, -.02, 0, .16, .09, .1)
    const eyeCount = v === 0 ? 1 : v === 3 ? 3 : 2
    for (let i = 0; i < eyeCount; i++) {
      const x = (i - (eyeCount - 1) / 2) * .20
      ball(head, cream, x, .025, .265, eyeCount === 1 ? .135 : .084, .12, .055)
      ball(head, ink, x, .02, .317, .035, .066, .018); ball(head, cream, x - .012, .05, .334, .012)
    }
    const smile = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.065, -.12, .277), new THREE.Vector3(0, -.20, .31), new THREE.Vector3(.065, -.12, .277))
    mesh(new THREE.TubeGeometry(smile, 10, .009, 5, false), ink, head)
    for (const side of [-1, 1]) {
      rod(head, new THREE.Vector3(side * .17, .23, 0), new THREE.Vector3(side * .25, .52, 0), .014, fur)
      ball(head, accent, side * .25, .53, 0, v === 1 ? .085 : .05)
      const arm = new THREE.Group(); root.add(arm); arm.position.set(side * .18, .77, 0); ball(arm, fur, side * .065, -.14, 0, .065, .20, .065); limbs.push(arm)
    }
    for (let i = 0; i < (v === 3 ? 3 : 2); i++) {
      const leg = new THREE.Group(); root.add(leg); leg.position.set((i - (v === 3 ? 1 : .5)) * .15, .37, 0)
      ball(leg, fur, 0, -.13, .03, .062, .17, .08); limbs.push(leg)
    }
    root.add(net); net.position.set(.31, .53, .07); net.rotation.z = -.40
    rod(net, new THREE.Vector3(), new THREE.Vector3(0, .85, 0), .017, material('#c49b65'))
    const hoop = mesh(new THREE.TorusGeometry(.205, .014, 8, 32), cream, net); hoop.position.y = 1.02
    const thread = material('#e0eee0')
    for (let j = -3; j <= 3; j++) {
      const d = j * .049, len = Math.sqrt(.19 ** 2 - d ** 2)
      rod(net, new THREE.Vector3(d, 1.02 - len, 0), new THREE.Vector3(d, 1.02 + len, 0), .003, thread)
      rod(net, new THREE.Vector3(-len, 1.02 + d, .004), new THREE.Vector3(len, 1.02 + d, .004), .003, thread)
    }
    net.name = 'gentle-explorer-net'
  } else if (design.species === 'squirrel') {
    const tail = ball(root, fur, .15, .63, -.31, .22, .37, .18); tail.rotation.z = -.35
    const spiral = mesh(new THREE.TorusGeometry(.12, .022, 6, 24), cream); spiral.position.set(.19, .76, -.48)
  } else if (design.species === 'cat' || design.species === 'dog') {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, .48, -.10), new THREE.Vector3(.28, .40, -.50), new THREE.Vector3(.28, .75, -.40))
    mesh(new THREE.TubeGeometry(curve, 12, .045, 8, false), fur)
  } else if (design.species === 'deer') {
    for (const s of [-1, 1]) { rod(root, new THREE.Vector3(s * .23, 1.40, 0), new THREE.Vector3(s * .29, 1.78, 0), .025, cream); rod(root, new THREE.Vector3(s * .26, 1.59, 0), new THREE.Vector3(s * .40, 1.69, 0), .02, cream) }
  } else ball(root, cream, 0, .47, -.20, .10)
  root.userData.modelSource = 'animal-miniature'; root.userData.photoSource = design.personal ? 'camera-humanseg-only' : 'procedural'; root.userData.design = design
  return {
    root, appearance: { shape, texture: atlas, humanoid: true, fur: design.color, targetPose: [], design },
    updateTexture() { refreshTiles(); root.traverse(o => { if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.map) m.map.needsUpdate = true }) },
    walk(time: number, walking: boolean) {
      const running = walking && !!root.userData.running, t = time * (running ? 1.9 : 1)
      toy?.walk(t, walking); root.rotation.x = running ? .18 : 0
      if (toy) root.position.y = running ? Math.abs(Math.sin(t * 7)) * .035 : 0
      else {
        const s = walking ? Math.sin(t * 7) : Math.sin(time * 2) * .10
        limbs.forEach((l, i) => l.rotation.x = s * (i % 2 ? 1 : -1) * (running ? .72 : .3))
        root.position.y = Math.abs(s) * (running ? .065 : .018)
        const catching = root.userData.expeditionPhase === 'catch'
        net.rotation.x = catching ? Math.sin((root.userData.expeditionProgress ?? 0) * Math.PI) * 1.7 : running ? .55 + Math.sin(t * 7) * .22 : Math.sin(time * 3) * .03
        net.rotation.z = catching ? -.15 : -.40
      }
    },
    dispose() { toy?.dispose(); root.removeFromParent(); decals.forEach(f => f()); extras.forEach(g => g.dispose()); mats.forEach(m => m.dispose()) },
  }
}

export function residentReply(p: Personality, name: string, alien: boolean, message: string, turn = 0) {
  if (/이름|누구/.test(message)) return `${name}이야. ${personalityNames[p]} 담당이지!`
  if (/무서|잡|그물|잠자리채|우주선|탐사/.test(message)) return alien ? '이번엔 꼭 잡아서 우주선으로 돌아갈 거야! 폭신한 그물로 데려가서 관찰하고, 간식 먹으면 바로 풀어 줘.' : '잡히면 우주선 구경이야! 검사가 끝나면 간식 먹고 다시 숲에서 놀아.'
  const lines: Record<Personality, string[]> = {
    shy: ['아, 안녕… 같이 꽃을 볼래?', '먼저 인사해 줘서 고마워. 조금씩 친해지자.'],
    sunny: ['오늘 구름이 솜사탕 같아! 같이 산책하자!', '새 친구 발견! 우리 다음엔 피크닉할까?'],
    sleepy: ['하아암… 나뭇잎 그늘이 아주 포근해.', '급할 거 없지. 잠깐 앉아서 바람이나 듣자.'],
    curious: ['탐사 일지! 이 숲의 친구들은 웃으면 더 반짝인다!', '방금 새로운 발자국 발견! 살짝 따라가 봐도 될까?'],
    gentle: ['괜찮아, 네 속도로 걸어도 돼. 함께 있을게.', '따뜻한 차 한 잔 어때? 오늘도 와 줘서 고마워.'],
    precise: ['관찰 기록: 오늘의 행복 지수 아주 높음!', '안전거리 확인! 꽃은 밟지 않고 친구는 놀라게 하지 않기.'],
  }
  return lines[p][turn % lines[p].length]
}
