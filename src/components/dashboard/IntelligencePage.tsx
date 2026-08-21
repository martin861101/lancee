import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../../lib/api'
import { DASHBOARD_ASSISTANT_QUERY_EVENT } from './WorkspaceChat'
import AnalyticsPage from './AnalyticsPage'
import './dashboard-page.css'
import './intelligence-page.css'

type CountMap = Record<string, number>

type LearningModel = {
  id: string
  modelType: string
  modelVersion: string
  sampleSize: number
  status: string
  createdAt: string
}

type IntelligenceCategory = {
  objectType: string
  decisions: number
  measuredOutcomes: number
  patterns: number
  predictions: number
  warnings: number
}

type IntelligenceEvent = {
  id: string
  eventType: string
  entityType: string
  entityId: string | null
  payload: Record<string, unknown>
  occurredAt: string
}

type IntelligenceOverview = {
  metrics: {
    decisionsObserved: number
    measuredOutcomes: number
    outcomesAwaitingMeasurement: number
    evidenceRecords: number
    decisionsByStatus: CountMap
    patternsByStatus: CountMap
    predictionsByStatus: CountMap
    warningsByStatus: CountMap
    reviewsByStatus: CountMap
  }
  thresholds: {
    minimumPatternSamples: number
    activePatternConfidence: number
    warningConfidence: number
    minimumCalibrationSamples: number
  }
  learningModel: LearningModel | null
  categories: IntelligenceCategory[]
  timeline: IntelligenceEvent[]
}

type ExpectedReaction = {
  metricKey: string
  direction: string
  expectedChange: number | null
  confidence: number
  observationReview?: { status: string; dueAt: string } | null
}

type Decision = {
  id: string
  objectType: string
  objectId: string | null
  clientId: string | null
  projectId: string | null
  title: string
  decisionText: string
  rationale: string | null
  intent: string
  decidedAt: string
  status: 'draft' | 'active' | 'reviewed' | 'archived'
  vector: {
    objectType: string
    actionType: string
    targetType: string
    sourceState: string | null
    destinationState: string | null
    intentType: string
    expectedDirection: string
    vectorVersion: string
  } | null
  expectedReactions: ExpectedReaction[]
}

type DecisionPattern = {
  id: string
  objectType: string
  actionType: string
  targetType: string
  intentType: string
  metricKey: string
  sampleSize: number
  positiveCount: number
  negativeCount: number
  neutralCount: number
  meanChangePercent: number
  standardDeviation: number
  dominantDirection: string
  evidenceConfidence: number
  causalConfidence: number
  patternConfidence: number
  sourceDecisionIds: string[]
  detectorVersion: string
  status: 'active' | 'emerging' | 'retired'
  updatedAt: string
}

type DecisionPrediction = {
  id: string
  decisionId: string
  metricKey: string
  patternId: string
  predictedDirection: string
  predictedChangePercent: number
  intervalLow: number
  intervalHigh: number
  predictionConfidence: number
  sampleSize: number
  sourceDecisionIds: string[]
  modelVersion: string
  status: 'active' | 'measured' | 'superseded'
  actualDirection: string | null
  actualChangePercent: number | null
  absoluteError: number | null
  measuredAt: string | null
  createdAt: string
}

type DecisionWarning = {
  id: string
  decisionId: string
  decisionTitle: string
  metricKey: string
  patternId: string | null
  predictionId: string | null
  severity: 'low' | 'medium' | 'high'
  summary: string
  warningConfidence: number
  evidence: {
    sourceDecisionIds?: string[]
    predictedChangePercent?: number
    intervalLow?: number
    intervalHigh?: number
    expectedDirection?: string
    causalClaim?: boolean
  }
  policyVersion: string
  status: 'active' | 'acknowledged' | 'dismissed' | 'resolved'
  createdAt: string
  reviewedAt: string | null
}

type DecisionReview = {
  id: string
  decisionId: string
  decisionTitle: string
  metricKey: string
  dueAt: string
  status: string
}

type DecisionEvidence = {
  id: string
  sourceType: string
  sourceId: string
  relation: string
  summary: string
  weight: number
  createdAt: string
}

type DecisionOutcomeDetail = {
  decisionId: string
  outcome: null | {
    outcomeDirection: string
    outcomeClass: string
    observedReason: string | null
    evidenceConfidence: number
    causalConfidence: number | null
    confidenceVersion: string
    reviewedAt: string
  }
  metrics: Array<{
    metricKey: string
    unit: string | null
    baselineValue: number | null
    observedValue: number | null
    changeAbsolute: number | null
    changePercent: number | null
    measurementStatus: string
  }>
  expectedVsActual: Array<{ metricKey: string; expectedDirection: string; result: string }>
  confounders: Array<{ id: string; factorType: string; factorValue: string; significance: number }>
  causalAssessment: null | {
    designType: string
    claimLevel: string
    effectEstimate: number | null
    effectUnit: string | null
    evidenceConfidence: number
    causalConfidence: number
    inferenceConfidence: number
    assumptions: string[]
    modelVersion: string
  }
}

type DecisionDetail = {
  decision: Decision
  outcome: DecisionOutcomeDetail
  evidence: DecisionEvidence[]
}

type SelectedItem =
  | { kind: 'decision'; item: Decision }
  | { kind: 'pattern'; item: DecisionPattern }
  | { kind: 'prediction'; item: DecisionPrediction }
  | { kind: 'warning'; item: DecisionWarning }
  | { kind: 'category'; item: IntelligenceCategory }

type IntelligenceIconName = 'arrow' | 'brain' | 'check' | 'close' | 'evidence' | 'map' | 'pattern' | 'prediction' | 'refresh' | 'search' | 'timeline' | 'warning'

function IntelligenceIcon({ name, size = 18 }: { name: IntelligenceIconName; size?: number }) {
  const paths: Record<IntelligenceIconName, ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    brain: <><path d="M9.5 4.5A3 3 0 0 0 4 6v1.2A3.4 3.4 0 0 0 3 13a3.5 3.5 0 0 0 4 5.5" /><path d="M14.5 4.5A3 3 0 0 1 20 6v1.2a3.4 3.4 0 0 1 1 5.8 3.5 3.5 0 0 1-4 5.5" /><path d="M9 4.5V20M15 4.5V20M9 9H7M15 9h2M9 15H7M15 15h2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,
    evidence: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v5h5M9 12h7M9 16h5" /></>,
    map: <><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="m10.8 7.2-4.6 8.5M13.2 7.2l4.6 8.5M7.5 18h9" /></>,
    pattern: <><path d="M4 18V9M10 18V5M16 18v-7M22 18V3" /><path d="M3 18h20" /></>,
    prediction: <><path d="M4 18 10 12l4 3 6-9" /><path d="M15 6h5v5" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 9a7 7 0 0 1 11.6-2L20 9M4 15l2.3 2a7 7 0 0 0 11.6-2" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    timeline: <><path d="M12 3v18" /><circle cx="12" cy="7" r="2" /><circle cx="12" cy="17" r="2" /><path d="M5 7h5M14 17h5" /></>,
    warning: <><path d="M12 3 2.8 20h18.4z" /><path d="M12 9v5M12 17h.01" /></>,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function label(value: string | null | undefined) {
  const text = String(value || '').replaceAll('_', ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Not recorded'
}

function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Not recorded'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value))
}

function formatConfidence(value: number | null | undefined) {
  return Number.isFinite(value) ? `${Math.round(Number(value) * 100)}%` : 'Not available'
}

function formatChange(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 'Not available'
  const number = Number(value)
  return `${number > 0 ? '+' : ''}${number.toLocaleString('en-ZA', { maximumFractionDigits: 1 })}%`
}

function plural(value: number, singular: string, pluralValue = `${singular}s`) {
  return `${value.toLocaleString('en-ZA')} ${value === 1 ? singular : pluralValue}`
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
    'decision.created': 'Decision recorded',
    'decision.updated': 'Decision updated',
    'decision.reviewed': 'Outcome measured',
    'decision.comparison_reviewed': 'Comparison reviewed',
    'decision.learning_model_updated': 'Learning model updated',
    'decision.pattern_detected': 'Pattern identified',
    'decision.prediction_created': 'Prediction created',
    'decision.prediction_measured': 'Prediction measured',
    'decision.warning_created': 'Warning generated',
    'decision.causal_assessed': 'Causal boundary assessed',
    'outcome.observation_started': 'Outcome observation scheduled',
    'outcome.observation_completed': 'Outcome observation completed',
    'outcome.recorded': 'Outcome recorded',
  }
  return labels[eventType] || label(eventType)
}

async function invokeDecisionTool<T>(toolId: string, toolArguments: Record<string, unknown> = {}) {
  const result = await api.mcp.invoke('lancee', toolId, toolArguments)
  if (!result.ok) throw new Error(result.message || 'Decision Intelligence is unavailable.')
  return (result.data || {}) as T
}

function namedConfidence(name: string, value: number | null | undefined, tone = 'neutral') {
  return <span className="intelligence-confidence" data-tone={tone}>{name} <strong>{formatConfidence(value)}</strong></span>
}

function patternStatement(pattern: DecisionPattern) {
  const direction = pattern.dominantDirection === 'mixed'
    ? 'mixed movement'
    : `${label(pattern.dominantDirection).toLowerCase()} movement`
  return `${label(pattern.actionType)} decisions involving ${label(pattern.objectType).toLowerCase()} have been associated with ${direction} in ${label(pattern.metricKey).toLowerCase()}.`
}

function predictionStatement(prediction: DecisionPrediction) {
  return `Based on ${plural(prediction.sampleSize, 'comparable measured decision')}, ${label(prediction.metricKey).toLowerCase()} is estimated to move ${label(prediction.predictedDirection).toLowerCase()} by around ${formatChange(prediction.predictedChangePercent)}.`
}

function askLancee(question: string) {
  window.dispatchEvent(new CustomEvent(DASHBOARD_ASSISTANT_QUERY_EVENT, { detail: { question } }))
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="intelligence-section__heading">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </header>
  )
}

function EmptyIntelligence({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="intelligence-empty">
      <span><IntelligenceIcon name="brain" size={20} /></span>
      <div><strong>{title}</strong><p>{children}</p></div>
    </div>
  )
}

export default function IntelligencePage({ canManage = true }: { canManage?: boolean }) {
  const [overview, setOverview] = useState<IntelligenceOverview | null>(null)
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [patterns, setPatterns] = useState<DecisionPattern[]>([])
  const [predictions, setPredictions] = useState<DecisionPrediction[]>([])
  const [warnings, setWarnings] = useState<DecisionWarning[]>([])
  const [reviews, setReviews] = useState<DecisionReview[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [decisionLimit, setDecisionLimit] = useState(25)
  const [loadingMore, setLoadingMore] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [warningFilter, setWarningFilter] = useState('active')
  const [selected, setSelected] = useState<SelectedItem | null>(null)
  const [decisionDetail, setDecisionDetail] = useState<DecisionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [reviewingWarning, setReviewingWarning] = useState(false)
  const [askQuestion, setAskQuestion] = useState('')

  const load = useCallback(async (limit = 25) => {
    const [overviewResult, decisionResult, patternResult, predictionResult, warningResult, reviewResult] = await Promise.all([
      invokeDecisionTool<{ overview: IntelligenceOverview }>('get_decision_intelligence_overview'),
      invokeDecisionTool<{ decisions: Decision[] }>('list_decisions', { limit }),
      invokeDecisionTool<{ patterns: DecisionPattern[] }>('list_decision_patterns', { status: 'all', limit: 50 }),
      invokeDecisionTool<{ predictions: DecisionPrediction[] }>('list_decision_predictions', { status: 'all', limit: 50 }),
      invokeDecisionTool<{ warnings: DecisionWarning[] }>('list_decision_warnings', { status: 'all', limit: 50 }),
      invokeDecisionTool<{ reviews: DecisionReview[] }>('list_decision_reviews', { status: 'open', limit: 50 }),
    ])
    setOverview(overviewResult.overview)
    setDecisions(decisionResult.decisions)
    setPatterns(patternResult.patterns)
    setPredictions(predictionResult.predictions)
    setWarnings(warningResult.warnings)
    setReviews(reviewResult.reviews)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    void load(25)
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Unable to load Decision Intelligence.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [load])

  useEffect(() => {
    if (selected?.kind !== 'decision') {
      setDecisionDetail(null)
      setDetailError('')
      return
    }
    let active = true
    setDetailLoading(true)
    setDetailError('')
    const decisionId = selected.item.id
    void Promise.all([
      invokeDecisionTool<{ decision: Decision }>('get_decision', { decision_id: decisionId }),
      invokeDecisionTool<{ outcome: DecisionOutcomeDetail }>('get_decision_outcome', { decision_id: decisionId }),
      invokeDecisionTool<{ evidence: DecisionEvidence[] }>('get_decision_evidence', { decision_id: decisionId }),
    ]).then(([decisionResult, outcomeResult, evidenceResult]) => {
      if (active) setDecisionDetail({
        decision: decisionResult.decision,
        outcome: outcomeResult.outcome,
        evidence: evidenceResult.evidence,
      })
    }).catch((detailLoadError) => {
      if (active) setDetailError(detailLoadError instanceof Error ? detailLoadError.message : 'Unable to load supporting evidence.')
    }).finally(() => {
      if (active) setDetailLoading(false)
    })
    return () => { active = false }
  }, [selected])

  const openDecision = (decisionId: string) => {
    const decision = decisions.find((item) => item.id === decisionId)
    setSelected({
      kind: 'decision',
      item: decision || {
        id: decisionId,
        objectType: 'decision',
        objectId: null,
        clientId: null,
        projectId: null,
        title: 'Historical decision',
        decisionText: '',
        rationale: null,
        intent: '',
        decidedAt: '',
        status: 'reviewed',
        vector: null,
        expectedReactions: [],
      },
    })
  }

  const refresh = async () => {
    if (!canManage) return
    setRefreshing(true)
    setNotice('')
    setError('')
    try {
      await invokeDecisionTool('refresh_decision_intelligence')
      await load(decisionLimit)
      setNotice('Decision Intelligence refreshed from persisted workspace outcomes.')
    } catch (refreshError) {
      setNotice(refreshError instanceof Error ? `Refresh failed: ${refreshError.message} Existing intelligence remains available.` : 'Decision Intelligence refresh failed. Existing intelligence remains available.')
    } finally {
      setRefreshing(false)
    }
  }

  const loadMoreDecisions = async () => {
    const nextLimit = Math.min(100, decisionLimit + 25)
    setLoadingMore(true)
    try {
      const result = await invokeDecisionTool<{ decisions: Decision[] }>('list_decisions', { limit: nextLimit })
      setDecisions(result.decisions)
      setDecisionLimit(nextLimit)
    } catch (loadError) {
      setNotice(loadError instanceof Error ? loadError.message : 'Unable to load more decisions.')
    } finally {
      setLoadingMore(false)
    }
  }

  const reviewWarning = async (warning: DecisionWarning, action: 'acknowledged' | 'dismissed') => {
    setReviewingWarning(true)
    setDetailError('')
    try {
      const result = await invokeDecisionTool<{ warning: DecisionWarning }>('review_decision_warning', {
        warning_id: warning.id,
        action,
      })
      const updatedWarning = {
        ...warning,
        ...result.warning,
        decisionTitle: result.warning.decisionTitle || warning.decisionTitle,
      }
      setWarnings((current) => current.map((item) => item.id === warning.id ? updatedWarning : item))
      setSelected({ kind: 'warning', item: updatedWarning })
      const refreshedOverview = await invokeDecisionTool<{ overview: IntelligenceOverview }>('get_decision_intelligence_overview')
      setOverview(refreshedOverview.overview)
    } catch (warningError) {
      setDetailError(warningError instanceof Error ? warningError.message : 'Unable to update this warning.')
    } finally {
      setReviewingWarning(false)
    }
  }

  const submitQuestion = (event: FormEvent) => {
    event.preventDefault()
    const question = askQuestion.trim()
    if (!question) return
    askLancee(question)
    setAskQuestion('')
  }

  const filteredDecisions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return decisions.filter((decision) => {
      if (statusFilter !== 'all' && decision.status !== statusFilter) return false
      if (categoryFilter !== 'all' && decision.objectType !== categoryFilter) return false
      if (!needle) return true
      return [decision.title, decision.decisionText, decision.rationale, decision.intent, decision.objectType, decision.projectId, decision.clientId]
        .some((value) => String(value || '').toLowerCase().includes(needle))
    })
  }, [categoryFilter, decisions, query, statusFilter])

  const shownWarnings = warningFilter === 'all'
    ? warnings
    : warnings.filter((warning) => warning.status === warningFilter)
  const currentPatterns = patterns.filter((pattern) => pattern.status !== 'retired')
  const currentPredictions = predictions.filter((prediction) => prediction.status !== 'superseded')

  if (loading) {
    return (
      <div className="content-container dashboard-page intelligence-page" role="status" aria-label="Loading Decision Intelligence">
        <div className="intelligence-skeleton intelligence-skeleton--hero" />
        <div className="intelligence-skeleton-grid">{[1, 2, 3, 4, 5, 6].map((item) => <div className="intelligence-skeleton" key={item} />)}</div>
      </div>
    )
  }

  if (error || !overview) {
    return (
      <div className="content-container dashboard-page intelligence-page">
        <div className="dashboard-alert" role="alert">{error || 'Decision Intelligence is unavailable.'}</div>
        <button type="button" className="button button--secondary" onClick={() => window.location.reload()}>Try again</button>
      </div>
    )
  }

  const metrics = overview.metrics
  const reliablePatterns = metrics.patternsByStatus.active || 0
  const activePredictions = metrics.predictionsByStatus.active || 0
  const activeWarnings = metrics.warningsByStatus.active || 0
  const openReviews = (metrics.reviewsByStatus.scheduled || 0) + (metrics.reviewsByStatus.due || 0)
  const heroTitle = metrics.decisionsObserved === 0
    ? 'Lancee is ready to learn how your business makes decisions.'
    : metrics.measuredOutcomes === 0
      ? `Lancee is observing ${plural(metrics.decisionsObserved, 'recorded decision')}.`
      : reliablePatterns === 0
        ? 'Outcomes are being measured. Reliable patterns need more comparable history.'
        : `Lancee has learned ${plural(reliablePatterns, 'reliable pattern')} from your measured outcomes.`
  const heroDescription = metrics.decisionsObserved === 0
    ? 'Record important choices, the evidence available at the time, and the outcome you expect. Intelligence grows from that durable history.'
    : metrics.measuredOutcomes === 0
      ? 'The decision ledger is active. Add measured outcomes so Lancee can compare expectations with what happened next.'
      : reliablePatterns === 0
        ? `A pattern requires at least ${overview.thresholds.minimumPatternSamples} comparable measured outcomes with the same decision structure. Lancee will not fabricate a pattern before that threshold is met.`
        : 'Patterns, estimates, and warnings below come from persisted workspace decisions and measured outcomes—not generated guesses.'

  return (
    <div className="content-container animate-fade-in dashboard-page intelligence-page">
      <header className="intelligence-page__header">
        <div>
          <span className="intelligence-eyebrow"><IntelligenceIcon name="brain" size={15} /> Decision Intelligence</span>
          <h1>What has Lancee learned?</h1>
          <p>Turn measured business decisions into evidence you can inspect before making the next one.</p>
        </div>
        <button type="button" className="button button--secondary" onClick={() => void refresh()} disabled={!canManage || refreshing} title={!canManage ? 'Workspace write access is required to refresh intelligence.' : undefined}>
          <IntelligenceIcon name="refresh" size={15} /> {refreshing ? 'Refreshing…' : 'Refresh intelligence'}
        </button>
      </header>

      {notice && <div className={`intelligence-notice${notice.startsWith('Refresh failed') ? ' is-error' : ''}`} role="status">{notice}</div>}

      <section className="intelligence-hero" aria-labelledby="intelligence-learning-title">
        <div className="intelligence-hero__copy">
          <span>Current learning state</span>
          <h2 id="intelligence-learning-title">{heroTitle}</h2>
          <p>{heroDescription}</p>
          <div className="intelligence-hero__proof">
            <span><IntelligenceIcon name="check" size={14} /> Workspace isolated</span>
            <span><IntelligenceIcon name="check" size={14} /> Deterministic learning</span>
            <span><IntelligenceIcon name="check" size={14} /> Evidence traceable</span>
          </div>
        </div>
        <div className="intelligence-learning-card">
          <div><span>Learning progress</span><strong>{metrics.measuredOutcomes > 0 ? 'Measuring' : 'Observing'}</strong></div>
          <ol>
            <li className={metrics.decisionsObserved > 0 ? 'is-complete' : ''}><span>{metrics.decisionsObserved}</span><div><strong>Decisions recorded</strong><small>The authoritative decision ledger</small></div></li>
            <li className={metrics.measuredOutcomes > 0 ? 'is-complete' : ''}><span>{metrics.measuredOutcomes}</span><div><strong>Outcomes measured</strong><small>Metric observations, not assumptions</small></div></li>
            <li className={reliablePatterns > 0 ? 'is-complete' : ''}><span>{reliablePatterns}</span><div><strong>Reliable patterns</strong><small>At least {overview.thresholds.minimumPatternSamples} comparable outcomes each</small></div></li>
          </ol>
          <p>Lancee becomes more useful as decisions and their outcomes are recorded.</p>
        </div>
      </section>

      <section className="intelligence-metrics" aria-label="Decision Intelligence overview">
        {[
          ['Decisions observed', metrics.decisionsObserved, 'Authoritative ledger'],
          ['Measured outcomes', metrics.measuredOutcomes, 'Recorded metric observations'],
          ['Reliable patterns', reliablePatterns, `${metrics.patternsByStatus.emerging || 0} still emerging`],
          ['Active predictions', activePredictions, 'Bounded empirical estimates'],
          ['Active warnings', activeWarnings, `${openReviews} outcome reviews open`],
          ['Evidence records', metrics.evidenceRecords, 'Attached provenance'],
        ].map(([metricLabel, value, caption]) => (
          <article key={String(metricLabel)}>
            <span>{metricLabel}</span>
            <strong>{Number(value).toLocaleString('en-ZA')}</strong>
            <small>{caption}</small>
          </article>
        ))}
      </section>

      <div className="intelligence-primary-grid">
        <section className="intelligence-panel intelligence-map" aria-labelledby="intelligence-map-title">
          <SectionHeading eyebrow="Knowledge map" title="How learning connects" description="Every node is derived from a real decision category and its persisted relationships." />
          {overview.categories.length === 0 ? (
            <EmptyIntelligence title="No decision relationships yet">The map will grow from categories in the decision ledger. Nothing is added for decoration.</EmptyIntelligence>
          ) : (
            <div className="intelligence-map__network" aria-describedby="intelligence-map-title">
              <div className="intelligence-map__root"><span>Business</span><strong>{plural(metrics.decisionsObserved, 'decision')}</strong></div>
              <div className="intelligence-map__nodes">
                {overview.categories.slice(0, 8).map((category) => (
                  <button type="button" key={category.objectType} onClick={() => setSelected({ kind: 'category', item: category })}>
                    <span>{label(category.objectType)}</span>
                    <strong>{category.decisions}</strong>
                    <small>{category.measuredOutcomes} measured · {category.patterns} patterns</small>
                    {(category.predictions > 0 || category.warnings > 0) && <em>{category.predictions} predictions · {category.warnings} warnings</em>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="intelligence-panel intelligence-timeline" aria-labelledby="intelligence-timeline-title">
          <SectionHeading eyebrow="Learning history" title="Intelligence timeline" description="Persisted events show how observations became usable evidence." />
          {overview.timeline.length === 0 ? (
            <EmptyIntelligence title="The timeline is waiting">Decision, outcome, pattern, prediction, and warning events will appear here as they happen.</EmptyIntelligence>
          ) : (
            <ol>
              {overview.timeline.slice(0, 8).map((event) => (
                <li key={event.id}>
                  <span><IntelligenceIcon name="timeline" size={15} /></span>
                  <div><strong>{eventLabel(event.eventType)}</strong><small>{formatDate(event.occurredAt, true)}</small></div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="intelligence-section" aria-labelledby="warnings-title">
        <SectionHeading
          eyebrow="Needs attention"
          title="Warnings"
          description="Calm, proactive checks for expectations that conflict with qualifying history. Warnings never claim causality."
          action={<div className="intelligence-filter-chips" aria-label="Filter warnings">{['active', 'acknowledged', 'dismissed', 'resolved', 'all'].map((status) => <button type="button" key={status} aria-pressed={warningFilter === status} onClick={() => setWarningFilter(status)}>{label(status)}</button>)}</div>}
        />
        {shownWarnings.length === 0 ? (
          <EmptyIntelligence title={warnings.length === 0 ? 'No evidence warnings' : `No ${warningFilter} warnings`}>
            {metrics.decisionsObserved === 0
              ? 'Warnings require a recorded decision, a matching pattern, and enough prediction confidence.'
              : 'An empty warning collection does not mean the decision ledger is empty. It only means no warning matches this view.'}
          </EmptyIntelligence>
        ) : (
          <div className="intelligence-warning-list">
            {shownWarnings.map((warning) => (
              <button type="button" key={warning.id} className="intelligence-warning" data-severity={warning.severity} onClick={() => setSelected({ kind: 'warning', item: warning })}>
                <span><IntelligenceIcon name="warning" size={18} /></span>
                <div><small>{label(warning.severity)} · {label(warning.status)}</small><strong>{warning.summary}</strong><p>{warning.decisionTitle} · {label(warning.metricKey)}</p></div>
                <div>{namedConfidence('Warning confidence', warning.warningConfidence, 'warning')}<IntelligenceIcon name="arrow" size={16} /></div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="intelligence-section" aria-labelledby="patterns-title">
        <SectionHeading eyebrow="What repeats" title="Learned patterns" description="Recurring measured outcomes grouped by the exact Decision Vector dimensions Lancee already uses." />
        {currentPatterns.length === 0 ? (
          <EmptyIntelligence title="No reliable pattern yet">
            {metrics.measuredOutcomes === 0
              ? 'Record measured outcomes to begin pattern detection.'
              : `Lancee needs at least ${overview.thresholds.minimumPatternSamples} comparable measured outcomes per decision structure. ${plural(metrics.measuredOutcomes, 'outcome')} are currently measured.`}
          </EmptyIntelligence>
        ) : (
          <div className="intelligence-card-grid">
            {currentPatterns.map((pattern) => (
              <button type="button" className="intelligence-card" key={pattern.id} onClick={() => setSelected({ kind: 'pattern', item: pattern })}>
                <div className="intelligence-card__top"><span><IntelligenceIcon name="pattern" size={17} /> {label(pattern.status)}</span><small>{label(pattern.objectType)}</small></div>
                <h3>{patternStatement(pattern)}</h3>
                <div className="intelligence-card__measure"><span>Average measured change</span><strong>{formatChange(pattern.meanChangePercent)}</strong></div>
                <div className="intelligence-confidence-row">
                  {namedConfidence('Pattern', pattern.patternConfidence, 'pattern')}
                  {namedConfidence('Evidence', pattern.evidenceConfidence)}
                </div>
                <footer><span>{plural(pattern.sampleSize, 'historical decision')}</span><span>View evidence <IntelligenceIcon name="arrow" size={14} /></span></footer>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="intelligence-section" aria-labelledby="predictions-title">
        <SectionHeading eyebrow="What may happen" title="Predictions" description="Empirical estimates with their range, sample, source decisions, confidence, and model version visible." />
        {currentPredictions.length === 0 ? (
          <EmptyIntelligence title="No active predictions">Predictions require a qualifying learned pattern and an unmeasured expected outcome. Lancee will not turn sparse history into a forecast.</EmptyIntelligence>
        ) : (
          <div className="intelligence-card-grid intelligence-card-grid--predictions">
            {currentPredictions.map((prediction) => (
              <button type="button" className="intelligence-card intelligence-card--prediction" key={prediction.id} onClick={() => setSelected({ kind: 'prediction', item: prediction })}>
                <div className="intelligence-card__top"><span><IntelligenceIcon name="prediction" size={17} /> {label(prediction.status)}</span><small>{label(prediction.metricKey)}</small></div>
                <h3>{predictionStatement(prediction)}</h3>
                <div className="intelligence-range" aria-label={`Estimated range ${formatChange(prediction.intervalLow)} to ${formatChange(prediction.intervalHigh)}`}>
                  <span>{formatChange(prediction.intervalLow)}</span><i /><strong>{formatChange(prediction.predictedChangePercent)}</strong><i /><span>{formatChange(prediction.intervalHigh)}</span>
                </div>
                <div className="intelligence-confidence-row">{namedConfidence('Prediction', prediction.predictionConfidence, 'prediction')}</div>
                <footer><span>{plural(prediction.sampleSize, 'source decision')}</span><span>Inspect estimate <IntelligenceIcon name="arrow" size={14} /></span></footer>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="intelligence-section intelligence-explorer" aria-labelledby="explorer-title">
        <SectionHeading eyebrow="Authoritative history" title="Decision explorer" description="Inspect the decision ledger itself—not the outcome-review queue." />
        <div className="intelligence-explorer__toolbar">
          <label><span>Search decisions</span><div><IntelligenceIcon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, rationale, intent, client or project…" /></div></label>
          <label><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{['draft', 'active', 'reviewed', 'archived'].map((status) => <option value={status} key={status}>{label(status)}</option>)}</select></label>
          <label><span>Category</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">All categories</option>{overview.categories.map((category) => <option value={category.objectType} key={category.objectType}>{label(category.objectType)}</option>)}</select></label>
        </div>
        {filteredDecisions.length === 0 ? (
          <EmptyIntelligence title={metrics.decisionsObserved === 0 ? 'No structured decisions recorded' : 'No decisions match these filters'}>
            {metrics.decisionsObserved === 0 ? 'The ledger is the starting point. Decisions can be captured by existing Lancee decision tools and approved workspace flows.' : 'Change or clear a filter to return to the decision ledger.'}
          </EmptyIntelligence>
        ) : (
          <div className="intelligence-table-wrap">
            <table className="intelligence-table">
              <thead><tr><th>Decision</th><th>Context</th><th>Expected outcome</th><th>Status</th><th>Date</th><th><span className="sr-only">Open</span></th></tr></thead>
              <tbody>
                {filteredDecisions.map((decision) => (
                  <tr key={decision.id}>
                    <td><button type="button" onClick={() => setSelected({ kind: 'decision', item: decision })}><strong>{decision.title}</strong><small>{decision.intent}</small></button></td>
                    <td><span>{label(decision.objectType)}</span><small>{decision.projectId ? 'Project linked' : decision.clientId ? 'Client linked' : 'Workspace decision'}</small></td>
                    <td>{decision.expectedReactions[0] ? <><span>{label(decision.expectedReactions[0].direction)}</span><small>{label(decision.expectedReactions[0].metricKey)}</small></> : <small>No expected metric recorded</small>}</td>
                    <td><span className="intelligence-status" data-status={decision.status}>{label(decision.status)}</span></td>
                    <td>{formatDate(decision.decidedAt)}</td>
                    <td><button type="button" className="intelligence-table__open" onClick={() => setSelected({ kind: 'decision', item: decision })} aria-label={`Inspect ${decision.title}`}><IntelligenceIcon name="arrow" size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {decisions.length < metrics.decisionsObserved && decisionLimit < 100 && (
          <button type="button" className="button button--secondary intelligence-explorer__more" disabled={loadingMore} onClick={() => void loadMoreDecisions()}>{loadingMore ? 'Loading…' : 'Load 25 more decisions'}</button>
        )}
        {metrics.decisionsObserved > 100 && decisions.length >= 100 && <p className="intelligence-explorer__limit">Showing the 100 most recent decisions to keep this view fast.</p>}
      </section>

      <section className="intelligence-ask" aria-labelledby="ask-lancee-title">
        <div className="intelligence-ask__mark"><IntelligenceIcon name="brain" size={24} /></div>
        <div className="intelligence-ask__copy"><span>Ask Lancee</span><h2 id="ask-lancee-title">Investigate the evidence with your workspace assistant.</h2><p>Lancee queries persisted intelligence through existing capabilities. Hermes explains what is there; it does not invent patterns, confidence, or history.</p></div>
        <div className="intelligence-ask__questions">
          {['What have you learned about my projects?', 'Which decisions worked best?', 'Where do I usually underestimate work?', 'What changed in the last 90 days?'].map((question) => <button type="button" key={question} onClick={() => askLancee(question)}>{question}<IntelligenceIcon name="arrow" size={14} /></button>)}
        </div>
        <form onSubmit={submitQuestion}><label htmlFor="intelligence-question">Ask a question about your decision history</label><div><input id="intelligence-question" value={askQuestion} onChange={(event) => setAskQuestion(event.target.value)} placeholder="Why are you warning me about this?" /><button type="submit" className="button button--primary" disabled={!askQuestion.trim()}>Ask Lancee</button></div></form>
      </section>

      <section className="intelligence-section intelligence-analytics-section" aria-label="Business analytics">
        <AnalyticsPage embedded />
      </section>

      {selected && (
        <IntelligenceDrawer
          selected={selected}
          detail={decisionDetail}
          detailLoading={detailLoading}
          detailError={detailError}
          decisions={decisions}
          predictions={predictions}
          reviews={reviews}
          canManage={canManage}
          reviewingWarning={reviewingWarning}
          onClose={() => setSelected(null)}
          onOpenDecision={openDecision}
          onFilterCategory={(objectType) => { setCategoryFilter(objectType); setSelected(null); document.querySelector('.intelligence-explorer')?.scrollIntoView({ behavior: 'smooth' }) }}
          onReviewWarning={(warning, action) => void reviewWarning(warning, action)}
        />
      )}
    </div>
  )
}

function IntelligenceDrawer({
  selected,
  detail,
  detailLoading,
  detailError,
  decisions,
  predictions,
  reviews,
  canManage,
  reviewingWarning,
  onClose,
  onOpenDecision,
  onFilterCategory,
  onReviewWarning,
}: {
  selected: SelectedItem
  detail: DecisionDetail | null
  detailLoading: boolean
  detailError: string
  decisions: Decision[]
  predictions: DecisionPrediction[]
  reviews: DecisionReview[]
  canManage: boolean
  reviewingWarning: boolean
  onClose: () => void
  onOpenDecision: (id: string) => void
  onFilterCategory: (objectType: string) => void
  onReviewWarning: (warning: DecisionWarning, action: 'acknowledged' | 'dismissed') => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const title = selected.kind === 'category'
    ? label(selected.item.objectType)
    : selected.kind === 'decision'
      ? selected.item.title
      : selected.kind === 'pattern'
        ? 'Learned pattern'
        : selected.kind === 'prediction'
          ? 'Outcome prediction'
          : 'Evidence warning'
  const contextQuestion = selected.kind === 'warning'
    ? `Why are you warning me about decision ${selected.item.decisionId}? What persisted evidence supports it?`
    : selected.kind === 'pattern'
      ? `Explain pattern ${selected.item.id} and the decisions that support it.`
      : selected.kind === 'prediction'
        ? `What evidence supports prediction ${selected.item.id}, and what are its limitations?`
        : selected.kind === 'decision'
          ? `Explain decision ${selected.item.id}, its evidence, expected outcome, and measured result.`
          : `What has Lancee learned about ${label(selected.item.objectType).toLowerCase()} decisions?`

  useEffect(() => {
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const sourceDecisionButton = (id: string, index: number) => (
    <button type="button" key={id} onClick={() => onOpenDecision(id)}>
      <span>{decisions.find((decision) => decision.id === id)?.title || `Historical decision ${index + 1}`}</span>
      <IntelligenceIcon name="arrow" size={14} />
    </button>
  )

  return (
    <div className="intelligence-drawer-backdrop" onMouseDown={onClose}>
      <aside className="intelligence-drawer" role="dialog" aria-modal="true" aria-labelledby="intelligence-drawer-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><span>{label(selected.kind)} detail</span><h2 id="intelligence-drawer-title">{title}</h2></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close intelligence detail"><IntelligenceIcon name="close" /></button>
        </header>
        <div className="intelligence-drawer__body">
          {detailError && <div className="dashboard-alert" role="alert">{detailError}</div>}

          {selected.kind === 'category' && (
            <>
              <section><span>Real workspace relationships</span><h3>{plural(selected.item.decisions, 'recorded decision')}</h3><p>This node is connected to Business because these decisions use <strong>{label(selected.item.objectType)}</strong> as their persisted object type.</p></section>
              <div className="intelligence-drawer__facts">
                <div><span>Measured outcomes</span><strong>{selected.item.measuredOutcomes}</strong></div>
                <div><span>Patterns</span><strong>{selected.item.patterns}</strong></div>
                <div><span>Predictions</span><strong>{selected.item.predictions}</strong></div>
                <div><span>Active warnings</span><strong>{selected.item.warnings}</strong></div>
              </div>
              <button type="button" className="button button--secondary button--full" onClick={() => onFilterCategory(selected.item.objectType)}>Explore these decisions</button>
            </>
          )}

          {selected.kind === 'pattern' && (
            <>
              <section><span>Persisted pattern</span><h3>{patternStatement(selected.item)}</h3><p>Observed across {plural(selected.item.sampleSize, 'comparable measured decision')} with an evidence-weighted mean change of {formatChange(selected.item.meanChangePercent)}.</p></section>
              <div className="intelligence-drawer__confidence">
                {namedConfidence('Pattern confidence', selected.item.patternConfidence, 'pattern')}
                {namedConfidence('Evidence confidence', selected.item.evidenceConfidence)}
                {namedConfidence('Causal confidence', selected.item.causalConfidence, 'causal')}
              </div>
              <dl className="intelligence-drawer__definition"><div><dt>Metric</dt><dd>{label(selected.item.metricKey)}</dd></div><div><dt>Observed direction</dt><dd>{label(selected.item.dominantDirection)}</dd></div><div><dt>Standard deviation</dt><dd>{formatChange(selected.item.standardDeviation)}</dd></div><div><dt>Detector</dt><dd>{selected.item.detectorVersion}</dd></div></dl>
              <section className="intelligence-drawer__sources"><span>Supporting decisions</span><h3>Why Lancee thinks this</h3><div>{selected.item.sourceDecisionIds.map(sourceDecisionButton)}</div></section>
              <p className="intelligence-causal-note"><IntelligenceIcon name="evidence" size={16} /> This pattern describes an association across measured outcomes. Causal confidence remains a separate dimension.</p>
            </>
          )}

          {selected.kind === 'prediction' && (
            <>
              <section><span>Bounded empirical estimate</span><h3>{predictionStatement(selected.item)}</h3><p>The 95% sampling interval is {formatChange(selected.item.intervalLow)} to {formatChange(selected.item.intervalHigh)}. This range is not a guarantee.</p></section>
              <div className="intelligence-drawer__confidence">{namedConfidence('Prediction confidence', selected.item.predictionConfidence, 'prediction')}</div>
              <dl className="intelligence-drawer__definition"><div><dt>Status</dt><dd>{label(selected.item.status)}</dd></div><div><dt>Target decision</dt><dd><button type="button" onClick={() => onOpenDecision(selected.item.decisionId)}>Open decision</button></dd></div><div><dt>Sample size</dt><dd>{selected.item.sampleSize}</dd></div><div><dt>Model</dt><dd>{selected.item.modelVersion}</dd></div>{selected.item.actualChangePercent !== null && <div><dt>Measured change</dt><dd>{formatChange(selected.item.actualChangePercent)}</dd></div>}{selected.item.absoluteError !== null && <div><dt>Absolute error</dt><dd>{formatChange(selected.item.absoluteError)}</dd></div>}</dl>
              <section className="intelligence-drawer__sources"><span>Source history</span><h3>Comparable decisions</h3><div>{selected.item.sourceDecisionIds.map(sourceDecisionButton)}</div></section>
            </>
          )}

          {selected.kind === 'warning' && (
            <>
              <section><span>{label(selected.item.severity)} priority · {label(selected.item.status)}</span><h3>{selected.item.summary}</h3><p>This warning contradicts the recorded expectation of <strong>{label(selected.item.evidence.expectedDirection)}</strong> for {label(selected.item.metricKey).toLowerCase()}.</p></section>
              <div className="intelligence-drawer__confidence">{namedConfidence('Warning confidence', selected.item.warningConfidence, 'warning')}</div>
              <dl className="intelligence-drawer__definition"><div><dt>Relevant decision</dt><dd><button type="button" onClick={() => onOpenDecision(selected.item.decisionId)}>{selected.item.decisionTitle}</button></dd></div><div><dt>Historical estimate</dt><dd>{formatChange(selected.item.evidence.predictedChangePercent)}</dd></div><div><dt>Estimate interval</dt><dd>{formatChange(selected.item.evidence.intervalLow)} to {formatChange(selected.item.evidence.intervalHigh)}</dd></div><div><dt>Policy</dt><dd>{selected.item.policyVersion}</dd></div></dl>
              <section className="intelligence-drawer__sources"><span>Supporting history</span><h3>Why Lancee is warning you</h3><div>{(selected.item.evidence.sourceDecisionIds || []).map(sourceDecisionButton)}</div></section>
              <p className="intelligence-causal-note"><IntelligenceIcon name="evidence" size={16} /> The persisted warning explicitly records <strong>causal claim: false</strong>. Historical association is not proof that this decision will produce the same result.</p>
              {selected.item.status === 'active' && canManage && <div className="intelligence-drawer__actions"><button type="button" className="button button--secondary" disabled={reviewingWarning} onClick={() => onReviewWarning(selected.item, 'dismissed')}>Dismiss</button><button type="button" className="button button--primary" disabled={reviewingWarning} onClick={() => onReviewWarning(selected.item, 'acknowledged')}>{reviewingWarning ? 'Saving…' : 'Acknowledge'}</button></div>}
            </>
          )}

          {selected.kind === 'decision' && (
            detailLoading ? <div className="intelligence-drawer__loading" role="status">Loading decision evidence…</div> : detail && (
              <>
                <section><span>{label(detail.decision.status)} · {formatDate(detail.decision.decidedAt)}</span><h3>{detail.decision.decisionText}</h3><p><strong>Intent:</strong> {detail.decision.intent}</p>{detail.decision.rationale && <p><strong>Rationale:</strong> {detail.decision.rationale}</p>}</section>
                {detail.decision.vector && <section className="intelligence-drawer__vector"><span>Decision structure</span><h3>Decision Vector</h3><div>{[['Action', detail.decision.vector.actionType], ['Object', detail.decision.vector.objectType], ['Target', detail.decision.vector.targetType], ['Intent', detail.decision.vector.intentType], ['Expected direction', detail.decision.vector.expectedDirection]].map(([name, value]) => <span key={name}><small>{name}</small><strong>{label(value)}</strong></span>)}</div><p>{detail.decision.vector.vectorVersion}</p></section>}
                <section><span>Expected outcome</span><h3>{detail.decision.expectedReactions.length ? 'What was expected' : 'No expected metric recorded'}</h3>{detail.decision.expectedReactions.map((reaction) => <div className="intelligence-drawer__expectation" key={reaction.metricKey}><div><strong>{label(reaction.metricKey)}</strong><small>Expected to {label(reaction.direction).toLowerCase()}</small></div>{namedConfidence('Expectation confidence', reaction.confidence)}</div>)}</section>
                <section><span>Measured outcome</span><h3>{detail.outcome.outcome ? label(detail.outcome.outcome.outcomeDirection) : 'Not measured yet'}</h3>{detail.outcome.outcome ? <><p>{detail.outcome.outcome.observedReason || 'No observed reason was recorded.'}</p><div className="intelligence-drawer__confidence">{namedConfidence('Evidence confidence', detail.outcome.outcome.evidenceConfidence)}{namedConfidence('Causal confidence', detail.outcome.outcome.causalConfidence, 'causal')}</div>{detail.outcome.metrics.map((metric) => <div className="intelligence-drawer__metric" key={metric.metricKey}><div><span>{label(metric.metricKey)}</span><small>{label(metric.measurementStatus)}</small></div><strong>{formatChange(metric.changePercent)}</strong><small>{metric.baselineValue ?? '—'} → {metric.observedValue ?? '—'} {metric.unit || ''}</small></div>)}</> : <p>{reviews.some((review) => review.decisionId === detail.decision.id) ? 'An outcome review is scheduled or due. No measured result is being inferred before it is recorded.' : 'A recorded decision can exist without a measured outcome. This does not make the ledger empty or invalid.'}</p>}</section>
                <section className="intelligence-drawer__sources"><span>Evidence provenance</span><h3>{plural(detail.evidence.length, 'supporting record')}</h3>{detail.evidence.length ? <div>{detail.evidence.map((evidence) => <article key={evidence.id}><div><strong>{evidence.summary}</strong><small>{label(evidence.sourceType)} · {label(evidence.relation)}</small></div>{namedConfidence('Weight', evidence.weight)}</article>)}</div> : <p>No evidence records are attached to this decision.</p>}</section>
                {detail.outcome.causalAssessment && <section className="intelligence-drawer__causal"><span>Causal boundary</span><h3>{label(detail.outcome.causalAssessment.claimLevel)}</h3><p>{detail.outcome.causalAssessment.claimLevel === 'association_only' ? 'The observed before/after change is associated with the decision; it does not establish a counterfactual.' : 'This controlled estimate depends on recorded design assumptions and is not proof of causality.'}</p><div className="intelligence-drawer__confidence">{namedConfidence('Inference confidence', detail.outcome.causalAssessment.inferenceConfidence, 'causal')}</div>{detail.outcome.causalAssessment.assumptions.length > 0 && <ul>{detail.outcome.causalAssessment.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>}</section>}
                {predictions.filter((prediction) => prediction.decisionId === detail.decision.id).map((prediction) => <button type="button" className="intelligence-drawer__related" key={prediction.id} onClick={() => askLancee(`Explain prediction ${prediction.id} and the evidence supporting it.`)}><span><small>Related prediction</small><strong>{formatChange(prediction.predictedChangePercent)} estimated for {label(prediction.metricKey).toLowerCase()}</strong></span><IntelligenceIcon name="arrow" size={15} /></button>)}
              </>
            )
          )}
        </div>
        <footer><button type="button" className="button button--secondary button--full" onClick={() => askLancee(contextQuestion)}>Ask Lancee about this</button></footer>
      </aside>
    </div>
  )
}
