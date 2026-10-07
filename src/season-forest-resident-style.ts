import * as THREE from 'three'
import { photoSurface, type PhotoSurfaces } from './season-forest-resident-photo'

export type ToyStyle = {
  kind: 'human' | 'long-ear' | 'point-ear' | 'round-ear' | 'floppy-ear' | 'object'
  fur: string; skin: string; hair: string; shirt: string; accent: string
  headWidth: number; headHeight: number; earLength: number
}

/** Keep the toy geometry while applying separate, background-free photographic surfaces. */
export function makeToyResident(style: ToyStyle, photos: PhotoSurfaces) {
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group()
  root.add(body); body.add(head); head.position.y = 1.12
  const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = []
  const photoDisposers: (() => void)[] = []
  const dress = (mesh: THREE.Mesh, photo: HTMLCanvasElement | undefined, name: string, aspect?: number) => { if (photo) photoDisposers.push(photoSurface(mesh, photo, name, aspect)); return mesh }
  const geometry = <T extends THREE.BufferGeometry>(g: T) => { geometries.push(g); return g }
  const material = (color: string) => { const m = new THREE.MeshStandardMaterial({ color, roughness: .88 }); materials.push(m); return m }
  const ball = geometry(new THREE.SphereGeometry(1, 40, 28))
  const hairColor = new THREE.Color(style.hair), skinColor = new THREE.Color(style.skin)
  if (Math.abs(hairColor.r - skinColor.r) + Math.abs(hairColor.g - skinColor.g) + Math.abs(hairColor.b - skinColor.b) < .35) hairColor.multiplyScalar(.28)
  const fur = material(style.kind === 'human' ? style.skin : style.fur), hair = material(`#${hairColor.getHexString()}`)
  const cream = material('#fff1d7'), pink = material('#edb0a1'), ink = material('#343c3b'), white = material('#fffdf2')
  const shirt = material(style.shirt), accent = material(style.accent), shoe = material('#655b51')
  const w = style.headWidth, h = style.headHeight, depth = .31
  function piece(parent: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) {
    const mesh = new THREE.Mesh(ball, m); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz)
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh
  }
  // The head has a subtly pear-shaped jaw, not a balloon or extruded photo edge.
  const headGeo = geometry(new THREE.SphereGeometry(1, 48, 32)), vertices = headGeo.getAttribute('position')
  for (let i = 0; i < vertices.count; i++) { const y = vertices.getY(i); vertices.setX(i, vertices.getX(i) * (1 + .09 * Math.exp(-Math.pow((y + .35) * 2, 2)))) }
  headGeo.computeVertexNormals()
  const skull = new THREE.Mesh(headGeo, fur); skull.scale.set(w, h, depth); head.add(skull)
  skull.castShadow = true; skull.receiveShadow = true
  dress(skull, photos.face, 'face', 1 / 1.23)
  if (style.kind === 'human') {
    const cap = new THREE.Mesh(geometry(new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, 1.28)), hair)
    cap.scale.set(w * 1.025, h * 1.025, depth * 1.035); head.add(cap)
    for (const side of [-1, 1]) {
      piece(head, fur, side * w * .99, -.025, 0, .061, .087, .06)
      piece(head, hair, side * w * .55, h * .70, depth * .62, .14, .072, .09).rotation.z = side * .24
    }
  } else {
    for (const side of [-1, 1]) {
      const ear = new THREE.Group(); head.add(ear)
      const long = style.kind === 'long-ear', pointed = style.kind === 'point-ear', floppy = style.kind === 'floppy-ear'
      ear.position.set(side * w * (floppy ? .94 : .7), h * (floppy ? .23 : .82), -.025)
      ear.rotation.z = side * (floppy ? .2 : -.16)
      if (pointed) {
        const shape = new THREE.Shape(); shape.moveTo(-.13, -.055); shape.quadraticCurveTo(-.09, .13, 0, .31); shape.quadraticCurveTo(.07, .16, .13, -.055); shape.closePath()
        const earGeo = geometry(new THREE.ExtrudeGeometry(shape, { depth: .08, bevelEnabled: true, bevelSegments: 4, steps: 1, bevelSize: .025, bevelThickness: .025, curveSegments: 12 }))
        const shell = new THREE.Mesh(earGeo, fur); ear.add(shell)
        piece(ear, pink, 0, .095, .11, .065, .12, .012)
      } else {
        const length = long ? .23 + style.earLength * .14 : floppy ? .24 : .12
        piece(ear, fur, 0, floppy ? -.10 : length * .48, 0, long ? .087 : floppy ? .105 : .135, length, .075)
        piece(ear, pink, 0, floppy ? -.10 : length * .48, .066, long ? .041 : .078, length * .67, .015)
      }
    }
    if (!photos.face) piece(head, cream, 0, -h * .38, depth * .86, w * .48, h * .35, .075)
  }
  // Never superimpose cartoon eyes/nose/mouth on the real face.
  if (!photos.face) {
    const faceZ = (x: number, y: number) => depth * Math.sqrt(Math.max(.1, 1 - (x / w) ** 2 - (y / h) ** 2))
    for (const side of [-1, 1]) {
      const x = side * w * .37, y = h * .10, z = faceZ(x, y)
      piece(head, ink, x, y, z + .012, .041, .063, .023)
      piece(head, white, x - .009, y + .023, z + .034, .012, .016, .007)
      const cx = side * w * .62, cy = -h * .22
      const blush = piece(head, pink, cx, cy, faceZ(cx, cy) + .012, .057, .033, .012); blush.rotation.y = side * .35
    }
    piece(head, style.kind === 'human' ? pink : ink, 0, -h * .22, depth + .067, .029, .021, .022)
    const smile = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.05, -h * .45, depth + .063), new THREE.Vector3(0, -h * .58, depth + .083), new THREE.Vector3(.05, -h * .45, depth + .063))
    const mouth = new THREE.Mesh(geometry(new THREE.TubeGeometry(smile, 16, .008, 6, false)), ink); head.add(mouth)
  }
  // One continuous flared tunic, overlapping sleeves and short legs: no floating body pieces.
  const profile = [[0, -.20], [.18, -.20], [.23, -.16], [.22, -.03], [.17, .19], [.10, .22], [0, .22]].map(([x, y]) => new THREE.Vector2(x, y))
  const tunic = new THREE.Mesh(geometry(new THREE.LatheGeometry(profile, 40)), shirt); tunic.position.y = .62; tunic.scale.z = .78; body.add(tunic)
  tunic.castShadow = true
  dress(tunic, photos.torso, 'torso')
  const collar = new THREE.Mesh(geometry(new THREE.TorusGeometry(.105, .025, 8, 32)), cream); collar.rotation.x = Math.PI / 2; collar.position.y = .82; body.add(collar)
  if (!photos.torso) for (const y of [.67, .59]) piece(body, cream, .018, y, .177, .014, .014, .009)
  const hem = new THREE.Mesh(geometry(new THREE.TorusGeometry(.214, .025, 8, 40)), accent); hem.rotation.x = Math.PI / 2; hem.scale.y = .78; hem.position.y = .47; body.add(hem)
  const arms: THREE.Group[] = [], legs: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const i = side < 0 ? 0 : 1
    const arm = new THREE.Group(); arm.position.set(side * .18, .75, 0); arm.rotation.z = side * .34; body.add(arm)
    dress(piece(arm, shirt, 0, -.063, 0, .079, .11, .078), photos.arms[i], `arm-${i}`)
    dress(piece(arm, fur, 0, -.18, .012, .067, .079, .065), photos.hands[i], `forearm-${i}`); arms.push(arm)
    const leg = new THREE.Group(); leg.position.set(side * .102, .43, 0); body.add(leg)
    dress(piece(leg, fur, 0, -.13, 0, .068, .15, .066), photos.legs[i], `leg-${i}`)
    piece(leg, style.kind === 'human' ? shoe : fur, 0, -.305, .04, .082, .052, .112); legs.push(leg)
  }
  return {
    root,
    walk(time: number, walking: boolean) {
      const stride = walking ? Math.sin(time * 7) : 0
      legs.forEach((leg, i) => { leg.rotation.x = stride * (i ? -.30 : .30) })
      arms.forEach((arm, i) => { arm.rotation.x = stride * (i ? .20 : -.20) })
      body.position.y = Math.abs(stride) * .021; head.rotation.z = stride * .023
    },
    dispose() { root.removeFromParent(); photoDisposers.forEach(dispose => dispose()); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()) },
  }
}
