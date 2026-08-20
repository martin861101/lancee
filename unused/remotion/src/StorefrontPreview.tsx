import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
} from 'remotion'

const products = [
  { name: 'Dash shoes', detail: 'Shoes', price: '$54.00', tone: '#d8e5ff', mark: 'shoe' },
  { name: 'Card 50', detail: 'Gift cards', price: '$50.00', tone: '#ece7df', mark: 'card' },
  { name: 'Everyday hoodie', detail: 'Apparel', price: '$84.00', tone: '#d8d8d5', mark: 'hoodie' },
  { name: 'Studio mug', detail: 'Accessories', price: '$18.00', tone: '#d6d2e8', mark: 'mug' },
]

export type StorefrontTemplateId = 'black-white' | 'blue-splash' | 'gold-dune' | 'red-tech' | 'gsap-flowish'

const themes: Record<StorefrontTemplateId, {
  page: string
  panel: string
  surface: string
  ink: string
  muted: string
  accent: string
  line: string
  brand: string
  eyebrow: string
  title: string
  description: string
}> = {
  'black-white': {
    page: '#f2f1ee', panel: '#fff', surface: '#fafaf9', ink: '#16191d', muted: '#777b80', accent: '#16191d', line: '#e2e2df',
    brand: 'ACME', eyebrow: 'A quieter way to shop', title: 'Objects with a point of view.', description: 'Simple products, considered details, and a checkout that stays out of the way.',
  },
  'blue-splash': {
    page: '#07070a', panel: '#101017', surface: '#0c0c12', ink: '#e8e8f0', muted: '#9696a6', accent: '#6c5ce7', line: '#252535',
    brand: 'BLUE//SPLASH', eyebrow: 'A brighter way to shop', title: 'Make every launch feel inevitable.', description: 'Products with momentum, clear choices, and a checkout that keeps moving.',
  },
  'gold-dune': {
    page: '#070705', panel: '#0e0c07', surface: '#0a0a08', ink: '#e8e4da', muted: '#8a887a', accent: '#f6d365', line: '#3b311c',
    brand: 'GOLD DUNE', eyebrow: 'Collected slowly', title: 'Objects made for the long way around.', description: 'Warm materials, considered details, and products worth taking your time with.',
  },
  'red-tech': {
    page: '#0c0c0c', panel: '#111111', surface: '#161616', ink: '#e0e0e0', muted: '#888888', accent: '#ff4422', line: '#333333',
    brand: 'RED//TECH', eyebrow: '> curated_products', title: 'Ship better things.', description: 'A sharp catalog for people who prefer useful details over unnecessary noise.',
  },
  'gsap-flowish': {
    page: '#0b1220', panel: '#e7eef8', surface: '#f6f9fc', ink: '#182333', muted: '#5e718c', accent: '#426a98', line: '#c6d1df',
    brand: 'FLOWISH', eyebrow: 'Move through the collection', title: 'Find the next beautiful thing.', description: 'An immersive product gallery that turns browsing into a small journey.',
  },
}

const ease = Easing.bezier(0.16, 1, 0.3, 1)

function ProductMark({ mark, accent, ink }: { mark: string; accent: string; ink: string }) {
  if (mark === 'shoe') {
    return <span style={{ width: 120, height: 42, borderRadius: '70% 16% 16% 16%', background: '#fff', border: `6px solid ${accent}`, rotate: '-8deg' }} />
  }
  if (mark === 'card') {
    return <span style={{ width: 108, height: 72, background: '#fff', border: `2px solid ${ink}55`, display: 'grid', placeItems: 'center', color: accent, fontSize: 25, fontWeight: 800 }}>50</span>
  }
  if (mark === 'hoodie') {
    return <span style={{ width: 90, height: 112, borderRadius: '28px 28px 12px 12px', background: '#8e969b', boxShadow: `0 12px 0 -4px ${accent}`, color: ink, display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800 }}>S</span>
  }
  return <span style={{ width: 66, height: 78, borderRadius: '8px 8px 18px 18px', background: ink, boxShadow: `14px -10px 0 -8px ${accent}` }} />
}

function ProductCard({ product, index, theme }: { product: typeof products[number]; index: number; theme: typeof themes[StorefrontTemplateId] }) {
  const frame = useCurrentFrame()
  const reveal = interpolate(frame, [92 + index * 8, 116 + index * 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  })

  return (
    <article
      style={{
        opacity: reveal,
        translate: `0px ${interpolate(reveal, [0, 1], ['24px', '0px'])}`,
      }}
    >
      <div style={{ height: 180, display: 'grid', placeItems: 'center', background: product.tone }}>
        <ProductMark mark={product.mark} accent={theme.accent} ink={theme.ink} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, paddingTop: 12, color: theme.ink, fontSize: 14, fontWeight: 700 }}>
        <span>{product.name}</span>
        <span>{product.price}</span>
      </div>
      <span style={{ display: 'block', marginTop: 5, color: theme.muted, fontSize: 12 }}>{product.detail}</span>
    </article>
  )
}

export const StorefrontPreview = ({ template = 'black-white' }: { template?: StorefrontTemplateId }) => {
  const theme = themes[template] || themes['black-white']
  const frame = useCurrentFrame()
  const scrollOffset = interpolate(frame, [76, 112, 194, 232], [0, 0, 238, 310], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  })
  const heroOpacity = interpolate(frame, [72, 112, 154], [1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  })
  const checkoutProgress = interpolate(frame, [174, 214], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  })
  const introOpacity = interpolate(frame, [0, 18, 42], [0, 1, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: ease,
  })

  return (
    <AbsoluteFill style={{ background: theme.page, color: theme.ink, fontFamily: template === 'red-tech' ? 'monospace' : 'Arial, sans-serif', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, opacity: .22, backgroundImage: `linear-gradient(135deg, transparent 0 49.8%, ${theme.accent} 50% 50.3%, transparent 50.5%)`, backgroundSize: '240px 240px' }} />
      <div style={{ position: 'absolute', top: 24, left: 46, zIndex: 3, display: 'flex', alignItems: 'center', gap: 14, opacity: introOpacity }}>
        <span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 10, color: theme.page, background: theme.accent, fontWeight: 800 }}>↗</span>
        <span style={{ color: theme.muted, fontSize: 14, letterSpacing: '.08em', textTransform: 'uppercase' }}>{theme.brand} storefront</span>
      </div>

      <div style={{ position: 'absolute', top: 54, right: 42, bottom: 26, left: 42, overflow: 'hidden', border: `1px solid ${theme.line}`, borderRadius: 20, background: theme.panel, boxShadow: '0 30px 80px rgba(20, 24, 30, .18)' }}>
        <header style={{ position: 'relative', zIndex: 2, height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', borderBottom: `1px solid ${theme.line}`, background: theme.panel }}>
          <strong style={{ fontSize: 20, letterSpacing: '-.06em' }}>{theme.brand}</strong>
          <nav style={{ display: 'flex', gap: 28, marginLeft: 80, color: theme.muted, fontSize: 13 }}><span style={{ color: theme.accent, fontWeight: 700 }}>All</span><span>Apparel</span><span>Accessories</span></nav>
          <div style={{ display: 'flex', gap: 18, color: theme.ink, fontSize: 20 }}><span>♙</span><span>▢</span></div>
        </header>

        <main style={{ position: 'absolute', top: 62, right: 0, bottom: 0, left: 0, overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, right: 28, left: 28, translate: `0px ${-scrollOffset}px` }}>
            <section style={{ height: 250, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 44px', background: theme.surface, opacity: heroOpacity }}>
              <div style={{ maxWidth: 480 }}>
                <span style={{ color: theme.accent, fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>{theme.eyebrow}</span>
                <h1 style={{ margin: '16px 0 12px', color: theme.ink, fontSize: 48, lineHeight: 1, letterSpacing: '-.07em' }}>{theme.title}</h1>
                <p style={{ margin: 0, color: theme.muted, fontSize: 16 }}>{theme.description}</p>
              </div>
              <div style={{ width: 220, height: 160, display: 'grid', placeItems: 'center', background: `${theme.accent}22` }}><span style={{ width: 100, height: 108, borderRadius: '45% 45% 12% 12%', background: theme.accent, boxShadow: `20px 18px 0 -8px ${theme.ink}` }} /></div>
            </section>
            <section style={{ padding: '32px 0 60px' }}>
              <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', marginBottom: 18 }}><div><span style={{ color: theme.accent, fontSize: 12 }}>CURATED FOR YOU</span><h2 style={{ margin: '7px 0 0', color: theme.ink, fontSize: 26, letterSpacing: '-.04em' }}>Featured products</h2></div><span style={{ color: theme.muted, fontSize: 13 }}>12 products →</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>{products.map((product, index) => <ProductCard key={product.name} product={product} index={index} theme={theme} />)}</div>
            </section>
          </div>
          <div style={{ position: 'absolute', right: 20, bottom: 18, left: 20, height: 3, background: theme.line }}><span style={{ display: 'block', width: `${interpolate(frame, [0, 240], [12, 92], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}%`, height: '100%', background: theme.accent }} /></div>
        </main>

        <aside style={{ position: 'absolute', zIndex: 4, top: 62, right: 0, bottom: 0, width: 325, padding: 24, translate: `${interpolate(checkoutProgress, [0, 1], ['325px', '0px'])} 0px`, color: theme.ink, background: theme.panel, borderLeft: `1px solid ${theme.line}`, boxShadow: '-22px 0 38px rgba(20, 24, 30, .13)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 18, borderBottom: `1px solid ${theme.line}` }}><strong style={{ fontSize: 19 }}>Checkout</strong><span style={{ color: theme.muted, fontSize: 12 }}>1 item</span></div>
          <div style={{ marginTop: 22, padding: 14, background: theme.surface }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700 }}><span>Studio mug</span><span>$18.00</span></div><span style={{ display: 'block', marginTop: 7, color: theme.muted, fontSize: 12 }}>Qty 1 · Accessories</span></div>
          <div style={{ display: 'grid', gap: 12, marginTop: 25 }}>{['Email address', 'Shipping address', 'Payment method'].map((label) => <div key={label}><span style={{ display: 'block', marginBottom: 6, color: theme.muted, fontSize: 11 }}>{label}</span><div style={{ height: 31, border: `1px solid ${theme.line}`, borderRadius: 4 }} /></div>)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 26, paddingTop: 18, borderTop: `1px solid ${theme.line}`, fontSize: 14, fontWeight: 700 }}><span>Total</span><span>$18.00</span></div>
          <div style={{ marginTop: 18, padding: '12px 14px', color: theme.page, background: theme.accent, borderRadius: 4, textAlign: 'center', fontSize: 13, fontWeight: 700 }}>Continue to payment</div>
        </aside>
      </div>
    </AbsoluteFill>
  )
}
