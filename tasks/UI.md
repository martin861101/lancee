# Agent Task: Full UI/UX Cleanup and Visual Polish

You are acting as a senior product designer and frontend engineer.

Your task is to inspect the entire application UI and perform a comprehensive visual cleanup.

## Primary Goal

Make the application feel:

* Modern
* Professional
* Premium
* Clean
* Calm
* Cohesive
* Intentional
* Easy to use

Do not simply fix obvious CSS bugs. Evaluate the UI as a designer.

If something looks awkward, dated, cluttered, inconsistent, unfinished, poorly spaced, visually unbalanced, or simply "doesn't look right", you have permission to redesign or adjust it.

Use your judgement.

## 1. Inspect Before Changing

First inspect the existing application and understand:

* Existing design language
* Brand identity
* Colour palette
* Typography
* Page structure
* Reusable components
* Navigation
* Cards
* Forms
* Tables
* Modals
* Empty states
* Loading states
* Responsive behaviour
* Existing animations and transitions

Do not immediately start rewriting components.

Determine what is already working well and preserve it.

The objective is refinement, not an unnecessary redesign.

## 2. Perform a Full Visual Audit

Review every accessible page and major UI state.

Look specifically for:

### Layout

Check:

* inconsistent container widths
* poor alignment
* excessive empty space
* cramped areas
* inconsistent page padding
* sections that do not visually connect
* content that feels too wide or too narrow
* awkward vertical spacing
* poor visual hierarchy

### Typography

Check:

* inconsistent font sizes
* incorrect font weights
* weak heading hierarchy
* excessive bold text
* poor line heights
* oversized or undersized text
* inconsistent muted text
* labels competing with primary content

Create a clear typography hierarchy across the application.

### Cards and Surfaces

Review:

* border radius
* borders
* shadows
* background colours
* nested cards
* unnecessary containers
* excessive visual boxes
* inconsistent card padding

Avoid the common "everything is a card" dashboard look.

Use whitespace and hierarchy where a container is unnecessary.

### Buttons and Actions

Ensure:

* primary actions are obvious
* secondary actions do not compete with primary actions
* destructive actions are appropriately differentiated
* button sizes are consistent
* icons align correctly
* button labels are clear
* hover/focus/disabled/loading states are polished

### Forms

Review:

* inputs
* dropdowns
* textareas
* switches
* checkboxes
* radio buttons
* validation
* helper text
* error states
* field spacing

Forms should feel polished and consistent.

### Navigation

Review:

* sidebar
* top navigation
* mobile navigation
* active states
* icons
* spacing
* grouping
* hierarchy

Navigation should feel calm and obvious rather than visually noisy.

### Tables and Data Views

Improve:

* row spacing
* header styling
* alignment
* actions
* empty states
* filters
* search
* pagination
* mobile behaviour

Avoid making tables unnecessarily heavy.

## 3. Visual Consistency

Standardise the application's design system.

Where practical, consolidate repeated values for:

* spacing
* typography
* radius
* shadows
* borders
* surface colours
* muted colours
* interactive states
* transitions

Prefer reusable design tokens/components over scattered one-off styling.

Do not introduce a completely new design system if the existing one can be cleaned up.

## 4. Premium Feel

The interface should feel like a polished commercial SaaS product.

Prefer:

* restrained use of colour
* strong typography
* generous but controlled whitespace
* subtle depth
* clean surfaces
* consistent alignment
* clear information hierarchy
* subtle interaction feedback
* purposeful animation

Avoid:

* excessive gradients
* glowing borders everywhere
* excessive shadows
* excessive glassmorphism
* huge rounded cards
* excessive pill-shaped elements
* unnecessary badges
* excessive animations
* giant headings
* random decorative elements
* excessive use of accent colours

Do not make the UI look like a generic AI-generated dashboard.

## 5. Use Visual Judgement

This is important.

You are explicitly authorised to change the visual design when something does not look right.

Do not limit yourself to fixing technical inconsistencies.

If a section technically works but visually feels weak, improve it.

Examples:

* Rebalance a layout.
* Change component proportions.
* Simplify a card.
* Remove unnecessary borders.
* Improve information hierarchy.
* Reposition an action.
* Reduce visual clutter.
* Improve spacing.
* Change typography.
* Simplify navigation.
* Replace awkward UI patterns.
* Improve empty states.
* Improve responsive layouts.

However, preserve the application's identity.

Do not redesign things merely for the sake of changing them.

## 6. Animations and Micro-interactions

Inspect existing animations and transitions.

Restore or improve animations that appear broken or missing.

Use motion subtly for:

* page transitions
* hover feedback
* dropdowns
* modals
* sidebars
* expandable sections
* loading states
* state changes

Animations should generally be quick and understated.

Do not turn the application into an animation showcase.

Respect `prefers-reduced-motion`.

## 7. Responsive Design

Test the UI at multiple viewport sizes.

At minimum inspect:

* desktop
* laptop
* tablet
* mobile

Look for:

* overflowing content
* broken grids
* cramped navigation
* bad wrapping
* oversized headings
* unusable tables
* clipped controls
* horizontal scrolling
* modals that exceed the viewport
* poor touch targets

Do not solve mobile problems by simply hiding important functionality.

## 8. Functional Safety

This task is primarily visual.

Do NOT:

* rewrite working business logic unnecessarily
* change API contracts
* modify database behaviour
* change authentication flows
* remove working functionality
* change application behaviour without a UI/UX reason

Keep visual refactors separated from functional changes wherever possible.

If you discover an unrelated functional bug, document it rather than performing a risky architectural change unless the fix is trivial and clearly safe.

## 9. Reuse Existing Components

Before creating new components:

1. Search for an existing component.
2. Determine whether it can be improved.
3. Improve the shared component if doing so benefits the application consistently.

Avoid creating multiple slightly different versions of:

* buttons
* cards
* inputs
* dialogs
* dropdowns
* badges
* tooltips
* navigation items

Reduce UI duplication where practical.

## 10. Accessibility

Maintain or improve:

* keyboard navigation
* focus states
* colour contrast
* labels
* semantic HTML
* screen-reader support
* touch target sizes
* reduced-motion support

Do not sacrifice accessibility for visual minimalism.

## 11. Remove Visual Debt

While reviewing the codebase, clean up UI-related technical debt where safe:

* obsolete CSS
* conflicting styles
* duplicated styles
* arbitrary spacing values
* inconsistent breakpoints
* unused UI components
* unnecessary wrappers
* obvious layout hacks

Do not perform unrelated codebase cleanup.

## 12. Validate Your Own Work

After implementation, perform another visual pass.

Do not assume the UI looks good because the code is cleaner.

Actually inspect the rendered result.

Ask yourself for every major screen:

"Would I confidently show this interface to a paying client?"

If not, continue refining it.

Pay particular attention to:

* first impressions
* alignment
* spacing
* hierarchy
* consistency
* navigation
* empty states
* forms
* responsiveness
* overall visual balance

Run the project's existing lint, typecheck, tests and build validation where available.

Fix regressions introduced by your changes.

## 13. Do Not Over-Engineer

Do not turn this task into a large architecture rewrite.

Prefer high-impact visual improvements over unnecessary abstraction.

A simple CSS/layout improvement is better than introducing a complicated component framework just to achieve the same result.

## Final Deliverable

Once complete, provide:

### Changes Made

Summarise the major UI improvements.

### Design System Changes

List any changes to shared:

* typography
* spacing
* colours
* surfaces
* borders
* radius
* shadows
* buttons
* inputs
* animations

### Components Changed

List the major components/pages modified.

### Responsive Improvements

Explain important mobile/tablet changes.

### Functional Changes

Explicitly list any functional behaviour changed.

If none:

`Functional behaviour changed: None`

### Validation

Report:

* build
* typecheck
* lint
* tests
* responsive inspection

### Remaining Issues

List anything you believe still requires attention.

Do not claim completion if important screens remain visually inconsistent.

## Decision Rule

When uncertain whether to make a visual improvement, use this rule:

"If this were a premium commercial product being presented to a client tomorrow, would I leave it like this?"

If the answer is no, improve it.
