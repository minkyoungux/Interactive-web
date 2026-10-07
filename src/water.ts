import './water.css'
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision'

type Point = { x: number; y: number }
type TrackedTip = Point & {
  targetX: number
  targetY: number
  previousX: number
  previousY: number
  velocity: number
  lastSeen: number
  phase: number
  colorIndex: number
  proximity: number
  targetProximity: number
}
type SnapState = { pinched: boolean; primedAt: number; lastGap: number; lastSeen: number; cooldownUntil: number }
type BlackDrop = Point & { strength: number; age: number }

const fingerColors = [
  '#ff174d', '#ff6d00', '#ffd600', '#35dc68', '#00e5c3',
  '#00b8ff', '#3563ff', '#794cff', '#db2bff', '#ff3f9b',
]
const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <main class="water-app">
    <video class="camera-source" id="camera" playsinline muted aria-label="실시간 카메라 입력"></video>
    <canvas class="water-canvas" id="water-canvas" aria-label="손끝에 반응하는 물결 카메라 화면"></canvas>
    <div class="surface-shade" aria-hidden="true"></div>
    <div class="tip-layer" id="tip-layer" aria-hidden="true">
      ${fingerColors.map((color) => `<i style="--tip-color:${color}"></i>`).join('')}
    </div>

    <header class="water-topbar">
      <a class="water-brand" href="${import.meta.env.BASE_URL}" aria-label="인터랙티브 랩으로 돌아가기">
        <span class="water-mark" aria-hidden="true"></span>
        <strong>WaterTouch</strong>
        <span class="example-number">08</span>
      </a>
      <div class="tracking-status" id="tracking-status" role="status" aria-live="polite">
        <i aria-hidden="true"></i><span>Camera waiting</span>
      </div>
    </header>

    <p class="gesture-hint" id="gesture-hint">손끝 잉크를 휘저어 섞고, 엄지와 중지를 튕겨 검은 잉크를 떨어뜨려보세요</p>
    <p class="snap-toast" id="snap-toast" role="status" aria-live="polite">SNAP · BLACK INK</p>

    <section class="welcome" id="welcome" aria-labelledby="welcome-title">
      <div class="welcome-card">
        <p class="welcome-kicker">EXPERIMENT 08 · 10-FINGER WATER TRACKING</p>
        <h1 id="welcome-title">WaterTouch</h1>
        <p class="welcome-copy">열 손가락 끝에서 서로 다른 잉크가 흐르고,<br>손을 흔들면 물살을 따라 색들이 섞였다 사라져요.</p>
        <button class="start-button" id="start-button" type="button">카메라 켜기</button>
        <p class="privacy-note">카메라 영상은 기기 밖으로 전송되거나 저장되지 않아요.</p>
      </div>
    </section>

    <section class="error-panel" id="error-panel" hidden aria-live="assertive">
      <div>
        <h2>카메라를 열 수 없어요</h2>
        <p id="error-copy">브라우저의 카메라 권한을 확인하고 다시 시도해 주세요.</p>
        <button class="retry-button" id="retry-button" type="button">다시 시도</button>
      </div>
    </section>
  </main>
`

const video = document.querySelector<HTMLVideoElement>('#camera')!
const canvas = document.querySelector<HTMLCanvasElement>('#water-canvas')!
const welcome = document.querySelector<HTMLElement>('#welcome')!
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!
const retryButton = document.querySelector<HTMLButtonElement>('#retry-button')!
const errorPanel = document.querySelector<HTMLElement>('#error-panel')!
const errorCopy = document.querySelector<HTMLElement>('#error-copy')!
const trackingStatus = document.querySelector<HTMLElement>('#tracking-status')!
const trackingCopy = trackingStatus.querySelector<HTMLElement>('span')!
const gestureHint = document.querySelector<HTMLElement>('#gesture-hint')!
const snapToast = document.querySelector<HTMLElement>('#snap-toast')!
const tipDots = Array.from(document.querySelectorAll<HTMLElement>('#tip-layer i'))

const lowPowerDevice = (navigator.hardwareConcurrency || 8) <= 4
const fingertipIndices = [4, 8, 12, 16, 20]
const tips = new Map<string, TrackedTip>()
const snapStates = new Map<string, SnapState>()
const blackDrops: BlackDrop[] = []
let handLandmarker: HandLandmarker | null = null
let cameraReady = false
let lastVideoTime = -1
let lastInferenceAt = 0
let lastFrameAt = performance.now()
let lastTipCount = -1
let lastInkAt = Number.NEGATIVE_INFINITY
let inkCleared = true
let cameraResolution = 'CAMERA'
let width = innerWidth
let height = innerHeight
let dpr = 1
let snapToastTimer = 0

const gl = canvas.getContext('webgl', {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: false,
})

if (!gl) throw new Error('WebGL is required for WaterTouch.')

const vertexShaderSource = `
  attribute vec2 aPosition;
  varying vec2 vUv;
  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`

const simulationFragmentSource = `
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D uState;
  uniform vec2 uTexel;
  uniform float uAspect;
  uniform vec4 uTouches[10];

  void main() {
    float current = texture2D(uState, vUv).r - 0.5;
    float previous = texture2D(uState, vUv).g - 0.5;
    float left = texture2D(uState, vUv - vec2(uTexel.x, 0.0)).r - 0.5;
    float right = texture2D(uState, vUv + vec2(uTexel.x, 0.0)).r - 0.5;
    float down = texture2D(uState, vUv - vec2(0.0, uTexel.y)).r - 0.5;
    float up = texture2D(uState, vUv + vec2(0.0, uTexel.y)).r - 0.5;
    float nextHeight = (left + right + down + up) * 0.5 - previous;
    nextHeight *= 0.993;

    for (int index = 0; index < 10; index++) {
      vec2 delta = vUv - uTouches[index].xy;
      delta.x *= uAspect;
      float radius = max(0.016, uTouches[index].w);
      float distanceFromTip = length(delta) / radius;
      float centerPush = exp(-distanceFromTip * distanceFromTip * 1.35);
      float displacedRim = exp(-pow(distanceFromTip - 1.15, 2.0) * 5.5);
      nextHeight += (centerPush - displacedRim * 0.32) * uTouches[index].z;
    }

    nextHeight = clamp(nextHeight, -0.46, 0.46);
    gl_FragColor = vec4(nextHeight + 0.5, current + 0.5, 0.5, 1.0);
  }
`

const inkFragmentSource = `
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D uInk;
  uniform sampler2D uState;
  uniform vec2 uTexel;
  uniform float uAspect;
  uniform float uTime;
  uniform float uFade;
  uniform vec4 uBursts[10];

  vec3 fingerColor(float colorIndex) {
    if (colorIndex > 1.0) return vec3(0.002, 0.003, 0.006);
    if (colorIndex < 0.10) return vec3(1.00, 0.03, 0.16);
    if (colorIndex < 0.20) return vec3(1.00, 0.25, 0.00);
    if (colorIndex < 0.30) return vec3(1.00, 0.78, 0.00);
    if (colorIndex < 0.40) return vec3(0.04, 0.88, 0.28);
    if (colorIndex < 0.50) return vec3(0.00, 0.90, 0.72);
    if (colorIndex < 0.60) return vec3(0.00, 0.64, 1.00);
    if (colorIndex < 0.70) return vec3(0.10, 0.26, 1.00);
    if (colorIndex < 0.80) return vec3(0.42, 0.12, 1.00);
    if (colorIndex < 0.90) return vec3(0.88, 0.04, 1.00);
    return vec3(1.00, 0.08, 0.56);
  }

  void main() {
    float density = texture2D(uInk, vUv).a;
    float leftHeight = texture2D(uState, vUv - vec2(uTexel.x, 0.0)).r;
    float rightHeight = texture2D(uState, vUv + vec2(uTexel.x, 0.0)).r;
    float downHeight = texture2D(uState, vUv - vec2(0.0, uTexel.y)).r;
    float upHeight = texture2D(uState, vUv + vec2(0.0, uTexel.y)).r;
    vec2 flow = vec2(rightHeight - leftHeight, upHeight - downHeight) * 0.10;
    float curlX = sin(vUv.y * 39.0 + uTime * 0.00062) + cos(vUv.x * 21.0 - uTime * 0.00037);
    float curlY = cos(vUv.x * 34.0 + uTime * 0.00048) - sin(vUv.y * 25.0 - uTime * 0.00031);
    vec2 turbulence = vec2(curlX, curlY * 0.30) * (0.00014 + density * 0.00030);
    vec2 sinking = vec2(0.0, 0.00028 + density * 0.00038);
    vec2 sourceUv = clamp(vUv - flow + turbulence - sinking, uTexel, 1.0 - uTexel);

    vec4 center = texture2D(uInk, sourceUv);
    vec4 blur = (
      texture2D(uInk, sourceUv - vec2(uTexel.x, 0.0)) +
      texture2D(uInk, sourceUv + vec2(uTexel.x, 0.0)) +
      texture2D(uInk, sourceUv - vec2(0.0, uTexel.y)) +
      texture2D(uInk, sourceUv + vec2(0.0, uTexel.y))
    ) * 0.25;
    vec4 ink = mix(center, blur, 0.028) * uFade;

    for (int index = 0; index < 10; index++) {
      vec2 delta = vUv - uBursts[index].xy;
      delta.x *= uAspect;
      float encoded = uBursts[index].w * 10.0;
      float age = fract(encoded);
      float colorIndex = (floor(encoded) + 0.35) / 10.0;
      float radius = 0.022 + uBursts[index].z * 0.024;
      float distanceFromDrop = length(delta);
      float angle = atan(delta.y, delta.x);
      float lobes = 0.66 + 0.34 * sin(angle * 9.0 + distanceFromDrop * 185.0 - uTime * 0.0012);
      float cloud = exp(-dot(delta, delta) / (radius * radius)) * lobes;

      float downward = max(0.0, uBursts[index].y - vUv.y);
      float bentX = delta.x + sin(downward * 82.0 + float(index) * 1.7) * downward * 0.16;
      float plumeWidth = 0.006 + downward * (0.10 + age * 0.11);
      float plume = step(0.0, uBursts[index].y - vUv.y)
        * exp(-downward / (0.018 + age * 0.085))
        * exp(-(bentX * bentX) / (plumeWidth * plumeWidth));
      float blackInk = step(1.0, colorIndex);

      vec2 inkHead = vec2(
        uBursts[index].x + sin(age * 8.0 + float(index)) * (0.004 + age * 0.014),
        uBursts[index].y + 0.012 + age * 0.052
      );
      vec2 headDelta = vUv - inkHead;
      headDelta.x *= uAspect;
      float headDistance = length(headDelta);
      float headRadius = 0.014 + age * 0.044;
      float headAngle = atan(headDelta.y, headDelta.x);
      float cauliflower = 0.62 + 0.38 * sin(
        headAngle * 7.0 + headDistance * 155.0 - age * 13.0
      );
      float mainBillow = exp(-dot(headDelta, headDelta) / (headRadius * headRadius)) * cauliflower;

      float lobeSpread = 0.008 + age * 0.026;
      vec2 leftLobeDelta = vUv - (inkHead + vec2(-lobeSpread / uAspect, -headRadius * 0.18));
      vec2 rightLobeDelta = vUv - (inkHead + vec2(lobeSpread / uAspect, headRadius * 0.12));
      leftLobeDelta.x *= uAspect;
      rightLobeDelta.x *= uAspect;
      float lobeRadius = headRadius * 0.67;
      float leftLobe = exp(-dot(leftLobeDelta, leftLobeDelta) / (lobeRadius * lobeRadius));
      float rightLobe = exp(-dot(rightLobeDelta, rightLobeDelta) / (lobeRadius * lobeRadius));

      float blackDownward = max(0.0, vUv.y - uBursts[index].y);
      float threadLimit = 0.018 + age * 0.064;
      float threadMask = step(0.0, vUv.y - uBursts[index].y) * step(blackDownward, threadLimit);
      float threadWidth = 0.0023 + age * 0.0022;
      float threadX = delta.x + sin(blackDownward * 116.0 + age * 11.0) * (0.0015 + blackDownward * 0.046);
      float threadTexture = 0.66 + 0.34 * sin(blackDownward * 255.0 - age * 17.0);
      float thread = threadMask
        * exp(-(threadX * threadX) / (threadWidth * threadWidth))
        * threadTexture;
      float curledRim = exp(-pow(headDistance - headRadius * 0.88, 2.0) / (headRadius * headRadius * 0.045))
        * (0.5 + 0.5 * sin(headAngle * 5.0 - age * 16.0));
      float blackShape = thread * 0.9 + mainBillow + leftLobe * 0.7 + rightLobe * 0.72 + curledRim * 0.34;
      float sourceShape = mix(cloud + plume * 0.42, blackShape, blackInk);
      float amount = sourceShape * uBursts[index].z * mix(1.35, 2.18, blackInk);
      vec3 color = fingerColor(colorIndex);
      float oldAlpha = ink.a;
      float newAlpha = oldAlpha + amount * (1.0 - oldAlpha);
      vec3 oldColor = ink.rgb / max(0.01, oldAlpha);
      vec3 mixedColor = mix(oldColor, color, clamp(amount * mix(1.0, 2.4, blackInk), 0.0, 1.0));
      ink.rgb = mixedColor * newAlpha;
      ink.a = newAlpha;
    }

    gl_FragColor = clamp(ink, 0.0, 1.0);
  }
`

const renderFragmentSource = `
  precision mediump float;
  varying vec2 vUv;
  uniform sampler2D uVideo;
  uniform sampler2D uState;
  uniform sampler2D uInk;
  uniform vec2 uTexel;
  uniform vec2 uVideoScale;
  uniform vec2 uVideoOffset;
  uniform float uCameraReady;

  void main() {
    float center = texture2D(uState, vUv).r;
    float left = texture2D(uState, vUv - vec2(uTexel.x, 0.0)).r;
    float right = texture2D(uState, vUv + vec2(uTexel.x, 0.0)).r;
    float down = texture2D(uState, vUv - vec2(0.0, uTexel.y)).r;
    float up = texture2D(uState, vUv + vec2(0.0, uTexel.y)).r;
    vec2 slope = vec2(right - left, up - down);
    float energy = min(1.0, length(slope) * 38.0);
    float curvature = abs(left + right + down + up - center * 4.0);

    vec2 refracted = clamp(vUv + slope * 2.25, 0.003, 0.997);
    vec2 cameraUv = uVideoOffset + refracted * uVideoScale;
    cameraUv.x = 1.0 - cameraUv.x;
    vec3 camera = texture2D(uVideo, cameraUv).rgb;
    vec3 idle = mix(vec3(0.025, 0.075, 0.09), vec3(0.08, 0.19, 0.21), vUv.y);
    vec3 color = mix(idle, camera, uCameraReady);

    vec4 ink = texture2D(uInk, refracted);
    float inkAmount = smoothstep(0.002, 0.22, ink.a);
    vec3 inkColor = ink.rgb / max(0.018, ink.a);
    vec3 richInk = pow(clamp(inkColor, 0.0, 1.0), vec3(0.72)) * 1.18;
    color = mix(color, richInk, inkAmount * 0.92);
    color += richInk * inkAmount * 0.16;

    vec3 normal = normalize(vec3(-slope.x * 23.0, -slope.y * 23.0, 1.0));
    vec3 light = normalize(vec3(-0.45, 0.7, 0.62));
    float glint = pow(max(0.0, dot(normal, light)), 18.0) * energy;
    float brightRidge = smoothstep(0.008, 0.044, curvature) * energy;
    color += vec3(0.1, 0.32, 0.37) * energy * 0.34;
    color += vec3(0.64, 0.96, 1.0) * (glint * 0.75 + brightRidge * 0.28);
    color -= vec3(0.02, 0.08, 0.09) * smoothstep(0.015, 0.07, -slope.y);
    color *= 0.92 + 0.08 * smoothstep(0.0, 0.8, vUv.y);
    gl_FragColor = vec4(color, 1.0);
  }
`

function compileShader(type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Could not create WebGL shader.')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'Could not compile WebGL shader.')
  }
  return shader
}

function createProgram(fragmentSource: string) {
  const program = gl.createProgram()
  if (!program) throw new Error('Could not create WebGL program.')
  gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShaderSource))
  gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSource))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'Could not link WebGL program.')
  }
  return program
}

function uniform(program: WebGLProgram, name: string) {
  const location = gl.getUniformLocation(program, name)
  if (location === null) throw new Error(`Missing WebGL uniform: ${name}`)
  return location
}

const simulationProgram = createProgram(simulationFragmentSource)
const inkProgram = createProgram(inkFragmentSource)
const renderProgram = createProgram(renderFragmentSource)
const simulationUniforms = {
  state: uniform(simulationProgram, 'uState'),
  texel: uniform(simulationProgram, 'uTexel'),
  aspect: uniform(simulationProgram, 'uAspect'),
  touches: uniform(simulationProgram, 'uTouches[0]'),
}
const inkUniforms = {
  ink: uniform(inkProgram, 'uInk'),
  state: uniform(inkProgram, 'uState'),
  texel: uniform(inkProgram, 'uTexel'),
  aspect: uniform(inkProgram, 'uAspect'),
  time: uniform(inkProgram, 'uTime'),
  fade: uniform(inkProgram, 'uFade'),
  bursts: uniform(inkProgram, 'uBursts[0]'),
}
const renderUniforms = {
  video: uniform(renderProgram, 'uVideo'),
  state: uniform(renderProgram, 'uState'),
  ink: uniform(renderProgram, 'uInk'),
  texel: uniform(renderProgram, 'uTexel'),
  videoScale: uniform(renderProgram, 'uVideoScale'),
  videoOffset: uniform(renderProgram, 'uVideoOffset'),
  cameraReady: uniform(renderProgram, 'uCameraReady'),
}
const simulationPosition = gl.getAttribLocation(simulationProgram, 'aPosition')
const inkPosition = gl.getAttribLocation(inkProgram, 'aPosition')
const renderPosition = gl.getAttribLocation(renderProgram, 'aPosition')
const positionBuffer = gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)

const simulationSize = lowPowerDevice ? 160 : 256
const touchData = new Float32Array(40)
const inkBurstData = new Float32Array(40)
const visibleDotFlags = new Uint8Array(10)
let lastUploadedVideoTime = -1

function makeTexture(widthValue: number, heightValue: number, data: Uint8Array | null = null) {
  const texture = gl.createTexture()
  if (!texture) throw new Error('Could not create WebGL texture.')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, widthValue, heightValue, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
  return texture
}

function makeFramebuffer(texture: WebGLTexture) {
  const framebuffer = gl.createFramebuffer()
  if (!framebuffer) throw new Error('Could not create WebGL framebuffer.')
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  return framebuffer
}

const calmState = new Uint8Array(simulationSize * simulationSize * 4)
for (let index = 0; index < calmState.length; index += 4) {
  calmState[index] = 128
  calmState[index + 1] = 128
  calmState[index + 2] = 128
  calmState[index + 3] = 255
}

let stateTextureA = makeTexture(simulationSize, simulationSize, calmState)
let stateTextureB = makeTexture(simulationSize, simulationSize, calmState)
let stateFramebufferA = makeFramebuffer(stateTextureA)
let stateFramebufferB = makeFramebuffer(stateTextureB)
let inkTextureA = makeTexture(simulationSize, simulationSize)
let inkTextureB = makeTexture(simulationSize, simulationSize)
let inkFramebufferA = makeFramebuffer(inkTextureA)
let inkFramebufferB = makeFramebuffer(inkTextureB)
const videoTexture = makeTexture(2, 2, new Uint8Array([
  8, 25, 30, 255, 8, 25, 30, 255,
  8, 25, 30, 255, 8, 25, 30, 255,
]))
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)

function bindQuad(location: number) {
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.enableVertexAttribArray(location)
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
}

function resize() {
  width = innerWidth
  height = innerHeight
  const pixelBudget = lowPowerDevice ? 3_200_000 : 8_300_000
  const budgetScale = Math.sqrt(pixelBudget / Math.max(1, width * height))
  dpr = Math.min(devicePixelRatio || 1, 2, Math.max(1, budgetScale))
  canvas.width = Math.max(1, Math.round(width * dpr))
  canvas.height = Math.max(1, Math.round(height * dpr))
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
}

function setStatus(message: string, state: 'loading' | 'ready' | 'error') {
  if (trackingCopy.textContent !== message) trackingCopy.textContent = message
  trackingStatus.classList.toggle('ready', state === 'ready')
  trackingStatus.classList.toggle('error', state === 'error')
}

async function setupTracking() {
  const vision = await FilesetResolver.forVisionTasks(`${import.meta.env.BASE_URL}lemonade/mediapipe`)
  const options = {
    runningMode: 'VIDEO' as const,
    numHands: 2,
    minHandDetectionConfidence: .52,
    minHandPresenceConfidence: .48,
    minTrackingConfidence: .48,
  }
  try {
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}lemonade/mediapipe/hand_landmarker.task`, delegate: 'GPU' },
    })
  } catch {
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      ...options,
      baseOptions: { modelAssetPath: `${import.meta.env.BASE_URL}lemonade/mediapipe/hand_landmarker.task`, delegate: 'CPU' },
    })
  }
}

async function startExperience() {
  startButton.disabled = true
  startButton.textContent = '물 표면 준비 중…'
  errorPanel.hidden = true
  setStatus('Loading 10-finger tracking', 'loading')
  try {
    const desiredWidth = lowPowerDevice
      ? 1920
      : Math.min(3840, Math.max(2560, Math.round(Math.max(canvas.width, canvas.height) * 1.2)))
    const desiredHeight = Math.round(desiredWidth * 9 / 16)
    const [stream] = await Promise.all([
      navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: desiredWidth },
          height: { ideal: desiredHeight },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      }),
      handLandmarker ? Promise.resolve() : setupTracking(),
    ])
    const cameraTrack = stream.getVideoTracks()[0]
    const capabilities = cameraTrack.getCapabilities?.()
    if (capabilities?.width && capabilities.height) {
      try {
        await cameraTrack.applyConstraints({
          width: { ideal: Math.min(desiredWidth, capabilities.width.max) },
          height: { ideal: Math.min(desiredHeight, capabilities.height.max) },
          frameRate: { ideal: Math.min(30, capabilities.frameRate?.max ?? 30) },
        })
      } catch {
        // Keep the best resolution selected by the browser when a camera rejects an upgrade.
      }
    }
    video.srcObject = stream
    await video.play()
    resize()
    cameraResolution = `${video.videoWidth}×${video.videoHeight}`
    cameraReady = true
    lastTipCount = -1
    welcome.classList.add('hidden')
    setStatus(`${cameraResolution} · show both hands`, 'ready')
  } catch (error) {
    const denied = error instanceof DOMException && error.name === 'NotAllowedError'
    errorCopy.textContent = denied
      ? '카메라 권한이 차단되었습니다. 주소창의 카메라 설정에서 권한을 허용해 주세요.'
      : '카메라 또는 손 인식 모델을 준비하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.'
    errorPanel.hidden = false
    setStatus('Camera unavailable', 'error')
  } finally {
    startButton.disabled = false
    startButton.textContent = '카메라 켜기'
  }
}

function screenPoint(landmark: NormalizedLandmark): Point {
  const sourceWidth = video.videoWidth || 1280
  const sourceHeight = video.videoHeight || 720
  const scale = Math.max(width / sourceWidth, height / sourceHeight)
  const renderedWidth = sourceWidth * scale
  const renderedHeight = sourceHeight * scale
  const cropX = (renderedWidth - width) * .5
  const cropY = (renderedHeight - height) * .5
  return {
    x: width - (landmark.x * renderedWidth - cropX),
    y: landmark.y * renderedHeight - cropY,
  }
}

function releaseBlackDrop(point: Point) {
  if (blackDrops.length >= 2) blackDrops.shift()
  blackDrops.push({ ...point, strength: 1, age: 0 })

  window.clearTimeout(snapToastTimer)
  snapToast.classList.remove('show')
  void snapToast.offsetWidth
  snapToast.classList.add('show')
  snapToastTimer = window.setTimeout(() => snapToast.classList.remove('show'), 900)

  const droplet = document.createElement('b')
  droplet.className = 'black-droplet'
  droplet.style.left = `${point.x}px`
  droplet.style.top = `${point.y}px`
  document.querySelector<HTMLElement>('#tip-layer')!.append(droplet)
  const animation = droplet.animate([
    { transform: 'translate(-50%, -14px) scale(.42)', opacity: 0 },
    { transform: 'translate(-50%, 0) scale(1)', opacity: 1, offset: .25 },
    { transform: 'translate(-50%, 31px) scale(.9)', opacity: .98, offset: .78 },
    { transform: 'translate(-50%, 46px) scale(2.5)', opacity: 0 },
  ], { duration: 880, easing: 'cubic-bezier(.24,.58,.2,1)' })
  animation.addEventListener('finish', () => droplet.remove(), { once: true })
}

function updateSnap(handedness: string, landmarks: NormalizedLandmark[], palmSpan: number, now: number) {
  const thumb = landmarks[4]
  const middle = landmarks[12]
  const gap = Math.hypot(thumb.x - middle.x, thumb.y - middle.y) / Math.max(.035, palmSpan)
  const existing = snapStates.get(handedness)
  if (!existing) {
    snapStates.set(handedness, {
      pinched: gap < .52,
      primedAt: now,
      lastGap: gap,
      lastSeen: now,
      cooldownUntil: now,
    })
    return
  }

  const elapsed = Math.max(.016, (now - existing.lastSeen) / 1000)
  const separationSpeed = (gap - existing.lastGap) / elapsed
  if (!existing.pinched && gap < .52 && now >= existing.cooldownUntil) {
    existing.pinched = true
    existing.primedAt = now
  }
  if (
    existing.pinched
    && gap > .68
    && separationSpeed > .85
    && now - existing.primedAt < 1_200
    && now >= existing.cooldownUntil
  ) {
    releaseBlackDrop(screenPoint(middle))
    existing.pinched = false
    existing.cooldownUntil = now + 720
  }
  if (existing.pinched && now - existing.primedAt > 1_300) existing.pinched = false
  existing.lastGap = gap
  existing.lastSeen = now
}

function readHands(result: HandLandmarkerResult, now: number) {
  const visibleKeys = new Set<string>()
  result.landmarks.forEach((landmarks, handIndex) => {
    const handedness = result.handedness[handIndex]?.[0]?.categoryName?.toLowerCase() || `hand-${handIndex}`
    const imagePalmSpan = Math.hypot(
      landmarks[5].x - landmarks[17].x,
      landmarks[5].y - landmarks[17].y,
    )
    const proximity = Math.min(1, Math.max(0, (imagePalmSpan - .065) / .235))
    updateSnap(handedness, landmarks, imagePalmSpan, now)
    fingertipIndices.forEach((landmarkIndex, fingerIndex) => {
      const key = `${handedness}-${fingerIndex}`
      const point = screenPoint(landmarks[landmarkIndex])
      const colorIndex = (handedness === 'left' ? 0 : 5) + fingerIndex
      const current = tips.get(key)
      if (current) {
        const elapsed = Math.max(.016, (now - current.lastSeen) / 1000)
        const movement = Math.hypot(point.x - current.targetX, point.y - current.targetY)
        current.previousX = current.targetX
        current.previousY = current.targetY
        current.targetX = point.x
        current.targetY = point.y
        current.targetProximity = proximity
        current.velocity = current.velocity * .38 + (movement / Math.max(width, height) / elapsed) * .62
        current.lastSeen = now
      } else {
        tips.set(key, {
          x: point.x,
          y: point.y,
          targetX: point.x,
          targetY: point.y,
          previousX: point.x,
          previousY: point.y,
          velocity: .68,
          lastSeen: now,
          phase: Math.random() * Math.PI * 2,
          colorIndex,
          proximity,
          targetProximity: proximity,
        })
      }
      visibleKeys.add(key)
    })
  })

  for (const [key, tip] of tips) {
    if (!visibleKeys.has(key) && now - tip.lastSeen > 180) tips.delete(key)
  }
}

function updateTracking(now: number) {
  const interval = lowPowerDevice ? 68 : 52
  if (!cameraReady || !handLandmarker || video.readyState < 2 || video.currentTime === lastVideoTime || now - lastInferenceAt < interval) return
  lastInferenceAt = now
  lastVideoTime = video.currentTime
  try {
    readHands(handLandmarker.detectForVideo(video, now), now)
  } catch {
    // Keep the latest stable landmarks when an inference frame is dropped.
  }
}

function simulationPass(now: number, delta: number) {
  touchData.fill(0)
  visibleDotFlags.fill(0)
  let index = 0
  for (const tip of tips.values()) {
    if (index >= 10) break
    const easing = 1 - Math.pow(.0005, delta)
    tip.x += (tip.targetX - tip.x) * easing
    tip.y += (tip.targetY - tip.y) * easing
    tip.proximity += (tip.targetProximity - tip.proximity) * Math.min(1, easing * .72)
    tip.velocity *= Math.pow(.12, delta)
    const dot = tipDots[tip.colorIndex]
    if (dot) {
      dot.style.transform = `translate3d(${tip.x}px, ${tip.y}px, 0)`
      visibleDotFlags[tip.colorIndex] = 1
    }
    const movement = Math.min(2.8, tip.velocity)
    const pulse = Math.sin(now * .014 + tip.phase)
    const proximityBoost = 1.25 + tip.proximity * 3.15
    const rawStrength = (.0085 * pulse + .019 * movement) * proximityBoost
    const strength = Math.min(.12, Math.max(-.09, rawStrength)) * Math.min(1, delta * 60)
    touchData[index * 4] = tip.x / Math.max(1, width)
    touchData[index * 4 + 1] = 1 - tip.y / Math.max(1, height)
    touchData[index * 4 + 2] = strength
    touchData[index * 4 + 3] = .025 + tip.proximity * .024 + Math.min(.018, movement * .007)
    index += 1
  }
  tipDots.forEach((dot, dotIndex) => dot.classList.toggle('visible', visibleDotFlags[dotIndex] === 1))

  if (index !== lastTipCount) {
    lastTipCount = index
    setStatus(index ? `${cameraResolution} · ${index}/10 fingertips` : `${cameraResolution} · show both hands`, 'ready')
    gestureHint.classList.toggle('active', index > 0)
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, stateFramebufferB)
  gl.viewport(0, 0, simulationSize, simulationSize)
  gl.useProgram(simulationProgram)
  bindQuad(simulationPosition)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, stateTextureA)
  gl.uniform1i(simulationUniforms.state, 0)
  gl.uniform2f(simulationUniforms.texel, 1 / simulationSize, 1 / simulationSize)
  gl.uniform1f(simulationUniforms.aspect, width / Math.max(1, height))
  gl.uniform4fv(simulationUniforms.touches, touchData)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  ;[stateTextureA, stateTextureB] = [stateTextureB, stateTextureA]
  ;[stateFramebufferA, stateFramebufferB] = [stateFramebufferB, stateFramebufferA]
}

function inkPass(delta: number, now: number) {
  if (tips.size === 0 && now - lastInkAt > 1_100) {
    if (!inkCleared) {
      gl.clearColor(0, 0, 0, 0)
      gl.bindFramebuffer(gl.FRAMEBUFFER, inkFramebufferA)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.bindFramebuffer(gl.FRAMEBUFFER, inkFramebufferB)
      gl.clear(gl.COLOR_BUFFER_BIT)
      inkCleared = true
    }
    return
  }
  inkBurstData.fill(0)
  let slot = 0
  const blackSlotCount = Math.min(2, blackDrops.length)
  const colorSlotLimit = 10 - blackSlotCount
  for (const tip of tips.values()) {
    if (slot >= colorSlotLimit) break
    const movement = Math.min(2.5, tip.velocity)
    const leakStrength = (.105 + movement * .048) * (.9 + tip.proximity * .72)
    const plumeAge = .65 + Math.sin(now * .0013 + tip.phase) * .14
    inkBurstData[slot * 4] = tip.x / Math.max(1, width)
    inkBurstData[slot * 4 + 1] = 1 - tip.y / Math.max(1, height)
    inkBurstData[slot * 4 + 2] = leakStrength * Math.min(1, delta * 60)
    inkBurstData[slot * 4 + 3] = (tip.colorIndex + plumeAge) / 10
    slot += 1
  }
  for (let index = Math.max(0, blackDrops.length - 2); index < blackDrops.length && slot < 10; index += 1) {
    const drop = blackDrops[index]
    inkBurstData[slot * 4] = drop.x / Math.max(1, width)
    inkBurstData[slot * 4 + 1] = 1 - drop.y / Math.max(1, height)
    inkBurstData[slot * 4 + 2] = drop.strength * .36 * Math.min(1, delta * 60)
    inkBurstData[slot * 4 + 3] = (10 + Math.min(.99, drop.age)) / 10
    drop.strength *= Math.pow(.06, delta)
    drop.age += delta * .68
    slot += 1
  }
  for (let index = blackDrops.length - 1; index >= 0; index -= 1) {
    if (blackDrops[index].strength < .008) blackDrops.splice(index, 1)
  }
  if (tips.size > 0) {
    lastInkAt = now
    inkCleared = false
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, inkFramebufferB)
  gl.viewport(0, 0, simulationSize, simulationSize)
  gl.useProgram(inkProgram)
  bindQuad(inkPosition)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, inkTextureA)
  gl.uniform1i(inkUniforms.ink, 0)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, stateTextureA)
  gl.uniform1i(inkUniforms.state, 1)
  gl.uniform2f(inkUniforms.texel, 1 / simulationSize, 1 / simulationSize)
  gl.uniform1f(inkUniforms.aspect, width / Math.max(1, height))
  gl.uniform1f(inkUniforms.time, now)
  gl.uniform1f(inkUniforms.fade, tips.size > 0 ? .9955 : .936)
  gl.uniform4fv(inkUniforms.bursts, inkBurstData)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  ;[inkTextureA, inkTextureB] = [inkTextureB, inkTextureA]
  ;[inkFramebufferA, inkFramebufferB] = [inkFramebufferB, inkFramebufferA]
}

function videoCrop() {
  const sourceAspect = (video.videoWidth || 1280) / (video.videoHeight || 720)
  const screenAspect = width / Math.max(1, height)
  if (sourceAspect > screenAspect) {
    const scaleX = screenAspect / sourceAspect
    return { scaleX, scaleY: 1, offsetX: (1 - scaleX) * .5, offsetY: 0 }
  }
  const scaleY = sourceAspect / screenAspect
  return { scaleX: 1, scaleY, offsetX: 0, offsetY: (1 - scaleY) * .5 }
}

function renderCamera() {
  if (cameraReady && video.readyState >= 2 && video.currentTime !== lastUploadedVideoTime) {
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, videoTexture)
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
      lastUploadedVideoTime = video.currentTime
    } catch {
      // The previous texture remains visible if a mobile browser skips a frame.
    }
  }

  const crop = videoCrop()
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, canvas.width, canvas.height)
  gl.useProgram(renderProgram)
  bindQuad(renderPosition)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, videoTexture)
  gl.uniform1i(renderUniforms.video, 0)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, stateTextureA)
  gl.uniform1i(renderUniforms.state, 1)
  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, inkTextureA)
  gl.uniform1i(renderUniforms.ink, 2)
  gl.uniform2f(renderUniforms.texel, 1 / simulationSize, 1 / simulationSize)
  gl.uniform2f(renderUniforms.videoScale, crop.scaleX, crop.scaleY)
  gl.uniform2f(renderUniforms.videoOffset, crop.offsetX, crop.offsetY)
  gl.uniform1f(renderUniforms.cameraReady, cameraReady ? 1 : 0)
  gl.drawArrays(gl.TRIANGLES, 0, 6)
}

function frame(now: number) {
  const delta = Math.min(.033, Math.max(.001, (now - lastFrameAt) / 1000))
  lastFrameAt = now
  if (!document.hidden) {
    updateTracking(now)
    simulationPass(now, delta)
    inkPass(delta, now)
    renderCamera()
  }
  requestAnimationFrame(frame)
}

startButton.addEventListener('click', startExperience)
retryButton.addEventListener('click', startExperience)
window.addEventListener('resize', resize)
window.addEventListener('interactivecaptureprepare', renderCamera)
document.addEventListener('visibilitychange', () => {
  const stream = video.srcObject instanceof MediaStream ? video.srcObject : null
  stream?.getVideoTracks().forEach((track) => { track.enabled = !document.hidden })
  if (document.hidden) video.pause()
  else if (cameraReady) void video.play()
})
window.addEventListener('pagehide', () => {
  const stream = video.srcObject instanceof MediaStream ? video.srcObject : null
  stream?.getTracks().forEach((track) => track.stop())
  handLandmarker?.close()
})

resize()
requestAnimationFrame(frame)
