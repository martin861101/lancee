import type { ConnectedIntelligenceActivity, ConnectedIntelligenceSummary, ConnectedOpportunity } from '../../lib/api'

export type FindingFilter = 'all' | 'clients' | 'projects' | 'communication' | 'meetings'
export type FindingSeverity = 'worth_watching' | 'needs_attention' | 'important'

type ConnectedProject = ConnectedIntelligenceSummary['clients'][number]['projects'][number]

export type FindingStat = {
  key: string
  label: string
  value: string
}

export type FindingPresentation = {
  severity: FindingSeverity
  severityLabel: string
  title: string
  explanation: string
  stats: FindingStat[]
  whyItMayMatter: string
  checks: string[]
  client: ConnectedIntelligenceSummary['clients'][number] | null
  project: ConnectedProject | null
  filters: FindingFilter[]
}

export const findingFilterLabels: Record<FindingFilter, string> = {
  all: 'All',
  clients: 'Clients',
  projects: 'Projects',
  communication: 'Communication',
  meetings: 'Meetings',
}

export function finiteNumber(value: unknown) {
  return Number.isFinite(Number(value)) ? Number(value) : null
}

export function formatNumber(value: number, maximumFractionDigits = 1) {
  return value.toLocaleString('en-ZA', { maximumFractionDigits })
}

export function plural(value: number, singular: string, pluralValue = `${singular}s`) {
  return `${formatNumber(value)} ${value === 1 ? singular : pluralValue}`
}

export function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Not recorded'
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value))
}

export function formatConfidence(value: number | null | undefined) {
  return Number.isFinite(value) ? `${Math.round(Number(value) * 100)}%` : 'Not available'
}

export function humanLabel(value: string | null | undefined) {
  const text = String(value || '').replaceAll('_', ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Not recorded'
}

export function findProject(summary: ConnectedIntelligenceSummary, projectId: string | null) {
  if (!projectId) return null
  return [...summary.clients.flatMap((client) => client.projects), ...summary.unlinkedProjects]
    .find((project) => project.id === projectId) || null
}

export function findClient(summary: ConnectedIntelligenceSummary, clientId: string | null) {
  return clientId ? summary.clients.find((client) => client.id === clientId) || null : null
}

function addNumberStat(stats: FindingStat[], key: string, label: string, value: unknown) {
  const number = finiteNumber(value)
  if (number !== null) stats.push({ key, label, value: formatNumber(number) })
}

function addDurationStat(stats: FindingStat[], key: string, label: string, minutesValue: unknown) {
  const minutes = finiteNumber(minutesValue)
  if (minutes === null) return
  const hours = minutes / 60
  stats.push({
    key,
    label,
    value: hours >= 1 ? `${formatNumber(hours)} hr${hours === 1 ? '' : 's'}` : `${formatNumber(minutes)} min`,
  })
}

export function presentFinding(
  opportunity: ConnectedOpportunity,
  summary: ConnectedIntelligenceSummary,
): FindingPresentation {
  const observed = opportunity.metrics.observed || {}
  const comparison = opportunity.metrics.comparison || {}
  const project = findProject(summary, opportunity.projectId)
  const client = findClient(summary, opportunity.clientId || project?.clientId || null)

  if (opportunity.detectorKey === 'client_attention_load') {
    const stats: FindingStat[] = []
    addNumberStat(stats, 'messages', 'Messages', observed.messageCount)
    addNumberStat(stats, 'conversations', 'Conversations', observed.threadCount)
    addNumberStat(stats, 'meetings', 'Meetings', observed.meetingCount)
    addDurationStat(stats, 'meeting-time', 'Meeting time', observed.meetingMinutes)
    const hasCommunication = finiteNumber(observed.messageCount) !== null || finiteNumber(observed.threadCount) !== null
    const hasMeetings = finiteNumber(observed.meetingCount) !== null || finiteNumber(observed.meetingMinutes) !== null
    const activity = hasCommunication && hasMeetings
      ? 'communicating and meeting'
      : hasCommunication ? 'communicating' : hasMeetings ? 'meeting' : 'coordinating'
    return {
      severity: 'needs_attention',
      severityLabel: 'Needs attention',
      title: `${client?.name || 'This client'} needs more attention than usual`,
      explanation: `Lancee noticed you’ve been spending considerably more time ${activity} with this client than you normally do with others.`,
      stats,
      whyItMayMatter: 'More coordination isn’t necessarily a problem. It can sometimes happen because of changing requirements, additional support, project complexity, or a high-touch client.',
      checks: [
        'Whether the extra communication and meetings were expected',
        'Whether requirements changed',
        'Whether additional client support was required',
        'Whether the work became more complex',
      ],
      client,
      project,
      filters: ['clients', 'communication', 'meetings'],
    }
  }

  if (opportunity.detectorKey === 'project_meeting_load') {
    const stats: FindingStat[] = []
    addNumberStat(stats, 'meetings', 'Meetings', observed.meetingCount)
    addDurationStat(stats, 'meeting-time', 'Meeting time', observed.meetingMinutes)
    const differencePercent = finiteNumber(comparison.differencePercent)
    const differenceMinutes = finiteNumber(comparison.differenceMinutes)
    if (differencePercent !== null) {
      stats.push({ key: 'above-usual', label: 'Above usual', value: `${formatNumber(differencePercent)}%` })
    } else if (differenceMinutes !== null) {
      stats.push({ key: 'above-usual', label: 'Above usual', value: `${formatNumber(differenceMinutes)} min` })
    }
    return {
      severity: 'worth_watching',
      severityLabel: 'Worth watching',
      title: `${project?.name || 'This project'} has had more meeting activity than usual`,
      explanation: 'Lancee noticed this project has required considerably more meeting time than completed projects in your workspace normally do.',
      stats,
      whyItMayMatter: 'Extra meetings can be entirely expected. They can also accompany changing requirements, more stakeholder coordination, or increased project complexity.',
      checks: [
        'Whether the extra meetings were planned',
        'Whether requirements or scope changed',
        'Whether more stakeholders became involved',
        'Whether project complexity increased',
      ],
      client,
      project,
      filters: ['projects', 'meetings'],
    }
  }

  return {
    severity: 'worth_watching',
    severityLabel: 'Worth watching',
    title: opportunity.title,
    explanation: opportunity.summary,
    stats: [],
    whyItMayMatter: 'This pattern is different from the recent activity Lancee compared it with. The difference may be expected, but it could be worth checking.',
    checks: ['Whether the activity was expected', 'Whether anything changed recently'],
    client,
    project,
    filters: [],
  }
}

export type ActivityAvatarState = ConnectedIntelligenceActivity['character']

export function activityAvatar(activity: ConnectedIntelligenceActivity): ActivityAvatarState {
  if (activity.status === 'opportunity_created') return 'insight'
  if (activity.status === 'signal_found' || activity.status === 'failed') return 'investigate'
  if (activity.type === 'mail') return 'mail'
  if (activity.type === 'calendar') return 'calendar'
  if (activity.type === 'cross_source') return 'connected'
  return activity.character
}

export function activityTitle(activity: ConnectedIntelligenceActivity) {
  if (activity.status === 'opportunity_created') return 'I found something worth looking at'
  if (activity.status === 'signal_found') return 'Something caught my attention'
  if (activity.status === 'failed') return 'Couldn’t complete this check'
  if (activity.status === 'inspecting') return 'Checking workspace activity…'
  if (activity.type === 'mail') return 'Checked your recent mail'
  if (activity.type === 'calendar') return 'Checked recent meetings'
  if (activity.type === 'client') return 'Checked client activity'
  if (activity.type === 'project') return 'Checked project activity'
  if (activity.type === 'cross_source') return 'Connected the activity'
  return 'Checked workspace activity'
}

export function activityDescription(activity: ConnectedIntelligenceActivity, summary: ConnectedIntelligenceSummary) {
  const messages = finiteNumber(activity.counts.messages)
  const meetings = finiteNumber(activity.counts.meetings)
  const records = finiteNumber(activity.counts.records)
  const client = findClient(summary, activity.clientId)
  const project = findProject(summary, activity.projectId)
  if (activity.type === 'mail' && messages !== null && messages > 0) return `Reviewed ${plural(messages, 'recent message')} across your workspace.`
  if (activity.type === 'calendar' && meetings !== null && meetings > 0) return `Reviewed ${plural(meetings, 'recent meeting')} across your workspace.`
  if (activity.type === 'client') return `Reviewed recent activity${client ? ` for ${client.name}` : ' for a client in your workspace'}.`
  if (activity.type === 'project') return `Reviewed recent activity${project ? ` for ${project.name}` : ' for a project in your workspace'}.`
  if (activity.type === 'cross_source') return 'Compared communication and meeting activity across connected workspace records.'
  if (records !== null) return `Reviewed ${plural(records, 'workspace record')}.`
  return activity.summary || 'Reviewed recent connected workspace activity.'
}

export function activityResult(status: ConnectedIntelligenceActivity['status']) {
  if (status === 'all_clear') return 'Nothing unusual found'
  if (status === 'opportunity_created') return 'I found something worth looking at'
  if (status === 'signal_found') return 'Something caught my attention'
  if (status === 'failed') return 'This check wasn’t completed'
  return 'Checking workspace activity…'
}

export const activityCountLabels: Record<string, string> = {
  messages: 'messages',
  threads: 'conversations',
  peopleResolved: 'known contacts',
  clientsMatched: 'clients',
  projectsCompared: 'projects compared',
  meetings: 'meetings',
  clients: 'clients',
  projects: 'projects',
  communicationRecords: 'communication records',
  meetingRecords: 'meeting records',
  records: 'workspace records',
}
