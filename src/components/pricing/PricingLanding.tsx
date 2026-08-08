import { useEffect, useMemo, useState } from 'react'
import { api, type BillingPeriod, type PricingCatalog, type PricingRegion } from '../../lib/api'
import './pricing-page.css'
import BillingToggle from './BillingToggle'
import PricingCard from './PricingCard'
import AddOns from './AddOns'
import PricingComparison from './PricingComparison'
import { regions } from './pricing-data'

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
  const [region, setRegion] = useState<PricingRegion>('ZA')
  const [error, setError] = useState('')

  const loadPricing = async (targetRegion: PricingRegion) => {
    try {
      const catalog = await api.pricing.get(targetRegion)
      setPricing(catalog)
      setRegion(targetRegion)
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load pricing.')
    }
  }

  useEffect(() => {
    let active = true
    api.pricing
      .get()
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
          <span className="pricing-brand-mark" aria-hidden="true">◆</span>
          <span>lancee</span>
        </a>
        <nav aria-label="Public navigation">
          <a href="#top" aria-current="page">Pricing</a>
        </nav>
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
          <h1>Choose how you want to work</h1>
          <p>
            Start with the workspace you need today and expand as your business grows.
            Every new workspace includes a 14-day Solo trial.
          </p>
        </header>

        <div className="pricing-controls">
          <BillingToggle billingPeriod={billingPeriod} onChange={setBillingPeriod} />
          <div className="pricing-region" role="group" aria-label="Billing region">
            <label>Billing region</label>
            <div className="pricing-region__options">
              {regions.map((r) => (
                <button
                  key={r.code}
                  type="button"
                  className={region === r.code ? 'is-active' : ''}
                  aria-pressed={region === r.code}
                  onClick={() => void loadPricing(r.code)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
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

      <footer className="pricing-landing__footer">
        <a href="#top" onClick={(event) => { event.preventDefault(); onHome() }}>Back to home</a>
        <a href="#top" onClick={(event) => { event.preventDefault(); onSignIn() }}>Sign in</a>
      </footer>
    </main>
  )
}