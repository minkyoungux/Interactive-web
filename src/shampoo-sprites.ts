const surface = (size: number) => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size
  return { canvas, g: canvas.getContext('2d')! }
}
export function foamSprites() {
  return Array.from({ length: 4 }, (_, variant) => {
    const { canvas, g } = surface(96)
    // A cushion of overlapping, creamy microfoam cells. There is no hollow
    // rainbow outline: these sprites are shampoo lather, not blown soap film.
    const lobes = [[29, 29, 21], [53, 24, 22], [72, 40, 18], [69, 65, 22], [40, 72, 20], [23, 53, 19], [47, 47, 29]]
    for (const [x, y, r] of lobes) {
      const fill = g.createRadialGradient(x - r * .27, y - r * .35, 1, x, y, r)
      fill.addColorStop(0, 'rgba(233,243,238,.86)')
      fill.addColorStop(.65, variant % 2 ? 'rgba(204,222,222,.8)' : 'rgba(210,228,221,.8)')
      fill.addColorStop(1, 'rgba(166,193,194,.68)')
      g.fillStyle = fill; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
    }
    g.fillStyle = 'rgba(250,255,248,.36)'
    for (const [x,y,r] of [[24,26,5],[51,19,5],[70,37,4],[37,41,6],[50,60,4]]) {
      g.beginPath(); g.ellipse(x, y, r, r * .55, -.4, 0, Math.PI * 2); g.fill()
    }
    return canvas
  })
}
export function soapSprites() {
  return Array.from({ length: 6 }, (_, variant) => {
    const { canvas, g } = surface(128)
    const hue = variant * 60
    const film = g.createRadialGradient(64, 64, 4, 64, 64, 55)
    film.addColorStop(0, 'rgba(255,255,255,0)'); film.addColorStop(.65, 'rgba(255,255,255,.008)')
    film.addColorStop(.85, `hsla(${hue},70%,82%,.025)`)
    film.addColorStop(.94, `hsla(${hue+140},75%,74%,.12)`)
    film.addColorStop(1, 'rgba(222,245,252,.3)')
    g.fillStyle = film; g.beginPath(); g.arc(64, 64, 55, 0, Math.PI * 2); g.fill()
    const rim = g.createConicGradient(variant * .7, 64, 64)
    for (let i = 0; i <= 12; i++) rim.addColorStop(i / 12, `hsla(${hue+i*30},85%,${i%3===0?92:74}%,${i%3===0?.95:.65})`)
    // Preserve a continuous film edge after downsampling to small screen sizes.
    g.strokeStyle = 'rgba(232,248,255,.4)'; g.lineWidth = 3.6; g.stroke()
    g.strokeStyle = rim; g.lineWidth = 2.8; g.stroke()
    // Broad, faint internal reflection and two sharp highlights make the rim
    // read as a spherical thin film while the center stays almost transparent.
    g.strokeStyle = `hsla(${hue+180},80%,80%,.22)`; g.lineWidth = 5
    g.beginPath(); g.arc(64, 64, 49, .1, 1.3); g.stroke()
    g.strokeStyle = 'rgba(255,255,255,.91)'; g.lineWidth = 2.7; g.lineCap = 'round'
    g.beginPath(); g.arc(64, 64, 47, 3.7, 4.65); g.stroke()
    g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1
    g.beginPath(); g.arc(64, 64, 52, 5.05, 5.65); g.stroke()
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(36, 32, 6, 2.7, -.7, 0, Math.PI * 2); g.fill()
    g.strokeStyle = `hsla(${hue+310},85%,82%,.68)`; g.lineWidth = 2
    g.beginPath(); g.arc(64, 64, 52, 1.35, 2.35); g.stroke()
    return canvas
  })
}
export function duckSprites() {
  return [false, true].map(chewing => {
    const { canvas, g } = surface(192)
    g.scale(2, 2)
    g.fillStyle = '#61798424'; g.beginPath(); g.ellipse(46, 79, 34, 5, 0, 0, Math.PI * 2); g.fill()
    const body = g.createLinearGradient(30, 38, 54, 80)
    body.addColorStop(0, '#fff080'); body.addColorStop(.45, '#ffd643'); body.addColorStop(1, '#e8a422')
    g.fillStyle = body
    g.beginPath(); g.moveTo(14, 58); g.quadraticCurveTo(5, 44, 10, 41); g.quadraticCurveTo(18, 52, 29, 49)
    g.bezierCurveTo(38, 35, 64, 38, 73, 57); g.bezierCurveTo(83, 80, 26, 86, 16, 69); g.closePath(); g.fill()
    const head = g.createRadialGradient(57, 29, 2, 67, 39, 22)
    head.addColorStop(0, '#fff49b'); head.addColorStop(.65, '#ffe25a'); head.addColorStop(1, '#f3bc2d')
    g.fillStyle = head; g.beginPath(); g.arc(63, 36, 20, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#f18c2b'; g.beginPath(); g.moveTo(77, 36); g.quadraticCurveTo(94, 36, 92, chewing ? 45 : 42)
    g.quadraticCurveTo(92, 50, 76, 46); g.closePath(); g.fill()
    g.strokeStyle = '#d96d24'; g.lineWidth = 1.3
    g.beginPath(); g.moveTo(79, 42); g.quadraticCurveTo(87, chewing ? 46 : 43, 91, 41); g.stroke()
    g.fillStyle = '#203d40'; g.beginPath(); g.arc(69, 30, 3.1, 0, Math.PI * 2); g.fill()
    g.fillStyle = 'white'; g.beginPath(); g.arc(69.7, 29, .9, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#fff9c488'; g.beginPath(); g.ellipse(54, 23, 7, 3.5, -.6, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#ffea69'; g.beginPath(); g.ellipse(42, 60, 17, 10, -.3, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#eab22a'; g.lineWidth = 1.3; g.beginPath(); g.ellipse(42, 60, 17, 10, -.3, .2, 2.8); g.stroke()
    g.fillStyle = '#fff6bca0'; g.beginPath(); g.ellipse(39, 56, 10, 3, -.35, 0, Math.PI * 2); g.fill()
    return canvas
  })
}
