import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function About() {
  const sectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo('.about-content > *', { opacity: 0, y: 40 }, {
        opacity: 1, y: 0, duration: 0.7, stagger: 0.15, ease: 'power3.out',
        scrollTrigger: { trigger: sectionRef.current, start: 'top 80%', toggleActions: 'play none none none' },
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} className="about-section" id="about">
      <div className="about-content">
        <span className="section-label">About</span>
        <h2>We Build the <span className="gradient-text">Invisible Engine</span> Behind Great Software</h2>
        <p>
          Hookit Easy is a team of software engineers, AI researchers, and automation architects. 
          We partner with companies to design and build the systems that run their business — 
          from AI copilots and autonomous agents to resilient backend platforms and zero-touch deployment pipelines.
        </p>
        <p>
          Every engagement starts with a simple question: <em>"What should happen automatically?"</em> 
          Our answer drives architecture that reduces toil, eliminates bottlenecks, and lets your 
          team focus on what only humans can do.
        </p>
      </div>
    </section>
  )
}
