import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import ShinyText from './ShinyText'

gsap.registerPlugin(ScrollTrigger)

export default function CTA() {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo('.cta-block > *', { opacity: 0, y: 30 }, {
          opacity: 1, y: 0, duration: 0.7, stagger: 0.15, ease: 'power3.out',
          scrollTrigger: { trigger: ref.current, start: 'top 80%', toggleActions: 'play none none none' },
        })
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={ref} className="cta" id="contact">
      <div className="cta-block glass-panel">
        <span className="cta-label">Start with clarity</span>
        <h2>
          Where is your organization{' '}
          <ShinyText
            text="losing capacity"
            color="#8a7a5a"
            shineColor="#f6d365"
            speed={3}
            delay={1}
            spread={90}
          />
          .
        </h2>
        <p className="cta-copy">A conversation about time, decisions, and people comes before any conversation about technology.</p>
        <a href="mailto:martin@hookitupsolutions.co.za" className="btn-cta">
          Find your capacity <span className="btn-arrow">&rarr;</span>
        </a>
      </div>
    </section>
  )
}
