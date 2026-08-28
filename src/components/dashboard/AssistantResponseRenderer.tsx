import DOMPurify from 'dompurify'
import { marked } from 'marked'
import type { AssistantResponse, AssistantResponseAction, ProposedMcpAction, WorkflowPreview } from '../../lib/api'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizedMarkdown(value: string) {
  return value
    .replace(/\s+(#{1,6}\s+)/g, '\n\n$1')
    .replace(/:\s*[-*]\s+(?=\*\*)/g, ':\n\n- ')
    .replace(/([.!?])\s+([-*]\s+(?=\*\*))/g, '$1\n\n$2')
}

function renderedMarkdown(value: string) {
  return DOMPurify.sanitize(String(marked.parse(normalizedMarkdown(value), {
    async: false,
    gfm: true,
    breaks: true,
  })))
}

function label(value: unknown) {
  const text = String(value || '').replace(/[._-]+/g, ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : 'Not specified'
}

function workflowStepSummaries(workflow: Record<string, unknown>) {
  const steps = Array.isArray(workflow.steps) ? workflow.steps.map(record) : []
  return steps.flatMap((step) => {
    const tool = String(step.tool || step.toolId || '')
    const input = record(step.input)
    if (tool === 'ai.extract_project_request') return ['Check whether the email is a project request']
    if (tool === 'clients.resolve') return [`Link it to ${String(input.query || input.name || input.email || 'the configured client')}`]
    if (tool === 'clients.find_or_create') return ['Find or create the matching client']
    if (tool === 'projects.create') {
      return [input.name === '{{event.subject}}' ? 'Create a project using the email subject' : 'Create the project from the extracted request']
    }
    if (tool === 'projects.add_note') {
      return [input.body === '{{event.body}}' ? 'Add the email body as project notes' : 'Add the extracted requirement as project notes']
    }
    if (tool === 'tasks.create_many') return ['Create the requested project tasks']
    if (tool === 'tasks.create') return ['Create a project task']
    return tool ? [label(tool)] : []
  })
}

function workflowClient(workflow: Record<string, unknown>) {
  const steps = Array.isArray(workflow.steps) ? workflow.steps.map(record) : []
  const clientStep = steps.find((step) => ['clients.resolve', 'clients.find_or_create'].includes(String(step.tool || step.toolId || '')))
  const input = record(clientStep?.input)
  return String(input.query || input.name || input.email || 'Configured client')
}

function workflowTrigger(workflow: Record<string, unknown>) {
  const trigger = record(workflow.trigger)
  return String(trigger.type || '') === 'mail.received' ? 'Incoming email' : label(trigger.type)
}

function WorkflowCard({
  response,
  actionState,
  actionMessage,
  canCreate,
  onAction,
}: {
  response: AssistantResponse
  actionState?: string
  actionMessage?: string
  canCreate: boolean
  onAction: (action: AssistantResponseAction) => void
}) {
  const data = record(response.data)
  const workflow = record(data.workflow)
  const preview = record(data.preview) as Partial<WorkflowPreview>
  const conditions = Array.isArray(record(workflow.trigger).conditions) ? record(workflow.trigger).conditions as unknown[] : []
  const sender = conditions.map(record).find((condition) => condition.field === 'sender.email')?.value
  const summaries = workflowStepSummaries(workflow)
  return (
    <section className="workspace-chat__workflow-card" aria-label="Workflow preview">
      <div className="workspace-chat__workflow-heading">
        <span>Workflow ready</span>
        <strong>{String(workflow.name || preview.workflowName || 'Untitled workflow')}</strong>
      </div>
      <p>{sender ? `When an email arrives from ${String(sender)}:` : 'When the configured email arrives:'}</p>
      {summaries.length > 0 && <ul>{summaries.map((summary, index) => <li key={`${summary}:${index}`}>{summary}</li>)}</ul>}
      <dl>
        <div><dt>Trigger</dt><dd>{workflowTrigger(workflow)}</dd></div>
        <div><dt>Client</dt><dd>{workflowClient(workflow)}</dd></div>
        <div><dt>Status</dt><dd>Ready to create</dd></div>
      </dl>
      {Array.isArray(response.actions) && actionState !== 'completed' && actionState !== 'denied' && (
        <div className="workspace-chat__response-actions">
          {response.actions.filter((action) => canCreate || action.id !== 'create_workflow').map((action) => (
            <button
              type="button"
              className={`is-${action.variant || 'secondary'}`}
              disabled={actionState === 'running'}
              onClick={() => onAction(action)}
              key={action.id}
            >{actionState === 'running' && action.id === 'create_workflow' ? 'Creating…' : action.label}</button>
          ))}
        </div>
      )}
      {actionMessage && <small className="workspace-chat__action-result">{actionMessage}</small>}
    </section>
  )
}

function ScalarData({ data }: { data: unknown }) {
  const entries = Object.entries(record(data)).filter(([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value)).slice(0, 6)
  if (!entries.length) return null
  return <dl className="workspace-chat__data">{entries.map(([key, value]) => <div key={key}><dt>{label(key)}</dt><dd>{value === null ? '—' : String(value)}</dd></div>)}</dl>
}

export default function AssistantResponseRenderer({
  response,
  proposedAction,
  actionState,
  actionMessage,
  onAction,
}: {
  response: AssistantResponse
  proposedAction?: ProposedMcpAction
  actionState?: string
  actionMessage?: string
  onAction: (action: AssistantResponseAction) => void
}) {
  if (response.type === 'workflow_preview') {
    return <WorkflowCard response={response} actionState={actionState} actionMessage={actionMessage} canCreate={Boolean(proposedAction)} onAction={onAction} />
  }
  return (
    <>
      <div
        className={`workspace-chat__markdown${response.type === 'error' ? ' is-error' : ''}`}
        role={response.type === 'error' ? 'alert' : undefined}
        dangerouslySetInnerHTML={{ __html: renderedMarkdown(response.message) }}
      />
      {response.type === 'data' && <ScalarData data={response.data} />}
      {response.type === 'confirmation' && proposedAction && (
        <section className="workspace-chat__confirmation">
          <strong>{proposedAction.title}</strong>
          <small>{proposedAction.description}</small>
          <div className="workspace-chat__response-actions">
            {(response.actions || []).map((action) => (
              <button type="button" className={`is-${action.variant || 'secondary'}`} disabled={actionState === 'running'} onClick={() => onAction(action)} key={action.id}>
                {actionState === 'running' && action.id === 'confirm_action' ? 'Working…' : action.label}
              </button>
            ))}
          </div>
          {actionMessage && <small className="workspace-chat__action-result">{actionMessage}</small>}
        </section>
      )}
    </>
  )
}
