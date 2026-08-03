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
