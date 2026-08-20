import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import ShinyText from './ShinyText'
import Dunes from './backgrounds/Dunes'

export default function Hero() {
  const container = useRef<HTMLElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } })
        tl.fromTo('.hero-eyebrow', { opacity: 0, y: 16 }, { opacity: 0.5, y: 0, duration: 0.6 })
          .fromTo('.hero-title-line', { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.12 }, '-=0.3')
          .fromTo('.hero-sub', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6 }, '-=0.3')
          .fromTo('.hero-actions', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5 }, '-=0.2')
      })
    }, container)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={container} className="hero" id="home">
      <div className="hero-viewport">
        <Dunes
          speed={0.15}
          amplitude={70}
          layers={5}
          interactive
          colors={[
            '#171108',
            '#241909',
            '#35250d',
            '#4a3412',
            '#6a4c1c',
          ]}
        />
        <div className="hero-grain-overlay" aria-hidden="true" />
        <div className="hero-overlay" />
        <div className="hero-text">
          <span className="hero-eyebrow">Capacity systems for modern organizations</span>
          <h1 className="hero-title">
            <span className="hero-title-line">
              <ShinyText
                text="Capacity"
                color="#b19a69"
                shineColor="#f6d365"
                speed={3}
                delay={2}
                spread={90}
              />
            </span>
            <span className="hero-title-line">
              <ShinyText
                text="Engineered."
                color="#b19a69"
                shineColor="#f6d365"
                speed={3}
                delay={2.5}
                spread={90}
              />
            </span>
          </h1>
          <p className="hero-sub">
            We help organizations direct intelligence, time, and people toward the work
            that creates the most value.
          </p>
          <div className="hero-actions">
            <a href="#work" className="btn-outline">See where capacity goes</a>
            <a href="#contact" className="btn-outline">Start a conversation</a>
          </div>
        </div>
      </div>
    </section>
  )
}
