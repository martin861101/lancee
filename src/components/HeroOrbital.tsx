import { useEffect, useRef } from 'react'
import BrandMark from './BrandMark'
import Icon, { type IconName } from './AppIcon'
import './hero-orbital.css'

type OrbitalNode = {
  id: string
  label: string
  value: string
  sub?: string
  icon: IconName
  angle: number
  radius: number
  speed: number
  accent?: 'violet' | 'blue' | 'pink' | 'lime'
  featured?: boolean
}

// Calm expensive orbital — deg/sec < 1.6, elliptical tilt 0.58
const NODES: OrbitalNode[] = [
  { id: 'clients', label: 'Clients', value: '12 active', icon: 'user', angle: 298, radius: 166, speed: 1.18, accent: 'violet' },
  { id: 'projects', label: 'Projects', value: '8 in progress', icon: 'briefcase', angle: 38, radius: 162, speed: -1.02, accent: 'violet' },
  { id: 'invoices', label: 'Invoices', value: 'R46,200', sub: '2 outstanding', icon: 'wallet', angle: 8, radius: 196, speed: 0.88, accent: 'pink', featured: true },
  { id: 'calendar', label: 'Calendar', value: '3 meetings today', icon: 'calendar', angle: 78, radius: 182, speed: 0.96, accent: 'blue' },
  { id: 'meetings', label: 'Meetings', value: 'In progress', icon: 'activity', angle: 220, radius: 174, speed: -0.84, accent: 'blue' },
  { id: 'mail', label: 'Mail', value: '5 unread', icon: 'messages', angle: 188, radius: 186, speed: 1.08, accent: 'lime' },
]

export default function HeroOrbital() {
  const stageRef = useRef<HTMLDivElement>(null)
  const coreRef = useRef<HTMLDivElement>(null)
  const coreInnerRef = useRef<HTMLDivElement>(null)
  const nodesWrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const linesGroupRef = useRef<SVGGElement>(null)
  const pulsesGroupRef = useRef<SVGGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const stage = stageRef.current
    const core = coreRef.current
    const coreInner = coreInnerRef.current
    const nodesWrap = nodesWrapRef.current
    const svg = svgRef.current
    const linesG = linesGroupRef.current
    const pulsesG = pulsesGroupRef.current
    const container = containerRef.current
    if (!stage || !core || !nodesWrap || !svg || !linesG || !pulsesG || !container) return

    const mReduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mCoarse = window.matchMedia('(pointer: coarse)')
    let prefersReduced = mReduced.matches
    let isCoarsePointer = mCoarse.matches
    const nodeEls = Array.from(nodesWrap.querySelectorAll<HTMLElement>('[data-orbital-node]'))

    // Create SVG lines + anchors once
    linesG.innerHTML = ''
    const lineEls: SVGLineElement[] = []
    const dotEls: SVGCircleElement[] = []
    const pulseShadowEls: SVGCircleElement[] = []
    NODES.forEach((_n, idx) => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('class', 'hero-orbital__line')
      line.style.opacity = idx === 2 ? '0.46' : '0.30'
      linesG.appendChild(line)
      lineEls.push(line)

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      dot.setAttribute('r', '3')
      dot.setAttribute('class', 'hero-orbital__anchor')
      linesG.appendChild(dot)
      dotEls.push(dot)

      const blur = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      blur.setAttribute('r', '7')
      blur.setAttribute('class', 'hero-orbital__anchor-glow')
      linesG.appendChild(blur)
      pulseShadowEls.push(blur)
    })

    let width = stage.clientWidth || 560
    let height = stage.clientHeight || 540
    const syncViewBox = () => {
      width = stage.clientWidth
      height = stage.clientHeight
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
    }
    syncViewBox()
    const ro = new ResizeObserver(syncViewBox)
    ro.observe(stage)

    const baseW = 560
    const getScale = () => Math.min(1, Math.max(0.5, width / baseW))
    const ELLIPTICAL = 0.58

    const hwFrom = (n: OrbitalNode, mt: number, sc: number) => ((n.featured ? 172 : 148) * mt * sc) / 2 - 4 * sc
    const hhFrom = (n: OrbitalNode, mt: number, sc: number) => ((n.featured ? 76 : 68) * mt * sc) / 2 - 4 * sc
    const dxNorm = (x: number, y: number) => {
      const l = Math.hypot(x, y) || 1
      return x / l
    }

    if (prefersReduced) {
      // place once and stay static; also observe motion preference changes
      const cx = width / 2
      const cy = height / 2
      const scale = getScale()
      NODES.forEach((node, i) => {
        const el = nodeEls[i]
        if (!el) return
        const rad = (node.angle * Math.PI) / 180
        const mt = width < 380 ? 0.86 : width < 420 ? 0.91 : 1
        const r = node.radius * scale * mt
        const x = Math.cos(rad) * r
        const y = Math.sin(rad) * r * ELLIPTICAL
        el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
        el.style.opacity = '1'
        const px = cx + x
        const py = cy + y
        const hw = hwFrom(node, mt, scale)
        const hh = hhFrom(node, mt, scale)
        const absX = Math.abs(x)
        const absY = Math.abs(y)
        const tx = absX < 1e-6 ? Infinity : hw / absX
        const ty = absY < 1e-6 ? Infinity : hh / absY
        const t = Math.min(tx, ty, 1)
        const ex = px - x * (1 - t) - dxNorm(x, y) * 2
        const ey = py - y * (1 - t)
        lineEls[i]?.setAttribute('x1', String(cx))
        lineEls[i]?.setAttribute('y1', String(cy))
        lineEls[i]?.setAttribute('x2', String(ex))
        lineEls[i]?.setAttribute('y2', String(ey))
        dotEls[i]?.setAttribute('cx', String(ex))
        dotEls[i]?.setAttribute('cy', String(ey))
        pulseShadowEls[i]?.setAttribute('cx', String(ex))
        pulseShadowEls[i]?.setAttribute('cy', String(ey))
      })
      const onChange = () => {
        prefersReduced = mReduced.matches
        if (!prefersReduced) window.location.reload()
      }
      mReduced.addEventListener?.('change', onChange)
      return () => {
        ro.disconnect()
        mReduced.removeEventListener?.('change', onChange)
      }
    }

    // Animated state
    const angles = NODES.map((n) => n.angle)
    const pulseNextAt: number[] = NODES.map((_, i) => performance.now() + 1800 + i * 680 + Math.random() * 900)
    type ActivePulse = { idx: number; progress: number; el: SVGCircleElement; glow: SVGCircleElement }
    const activePulses: ActivePulse[] = []

    let raf = 0
    let last = performance.now()
    let corePulseUntil = 0

    const createPulse = (idx: number) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      c.setAttribute('r', '3.4')
      c.setAttribute('class', `hero-orbital__pulse hero-orbital__pulse--${idx === 2 ? 'pink' : idx % 2 === 0 ? 'violet' : 'blue'}`)
      pulsesG.appendChild(c)
      const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      glow.setAttribute('r', '9')
      glow.setAttribute('class', 'hero-orbital__pulse-glow')
      pulsesG.appendChild(glow)
      activePulses.push({ idx, progress: 0, el: c, glow })
    }

    const triggerCore = (now: number) => {
      corePulseUntil = now + 640
      coreInner?.classList.add('is-pulsing')
      window.setTimeout(() => {
        if (performance.now() > corePulseUntil - 40) coreInner?.classList.remove('is-pulsing')
      }, 640)
    }

    const tick = (now: number) => {
      if (document.hidden) {
        last = now
        raf = requestAnimationFrame(tick)
        return
      }
      const dt = Math.min(32, now - last)
      last = now
      const scale = getScale()
      const cx = width / 2
      const cy = height / 2
      const sec = dt / 1000

      NODES.forEach((node, i) => {
        angles[i] = (angles[i] + node.speed * sec) % 360
        const rad = (angles[i] * Math.PI) / 180
        const mt = width < 380 ? 0.86 : width < 420 ? 0.91 : width < 560 ? 0.96 : 1
        const r = node.radius * scale * mt
        const x = Math.cos(rad) * r
        const y = Math.sin(rad) * r * ELLIPTICAL

        const depth = (Math.sin(rad) + 1) / 2
        const s = 0.93 + depth * 0.12
        const o = 0.83 + depth * 0.17
        const bob = Math.sin(now * 0.00042 + i * 1.68) * 3.2

        const el = nodeEls[i]
        if (el) {
          el.style.transform = `translate3d(${x}px, ${y + bob}px, 0) translate(-50%, -50%) scale(${s})`
          el.style.opacity = String(o)
          el.style.zIndex = String(Math.round(2 + depth * 7))
        }

        const px = cx + x
        const py = cy + y + bob
        // rect-edge anchoring: find t where ray hits card rectangle
        const hw = hwFrom(node, mt, scale)
        const hh = hhFrom(node, mt, scale)
        const absX = Math.abs(x)
        const absY = Math.abs(y)
        const tx = absX < 1e-6 ? Infinity : hw / absX
        const ty = absY < 1e-6 ? Infinity : hh / absY
        const t = Math.min(tx, ty, 1)
        // clamp t to [0.42,0.92] to keep line visibly detached from center but not overlapping card
        const clampedT = Math.max(0.42, Math.min(0.94, t))
        const ex = px - x * (1 - clampedT) - dxNorm(x, y) * 1.5
        const ey = py - y * (1 - clampedT)

        lineEls[i]?.setAttribute('x1', String(cx))
        lineEls[i]?.setAttribute('y1', String(cy))
        lineEls[i]?.setAttribute('x2', String(ex))
        lineEls[i]?.setAttribute('y2', String(ey))
        dotEls[i]?.setAttribute('cx', String(ex))
        dotEls[i]?.setAttribute('cy', String(ey))
        pulseShadowEls[i]?.setAttribute('cx', String(ex))
        pulseShadowEls[i]?.setAttribute('cy', String(ey))

        if (now > pulseNextAt[i] && activePulses.length < 2) {
          if (Math.random() < 0.60) createPulse(i)
          pulseNextAt[i] = now + 2800 + Math.random() * 2600 + (node.featured ? -700 : 0)
        }
      })

      for (let p = activePulses.length - 1; p >= 0; p--) {
        const pr = activePulses[p]
        pr.progress += dt * 0.00060
        if (pr.progress >= 1) {
          triggerCore(now)
          pr.el.remove()
          pr.glow.remove()
          activePulses.splice(p, 1)
          continue
        }
        const idx = pr.idx
        const line = lineEls[idx]
        if (!line) continue
        const x1 = Number(line.getAttribute('x1'))
        const y1 = Number(line.getAttribute('y1'))
        const x2 = Number(line.getAttribute('x2'))
        const y2 = Number(line.getAttribute('y2'))
        const cxp = x2 + (x1 - x2) * pr.progress
        const cyp = y2 + (y1 - y2) * pr.progress
        const dx = x1 - x2
        const dy = y1 - y2
        const len = Math.hypot(dx, dy) || 1
        const nx = -dy / len
        const ny = dx / len
        const arc = Math.sin(pr.progress * Math.PI) * 7.5 * (idx % 2 === 0 ? 1 : -1)
        const fx = cxp + nx * arc
        const fy = cyp + ny * arc
        pr.el.setAttribute('cx', String(fx))
        pr.el.setAttribute('cy', String(fy))
        pr.glow.setAttribute('cx', String(fx))
        pr.glow.setAttribute('cy', String(fy))
        pr.el.style.opacity = String(0.96 - pr.progress * 0.18)
        pr.glow.style.opacity = String((0.24 - pr.progress * 0.13).toFixed(2))
      }

      if (now > corePulseUntil && coreInner?.classList.contains('is-pulsing')) {
        coreInner.classList.remove('is-pulsing')
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    // restrained parallax — fine pointer only
    let mouseX = 0
    let mouseY = 0
    let targetX = 0
    let targetY = 0
    let parallaxRaf = 0

    const onMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      targetX = (e.clientX - cx) / (rect.width / 2)
      targetY = (e.clientY - cy) / (rect.height / 2)
    }
    const parallaxTick = () => {
      mouseX += (targetX - mouseX) * 0.055
      mouseY += (targetY - mouseY) * 0.055
      const tx = mouseX * 10
      const ty = mouseY * 7
      const ry = mouseX * 2.0
      const rx = -mouseY * 1.5
      stage.style.transform = `perspective(900px) rotateY(${ry}deg) rotateX(${rx}deg) translate3d(${tx}px, ${ty}px, 0)`
      const rings = stage.querySelector<HTMLElement>('.hero-orbital__rings')
      if (rings) rings.style.transform = `translate3d(${tx * 0.20}px, ${ty * 0.20}px, 0)`
      parallaxRaf = requestAnimationFrame(parallaxTick)
    }

    const onLeave = () => {
      targetX = 0
      targetY = 0
    }

    const coarseListener = () => {
      isCoarsePointer = mCoarse.matches
      if (isCoarsePointer) {
        container.removeEventListener('mousemove', onMove)
        container.removeEventListener('mouseleave', onLeave)
        cancelAnimationFrame(parallaxRaf)
        stage.style.transform = ''
        const rings = stage.querySelector<HTMLElement>('.hero-orbital__rings')
        if (rings) rings.style.transform = ''
      }
    }

    if (!isCoarsePointer && !prefersReduced) {
      container.addEventListener('mousemove', onMove, { passive: true })
      container.addEventListener('mouseleave', onLeave)
      parallaxRaf = requestAnimationFrame(parallaxTick)
      mCoarse.addEventListener?.('change', coarseListener)
    }

    const onReducedChange = (e: MediaQueryListEvent) => {
      prefersReduced = e.matches
      if (prefersReduced) {
        cancelAnimationFrame(raf)
        cancelAnimationFrame(parallaxRaf)
        // freeze in current static positions
        const cx = width / 2
        const cy = height / 2
        const scale = getScale()
        NODES.forEach((node, i) => {
          const el = nodeEls[i]
          if (!el) return
          const rad = (angles[i] * Math.PI) / 180
          const mt = width < 380 ? 0.86 : width < 420 ? 0.91 : 1
          const x = Math.cos(rad) * node.radius * scale * mt
          const y = Math.sin(rad) * node.radius * scale * mt * ELLIPTICAL
          const hw = hwFrom(node, mt, scale)
          const hh = hhFrom(node, mt, scale)
          const absX = Math.abs(x)
          const absY = Math.abs(y)
          const tx = absX < 1e-6 ? Infinity : hw / absX
          const ty = absY < 1e-6 ? Infinity : hh / absY
          const t = Math.min(tx, ty, 1)
          const px = cx + x
          const py = cy + y
          const ex = px - x * (1 - t) - dxNorm(x, y) * 2
          const ey = py - y * (1 - t)
          el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
          el.style.opacity = '1'
          lineEls[i]?.setAttribute('x1', String(cx))
          lineEls[i]?.setAttribute('y1', String(cy))
          lineEls[i]?.setAttribute('x2', String(ex))
          lineEls[i]?.setAttribute('y2', String(ey))
          dotEls[i]?.setAttribute('cx', String(ex))
          dotEls[i]?.setAttribute('cy', String(ey))
          pulseShadowEls[i]?.setAttribute('cx', String(ex))
          pulseShadowEls[i]?.setAttribute('cy', String(ey))
        })
        activePulses.forEach((p) => {
          p.el.remove()
          p.glow.remove()
        })
        activePulses.length = 0
      } else {
        last = performance.now()
        raf = requestAnimationFrame(tick)
        if (!isCoarsePointer) {
          parallaxRaf = requestAnimationFrame(parallaxTick)
        }
      }
    }
    mReduced.addEventListener?.('change', onReducedChange)

    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(parallaxRaf)
      ro.disconnect()
      container.removeEventListener('mousemove', onMove)
      container.removeEventListener('mouseleave', onLeave)
      mCoarse.removeEventListener?.('change', coarseListener)
      mReduced.removeEventListener?.('change', onReducedChange)
      activePulses.forEach((p) => {
        p.el.remove()
        p.glow.remove()
      })
      stage.style.transform = ''
      const rings = stage.querySelector<HTMLElement>('.hero-orbital__rings')
      if (rings) rings.style.transform = ''
    }
  }, [])

  return (
    <div ref={containerRef} className="hero-orbital" aria-label="Connected Intelligence orbital">
      <div ref={stageRef} className="hero-orbital__stage">
        <div className="hero-orbital__rings" aria-hidden="true">
          <div className="hero-orbital__glow" />
          <div className="hero-orbital__ring hero-orbital__ring--1" />
          <div className="hero-orbital__ring hero-orbital__ring--2" />
          <div className="hero-orbital__ring hero-orbital__ring--3" />
          <div className="hero-orbital__arc" />
        </div>

        <svg ref={svgRef} className="hero-orbital__lines" aria-hidden="true">
          <defs>
            <linearGradient id="orbitalLineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8468ff" stopOpacity="0.00" />
              <stop offset="38%" stopColor="#8468ff" stopOpacity="0.18" />
              <stop offset="78%" stopColor="#8468ff" stopOpacity="0.26" />
              <stop offset="100%" stopColor="#48bdf3" stopOpacity="0.36" />
            </linearGradient>
          </defs>
          <g ref={linesGroupRef} />
          <g ref={pulsesGroupRef} />
        </svg>

        <div ref={coreRef} className="hero-orbital__core">
          <div ref={coreInnerRef} className="hero-orbital__core-inner">
            <span className="hero-orbital__core-halo" aria-hidden="true" />
            <BrandMark />
            <span className="hero-orbital__core-label">lancee</span>
          </div>
          <span className="hero-orbital__core-ring" aria-hidden="true" />
          <span className="hero-orbital__core-ring hero-orbital__core-ring--2" aria-hidden="true" />
        </div>

        <div ref={nodesWrapRef} className="hero-orbital__nodes">
          {NODES.map((node) => (
            <article
              key={node.id}
              data-orbital-node={node.id}
              className={`hero-orbital__node hero-orbital__node--${node.id}${node.featured ? ' is-featured' : ''}`}
            >
              <span className={`hero-orbital__node-icon hero-orbital__node-icon--${node.accent ?? 'violet'}`}>
                <Icon name={node.icon} size={14} />
              </span>
              <span className="hero-orbital__node-body">
                <strong>{node.label}</strong>
                <span className={node.featured ? 'is-strong' : ''}>{node.value}</span>
                {node.sub && <small>{node.sub}</small>}
              </span>
              <span className="hero-orbital__node-dot" aria-hidden="true" />
            </article>
          ))}
        </div>
      </div>

      <span className="hero-orbital__caption">Your work. Connected. Intelligent. Effortless.</span>
    </div>
  )
}
