import * as THREE from 'three'
import type { BodyPoint } from './season-forest-resident-vision'
import type { PhotoSurfaces } from './season-forest-resident-photo'

type Input = { shape: HTMLCanvasElement; photos: PhotoSurfaces; texture?: HTMLCanvasElement; targetPose?: BodyPoint[]; humanoid: boolean; style: { fur: string } }
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v))
const visible = (p?: BodyPoint) => !!p && (p.visibility ?? 1) > .5 && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1

/** One continuous mesh from the uploaded mask. No animal template or body-part substitution. */
export function makeReferenceResident({ shape, photos, texture, targetPose = [], humanoid, style }: Input) {
  const w = shape.width, h = shape.height, pixels = shape.getContext('2d')!.getImageData(0, 0, w, h).data
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && pixels[(y * w + x) * 4 + 3] > 120
  const span = (v: number) => {
    const y = Math.min(h - 1, Math.floor(v * h)); let left = w, right = 0
    for (let x = 0; x < w; x++) if (inside(x, y)) { left = Math.min(left, x); right = Math.max(right, x + 1) }
    return { left: left / w, right: right / w, width: Math.max(0, right - left) / w }
  }
  const poseFound = [11, 12, 23, 24].every(i => visible(targetPose[i]))
  let neck = .53, best = 0
  for (let v = .32; v < .69; v += .015) {
    const drop = span(v - .035).width - span(v + .035).width
    if (drop > best) { best = drop; neck = v }
  }
  const shoulderY = poseFound ? (targetPose[11].y + targetPose[12].y) / 2 : neck
  const hipY = poseFound ? (targetPose[23].y + targetPose[24].y) / 2 : neck + (1 - neck) * .64
  const atlas = document.createElement('canvas'); atlas.width = w; atlas.height = h
  const ctx = atlas.getContext('2d')!; ctx.drawImage(shape, 0, 0)
  const regions: string[] = []
  function patch(photo: HTMLCanvasElement | undefined, name: string, x: number, y: number, width: number, height: number) {
    if (!photo || width <= 0 || height <= 0) return
    ctx.drawImage(photo, x * w, y * h, width * w, height * h); regions.push(name)
  }
  function segment(photo: HTMLCanvasElement | undefined, name: string, a: BodyPoint, b: BodyPoint, thickness: number) {
    if (!photo) return
    const dx = (b.x - a.x) * w, dy = (b.y - a.y) * h, length = Math.hypot(dx, dy)
    if (length < 2) return
    ctx.save(); ctx.translate(a.x * w, a.y * h); ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2)
    ctx.drawImage(photo, -thickness / 2, 0, thickness, length); ctx.restore(); regions.push(name)
  }
  if (texture) {
    ctx.clearRect(0, 0, w, h); ctx.drawImage(texture, 0, 0, w, h)
  } else if (humanoid || poseFound) {
    if (poseFound) {
      const order = targetPose[11].x < targetPose[12].x ? [0, 1] : [1, 0]
      const [a, b] = order, L = targetPose[11 + a], R = targetPose[11 + b], H = targetPose[23 + a], J = targetPose[23 + b]
      if (photos.torso) {
        // Horizontal strips follow the uploaded shoulder/hip outline, not a fixed tunic.
        for (let row = 0; row < 128; row++) {
          const t = row / 128, left = L.x * (1 - t) + H.x * t, right = R.x * (1 - t) + J.x * t
          ctx.drawImage(photos.torso, 0, row * 2, 256, 2, left * w, (shoulderY + t * (hipY - shoulderY)) * h, (right - left) * w, Math.max(1, (hipY - shoulderY) * h / 128 + .5))
        }
        regions.push('torso')
      }
      order.forEach((side, i) => {
        for (const [a, b, photo, name, thickness] of [
          [11 + side, 13 + side, photos.arms[i], `arm-${i}`, .065 * w],
          [13 + side, 15 + side, photos.hands[i], `forearm-${i}`, .06 * w],
          [23 + side, 27 + side, photos.legs[i], `leg-${i}`, .09 * w],
        ] as [number, number, HTMLCanvasElement | undefined, string, number][]) {
          if (visible(targetPose[a]) && visible(targetPose[b])) segment(photo, name, targetPose[a], targetPose[b], thickness)
        }
      })
    } else {
      // Only texture placement is inferred; the actual uploaded outline is never changed.
      const torso = span((shoulderY + hipY) / 2), mid = (torso.left + torso.right) / 2
      const width = Math.min(torso.width, .55)
      patch(photos.torso, 'torso', mid - width / 2, shoulderY, width, hipY - shoulderY)
      for (const i of [0, 1]) {
        patch(photos.arms[i], `arm-${i}`, i ? torso.right - .10 : torso.left, shoulderY + .035, .10, Math.max(.06, hipY - shoulderY - .06))
        const foot = span(.92), center = i ? foot.right - .07 : foot.left + .07
        patch(photos.legs[i], `leg-${i}`, center - .07, hipY, .14, 1 - hipY)
      }
    }
    if (photos.face) {
      let left: number, top: number, width: number, height: number
      if ([0, 2, 5].every(i => visible(targetPose[i]))) {
        const nose = targetPose[0], eyes = Math.abs(targetPose[2].x - targetPose[5].x)
        const ears = visible(targetPose[7]) && visible(targetPose[8]) ? Math.abs(targetPose[7].x - targetPose[8].x) : 0
        width = Math.max(eyes * 2.8, ears * 1.5, .06); height = width * w / h * 1.23
        left = nose.x - width / 2; top = nose.y - height * .59
      } else {
        let widest = span(.3), centerY = .3
        for (let v = .16; v < shoulderY; v += .02) { const row = span(v); if (row.width > widest.width) { widest = row; centerY = v } }
        height = Math.min(shoulderY - .06, widest.width * w / h * .82)
        width = height * h / w / 1.23
        left = (widest.left + widest.right - width) / 2; top = clamp(centerY - height * .40, .01, Math.max(.01, shoulderY - height))
      }
      patch(photos.face, 'face', left, top, width, height)
    }
  } else {
    const targetAspect = w / h, width = Math.min(1, photos.wholeAspect / targetAspect), height = Math.min(1, targetAspect / photos.wholeAspect)
    patch(photos.whole, 'person', (1 - width) / 2, (1 - height) / 2, width, height)
  }
  // All compositing remains clipped to the uploaded shape, including holes and tails.
  if (!texture) { ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(shape, 0, 0); ctx.globalCompositeOperation = 'source-over' }
  const map = new THREE.CanvasTexture(atlas); map.colorSpace = THREE.SRGBColorSpace
  const frontMaterial = new THREE.MeshStandardMaterial({ map, roughness: .9 })
  const backMaterial = new THREE.MeshStandardMaterial({ color: style.fur, roughness: .9 })
  const distance = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) distance[y * w + x] = inside(x, y) ? Math.min(x + 1, y + 1, w - x, h - y) : 0
  const diagonal = Math.SQRT2
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (x) distance[i] = Math.min(distance[i], distance[i - 1] + 1)
    if (y) distance[i] = Math.min(distance[i], distance[i - w] + 1)
    if (x && y) distance[i] = Math.min(distance[i], distance[i - w - 1] + diagonal)
    if (x + 1 < w && y) distance[i] = Math.min(distance[i], distance[i - w + 1] + diagonal)
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x
    if (x + 1 < w) distance[i] = Math.min(distance[i], distance[i + 1] + 1)
    if (y + 1 < h) distance[i] = Math.min(distance[i], distance[i + w] + 1)
    if (x + 1 < w && y + 1 < h) distance[i] = Math.min(distance[i], distance[i + w + 1] + diagonal)
    if (x && y + 1 < h) distance[i] = Math.min(distance[i], distance[i + w - 1] + diagonal)
  }
  const scale = Math.min(1.5 / h, 1.8 / w), positions: number[] = [], uv: number[] = [], front: number[] = [], back: number[] = [], lookup = new Map<string, number>()
  function vertex(x: number, y: number, rear: boolean) {
    const key = `${x}:${y}:${rear}`, known = lookup.get(key); if (known !== undefined) return known
    const d = distance[Math.min(h - 1, y) * w + Math.min(w - 1, x)]
    const z = (.008 + Math.sqrt(d * Math.max(1, Math.min(w, h) * .16)) * scale * .72) * (rear ? -1 : 1)
    const index = positions.length / 3
    positions.push((x - w / 2) * scale, (h - y) * scale, z); uv.push(x / w, 1 - y / h); lookup.set(key, index); return index
  }
  const step = 2
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    if (!inside(x, y)) continue
    const corners = [[x,y],[Math.min(w,x+step),y],[Math.min(w,x+step),Math.min(h,y+step)],[x,Math.min(h,y+step)]]
    const f = corners.map(([x,y]) => vertex(x,y,false)), b = corners.map(([x,y]) => vertex(x,y,true))
    front.push(f[0],f[2],f[1],f[0],f[3],f[2]); back.push(b[0],b[1],b[2],b[0],b[2],b[3])
    const neighbours = [[x,y-step],[x+step,y],[x,y+step],[x-step,y]]
    for (let e = 0; e < 4; e++) if (!inside(...neighbours[e] as [number, number])) { const n = (e + 1) % 4; back.push(f[e],b[e],b[n],f[e],b[n],f[n]) }
  }
  const geometry = new THREE.BufferGeometry(), position = new THREE.Float32BufferAttribute(positions, 3)
  geometry.setAttribute('position', position); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex([...front, ...back])
  geometry.addGroup(0, front.length, 0); geometry.addGroup(front.length, back.length, 1); geometry.computeVertexNormals(); geometry.computeBoundingSphere()
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body)
  const mesh = new THREE.Mesh(geometry, [frontMaterial, backMaterial]); mesh.name = 'humanseg-reference'; mesh.castShadow = true; mesh.receiveShadow = true; body.add(mesh)
  root.userData.modelSource = 'uploaded-silhouette'; root.userData.photoRegions = regions
  // Shader deformation is shared by the whole watertight body, so limbs never detach.
  const stride = { value: 0 }
  const weights = new Float32Array(position.count)
  for (let i = 0; i < position.count; i++) {
    const v = 1 - position.getY(i) / (h * scale), u = position.getX(i) / (w * scale) + .5
    weights[i] = humanoid ? clamp((v - hipY) / Math.max(.05, 1 - hipY)) * (u < .5 ? -1 : 1) : 0
  }
  geometry.setAttribute('walkWeight', new THREE.BufferAttribute(weights, 1))
  for (const material of [frontMaterial, backMaterial]) {
    material.onBeforeCompile = shader => {
      shader.uniforms.residentStride = stride
      shader.vertexShader = 'attribute float walkWeight; uniform float residentStride;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.z += walkWeight * residentStride * 0.045; transformed.y += abs(walkWeight * residentStride) * 0.015;')
    }
    material.customProgramCacheKey = () => 'reference-resident-walk-v1'
  }
  return {
    root,
    appearance: { shape, texture: atlas, humanoid, fur: style.fur, targetPose },
    updateTexture() { map.needsUpdate = true },
    walk(time: number, walking: boolean) { stride.value = walking ? Math.sin(time * 7) : 0; body.position.y = Math.abs(stride.value) * .012; body.rotation.z = stride.value * .012 },
    dispose() { root.removeFromParent(); geometry.dispose(); frontMaterial.dispose(); backMaterial.dispose(); map.dispose() },
  }
}
