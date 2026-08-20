import { useEffect, useRef } from 'react'

export interface DunesProps {
  className?: string
  speed?: number
  amplitude?: number
  frequency?: number
  layers?: number
  interactive?: boolean
  colors?: string[]
}

function darkenColor(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) * (1 - amount))
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) * (1 - amount))
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) * (1 - amount))
  return `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

interface SandParticle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  life: number
  maxLife: number
  alpha: number
  phase: number
  trail: number
}

const GUST_DIRECTIONS = [
  -0.26,
  -0.1,
  0.08,
  0.24,
  Math.PI - 0.25,
  Math.PI - 0.08,
  Math.PI + 0.1,
  Math.PI + 0.26,
]

function angleDistance(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))
}

export default function Dunes({
  className = '',
  speed = 0.18,
  amplitude = 80,
  frequency = 0.0018,
  layers = 5,
  interactive = true,
  colors = [
    '#171108',
    '#241909',
    '#35250d',
    '#4a3412',
    '#6a4c1c',
  ],
}: DunesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animRef = useRef<number>(0)
  const pointer = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 })
  const params = useRef({ width: 0, height: 0, dpr: 1 })
  const layerParams = useRef<{
    baseY: number
    layerAmplitude: number
    layerFrequency: number
    layerSpeed: number
    phase: number
    phase2: number
    phase3: number
    offset: number
    color: string
  }[]>([])
  const reducedMotion = useRef(false)
  const visible = useRef(true)
  const startTime = useRef(0)
  const grainCanvas = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const c = container!
    const cv = canvas!
    const cx = ctx!

    const particles: SandParticle[] = []
    let nextGustAt = 2
    let gustEndsAt = 0
    let gustAngle: number | null = null
    let gustStrength = 1
    let spawnCarry = 0
    let lastFrameTime = 0

    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    function setupGrain() {
      const gc = document.createElement('canvas')
      gc.width = 128
      gc.height = 128
      const gctx = gc.getContext('2d')
      if (!gctx) return
      const imgData = gctx.createImageData(128, 128)
      for (let i = 0; i < imgData.data.length; i += 4) {
        const v = Math.random() * 255
        imgData.data[i] = v
        imgData.data[i + 1] = v
        imgData.data[i + 2] = v
        imgData.data[i + 3] = 255
      }
      gctx.putImageData(imgData, 0, 0)
      grainCanvas.current = gc
    }

    function resize() {
      const rect = c.getBoundingClientRect()
      const w = rect.width
      const h = rect.height
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      params.current = { width: w, height: h, dpr }
      cv.width = Math.floor(w * dpr)
      cv.height = Math.floor(h * dpr)
      cv.style.width = `${w}px`
      cv.style.height = `${h}px`
      cx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const lc = layers
      layerParams.current = []
      for (let i = 0; i < lc; i++) {
        const depth = i / Math.max(lc - 1, 1)
        const color = colors[i % colors.length]
        layerParams.current.push({
          baseY: h * (0.45 + depth * 0.19),
          layerAmplitude: amplitude * (0.45 + depth * 0.55),
          layerFrequency: frequency * (0.75 + depth * 0.35),
          layerSpeed: speed * (0.35 + depth * 0.65),
          phase: i * 2.3,
          phase2: i * 1.7 + 0.5,
          phase3: i * 0.9 + 1.2,
          offset: i * 30,
          color,
        })
      }
    }

    setupGrain()
    resize()

    const ro = new ResizeObserver(resize)
    ro.observe(c)

    function beginGust(elapsed: number) {
      const candidates = gustAngle === null
        ? GUST_DIRECTIONS
        : GUST_DIRECTIONS.filter((angle) => angleDistance(angle, gustAngle!) > Math.PI / 3)

      gustAngle = candidates[Math.floor(Math.random() * candidates.length)]
      gustStrength = 0.82 + Math.random() * 0.38
      gustEndsAt = elapsed + 1.15 + Math.random() * 0.7
      nextGustAt = gustEndsAt + 2.4 + Math.random() * 3.6
      spawnCarry = 0
    }

    function spawnParticle(width: number, height: number, angle: number) {
      const directionJitter = (Math.random() - 0.5) * 0.22
      const particleAngle = angle + directionJitter
      const dx = Math.cos(particleAngle)
      const dy = Math.sin(particleAngle)
      const x = dx > 0 ? -12 : width + 12
      const y = height * (0.12 + Math.random() * 0.72)
      const speed = (115 + Math.min(width, 1400) * 0.14) * gustStrength * (0.76 + Math.random() * 0.62)
      const maxLife = 1.8 + Math.random() * 2.2

      particles.push({
        x,
        y,
        vx: dx * speed,
        vy: dy * speed,
        size: 0.3 + Math.random() * 0.7,
        life: maxLife,
        maxLife,
        alpha: 0.11 + Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2,
        trail: 1.2 + Math.random() * 4.2,
      })
    }

    function drawSand(elapsed: number, delta: number) {
      const { width, height } = params.current

      if (elapsed >= nextGustAt && elapsed >= gustEndsAt) beginGust(elapsed)

      if (gustAngle !== null && elapsed < gustEndsAt) {
        const spawnRate = width < 640 ? 48 : width < 1200 ? 78 : 112
        spawnCarry += spawnRate * delta
        const amount = Math.floor(spawnCarry)
        spawnCarry -= amount
        for (let i = 0; i < amount; i++) spawnParticle(width, height, gustAngle)
      }

      cx.save()
      cx.globalCompositeOperation = 'screen'
      cx.lineCap = 'round'

      for (let i = particles.length - 1; i >= 0; i--) {
        const particle = particles[i]
        particle.life -= delta

        if (
          particle.life <= 0 ||
          particle.x < -80 || particle.x > width + 80 ||
          particle.y < -80 || particle.y > height + 80
        ) {
          particles.splice(i, 1)
          continue
        }

        particle.x += particle.vx * delta
        particle.y += particle.vy * delta + Math.sin(elapsed * 4.2 + particle.phase) * 13 * delta

        const age = particle.maxLife - particle.life
        const fade = Math.min(1, age / 0.18, particle.life / 0.42)
        const speed = Math.hypot(particle.vx, particle.vy) || 1
        const tx = (particle.vx / speed) * particle.trail
        const ty = (particle.vy / speed) * particle.trail

        cx.beginPath()
        cx.moveTo(particle.x - tx, particle.y - ty)
        cx.lineTo(particle.x, particle.y)
        cx.strokeStyle = `rgba(246, 211, 101, ${particle.alpha * fade})`
        cx.lineWidth = particle.size
        cx.stroke()
      }

      cx.restore()
    }

    function draw(timestamp: number) {
      if (!visible.current) return

      if (reducedMotion.current) {
        drawStatic()
        return
      }

      if (!startTime.current) startTime.current = timestamp
      const elapsed = (timestamp - startTime.current) / 1000
      const delta = lastFrameTime ? Math.min((timestamp - lastFrameTime) / 1000, 0.05) : 0
      lastFrameTime = timestamp

      const { width, height } = params.current
      cx.clearRect(0, 0, width, height)

      const bg = cx.createLinearGradient(0, 0, 0, height)
      bg.addColorStop(0, '#080705')
      bg.addColorStop(0.5, '#110d06')
      bg.addColorStop(1, '#030302')
      cx.fillStyle = bg
      cx.fillRect(0, 0, width, height)

      cx.save()
      cx.strokeStyle = 'rgba(246, 211, 101, 0.032)'
      cx.lineWidth = 0.7
      for (let line = 0; line < 10; line++) {
        cx.beginPath()
        for (let x = -20; x <= width * 0.68; x += 18) {
          const y = height * 0.16 + line * 15 + Math.sin(x * 0.008 + line * 0.72) * (18 + line * 1.8)
          if (x === -20) cx.moveTo(x, y)
          else cx.lineTo(x, y)
        }
        cx.stroke()
      }
      cx.restore()

      const px = pointer.current.x
      const py = pointer.current.y
      const sunProgress = (Math.sin(elapsed * Math.PI / 55 - Math.PI / 2) + 1) / 2
      const sunX = width * (0.68 + sunProgress * 0.2) + px * 18
      const sunY = height * (0.2 - Math.sin(sunProgress * Math.PI) * 0.055) + py * 10

      const glow = cx.createRadialGradient(
        sunX, sunY, 0,
        sunX, sunY, width * 0.52
      )
      glow.addColorStop(0, 'rgba(255, 219, 126, 0.2)')
      glow.addColorStop(0.38, 'rgba(173, 118, 29, 0.065)')
      glow.addColorStop(1, 'transparent')
      cx.fillStyle = glow
      cx.fillRect(0, 0, width, height)

      const sunRadius = Math.max(2.5, Math.min(width, height) * 0.006)
      const sunCore = cx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius * 4)
      sunCore.addColorStop(0, 'rgba(255, 247, 204, 0.96)')
      sunCore.addColorStop(0.24, 'rgba(246, 211, 101, 0.72)')
      sunCore.addColorStop(1, 'rgba(246, 175, 62, 0)')
      cx.fillStyle = sunCore
      cx.beginPath()
      cx.arc(sunX, sunY, sunRadius * 4, 0, Math.PI * 2)
      cx.fill()

      for (let i = 0; i < layerParams.current.length; i++) {
        const lp = layerParams.current[i]
        const depth = i / Math.max(layers - 1, 1)
        const baseY = lp.baseY
        const amp = lp.layerAmplitude
        const freq = lp.layerFrequency
        const ls = lp.layerSpeed

        const gradient = cx.createLinearGradient(0, baseY - amp, 0, height)
        gradient.addColorStop(0, hexToRgba(lp.color, 0.9))
        gradient.addColorStop(0.3, lp.color)
        gradient.addColorStop(1, darkenColor(lp.color, 0.58))

        cx.beginPath()
        cx.moveTo(-10, height)

        const step = Math.max(3, width / 350)
        for (let x = 0; x <= width + 10; x += step) {
          const y =
            baseY +
            Math.sin(x * freq + elapsed * ls + lp.phase) * amp +
            Math.sin(x * freq * 0.47 - elapsed * ls * 0.6 + lp.phase2) * amp * 0.45 +
            Math.sin(x * freq * 1.73 + lp.phase3) * amp * 0.15 +
            lp.offset * 0.1
          cx.lineTo(x, y)
        }

        cx.lineTo(width + 10, height)
        cx.closePath()
        cx.fillStyle = gradient
        cx.fill()

        cx.strokeStyle = hexToRgba(colors[Math.min(i + 1, colors.length - 1)], 0.2 + depth * 0.16)
        cx.lineWidth = 0.75 + depth * 0.65
        cx.stroke()
      }

      drawSand(elapsed, delta)

      if (grainCanvas.current) {
        cx.save()
        cx.globalAlpha = 0.045
        const pattern = cx.createPattern(grainCanvas.current, 'repeat')
        if (pattern) {
          cx.fillStyle = pattern
          cx.fillRect(0, 0, width, height)
        }
        cx.restore()
      }

    }

    function drawStatic() {
      const { width, height } = params.current
      cx.clearRect(0, 0, width, height)

      const bg = cx.createLinearGradient(0, 0, 0, height)
      bg.addColorStop(0, '#080705')
      bg.addColorStop(0.5, '#110d06')
      bg.addColorStop(1, '#030302')
      cx.fillStyle = bg
      cx.fillRect(0, 0, width, height)

      for (let i = 0; i < layerParams.current.length; i++) {
        const lp = layerParams.current[i]
        const amp = lp.layerAmplitude
        const gradient = cx.createLinearGradient(0, lp.baseY - amp, 0, height)
        gradient.addColorStop(0, lp.color)
        gradient.addColorStop(1, darkenColor(lp.color, 0.5))

        cx.beginPath()
        cx.moveTo(-10, height)

        const step = Math.max(3, width / 350)
        for (let x = 0; x <= width + 10; x += step) {
          const y =
            lp.baseY +
            Math.sin(x * lp.layerFrequency + lp.phase) * amp * 0.6 +
            Math.sin(x * lp.layerFrequency * 0.47 + lp.phase2) * amp * 0.3 +
            Math.sin(x * lp.layerFrequency * 1.73 + lp.phase3) * amp * 0.1
          cx.lineTo(x, y)
        }

        cx.lineTo(width + 10, height)
        cx.closePath()
        cx.fillStyle = gradient
        cx.fill()
      }
    }

    function onPointerMove(e: PointerEvent) {
      if (!interactive || reducedMotion.current) return
      const rect = c.getBoundingClientRect()
      pointer.current.targetX = ((e.clientX - rect.left) / rect.width - 0.5) * 2
      pointer.current.targetY = ((e.clientY - rect.top) / rect.height - 0.5) * 2
    }

    function tickPointer() {
      pointer.current.x += (pointer.current.targetX - pointer.current.x) * 0.035
      pointer.current.y += (pointer.current.targetY - pointer.current.y) * 0.035
    }

    function animate(timestamp: number) {
      tickPointer()
      draw(timestamp)
      animRef.current = requestAnimationFrame(animate)
    }

    function onVisibilityChange() {
      if (document.hidden) {
        visible.current = false
        cancelAnimationFrame(animRef.current)
      } else {
        visible.current = true
        startTime.current = 0
        lastFrameTime = 0
        nextGustAt = 2
        gustEndsAt = 0
        particles.length = 0
        if (!reducedMotion.current) animRef.current = requestAnimationFrame(animate)
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pointermove', onPointerMove)

    if (!reducedMotion.current) {
      animRef.current = requestAnimationFrame(animate)
    } else {
      resize()
      setTimeout(drawStatic, 0)
    }

    return () => {
      cancelAnimationFrame(animRef.current)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pointermove', onPointerMove)
    }
  }, [speed, amplitude, frequency, layers, interactive, colors])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ pointerEvents: 'none', position: 'absolute', inset: 0, overflow: 'hidden' }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  )
}
