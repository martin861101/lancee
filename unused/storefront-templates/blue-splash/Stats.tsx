import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const stats = [
  { value: '99.9%', label: 'Uptime SLA' },
  { value: '50+', label: 'Enterprise Clients' },
  { value: '200+', label: 'Automation Pipelines' },
  { value: '3x', label: 'Avg. Velocity Boost' },
]

export default function Stats() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const countersRef = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.stat-item',
        { opacity: 0, y: 40 },
        {
          opacity: 1, y: 0, duration: 0.8, stagger: 0.15, ease: 'power3.out',
          scrollTrigger: { trigger: sectionRef.current, start: 'top 80%', toggleActions: 'play none none none' },
        }
      )
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} className="stats-section">
      <div className="stats-inner">
        {stats.map((s, i) => (
          <div key={i} ref={(el) => { countersRef.current[i] = el }} className="stat-item">
            <span className="stat-value gradient-text">{s.value}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
