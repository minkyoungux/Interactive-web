import * as THREE from 'three'

/** Open-water creatures, independent of the tiny animals on the globe. Units match the globe's 6.3-unit diameter. */
export function setupDeepFauna(scene: THREE.Scene, reducedMotion: boolean) {
  const root = new THREE.Group(); root.name = 'deep-sea-wildlife'; scene.add(root)
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
  const material = (color: string, glow = false, opacity = 1) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: .56, metalness: .08, emissive: glow ? color : '#000000', emissiveIntensity: glow ? .5 : 0, transparent: opacity < 1, opacity, depthWrite: opacity === 1, side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide }); materials.add(m); return m
  }
  const sharkSkin = material('#577f93'), sharkBelly = material('#b9ced0'), whaleSkin = material('#284f6b'), whaleBelly = material('#89aeb8'), dark = material('#102738'), eye = material('#071722'), glint = material('#caecea', true)
  const sphere = new THREE.SphereGeometry(1, 24, 16); geometries.add(sphere)
  function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, m: THREE.Material) { geometries.add(geometry); const p = new THREE.Mesh(geometry, m); parent.add(p); return p }
  function oval(parent: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) { const p = mesh(parent, sphere, m); p.position.set(x, y, z); p.scale.set(sx, sy, sz); return p }
  function fin(parent: THREE.Object3D, m: THREE.Material, outline: number[][], thickness = .07) {
    const shape = new THREE.Shape(); outline.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath()
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSize: .045, bevelThickness: .035, bevelSegments: 2, steps: 1 }); geo.translate(0, 0, -thickness / 2)
    return mesh(parent, geo, m)
  }
  function line(parent: THREE.Object3D, points: THREE.Vector3[], m: THREE.Material, width = .014) { return mesh(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, width, 5, false), m) }
  function hull(parent: THREE.Object3D, profile: number[][], top: THREE.Material, belly: THREE.Material) {
    const pos: number[] = [], normals: number[] = [], topIndices: number[] = [], lowerIndices: number[] = [], slices = 44, rings = 28
    for (let i = 0; i <= slices; i++) {
      const t = i / slices * (profile.length - 1), j = Math.min(profile.length - 2, Math.floor(t)), f = t - j
      const p = profile[j].map((v, k) => THREE.MathUtils.lerp(v, profile[j + 1][k], f)), [x, ry, rz, cy] = p
      for (let k = 0; k <= rings; k++) { const a = k / rings * Math.PI * 2; pos.push(x, cy + Math.cos(a) * ry, Math.sin(a) * rz); normals.push(0, Math.cos(a), Math.sin(a)) }
    }
    for (let i = 0; i < slices; i++) for (let k = 0; k < rings; k++) { const a = i * (rings + 1) + k, b = a + rings + 1, target = Math.cos((k + .5) / rings * Math.PI * 2) < -.48 ? lowerIndices : topIndices; target.push(a, a + 1, b, a + 1, b + 1, b) }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geo.setIndex([...topIndices, ...lowerIndices]); geo.addGroup(0, topIndices.length, 0); geo.addGroup(topIndices.length, lowerIndices.length, 1); geo.computeVertexNormals()
    const p = new THREE.Mesh(geo, [top, belly]); geometries.add(geo); parent.add(p)
  }
  function giant(kind: 'shark' | 'whale') {
    const actor = new THREE.Group(), body = new THREE.Group(), tail = new THREE.Group(), fins: THREE.Mesh[] = []; actor.name = `abyss-giant-${kind}`; actor.add(body); body.add(tail); root.add(actor)
    const whale = kind === 'whale', skin = whale ? whaleSkin : sharkSkin, pale = whale ? whaleBelly : sharkBelly
    hull(body, whale ? [[-3.2,.04,.07,0],[-2.5,.30,.40,0],[-1.3,.67,.79,.08],[0,.96,1.05,.14],[1.3,1.0,1.08,.14],[2.5,.78,.85,.03],[3.0,.36,.46,-.10],[3.15,.015,.025,-.13]] : [[-2.8,.025,.04,0],[-2.0,.23,.25,0],[-1.0,.50,.56,.02],[.2,.68,.70,.03],[1.3,.59,.60,0],[2.2,.32,.40,-.04],[2.8,.01,.015,-.09]], skin, pale)
    const dorsal = fin(body, skin, whale ? [[-.9,.55],[-1.15,1.16],[-.42,.64]] : [[-.65,.53],[-.28,1.65],[.68,.55]])
    dorsal.rotation.y = .04
    for (const side of [-1, 1]) {
      if (whale) {
        const f = oval(body, skin, .20, -.45, side * 1.12, 1.12, .13, .40); f.rotation.y = side * -.6; f.rotation.x = side * .42; fins.push(f)
      } else {
        const f = fin(body, skin, [[.7,0],[-.9,.15],[-1.5,1.45],[.3,.48]])
        f.rotation.x = side * Math.PI / 2; f.position.set(.0, -.30, side * .40); fins.push(f)
      }
      const x = whale ? 2.38 : 1.85, z = whale ? .90 : .505
      oval(body, eye, x, .02, side * z, .075, .07, .025); oval(body, glint, x + .018, .044, side * (z + .023), .022, .021, .008)
      line(body, [new THREE.Vector3(whale ? 3.02 : 2.66, -.18, side * .20), new THREE.Vector3(2.30, -.24, side * (whale ? .82 : .43)), new THREE.Vector3(whale ? 1.80 : 1.65, -.22, side * (whale ? .92 : .48))], dark, .012)
      if (!whale) for (let g = 0; g < 4; g++) { const x = .85 - g * .17; line(body, [new THREE.Vector3(x,.26,side*.61),new THREE.Vector3(x-.06,0,side*.66),new THREE.Vector3(x-.03,-.25,side*.61)], dark,.018) }
    }
    tail.position.x = whale ? -2.9 : -2.55
    if (whale) {
      oval(tail, skin, -.30, 0, 0, .58, .16, .27)
      const flukes = fin(tail, skin, [[-.15,0],[-.62,.57],[-1.38,1.34],[-1.25,.40],[-.95,0],[-1.25,-.40],[-1.38,-1.34],[-.62,-.57]])
      flukes.rotation.x = Math.PI / 2
      for (let i = -3; i <= 3; i++) line(body, [new THREE.Vector3(2.5,-.42,i*.12),new THREE.Vector3(1.6,-.77,i*.19),new THREE.Vector3(.5,-.86,i*.19),new THREE.Vector3(-.3,-.67,i*.12)], whaleBelly,.014)
      oval(body,dark,1.45,1.11,0,.14,.018,.055)
    } else {
      fin(tail, skin, [[.12,0],[-.44,.43],[-1.06,1.26],[-.94,.25],[-.59,-.03],[-.95,-.78],[-.34,-.37]])
    }
    actor.userData.kind = kind; actor.userData.length = whale ? 7.5 : 6.7
    return { actor, body, tail, fins, whale }
  }
  const giants = [giant('whale'), giant('shark')]
  const jellyMaterial = material('#66c5ce', true, .26), jellyRim = material('#8eebd7', true, .65)
  const jellies = Array.from({ length: 7 }, (_, i) => {
    const actor = new THREE.Group(); actor.name = 'abyss-jellyfish'; root.add(actor)
    const bell = mesh(actor, new THREE.SphereGeometry(.36, 20, 12, 0, Math.PI * 2, 0, Math.PI * .57), jellyMaterial)
    const rim = mesh(actor, new THREE.TorusGeometry(.35,.019,6,24),jellyRim); rim.rotation.x = Math.PI/2; rim.position.y=-.055
    const tentacles: THREE.Mesh[] = []
    for(let j=0;j<6;j++){const a=j/6*Math.PI*2;tentacles.push(line(actor,[new THREE.Vector3(Math.cos(a)*.24,-.04,Math.sin(a)*.24),new THREE.Vector3(Math.cos(a+.5)*.19,-.48,Math.sin(a+.5)*.19),new THREE.Vector3(Math.cos(a+1)*.14,-.92,Math.sin(a+1)*.14)],jellyRim,.009))}
    actor.scale.setScalar(.65 + i % 3 * .28)
    return {actor,bell,tentacles,phase:i*1.71}
  })
  const fishMaterial = material('#70a5b6'), shoal = new THREE.Group(); shoal.name='abyss-lanternfish-shoal'; root.add(shoal)
  for(let i=0;i<24;i++){
    const fish=new THREE.Group(); shoal.add(fish); fish.position.set((i%8)*.34,Math.sin(i*2.3)*.35,Math.cos(i*1.7)*.38)
    oval(fish,fishMaterial,0,0,0,.14,.045,.04); const tail=fin(fish,fishMaterial,[[-.12,0],[-.23,.08],[-.20,0],[-.23,-.08]],.01); tail.name='small-tail'
    oval(fish,jellyRim,.09,-.025,.025,.013,.013,.013)
  }
  const forward = new THREE.Vector3(1,0,0), tangent = new THREE.Vector3()
  function pose(time: number) {
    for (const g of giants) {
      // Opposite orbits above/below the globe: occasional near passes, with a clear central viewing area.
      const a = (g.whale ? 3.94 : 5.65) + time * (g.whale ? .021 : -.033), rx = g.whale ? 9.7 : 8.9, rz = g.whale ? 8.1 : 7.3
      g.actor.position.set(Math.cos(a)*rx, (g.whale ? 3.35 : -3.05)+Math.sin(time*.13+(g.whale?0:2))*.38, Math.sin(a)*rz)
      tangent.set(-Math.sin(a)*rx, .08*Math.cos(time*.13), Math.cos(a)*rz).multiplyScalar(g.whale?1:-1).normalize(); g.actor.quaternion.setFromUnitVectors(forward,tangent)
      const beat=Math.sin(time*(g.whale?1.2:1.9)); g.tail.rotation[g.whale?'z':'y']=beat*(g.whale?.16:.28); g.body.rotation[g.whale?'z':'y']=beat*.025
      g.fins.forEach((f,i)=>{if(g.whale)f.rotation.x=(i?1:-1)*(.42+beat*.09)})
    }
    jellies.forEach(({actor,bell,tentacles,phase},i)=>{
      const a=phase+time*.014; actor.position.set(Math.cos(a)*(6.4+i*.29),Math.sin(phase*2)*3.8+Math.sin(time*.22+phase)*.45,-6.5+Math.sin(a)*1.6)
      bell.scale.set(1+Math.sin(time*1.8+phase)*.09,1-Math.sin(time*1.8+phase)*.09,1+Math.sin(time*1.8+phase)*.09)
      tentacles.forEach((t,j)=>{t.rotation.z=Math.sin(time*.9+phase+j)*.08})
    })
    shoal.position.set(Math.sin(time*.055+.4)*8,-1.6+Math.sin(time*.10)*.55,-8.5); shoal.rotation.y=Math.cos(time*.055+.4)*.45
  }
  let time=0; pose(0)
  return { root, update(delta:number){if(!reducedMotion){time+=delta;pose(time)}}, dispose(){root.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose())} }
}
