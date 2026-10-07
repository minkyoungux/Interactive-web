import * as THREE from 'three'
import './season-forest-deep-sea.css'
import { setupDeepFauna } from './season-forest-deep-fauna'

/** Water outside the little world. Never intercepts picking or changes resident coordinates. */
export function setupDeepSea(scene: THREE.Scene, reducedMotion: boolean) {
  const fauna = setupDeepFauna(scene, reducedMotion)
  const app = document.querySelector<HTMLElement>('.forest-app')!
  app.classList.add('deep-sea-world')
  const backdrop = document.createElement('div'); backdrop.className = 'deep-sea-backdrop'; backdrop.setAttribute('aria-hidden', 'true')
  backdrop.innerHTML = '<div class="deep-sea-surface"></div><i class="deep-sea-ray ray-one"></i><i class="deep-sea-ray ray-two"></i><i class="deep-sea-ray ray-three"></i><div class="deep-sea-haze"></div>'
  app.prepend(backdrop)
  const count = 180, positions = new Float32Array(count * 3), sizes = new Float32Array(count), speeds = new Float32Array(count), bubbles = new Float32Array(count)
  // Deterministic layout keeps the scene calm across reloads.
  let seed = 71029
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296 }
  for (let i = 0; i < count; i++) {
    let x: number, y: number, z: number
    do { x = (random() - .5) * 23; y = (random() - .5) * 17; z = (random() - .6) * 16 } while (Math.hypot(x, y, z) < 5.2)
    positions.set([x, y, z], i * 3); bubbles[i] = i % 6 === 0 ? 1 : 0
    sizes[i] = bubbles[i] ? 11 + random() * 14 : 1.5 + random() * 3
    speeds[i] = bubbles[i] ? .10 + random() * .11 : .025 + random() * .025
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1)); geometry.setAttribute('bubble', new THREE.BufferAttribute(bubbles, 1))
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { pixelRatio: { value: Math.min(devicePixelRatio, 1.8) } },
    vertexShader: `attribute float size; attribute float bubble; uniform float pixelRatio; varying float vBubble; varying float vFade;
      void main(){vec4 p=modelViewMatrix*vec4(position,1.);vBubble=bubble;vFade=smoothstep(2.5,6.,-p.z);gl_PointSize=clamp(size*pixelRatio*10./max(3.,-p.z),1.,35.);gl_Position=projectionMatrix*p;}`,
    fragmentShader: `varying float vBubble; varying float vFade;
      void main(){vec2 uv=gl_PointCoord-.5;float d=length(uv);if(d>.5)discard;
      float dust=exp(-d*d*22.)*.36;float ring=(1.-smoothstep(.015,.055,abs(d-.38)))*.23;
      float glint=exp(-length(uv-vec2(-.20,-.23))*30.)*.45;
      gl_FragColor=vec4(vec3(.40,.80,.86),mix(dust,ring+glint,vBubble)*vFade);}`,
  })
  const particles = new THREE.Points(geometry, material); particles.name = 'deep-sea-plankton-and-bubbles'; particles.frustumCulled = false; scene.add(particles)
  let time = 0
  return {
    update(delta: number) {
      fauna.update(delta)
      if (reducedMotion) return
      time += delta
      for (let i = 0; i < count; i++) {
        positions[i * 3 + 1] += speeds[i] * delta
        positions[i * 3] += Math.sin(time * .22 + i * 1.7) * delta * .009
        if (positions[i * 3 + 1] > 9) positions[i * 3 + 1] = -9
      }
      geometry.getAttribute('position').needsUpdate = true
    },
    dispose() { fauna.dispose(); particles.removeFromParent(); geometry.dispose(); material.dispose(); backdrop.remove(); app.classList.remove('deep-sea-world') },
  }
}
