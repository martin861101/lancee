import { motion } from 'motion/react'
import type { BillingPeriod, PricingPlan } from '../../lib/api'
import { planCopy } from './pricing-data'
import { formatPrice } from '../../lib/pricing'

export default function PricingCard({
  plan,
  billingPeriod,
  current,
  busy,
  onSelect,
}: {
  plan: PricingPlan
  billingPeriod: BillingPeriod
  current: boolean
  busy: boolean
  onSelect: (plan: PricingPlan, billingPeriod: BillingPeriod) => void
}) {
  const copy = planCopy[plan.planCode]
  const amount = billingPeriod === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice
  const badge = plan.recommended
    ? 'Recommended'
    : plan.planCode === 'solo'
      ? 'Starter'
      : 'For teams'

  return (
    <motion.article
      className={`pricing-card${plan.recommended ? ' is-recommended' : ''}${current ? ' is-current' : ''}`}
      animate={{ y: plan.recommended ? -3 : 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      aria-label={`${plan.name} plan`}
    >
      <div className="pricing-card__top">
        <span className="pricing-card__block">{badge}</span>
        {plan.recommended && <span className="pricing-card__badge">Recommended</span>}
      </div>

      <h3 className="pricing-card__name">{plan.name}</h3>

      <div className="pricing-card__price" aria-live="polite">
        <motion.span
          key={`${plan.id}-${billingPeriod}`}
          className="pricing-card__amount"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
          {formatPrice(amount, plan.currency)}
        </motion.span>
        {plan.perUser && <span className="pricing-card__unit"> per user</span>}
        <span className="pricing-card__period"> / month</span>
      </div>

      {billingPeriod === 'yearly' && (
        <p className="pricing-card__save">
          Or {formatPrice(plan.yearlyPrice, plan.currency)} one time, billed yearly
        </p>
      )}

      <p className="pricing-card__tagline">{copy.tagline}</p>

      <button
        type="button"
        className="pricing-card__cta"
        disabled={busy || current}
        onClick={() => onSelect(plan, billingPeriod)}
      >
        {current ? copy.ctaActive : copy.cta}
      </button>

      <ul className="pricing-card__features" aria-label={`${plan.name} features`}>
        {copy.features.map((feature) => (
          <li key={feature.label}>
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m5 12 4 4L19 6" />
            </svg>
            <span>{feature.label}</span>
          </li>
        ))}
      </ul>
    </motion.article>
  )
}
