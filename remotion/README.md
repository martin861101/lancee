# Storefront preview render

The dashboard uses the `public/storefront-preview*.mp4` files for the Storefront
tab. The composition is defined in `src/StorefrontPreview.tsx` and keeps one
shared flow across styles: hero, product grid, scroll, and checkout. The
composition accepts the five dashboard template ids as themed props.

From the repository root, render a fresh clip with:

```bash
npx remotion render remotion/src/index.tsx StorefrontPreview public/storefront-preview.mp4 --codec=h264
```

The additional compositions are `StorefrontPreview-blue-splash`,
`StorefrontPreview-gold-dune`, `StorefrontPreview-red-tech`, and
`StorefrontPreview-gsap-flowish`.

## Dashboard tour

`DashboardTour` presents real 1440×900 browser captures of every dashboard page
inside a 1920×1080, 30 fps composition. Render the approximately 35-second H.264
clip from the repository root with:

```bash
npm --prefix remotion run render:dashboard
```

The output is `public/dashboard-tour.mp4`; the numbered source images are in
`remotion/public/dashboard-tour/`. Update the page order and labels in
`src/dashboard-tour/scenes.ts`.
