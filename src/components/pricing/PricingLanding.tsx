import { useEffect, useMemo, useState } from 'react'
import { api, type BillingPeriod, type PricingCatalog, type PricingRegion } from '../../lib/api'
import { detectPricingRegion } from '../../lib/pricing'
import BrandMark from '../BrandMark'
import './pricing-page.css'
import BillingToggle from './BillingToggle'
import PricingCard from './PricingCard'
import AddOns from './AddOns'
import PricingComparison from './PricingComparison'
import ProductFrame from '../marketing/ProductFrame'

export default function PricingLanding({
  onSignIn,
  onSignUp,
  onHome,
}: {
  onSignIn: () => void
  onSignUp: () => void
  onHome: () => void
}) {
  const [pricing, setPricing] = useState<PricingCatalog | null>(null)
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly')
  const [region, setRegion] = useState<PricingRegion>('OTHER')
  const [error, setError] = useState('')
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    let active = true
    const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
    const locale = typeof navigator !== 'undefined' ? navigator.language : undefined
    const detectedRegion = detectPricingRegion(undefined, locale, tz)
    setRegion(detectedRegion)
    api.pricing
      .get(detectedRegion)
      .then((catalog) => {
        if (active) {
          setPricing(catalog)
          setRegion(catalog.region)
        }
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Unable to load pricing.')
        }
      })
    return () => {
      active = false
    }
  }, [])

  const plans = useMemo(() => {
    if (!pricing?.plans) return []
    const rank: Record<string, number> = { solo: 0, pro: 1, studio: 2 }
    return [...pricing.plans].sort(
      (a, b) => (rank[a.planCode] ?? 9) - (rank[b.planCode] ?? 9),
    )
  }, [pricing])

  return (
    <main className="landing pricing-landing">
      <header className="landing-nav">
        <a className="landing-brand" href="#top" aria-label="lancee home" onClick={(event) => { event.preventDefault(); onHome() }}>
          <BrandMark />
          <span>lancee</span>
        </a>
        <nav id="pricing-navigation" className={navOpen ? 'is-open' : ''} aria-label="Public navigation">
          <a href="#top" aria-current="page" onClick={() => setNavOpen(false)}>Pricing</a>
          <div className="landing-nav__mobile-actions">
            <button className="landing-sign-in" onClick={() => { setNavOpen(false); onSignIn() }}>Sign in</button>
            <button className="button button--primary btn-shine" onClick={() => { setNavOpen(false); onSignUp() }}>Get started</button>
          </div>
        </nav>
        <button
          className="landing-menu-toggle"
          aria-controls="pricing-navigation"
          aria-expanded={navOpen}
          aria-label={navOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setNavOpen((current) => !current)}
        >
          <span className="landing-menu-toggle__bars" aria-hidden="true"><i /><i /><i /></span>
        </button>
        <div>
          <button className="landing-sign-in" onClick={onSignIn}>
            Sign in
          </button>
          <button className="button button--primary btn-shine" onClick={onSignUp}>
            Get started
          </button>
        </div>
      </header>

      <section className="pricing-page" id="top">
        <header className="pricing-header">
          <span className="pricing-landing__eyebrow">Pricing</span>
          <h1>Choose how you want to <em>work.</em></h1>
          <p>
            Start with the workspace you need today and expand as your business grows.
            Every new workspace includes a 14-day Solo trial.
          </p>
        </header>

        <ProductFrame label="Workspace plans" meta="Billing & plans" className="pricing-product-frame">
          <div className="pricing-controls">
            <BillingToggle billingPeriod={billingPeriod} onChange={setBillingPeriod} />
            {pricing && <span className="pricing-region-hint">{pricing.currency} · {region} pricing</span>}
          </div>

          {error && <p className="pricing-error" role="alert">{error}</p>}

          <section className="pricing-plans" aria-label="Pricing plans">
            {plans.length === 0 && !error && (
              <p className="pricing-error">Loading pricing…</p>
            )}
            {plans.map((plan) => (
              <PricingCard
                key={plan.id}
                plan={plan}
                billingPeriod={billingPeriod}
                current={false}
                busy={false}
                onSelect={() => onSignUp()}
              />
            ))}
          </section>
        </ProductFrame>

        <AddOns />
        <PricingComparison />

        <section className="pricing-enterprise">
          <div>
            <h2>Need something more specific?</h2>
            <p>
              For larger teams, custom integrations or dedicated workflows, we can configure
              lancee around the way your business operates.
            </p>
          </div>
          <a href="mailto:support@lancee.app?subject=Custom%20workspace" className="pricing-enterprise__link">
            Talk to us →
          </a>
        </section>
      </section>

      <footer className="landing-footer pricing-landing__footer">
        <div className="landing-footer__brand" aria-label="lancee">
          <BrandMark compact />
          <span>lancee</span>
        </div>
        <small>© {new Date().getFullYear()} lancee. All rights reserved.</small>
        <div className="landing-footer__links">
          <button onClick={onHome}>Back to home</button>
          <button onClick={onSignIn}>Sign in</button>
        </div>
      </footer>
    </main>
  )
}
