import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const pillars = [
  {
    number: '01',
    title: 'Intelligence',
    copy: 'Turn information into context, visibility, and confidence about what should happen next.',
    outcome: 'Better decisions',
  },
  {
    number: '02',
    title: 'Time',
    copy: 'Remove work that consumes attention without requiring human creativity, care, or judgment.',
    outcome: 'Protected attention',
  },
  {
    number: '03',
    title: 'People',
    copy: 'Direct capable people toward the work where their experience creates the greatest value.',
    outcome: 'Human potential',
  },
]

export default function Stats() {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo('.stat-num', { opacity: 0, y: 30 }, {
          opacity: 1, y: 0, duration: 0.7, stagger: 0.14, ease: 'power3.out',
          scrollTrigger: { trigger: ref.current, start: 'top 78%', toggleActions: 'play none none none' },
        })
      })
    }, ref)
    return () => ctx.revert()
  }, [])

  return (
    <section ref={ref} className="capacity" id="capacity">
      <div className="capacity-intro">
        <span className="section-label">The capacity model</span>
        <h2>Three finite resources. One connected system.</h2>
        <p>Growth becomes sustainable when intelligence, time, and people reinforce one another.</p>
      </div>
      <div className="stats glass-panel">
        {pillars.map((pillar) => (
          <article key={pillar.title} className="stat-num">
            <span className="stat-index">{pillar.number}</span>
            <h3 className="stat-value">{pillar.title}</h3>
            <p>{pillar.copy}</p>
            <span className="stat-outcome">{pillar.outcome}</span>
          </article>
        ))}
      </div>
    </section>
  )
}
