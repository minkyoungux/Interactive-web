import * as THREE from 'three'
import type { ResidentModel } from './season-forest-resident-store'

export type ExpeditionActor = {
  id: string; name: string; model: ResidentModel; anchor: THREE.Group; island: number
  x: number; y: number; target: number; targetY: number; rest: number; speed: number
  socialCooldown: number; removed: boolean; capturedBy?: string; transfer?: unknown
}
type Phase = 'search' | 'chase' | 'catch' | 'return' | 'research' | 'depart' | 'rest'
type Mission = { actor: ExpeditionActor; phase: Phase; time: number; target?: ExpeditionActor; ship: THREE.Group; beam: THREE.Mesh; bubble: THREE.Mesh; island: number; path: { x: number; y: number }[]; replan: number; success: number }
type Options = { world: THREE.Group; actors: ExpeditionActor[]; location: (island: number, x: number, y: number, radius?: number) => THREE.Vector3; safe: (x: number, y: number, island: number) => boolean; say: (actor: ExpeditionActor, text: string) => void; blocked: (actor: ExpeditionActor) => boolean }
export const EXPEDITION_DOCK = { x: .12, y: .43 }
const dock = EXPEDITION_DOCK

/** Search → sustained sprint → net swing → carry → UFO scan → safe release → launch. */
export function setupExpeditions(o: Options) {
  const missions = new Map<string, Mission>(), geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = []
  function mat(color: string, opacity = 1) { const m = new THREE.MeshStandardMaterial({ color, roughness: .48, transparent: opacity < 1, opacity, depthWrite: opacity === 1 }); materials.push(m); return m }
  const silver = mat('#d3e3d8'), rim = mat('#9ab1b7'), glass = mat('#a3dce4', .55), glow = mat('#fbe58a'), beamMat = mat('#d5f6be', .16), bubbleMat = mat('#c6f5ea', .19)
  function part(parent: THREE.Object3D, g: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx) { geometries.push(g); const m = new THREE.Mesh(g, material); m.position.set(x, y, z); m.scale.set(sx, sy, sz); parent.add(m); return m }
  function station(r: ExpeditionActor) {
    const ship = new THREE.Group(); ship.name = `explorer-ufo-${r.id}`; o.world.add(ship)
    part(ship, new THREE.SphereGeometry(1, 24, 12), silver, 0, .24, 0, .32, .075, .32)
    part(ship, new THREE.SphereGeometry(1, 24, 12), glass, 0, .29, 0, .19, .15, .19)
    const ring = part(ship, new THREE.TorusGeometry(.28, .027, 8, 32), rim, 0, .23, 0); ring.rotation.x = Math.PI / 2
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; part(ship, new THREE.SphereGeometry(.021, 8, 6), glow, Math.cos(a) * .28, .25, Math.sin(a) * .28) }
    const beam = part(ship, new THREE.CylinderGeometry(.10, .23, .30, 24, 1, true), beamMat, 0, .07, 0); beam.visible = false
    const bubble = part(o.world, new THREE.SphereGeometry(.22, 20, 12), bubbleMat, 0, 0, 0); bubble.visible = false
    const m: Mission = { actor: r, phase: 'search', time: .5, ship, beam, bubble, island: r.island, path: [], replan: 0, success: 0 }
    missions.set(r.id, m); return m
  }
  function state(m: Mission, phase: Phase, text?: string) { m.phase = phase; m.time = 0; m.path = []; m.replan = 0; m.actor.model.root.userData.expeditionPhase = phase; if (text) o.say(m.actor, text) }
  function free(m: Mission) {
    if (m.target?.capturedBy === m.actor.id) {
      const f = m.target; f.capturedBy = undefined; f.model.root.scale.setScalar(.34); f.model.root.position.set(0, 0, 0)
      f.x = m.actor.x; f.y = m.actor.y; f.island = m.actor.island; f.target = .1; f.targetY = -.3; f.rest = 2; f.socialCooldown = 24
      f.anchor.position.copy(o.location(f.island, f.x, f.y)); f.model.root.userData.running = false
    }
    m.target = undefined; m.bubble.visible = m.beam.visible = false
  }
  function cancel(r: ExpeditionActor) {
    for (const m of missions.values()) if (m.actor === r || m.target === r) { free(m); state(m, 'rest'); m.actor.rest = 1; m.actor.model.root.userData.running = false }
  }
  // Small local navigation grid avoids the pond and coast even when a target runs around them.
  function route(r: ExpeditionActor, x: number, y: number) {
    const nodes: { x: number; y: number; ix: number; iy: number }[] = [], lookup = new Map<string, number>()
    for (let iy = -9; iy <= 9; iy++) for (let ix = -9; ix <= 9; ix++) if (o.safe(ix * .08, iy * .08, r.island)) { lookup.set(`${ix},${iy}`, nodes.length); nodes.push({ x: ix * .08, y: iy * .08, ix, iy }) }
    const nearest = (x: number, y: number) => nodes.reduce((best, p, i) => Math.hypot(p.x - x, p.y - y) < Math.hypot(nodes[best].x - x, nodes[best].y - y) ? i : best, 0)
    const start = nearest(r.x, r.y), end = nearest(x, y), queue = [start], previous = new Map<number, number>([[start, -1]])
    for (let q = 0; q < queue.length && !previous.has(end); q++) {
      const p = nodes[queue[q]]
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const next = lookup.get(`${p.ix + dx},${p.iy + dy}`)
        if (next === undefined || previous.has(next) || !o.safe(p.x + dx * .04, p.y + dy * .04, r.island)) continue
        previous.set(next, queue[q]); queue.push(next)
      }
    }
    if (!previous.has(end)) return []
    const path = []; for (let n = end; n !== -1; n = previous.get(n)!) path.unshift(nodes[n])
    if (o.safe(x, y, r.island)) path.push({ x, y, ix: 0, iy: 0 })
    return path
  }
  function steer(m: Mission, x: number, y: number, speed: number, delta: number) {
    const r = m.actor; r.speed = speed; r.rest = 0; r.model.root.userData.running = true
    m.replan -= delta
    if (m.replan <= 0) { m.path = route(r, x, y); m.replan = .6 }
    while (m.path.length && Math.hypot(m.path[0].x - r.x, m.path[0].y - r.y) < .045) m.path.shift()
    const p = m.path[0] ?? { x, y }; r.target = p.x; r.targetY = p.y
  }
  function update(delta: number, paused: boolean) {
    for (const r of o.actors) if (r.model.appearance.design?.species === 'alien' && !missions.has(r.id)) station(r)
    for (const [id, m] of missions) {
      const r = m.actor
      if (r.removed || !o.actors.includes(r)) { free(m); m.ship.removeFromParent(); m.bubble.removeFromParent(); missions.delete(id); continue }
      if (r.island !== m.island) { free(m); state(m, 'search'); m.island = r.island }
      if (o.blocked(r) || (m.target && (m.target.removed || o.blocked(m.target) || m.target.island !== r.island))) cancel(r)
      m.ship.position.copy(o.location(m.island, dock.x, dock.y)); m.ship.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), m.ship.position.clone().normalize())
      if (paused || o.blocked(r)) continue
      m.time += delta; r.socialCooldown = 2
      if (m.phase === 'search') {
        const claimed = new Set([...missions.values()].filter(n => n !== m).map(n => n.target?.id))
        const f = o.actors.filter(f => f !== r && f.island === r.island && f.model.appearance.design && f.model.appearance.design.species !== 'alien' && !f.model.appearance.design.personal && !f.capturedBy && !o.blocked(f) && !claimed.has(f.id) && f.socialCooldown <= 0)
          .sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y))[0]
        if (f) { m.target = f; state(m, 'chase', `${f.name} 발견! 이번엔 꼭… 탐사 성공하고 돌아갈 거야!`); o.say(f, '앗, 탐사대다! 잡을 수 있으면 잡아 봐~!') }
      } else if (m.phase === 'chase') {
        const f = m.target!
        steer(m, f.x, f.y, .30, delta); f.rest = 0; f.speed = .18; f.socialCooldown = 2; f.model.root.userData.running = true
        const a = Math.atan2(f.y - r.y, f.x - r.x) + Math.sin(m.time * 2.4) * .55
        for (const turn of [0, .8, -.8, 1.6, -1.6]) {
          const x = f.x + Math.cos(a + turn) * .18, y = f.y + Math.sin(a + turn) * .18
          if (o.safe(x, y, f.island)) { f.target = x; f.targetY = y; break }
        }
        if (Math.hypot(f.x - r.x, f.y - r.y) < .14) { f.capturedBy = r.id; r.rest = 999; state(m, 'catch', '잡았다아! 탐사 대성공! 우주선으로 출발!'); o.say(f, '폭신한 그물이다! 우주선도 구경하는 거야?') }
      } else if (m.phase === 'catch') {
        r.rest = 999
        if (m.time >= .8) state(m, 'return', '소중한 발견이다… 조심조심, 우주선까지!')
      } else if (m.phase === 'return') {
        steer(m, dock.x, dock.y, .23, delta)
        if (Math.hypot(r.x - dock.x, r.y - dock.y) < .075) { r.rest = 999; m.beam.visible = true; state(m, 'research', '우주선 도착! 생태 기록 중… 간식도 준비했어!') }
      } else if (m.phase === 'research') {
        r.rest = 999; m.beam.visible = true
        if (m.time > 3.5) {
          const f = m.target!; o.say(f, '검사 끝! 간식 맛있었어. 다음에 또 놀자!'); free(m); m.success++; r.model.root.userData.expeditionSuccesses = m.success
          state(m, 'depart', '탐사 완료! 친구는 숲으로, 기록은 우주로!')
        }
      } else if (m.phase === 'depart') {
        r.rest = 999
        if (m.time > 3) { state(m, 'rest'); r.rest = 3 }
      } else if (m.phase === 'rest' && m.time > 6) state(m, 'search', '충전 완료! 다음 친구를 찾아 나서자!')
      r.model.root.userData.expeditionProgress = m.phase === 'catch' ? Math.min(1, m.time / .8) : 0
    }
  }
  function render() {
    for (const m of missions.values()) {
      const r = m.actor, normal = m.ship.position.clone().normalize()
      if (m.phase === 'depart') {
        const lift = Math.sin(Math.min(1, m.time / 3) * Math.PI) * .75
        m.ship.position.addScaledVector(normal, lift); r.anchor.position.copy(m.ship.position).addScaledVector(normal, .27)
      }
      if (!m.target?.capturedBy) continue
      const f = m.target; f.x = r.x; f.y = r.y; f.island = r.island
      const p = m.phase === 'research' ? m.ship.position.clone().addScaledVector(normal, .09 + Math.sin(m.time * 3) * .02) : new THREE.Vector3(.19, .26, .22).applyQuaternion(r.anchor.quaternion).add(r.anchor.position)
      f.anchor.position.copy(p); f.anchor.quaternion.copy(r.anchor.quaternion); f.model.root.scale.setScalar(.20)
      m.bubble.position.copy(p).addScaledVector(normal, .14); m.bubble.visible = true
    }
  }
  return { update, render, cancel, missions, owns: (r: ExpeditionActor) => !!r.capturedBy || !![...missions.values()].find(m => m.actor === r && m.phase !== 'search' && m.phase !== 'rest'), dispose() { for (const m of missions.values()) { free(m); m.ship.removeFromParent(); m.bubble.removeFromParent() } geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); missions.clear() } }
}
