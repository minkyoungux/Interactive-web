import { distance, HAND_GRACE, mix } from './shampoo-geometry'
import type { Point } from './shampoo-geometry'

// A low-resolution frosted-glass layer. Wiping removes its alpha so the
// original video and interaction canvas show through at their full resolution.
export class FogGlass {
  private mask = document.createElement('canvas')
  private texture = document.createElement('canvas')
  private stamp = document.createElement('canvas')
  private maskCtx = this.mask.getContext('2d')!
  private ctx: CanvasRenderingContext2D
  private scale = 1
  private width = 0
  private height = 0
  private last: Point | null = null
  private lastAt = -Infinity
  private lastPaint = -Infinity
  wipeAt = -Infinity
  readonly canvas: HTMLCanvasElement
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.stamp.width = this.stamp.height = 128
    const g = this.stamp.getContext('2d')!
    const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, '#000'); gradient.addColorStop(.76, '#000')
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = gradient; g.fillRect(0, 0, 128, 128)
  }
  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return
    const hadSize = this.width > 0
    const previous = document.createElement('canvas')
    previous.width = this.mask.width; previous.height = this.mask.height
    if (this.width) previous.getContext('2d')!.drawImage(this.mask, 0, 0)
    this.width = width; this.height = height
    this.scale = Math.min(1, 900 / Math.max(width, height))
    const w = Math.max(1, Math.round(width * this.scale)), h = Math.max(1, Math.round(height * this.scale))
    this.canvas.width = this.mask.width = this.texture.width = w
    this.canvas.height = this.mask.height = this.texture.height = h
    this.maskCtx.setTransform(1, 0, 0, 1, 0, 0); this.maskCtx.globalCompositeOperation = 'source-over'
    if (hadSize) this.maskCtx.drawImage(previous, 0, 0, w, h)
    else { this.maskCtx.fillStyle = '#fff'; this.maskCtx.fillRect(0, 0, w, h) }
    // Fine condensation is baked once, rather than generated on every video frame.
    const g = this.texture.getContext('2d')!, pixels = g.createImageData(w, h)
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = Math.random(); pixels.data[i] = 222; pixels.data[i + 1] = 239; pixels.data[i + 2] = 242
      pixels.data[i + 3] = Math.round(19 + value * 13)
    }
    g.putImageData(pixels, 0, 0)
    g.fillStyle = 'rgba(245,253,255,.15)'
    for (let i = 0; i < w * h / 1500; i++) {
      const x = Math.random() * w, y = Math.random() * h, radius = .4 + Math.random() * 1.2
      g.beginPath(); g.ellipse(x, y, radius, radius * 1.35, 0, 0, Math.PI * 2); g.fill()
    }
    this.endStroke(); this.lastPaint = -Infinity
  }
  reset() {
    this.maskCtx.setTransform(1, 0, 0, 1, 0, 0); this.maskCtx.globalCompositeOperation = 'source-over'
    this.maskCtx.fillStyle = '#fff'; this.maskCtx.fillRect(0, 0, this.mask.width, this.mask.height)
    this.clear(); this.endStroke(); this.wipeAt = -Infinity
  }
  clear() { this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.lastPaint = -Infinity }
  endStroke() { this.last = null; this.lastAt = -Infinity }
  wipe(point: Point, radius: number, now: number): boolean {
    const d = this.last ? distance(this.last, point) : 0
    const previous = this.last && now - this.lastAt < HAND_GRACE && d < Math.max(this.width, this.height) * .55 ? this.last : null
    this.lastAt = now
    // Simply holding an open hand still doesn't erase the glass.
    if (!previous) { this.last = point; return false }
    if (d < 7) return false
    this.last = point
    const r = Math.max(42, Math.min(105, radius)) * this.scale
    const count = Math.max(1, Math.ceil(d * this.scale / (r * .25)))
    this.maskCtx.globalCompositeOperation = 'destination-out'
    for (let i = 0; i <= count; i++) {
      const p = mix(previous, point, i / count)
      this.maskCtx.drawImage(this.stamp, p.x * this.scale - r, p.y * this.scale - r, r * 2, r * 2)
    }
    this.maskCtx.globalCompositeOperation = 'source-over'
    this.wipeAt = now; this.lastPaint = -Infinity
    return true
  }
  paint(video: HTMLVideoElement, scene: HTMLCanvasElement, now: number) {
    if (now - this.lastPaint < 85 || video.readyState < 2 || !video.videoWidth) return
    this.lastPaint = now
    const g = this.ctx, w = this.canvas.width, h = this.canvas.height
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h)
    g.save()
    g.filter = 'blur(3px)'; g.globalAlpha = .93
    const scale = Math.max(w / video.videoWidth, h / video.videoHeight)
    const vw = video.videoWidth * scale, vh = video.videoHeight * scale
    g.translate((w + vw) / 2, (h - vh) / 2); g.scale(-1, 1)
    g.drawImage(video, 0, 0, vw, vh); g.restore()
    g.save(); g.filter = 'blur(3px)'; g.drawImage(scene, 0, 0, w, h); g.restore()
    g.drawImage(this.texture, 0, 0)
    g.globalCompositeOperation = 'destination-in'; g.drawImage(this.mask, 0, 0)
    g.globalCompositeOperation = 'source-over'
  }
}
