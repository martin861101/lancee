import { useState, type FormEvent } from 'react'
import { api, type ProposedMcpAction, type RunEvent } from '../../lib/api'

type Message = {
  role: 'user' | 'assistant'
  content: string
  proposedAction?: ProposedMcpAction
  actionState?: 'pending' | 'running' | 'completed' | 'failed'
  actionMessage?: string
}

const AUTOMATIONS_CHANGED_EVENT = 'lancee:automations-changed'

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readableLabel(value: string) {
  const spaced = value
    .replace(/[._-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : 'Result'
}

function summarizeOutput(value: unknown) {
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'item' : 'items'} returned`
  const record = objectValue(value)
  if (Object.keys(record).length === 0) {
    return value === null || value === undefined ? '' : String(value)
  }
  const named = record.name || record.title || record.invoiceNumber
  if (named) {
    return `${String(named)}${record.status ? ` · ${String(record.status)}` : ''}`
  }
  return Object.entries(record)
    .filter(([key, item]) =>
      !['id', 'workspaceId', 'createdAt', 'updatedAt'].includes(key) &&
      (item === null || ['string', 'number', 'boolean'].includes(typeof item)),
    )
    .slice(0, 4)
    .map(([key, item]) => `${readableLabel(key)}: ${item === null ? '—' : String(item)}`)
    .join(' · ')
}

function summarizeRunOutcome(events: RunEvent[] = []) {
  const stepEvents = events.filter((event) => event.eventType === 'step.completed' && event.output !== null)
  const outcome = stepEvents.at(-1) || events.findLast((event) =>
    ['run.completed', 'run.failed'].includes(event.eventType) && event.output !== null,
  )
  if (!outcome) return ''
  const summary = summarizeOutput(outcome.output)
  if (!summary) return ''
  return stepEvents.length > 1 ? `${stepEvents.length} steps finished · ${summary}` : summary
}

export default function WorkspaceChat() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const content = message.trim()
    if (!content || busy) return
    const next = [...messages, { role: 'user' as const, content }]
    setMessages(next)
    setMessage('')
    setBusy(true)
    try {
      const result = await api.chat.complete(content, messages)
      setMessages([
        ...next,
        {
          role: 'assistant',
          content: result.content || '',
          proposedAction: result.proposedAction || undefined,
          actionState: result.proposedAction ? 'pending' : undefined,
        },
      ])
    } catch (error) {
      setMessages([...next, { role: 'assistant', content: error instanceof Error ? error.message : 'The workspace assistant is unavailable.' }])
    } finally {
      setBusy(false)
    }
  }

  const approveAction = async (index: number) => {
    const action = messages[index]?.proposedAction
    if (!action || messages[index]?.actionState !== 'pending') return
    setMessages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, actionState: 'running' } : item))
    try {
      const result = await api.mcp.invoke(action.serviceId, action.toolId, action.arguments)
      const data = objectValue(result.data)
      const workflow = objectValue(data.workflow)
      const queuedRun = objectValue(data.run)
      let actionMessage = `${result.message} (${result.duration}ms)`
      let actionState: Message['actionState'] = result.ok ? 'completed' : 'failed'
      if (typeof workflow.id === 'string') {
        actionMessage = `${String(workflow.name || 'Workflow')} created · ${String(workflow.status || 'ready')}`
      }
      if (typeof queuedRun.id === 'string') {
        actionMessage = 'Workflow queued…'
        for (let attempt = 0; attempt < 20; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 500))
          const run = await api.runs.get(queuedRun.id)
          const outcome = summarizeRunOutcome(run.events)
          actionMessage = `${run.automationName || 'Workflow'} ${run.status}${run.errorCode ? ` · ${run.errorCode}` : ''}${outcome ? ` · ${outcome}` : ''}`
          if (run.status === 'failed') actionState = 'failed'
          if (run.status !== 'running') break
        }
      }
      window.dispatchEvent(new Event(AUTOMATIONS_CHANGED_EVENT))
      setMessages((current) => current.map((item, itemIndex) => itemIndex === index
        ? { ...item, actionState, actionMessage }
        : item))
    } catch (error) {
      setMessages((current) => current.map((item, itemIndex) => itemIndex === index
        ? { ...item, actionState: 'failed', actionMessage: error instanceof Error ? error.message : 'I could not complete that action.' }
        : item))
    }
  }

  return (
    <aside className={`workspace-chat${open ? ' is-open' : ''}`}>
      {open && <div className="workspace-chat__panel"><header><div><span className="micro-label">Workspace assistant</span><strong>Ask about your work</strong></div><button type="button" onClick={() => setOpen(false)} aria-label="Close assistant">×</button></header><div className="workspace-chat__messages">{messages.length === 0 && <p>Ask about projects, clients, invoices, or automation activity. I can answer questions and help get work done, and I will confirm before making changes.</p>}{messages.map((item, index) => <div className={`workspace-chat__message workspace-chat__message--${item.role}`} key={`${item.role}:${index}`}><div>{item.content}</div>{item.proposedAction && <div className="workspace-chat__action"><span>Ready to make this change</span>{item.actionState === 'pending' && <button type="button" onClick={() => void approveAction(index)}>Confirm</button>}{item.actionState === 'running' && <small>Working…</small>}{item.actionMessage && <small>{item.actionMessage}</small>}</div>}</div>)}{busy && <div className="workspace-chat__message workspace-chat__message--assistant">Thinking…</div>}</div><form onSubmit={submit}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask about this workspace…" disabled={busy} /><button className="button button--primary button--small" type="submit" disabled={busy || !message.trim()}>Send</button></form></div>}
      <button type="button" className="workspace-chat__toggle" onClick={() => setOpen((value) => !value)} aria-label="Open workspace assistant">✦ <span>Ask lancee</span></button>
    </aside>
  )
}
