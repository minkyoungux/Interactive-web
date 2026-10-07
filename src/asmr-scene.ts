import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export type MaterialFrame = {
  mode: 'soap' | 'slime' | 'sand'
  width: number
  height: number
  scale: number
  time: number
  box: { x: number; y: number; width: number; height: number }
  blob: { x: number; y: number; radius: number }
  sand: { left: number; width: number; bottom: number; maxHeight: number }
  radii: Float32Array
  heights: Float32Array
  contacts: { x: number; y: number }[]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function sample(values: Float32Array, amount: number, wrap = false) {
  const f = (wrap ? ((amount % 1) + 1) % 1 : clamp(amount, 0, 1)) * (wrap ? values.length : values.length - 1)
  const a = Math.floor(f)
  const b = wrap ? (a + 1) % values.length : Math.min(a + 1, values.length - 1)
  const t = f - a
  return values[a] + (values[b] - values[a]) * t * t * (3 - 2 * t)
}

/** The silhouette uses exactly the radial profile used by the hand collision code. */
export function deformSlime(geometry: THREE.BufferGeometry, rest: Float32Array, frame: MaterialFrame) {
  const position = geometry.getAttribute('position')
  const radius = frame.blob.radius
  for (let i = 0; i < position.count; i++) {
    const px = rest[i * 3]
    const py = rest[i * 3 + 1]
    const pz = rest[i * 3 + 2]
    const angle = Math.atan2(-py, px)
    const radial = sample(frame.radii, angle / (Math.PI * 2), true)
    const x = px * radial * radius
    const y = py * radial * radius
    const r = Math.hypot(px, py)
    // Constant-volume approximation: stretched edges thin, squeezed areas thicken.
    let z = pz * radius * .43 / Math.sqrt(radial)
    const folds = Math.sin(r * 12 - angle * 3) * Math.sin(r * Math.PI) * radius * .032
    z += folds * Math.max(0, pz)
    if (pz > 0) {
      for (const contact of frame.contacts) {
        const dx = x - (contact.x - frame.blob.x)
        const dy = y + (contact.y - frame.blob.y)
        const d = Math.hypot(dx, dy) / (radius * .115)
        z -= Math.exp(-d * d * 1.6) * radius * .09 * pz
        z += Math.exp(-Math.pow(d - 1.25, 2) * 7) * radius * .016 * pz
      }
    }
    position.setXYZ(i, x, y, z)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
}

function sandPoint(u: number, v: number, frame: MaterialFrame) {
  const mound = frame.sand
  const h = sample(frame.heights, u) * mound.maxHeight
  const initial = Math.pow(Math.max(0, 1 - Math.pow(u * 2 - 1, 2)), .72) * mound.maxHeight
  const carved = clamp((initial - h) / Math.max(1, initial), 0, 1)
  const ripple = Math.sin(v * 27 + u * 9) * Math.sin(v * Math.PI)
  return {
    x: (u - .5) * mound.width,
    y: h - v * (h + 14),
    z: Math.sin(v * Math.PI) * h * .36 + ripple * (1.6 + carved * 1.8),
  }
}

export function deformSand(geometry: THREE.BufferGeometry, frame: MaterialFrame) {
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < position.count; i++) {
    const p = sandPoint(uv.getX(i), 1 - uv.getY(i), frame)
    position.setXYZ(i, p.x, p.y, p.z)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
}

function textureNoise(size: number, kind: 'soap' | 'sand') {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const pixels = ctx.createImageData(size, size)
  let seed = 72941
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0
      const n = (seed >>> 24) / 255
      const i = (y * size + x) * 4
      const value = kind === 'sand' ? 95 + n * 155 : 185 + n * 17
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value
      pixels.data[i + 3] = 255
    }
  }
  ctx.putImageData(pixels, 0, 0)
  if (kind === 'soap') {
    // An actual recessed stamp in the bump map, with subtle manufactured edges.
    ctx.strokeStyle = '#b0b0b0'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.roundRect(size * .18, size * .28, size * .64, size * .44, size * .09); ctx.stroke()
    ctx.fillStyle = '#aaaaaa'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `500 ${Math.round(size * .10)}px Georgia, serif`
    ctx.fillText('S A V O N', size * .5, size * .50)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 4
  return texture
}

export function createMaterialRenderer() {
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !lowPower, powerPreference: 'default', preserveDrawingBuffer: false })
  } catch (error) {
    console.warn('3D materials unavailable; keeping the Canvas renderer.', error)
    return null
  }
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000)
  camera.position.z = 1600
  const environment = new RoomEnvironment()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environmentTarget = pmrem.fromScene(environment, .045)
  scene.environment = environmentTarget.texture
  scene.environmentIntensity = .65
  environment.dispose()
  pmrem.dispose()

  const key = new THREE.DirectionalLight(0xffefdf, 3.1)
  key.position.set(-380, 490, 850)
  key.castShadow = true
  key.shadow.mapSize.set(lowPower ? 512 : 1024, lowPower ? 512 : 1024)
  key.shadow.camera.left = key.shadow.camera.bottom = -1100
  key.shadow.camera.right = key.shadow.camera.top = 1100
  key.shadow.camera.near = 1
  key.shadow.camera.far = 2400
  key.shadow.normalBias = 2
  key.shadow.bias = -.0003
  key.shadow.radius = 4
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xd1e9ff, .9)
  fill.position.set(450, 40, 300)
  scene.add(fill)
  const rim = new THREE.DirectionalLight(0xffffff, 1.8)
  rim.position.set(120, -400, 350)
  scene.add(rim)

  const shadowMaterial = new THREE.ShadowMaterial({ color: 0x100c13, opacity: .27 })
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3200, 2400), shadowMaterial)
  shadow.position.z = -80
  shadow.receiveShadow = true
  scene.add(shadow)

  const soapTexture = textureNoise(512, 'soap')
  const sandTexture = textureNoise(512, 'sand')
  sandTexture.repeat.set(3, 2)
  const soapMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf2a79d, roughness: .29, metalness: 0,
    clearcoat: .55, clearcoatRoughness: .2, envMapIntensity: .85,
    bumpMap: soapTexture, bumpScale: 1.5,
  })
  const soapGeometry = new RoundedBoxGeometry(1, .56, .23, 5, .095)
  const soap = new THREE.Mesh(soapGeometry, soapMaterial)
  soap.castShadow = true
  soap.rotation.set(.26, -.24, -.055)
  scene.add(soap)

  const slimeGeometry = new THREE.SphereGeometry(1, lowPower ? 48 : 80, lowPower ? 28 : 48)
  const slimeRest = new Float32Array(slimeGeometry.getAttribute('position').array)
  const slimeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x77bd92, roughness: .14, metalness: 0,
    clearcoat: 1, clearcoatRoughness: .075,
    ior: 1.38, envMapIntensity: 1.3,
    sheen: .28, sheenColor: new THREE.Color(0xdcffdc), sheenRoughness: .2,
    // No full-screen transmission buffer: the creamy gel remains inexpensive on phones.
    transmission: 0, specularIntensity: 1,
  })
  const slime = new THREE.Mesh(slimeGeometry, slimeMaterial)
  slime.castShadow = true
  scene.add(slime)
  const bubbleGeometry = new THREE.SphereGeometry(1, 10, 8)
  const bubbleMaterial = new THREE.MeshPhysicalMaterial({ color: 0xd1efc3, roughness: .13, clearcoat: 1, transparent: true, opacity: .38, depthWrite: false })
  const bubbles = new THREE.InstancedMesh(bubbleGeometry, bubbleMaterial, lowPower ? 22 : 40)
  bubbles.frustumCulled = false
  scene.add(bubbles)

  const sandGeometry = new THREE.PlaneGeometry(1, 1, 103, lowPower ? 28 : 48)
  const sandMaterial = new THREE.MeshStandardMaterial({
    color: 0xd5a269, roughness: .97, metalness: 0,
    map: sandTexture, bumpMap: sandTexture, bumpScale: 2.1,
    envMapIntensity: .24, side: THREE.DoubleSide,
  })
  const sand = new THREE.Mesh(sandGeometry, sandMaterial)
  sand.castShadow = true
  sand.receiveShadow = true
  scene.add(sand)
  const grainCount = lowPower ? 600 : 1500
  const grainGeometry = new THREE.IcosahedronGeometry(1, 0)
  const grainMaterial = new THREE.MeshStandardMaterial({ color: 0xffd9a5, roughness: .9, metalness: 0 })
  const grains = new THREE.InstancedMesh(grainGeometry, grainMaterial, grainCount)
  grains.frustumCulled = false
  const positions = new Float32Array(grainCount * 3)
  let seed = 411
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296 }
  const grainColor = new THREE.Color()
  for (let i = 0; i < grainCount; i++) {
    positions[i * 3] = random()
    positions[i * 3 + 1] = random()
    positions[i * 3 + 2] = random()
    grainColor.setHSL(.09 + random() * .035, .3 + random() * .3, .47 + random() * .25)
    grains.setColorAt(i, grainColor)
  }
  scene.add(grains)
  const dummy = new THREE.Object3D()
  const prevHeights = new Float32Array(104).fill(-1)
  let sizeKey = ''
  let lastSlimeAt = 0
  let previousSoap = { x: 0, y: 0 }
  let previousMode = ''
  return {
    paint(ctx: CanvasRenderingContext2D, frame: MaterialFrame) {
      if (renderer.getContext().isContextLost()) return false
      const scale = Math.min(frame.scale, 2, Math.sqrt((lowPower ? 1_100_000 : 2_400_000) / (frame.width * frame.height)))
      const keySize = `${frame.width}/${frame.height}/${scale}`
      const resized = sizeKey !== keySize
      if (resized) {
        sizeKey = keySize
        renderer.setPixelRatio(scale)
        renderer.setSize(frame.width, frame.height, false)
        camera.left = -frame.width / 2
        camera.right = frame.width / 2
        camera.top = frame.height / 2
        camera.bottom = -frame.height / 2
        camera.updateProjectionMatrix()
      }
      soap.visible = frame.mode === 'soap'
      slime.visible = bubbles.visible = frame.mode === 'slime'
      sand.visible = grains.visible = frame.mode === 'sand'
      if (soap.visible) {
        const x = frame.box.x + frame.box.width / 2
        const y = frame.box.y + frame.box.height / 2
        const dx = previousMode === frame.mode ? x - previousSoap.x : 0
        const dy = previousMode === frame.mode ? y - previousSoap.y : 0
        soap.rotation.x += (.26 + clamp(dy * .004, -.05, .05) - soap.rotation.x) * .12
        soap.rotation.y += (-.24 + clamp(dx * .004, -.06, .06) - soap.rotation.y) * .12
        soap.position.set(x - frame.width / 2, frame.height / 2 - y, 15)
        soap.scale.set(frame.box.width, frame.box.height / .56, frame.box.width)
        previousSoap = { x, y }
      }
      if (slime.visible) {
        if (frame.time - lastSlimeAt > (lowPower ? 32 : 16) || resized || previousMode !== frame.mode) {
          deformSlime(slimeGeometry, slimeRest, frame)
          lastSlimeAt = frame.time
          for (let i = 0; i < bubbles.count; i++) {
            const angle = i * 2.399963
            const r = Math.sqrt((i + .5) / bubbles.count) * .83
            const radial = sample(frame.radii, angle / (Math.PI * 2), true)
            const x = Math.cos(angle) * r * frame.blob.radius * radial
            const y = -Math.sin(angle) * r * frame.blob.radius * radial
            const z = Math.sqrt(1 - r * r) * frame.blob.radius * .43 / Math.sqrt(radial)
            dummy.position.set(x, y, z - .8)
            dummy.rotation.set(0, 0, angle)
            const size = frame.blob.radius * (.009 + (i % 5) * .002)
            dummy.scale.set(size, size, size * .35)
            dummy.updateMatrix()
            bubbles.setMatrixAt(i, dummy.matrix)
          }
          bubbles.instanceMatrix.needsUpdate = true
        }
        slime.position.set(frame.blob.x - frame.width / 2, frame.height / 2 - frame.blob.y, 20)
        bubbles.position.copy(slime.position)
      }
      if (sand.visible) {
        let dirty = resized || previousMode !== frame.mode
        for (let i = 0; i < frame.heights.length; i++) if (Math.abs(prevHeights[i] - frame.heights[i]) > .0005) dirty = true
        if (dirty) {
          deformSand(sandGeometry, frame)
          prevHeights.set(frame.heights)
          for (let i = 0; i < grainCount; i++) {
            const u = positions[i * 3]
            const v = positions[i * 3 + 1]
            const p = sandPoint(u, v, frame)
            dummy.position.set(p.x, p.y, p.z + .7)
            const size = .45 + positions[i * 3 + 2] * 1.3
            dummy.scale.set(size, size * .72, size * .58)
            dummy.rotation.set(u * 30, v * 25, u * 13)
            dummy.updateMatrix()
            grains.setMatrixAt(i, dummy.matrix)
          }
          grains.instanceMatrix.needsUpdate = true
        }
        sand.position.set(frame.sand.left + frame.sand.width / 2 - frame.width / 2, frame.height / 2 - frame.sand.bottom, 0)
        grains.position.copy(sand.position)
      }
      previousMode = frame.mode
      renderer.render(scene, camera)
      // Composite immediately so the shared recorder includes the 3D image without a second WebGL capture.
      ctx.drawImage(renderer.domElement, 0, 0, frame.width, frame.height)
      return true
    },
    dispose() {
      scene.traverse((object: THREE.Object3D) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach((material: THREE.Material) => material.dispose())
        }
      })
      soapTexture.dispose()
      sandTexture.dispose()
      environmentTarget.dispose()
      key.shadow.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
