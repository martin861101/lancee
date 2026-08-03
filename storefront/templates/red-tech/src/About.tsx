import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import SplitText from "./components/SplitText";

gsap.registerPlugin(ScrollTrigger);

export default function About() {
  const sectionRef = useRef(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".about-content > *", { opacity: 0, y: 30 }, {
        opacity: 1, y: 0, duration: 0.6, stagger: 0.12, ease: "power3.out",
        scrollTrigger: { trigger: sectionRef.current, start: "top 80%", toggleActions: "play none none none" },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="about-section" id="about">
      <div className="about-content">
        <span className="section-label">$ ./whoami</span>
        <SplitText
          text="We Build the Engine Behind Great Software"
          tag="h2"
          splitType="words"
          delay={30}
          duration={0.5}
          from={{ opacity: 0, y: 20 }}
          to={{ opacity: 1, y: 0 }}
          textAlign="center"
        />
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
        <div className="about-quote">
          <p>"Intelligence is the ability to adapt to change. Automation is the ability to make that adaptation invisible."</p>
          <cite>— hookit-easy/core-principles.md</cite>
        </div>
      </div>
    </section>
  );
}