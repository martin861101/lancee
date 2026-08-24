import type { ConnectedIntelligenceSummary } from '../../lib/api'
import LanceeAvatar, { type LanceeAvatarState } from './LanceeAvatar'
import { plural } from './connected-intelligence-presentation'

type BriefingCopy = {
  avatar: LanceeAvatarState
  eyebrow: string
  heading: string
  body: string
  explanation: string
}

function briefingCopy(summary: ConnectedIntelligenceSummary): BriefingCopy {
  if (summary.status === 'attention_needed') {
    return {
      avatar: 'insight',
      eyebrow: 'Your Lancee briefing',
      heading: 'Here’s what I’ve noticed',
      body: `I’ve been looking across your work and found ${plural(summary.findings, 'thing')} that may be worth your attention.`,
      explanation: 'These aren’t necessarily problems. They’re patterns that look different from how your workspace normally operates.',
    }
  }
  if (summary.status === 'all_clear') {
    return {
      avatar: 'all-clear',
      eyebrow: 'Your Lancee briefing',
      heading: 'Everything looks good',
      body: 'I’ve checked your recent workspace activity and nothing unusual needs your attention right now.',
      explanation: 'I’ll keep looking as new connected work is added.',
    }
  }
  return {
    avatar: 'investigate',
    eyebrow: 'Your Lancee briefing',
    heading: 'I’m still getting the picture',
    body: 'There isn’t enough recent workspace activity yet for me to identify meaningful patterns.',
    explanation: 'I’ll become more useful as connected mail, meetings, clients, and projects accumulate in your workspace.',
  }
}

export default function IntelligenceBriefing({ summary }: { summary: ConnectedIntelligenceSummary }) {
  const copy = briefingCopy(summary)
  const metrics = [
    summary.status === 'attention_needed' && summary.findings > 0 ? { value: summary.findings, label: 'worth looking at' } : null,
    summary.clientsInspected > 0 ? { value: summary.clientsInspected, label: 'clients checked' } : null,
    summary.meetingsInspected > 0 ? { value: summary.meetingsInspected, label: 'meetings reviewed' } : null,
    summary.messagesInspected > 0 ? { value: summary.messagesInspected, label: 'messages reviewed' } : null,
  ].filter((metric): metric is { value: number; label: string } => Boolean(metric))

  return (
    <section className="intelligence-briefing" data-status={summary.status} aria-labelledby="intelligence-briefing-title">
      <div className="intelligence-briefing__avatar">
        <LanceeAvatar state={copy.avatar} size="large" />
      </div>
      <div className="intelligence-briefing__copy">
        <span>{copy.eyebrow}</span>
        <h2 id="intelligence-briefing-title">{copy.heading}</h2>
        <p>{copy.body}</p>
        <p className="intelligence-briefing__explanation">{copy.explanation}</p>
      </div>
      {metrics.length > 0 && (
        <dl className="intelligence-briefing__metrics" aria-label="Inspection summary">
          {metrics.map((metric) => <div key={metric.label}><dd>{metric.value.toLocaleString('en-ZA')}</dd><dt>{metric.label}</dt></div>)}
        </dl>
      )}
    </section>
  )
}

