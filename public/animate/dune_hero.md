Create an Animated "Dunes.tsx" Background

Build a reusable animated React background component called "Dunes.tsx".

The component should create a cinematic landscape made from multiple flowing dune layers. It must work as a decorative full-screen background behind normal page content.

Target stack

- React
- TypeScript
- Vite or Next.js
- Tailwind CSS
- HTML Canvas
- No Three.js
- No external animation library
- No image assets
- No unnecessary dependencies

File location

Create:

src/components/backgrounds/Dunes.tsx

Component API

Use the following public interface:

export interface DunesProps {
  className?: string
  speed?: number
  amplitude?: number
  frequency?: number
  layers?: number
  interactive?: boolean
  colors?: string[]
}

Recommended defaults:

speed = 0.18
amplitude = 80
frequency = 0.0018
layers = 5
interactive = true
colors = [
  "#09090b",
  "#18181b",
  "#27272a",
  "#3f3f46",
  "#52525b",
]

The component should be usable like this:

<Dunes
  speed={0.2}
  amplitude={90}
  layers={6}
  interactive
  colors={[
    "#090014",
    "#16002b",
    "#29004d",
    "#4c0878",
    "#7c3aed",
    "#a855f7",
  ]}
/>

Rendering approach

Use a "<canvas>" element that fills its parent.

The canvas must:

- Use "position: absolute"
- Use "inset: 0"
- Fill the available width and height
- Remain behind page content
- Ignore pointer events
- Scale correctly on high-DPI screens
- Resize whenever its container changes
- Render smoothly with "requestAnimationFrame"

Example outer structure:

<div
  className={cn(
    "pointer-events-none absolute inset-0 overflow-hidden",
    className
  )}
  aria-hidden="true"
>
  <canvas ref={canvasRef} className="h-full w-full" />
</div>

Do not assume that a "cn()" utility exists. Either import the project’s existing utility or combine classes manually.

Dune generation

Render several overlapping dune layers from back to front.

Each layer should be generated as a smooth horizontal path using multiple sine waves:

y =
  baseY +
  Math.sin(x * frequency + time * layerSpeed + phase) * amplitude +
  Math.sin(x * frequency * 0.47 - time * layerSpeed * 0.6 + phase2) *
    amplitude *
    0.45 +
  Math.sin(x * frequency * 1.73 + phase3) *
    amplitude *
    0.15

Each layer should have slightly different:

- Vertical position
- Phase
- Wave frequency
- Wave amplitude
- Animation speed
- Horizontal offset
- Opacity
- Blur amount

The rear dunes should:

- Sit higher on the screen
- Move more slowly
- Have lower contrast
- Have slightly more atmospheric blur

The front dunes should:

- Sit lower on the screen
- Have stronger silhouettes
- Move slightly faster
- Use brighter or more saturated colours

Drawing each layer

For every animation frame:

1. Begin a path outside the left edge.
2. Sample the dune height across the canvas.
3. Draw the curve from left to right.
4. Continue the path to the bottom-right corner.
5. Continue to the bottom-left corner.
6. Close the path.
7. Fill it with the layer colour or gradient.

Use small horizontal sampling steps:

const step = Math.max(3, width / 350)

Avoid creating thousands of unnecessary path points.

Gradients

Each dune layer should use a subtle vertical gradient instead of a completely flat fill.

Example:

const gradient = ctx.createLinearGradient(
  0,
  baseY - amplitude,
  0,
  height
)

gradient.addColorStop(0, layerColor)
gradient.addColorStop(1, darkenedLayerColor)

Implement a small helper to darken a hex colour or use canvas opacity overlays.

Do not introduce a colour library solely for this feature.

Atmospheric background

Before drawing the dunes, render a background gradient.

The default background should feel dark and cinematic:

const background = ctx.createLinearGradient(0, 0, 0, height)

background.addColorStop(0, "#05030a")
background.addColorStop(0.55, "#10091c")
background.addColorStop(1, "#020203")

Add a subtle radial glow near the centre or upper centre:

const glow = ctx.createRadialGradient(
  width * 0.5,
  height * 0.35,
  0,
  width * 0.5,
  height * 0.35,
  width * 0.7
)

The glow should be understated and must not overpower foreground text.

Pointer interaction

When "interactive" is enabled:

- Track the pointer position relative to the component.
- Smooth the raw pointer coordinates using interpolation.
- Use pointer movement to slightly shift the dunes.
- Do not make the effect follow the mouse aggressively.

Suggested interpolation:

pointer.current.x +=
  (pointer.current.targetX - pointer.current.x) * 0.035

pointer.current.y +=
  (pointer.current.targetY - pointer.current.y) * 0.035

Suggested influence:

const pointerOffsetX = pointerX * 15 * layerDepth
const pointerOffsetY = pointerY * 10 * layerDepth

Normalise the pointer position to approximately "-1" through "1".

Use "pointermove" instead of separate mouse and touch event implementations.

Because the canvas ignores pointer events, attach the listener to the component container, its parent, or "window".

Animation timing

Use elapsed time from the animation callback:

const elapsed = timestamp / 1000

Calculate movement from elapsed time rather than incrementing a fixed value every frame. This keeps animation speed consistent across different refresh rates.

The animation should remain calm. Avoid rapid waves or obvious looping.

Reduced-motion support

Respect the user’s operating-system preference:

window.matchMedia("(prefers-reduced-motion: reduce)")

When reduced motion is enabled:

- Draw one static frame.
- Do not continuously call "requestAnimationFrame".
- Disable pointer-driven movement.

Page visibility

Pause animation when the browser tab becomes hidden.

Listen for:

document.visibilitychange

When the document becomes visible again, restart the animation without causing a large time jump.

Resize handling

Use "ResizeObserver" on the component container.

On resize:

1. Read the CSS width and height.
2. Clamp device pixel ratio to a maximum of "2".
3. Set the canvas backing dimensions.
4. Reset the canvas transform.
5. Redraw the frame.

Recommended approach:

const dpr = Math.min(window.devicePixelRatio || 1, 2)

canvas.width = Math.floor(width * dpr)
canvas.height = Math.floor(height * dpr)

canvas.style.width = `${width}px`
canvas.style.height = `${height}px`

ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

Do not repeatedly scale the context without resetting its transform.

React lifecycle

Inside "useEffect":

- Resolve the canvas context.
- Create the resize observer.
- Register pointer listeners.
- Register visibility listeners.
- Detect reduced-motion preference.
- Start the animation.
- Clean up every listener.
- Disconnect the observer.
- Cancel the current animation frame.

The effect dependencies should include all properties that affect rendering.

Avoid updating React state during animation. Store frequently changing values in refs.

Layer configuration

Generate stable layer parameters once per effect execution.

Each layer should receive deterministic values derived from its index:

const depth = index / Math.max(layerCount - 1, 1)

Use depth to calculate:

const baseY = height * (0.42 + depth * 0.1)
const layerAmplitude = amplitude * (0.45 + depth * 0.55)
const layerFrequency = frequency * (0.75 + depth * 0.35)
const layerSpeed = speed * (0.35 + depth * 0.65)

Do not call "Math.random()" inside the animation frame.

If randomness is used for phases, calculate it once before animation begins.

Optional grain

Add extremely subtle animated film grain after drawing the dunes.

Prefer a lightweight approach:

- Pre-generate a small noise canvas.
- Repeat it using "createPattern()".
- Draw it over the scene at very low opacity.
- Refresh the noise only occasionally, not every frame.

Target opacity:

0.015 to 0.035

The grain must be optional or subtle enough that mobile performance remains stable.

Visual overlays

The component may include CSS overlays above the canvas:

<div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(0,0,0,0.55)_100%)]" />
<div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />

These overlays help foreground text remain readable.

Example hero integration

import { Dunes } from "@/components/backgrounds/Dunes"

export function Hero() {
  return (
    <section className="relative isolate min-h-screen overflow-hidden bg-black">
      <Dunes
        className="-z-10"
        speed={0.17}
        amplitude={85}
        layers={6}
        interactive
        colors={[
          "#090014",
          "#140026",
          "#22003f",
          "#350660",
          "#58118c",
          "#7c3aed",
        ]}
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center px-6">
        <div className="max-w-3xl">
          <p className="mb-4 text-sm uppercase tracking-[0.35em] text-violet-300">
            Hookitup Solutions
          </p>

          <h1 className="text-5xl font-semibold tracking-tight text-white md:text-7xl">
            Intelligent systems beneath every experience.
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-white/65">
            Custom automation, software integrations and interactive digital
            experiences.
          </p>
        </div>
      </div>
    </section>
  )
}

Next.js compatibility

For Next.js App Router, add this at the top of "Dunes.tsx":

"use client"

This is required because the component uses browser APIs, refs, effects and canvas animation.

Do not access "window", "document" or "matchMedia" outside "useEffect".

Accessibility

The component is decorative.

Apply:

aria-hidden="true"

Do not add focusable elements.

Ensure that important page content is rendered separately above the canvas.

Performance requirements

The implementation should:

- Match the current gold themed color
- Must only be applied on the hero section
- Must still have a black transparent grainy overlay on it.
- Maintain approximately 60 FPS on a modern desktop.
- Remain smooth on common mobile devices.
- Avoid React state updates inside the animation loop.
- Avoid object allocation inside frequently executed loops where practical.
- Clamp DPR to "2".
- Use no more than approximately 350 samples per dune.
- Pause when the page is hidden.
- respect reduced-motion preferences.
- Cancel animation during unmount.
- Avoid WebGL unless the existing project already uses it.

Acceptance criteria

The task is complete when:

1. "Dunes.tsx" renders without errors.
2. It fills any relatively positioned parent.
3. Multiple dune silhouettes move at different speeds.
4. Pointer movement introduces subtle parallax.
5. Text placed above it remains clickable and readable.
6. It resizes correctly.
7. It behaves correctly on high-DPI displays.
8. It does not leak event listeners or animation frames.
9. Reduced-motion users receive a static version.
10. It works in both Vite React and Next.js with only the expected client-component adjustment.
11. All properties have sensible defaults.
12. The component contains no placeholder code or unfinished TODO comments.
