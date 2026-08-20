# Landing page motion

The public landing page uses native document scrolling and GSAP heading
reveals. The former particle-scroll renderer was removed after mobile Chrome
showed incomplete and corrupted hero captures.

## Heading reveals

`LandingPage` in `src/App.tsx` splits the hero title into two masked lines. GSAP
reveals the eyebrow and title lines on entry using translation, blur, opacity,
and a small rotation.

An `IntersectionObserver` watches the later landing-page `h2` and `h3`
elements against the browser viewport. Each heading reveals once and is then
unobserved. Animation properties are cleared afterward so they do not interfere
with responsive layout.

## Ambient motion and navigation

CSS animations add a slow floating treatment to the hero status summary,
subtle movement to its progress and activity data, and a continuous,
duplicated workspace marquee below the hero. The marquee uses paired copies of
the same content so the loop has no visible gap.

The landing navigation remains sticky within normal document flow. The page
clips only horizontal overflow, allowing the header to stay attached to the top
of the viewport, while a translucent background and backdrop blur create the
glass effect.

The footer credit uses an animated neutral-to-purple gradient clipped to the
text. Integration brand marks are inline SVG and CSS, so the landing page does
not rely on a third-party icon host.

## Accessibility and reliability

- The complete semantic hero is present on the first render.
- The page uses the browser's normal scrolling behavior.
- No canvas, DOM snapshot, or WebGL layer can cover the hero content.
- `prefers-reduced-motion: reduce` skips the GSAP and ambient CSS animations.
- The duplicated marquee set is hidden from assistive technology.
- Buttons, links, keyboard focus, selection, and reading order remain native.

## Verification

Run:

```sh
npm run build
npm run lint
```

For manual testing, check refresh, wheel and touch scrolling, navigation hash
links, sign-in actions, narrow mobile layouts, and reduced-motion behavior.
