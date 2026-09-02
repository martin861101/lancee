AGENT TASK: Animate Lancee Hero Connected Intelligence Visual

Inspect the existing Lancee landing page, branding, components and animation stack before making changes.

Goal:
Turn the right-hand hero visual into a premium animated "Connected Intelligence" system centred around the Lancee logo.

Research current high-quality implementations/patterns for orbital UI animation, SVG connection paths and performant React animation before deciding on the implementation. Prefer the existing project stack where practical and avoid unnecessary heavy dependencies.

Desired behaviour:
- Lancee logo/core sits at the centre.
- Clients, Projects, Invoices, Calendar, Meetings and Mail exist around it as floating connected cards.
- Introduce slow orbital/drifting movement with depth.
- Cards must remain upright/readable while moving.
- Orbital rings can rotate independently at different subtle speeds/directions.
- Connection lines should remain visually attached to their nodes.
- Occasionally animate a small blue/pink energy/data pulse along a connection toward the Lancee core.
- Core glow should subtly react/pulse.
- Add very restrained cursor parallax/3D depth on desktop if appropriate.
- Animation should feel calm, intelligent and expensive, NOT like a spinning loading animation.
- Respect prefers-reduced-motion.
- Must remain responsive and perform well on mobile.
- Do not change the existing Lancee branding or redesign unrelated sections.

Important:
Use the supplied concept/reference as visual direction, but adapt it properly to Lancee's real UI and design system rather than blindly reproducing it.

Feel free to improve the animation concept if research reveals a more elegant implementation.

Before coding:
1. Inspect the existing hero implementation and animation dependencies.
2. Research suitable approaches.
3. Decide whether CSS/SVG, Framer Motion/Motion, or another lightweight approach is most appropriate.
4. Implement cleanly as reusable components rather than hero-specific animation hacks.

After implementation:
- Test desktop and mobile.
- Check for clipping, overlap and layout shifts.
- Verify animation performance.
- Verify reduced-motion behaviour.
- Run existing lint/typecheck/build/tests.
- Report what changed and any remaining recommendations.
