import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type StorefrontDomain } from '../lib/api'
import './storefront-page.css'

const storefrontScreenshot = new URL(
  '../../storefront/storefront_black_white/public/screenshot.png',
  import.meta.url,
).href

type StorefrontTemplateId = 'black-white' | 'blue-splash' | 'gold-dune' | 'red-tech' | 'gsap-flowish'

const templates: Array<{
  id: StorefrontTemplateId
  name: string
  label: string
  description: string
  previewTitle: string
  previewSubtitle: string
}> = [
  {
  id: 'black-white',
  name: 'Black & White',
  label: 'Saleor Paper storefront',
  description: 'A clean, editorial storefront for product discovery, cart, and checkout.',
    previewTitle: 'Objects with a point of view.',
    previewSubtitle: 'Editorial commerce',
  },
  {
    id: 'blue-splash',
    name: 'Blue Splash',
    label: 'SaaS-inspired storefront',
    description: 'A luminous, modern storefront with gradients, floating shapes, and a confident product grid.',
    previewTitle: 'Make every launch feel inevitable.',
    previewSubtitle: 'Gradient commerce',
  },
  {
    id: 'gold-dune',
    name: 'Gold Dune',
    label: 'Cinematic studio storefront',
    description: 'A warm, premium storefront with glass panels, gold accents, and a slower visual rhythm.',
    previewTitle: 'Objects made for the long way around.',
    previewSubtitle: 'Cinematic commerce',
  },
  {
    id: 'red-tech',
    name: 'Red Tech',
    label: 'Terminal-inspired storefront',
    description: 'A sharp dark storefront with command-line energy, bright status colors, and technical detail.',
    previewTitle: 'Ship better things.',
    previewSubtitle: 'Signal-driven commerce',
  },
  {
    id: 'gsap-flowish',
    name: 'Flowish',
    label: 'Immersive 3D storefront',
    description: 'A gallery-like storefront with deep space, scroll-led movement, and a portfolio feel.',
    previewTitle: 'Move through the collection.',
    previewSubtitle: 'Immersive commerce',
  },
]

function storefrontStorageKey(workspaceId: string) {
  return `lancee:storefront-enabled:${workspaceId}`
}

function storefrontTemplateStorageKey(workspaceId: string) {
  return `lancee:storefront-template:${workspaceId}`
}

function readStoredChoice(workspaceId: string) {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(storefrontStorageKey(workspaceId)) === 'true'
}

function readStoredTemplate(workspaceId: string): StorefrontTemplateId {
  if (typeof window === 'undefined') return 'black-white'
  const value = window.localStorage.getItem(storefrontTemplateStorageKey(workspaceId))
  return templates.some((template) => template.id === value) ? value as StorefrontTemplateId : 'black-white'
}

export default function StorefrontPage({ workspaceId }: { workspaceId: string }) {
  const [enabled, setEnabled] = useState(() => readStoredChoice(workspaceId))
  const [selectedTemplate, setSelectedTemplate] = useState<StorefrontTemplateId>(() => readStoredTemplate(workspaceId))
  const [domains, setDomains] = useState<StorefrontDomain[]>([])
  const [domainInput, setDomainInput] = useState('')
  const [domainLoading, setDomainLoading] = useState(true)
  const [domainBusy, setDomainBusy] = useState('')
  const [domainNotice, setDomainNotice] = useState('')
  const [domainError, setDomainError] = useState('')
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const previewRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    setEnabled(readStoredChoice(workspaceId))
    setSelectedTemplate(readStoredTemplate(workspaceId))
  }, [workspaceId])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storefrontStorageKey(workspaceId), String(enabled))
    }
  }, [enabled, workspaceId])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storefrontTemplateStorageKey(workspaceId), selectedTemplate)
    }
    setPreviewPlaying(false)
    setPreviewError('')
  }, [selectedTemplate, workspaceId])

  useEffect(() => {
    let active = true
    void Promise.all([api.storefront.settings.get(), api.storefront.domains.list()])
      .then(([settings, items]) => {
        if (!active) return
        setEnabled(settings.enabled)
        setDomains(items)
      })
      .catch((error) => {
        if (active) setDomainError(error instanceof Error ? error.message : 'Unable to load custom domains.')
      })
      .finally(() => {
        if (active) setDomainLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const setStorefrontEnabled = async (next: boolean) => {
    const previous = enabled
    setEnabled(next)
    setDomainBusy('storefront')
    setDomainError('')
    try {
      await api.storefront.settings.set(next)
    } catch (error) {
      setEnabled(previous)
      setDomainError(error instanceof Error ? error.message : 'Unable to update storefront settings.')
    } finally {
      setDomainBusy('')
    }
  }

  const chooseTemplate = (templateId: StorefrontTemplateId) => {
    setSelectedTemplate(templateId)
    void setStorefrontEnabled(true)
  }

  const addDomain = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!domainInput.trim()) return
    setDomainBusy('add')
    setDomainError('')
    setDomainNotice('')
    try {
      const domain = await api.storefront.domains.add(domainInput)
      setDomains((current) => [domain, ...current])
      setDomainInput('')
      setDomainNotice(`DNS instructions are ready for ${domain.domain}.`)
    } catch (error) {
      setDomainError(error instanceof Error ? error.message : 'Unable to add the custom domain.')
    } finally {
      setDomainBusy('')
    }
  }

  const verifyDomain = async (domain: StorefrontDomain) => {
    setDomainBusy(domain.id)
    setDomainError('')
    setDomainNotice('')
    try {
      const result = await api.storefront.domains.verify(domain.id)
      setDomains((current) => current.map((item) => item.id === domain.id ? result.domain! : item))
      setDomainNotice(result.verified ? `${domain.domain} is connected.` : result.message || 'The DNS record is not visible yet.')
    } catch (error) {
      setDomainError(error instanceof Error ? error.message : 'Unable to verify the custom domain.')
    } finally {
      setDomainBusy('')
    }
  }

  const removeDomain = async (domain: StorefrontDomain) => {
    if (!window.confirm(`Remove ${domain.domain} from storefront settings?`)) return
    setDomainBusy(domain.id)
    setDomainError('')
    try {
      await api.storefront.domains.remove(domain.id)
      setDomains((current) => current.filter((item) => item.id !== domain.id))
      setDomainNotice(`${domain.domain} was removed.`)
    } catch (error) {
      setDomainError(error instanceof Error ? error.message : 'Unable to remove the custom domain.')
    } finally {
      setDomainBusy('')
    }
  }

  const copyValue = async (value: string) => {
    await navigator.clipboard.writeText(value)
    setDomainNotice('Copied to your clipboard.')
  }

  const togglePreview = async () => {
    const video = previewRef.current
    if (!video) return
    setPreviewError('')
    try {
      if (video.paused || video.ended) {
        if (video.ended) video.currentTime = 0
        await video.play()
        setPreviewPlaying(true)
      } else {
        video.pause()
        setPreviewPlaying(false)
      }
    } catch {
      setPreviewPlaying(false)
      setPreviewError('This preview could not start in the browser. Use the MP4 download to open it locally.')
    }
  }

  const activeTemplate = templates.find((template) => template.id === selectedTemplate) || templates[0]
  const previewSource = selectedTemplate === 'black-white'
    ? '/storefront-preview.mp4'
    : `/storefront-preview-${selectedTemplate}.mp4`

  return (
    <div className="dashboard-page storefront-page">
      <header className="dashboard-page__header storefront-page__header">
        <div>
          <span className="storefront-eyebrow">Client-facing commerce</span>
          <h1 className="dashboard-page__title">Storefront</h1>
          <p className="dashboard-page__description">
            Give clients a polished place to browse products, add to cart, and check out.
            Start with one considered template and turn it on when you need it.
          </p>
        </div>
        <div className={`storefront-status${enabled ? ' is-enabled' : ''}`}>
          <span className="storefront-status__dot" />
          <span>{enabled ? 'Storefront in use' : 'Storefront not in use'}</span>
        </div>
      </header>

      <section className="storefront-choice" aria-labelledby="storefront-choice-title">
        <div>
          <span className="storefront-eyebrow">Workspace preference</span>
          <h2 id="storefront-choice-title">
            {enabled ? 'Your clients can use a storefront.' : 'Do you want to use a storefront?'}
          </h2>
          <p>
            {enabled
              ? `${activeTemplate.name} is ready for client-facing product experiences.`
              : 'Turn this on when a client needs a simple, focused shop alongside their project work.'}
          </p>
        </div>
        <button
          type="button"
          className={`storefront-toggle${enabled ? ' is-enabled' : ''}`}
          role="switch"
          aria-checked={enabled}
          onClick={() => void setStorefrontEnabled(!enabled)}
          disabled={domainBusy === 'storefront'}
        >
          <span className="storefront-toggle__track"><span /></span>
          <span>{enabled ? 'Using storefront' : 'Keep storefront off'}</span>
        </button>
      </section>

      <section className="storefront-template-section" aria-labelledby="storefront-template-title">
        <div className="storefront-section-heading">
          <div>
            <span className="storefront-eyebrow">Available template</span>
            <h2 id="storefront-template-title">Choose a storefront style</h2>
          </div>
          <span className="storefront-template-count">{templates.length} templates</span>
        </div>
        <div className="storefront-template-grid">
          {templates.map((template) => {
            const isSelected = selectedTemplate === template.id && enabled
            return (
              <article className={`storefront-template-card${isSelected ? ' is-selected' : ''}`} key={template.id}>
                <div className={`storefront-template-card__preview storefront-template-card__preview--${template.id}`}>
                  {template.id === 'black-white' ? (
                    <img src={storefrontScreenshot} alt={`${template.name} storefront template preview`} />
                  ) : (
                    <div className="storefront-template-mockup">
                      <span>{template.previewSubtitle}</span>
                      <strong>{template.previewTitle}</strong>
                      <i />
                      <small>Scroll to explore · Add to cart · Checkout</small>
                    </div>
                  )}
                  <span className="storefront-template-card__badge">{isSelected ? 'Selected' : 'Preview'}</span>
                </div>
                <div className="storefront-template-card__body">
                  <div>
                    <span className="storefront-eyebrow">{template.label}</span>
                    <h3>{template.name}</h3>
                    <p>{template.description}</p>
                  </div>
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => chooseTemplate(template.id)}
                    aria-pressed={isSelected}
                  >
                    {isSelected ? 'Selected template' : 'Use this template'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="storefront-motion" aria-labelledby="storefront-motion-title">
        <div className="storefront-section-heading">
          <div>
            <span className="storefront-eyebrow">Product tour</span>
            <h2 id="storefront-motion-title">See the storefront in motion</h2>
            <p>Preview the client experience before you decide whether to turn it on.</p>
          </div>
          <span className="storefront-motion__format">MP4 · 16:9</span>
        </div>
        <div className="storefront-video-frame">
          <video
            key={previewSource}
            ref={previewRef}
            src={previewSource}
            poster={storefrontScreenshot}
            muted
            loop
            playsInline
            controls
            preload="auto"
            onPlay={() => setPreviewPlaying(true)}
            onPause={() => setPreviewPlaying(false)}
            onError={() => {
              setPreviewPlaying(false)
              setPreviewError(`The ${activeTemplate.name} preview file is not available yet.`)
            }}
          >
            Your browser does not support embedded video.
          </video>
          <button
            type="button"
            className="storefront-video-frame__play"
            onClick={() => void togglePreview()}
            aria-label={previewPlaying ? 'Pause storefront preview' : 'Play storefront preview'}
          >
            {previewPlaying ? 'Pause preview' : 'Play preview'}
          </button>
          {previewError && <p className="storefront-video-frame__error" role="alert">{previewError}</p>}
          <a className="storefront-video-frame__download" href={previewSource} download>
            Download MP4
          </a>
        </div>
      </section>

      <section className="storefront-domain-section" aria-labelledby="storefront-domain-title">
        <div className="storefront-section-heading">
          <div>
            <span className="storefront-eyebrow">No technical setup required</span>
            <h2 id="storefront-domain-title">Connect your own domain</h2>
            <p>We will show you exactly what to copy into your domain provider, then check it for you.</p>
          </div>
          <span className="storefront-template-count">Guided setup</span>
        </div>
        <form className="storefront-domain-form" onSubmit={addDomain}>
          <label>
            Your storefront domain
            <div className="storefront-domain-form__input">
              <input
                value={domainInput}
                onChange={(event) => setDomainInput(event.target.value)}
                placeholder="shop.yourbusiness.com"
                autoComplete="url"
                required
              />
              <button className="button button--primary" type="submit" disabled={domainBusy === 'add'}>
                {domainBusy === 'add' ? 'Adding…' : 'Add domain'}
              </button>
            </div>
          </label>
        </form>
        {domainError && <p className="storefront-domain-message is-error">{domainError}</p>}
        {domainNotice && <p className="storefront-domain-message is-success">{domainNotice}</p>}
        <div className="storefront-domain-list">
          {domainLoading ? <p className="storefront-domain-empty">Loading domain settings…</p> : domains.length === 0 ? <p className="storefront-domain-empty">No custom domain connected yet.</p> : domains.map((domain) => (
            <article className="storefront-domain-card" key={domain.id}>
              <div className="storefront-domain-card__heading">
                <div>
                  <strong>{domain.domain}</strong>
                  <span className={`storefront-domain-badge is-${domain.status}`}>{domain.status === 'verified' ? 'Connected' : 'Waiting for DNS'}</span>
                </div>
                <button className="text-button" type="button" onClick={() => void removeDomain(domain)} disabled={domainBusy === domain.id}>Remove</button>
              </div>
              {domain.status === 'pending' && <>
                <div className="storefront-domain-steps">
                  <div><b>1</b><span>Open the DNS settings where you bought your domain.</span></div>
                  <div><b>2</b><span>Add this TXT record to prove you own it.</span></div>
                  <div><b>3</b><span>Add the CNAME record to point your domain to lancee.</span></div>
                </div>
                <div className="storefront-dns-grid">
                  <div><span>TXT name</span><code>{domain.dns.txtName}</code><button type="button" onClick={() => void copyValue(domain.dns.txtName)}>Copy</button></div>
                  <div><span>TXT value</span><code>{domain.dns.txtValue}</code><button type="button" onClick={() => void copyValue(domain.dns.txtValue)}>Copy</button></div>
                  <div><span>CNAME target</span><code>{domain.dns.cnameTarget}</code><button type="button" onClick={() => void copyValue(domain.dns.cnameTarget)}>Copy</button></div>
                </div>
                <button className="button button--secondary storefront-domain-verify" type="button" onClick={() => void verifyDomain(domain)} disabled={domainBusy === domain.id}>
                  {domainBusy === domain.id ? 'Checking DNS…' : 'Check DNS connection'}
                </button>
              </>}
              {domain.status === 'verified' && <p className="storefront-domain-connected">Connected {domain.verifiedAt ? new Date(domain.verifiedAt).toLocaleDateString() : ''}. Your custom domain is ready for the storefront.</p>}
            </article>
          ))}
        </div>
      </section>

    </div>
  )
}
