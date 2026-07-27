import { useEffect, useRef, type CSSProperties } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import ShinyText from './ShinyText'

gsap.registerPlugin(ScrollTrigger)

const services = [
  { number: '01', title: 'Operational Clarity', desc: 'See where time disappears, decisions stall, and handoffs create friction across the organization.' },
  { number: '02', title: 'Decision Intelligence', desc: 'Give people the context, visibility, and signals they need to make better decisions sooner.' },
  { number: '03', title: 'Workflow Design', desc: 'Align responsibilities, information, and systems so work reaches the right person at the right time.' },
  { number: '04', title: 'Capacity Automation', desc: 'Remove repetitive coordination and administration while preserving the judgment that should remain human.' },
  { number: '05', title: 'Intelligent Infrastructure', desc: 'Connect data, software, AI, and operations into an invisible foundation that supports how the business works.' },
  { number: '06', title: 'Adoption & Stewardship', desc: 'Build confidence, governance, and internal capability so every system continues creating value after launch.' },
]

const workflow = [
  { symbol: '△', label: 'Observe' },
  { symbol: '○', label: 'Capture' },
  { symbol: '□', label: 'Clarify' },
  { symbol: '⬡', label: 'Understand' },
  { symbol: '✦', label: 'Prioritize' },
  { symbol: '◇', label: 'Decide' },
  { symbol: '▷', label: 'Enable' },
  { symbol: '◉', label: 'Learn' },
  { symbol: '↻', label: 'Evolve' },
]

export default function Services() {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo('.service-row', { opacity: 0, y: 40 }, {
          opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out',
          scrollTrigger: { trigger: sectionRef.current, start: 'top 75%', toggleActions: 'play none none none' },
        })
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} className="services" id="work">
      <div className="services-intro">
        <span className="section-label">Where capacity is created</span>
        <h2>Make more of what you already have.</h2>
        <p>Capacity is rarely missing. It is usually trapped in unclear decisions, fragmented systems, repetitive work, and attention pointed in the wrong direction.</p>
      </div>
      <div className="workflow-strip" aria-label="A living workflow from observation to continuous evolution">
        <div className="workflow-caption">Intelligence becomes direction. Direction becomes capacity.</div>
        <div className="workflow-viewport">
          <div className="workflow-track">
            <div className="workflow-line" aria-hidden="true">
              <span className="workflow-pulse" />
            </div>
            {workflow.map((node, i) => (
              <div className="workflow-node" key={node.label} style={{ '--node-index': i } as CSSProperties}>
                <span className="workflow-symbol" aria-hidden="true">{node.symbol}</span>
                <span className="workflow-label">{node.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="services-list glass-panel">
        {services.map((s, i) => (
          <div key={i} className="service-row">
            <span className="service-number">{s.number}</span>
            <div className="service-body">
              <h3>
                <ShinyText
                  text={s.title}
                  color="#8a7a5a"
                  shineColor="#f6d365"
                  speed={3}
                  delay={2 + i * 0.5}
                  spread={90}
                />
              </h3>
              <p>{s.desc}</p>
            </div>
            <div className="service-arrow" aria-hidden="true">&rarr;</div>
          </div>
        ))}
      </div>
    </section>
  )
}
