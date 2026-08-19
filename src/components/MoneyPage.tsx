import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import {
  api,
  type CreatePaystackPaymentLinkInput,
  type InvoicePdfInput,
  type MoneyInvoice,
  type PaystackConnection,
} from '../lib/api'
import './money-page.css'

const providers = [
  {
    id: 'stripe',
    name: 'Stripe',
    mark: 'S',
    note: 'Connect Stripe to add its hosted checkout button',
    tone: 'stripe',
  },
  {
    id: 'paypal',
    name: 'PayPal',
    mark: 'PP',
    note: 'Connect PayPal to offer a familiar payment option',
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

type InvoiceForm = {
  documentType: InvoicePdfInput['documentType']
  template: InvoicePdfInput['template']
  accentColor: string
  clientName: string
  clientEmail: string
  projectName: string
  description: string
  amount: string
  currency: string
  dueDate: string
  payEnabled: boolean
  paymentProvider: 'paystack' | 'bank'
  accountHolder: string
  bankName: string
  accountNumber: string
  branchCode: string
  swiftCode: string
}

const emptyForm: InvoiceForm = {
  documentType: 'invoice',
  template: 'modern',
  accentColor: '#31569d',
  clientName: '',
  clientEmail: '',
  projectName: '',
  description: '',
  amount: '',
  currency: 'ZAR',
  dueDate: '',
  payEnabled: true,
  paymentProvider: 'paystack',
  accountHolder: '',
  bankName: '',
  accountNumber: '',
  branchCode: '',
  swiftCode: '',
}

const invoiceStyles = [
  ['modern', 'Modern', 'Bold total, clean grid'],
  ['classic', 'Classic', 'Formal and timeless'],
  ['studio', 'Studio', 'Editorial and creative'],
  ['minimal', 'Minimal', 'Quiet and precise'],
] as const

const invoicePalette = ['#31569d', '#6d4aff', '#0f766e', '#c2415d', '#d97706', '#202631']

type BillingDraft = {
  id: string
  invoiceNumber: string
  documentType: InvoicePdfInput['documentType']
  template: InvoicePdfInput['template']
  accentColor: string
  clientName: string
  clientEmail: string
  projectName: string
  description: string
  amount: number
  currency: string
  dueDate: string
  customFields: Array<{ label: string; value: string }>
  bankDetails: InvoicePdfInput['bankDetails']
  paymentUrl: string | null
  createdAt: string
}

const billingDraftStorageKey = 'lancee:billing-drafts'

function readBillingDrafts(): BillingDraft[] {
  try {
    const drafts = JSON.parse(localStorage.getItem(billingDraftStorageKey) || '[]') as BillingDraft[]
    return drafts.map((draft) => ({
      ...draft,
      invoiceNumber: draft.invoiceNumber || `DRAFT-${draft.id.slice(0, 8).toUpperCase()}`,
      accentColor: draft.accentColor || (draft.template === 'studio' ? '#b44885' : draft.template === 'classic' ? '#222831' : '#31569d'),
      bankDetails: draft.bankDetails || null,
      paymentUrl: draft.paymentUrl || null,
    }))
  } catch {
    return []
  }
}

function createDocumentNumber(documentType: InvoiceForm['documentType']) {
  const prefix = documentType === 'estimate' ? 'EST' : documentType === 'receipt' ? 'RCT' : 'INV'
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  return `${prefix}-${date}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`
}

export default function MoneyPage() {
  const [showInvoice, setShowInvoice] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null)
  const [connection, setConnection] = useState<PaystackConnection | null>(null)
  const [invoices, setInvoices] = useState<MoneyInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [generatingDraftId, setGeneratingDraftId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [customFields, setCustomFields] = useState<Array<{ label: string; value: string }>>([])
  const [drafts, setDrafts] = useState<BillingDraft[]>(readBillingDrafts)

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

  const updateForm = (field: keyof typeof emptyForm, value: string | boolean) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const storeDraft = (draft: BillingDraft) => {
    setDrafts((current) => {
      const nextDrafts = [draft, ...current]
      localStorage.setItem(billingDraftStorageKey, JSON.stringify(nextDrafts))
      return nextDrafts
    })
  }

  const draftFromForm = (
    amount: number,
    options: Pick<BillingDraft, 'invoiceNumber' | 'paymentUrl'>,
  ): BillingDraft => ({
    id: crypto.randomUUID(),
    invoiceNumber: options.invoiceNumber,
    documentType: form.documentType,
    template: form.template,
    accentColor: form.accentColor,
    clientName: form.clientName,
    clientEmail: form.clientEmail,
    projectName: form.projectName,
    description: form.description || form.projectName,
    amount,
    currency: form.currency,
    dueDate: form.dueDate,
    customFields: customFields.filter((field) => field.label.trim() && field.value.trim()),
    bankDetails: form.payEnabled && form.paymentProvider === 'bank'
      ? {
          accountHolder: form.accountHolder,
          bankName: form.bankName,
          accountNumber: form.accountNumber,
          branchCode: form.branchCode,
          swiftCode: form.swiftCode,
        }
      : null,
    paymentUrl: options.paymentUrl,
    createdAt: new Date().toISOString(),
  })

  const createPaymentLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount < 1) {
      setFormError('Enter an amount of at least R 1.00.')
      return
    }
    if (form.payEnabled && form.paymentProvider === 'bank' && (
      !form.accountHolder.trim() || !form.bankName.trim() || !form.accountNumber.trim()
    )) {
      setFormError('Add the account holder, bank name, and account number.')
      return
    }
    if (!form.payEnabled || form.paymentProvider === 'bank') {
      const draft = draftFromForm(amount, {
        invoiceNumber: createDocumentNumber(form.documentType),
        paymentUrl: null,
      })
      storeDraft(draft)
      setForm(emptyForm)
      setCustomFields([])
      setNotice(`${draft.invoiceNumber} is ready. Your PDF download is being generated.`)
      setShowInvoice(false)
      void downloadDraft(draft)
      return
    }
    if (form.currency !== 'ZAR') {
      setFormError('Automatic currency conversion will activate when CURRENCYLAYER_API_KEY is added. Paystack links currently use ZAR.')
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
      const draft = draftFromForm(amount, {
        invoiceNumber: result.invoice.invoiceNumber,
        paymentUrl: result.paymentLink.authorizationUrl,
      })
      storeDraft(draft)
      setShowInvoice(false)
      setForm(emptyForm)
      setCustomFields([])
      setPaymentUrl(result.paymentLink.authorizationUrl)
      setNotice(
        `${result.invoice.invoiceNumber} is ready. Your PDF download is being generated; the payment link has not been sent.`,
      )
      void downloadDraft(draft)
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

  async function downloadDraft(draft: BillingDraft) {
    setGeneratingDraftId(draft.id)
    try {
      const pdf = await api.money.createInvoicePdf({
        documentType: draft.documentType,
        template: draft.template,
        accentColor: draft.accentColor,
        invoiceNumber: draft.invoiceNumber,
        clientName: draft.clientName,
        clientEmail: draft.clientEmail,
        projectName: draft.projectName,
        description: draft.description || draft.projectName,
        amountMinor: Math.round(draft.amount * 100),
        currency: draft.currency,
        dueDate: draft.dueDate || null,
        customFields: draft.customFields,
        bankDetails: draft.bankDetails,
        paymentUrl: draft.paymentUrl,
        createdAt: draft.createdAt,
      })
      const url = URL.createObjectURL(pdf)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${draft.invoiceNumber}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
      setNotice(`${draft.invoiceNumber}.pdf downloaded.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to generate the invoice PDF.')
    } finally {
      setGeneratingDraftId(null)
    }
  }

  const removeDraft = (id: string) => {
    const nextDrafts = drafts.filter((draft) => draft.id !== id)
    setDrafts(nextDrafts)
    localStorage.setItem(billingDraftStorageKey, JSON.stringify(nextDrafts))
  }

  return (
    <div className="money-page">
      <header className="money-header">
        <div>
          <p className="money-eyebrow">Invoices · estimates · receipts</p>
          <h1>Professional <em>invoicing</em>, your way.</h1>
          <p>
            Choose a polished style, add the fields your business needs, and offer the right way to pay.
          </p>
        </div>
        <button
          className="money-primary"
          type="button"
          onClick={() => setShowInvoice(true)}
        >
          <Icon name="plus" /> Create document
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
            <span>Payment options</span>
            <strong>{connection?.configured ? 'Paystack + bank' : 'Bank transfer'}</strong>
            <small>
              {connection?.configured ? `${connection.mode} mode · direct bank details` : 'No provider setup required'}
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
                <p>Create a branded PDF with bank details, or add Paystack checkout when you need it.</p>
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
            const configured = provider.id === 'paystack' && connection?.configured
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
                      configured
                        ? `Paystack ${connection.mode} mode is configured server-side.`
                        : provider.id === 'paystack'
                          ? 'Set PAYSTACK_SECRET_KEY on the server, then restart lancee.'
                          : `Open Connections to configure ${provider.name}.`,
                    )
                  }
                >
                  {configured ? <Icon name="check" /> : <Icon name="link" />}
                  {configured ? 'Connected' : 'Setup details'}
                </button>
              </article>
            )
          })}
        </div>
      </section>

      {drafts.length > 0 && (
        <section className="money-card billing-drafts">
          <div className="money-card__head">
            <div><h2>Invoice documents</h2><p>Playwright-rendered PDFs with your chosen style and payment details.</p></div>
          </div>
          <div className="billing-draft-grid">
            {drafts.map((draft) => (
              <article className={`billing-draft billing-draft--${draft.template}`} key={draft.id} style={{ borderTopColor: draft.accentColor }}>
                <span>{draft.documentType}</span>
                <h3>{draft.clientName}</h3>
                <p>{draft.projectName}</p>
                <strong>{new Intl.NumberFormat('en', { style: 'currency', currency: draft.currency }).format(draft.amount)}</strong>
                <small>{draft.invoiceNumber} · {draft.template} · {draft.bankDetails ? 'bank transfer' : draft.paymentUrl ? 'Paystack' : 'no payment method'}</small>
                <div><button type="button" disabled={generatingDraftId === draft.id} onClick={() => void downloadDraft(draft)}>{generatingDraftId === draft.id ? 'Generating…' : 'Download PDF'}</button><button type="button" onClick={() => removeDraft(draft.id)}>Remove</button></div>
              </article>
            ))}
          </div>
        </section>
      )}

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
            <span className="workflow-kicker">Professional billing document</span>
            <h2 id="invoice-modal-title">Create an invoice, estimate, or receipt</h2>
            <p>
              Pick a look, apply your brand colour, and generate a polished PDF. Add
              either secure online checkout or direct bank-transfer details.
            </p>
            <form onSubmit={(event) => void createPaymentLink(event)}>
              <div className="invoice-type-row">
                {(['invoice', 'estimate', 'receipt'] as const).map((type) => (
                  <button
                    type="button"
                    className={form.documentType === type ? 'is-active' : ''}
                    key={type}
                    onClick={() => updateForm('documentType', type)}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
              <div className="invoice-template-picker" aria-label="Invoice template">
                {invoiceStyles.map(([id, name, note]) => (
                  <button
                    type="button"
                    className={`invoice-template invoice-template--${id}${form.template === id ? ' is-active' : ''}`}
                    key={id}
                    onClick={() => updateForm('template', id)}
                    style={{ '--invoice-accent': form.accentColor } as CSSProperties}
                  >
                    <i><b /><span /><span /></i>
                    <strong>{name}</strong><small>{note}</small>
                  </button>
                ))}
              </div>
              <section className="invoice-colour-picker">
                <div><strong>Brand colour</strong><small>Used across the PDF accent, totals, and payment panel.</small></div>
                <div className="invoice-palette" aria-label="Brand colour palette">
                  {invoicePalette.map((colour) => (
                    <button
                      type="button"
                      key={colour}
                      className={form.accentColor === colour ? 'is-active' : ''}
                      style={{ backgroundColor: colour, '--invoice-accent': colour } as CSSProperties}
                      onClick={() => updateForm('accentColor', colour)}
                      aria-label={`Use ${colour}`}
                    />
                  ))}
                  <label className="invoice-custom-colour" aria-label="Choose a custom brand colour">
                    <input type="color" value={form.accentColor} onChange={(event) => updateForm('accentColor', event.target.value)} />
                    <span>Custom</span>
                  </label>
                </div>
              </section>
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
                <div className="money-amount-fields">
                  <label>
                    Amount
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
                  <label>
                    Currency
                    <select value={form.currency} onChange={(event) => updateForm('currency', event.target.value)}>
                      {['ZAR', 'USD', 'EUR', 'GBP', 'NGN', 'KES', 'AUD', 'CAD'].map((currency) => <option key={currency}>{currency}</option>)}
                    </select>
                  </label>
                </div>
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
              <div className="invoice-custom-fields">
                <div>
                  <strong>Custom fields</strong>
                  <button type="button" onClick={() => setCustomFields((fields) => [...fields, { label: '', value: '' }])}>
                    + Add field
                  </button>
                </div>
                {customFields.map((field, index) => (
                  <div key={index}>
                    <input
                      aria-label={`Custom field ${index + 1} label`}
                      placeholder="Field label"
                      value={field.label}
                      onChange={(event) => setCustomFields((fields) => fields.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))}
                    />
                    <input
                      aria-label={`Custom field ${index + 1} value`}
                      placeholder="Value"
                      value={field.value}
                      onChange={(event) => setCustomFields((fields) => fields.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))}
                    />
                    <button type="button" aria-label="Remove custom field" onClick={() => setCustomFields((fields) => fields.filter((_, itemIndex) => itemIndex !== index))}>×</button>
                  </div>
                ))}
              </div>
              <section className="invoice-pay-option">
                <label>
                  <input
                    type="checkbox"
                    checked={form.payEnabled}
                    onChange={(event) => updateForm('payEnabled', event.target.checked)}
                  />
                  <span><strong>Include payment details</strong><small>Choose online checkout or put your bank details directly on the PDF.</small></span>
                </label>
                {form.payEnabled && (
                  <>
                    <div>
                    {(['paystack', 'bank'] as const).map((provider) => (
                      <label key={provider} className={form.paymentProvider === provider ? 'is-active' : ''}>
                        <input
                          type="radio"
                          name="payment-provider"
                          value={provider}
                          checked={form.paymentProvider === provider}
                          onChange={(event) => updateForm('paymentProvider', event.target.value)}
                        />
                        {provider === 'paystack' ? 'Paystack checkout' : 'Bank transfer'}
                      </label>
                    ))}
                    </div>
                    {form.paymentProvider === 'bank' && (
                      <div className="invoice-bank-fields">
                        <label>Account holder<input value={form.accountHolder} onChange={(event) => updateForm('accountHolder', event.target.value)} placeholder="Your business name" required /></label>
                        <label>Bank name<input value={form.bankName} onChange={(event) => updateForm('bankName', event.target.value)} placeholder="e.g. First National Bank" required /></label>
                        <label>Account number<input value={form.accountNumber} onChange={(event) => updateForm('accountNumber', event.target.value)} placeholder="000 000 0000" required /></label>
                        <label>Branch code<input value={form.branchCode} onChange={(event) => updateForm('branchCode', event.target.value)} placeholder="Optional" /></label>
                        <label>SWIFT / BIC<input value={form.swiftCode} onChange={(event) => updateForm('swiftCode', event.target.value)} placeholder="Optional for international payments" /></label>
                      </div>
                    )}
                  </>
                )}
              </section>
              {formError && <p className="money-form-error">{formError}</p>}
              <div className="money-confirmation">
                <Icon name="check" />
                <span>
                  <strong>You remain in control</strong>
                  <small>The PDF downloads to your device; Lancee never sends it automatically.</small>
                </span>
              </div>
              <div className="money-modal__actions">
                <button type="button" onClick={() => setShowInvoice(false)}>
                  Cancel
                </button>
                <button type="submit" className="money-primary" disabled={submitting}>
                  {submitting ? 'Creating…' : form.payEnabled && form.paymentProvider === 'paystack' ? 'Create PDF & payment link' : 'Generate PDF'}{' '}
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
