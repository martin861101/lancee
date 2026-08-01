import { useState, type FormEvent } from 'react'
import { api } from '../../lib/api'

type Message = { role: 'user' | 'assistant'; content: string }

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
      setMessages([...next, { role: 'assistant', content: result.content || '' }])
    } catch (error) {
      setMessages([...next, { role: 'assistant', content: error instanceof Error ? error.message : 'The workspace assistant is unavailable.' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className={`workspace-chat${open ? ' is-open' : ''}`}>
      {open && <div className="workspace-chat__panel"><header><div><span className="micro-label">Workspace assistant</span><strong>Ask about your work</strong></div><button type="button" onClick={() => setOpen(false)} aria-label="Close assistant">×</button></header><div className="workspace-chat__messages">{messages.length === 0 && <p>Ask about projects, clients, invoices, or automation activity. I can read workspace context, but actions still require approval.</p>}{messages.map((item, index) => <div className={`workspace-chat__message workspace-chat__message--${item.role}`} key={`${item.role}:${index}`}>{item.content}</div>)}{busy && <div className="workspace-chat__message workspace-chat__message--assistant">Thinking…</div>}</div><form onSubmit={submit}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask about this workspace…" disabled={busy} /><button className="button button--primary button--small" type="submit" disabled={busy || !message.trim()}>Send</button></form></div>}
      <button type="button" className="workspace-chat__toggle" onClick={() => setOpen((value) => !value)} aria-label="Open workspace assistant">✦ <span>Ask lancee</span></button>
    </aside>
  )
}
