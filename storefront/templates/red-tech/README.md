# Hookit Easy — Red

A dark, terminal-inspired landing page template with GSAP transitions and Three.js/OGL canvas effects. Built with React, TypeScript, Vite.

## Features

- Terminal-themed hero with ASCII art (Three.js) and glowing orb (OGL)
- Glitch text and split text animations
- Animated beams and shiny text components
- Scroll-triggered GSAP animations

## Getting Started

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Page structure

- `src/App.tsx` — Root composition
- `src/components/` — Animated text and WebGL/canvas effects
- `src/index.css` — Global theme and responsive styles

## Troubleshooting

### The page is completely blank

Open the browser console and check for runtime errors. After changing code, verify both the compiler and browser:

```bash
npm run build
```

### WebGL effects are unavailable

The Orb, ASCII text, and Beams effects require browser WebGL support. The page content remains readable without them.
