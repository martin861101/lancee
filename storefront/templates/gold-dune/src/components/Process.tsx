import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const steps = [
  { number: '01', title: 'Diagnose', desc: 'We trace where time, attention, and decisions move today—and where capacity is being lost.' },
  { number: '02', title: 'Prioritize', desc: 'We identify the changes that create the most value before choosing tools or writing code.' },
  { number: '03', title: 'Design', desc: 'We build the workflows, information systems, and automation that make the better path easier.' },
  { number: '04', title: 'Steward', desc: 'We measure outcomes, transfer capability, and keep the system aligned as the organization evolves.' },
]

export default function Process() {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo('.process-step', { opacity: 0, y: 40 }, {
          opacity: 1, y: 0, duration: 0.7, stagger: 0.15, ease: 'power3.out',
          scrollTrigger: { trigger: sectionRef.current, start: 'top 75%', toggleActions: 'play none none none' },
        })
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} className="process" id="process">
      <div className="process-inner glass-panel">
        <span className="section-label">Our approach</span>
        <h2>Clarity before systems.</h2>
        <p className="process-lead">Technology follows the operating decision—not the other way around.</p>
        <div className="process-grid">
          {steps.map((s, i) => (
            <div key={i} className="process-step">
              <span className="process-number">{s.number}</span>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
