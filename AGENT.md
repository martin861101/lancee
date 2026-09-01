# Agent Prompt — lancee.work Dark Theme & Card Styling Fix

Paste everything below into your coding agent (Claude Code or similar) working in the lancee.work repo.

---

## Context

The lancee.work landing page has a color/styling inconsistency. There are two reference screenshots I'm giving you (`54306.jpg` and `54309.jpg`).

**Root cause hypothesis to verify first:** the site's current theme color (`meta[theme-color] = #151813`, a warm near-black) is not the navy tone used in the approved hero design. Find wherever this "dark background" token is defined (Tailwind config, CSS custom properties, theme file, styled-components theme, etc.) and confirm whether nested surfaces (cards, pills, badges) are falling back to a default *light* surface color because a proper *dark elevated surface* token was never defined. That mismatch is almost certainly why some containers render white/cream inside dark sections instead of a darker tone.

## Objective

1. Make every dark-background section on the page match the navy tone from `54306.jpg` (currently only the hero appears correct).
2. Recolor the light/white/cream nested container cards and pills flagged in `54309.jpg` to a darker, theme-consistent color.
3. Do a full layout/styling QA pass — spacing, alignment, section rhythm, and typography should be visually consistent site-wide, not just in the hero.

Do not change any copy, content, or component logic — visual/styling only.

## Reference colors (sampled directly from the screenshots — treat as ground truth, adjust only if they clash with existing accent colors elsewhere on the site)

**From `54306.jpg` (correct dark section — use this as the canonical dark theme):**
| Element | Sampled color |
|---|---|
| Page background (base navy, corners) | `#151A2E` – `#161D30` |
| Page background (gradient toward center/bottom, lighter) | `#1E2945` – `#19253D` |
| Primary CTA button fill | `#3E72E0` |
| Primary CTA button edge/shadow | `#153170` |
| Eyebrow accent dot (gradient) | `#B24DC5` → pink/purple |
| Heading text | near-white, `#F5F6FA` |

**From `54309.jpg` (elements the red arrows flag as wrong — currently light, need to go dark):**
| Element | Current (wrong) color | Fix |
|---|---|---|
| "Connected to Project" status pill | `#DAE2CC` (pale sage) | Recolor to a dark elevated-surface tone consistent with the other pills next to it (those already sample at `#1A2133`, matching the tab bar) |
| "Client Attention" nested card background | `#F4F6F1` (near-white) | Recolor to a dark elevated surface — one step lighter than the page background, e.g. in the `#1B2338`–`#232C4C` range, NOT pure white/cream |
| "Attention level" bar track | `#FEF7ED` (cream) | Recolor track to a dark tone (e.g. `#2A3350`); **keep the orange fill (`#E9AB54`) as-is** — it's a good accent against dark |
| "Email / Meetings / Feedback" pill badges | `#DEE6F1` (light blue-gray) | Recolor to same dark elevated-surface tone as above |

**Text/contrast rule:** anywhere a background moves from light to dark, the text and icon colors on top of it must invert too (dark text → light text, e.g. `#F1F3F8` primary / `#9AA3BE` for secondary/muted labels like "CLIENT ATTENTION"). Keep semantic accent colors as-is (green up-arrows, orange attention bar) — they should still pop against the new dark surface.

## Task list

1. **Audit** every component in the codebase that currently renders a white/cream/light-gray background — not just the two flagged in the screenshot, since this pattern (light "card-in-card") is likely repeated elsewhere on the page. Grep for the specific hex/rgb values above or their nearest token names.
2. **Define or fix the design tokens**, don't hardcode: a `--bg-page-dark` (or equivalent) matching the `54306.jpg` navy, and a `--bg-surface-dark` (elevated card) one step lighter, so every component pulls from the same source instead of one-off colors.
3. **Apply the new dark background** to every section that's supposed to be dark, using the gradient direction/values sampled above — right now only the hero matches; other dark sections are likely still on the old `#151813` token.
4. **Recolor the flagged light components** (status pill, nested card, progress bar track, badge pills) per the table above, and invert their text/icon colors for contrast.
5. **General layout/styling pass:** compare each section against the two reference mockups and fix any drift — inconsistent section padding, misaligned card grids, inconsistent border-radius between cards/pills/buttons, and typography scale that doesn't match the hero's weight/tracking.
6. **Contrast check**: verify light text on the new dark surfaces meets at least WCAG AA (4.5:1 for body text).
7. Build/run the site locally and visually diff each section against `54306.jpg` and `54309.jpg` before calling this done.

## Acceptance criteria

- [ ] All dark sections use the same navy background family — no section still on the old near-black `#151813` tone.
- [ ] No white/cream card, pill, or badge remains inside a dark section.
- [ ] Orange attention-bar fill and green up-arrow accents are unchanged and still legible.
- [ ] Text contrast on all recolored surfaces passes AA.
- [ ] No copy/content/logic changes — diff should be styling-only.
- [ ] Spacing, alignment, and typography are consistent across every section of the page, not just the hero.
