import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Beams from "./components/Beams";
import SplitText from "./components/SplitText";

gsap.registerPlugin(ScrollTrigger);

const services = [
  {
    title: "AI Engineering",
    desc: "Custom LLM fine-tuning, RAG pipelines, agentic workflows, and AI-native product architecture.",
  },
  {
    title: "Software Engineering",
    desc: "Full-stack platforms, distributed systems, API design, and developer tooling at any scale.",
  },
  {
    title: "Cloud & Infrastructure",
    desc: "Kubernetes, serverless, edge compute, and GitOps-driven infrastructure that scales effortlessly.",
  },
  {
    title: "Workflow Automation",
    desc: "End-to-end process automation, CI/CD pipelines, event-driven architectures, and auto-remediation.",
  },
  {
    title: "LLM Orchestration",
    desc: "Multi-agent systems, tool-use architectures, memory management, and production AI deployments.",
  },
  {
    title: "AI Consulting",
    desc: "Strategy, architecture review, model evaluation, and roadmap planning for AI adoption.",
  },
];

export default function Services() {
  const sectionRef = useRef(null);
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const ctx = gsap.context(() => {
      cardsRef.current.forEach((card) => {
        if (!card) return;
        gsap.fromTo(card,
          { opacity: 0, y: 40 },
          {
            opacity: 1, y: 0, duration: 0.6, ease: "power3.out",
            scrollTrigger: { trigger: card, start: "top 85%", toggleActions: "play none none none" },
          }
        );
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={sectionRef} className="services-section" id="services">
      <div className="services-bg">
        <Beams beamWidth={1.5} beamHeight={10} beamNumber={8} speed={1.5} lightColor="#ff4422" />
      </div>
      <div className="section-header">
        <span className="section-label">$ ./capabilities --list</span>
        <SplitText
          text="What We Build"
          tag="h2"
          splitType="words"
          delay={30}
          duration={0.5}
          from={{ opacity: 0, y: 20 }}
          to={{ opacity: 1, y: 0 }}
          textAlign="center"
        />
        <p>Every capability we offer is designed to reduce friction, eliminate toil, and amplify human potential.</p>
      </div>
      <div className="services-grid">
        {services.map((s, i) => (
          <div
            key={i}
            ref={(el) => { cardsRef.current[i] = el }}
            className="service-card"
          >
            <h3>{s.title}</h3>
            <p>{s.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}