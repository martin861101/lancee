import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  api,
  type CreatePaystackPaymentLinkInput,
  type MoneyInvoice,
  type PaystackConnection,
} from '../lib/api'
import './money-page.css'

const providers = [
  {
    id: 'stripe',
    name: 'Stripe',
    mark: 'S',
    note: 'Cards and bank transfers',
    tone: 'stripe',
  },
  {
    id: 'paypal',
    name: 'PayPal',
    mark: 'P',
    note: 'PayPal and card checkout',
    tone: 'paypal',
  },
  {
    id: 'paystack',
    name: 'Paystack',
    mark: 'P',
    note: 'Server-side ZAR payment links',
    tone: 'paystack',
  },
] as const

function Icon({
  name,
}: {
  name:
    | 'plus'
    | 'arrow'
    | 'more'
    | 'check'
    | 'clock'
    | 'link'
    | 'close'
    | 'copy'
    | 'refresh'
}) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="m9 18 6-6-6-6" />,
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" />
      </>
    ),
    close: <path d="m6 6 12 12M18 6 6 18" />,
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 11a8 8 0 1 0-2.3 5.7" />
        <path d="M20 4v7h-7" />
      </>
    ),
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function formatMoney(amountMinor: number, currency = 'ZAR') {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100)
}

function formatDate(value: string | null) {
  if (!value) return 'No due date'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('en-ZA', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(date)
}

function statusLabel(status: MoneyInvoice['status']) {
  return {
    initializing: 'Processing',
    pending: 'Awaiting payment',
    paid: 'Paid',
    failed: 'Failed',
  }[status]
}

const emptyForm = {
  clientName: '',
  clientEmail: '',
  projectName: '',
  description: '',
  amount: '',
  dueDate: '',
}

export default function MoneyPage() {
  const [showInvoice, setShowInvoice] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  const [connection, setConnection] = useState<PaystackConnection | null>(null)
  const [invoices, setInvoices] = useState<MoneyInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState(emptyForm)

  const loadMoney = async () => {
    setLoading(true)
    try {
      const [paystackStatus, invoiceData] = await Promise.all([
        api.money.getPaystackStatus(),
        api.money.listInvoices(),
      ])
      setConnection(paystackStatus)
      setInvoices(invoiceData)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to load Money.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadMoney()
  }, [])

  const paidTotal = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.status === 'paid')
        .reduce((sum, invoice) => sum + invoice.amountMinor, 0),
    [invoices],
  )
  const outstanding = useMemo(
    () =>
      invoices
        .filter((invoice) => ['initializing', 'pending'].includes(invoice.status))
        .reduce((sum, invoice) => sum + invoice.amountMinor, 0),
    [invoices],
  )
  const upcoming = invoices
    .filter((invoice) => invoice.status === 'pending')
    .slice(0, 2)

  const updateForm = (field: keyof typeof emptyForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const createPaymentLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount < 1) {
      setFormError('Enter an amount of at least R 1.00.')
      return
    }
    const input: CreatePaystackPaymentLinkInput = {
      clientName: form.clientName,
      clientEmail: form.clientEmail,
      projectName: form.projectName,
      description: form.description || form.projectName,
      amountMinor: Math.round(amount * 100),
      currency: 'ZAR',
      dueDate: form.dueDate || null,
    }

    setSubmitting(true)
    try {
      const result = await api.money.createPaystackPaymentLink(input)
      setInvoices((current) => [
        result.invoice,
        ...current.filter((invoice) => invoice.id !== result.invoice.id),
      ])
      setShowInvoice(false)
      setForm(emptyForm)
      setPaymentUrl(result.paymentLink.authorizationUrl)
      setNotice(
        `${result.invoice.invoiceNumber} is ready. The payment link has not been sent.`,
      )
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Unable to create the Paystack payment link.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="money-page">
      <header className="money-header">
        <div>
          <p className="money-eyebrow">Money · live workspace records</p>
          <h1>A clear view of what’s coming in.</h1>
          <p>
            Create a Paystack link, review it, and choose how to send it to your client.
          </p>
        </div>
        <button
          className="money-primary"
          type="button"
          onClick={() => setShowInvoice(true)}
          disabled={!connection?.configured}
          title={
            connection?.configured
              ? undefined
              : 'Configure PAYSTACK_SECRET_KEY on the server first'
          }
        >
          <Icon name="plus" /> Create payment link
        </button>
      </header>

      <section className="money-summary" aria-label="Revenue summary">
        <article className="money-balance">
          <div>
            <span>Paid through Paystack</span>
            <strong>{formatMoney(paidTotal)}</strong>
          </div>
          <span className="money-trend money-trend--neutral">
            {invoices.filter((invoice) => invoice.status === 'paid').length} reconciled
          </span>
          <div className="money-bars money-bars--empty" aria-hidden="true">
            {[20, 28, 24, 34, 30, 40, 36, 48, 44, 58, 52, 64].map(
              (height, index) => (
                <i key={index} style={{ height: `${paidTotal ? height : 8}%` }} />
              ),
            )}
          </div>
          <div className="money-period">
            <span>Persisted</span>
            <span>Webhook reconciled</span>
          </div>
        </article>
        <div className="money-stats">
          <article>
            <span>Outstanding</span>
            <strong>{formatMoney(outstanding)}</strong>
            <small>
              {
                invoices.filter((invoice) =>
                  ['initializing', 'pending'].includes(invoice.status),
                ).length
              }{' '}
              invoices
            </small>
          </article>
          <article>
            <span>Provider</span>
            <strong>{connection?.configured ? 'Paystack' : 'Not configured'}</strong>
            <small>
              {connection?.configured ? `${connection.mode} mode · ZAR` : 'Server setup required'}
            </small>
          </article>
        </div>
      </section>

      <div className="money-layout">
        <section className="money-card money-invoices">
          <div className="money-card__head">
            <div>
              <h2>Invoices</h2>
              <p>Persisted records and provider reconciliation</p>
            </div>
            <button
              type="button"
              className="money-text-button"
              onClick={() => void loadMoney()}
              disabled={loading}
            >
              <Icon name="refresh" /> {loading ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
          <div className="invoice-table" role="table" aria-label="Recent invoices">
            <div className="invoice-row invoice-row--head" role="row">
              <span role="columnheader">Client</span>
              <span role="columnheader">Due</span>
              <span role="columnheader">Amount</span>
              <span role="columnheader">Status</span>
              <span />
            </div>
            {invoices.map((invoice) => (
              <div className="invoice-row" role="row" key={invoice.id}>
                <div className="invoice-client" role="cell">
                  <strong>{invoice.clientName}</strong>
                  <span>
                    {invoice.invoiceNumber} · {invoice.projectName}
                  </span>
                </div>
                <span role="cell">{formatDate(invoice.dueDate)}</span>
                <strong role="cell">
                  {formatMoney(invoice.amountMinor, invoice.currency)}
                </strong>
                <span role="cell">
                  <i className={`invoice-status invoice-status--${invoice.status}`}>
                    {statusLabel(invoice.status)}
                  </i>
                </span>
                {invoice.paymentUrl ? (
                  <a
                    className="invoice-more"
                    href={invoice.paymentUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open payment link for ${invoice.invoiceNumber}`}
                  >
                    <Icon name="link" />
                  </a>
                ) : (
                  <span className="invoice-more" aria-hidden="true">
                    <Icon name="more" />
                  </span>
                )}
              </div>
            ))}
            {!loading && invoices.length === 0 && (
              <div className="money-empty">
                <Icon name="link" />
                <strong>No live invoices yet</strong>
                <p>Create a Paystack payment link when you are ready to bill real work.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="money-side">
          <section className="money-card upcoming">
            <div className="money-card__head">
              <div>
                <h2>Upcoming</h2>
                <p>Awaiting Paystack payment</p>
              </div>
            </div>
            <ol className="payment-list">
              {upcoming.map((invoice) => (
                <li key={invoice.id}>
                  <time>
                    <b>{invoice.dueDate?.slice(-2) || '—'}</b>
                    {invoice.dueDate
                      ? new Date(`${invoice.dueDate}T00:00:00`)
                          .toLocaleString('en-ZA', { month: 'short' })
                          .toUpperCase()
                      : 'OPEN'}
                  </time>
                  <div>
                    <strong>{invoice.clientName}</strong>
                    <span>{invoice.projectName}</span>
                  </div>
                  <b>{formatMoney(invoice.amountMinor)}</b>
                </li>
              ))}
            </ol>
            <p className="payment-note">
              <Icon name="clock" /> {formatMoney(outstanding)} awaiting reconciliation
            </p>
          </section>

          <section className="money-card workflow-card">
            <span className="workflow-kicker">Explicit control</span>
            <h2>From finished work to paid</h2>
            <ol>
              <li className="is-done">
                <i>
                  <Icon name="check" />
                </i>
                <div>
                  <strong>Describe the completed work</strong>
                  <span>Client, project, amount, and due date</span>
                </div>
              </li>
              <li className="is-current">
                <i>2</i>
                <div>
                  <strong>Create and review the link</strong>
                  <span>Nothing is sent automatically</span>
                </div>
              </li>
              <li>
                <i>3</i>
                <div>
                  <strong>Reconcile the payment</strong>
                  <span>A verified Paystack webhook marks it paid</span>
                </div>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setShowInvoice(true)}
              disabled={!connection?.configured}
            >
              Create a payment link <Icon name="arrow" />
            </button>
          </section>
        </aside>
      </div>

      <section className="money-card payment-providers">
        <div className="money-card__head">
          <div>
            <h2>Ways to get paid</h2>
            <p>Provider status is honest about what is live.</p>
          </div>
        </div>
        <div className="provider-grid">
          {providers.map((provider) => {
            const paystackProvider = provider.id === 'paystack'
            const configured = paystackProvider && connection?.configured
            return (
              <article key={provider.name}>
                <div className={`provider-mark provider-mark--${provider.tone}`}>
                  {provider.mark}
                </div>
                <div>
                  <h3>{provider.name}</h3>
                  <p>
                    {configured
                      ? `${connection.mode} mode · secret stays server-side`
                      : provider.note}
                  </p>
                </div>
                <button
                  type="button"
                  className={configured ? 'is-connected' : undefined}
                  onClick={() =>
                    setNotice(
                      paystackProvider
                        ? configured
                          ? `Paystack ${connection.mode} mode is configured server-side.`
                          : 'Set PAYSTACK_SECRET_KEY on the server, then restart lancee.'
                        : `${provider.name} remains a clearly labelled placeholder.`,
                    )
                  }
                >
                  {configured ? <Icon name="check" /> : <Icon name="link" />}
                  {configured ? 'Connected' : paystackProvider ? 'Setup details' : 'Preview'}
                </button>
              </article>
            )
          })}
        </div>
      </section>

      {showInvoice && (
        <div
          className="money-modal-backdrop"
          role="presentation"
          onMouseDown={() => setShowInvoice(false)}
        >
          <section
            className="money-modal money-modal--invoice"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="money-modal__close"
              type="button"
              onClick={() => setShowInvoice(false)}
              aria-label="Close"
            >
              <Icon name="close" />
            </button>
            <span className="workflow-kicker">Paystack · ZAR</span>
            <h2 id="invoice-modal-title">Create a client payment link</h2>
            <p>
              This initializes a hosted Paystack checkout. It does not email or message
              the client.
            </p>
            <form onSubmit={(event) => void createPaymentLink(event)}>
              <div className="money-form-grid">
                <label>
                  Client name
                  <input
                    autoFocus
                    value={form.clientName}
                    onChange={(event) => updateForm('clientName', event.target.value)}
                    placeholder="e.g. Isla Verde Spirits"
                    required
                  />
                </label>
                <label>
                  Client email
                  <input
                    type="email"
                    value={form.clientEmail}
                    onChange={(event) => updateForm('clientEmail', event.target.value)}
                    placeholder="accounts@example.com"
                    required
                  />
                </label>
                <label>
                  Project
                  <input
                    value={form.projectName}
                    onChange={(event) => updateForm('projectName', event.target.value)}
                    placeholder="e.g. Reserve rum label series"
                    required
                  />
                </label>
                <label>
                  Amount (ZAR)
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={form.amount}
                    onChange={(event) => updateForm('amount', event.target.value)}
                    placeholder="28400.00"
                    required
                  />
                </label>
                <label className="money-form-grid__wide">
                  Description
                  <input
                    value={form.description}
                    onChange={(event) => updateForm('description', event.target.value)}
                    placeholder="Approved design and production artwork"
                  />
                </label>
                <label className="money-form-grid__wide">
                  Due date
                  <input
                    type="date"
                    value={form.dueDate}
                    onChange={(event) => updateForm('dueDate', event.target.value)}
                  />
                </label>
              </div>
              {formError && <p className="money-form-error">{formError}</p>}
              <div className="money-confirmation">
                <Icon name="check" />
                <span>
                  <strong>You remain in control</strong>
                  <small>Review and share the resulting link yourself.</small>
                </span>
              </div>
              <div className="money-modal__actions">
                <button type="button" onClick={() => setShowInvoice(false)}>
                  Cancel
                </button>
                <button type="submit" className="money-primary" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create Paystack link'}{' '}
                  {!submitting && <Icon name="arrow" />}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {notice && (
        <div className="money-toast" role="status">
          <span>{notice}</span>
          {paymentUrl && (
            <>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(paymentUrl)
                  setNotice('Payment link copied. It has not been sent automatically.')
                }}
              >
                <Icon name="copy" /> Copy
              </button>
              <a href={paymentUrl} target="_blank" rel="noreferrer">
                Review <Icon name="arrow" />
              </a>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setNotice(null)
              setPaymentUrl(null)
            }}
            aria-label="Dismiss"
          >
            <Icon name="close" />
          </button>
        </div>
      )}
    </div>
  )
}
