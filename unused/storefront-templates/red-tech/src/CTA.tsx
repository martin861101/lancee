import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import ShinyText from "./components/ShinyText";

gsap.registerPlugin(ScrollTrigger);

export default function CTA() {
  const sectionRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".cta-content > *", { opacity: 0, y: 20 }, {
        opacity: 1, y: 0, duration: 0.6, stagger: 0.15, ease: "power3.out",
        scrollTrigger: { trigger: sectionRef.current, start: "top 80%", toggleActions: "play none none none" },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="cta-section" id="contact">
      <div className="cta-content">
        <span className="section-label">$ ./connect</span>
        <h2>
          <ShinyText
            text="Ready to Automate the Impossible?"
            speed={3}
            color="#e0e0e0"
            shineColor="#ff4422"
            spread={90}
            direction="right"
          />
        </h2>
        <p>Let's design and build the intelligent systems that will define your next chapter.</p>
        <a href="mailto:hello@hookiteasy.io" className="btn-primary btn-large">
          $ ./start_conversation
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <div className="cta-email">
          <span className="prompt">$</span> echo hello@hookiteasy.io
        </div>
      </div>
    </section>
  );
}