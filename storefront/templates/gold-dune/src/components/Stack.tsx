import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const categories = [
  { title: 'See Clearly', items: ['Process visibility', 'Decision dashboards', 'Operational signals', 'Capacity mapping'] },
  { title: 'Protect Time', items: ['Workflow automation', 'System integration', 'AI assistance', 'Self-service tools'] },
  { title: 'Direct Work', items: ['Intelligent routing', 'Clear handoffs', 'Orchestration', 'Prioritization systems'] },
  { title: 'Keep Evolving', items: ['Governance', 'Observability', 'Team enablement', 'Continuous improvement'] },
]

export default function Stack() {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo('.stack-cat', { opacity: 0, y: 30 }, {
          opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: 'power3.out',
          scrollTrigger: { trigger: sectionRef.current, start: 'top 80%', toggleActions: 'play none none none' },
        })
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} className="stack" id="stack">
      <div className="stack-inner glass-panel">
        <span className="section-label">The systems underneath</span>
        <h2>Implementation follows intent.</h2>
        <p className="stack-lead">AI, software, data, and automation are engines inside the system—not the story itself.</p>
        <div className="stack-grid">
          {categories.map((cat, i) => (
            <div key={i} className="stack-cat">
              <h3>{cat.title}</h3>
              <ul>
                {cat.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
