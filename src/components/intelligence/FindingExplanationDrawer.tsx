import { useEffect, useRef } from 'react'
import type { ConnectedIntelligenceSummary, ConnectedOpportunity } from '../../lib/api'
import IntelligenceIcon from './IntelligenceIcon'
import { finiteNumber, findClient, findProject, formatConfidence, formatNumber, humanLabel, plural, presentFinding } from './connected-intelligence-presentation'

function technicalMetric(value: unknown, suffix = '') {
  const number = finiteNumber(value)
  return number === null ? 'Not recorded' : `${formatNumber(number)}${suffix}`
}

export default function FindingExplanationDrawer({ opportunity, summary, onClose }: {
  opportunity: ConnectedOpportunity
  summary: ConnectedIntelligenceSummary
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const presentation = presentFinding(opportunity, summary)
  const observed = opportunity.metrics.observed || {}
  const baseline = opportunity.metrics.baseline || {}
  const comparison = opportunity.metrics.comparison || {}
  const project = findProject(summary, opportunity.projectId)
  const client = findClient(summary, opportunity.clientId || project?.clientId || null)
  const isMeetingLoad = opportunity.detectorKey === 'project_meeting_load'
  const baselineIds = (isMeetingLoad ? baseline.projectIds : baseline.clientIds) as string[] | undefined
  const resolvedBaseline = (baselineIds || []).map((id) => ({ id, name: isMeetingLoad ? findProject(summary, id)?.name : findClient(summary, id)?.name }))
  const thresholdStatement = isMeetingLoad
    ? `${technicalMetric(observed.meetingMinutes, ' minutes')} observed exceeded the persisted 75th-percentile baseline of ${technicalMetric(baseline.percentile75MeetingMinutes, ' minutes')}.`
    : `The combined attention index was ${technicalMetric(finiteNumber(comparison.attentionIndex) === null ? null : Number(comparison.attentionIndex) * 100, 'th percentile')}, above the detector’s 75th-percentile threshold.`

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKey)
      previouslyFocused?.focus()
    }
  }, [onClose])

  return (
    <div className="finding-drawer-backdrop" onMouseDown={onClose}>
      <aside className="finding-drawer" role="dialog" aria-modal="true" aria-labelledby="finding-drawer-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="finding-drawer__header">
          <div><span>Why Lancee noticed this</span><h2 id="finding-drawer-title">{presentation.title}</h2></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close finding explanation"><IntelligenceIcon name="close" /></button>
        </header>
        <div className="finding-drawer__body">
          <section className="finding-drawer__intro"><p>{presentation.explanation}</p></section>
          {presentation.stats.length > 0 && <section><h3>What stood out</h3><dl className="finding-stats finding-stats--drawer">{presentation.stats.map((stat) => <div key={stat.key}><dd>{stat.value}</dd><dt>{stat.label}</dt></div>)}</dl></section>}
          <section><h3>Why it may matter</h3><p>{presentation.whyItMayMatter}</p></section>
          <section><h3>Things you could check</h3><ul className="finding-checks">{presentation.checks.map((check) => <li key={check}><IntelligenceIcon name="check" size={16} />{check}</li>)}</ul></section>
          <details className="technical-evidence">
            <summary><span><IntelligenceIcon name="eye" size={17} />View technical evidence</span><small>Deterministic details</small></summary>
            <div className="technical-evidence__body">
              <p className="technical-evidence__notice">This section preserves the persisted detector inputs, comparison, confidence, and exact supporting workspace-event references.</p>
              <ol className="technical-evidence__chain">
                <li><span>1</span><div><strong>Authoritative relationship</strong><p>{client ? `Client: ${client.name}` : 'No client relationship is recorded.'}{project ? ` → Project: ${project.name}` : ''}</p><code>{opportunity.subjectType}:{opportunity.subjectId}</code></div></li>
                <li><span>2</span><div><strong>Observed workspace records</strong><p>{isMeetingLoad ? `${technicalMetric(observed.meetingCount)} completed meetings contributed ${technicalMetric(observed.meetingMinutes, ' minutes')}.` : `${technicalMetric(observed.messageCount)} messages across ${technicalMetric(observed.threadCount)} threads and ${technicalMetric(observed.meetingCount)} meetings contributed ${technicalMetric(observed.meetingMinutes, ' meeting minutes')}.`}</p></div></li>
                <li><span>3</span><div><strong>Workspace comparison set</strong><p>{technicalMetric(baseline.sampleSize)} {isMeetingLoad ? 'completed projects' : 'other observed clients'} formed the persisted baseline.</p>{resolvedBaseline.length > 0 && <details><summary>Show comparison records</summary><ul>{resolvedBaseline.map((item) => <li key={item.id}>{item.name || item.id} <code>{item.id}</code></li>)}</ul></details>}</div></li>
                <li><span>4</span><div><strong>Detector condition</strong><p>{thresholdStatement}</p><code>{opportunity.metrics.detectorVersion}</code></div></li>
              </ol>
              <section className="technical-evidence__events">
                <h3>Supporting workspace events</h3><p>{plural(opportunity.evidence.length, 'persisted workspace event')}</p>
                {opportunity.evidence.length > 0 ? <ul>{opportunity.evidence.map((evidence, index) => <li key={`${evidence.id}-${index}`}><div><strong>{humanLabel(evidence.eventType || evidence.type)}</strong>{evidence.meetingId && <small>Meeting {evidence.meetingId}</small>}</div><code>{evidence.id}</code></li>)}</ul> : <p>No supporting workspace-event references were persisted with this finding.</p>}
              </section>
              <dl className="technical-evidence__footer">
                <div><dt>Confidence</dt><dd>{formatConfidence(opportunity.confidence)}</dd></div>
                <div><dt>Detector identifier</dt><dd><code>{opportunity.detectorKey}</code></dd></div>
                <div><dt>Detector version</dt><dd><code>{opportunity.metrics.detectorVersion}</code></dd></div>
              </dl>
            </div>
          </details>
        </div>
      </aside>
    </div>
  )
}
