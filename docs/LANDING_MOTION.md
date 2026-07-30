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

## Accessibility and reliability

- The complete semantic hero is present on the first render.
- The page uses the browser's normal scrolling behavior.
- No canvas, DOM snapshot, or WebGL layer can cover the hero content.
- `prefers-reduced-motion: reduce` skips the GSAP animations.
- Buttons, links, keyboard focus, selection, and reading order remain native.

## Verification

Run:

```sh
npm run build
npm run lint
```

For manual testing, check refresh, wheel and touch scrolling, navigation hash
links, sign-in actions, narrow mobile layouts, and reduced-motion behavior.
