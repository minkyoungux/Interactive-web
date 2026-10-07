export type Shore = { lat: number; lon: number; width: number; height: number; phase: number }
export type SwimRoute = { lat: number; lon: number; width: number; height: number; rotation: number }
export type SwimReaction = { phase: number; panic: number; x: number; y: number; vx: number; vy: number }

export function waterFootprint(lat: number, lon: number, shores: Shore[], radius = .07) {
  if (!isOpenWater(lat, lon, shores)) return false
  for (let i = 0; i < 16; i++) {
    const angle = i / 16 * Math.PI * 2
    if (!isOpenWater(lat + Math.sin(angle) * radius, lon + Math.cos(angle) * radius / Math.cos(lat), shores)) return false
  }
  return true
}

/** Flee offsets spring back to a moving patrol route; shore checks include body size. */
export function advanceSwimReaction(state: SwimReaction, route: SwimRoute, speed: number, dt: number, shores: Shore[]) {
  const steps = Math.max(1, Math.ceil(Math.min(dt, .05) * 120)), h = Math.min(dt, .05) / steps
  for (let i = 0; i < steps; i++) {
    state.phase += speed * (1 + state.panic * 3) * h
    state.panic *= Math.exp(-h * 1.3)
    state.vx += (-state.x * 4 - state.vx * 3.4) * h
    state.vy += (-state.y * 4 - state.vy * 3.4) * h
    state.x += state.vx * h
    state.y += state.vy * h
    const length = Math.hypot(state.x, state.y)
    if (length > .18) { state.x *= .18 / length; state.y *= .18 / length }
  }
  const base = swimPosition(route, state.phase)
  if (Math.abs(state.x) + Math.abs(state.y) < 1e-7) return base
  const proposed = { lat: base.lat + state.y, lon: base.lon + state.x / Math.cos(base.lat) }
  if (waterFootprint(proposed.lat, proposed.lon, shores)) return proposed
  let safe = 0
  // Walk outward from the known-safe route; never hop across a strip of land.
  for (let i = 1; i <= 8; i++) {
    const factor = i / 8
    if (!waterFootprint(base.lat + state.y * factor, base.lon + state.x * factor / Math.cos(base.lat), shores)) break
    safe = factor
  }
  if (safe < 1) { state.x *= safe; state.y *= safe; state.vx *= .3; state.vy *= .3 }
  return { lat: base.lat + state.y, lon: base.lon + state.x / Math.cos(base.lat) }
}

export type TreeSpring = { x: number; z: number; vx: number; vz: number }
export function advanceTreeSpring(state: TreeSpring, dt: number, reduced = false) {
  const steps = Math.max(1, Math.ceil(Math.min(dt, .05) * 120)), h = Math.min(dt, .05) / steps
  for (let i = 0; i < steps; i++) {
    state.vx += (-state.x * 48 - state.vx * (reduced ? 16 : 7)) * h
    state.vz += (-state.z * 48 - state.vz * (reduced ? 16 : 7)) * h
    state.x += state.vx * h
    state.z += state.vz * h
    const tilt = Math.hypot(state.x, state.z), limit = reduced ? .16 : .65
    if (tilt > limit) { state.x *= limit / tilt; state.z *= limit / tilt; state.vx *= .6; state.vz *= .6 }
  }
  return Math.abs(state.x) + Math.abs(state.z) + Math.abs(state.vx) + Math.abs(state.vz) > .00015
}

export const coastlineRadius = (angle: number, phase: number) => 1 + .13 * Math.sin(angle * 3 + phase) + .09 * Math.cos(angle * 5 - phase) + .045 * Math.sin(angle * 8 + phase)
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))

/** Includes the shallow-water fringe, so swimmers stay clear of beaches. */
export function isOpenWater(lat: number, lon: number, shores: Shore[]) {
  if (Math.abs(lat) > 1.30) return false
  return !shores.some(shore => {
    const x = wrap(lon - shore.lon) / shore.width, y = (lat - shore.lat) / shore.height
    return Math.hypot(x, y) < coastlineRadius(Math.atan2(y, x), shore.phase) * 1.2
  })
}

export function swimPosition(route: SwimRoute, phase: number) {
  const x = Math.cos(phase) * route.width, y = Math.sin(phase) * route.height
  return {
    lat: route.lat + x * Math.sin(route.rotation) + y * Math.cos(route.rotation),
    lon: route.lon + (x * Math.cos(route.rotation) - y * Math.sin(route.rotation)) / Math.cos(route.lat),
  }
}

export function routeIsClear(route: SwimRoute, clearance: number, shores: Shore[]) {
  for (let i = 0; i < 160; i++) {
    const { lat, lon } = swimPosition(route, i / 160 * Math.PI * 2)
    if (!isOpenWater(lat, lon, shores)) return false
    for (let j = 0; j < 12; j++) {
      const angle = j / 12 * Math.PI * 2
      if (!isOpenWater(lat + Math.sin(angle) * clearance, lon + Math.cos(angle) * clearance / Math.cos(lat), shores)) return false
    }
  }
  return true
}

/** Deterministic closed loops; the initial candidates populate the opening view. */
export function makeSwimRoutes(shores: Shore[], count = 24): SwimRoute[] {
  const routes: SwimRoute[] = []
  let seed = 92531
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296 }
  for (let attempt = 0; attempt < 2400 && routes.length < count; attempt++) {
    const front = routes.length < 7 && attempt < 900
    const route = {
      lat: (random() - .5) * (front ? 1.0 : 2.4),
      lon: (random() - .5) * (front ? 1.35 : Math.PI * 2) + (front ? .075 : 0),
      width: (front ? .045 : .07) + random() * .045,
      height: .02 + random() * .035,
      rotation: random() * Math.PI,
    }
    if (routes.some(other => Math.hypot(route.lat - other.lat, wrap(route.lon - other.lon) * Math.cos(route.lat)) < .14)) continue
    if (routeIsClear(route, .07, shores)) routes.push(route)
  }
  return routes
}
