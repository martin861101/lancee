import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import {
  api,
  type WorkspaceBuilderAnswers,
  type WorkspaceBuilderCatalog,
  type WorkspaceBuilderPayload,
  type WorkspaceBuilderRecommendation,
  type WorkspaceBuilderState,
} from '../../lib/api'
import './workspace-builder.css'

const steps = [
  ['Welcome', 'A calm start'],
  ['Business', 'The essentials'],
  ['Activities', 'How you work'],
  ['Tools', 'Connect later'],
  ['People', 'Who joins you'],
  ['Processes', 'Repeatable work'],
  ['Your plan', 'Smallest useful setup'],
  ['Customise', 'Optional AI'],
  ['Building', 'Preparing everything'],
  ['Ready', 'Your new workspace'],
]

const industries = [
  'Accounting',
  'Architecture',
  'Construction',
  'Consulting',
  'Creative agency',
  'Design',
  'Education',
  'Engineering',
  'Financial services',
  'Healthcare',
  'IT services',
  'Legal services',
  'Marketing',
  'Media production',
  'Non-profit',
  'Property services',
  'Retail',
  'Software',
  'Trades and maintenance',
]

const countries = [
  'Australia', 'Botswana', 'Canada', 'France', 'Germany', 'Ghana', 'India',
  'Ireland', 'Kenya', 'Namibia', 'Netherlands', 'New Zealand', 'Nigeria',
  'Portugal', 'Singapore', 'South Africa', 'Spain', 'United Arab Emirates',
  'United Kingdom', 'United States', 'Zambia', 'Zimbabwe',
]

const commonTimezones = [
  'Africa/Accra', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
  'America/Chicago', 'America/Los_Angeles', 'America/New_York',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney',
  'Europe/Berlin', 'Europe/Lisbon', 'Europe/London', 'Europe/Paris',
  'Pacific/Auckland', 'UTC',
]

function defaultAnswers(workspaceName: string): WorkspaceBuilderAnswers {
  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return {
    business: {
      name: workspaceName,
      industry: '',
      size: 'solo',
      country: '',
      timezone: detectedTimezone,
      logoName: '',
    },
    activities: [],
    tools: [],
    people: ['just-me'],
    inviteTeam: false,
    processes: {},
    uniqueRequirements: '',
    sampleData: false,
  }
}

function mergedAnswers(
  workspaceName: string,
  saved: Partial<WorkspaceBuilderAnswers>,
): WorkspaceBuilderAnswers {
  const base = defaultAnswers(workspaceName)
  return {
    ...base,
    ...saved,
    business: { ...base.business, ...(saved.business || {}) },
    activities: saved.activities || base.activities,
    tools: saved.tools || base.tools,
    people: saved.people || base.people,
    processes: { ...base.processes, ...(saved.processes || {}) },
  }
}

function toggleValue(values: string[], id: string) {
  return values.includes(id) ? values.filter((value) => value !== id) : [...values, id]
}

function BuilderMark() {
  return (
    <span className="workspace-builder__mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}

function Choice({
  selected,
  title,
  description,
  onClick,
  disabled = false,
}: {
  selected: boolean
  title: string
  description?: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className={`builder-choice${selected ? ' is-selected' : ''}`}
      role="checkbox"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="builder-choice__check" aria-hidden="true">{selected ? '✓' : ''}</span>
      <span>
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
    </button>
  )
}

function SelectionSummary({
  recommendation,
  catalog,
}: {
  recommendation: Partial<WorkspaceBuilderRecommendation>
  catalog: WorkspaceBuilderCatalog
}) {
  const moduleNames = new Map(catalog.modules.map((item) => [item.id, item.name]))
  const integrationNames = new Map(catalog.integrations.map((item) => [item.id, item.name]))
  return (
    <div className="builder-launch-grid">
      <article>
        <span>Installed</span>
        <strong>{recommendation.modules?.length || 0} modules</strong>
        <p>{recommendation.modules?.slice(0, 5).map((id) => moduleNames.get(id) || id).join(' · ') || 'Dashboard'}</p>
      </article>
      <article>
        <span>Ready to connect</span>
        <strong>{recommendation.integrations?.length || 0} services</strong>
        <p>{recommendation.integrations?.slice(0, 4).map((id) => integrationNames.get(id) || id).join(' · ') || 'Add connections when you need them'}</p>
      </article>
      <article>
        <span>Prepared</span>
        <strong>{recommendation.automations?.length || 0} automations</strong>
        <p>Saved as drafts so you stay in control.</p>
      </article>
    </div>
  )
}

export default function WorkspaceBuilder({
  initial,
  workspaceName,
  embedded = false,
  onStateChange,
  onComplete,
  onExit,
  onInviteTeam,
}: {
  initial: WorkspaceBuilderPayload
  workspaceName: string
  embedded?: boolean
  onStateChange: (state: WorkspaceBuilderState) => void
  onComplete: (state: WorkspaceBuilderState, workspaceName: string) => void
  onExit?: () => void
  onInviteTeam: () => void
}) {
  const { catalog } = initial
  const initialStep = initial.state.status === 'completed'
    ? 9
    : Math.max(0, Math.min(8, initial.state.step || 0))
  const [step, setStep] = useState(initialStep)
  const [currentState, setCurrentState] = useState(initial.state)
  const [answers, setAnswers] = useState(() => mergedAnswers(workspaceName, initial.state.answers))
  const [recommendation, setRecommendation] = useState<Partial<WorkspaceBuilderRecommendation>>(
    initial.state.recommendation,
  )
  const [selectedModules, setSelectedModules] = useState<string[]>(
    initial.state.generated.modules || initial.state.generated.draftSelection?.modules || initial.state.recommendation.modules || [],
  )
  const [selectedIntegrations, setSelectedIntegrations] = useState<string[]>(
    initial.state.generated.integrations || initial.state.generated.draftSelection?.integrations || initial.state.recommendation.integrations || [],
  )
  const [selectedAutomations, setSelectedAutomations] = useState<string[]>(
    initial.state.generated.draftSelection?.automationIds || initial.state.recommendation.automations?.map((item) => item.id) || [],
  )
  const [selectedAiSuggestions, setSelectedAiSuggestions] = useState<string[]>(
    initial.state.generated.draftSelection?.aiSuggestionIds || [],
  )
  const [aiSuggestions, setAiSuggestions] = useState(initial.state.aiSuggestions || [])
  const [aiMessage, setAiMessage] = useState('')
  const [logo, setLogo] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [generationProgress, setGenerationProgress] = useState(0)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const generationIdempotencyKey = useRef(crypto.randomUUID())

  const moduleById = useMemo(
    () => new Map(catalog.modules.map((item) => [item.id, item])),
    [catalog.modules],
  )
  const integrationGroups = useMemo(() => {
    const groups = new Map<string, WorkspaceBuilderCatalog['integrations']>()
    for (const integration of catalog.integrations) {
      const items = groups.get(integration.category) || []
      items.push(integration)
      groups.set(integration.category, items)
    }
    return [...groups.entries()]
  }, [catalog.integrations])

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  useEffect(() => {
    if (!logo) {
      setLogoPreview('')
      return
    }
    const url = URL.createObjectURL(logo)
    setLogoPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [logo])

  const updateBusiness = (field: keyof WorkspaceBuilderAnswers['business'], value: string) => {
    setAnswers((current) => ({
      ...current,
      business: { ...current.business, [field]: value },
    }))
  }

  const publishState = (state: WorkspaceBuilderState) => {
    setCurrentState(state)
    onStateChange(state)
  }

  const saveDraft = async (nextStep: number, restart = false) => {
    setSaveStatus('saving')
    const state = await api.workspaceBuilder.saveDraft(answers, nextStep, restart, {
      modules: selectedModules,
      integrations: selectedIntegrations,
      automationIds: selectedAutomations,
      aiSuggestionIds: selectedAiSuggestions,
    })
    publishState(state)
    setSaveStatus('saved')
    window.setTimeout(() => setSaveStatus('idle'), 1500)
    return state
  }

  const validateStep = () => {
    if (step === 1) {
      if (!answers.business.name.trim()) return 'Enter your business name.'
      if (!answers.business.industry.trim()) return 'Enter your industry.'
      if (!answers.business.country) return 'Choose your country.'
      if (!answers.business.timezone) return 'Choose your timezone.'
    }
    if (step === 2 && answers.activities.length === 0) {
      return 'Choose at least one activity.'
    }
    if (step === 4 && answers.people.length === 0) {
      return 'Choose who you work with.'
    }
    return ''
  }

  const next = async () => {
    const validationError = validateStep()
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setBusy(true)
    try {
      if (step === 5) {
        const state = await api.workspaceBuilder.recommend(answers)
        setRecommendation(state.recommendation)
        setSelectedModules(state.recommendation.modules || [])
        setSelectedIntegrations(state.recommendation.integrations || [])
        setSelectedAutomations(state.recommendation.automations?.map((item) => item.id) || [])
        publishState(state)
        setStep(6)
      } else if (step === 7) {
        await generateWorkspace()
      } else {
        const nextStep = step + 1
        await saveDraft(nextStep)
        setStep(nextStep)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const back = async () => {
    if (step <= 0 || busy) return
    const nextStep = step - 1
    setError('')
    setBusy(true)
    try {
      await saveDraft(nextStep)
      setStep(nextStep)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save your progress.')
    } finally {
      setBusy(false)
    }
  }

  const requestAiSuggestions = async () => {
    setBusy(true)
    setError('')
    setAiMessage('')
    try {
      const result = await api.workspaceBuilder.suggest(answers.uniqueRequirements)
      setAiSuggestions(result.state.aiSuggestions)
      setSelectedAiSuggestions([])
      setAiMessage(result.message)
      publishState(result.state)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI customisation is unavailable.')
    } finally {
      setBusy(false)
    }
  }

  const generateWorkspace = async () => {
    setStep(8)
    setGenerationProgress(0)
    setError('')
    setBusy(true)
    const timer = window.setInterval(() => {
      setGenerationProgress((current) => Math.min(5, current + 1))
    }, 650)
    try {
      const draftState = await api.workspaceBuilder.saveDraft(answers, 7, false, {
        modules: selectedModules,
        integrations: selectedIntegrations,
        automationIds: selectedAutomations,
        aiSuggestionIds: selectedAiSuggestions,
      })
      publishState(draftState)
      if (logo) await api.workspace.uploadLogo(logo)
      const state = await api.workspaceBuilder.generate({
        modules: selectedModules,
        integrations: selectedIntegrations,
        automationIds: selectedAutomations,
        aiSuggestionIds: selectedAiSuggestions,
      }, generationIdempotencyKey.current)
      setGenerationProgress(6)
      setRecommendation({
        ...recommendation,
        modules: state.generated.modules || selectedModules,
        integrations: state.generated.integrations || selectedIntegrations,
        automations: recommendation.automations?.filter((item) => selectedAutomations.includes(item.id)),
      })
      publishState(state)
      window.setTimeout(() => {
        setStep(9)
        setBusy(false)
      }, 500)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Workspace generation was interrupted.')
      setBusy(false)
    } finally {
      window.clearInterval(timer)
    }
  }

  const restart = async () => {
    setBusy(true)
    setError('')
    try {
      const fresh = defaultAnswers(workspaceName)
      setAnswers(fresh)
      const state = await api.workspaceBuilder.saveDraft(fresh, 0, true)
      setRecommendation({})
      setSelectedModules([])
      setSelectedIntegrations([])
      setSelectedAutomations([])
      setSelectedAiSuggestions([])
      setAiSuggestions([])
      publishState(state)
      setStep(0)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to restart setup.')
    } finally {
      setBusy(false)
    }
  }

  const logoChanged = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    event.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Use a JPEG, PNG, or WebP logo.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Choose a logo smaller than 2 MB.')
      return
    }
    setError('')
    setLogo(file)
    updateBusiness('logoName', file.name)
  }

  const generationStages = [
    'Configuring modules',
    'Preparing dashboards',
    'Setting permissions',
    'Saving workflow drafts',
    'Preparing integrations',
    answers.sampleData ? 'Adding sample data' : 'Finalising your workspace',
  ]

  const title = [
    'Let’s build around your business.',
    'First, the essentials.',
    'What fills most of your day?',
    'Which services matter to you?',
    'Who do you work with?',
    'A few practical questions.',
    'Your smallest useful workspace.',
    'Anything unique about your work?',
    'Building your workspace…',
    'Your workspace is ready.',
  ][step]

  return (
    <main className={`workspace-builder${embedded ? ' workspace-builder--embedded' : ''}`}>
      <aside className="workspace-builder__rail">
        <div className="workspace-builder__brand"><BuilderMark /><strong>lancee</strong></div>
        <ol aria-label="Workspace setup progress">
          {steps.map(([label, detail], index) => (
            <li key={label} className={`${index === step ? 'is-current' : ''}${index < step ? ' is-complete' : ''}`}>
              <span>{index < step ? '✓' : index + 1}</span>
              <div><strong>{label}</strong><small>{detail}</small></div>
            </li>
          ))}
        </ol>
        <div className="workspace-builder__privacy">
          <span>Private by design</span>
          <p>Your answers stay in this workspace and can be changed later.</p>
        </div>
      </aside>

      <section className="workspace-builder__main">
        <header className="workspace-builder__topbar">
          <span>Workspace builder</span>
          <div>
            {saveStatus !== 'idle' && <small aria-live="polite">{saveStatus === 'saving' ? 'Saving…' : 'Progress saved'}</small>}
            {embedded && onExit && step !== 8 && (
              <button type="button" onClick={onExit}>Close</button>
            )}
          </div>
        </header>

        <div className="workspace-builder__content">
          <div className="workspace-builder__step-label">Step {step + 1} of {steps.length}</div>
          <h1 ref={headingRef} tabIndex={-1}>{title}</h1>

          {step === 0 && (
            <div className="builder-welcome">
              <p>We’ll learn how you work and prepare a calm, useful workspace—not a wall of features.</p>
              <div className="builder-welcome__promise">
                <span>Typical setup</span>
                <strong>3–5 minutes</strong>
                <small>You can pause and return at any time.</small>
              </div>
              <ul>
                <li><span>1</span><div><strong>Tell us about the work</strong><small>Plain-language questions, no technical setup.</small></div></li>
                <li><span>2</span><div><strong>Review the recommendation</strong><small>Keep only the modules you want.</small></div></li>
                <li><span>3</span><div><strong>Launch with a head start</strong><small>Draft workflows and an optional sample project.</small></div></li>
              </ul>
            </div>
          )}

          {step === 1 && (
            <div className="builder-form-grid">
              <label className="builder-field builder-field--wide">
                <span>Business name</span>
                <input value={answers.business.name} onChange={(event) => updateBusiness('name', event.target.value)} autoComplete="organization" maxLength={120} />
              </label>
              <label className="builder-field">
                <span>Industry</span>
                <input list="builder-industries" value={answers.business.industry} onChange={(event) => updateBusiness('industry', event.target.value)} placeholder="Start typing…" maxLength={120} />
                <datalist id="builder-industries">{industries.map((item) => <option key={item} value={item} />)}</datalist>
              </label>
              <label className="builder-field">
                <span>Business size</span>
                <select value={answers.business.size} onChange={(event) => updateBusiness('size', event.target.value)}>
                  {catalog.businessSizes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="builder-field">
                <span>Country</span>
                <input list="builder-countries" value={answers.business.country} onChange={(event) => updateBusiness('country', event.target.value)} placeholder="Choose or type a country" maxLength={80} />
                <datalist id="builder-countries">{countries.map((country) => <option key={country} value={country} />)}</datalist>
              </label>
              <label className="builder-field">
                <span>Timezone</span>
                <input list="builder-timezones" value={answers.business.timezone} onChange={(event) => updateBusiness('timezone', event.target.value)} />
                <datalist id="builder-timezones">{[...new Set([answers.business.timezone, ...commonTimezones])].map((item) => <option key={item} value={item} />)}</datalist>
              </label>
              <label className="builder-logo-field">
                <span className="builder-logo-field__preview">
                  {logoPreview ? <img src={logoPreview} alt="Logo preview" /> : answers.business.name.slice(0, 2).toUpperCase() || 'LO'}
                </span>
                <span><strong>{logo?.name || answers.business.logoName || 'Add a logo'}</strong><small>Optional · JPEG, PNG, or WebP · 2 MB max</small></span>
                <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={logoChanged} />
              </label>
            </div>
          )}

          {step === 2 && (
            <>
              <p className="builder-lead">Choose everything that applies. We’ll use these activities to select a proven business profile.</p>
              <div className="builder-choice-grid">
                {catalog.activities.map((item) => (
                  <Choice key={item.id} selected={answers.activities.includes(item.id)} title={item.name} onClick={() => setAnswers((current) => ({ ...current, activities: toggleValue(current.activities, item.id) }))} />
                ))}
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <p className="builder-lead">Select services you may want to connect. Nothing is connected without your authorisation.</p>
              <div className="builder-integration-groups">
                {integrationGroups.map(([category, items]) => (
                  <fieldset key={category}>
                    <legend>{category}</legend>
                    <div className="builder-choice-grid builder-choice-grid--compact">
                      {items.map((item) => <Choice key={item.id} selected={answers.tools.includes(item.id)} title={item.name} onClick={() => setAnswers((current) => ({ ...current, tools: toggleValue(current.tools, item.id) }))} />)}
                    </div>
                  </fieldset>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <p className="builder-lead">Choose everyone you regularly coordinate with.</p>
              <div className="builder-choice-grid">
                {catalog.people.map((item) => (
                  <Choice
                    key={item.id}
                    selected={answers.people.includes(item.id)}
                    title={item.name}
                    onClick={() => setAnswers((current) => {
                      const people = item.id === 'just-me'
                        ? ['just-me']
                        : toggleValue(current.people.filter((person) => person !== 'just-me'), item.id)
                      return { ...current, people }
                    })}
                  />
                ))}
              </div>
              {!answers.people.includes('just-me') && (
                <label className="builder-switch-row">
                  <input type="checkbox" checked={answers.inviteTeam} onChange={(event) => setAnswers((current) => ({ ...current, inviteTeam: event.target.checked }))} />
                  <span><strong>Invite the team after setup</strong><small>We’ll take you to a simple invitation screen when your workspace is ready.</small></span>
                </label>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <p className="builder-lead">Turn on the statements that describe your real process today.</p>
              <div className="builder-process-list">
                {catalog.processes.map((item) => (
                  <label key={item.id}>
                    <span>{item.question}</span>
                    <input type="checkbox" checked={Boolean(answers.processes[item.id])} onChange={(event) => setAnswers((current) => ({ ...current, processes: { ...current.processes, [item.id]: event.target.checked } }))} />
                  </label>
                ))}
              </div>
              <label className="builder-switch-row">
                <input type="checkbox" checked={answers.sampleData} onChange={(event) => setAnswers((current) => ({ ...current, sampleData: event.target.checked }))} />
                <span><strong>Add a sample client and project</strong><small>A guided example you can edit or delete at any time.</small></span>
              </label>
            </>
          )}

          {step === 6 && (
            <>
              <p className="builder-lead">This is the smallest setup we think will help. Every item can be turned off except your dashboard.</p>
              <section className="builder-review-section">
                <div className="builder-section-heading"><span>01</span><div><h2>Modules</h2><p>{selectedModules.length} selected</p></div></div>
                <div className="builder-choice-grid">
                  {(recommendation.modules || []).map((id) => {
                    const item = moduleById.get(id)
                    if (!item) return null
                    return <Choice key={id} selected={selectedModules.includes(id)} title={item.name} description={recommendation.reasons?.[id] || item.description} disabled={id === 'dashboard'} onClick={() => setSelectedModules(toggleValue(selectedModules, id))} />
                  })}
                </div>
              </section>
              {(recommendation.integrations?.length || 0) > 0 && (
                <section className="builder-review-section">
                  <div className="builder-section-heading"><span>02</span><div><h2>Connections</h2><p>Authorise these after launch</p></div></div>
                  <div className="builder-choice-grid builder-choice-grid--compact">
                    {catalog.integrations.filter((item) => recommendation.integrations?.includes(item.id)).map((item) => <Choice key={item.id} selected={selectedIntegrations.includes(item.id)} title={item.name} description={item.category} onClick={() => setSelectedIntegrations(toggleValue(selectedIntegrations, item.id))} />)}
                  </div>
                </section>
              )}
              {(recommendation.automations?.length || 0) > 0 && (
                <section className="builder-review-section">
                  <div className="builder-section-heading"><span>03</span><div><h2>Automation drafts</h2><p>Nothing runs until you activate it</p></div></div>
                  <div className="builder-choice-grid">
                    {recommendation.automations?.map((item) => <Choice key={item.id} selected={selectedAutomations.includes(item.id)} title={item.name} description={`${item.trigger} → ${item.actions.join(' → ')}`} onClick={() => setSelectedAutomations(toggleValue(selectedAutomations, item.id))} />)}
                  </div>
                </section>
              )}
            </>
          )}

          {step === 7 && (
            <div className="builder-ai">
              <div className="builder-ai__intro"><span>AI is optional</span><p>Your workspace profile is already complete. Use AI only if a unique rule was not covered by the questions.</p></div>
              <label className="builder-field builder-field--wide">
                <span>Tell us anything unique about your business</span>
                <textarea value={answers.uniqueRequirements} maxLength={2000} rows={5} onChange={(event) => setAnswers((current) => ({ ...current, uniqueRequirements: event.target.value }))} placeholder="For example: Every client project needs two approvals before completion." />
                <small>{answers.uniqueRequirements.length}/2,000</small>
              </label>
              <button className="builder-secondary-action" type="button" disabled={busy || !answers.uniqueRequirements.trim()} onClick={() => void requestAiSuggestions()}>{busy ? 'Thinking…' : aiSuggestions.length ? 'Refresh suggestions' : 'Suggest a workflow'}</button>
              {aiMessage && <p className="builder-inline-message" role="status">{aiMessage}</p>}
              {aiSuggestions.length > 0 && (
                <div className="builder-ai__suggestions">
                  {aiSuggestions.map((item) => (
                    <Choice key={item.id} selected={selectedAiSuggestions.includes(item.id)} title={item.title} description={`${item.trigger} → ${item.steps.join(' → ')}`} onClick={() => setSelectedAiSuggestions(toggleValue(selectedAiSuggestions, item.id))} />
                  ))}
                  <p>Only checked suggestions will be added, and they will remain drafts until you activate them.</p>
                </div>
              )}
            </div>
          )}

          {step === 8 && (
            <div className="builder-generating" aria-live="polite">
              <div className="builder-generating__orb"><BuilderMark /></div>
              <div className="builder-generation-list">
                {generationStages.map((stage, index) => (
                  <div key={stage} className={`${index < generationProgress ? 'is-complete' : ''}${index === generationProgress ? ' is-active' : ''}`}>
                    <span>{index < generationProgress ? '✓' : index + 1}</span>
                    <strong>{stage}</strong>
                  </div>
                ))}
              </div>
              {!busy && <button type="button" className="builder-secondary-action" onClick={() => void generateWorkspace()}>{error ? 'Try generation again' : 'Resume generation'}</button>}
              {error && <p className="builder-error" role="alert">{error}</p>}
            </div>
          )}

          {step === 9 && (
            <div className="builder-launch">
              <p>Your tailored workspace is live. Connections still need your authorisation, and every new automation starts as a draft.</p>
              <SelectionSummary recommendation={recommendation} catalog={catalog} />
              <div className="builder-launch__next">
                <span>Good first step</span>
                <strong>{answers.inviteTeam ? 'Bring your collaborators in.' : 'Open your dashboard and choose one real task.'}</strong>
                <p>There is no need to configure everything today. Lancee can grow with the way you work.</p>
              </div>
            </div>
          )}

          {error && step !== 8 && <p className="builder-error" role="alert">{error}</p>}
        </div>

        <footer className="workspace-builder__footer">
          <div>
            {step > 0 && step < 8 && <button type="button" className="builder-back" disabled={busy} onClick={() => void back()}>Back</button>}
            {step === 9 && embedded && <button type="button" className="builder-back" disabled={busy} onClick={() => void restart()}>Build again</button>}
          </div>
          {step < 8 && (
            <button type="button" className="builder-primary" disabled={busy} onClick={() => void next()}>
              {busy ? 'Saving…' : step === 0 ? 'Build my workspace' : step === 5 ? 'Create my recommendation' : step === 7 ? 'Build workspace' : 'Continue'}
              {!busy && <span aria-hidden="true">→</span>}
            </button>
          )}
          {step === 9 && (
            <button type="button" className="builder-primary" onClick={() => {
              onComplete(currentState, answers.business.name)
              if (answers.inviteTeam) onInviteTeam()
            }}>
              {answers.inviteTeam ? 'Invite team' : 'Explore workspace'} <span aria-hidden="true">→</span>
            </button>
          )}
        </footer>
      </section>
    </main>
  )
}
