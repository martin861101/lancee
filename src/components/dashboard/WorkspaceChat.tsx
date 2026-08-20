import { useEffect, useRef, useState, type FormEvent } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { api, type ProposedMcpAction, type RunEvent, type User } from '../../lib/api'

type ChatAttachment = {
  id: string
  name: string
  mimeType: string
  size?: number
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  proposedAction?: ProposedMcpAction
  actionState?: 'pending' | 'running' | 'completed' | 'failed' | 'denied'
  actionMessage?: string
  attachments?: ChatAttachment[]
}

export const DASHBOARD_CHANGED_EVENT = 'lancee:dashboard-changed'

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

function attachmentsFromResults(results: unknown[] = []) {
  const attachments = new Map<string, ChatAttachment>()
  for (const result of results) {
    const envelope = objectValue(result)
    const data = objectValue(envelope.data)
    const candidates = [
      data.file,
      ...(Array.isArray(data.files) ? data.files : []),
      ...(Array.isArray(data.artifacts) ? data.artifacts : []),
      ...(Array.isArray(envelope.artifacts) ? envelope.artifacts : []),
    ]
    for (const candidate of candidates) {
      const file = objectValue(candidate)
      const id = typeof file.id === 'string'
        ? file.id
        : typeof file.storageDocumentId === 'string' ? file.storageDocumentId : ''
      const name = typeof file.name === 'string' ? file.name : ''
      if (!id || !name) continue
      attachments.set(id, {
        id,
        name,
        mimeType: typeof file.mimeType === 'string'
          ? file.mimeType
          : typeof file.mime_type === 'string' ? file.mime_type : 'application/octet-stream',
        ...(typeof file.size === 'number' ? { size: file.size } : {}),
      })
    }
  }
  return [...attachments.values()]
}

function attachmentLabel(attachment: ChatAttachment) {
  const type = attachment.mimeType === 'application/pdf' ? 'PDF' : 'File'
  if (!attachment.size) return type
  return `${type} · ${Math.max(1, Math.round(attachment.size / 1024))} KB`
}

function messagesFromHistory(runs: Awaited<ReturnType<typeof api.chat.history>>): Message[] {
  return [...runs].reverse().flatMap((run) => ([
    { role: 'user' as const, content: run.objective },
    {
      role: 'assistant' as const,
      content: run.finalOutput || (run.status === 'completed'
        ? 'The agent run completed without a text response.'
        : `The agent run is ${readableLabel(run.status)}.`),
      attachments: attachmentsFromResults(run.results),
    },
  ]))
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
    .map(([key, item]) => {
      const display = item === null ? '—' : String(item)
      return `${readableLabel(key)}: ${display.length > 120 ? `${display.slice(0, 117)}…` : display}`
    })
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

export default function WorkspaceChat({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)
  const [agentThreadId, setAgentThreadId] = useState<string | undefined>()
  const messagesElement = useRef<HTMLDivElement>(null)

  const conversationStorageKey = `lancee:agent-conversation:${user.workspaceId}:${user.id}`

  const persistThreadId = (threadId: string) => {
    setAgentThreadId(threadId)
    try {
      window.localStorage.setItem(conversationStorageKey, threadId)
    } catch {
      // Conversation continuity remains server-backed for the active request.
    }
  }

  useEffect(() => {
    let active = true
    let storedThreadId = ''
    try {
      storedThreadId = window.localStorage.getItem(conversationStorageKey) || ''
    } catch {
      storedThreadId = ''
    }
    setMessages([])
    setAgentThreadId(storedThreadId || undefined)
    if (!storedThreadId) return () => { active = false }
    void api.chat.history(storedThreadId)
      .then((runs) => {
        if (active) setMessages(messagesFromHistory(runs))
      })
      .catch(() => {
        if (!active) return
        try {
          window.localStorage.removeItem(conversationStorageKey)
        } catch {
          // Ignore unavailable browser storage.
        }
        setAgentThreadId(undefined)
      })
    return () => { active = false }
  }, [conversationStorageKey])

  useEffect(() => {
    const element = messagesElement.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages, busy])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const content = message.trim()
    if (!content || busy) return
    const next = [...messages, { role: 'user' as const, content }]
    setMessages(next)
    setMessage('')
    setBusy(true)
    try {
      const result = await api.chat.agent(content, agentThreadId)
      persistThreadId(result.run.threadId)
      setMessages([
        ...next,
        {
          role: 'assistant',
          content: result.content || '',
          proposedAction: result.proposedAction || undefined,
          actionState: result.proposedAction ? 'pending' : undefined,
          attachments: attachmentsFromResults(result.run.results),
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
      if (action.agentRunId && action.approvalId) {
        const agentResult = await api.chat.decideAgent(
          action.agentRunId,
          action.approvalId,
          'approved',
        )
        persistThreadId(agentResult.run.threadId)
        window.dispatchEvent(new Event(DASHBOARD_CHANGED_EVENT))
        setMessages((current) => current.map((item, itemIndex) => itemIndex === index
          ? {
              ...item,
              content: agentResult.content,
              proposedAction: agentResult.proposedAction || undefined,
              actionState: agentResult.proposedAction
                ? 'pending'
                : agentResult.run.status === 'completed' ? 'completed' : 'failed',
              actionMessage: agentResult.proposedAction
                ? 'Safe steps completed · another approval is required.'
                : agentResult.run.status === 'completed' ? 'Created and attached.' : `Agent run ${readableLabel(agentResult.run.status)}`,
              attachments: attachmentsFromResults(agentResult.run.results),
            }
          : item))
        return
      }
      const result = await api.mcp.invoke(action.serviceId, action.toolId, action.arguments)
      const data = objectValue(result.data)
      const workflow = objectValue(data.workflow)
      const queuedRun = objectValue(data.run)
      const file = objectValue(data.file)
      const client = objectValue(data.client)
      const project = objectValue(data.project)
      const connector = objectValue(data.connector)
      const service = objectValue(data.service)
      let actionMessage = `${result.message} (${result.duration}ms)`
      let actionState: Message['actionState'] = result.ok ? 'completed' : 'failed'
      let continuedResponse: Awaited<ReturnType<typeof api.chat.complete>> | null = null
      const createdAttachments: ChatAttachment[] = []
      if (typeof workflow.id === 'string') {
        actionMessage = `${String(workflow.name || 'Workflow')} created · ${String(workflow.status || 'ready')}`
      }
      if (typeof file.id === 'string') {
        actionMessage = 'Created and attached.'
        createdAttachments.push({
          id: file.id,
          name: String(file.name || 'File'),
          mimeType: typeof file.mimeType === 'string' ? file.mimeType : 'application/octet-stream',
          ...(typeof file.size === 'number' ? { size: file.size } : {}),
        })
      }
      if (typeof client.id === 'string') actionMessage = `${String(client.name || 'Client')} saved to Clients`
      if (typeof project.id === 'string') actionMessage = `${String(project.name || 'Project')} saved · ${String(project.status || 'ready')}`
      if (typeof connector.id === 'string') actionMessage = `${String(connector.name || 'Connector')} added to Connections · requested`
      if (typeof service.id === 'string') actionMessage = `${String(service.name || service.id)} ${service.active ? 'activated' : 'deactivated'}`
      if (data.deleted === true) actionMessage = `${readableLabel(String(data.resource || 'resource'))} deleted`
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
      if (!result.ok) {
        const detail = summarizeOutput(result.data)
        actionMessage = `${result.message}${detail ? ` · ${detail}` : ''} (${result.duration}ms)`
      }
      if (result.ok && action.continueAfterSuccess) {
        const originalRequest = messages.slice(0, index).findLast((item) => item.role === 'user')?.content
        if (originalRequest) {
          actionMessage = `${actionMessage} · preparing the next approval…`
          continuedResponse = await api.chat.complete(
            originalRequest,
            messages.slice(0, index + 1).map(({ role, content }) => ({ role, content })),
            { serviceId: action.serviceId, toolId: action.toolId, data: result.data },
          )
        }
      }
      window.dispatchEvent(new Event(DASHBOARD_CHANGED_EVENT))
      setMessages((current) => {
        const updated = current.map((item, itemIndex) => itemIndex === index
          ? { ...item, actionState, actionMessage, attachments: createdAttachments.length ? createdAttachments : item.attachments }
          : item)
        return continuedResponse
          ? [...updated, {
              role: 'assistant' as const,
              content: continuedResponse.content || '',
              proposedAction: continuedResponse.proposedAction || undefined,
              actionState: continuedResponse.proposedAction ? 'pending' as const : undefined,
            }]
          : updated
      })
    } catch (error) {
      setMessages((current) => current.map((item, itemIndex) => itemIndex === index
        ? { ...item, actionState: 'failed', actionMessage: error instanceof Error ? error.message : 'I could not complete that action.' }
        : item))
    }
  }

  const denyAction = async (index: number) => {
    const action = messages[index]?.proposedAction
    if (action?.agentRunId && action.approvalId) {
      setMessages((current) => current.map((item, itemIndex) => itemIndex === index
        ? { ...item, actionState: 'running' }
        : item))
      try {
        const agentResult = await api.chat.decideAgent(
          action.agentRunId,
          action.approvalId,
          'denied',
          'Denied in the Lancee workspace assistant.',
        )
        setMessages((current) => current.map((item, itemIndex) => itemIndex === index
          ? {
              ...item,
              content: agentResult.content,
              proposedAction: undefined,
              actionState: 'denied',
              actionMessage: 'Action denied · persisted run stopped.',
            }
          : item))
      } catch (error) {
        setMessages((current) => current.map((item, itemIndex) => itemIndex === index
          ? { ...item, actionState: 'failed', actionMessage: error instanceof Error ? error.message : 'The denial could not be saved.' }
          : item))
      }
      return
    }
    setMessages((current) => current.map((item, itemIndex) => itemIndex === index
      ? { ...item, actionState: 'denied', actionMessage: 'Action not approved.' }
      : item))
  }

  return (
    <aside className={`workspace-chat${open ? ' is-open' : ''}`}>
      {open && (
        <div className="workspace-chat__panel">
          <header>
            <div><span className="micro-label">Workspace assistant</span><strong>Ask about your work</strong></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant">×</button>
          </header>
          <div className="workspace-chat__messages" ref={messagesElement}>
            {messages.length === 0 && (
              <p>Ask about any dashboard area. Lancee plans a bounded, persisted run, uses only local capabilities, and pauses for confirmation before write or external actions.</p>
            )}
            {messages.map((item, index) => (
              <div className={`workspace-chat__message workspace-chat__message--${item.role}`} key={`${item.role}:${index}`}>
                {item.role === 'assistant'
                  ? <div className="workspace-chat__markdown" dangerouslySetInnerHTML={{ __html: renderedMarkdown(item.content) }} />
                  : <div>{item.content}</div>}
                {item.attachments?.map((attachment) => (
                  <a
                    className="workspace-chat__attachment"
                    href={api.documents.downloadUrl(attachment.id)}
                    download={attachment.name}
                    key={attachment.id}
                  >
                    <span aria-hidden="true">↓</span>
                    <span><strong>{attachment.name}</strong><small>{attachmentLabel(attachment)}</small></span>
                  </a>
                ))}
                {item.proposedAction && (
                  <div className="workspace-chat__action">
                    <span>{item.proposedAction.title}</span>
                    <small>{item.proposedAction.description}</small>
                    <small>{item.proposedAction.risk === 'high' ? 'High risk · owner approval required' : `${readableLabel(item.proposedAction.risk)} risk · confirmation required`}</small>
                    <small>{summarizeOutput(item.proposedAction.arguments)}</small>
                    {item.actionState === 'pending' && (
                      <div>
                        <button type="button" onClick={() => void approveAction(index)}>
                          {item.proposedAction.toolId.includes('pdf') || item.proposedAction.toolId.includes('document') || item.proposedAction.toolId.includes('file')
                            ? 'Create & attach file'
                            : item.proposedAction.risk === 'high' ? 'Approve high-risk action' : 'Confirm'}
                        </button>
                        <button type="button" onClick={() => void denyAction(index)}>Deny</button>
                      </div>
                    )}
                    {item.actionState === 'running' && <small>Working…</small>}
                    {item.actionMessage && <small>{item.actionMessage}</small>}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="workspace-chat__message workspace-chat__message--assistant">Thinking…</div>}
          </div>
          <form onSubmit={submit}>
            <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask Lancee to inspect or change the workspace…" disabled={busy} />
            <button className="button button--primary button--small" type="submit" disabled={busy || !message.trim()}>Send</button>
          </form>
        </div>
      )}
      <button type="button" className="workspace-chat__toggle" onClick={() => setOpen((value) => !value)} aria-label="Open workspace assistant">✦ <span>Ask lancee</span></button>
    </aside>
  )
}
