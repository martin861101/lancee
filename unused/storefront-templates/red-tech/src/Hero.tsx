import { useEffect, useRef } from "react";
import gsap from "gsap";
import GlitchText from "./components/GlitchText";
import Orb from "./components/Orb";
import ASCIIText from "./components/ASCIIText";

export default function Hero() {
  const container = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(".hero-line", { opacity: 0, x: -20 }, {
          opacity: 1, x: 0, duration: 0.4, stagger: 0.15, ease: "power2.out", delay: 0.3
        });
        gsap.fromTo(".hero-title-block", { opacity: 0, y: 30 }, {
          opacity: 1, y: 0, duration: 0.6, delay: 1, ease: "power3.out"
        });
        gsap.fromTo(".hero-actions", { opacity: 0, y: 20 }, {
          opacity: 1, y: 0, duration: 0.5, delay: 1.4, ease: "power2.out"
        });
      });
    }, container);

    return () => ctx.revert();
  }, []);

  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section ref={container} className="hero-section" id="home">
      <div className="hero-orb-bg">
        <Orb hue={20} hoverIntensity={0.3} forceHoverState backgroundColor="#0a0a0a" />
      </div>
      <div className="hero-ascii">
        <ASCIIText text="HOOKIT" asciiFontSize={6} textFontSize={180} enableWaves />
      </div>

      <div className="hero-layout">
        <div className="hero-terminal">
          <div className="terminal-bar">
            <span className="terminal-dot" />
            <span className="terminal-dot" />
            <span className="terminal-dot" />
            <span className="terminal-title">hookit-easy@terminal</span>
          </div>

          <span className="hero-line"><span className="prompt">$</span> <span className="cmd">cat /etc/os-release</span></span>
          <span className="hero-line"><span className="prompt">$</span> <span className="cmd">HOOKIT_EASY v2.0 — <span className="blink">▌</span></span></span>

          <div className="hero-title-block">
            <GlitchText speed={0.8} className="hero-glitch">
              We Engineer Intelligence
            </GlitchText>
          </div>

          <p className="hero-desc">
            From AI-native platforms to enterprise-grade software — we build
            intelligent systems that think, adapt, and scale.
          </p>

          <div className="hero-actions">
            <a href="#services" onClick={(e) => scrollTo(e, "#services")} className="btn-primary btn-large">
              $ ./explore
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a href="#contact" onClick={(e) => scrollTo(e, "#contact")} className="btn-outline">
              $ ./contact
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}