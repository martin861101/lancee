import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export default function Header() {
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set(headerRef.current, { y: -40, opacity: 0 })

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.to(headerRef.current, {
          y: 0, opacity: 1, duration: 0.6, ease: 'power3.out', delay: 0.8,
        })
      })

      ScrollTrigger.create({
        start: 'top -60',
        onUpdate: (self) => {
          if (!headerRef.current) return
          if (self.direction === 1 && self.progress > 0) {
            headerRef.current.classList.add('is-scrolled')
          } else if (self.direction === -1 && self.progress < 0.5) {
            headerRef.current.classList.remove('is-scrolled')
          }
        },
      })
    }, headerRef)

    return () => ctx.revert()
  }, [])

  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault()
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <header ref={headerRef} className="header">
      <div className="header-inner">
        <a href="#home" onClick={(e) => scrollTo(e, '#home')} className="header-logo">
          <span className="header-mark">◆</span>
          <span>lancee</span>
        </a>
        <nav aria-label="Main" className="header-nav">
          <a href="#capacity" onClick={(e) => scrollTo(e, '#capacity')}>Capacity</a>
          <a href="#process" onClick={(e) => scrollTo(e, '#process')}>Approach</a>
          <a href="#about" onClick={(e) => scrollTo(e, '#about')}>Philosophy</a>
          <a href="#contact" onClick={(e) => scrollTo(e, '#contact')} className="header-cta">Contact</a>
        </nav>
      </div>
    </header>
  )
}
