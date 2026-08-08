import type { BillingPeriod } from '../../lib/api'

export default function BillingToggle({
  billingPeriod,
  onChange,
}: {
  billingPeriod: BillingPeriod
  onChange: (period: BillingPeriod) => void
}) {
  return (
    <div className="pricing-billing-toggle" role="group" aria-label="Billing frequency">
      <button
        type="button"
        className={billingPeriod === 'monthly' ? 'is-active' : ''}
        aria-pressed={billingPeriod === 'monthly'}
        onClick={() => onChange('monthly')}
      >
        Monthly
      </button>
      <button
        type="button"
        className={billingPeriod === 'yearly' ? 'is-active' : ''}
        aria-pressed={billingPeriod === 'yearly'}
        onClick={() => onChange('yearly')}
      >
        Yearly
        <span className="billing-toggle__save">Save 2 months</span>
      </button>
    </div>
  )
}