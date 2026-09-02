import type { ReactNode } from 'react'

export default function ProductFrame({
  label,
  meta = 'Connected workspace',
  className = '',
  children,
}: {
  label: string
  meta?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`product-frame ${className}`.trim()}>
      <header className="product-frame__bar">
        <span className="product-frame__controls" aria-hidden="true"><i /><i /><i /></span>
        <strong>{label}</strong>
        <span className="product-frame__status"><i /> {meta}</span>
      </header>
      <div className="product-frame__content">{children}</div>
    </div>
  )
}
