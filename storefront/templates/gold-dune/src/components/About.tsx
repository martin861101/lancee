import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import ShinyText from './ShinyText'

gsap.registerPlugin(ScrollTrigger)

export default function About() {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo('.about-block > *', { opacity: 0, y: 40 }, {
          opacity: 1, y: 0, duration: 0.8, stagger: 0.12, ease: 'power3.out',
          scrollTrigger: { trigger: sectionRef.current, start: 'top 80%', toggleActions: 'play none none none' },
        })
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} className="about" id="about">
      <div className="about-divider" aria-hidden="true" />
      <div className="about-block glass-panel">
        <span className="about-label">Manifesto</span>
        <blockquote>
          <p>
            We protect human time and direct it toward work{' '}
            <ShinyText
              text="only people can do"
              color="#8a7a5a"
              shineColor="#f6d365"
              speed={3}
              delay={1}
              spread={90}
            />
            .
          </p>
        </blockquote>
        <p className="about-copy">
          We do not automate businesses. We help organizations understand where intelligence belongs,
          where time is best spent, and where people create the greatest value. Then we design the
          systems that make that allocation possible.
        </p>
      </div>
      <div className="about-values">
        <div className="about-value">
          <span className="about-value-num">01</span>
          <h4>Clarity before Code</h4>
          <p>We understand the operating problem before prescribing technology. The clearest system is often simpler than expected.</p>
        </div>
        <div className="about-value">
          <span className="about-value-num">02</span>
          <h4>Capacity over Activity</h4>
          <p>More output is not automatically more value. We measure what becomes possible when time and attention are returned.</p>
        </div>
        <div className="about-value">
          <span className="about-value-num">03</span>
          <h4>Stewardship, not Dependency</h4>
          <p>Every system should strengthen the organization that uses it. We build capability your people can understand and own.</p>
        </div>
      </div>
    </section>
  )
}
