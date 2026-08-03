import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function Header() {
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(".nav-link", { opacity: 0, y: -8 }, {
          opacity: 1, y: 0, duration: 0.4, stagger: 0.06, ease: "power2.out", delay: 0.1,
        });
      });

      ScrollTrigger.create({
        start: "top -60",
        onUpdate: (self) => {
          if (!headerRef.current) return;
          if (self.direction === 1 && self.progress > 0) {
            headerRef.current.classList.add("header-scrolled");
          } else if (self.direction === -1 && self.progress < 0.5) {
            headerRef.current.classList.remove("header-scrolled");
          }
        },
      });
    }, headerRef);
    return () => ctx.revert();
  }, []);

  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <header ref={headerRef} className="header">
      <div className="header-inner">
        <a href="#home" onClick={(e) => scrollTo(e, "#home")} className="header-logo">
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <rect x="2" y="2" width="24" height="24" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9 14l4 4 6-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>hookit-easy</span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#services" onClick={(e) => scrollTo(e, "#services")} className="nav-link">Services</a>
          <a href="#about" onClick={(e) => scrollTo(e, "#about")} className="nav-link">About</a>
          <a href="#contact" onClick={(e) => scrollTo(e, "#contact")} className="nav-link btn-nav-cta">Connect</a>
        </nav>
      </div>
    </header>
  );
}