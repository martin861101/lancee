import { useState } from 'react'
import { comparisonGroups } from './pricing-data'

function CellValue({ value }: { value: 'included' | 'partial' | '—' }) {
  if (value === '—') {
    return <span className="comparison-cell comparison-cell--none" aria-hidden="true">—</span>
  }
  if (value === 'partial') {
    return (
      <span className="comparison-cell comparison-cell--partial" title="Included with limits">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </span>
    )
  }
  return (
    <span className="comparison-cell comparison-cell--yes" aria-label="Included">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m5 12 4 4L19 6" />
      </svg>
    </span>
  )
}

export default function PricingComparison() {
  const [openGroup, setOpenGroup] = useState<string | null>(
    comparisonGroups[0]?.id || null,
  )

  return (
    <section className="pricing-comparison" aria-labelledby="comparison-heading">
      <div className="pricing-section-heading">
        <span className="micro-label">Compare plans</span>
        <h2 id="comparison-heading">What each workspace includes</h2>
      </div>

      <div className="pricing-comparison__wrap">
        <div className="pricing-comparison__header">
          <span className="pricing-comparison__corner" aria-hidden="true" />
          <span className="pricing-comparison__col pricing-comparison__col--solo">Solo</span>
          <span className="pricing-comparison__col pricing-comparison__col--pro">Pro</span>
          <span className="pricing-comparison__col pricing-comparison__col--studio">Studio</span>
        </div>

        {comparisonGroups.map((group) => {
          const open = openGroup === group.id
          return (
            <div key={group.id} className={`comparison-group${open ? ' is-open' : ''}`}>
              <button
                type="button"
                className="comparison-group__toggle"
                aria-expanded={open}
                onClick={() => setOpenGroup(open ? null : group.id)}
              >
                <span className="comparison-group__chevron" aria-hidden="true">▸</span>
                {group.group}
              </button>
              {open && (
                <div className="comparison-group__rows">
                  {group.rows.map((row) => (
                    <div key={row.label} className="comparison-row">
                      <span className="comparison-row__label">{row.label}</span>
                      <span className="comparison-row__cell"><CellValue value={row.solo} /></span>
                      <span className="comparison-row__cell"><CellValue value={row.pro} /></span>
                      <span className="comparison-row__cell"><CellValue value={row.studio} /></span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}