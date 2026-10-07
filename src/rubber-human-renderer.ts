import * as THREE from 'three'
import { FLOW_RADIUS, FLOW_STEPS, type Point, type Pose } from './rubber-human-physics'

export function createRubberRenderer(source: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true })
  renderer.setClearColor(0x000000, 0)
  const texture = new THREE.CanvasTexture(source)
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.premultiplyAlpha = true
  const uniforms = {
    face: { value: texture }, anchor: { value: new THREE.Vector2() }, pull: { value: new THREE.Vector2() },
    center: { value: new THREE.Vector2() }, right: { value: new THREE.Vector2() }, down: { value: new THREE.Vector2() },
    swelling: { value: 0 },
    viewport: { value: new THREE.Vector2(1, 1) },
  }
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: `
      uniform vec2 anchor, pull, center, right, down, viewport;
      uniform float swelling;
      varying vec2 faceUV;
      void main() {
        faceUV = uv;
        vec2 p = vec2(position.x, -position.y);
        vec2 bumpDelta = p - anchor;
        // Radial dilation creates a rounded cartoon lump without moving the held point.
        p += bumpDelta * (.65 * swelling * exp(-dot(bumpDelta, bumpDelta) / .075));
        vec2 stepPull = pull / ${FLOW_STEPS.toFixed(1)};
        for (int i = 0; i < ${FLOW_STEPS}; i++) {
          vec2 c = anchor + stepPull * float(i);
          vec2 d = p - c;
          float w = exp(-dot(d, d) / ${(FLOW_RADIUS ** 2).toFixed(6)});
          vec2 m = p + stepPull * w * .5 - c - stepPull * .5;
          p += stepPull * exp(-dot(m, m) / ${(FLOW_RADIUS ** 2).toFixed(6)});
        }
        vec2 screen = center + right * p.x + down * p.y;
        gl_Position = vec4(screen.x / viewport.x * 2. - 1., 1. - screen.y / viewport.y * 2., 0., 1.);
      }
    `,
    fragmentShader: `
      uniform sampler2D face;
      uniform vec2 anchor;
      uniform float swelling;
      varying vec2 faceUV;
      void main() {
        vec4 skin = texture2D(face, faceUV);
        vec2 rest = vec2((faceUV.x - .5) * 2.5, (.5 - faceUV.y) * 2.5);
        vec2 d = rest - anchor;
        float r2 = dot(d, d);
        float blush = swelling * exp(-r2 / .085);
        vec3 color = skin.rgb / max(skin.a, .001);
        color = mix(color, vec3(.86, .24, .23), blush * .54);
        // Broad, soft highlight and lower shading suggest the volume of a bump.
        float highlight = exp(-dot(d - vec2(-.07, -.09), d - vec2(-.07, -.09)) / .009);
        float shade = exp(-dot(d - vec2(.07, .11), d - vec2(.07, .11)) / .02);
        color += swelling * (highlight * .16 - shade * .075);
        gl_FragColor = vec4(color * skin.a, skin.a);
      }
    `,
  })
  // Dense surface plus continuous flow: no coarse landmark triangles in the silhouette.
  const geometry = new THREE.PlaneGeometry(2.5, 2.5, 160, 160)
  let textureVersion = 0, previousState: number[] = []
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  const scene = new THREE.Scene()
  scene.add(mesh)
  const camera = new THREE.Camera()
  return {
    canvas: renderer.domElement,
    updateTexture() { texture.needsUpdate = true; textureVersion++ },
    resize(width: number, height: number, dpr: number) {
      renderer.setPixelRatio(dpr); renderer.setSize(width, height, false)
      uniforms.viewport.value.set(width, height); previousState = []
    },
    render(pose: Pose, anchor: Point, pull: Point, swelling = 0) {
      const state = [textureVersion, pose.center.x, pose.center.y, pose.right.x, pose.right.y,
        pose.down.x, pose.down.y, anchor.x, anchor.y, pull.x, pull.y, swelling].map(Math.fround)
      if (state.every((v, i) => v === previousState[i])) return
      previousState = state
      uniforms.center.value.set(pose.center.x, pose.center.y)
      uniforms.right.value.set(pose.right.x, pose.right.y)
      uniforms.down.value.set(pose.down.x, pose.down.y)
      uniforms.anchor.value.set(anchor.x, anchor.y)
      uniforms.pull.value.set(pull.x, pull.y)
      uniforms.swelling.value = swelling
      renderer.render(scene, camera)
    },
    dispose() { geometry.dispose(); material.dispose(); texture.dispose(); renderer.dispose(); renderer.forceContextLoss() },
  }
}
