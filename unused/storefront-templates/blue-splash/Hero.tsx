import { useEffect, useRef, lazy, Suspense } from 'react'
import gsap from 'gsap'

const Scene3D = lazy(() => import('./three/Scene3D'))

export default function Hero() {
  const container = useRef<HTMLDivElement>(null)
  const scrollHint = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
        tl.fromTo('.hero-label', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 })
          .fromTo('.hero-title', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8 }, '-=0.3')
          .fromTo('.hero-desc', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.4')
          .fromTo('.hero-actions', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, '-=0.3')
          .fromTo('.hero-badge', { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.1 }, '-=0.2')

        gsap.to(scrollHint.current, {
          y: 8, duration: 1.5, ease: 'sine.inOut', yoyo: true, repeat: -1,
        })
      })
    }, container)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={container} className="hero-section" id="home">
      <div className="hero-grid-bg" />
      <div className="hero-layout">
        <div className="hero-content">
          <span className="hero-label">Where Code Meets Intelligence</span>
          <h1 className="hero-title">
            We Engineer the <span className="gradient-text">Future</span>
            <br />
            of Automation
          </h1>
          <p className="hero-desc">
            From AI-native platforms to enterprise-grade software — we build
            intelligent systems that think, adapt, and scale.
          </p>
          <div className="hero-actions">
            <a href="#services" className="btn-primary">
              Explore Services
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a href="#contact" className="btn-outline">
              Get in Touch
            </a>
          </div>
          <div className="hero-badges">
            <span className="hero-badge">AI Engineering</span>
            <span className="hero-badge">Software Engineering</span>
            <span className="hero-badge">Workflow Automation</span>
            <span className="hero-badge">LLM Orchestration</span>
            <span className="hero-badge">DevOps &amp; Platform</span>
          </div>
        </div>

        <div className="hero-scene" aria-hidden="true">
          <Suspense fallback={null}>
            <Scene3D />
          </Suspense>
        </div>
      </div>

      <div ref={scrollHint} className="scroll-hint" aria-hidden="true">
        <svg width="20" height="30" viewBox="0 0 20 30" fill="none">
          <rect x="1" y="1" width="18" height="28" rx="9" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="10" r="2.5" fill="currentColor">
            <animate attributeName="cy" values="10;18;10" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
    </section>
  )
}
