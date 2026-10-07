import * as THREE from 'three'

/** Keep transparency, or remove only similar background pixels connected to the border. */
export function prepareCharacter(source: HTMLCanvasElement) {
  const canvas = document.createElement('canvas'), ratio = 256 / Math.max(source.width, source.height)
  canvas.width = Math.max(1, Math.round(source.width * ratio)); canvas.height = Math.max(1, Math.round(source.height * ratio))
  const ctx = canvas.getContext('2d')!; ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  const { width: w, height: h } = canvas, pixels = ctx.getImageData(0, 0, w, h), data = pixels.data
  const corners = [0, w - 1, (h - 1) * w, w * h - 1].map(i => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]])
  const seen = new Uint8Array(w * h), queue = new Int32Array(w * h)
  let read = 0, end = 0
  function offer(i: number) {
    if (seen[i]) return
    seen[i] = 1
    const p = i * 4
    if (data[p + 3] < 32 || corners.some(c => Math.hypot(data[p] - c[0], data[p + 1] - c[1], data[p + 2] - c[2]) < 43)) queue[end++] = i
  }
  // Transparent artwork must retain dark/white details even if corner RGB is arbitrary.
  const hasAlpha = Array.from({ length: w * h }, (_, i) => data[i * 4 + 3]).some(a => a < 20)
  if (!hasAlpha) {
    for (let x = 0; x < w; x++) { offer(x); offer((h - 1) * w + x) }
    for (let y = 0; y < h; y++) { offer(y * w); offer(y * w + w - 1) }
    while (read < end) {
      const i = queue[read++], x = i % w, y = Math.floor(i / w)
      data[i * 4 + 3] = 0
      if (x) offer(i - 1); if (x + 1 < w) offer(i + 1); if (y) offer(i - w); if (y + 1 < h) offer(i + w)
    }
  }
  let x0 = w, y0 = h, x1 = 0, y1 = 0, count = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 100) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); count++ }
  if (count < 100 || x1 - x0 < 8 || y1 - y0 < 8) throw new Error('캐릭터 윤곽을 찾기 어려워요. 배경이 투명하거나 단색인 이미지를 골라주세요.')
  ctx.putImageData(pixels, 0, 0)
  const cropped = document.createElement('canvas'); cropped.width = x1 - x0 + 1; cropped.height = y1 - y0 + 1
  cropped.getContext('2d')!.drawImage(canvas, x0, y0, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height)
  return cropped
}

export function makeImageResident(reference: HTMLCanvasElement, face: HTMLCanvasElement | undefined, placement: { x: number; y: number; size: number }) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body)
  const w = reference.width, h = reference.height, worldHeight = 1.65, worldWidth = Math.min(2.3, worldHeight * w / h)
  const pixels = reference.getContext('2d')!.getImageData(0, 0, w, h).data
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && pixels[(y * w + x) * 4 + 3] > 100
  const distance = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) distance[y * w + x] = inside(x, y) ? Math.min(x + 1, y + 1, w - x, h - y, 999) : 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (x) distance[i] = Math.min(distance[i], distance[i - 1] + 1)
    if (y) distance[i] = Math.min(distance[i], distance[i - w] + 1)
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x
    if (x + 1 < w) distance[i] = Math.min(distance[i], distance[i + 1] + 1)
    if (y + 1 < h) distance[i] = Math.min(distance[i], distance[i + w] + 1)
  }
  const map = new THREE.CanvasTexture(reference); map.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.MeshStandardMaterial({ map, roughness: .9, side: THREE.DoubleSide })
  const geometries: THREE.BufferGeometry[] = [], textures = [map], materials: THREE.Material[] = [mat]
  const limbGroups: THREE.Group[] = []
  for (let part = 0; part < 3; part++) {
    const positions: number[] = [], uvs: number[] = []
    const pivot = new THREE.Vector3(part ? (part === 1 ? -.18 : .18) * worldWidth : 0, part ? worldHeight * .26 : 0, 0)
    const group = new THREE.Group(); group.position.copy(pivot); body.add(group)
    if (part) limbGroups.push(group)
    const belongs = (x: number, y: number) => inside(x, y) && (y < h * .74 ? part === 0 : part === (x < w / 2 ? 1 : 2))
    const vertex = (x: number, y: number, back = false) => {
      const d = distance[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))]
      return [(x / w - .5) * worldWidth - pivot.x, (1 - y / h) * worldHeight - pivot.y, (.015 + .14 * Math.sqrt(Math.min(d / 24, 1))) * (back ? -1 : 1)]
    }
    const triangle = (a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[]) => { positions.push(...a, ...b, ...c); uvs.push(...ua, ...ub, ...uc) }
    const step = 2
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      if (!belongs(x, y)) continue
      const x2 = Math.min(w, x + step), y2 = Math.min(h, y + step)
      const uv = [[x / w, 1 - y / h], [x2 / w, 1 - y / h], [x2 / w, 1 - y2 / h], [x / w, 1 - y2 / h]]
      const front = [vertex(x, y), vertex(x2, y), vertex(x2, y2), vertex(x, y2)]
      const back = [vertex(x, y, true), vertex(x2, y, true), vertex(x2, y2, true), vertex(x, y2, true)]
      triangle(front[0], front[2], front[1], uv[0], uv[2], uv[1]); triangle(front[0], front[3], front[2], uv[0], uv[3], uv[2])
      triangle(back[0], back[1], back[2], uv[0], uv[1], uv[2]); triangle(back[0], back[2], back[3], uv[0], uv[2], uv[3])
      const neighbours = [[x, y - step], [x + step, y], [x, y + step], [x - step, y]]
      for (let edge = 0; edge < 4; edge++) if (!belongs(neighbours[edge][0], neighbours[edge][1])) {
        const next = (edge + 1) % 4
        triangle(front[edge], back[edge], back[next], uv[edge], uv[edge], uv[next]); triangle(front[edge], back[next], front[next], uv[edge], uv[next], uv[next])
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.computeVertexNormals(); geometries.push(geo)
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh)
  }
  if (face) {
    const faceMap = new THREE.CanvasTexture(face); faceMap.colorSpace = THREE.SRGBColorSpace; textures.push(faceMap)
    const faceMat = new THREE.MeshStandardMaterial({ map: faceMap, transparent: true, depthWrite: false, roughness: 1 }); materials.push(faceMat)
    const faceGeo = new THREE.SphereGeometry(1, 32, 24, .55, Math.PI - 1.1, .49, 2.08); geometries.push(faceGeo)
    const faceMesh = new THREE.Mesh(faceGeo, faceMat)
    const width = worldWidth * placement.size
    faceMesh.scale.set(width * .59, width * .69, .055)
    faceMesh.position.set((placement.x - .5) * worldWidth, (1 - placement.y) * worldHeight, .165)
    body.add(faceMesh)
  }
  return {
    root,
    walk(time: number, walking: boolean) {
      const stride = walking ? Math.sin(time * 7) : 0
      limbGroups.forEach((leg, i) => { leg.rotation.x = stride * (i ? -1 : 1) * .24 })
      body.position.y = Math.abs(stride) * .025; body.rotation.z = stride * .022
    },
    dispose() { root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()) },
  }
}
