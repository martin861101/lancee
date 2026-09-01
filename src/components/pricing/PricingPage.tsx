import { useEffect, useMemo, useState } from 'react'
import {
  api,
  type BillingPeriod,
  type PricingCatalog,
  type PricingRegion,
  type Subscription,
} from '../../lib/api'
import { detectPricingRegion } from '../../lib/pricing'
import './pricing-page.css'
import BillingToggle from './BillingToggle'
import PricingCard from './PricingCard'
import AddOns from './AddOns'
import PricingComparison from './PricingComparison'

export default function PricingPage({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const [pricing, setPricing] = useState<PricingCatalog | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly')
  const [region, setRegion] = useState<PricingRegion>('ZA')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([api.subscription.get().catch(() => null), api.workspace.getContext().catch(() => null)])
      .then(([subResult, context]) => {
        if (!active) return
        if (subResult) {
          setSubscription(subResult.subscription)
          setBillingPeriod(subResult.subscription.billingPeriod || 'monthly')
          const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
          const resolvedRegion = subResult.subscription.isPersisted
            ? subResult.subscription.region
            : detectPricingRegion(context?.location?.country, typeof navigator !== 'undefined' ? navigator.language : undefined, tz)
          setRegion(resolvedRegion)
          return api.pricing.get(resolvedRegion).then((catalog) => {
            if (active) setPricing(catalog)
          })
        } else {
          const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
          const resolvedRegion = detectPricingRegion(context?.location?.country, typeof navigator !== 'undefined' ? navigator.language : undefined, tz)
          setRegion(resolvedRegion)
          return api.pricing.get(resolvedRegion).then((catalog) => {
            if (active) setPricing(catalog)
          })
        }
      })
      .catch((caught) => {
        if (!active) return
        setError(caught instanceof Error ? caught.message : 'Unable to load your plan.')
      })
      .finally(() => {
        if (active) setLoading(false)
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

  const currentPlanActive =
    subscription?.status === 'active' ? subscription.planCode : null

  const selectPlan = async (
    planCode: NonNullable<typeof currentPlanActive>,
    period: BillingPeriod,
  ) => {
    if (busy) return
    setBusy(planCode)
    try {
      const updated = await api.subscription.update({
        planCode,
        billingPeriod: period,
        region,
      })
      setSubscription(updated.subscription)
      onToast(updated.subscription.status === 'trial'
        ? 'Your workspace is on the Solo trial'
        : 'Workspace plan updated')
      const catalog = await api.pricing.get(updated.subscription.region)
      setPricing(catalog)
      setRegion(updated.subscription.region)
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : 'Unable to update your plan.')
    } finally {
      setBusy('')
    }
  }

  if (loading) {
    return (
      <div className="page pricing-page pricing-page--loading">
        <span className="micro-label">Pricing</span>
        <div className="pricing-loading" aria-label="Loading pricing">
          <div className="pricing-loading__card" />
          <div className="pricing-loading__card" />
          <div className="pricing-loading__card" />
        </div>
      </div>
    )
  }

  return (
    <div className="page pricing-page">
      <header className="pricing-header">
        <span className="micro-label">Pricing</span>
        <h1>Choose how you want to work</h1>
        <p>Start with the workspace you need today and expand as your business grows.</p>
      </header>

      <div className="pricing-controls">
        <BillingToggle billingPeriod={billingPeriod} onChange={setBillingPeriod} />
        {pricing && <span className="pricing-region-hint">{pricing.currency} · {region} pricing</span>}
      </div>

      {subscription?.isOnTrial && (
        <div className="pricing-trial" role="status">
          <strong>You're on a 14-day Solo trial</strong>
          <span>{subscription.trialDaysLeft} days left — your workspace stays fully available.</span>
        </div>
      )}

      {error && <p className="pricing-error" role="alert">{error}</p>}

      <section className="pricing-plans" aria-label="Pricing plans">
        {plans.map((plan) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            billingPeriod={billingPeriod}
            current={currentPlanActive === plan.planCode}
            busy={busy !== ''}
            onSelect={(chosen, period) => void selectPlan(chosen.planCode, period)}
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
    </div>
  )
}
