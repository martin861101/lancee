import { useCallback, useEffect, useEffectEvent, useMemo, useState, type FormEvent } from 'react'
import {
  api,
  type Automation,
  type MailAccount,
  type MailAutomationRule,
  type MailAutomationRuleInput,
  type MailDiscovery,
  type MailFolder,
  type MailMessage,
  type MailMessageSummary,
  type Project,
} from '../../lib/api'
import './messages-page.css'

type SetupValues = {
  email: string
  displayName: string
  username: string
  password: string
  provider: string
  imapHost: string
  imapPort: number
  imapSecure: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
}

type MailRuleAction = 'custom' | 'create-project-from-email'

const projectFromEmailInstruction = JSON.stringify({
  steps: [{
    tool: 'projects.create',
    input: {
      name: '{{subject}}',
      clientName: '{{senderName}}',
      clientEmail: '{{senderEmail}}',
      scope: '{{body}}',
      status: 'In progress',
      sourceKey: 'mail:{{ruleId}}:{{messageId}}',
    },
  }],
}, null, 2)

function isProjectFromEmailInstruction(instruction: string) {
  try {
    const parsed = JSON.parse(instruction)
    return parsed?.steps?.length === 1 && parsed.steps[0]?.tool === 'projects.create'
  } catch {
    return false
  }
}

const emptySetup: SetupValues = {
  email: '',
  displayName: '',
  username: '',
  password: '',
  provider: 'custom',
  imapHost: '',
  imapPort: 993,
  imapSecure: true,
  smtpHost: '',
  smtpPort: 465,
  smtpSecure: true,
}

const emptyRule: MailAutomationRuleInput = {
  automationId: '',
  name: '',
  sender: '',
  recipient: '',
  subject: '',
  keywords: [],
  matchMode: 'all',
  instruction: 'Process the message from {{sender}} with subject “{{subject}}”. Message: {{body}}',
  enabled: true,
}

function accountSetup(account: MailAccount): SetupValues {
  return {
    email: account.email,
    displayName: account.displayName,
    username: account.username,
    password: '',
    provider: account.provider,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    imapSecure: account.imapSecure,
    smtpHost: account.smtpHost,
    smtpPort: account.smtpPort,
    smtpSecure: account.smtpSecure,
  }
}

function addresses(message: Pick<MailMessageSummary, 'from'>) {
  return message.from.map((item) => item.name || item.address).filter(Boolean).join(', ') || 'Unknown sender'
}

function fullAddresses(items: Array<{ name: string; address: string }>) {
  return items.map((item) => item.name ? `${item.name} <${item.address}>` : item.address).join(', ')
}

function messageDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const today = new Date()
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function readableBytes(size: number) {
  if (size < 1_024) return `${size} B`
  if (size < 1_048_576) return `${Math.round(size / 1_024)} KB`
  return `${(size / 1_048_576).toFixed(1)} MB`
}

export default function MessagesPage({
  automations,
  canManageConnection,
  onToast,
  focusMessage,
  onMessageFocusHandled,
  openConnectionSettings = false,
  onConnectionSettingsHandled,
}: {
  automations: Automation[]
  canManageConnection: boolean
  onToast: (message: string) => void
  focusMessage?: { folder: string; uid: number } | null
  onMessageFocusHandled?: () => void
  openConnectionSettings?: boolean
  onConnectionSettingsHandled?: () => void
}) {
  const [account, setAccount] = useState<MailAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'mail' | 'rules' | 'settings'>('mail')
  const [folders, setFolders] = useState<MailFolder[]>([])
  const [folder, setFolder] = useState('INBOX')
  const [messages, setMessages] = useState<MailMessageSummary[]>([])
  const [selected, setSelected] = useState<MailMessage | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [linkingProject, setLinkingProject] = useState(false)
  const [mailLoading, setMailLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [composeOpen, setComposeOpen] = useState(false)
  const [compose, setCompose] = useState({ to: '', cc: '', bcc: '', subject: '', body: '' })
  const [replyContext, setReplyContext] = useState<{ inReplyTo: string; references: string[] } | null>(null)
  const [sending, setSending] = useState(false)
  const [discovery, setDiscovery] = useState<MailDiscovery | null>(null)
  const [setup, setSetup] = useState<SetupValues>(emptySetup)
  const [discovering, setDiscovering] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [rules, setRules] = useState<MailAutomationRule[]>([])
  const [ruleOpen, setRuleOpen] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState('')
  const [rule, setRule] = useState<MailAutomationRuleInput>(emptyRule)
  const [ruleAction, setRuleAction] = useState<MailRuleAction>('custom')
  const [ruleKeywords, setRuleKeywords] = useState('')
  const [savingRule, setSavingRule] = useState(false)
  const nativeAutomations = useMemo(
    () => automations.filter((automation) => automation.execution === 'core'),
    [automations],
  )
  const selectedAutomation = nativeAutomations.find((automation) => automation.id === rule.automationId)
  const canCreateProjectFromEmail = selectedAutomation?.tools.includes('projects.create') || false
  const handleMessageFocusHandled = useEffectEvent(() => onMessageFocusHandled?.())
  const handleConnectionSettingsHandled = useEffectEvent(() => onConnectionSettingsHandled?.())

  useEffect(() => {
    if (!openConnectionSettings) return
    setTab('settings')
    handleConnectionSettingsHandled()
  }, [openConnectionSettings, handleConnectionSettingsHandled])

  const loadAccount = useCallback(async () => {
    const status = await api.mail.getAccount()
    setAccount(status.account)
    if (status.account) setSetup(accountSetup(status.account))
    return status.account
  }, [])

  const loadMailbox = useCallback(async (nextFolder: string, query: string) => {
    setMailLoading(true)
    setError('')
    try {
      const [folderList, messageList] = await Promise.all([
        api.mail.listFolders(),
        api.mail.listMessages(nextFolder, query),
      ])
      setFolders(folderList)
      setMessages(messageList)
      setSelected(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load messages.')
    } finally {
      setMailLoading(false)
    }
  }, [])

  const loadRules = useCallback(async () => {
    try {
      setRules(await api.mail.rules.list())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load message rules.')
    }
  }, [])

  useEffect(() => {
    let active = true
    loadAccount()
      .then((mailAccount) => {
        if (!active || !mailAccount) return
        const initialFolder = focusMessage?.folder || 'INBOX'
        setFolder(initialFolder)
        setSearch('')
        void Promise.all([
          loadMailbox(initialFolder, '').then(() => {
            if (!active || !focusMessage) return
            return api.mail.getMessage(focusMessage.folder, focusMessage.uid)
              .then((message) => {
                if (!active) return
                setSelected(message)
                setTab('mail')
                handleMessageFocusHandled()
              })
          }),
          loadRules(),
          api.projects.list().then(setProjects),
        ])
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load Messages.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [focusMessage, loadAccount, loadMailbox, loadRules])

  const discover = async (event: FormEvent) => {
    event.preventDefault()
    setDiscovering(true)
    setError('')
    try {
      const result = await api.mail.discover(setup.email)
      setDiscovery(result)
      setSetup((current) => ({
        ...current,
        email: current.email.trim().toLowerCase(),
        username: result.username,
        provider: result.provider,
        imapHost: result.imapHost,
        imapPort: result.imapPort,
        imapSecure: result.imapSecure,
        smtpHost: result.smtpHost,
        smtpPort: result.smtpPort,
        smtpSecure: result.smtpSecure,
      }))
      setAdvanced(!result.detected)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to discover mail settings.')
    } finally {
      setDiscovering(false)
    }
  }

  const connect = async (event: FormEvent) => {
    event.preventDefault()
    setConnecting(true)
    setError('')
    try {
      const status = await api.mail.saveAccount(setup)
      setAccount(status.account)
      setSetup((current) => ({ ...current, password: '' }))
      setTab('mail')
      setFolders([])
      await Promise.all([loadMailbox('INBOX', ''), loadRules()])
      onToast('Mailbox connected securely.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to connect the mailbox.')
    } finally {
      setConnecting(false)
    }
  }

  const disconnect = async () => {
    if (!window.confirm('Disconnect this mailbox? Its IMAP and SMTP credentials will be removed. Saved message rules will remain, but cannot run until you reconnect.')) return
    setConnecting(true)
    try {
      await api.mail.disconnect()
      setAccount(null)
      setFolders([])
      setMessages([])
      setSelected(null)
      setDiscovery(null)
      setSetup(emptySetup)
      onToast('Mailbox disconnected.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to disconnect the mailbox.')
    } finally {
      setConnecting(false)
    }
  }

  const chooseFolder = (path: string) => {
    setFolder(path)
    setSearch('')
    void loadMailbox(path, '')
  }

  const openMessage = async (message: MailMessageSummary) => {
    setMailLoading(true)
    setError('')
    try {
      setSelected(await api.mail.getMessage(message.folder, message.uid))
      setMessages((current) => current.map((item) => item.uid === message.uid ? { ...item, unread: false } : item))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to open the message.')
    } finally {
      setMailLoading(false)
    }
  }

  const refresh = async () => {
    setMailLoading(true)
    try {
      const result = await api.mail.sync()
      await loadMailbox(folder, search)
      onToast(result.newMessages
        ? `${result.newMessages} new message${result.newMessages === 1 ? '' : 's'}${result.triggered ? ` · ${result.triggered} automation${result.triggered === 1 ? '' : 's'} started` : ''}`
        : 'Messages are up to date.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh messages.')
    } finally {
      setMailLoading(false)
    }
  }

  const send = async (event: FormEvent) => {
    event.preventDefault()
    setSending(true)
    setError('')
    try {
      await api.mail.send({
        to: compose.to.split(',').map((value) => value.trim()).filter(Boolean),
        cc: compose.cc.split(',').map((value) => value.trim()).filter(Boolean),
        bcc: compose.bcc.split(',').map((value) => value.trim()).filter(Boolean),
        subject: compose.subject,
        body: compose.body,
        inReplyTo: replyContext?.inReplyTo,
        references: replyContext?.references,
      })
      setComposeOpen(false)
      setCompose({ to: '', cc: '', bcc: '', subject: '', body: '' })
      setReplyContext(null)
      onToast('Message sent.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to send the message.')
    } finally {
      setSending(false)
    }
  }

  const linkSelectedProject = async (projectId: string) => {
    if (!selected?.relationship || !projectId) return
    setLinkingProject(true)
    setError('')
    try {
      const relationship = await api.mail.linkProject(selected.relationship.externalMessageId, projectId)
      setSelected((current) => current ? { ...current, relationship } : current)
      onToast('Message thread linked to project.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to link this message thread.')
    } finally {
      setLinkingProject(false)
    }
  }

  const beginRule = (existing?: MailAutomationRule) => {
    if (existing) {
      setEditingRuleId(existing.id)
      setRule({
        automationId: existing.automationId,
        name: existing.name,
        sender: existing.sender,
        recipient: existing.recipient,
        subject: existing.subject,
        keywords: existing.keywords,
        matchMode: existing.matchMode,
        instruction: existing.instruction,
        enabled: existing.enabled,
      })
      setRuleAction(isProjectFromEmailInstruction(existing.instruction) ? 'create-project-from-email' : 'custom')
      setRuleKeywords(existing.keywords.join(', '))
    } else {
      setEditingRuleId('')
      setRule({ ...emptyRule, automationId: nativeAutomations[0]?.id || '' })
      setRuleAction('custom')
      setRuleKeywords('')
    }
    setRuleOpen(true)
  }

  const saveRule = async (event: FormEvent) => {
    event.preventDefault()
    setSavingRule(true)
    setError('')
    const input = {
      ...rule,
      instruction: ruleAction === 'create-project-from-email'
        ? projectFromEmailInstruction
        : rule.instruction,
      keywords: ruleKeywords.split(',').map((keyword) => keyword.trim()).filter(Boolean),
    }
    try {
      const saved = editingRuleId
        ? await api.mail.rules.update(editingRuleId, input)
        : await api.mail.rules.create(input)
      setRules((current) => editingRuleId
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...current])
      setRuleOpen(false)
      onToast(editingRuleId ? 'Message rule updated.' : 'Message rule created.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the message rule.')
    } finally {
      setSavingRule(false)
    }
  }

  const toggleRule = async (existing: MailAutomationRule) => {
    try {
      const updated = await api.mail.rules.update(existing.id, {
        automationId: existing.automationId,
        name: existing.name,
        sender: existing.sender,
        recipient: existing.recipient,
        subject: existing.subject,
        keywords: existing.keywords,
        matchMode: existing.matchMode,
        instruction: existing.instruction,
        enabled: !existing.enabled,
      })
      setRules((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update the rule.')
    }
  }

  if (loading) return <div className="messages-loading"><span className="spinner spinner--dark" /> Loading Messages…</div>

  if (!account || tab === 'settings') {
    return (
      <div className="messages-setup">
        <header className="messages-page-header">
          <div>
            <span className="micro-label">Communication</span>
            <h1>Messages</h1>
            <p>Connect a mailbox with IMAP and SMTP. Credentials are encrypted before storage.</p>
          </div>
          {account && <button className="button button--secondary" onClick={() => setTab('mail')}>Back to inbox</button>}
        </header>
        {error && <div className="dashboard-alert" role="alert">{error}</div>}
        {!canManageConnection ? (
          <div className="messages-setup-card messages-setup-card--center">
            <span className="messages-setup-icon">✉</span>
            <h2>{account ? 'Mailbox settings are owner-managed' : 'Ask the workspace owner to connect mail'}</h2>
            <p>Workspace owners manage the shared mailbox credential. Once connected, collaborators can read and send messages.</p>
          </div>
        ) : (
          <div className="messages-setup-grid">
            <section className="messages-setup-card">
              <span className="messages-step">1</span>
              <h2>{account ? 'Update mailbox' : 'Find your mail settings'}</h2>
              <p>Enter the address first. Messages will recognize common providers automatically.</p>
              <form onSubmit={discover} className="messages-form-row">
                <label>
                  Email address
                  <input type="email" value={setup.email} onChange={(event) => setSetup({ ...setup, email: event.target.value })} placeholder="you@company.com" required />
                </label>
                <button className="button button--secondary" disabled={discovering}>{discovering ? 'Checking…' : 'Detect settings'}</button>
              </form>
            </section>

            {(discovery || account) && (
              <section className="messages-setup-card">
                <span className="messages-step">2</span>
                <div className="messages-provider-result">
                  <div>
                    <h2>{discovery?.detected ? `${discovery.providerName} detected` : account ? 'Saved server settings' : 'Manual settings needed'}</h2>
                    <p>{discovery?.detected ? 'We filled in the secure server settings. Add your login to finish.' : 'Use the instructions below, then enter the IMAP and SMTP values from your provider.'}</p>
                  </div>
                  {discovery && <span className={discovery.detected ? 'status-pill status-pill--active' : 'status-pill status-pill--draft'}>{discovery.detected ? 'Detected' : 'Manual'}</span>}
                </div>
                {discovery && (
                  <ol className="messages-instructions">
                    {discovery.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
                  </ol>
                )}
                <form onSubmit={connect} className="messages-settings-form">
                  <div className="messages-field-grid">
                    <label>Display name<input value={setup.displayName} onChange={(event) => setSetup({ ...setup, displayName: event.target.value })} placeholder="Your name or team" /></label>
                    <label>Username<input value={setup.username} onChange={(event) => setSetup({ ...setup, username: event.target.value })} autoComplete="username" required /></label>
                    <label className="messages-field-full">Password or app password<input type="password" value={setup.password} onChange={(event) => setSetup({ ...setup, password: event.target.value })} autoComplete="current-password" placeholder={account ? 'Leave blank to keep the saved password' : 'Use an app password when required'} required={!account} /></label>
                  </div>
                  <button type="button" className="messages-advanced-toggle" onClick={() => setAdvanced((value) => !value)}>{advanced ? 'Hide server settings' : 'Show server settings'}</button>
                  {advanced && (
                    <div className="messages-server-grid">
                      <fieldset>
                        <legend>Incoming mail (IMAP)</legend>
                        <label>Server<input value={setup.imapHost} onChange={(event) => setSetup({ ...setup, imapHost: event.target.value })} required /></label>
                        <label>Port<input type="number" min="1" max="65535" value={setup.imapPort} onChange={(event) => setSetup({ ...setup, imapPort: Number(event.target.value) })} required /></label>
                        <label className="messages-checkbox"><input type="checkbox" checked={setup.imapSecure} onChange={(event) => setSetup({ ...setup, imapSecure: event.target.checked })} /> SSL/TLS</label>
                      </fieldset>
                      <fieldset>
                        <legend>Outgoing mail (SMTP)</legend>
                        <label>Server<input value={setup.smtpHost} onChange={(event) => setSetup({ ...setup, smtpHost: event.target.value })} required /></label>
                        <label>Port<input type="number" min="1" max="65535" value={setup.smtpPort} onChange={(event) => setSetup({ ...setup, smtpPort: Number(event.target.value) })} required /></label>
                        <label className="messages-checkbox"><input type="checkbox" checked={setup.smtpSecure} onChange={(event) => setSetup({ ...setup, smtpSecure: event.target.checked })} /> Implicit SSL/TLS</label>
                      </fieldset>
                    </div>
                  )}
                  <div className="messages-setup-actions">
                    <button className="button button--primary" disabled={connecting}>{connecting ? 'Testing both servers…' : account ? 'Test and save' : 'Test and connect'}</button>
                    {account && <button type="button" className="button button--danger" onClick={() => void disconnect()} disabled={connecting}>Disconnect</button>}
                  </div>
                </form>
              </section>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="messages-page">
      <header className="messages-page-header messages-page-header--app">
        <div>
          <span className="micro-label">{account.email}</span>
          <h1>Messages</h1>
        </div>
        <nav className="messages-tabs" aria-label="Messages sections">
          <button className={tab === 'mail' ? 'is-active' : ''} onClick={() => setTab('mail')}>Inbox</button>
          <button className={tab === 'rules' ? 'is-active' : ''} onClick={() => { setTab('rules'); void loadRules() }}>Automation rules</button>
          <button onClick={() => setTab('settings')}>Settings</button>
        </nav>
      </header>
      {error && <div className="messages-inline-error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}

      {tab === 'rules' ? (
        <main className="messages-rules">
          <div className="messages-rules-header">
            <div><h2>Message automation rules</h2><p>Trigger native Core automations from new incoming mail. n8n is never used.</p></div>
            <button className="button button--primary" onClick={() => beginRule()} disabled={!nativeAutomations.length}>New rule</button>
          </div>
          {!nativeAutomations.length && <div className="dashboard-alert">Create a native Core automation before adding a message rule.</div>}
          <div className="messages-rule-list">
            {rules.map((item) => (
              <article className="messages-rule-card" key={item.id}>
                <div className="messages-rule-card__top">
                  <div><span className={`messages-rule-dot${item.enabled ? ' is-live' : ''}`} /><h3>{item.name}</h3></div>
                  <label className="messages-switch"><input type="checkbox" checked={item.enabled} onChange={() => void toggleRule(item)} /><span /></label>
                </div>
                <p>Runs <strong>{item.automationName}</strong> when {item.matchMode === 'all' ? 'all' : 'any'} configured conditions match.</p>
                <div className="messages-rule-chips">
                  {item.sender && <span>From contains: {item.sender}</span>}
                  {item.recipient && <span>Recipient contains: {item.recipient}</span>}
                  {item.subject && <span>Subject contains: {item.subject}</span>}
                  {item.keywords.map((keyword) => <span key={keyword}>Keyword: {keyword}</span>)}
                </div>
                <div className="messages-rule-actions">
                  <button onClick={() => beginRule(item)}>Edit</button>
                  <button onClick={() => {
                    if (!window.confirm(`Delete “${item.name}”?`)) return
                    void api.mail.rules.remove(item.id).then(() => setRules((current) => current.filter((ruleItem) => ruleItem.id !== item.id))).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to delete rule.'))
                  }}>Delete</button>
                </div>
              </article>
            ))}
            {!rules.length && <div className="messages-rules-empty"><span>⚡</span><h3>No message rules yet</h3><p>Match senders, recipients, subjects, and body keywords to start a native automation.</p></div>}
          </div>
        </main>
      ) : (
        <main className="mail-shell">
          <aside className="mail-folders">
            <button className="button button--primary mail-compose-button" onClick={() => { setReplyContext(null); setComposeOpen(true) }}>＋ Compose</button>
            <div className="mail-folder-list">
              {folders.map((item) => (
                <button key={item.path} className={folder === item.path ? 'is-active' : ''} onClick={() => chooseFolder(item.path)}>
                  <span>{item.specialUse === '\\Sent' ? '↗' : item.specialUse === '\\Trash' ? '⌫' : item.path.toUpperCase() === 'INBOX' ? '▰' : '□'}</span>{item.name}
                </button>
              ))}
            </div>
            <div className="mail-account-card"><span className="mail-account-avatar">{account.email.slice(0, 1).toUpperCase()}</span><div><strong>{account.displayName || account.email}</strong><small>{account.email}</small></div></div>
          </aside>
          <section className="mail-list-pane">
            <div className="mail-toolbar">
              <form onSubmit={(event) => { event.preventDefault(); void loadMailbox(folder, search) }}><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this folder" /></form>
              <button onClick={() => void refresh()} disabled={mailLoading} title="Refresh">{mailLoading ? '…' : '↻'}</button>
            </div>
            <div className="mail-list-heading"><strong>{folders.find((item) => item.path === folder)?.name || folder}</strong><span>{messages.length} shown</span></div>
            <div className="mail-message-list">
              {messages.map((message) => (
                <button key={message.uid} className={`${message.unread ? 'is-unread' : ''}${selected?.uid === message.uid ? ' is-selected' : ''}`} onClick={() => void openMessage(message)}>
                  <span className="mail-unread-dot" />
                  <div className="mail-message-line"><strong>{addresses(message)}</strong><time>{messageDate(message.date)}</time></div>
                  <span className="mail-message-subject">{message.subject}</span>
                  <small>{message.size ? readableBytes(message.size) : ''}</small>
                </button>
              ))}
              {!mailLoading && !messages.length && <div className="mail-empty"><span>✉</span><strong>No messages here</strong><p>Try another folder or a different search.</p></div>}
            </div>
          </section>
          <section className="mail-reader">
            {selected ? (
              <article>
                <header>
                  <button className="mail-reader__back" onClick={() => setSelected(null)}>← Back to messages</button>
                  <div className="mail-reader__eyebrow">{messageDate(selected.date)} · {readableBytes(selected.size)}</div>
                  <h2>{selected.subject}</h2>
                  <div className="mail-reader__sender"><span className="mail-account-avatar">{(selected.from[0]?.name || selected.from[0]?.address || '?').slice(0, 1).toUpperCase()}</span><div><strong>{fullAddresses(selected.from)}</strong><small>To {fullAddresses(selected.to)}{selected.cc.length ? ` · Cc ${fullAddresses(selected.cc)}` : ''}</small></div></div>
                  {selected.relationship && (
                    <div className="mail-reader__relationship">
                      <span>Client: <strong>{selected.relationship.clientName || 'Unresolved'}</strong></span>
                      <label>Project
                        <select
                          value={selected.relationship.projectId || ''}
                          disabled={linkingProject}
                          onChange={(event) => void linkSelectedProject(event.target.value)}
                        >
                          <option value="">Not linked</option>
                          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                        </select>
                      </label>
                      <small>{selected.relationship.confirmed ? 'Relationship confirmed for this thread' : 'Exact contact match; project not confirmed'}</small>
                    </div>
                  )}
                  <button className="button button--secondary" onClick={() => {
                    setCompose({ to: selected.replyTo[0]?.address || selected.from[0]?.address || '', cc: '', bcc: '', subject: /^re:/i.test(selected.subject) ? selected.subject : `Re: ${selected.subject}`, body: '' })
                    setReplyContext({
                      inReplyTo: selected.messageId,
                      references: [...selected.references, selected.messageId].filter(Boolean),
                    })
                    setComposeOpen(true)
                  }}>Reply</button>
                </header>
                {selected.html ? <div className="mail-reader__body" dangerouslySetInnerHTML={{ __html: selected.html }} /> : <div className="mail-reader__body mail-reader__body--text">{selected.text}</div>}
                {!!selected.attachments.length && <div className="mail-attachments"><strong>Attachments</strong>{selected.attachments.map((attachment) => <span key={`${attachment.filename}-${attachment.size}`}>{attachment.filename} · {readableBytes(attachment.size)}</span>)}</div>}
              </article>
            ) : <div className="mail-reader-empty"><span>✉</span><h2>Select a message</h2><p>Choose an email from the list to read it here.</p></div>}
          </section>
        </main>
      )}

      {composeOpen && (
        <div className="messages-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setComposeOpen(false) }}>
          <form className="mail-compose" onSubmit={send}>
            <header><div><span className="micro-label">New message</span><h2>Compose</h2></div><button type="button" onClick={() => setComposeOpen(false)} aria-label="Close">×</button></header>
            <label>To<input type="text" value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })} placeholder="name@example.com, another@example.com" required /></label>
            <div className="mail-compose__copy"><label>Cc<input value={compose.cc} onChange={(event) => setCompose({ ...compose, cc: event.target.value })} /></label><label>Bcc<input value={compose.bcc} onChange={(event) => setCompose({ ...compose, bcc: event.target.value })} /></label></div>
            <label>Subject<input value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} required /></label>
            <label className="mail-compose__body">Message<textarea value={compose.body} onChange={(event) => setCompose({ ...compose, body: event.target.value })} placeholder="Write your message…" required /></label>
            <footer><span>Sent securely through {account.smtpHost}</span><button className="button button--primary" disabled={sending}>{sending ? 'Sending…' : 'Send message'}</button></footer>
          </form>
        </div>
      )}

      {ruleOpen && (
        <div className="messages-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRuleOpen(false) }}>
          <form className="mail-rule-form" onSubmit={saveRule}>
            <header><div><span className="micro-label">Native automation</span><h2>{editingRuleId ? 'Edit message rule' : 'New message rule'}</h2></div><button type="button" onClick={() => setRuleOpen(false)} aria-label="Close">×</button></header>
            <div className="messages-field-grid">
              <label>Rule name<input value={rule.name} onChange={(event) => setRule({ ...rule, name: event.target.value })} placeholder="New sales enquiry" required /></label>
              <label>Run automation<select value={rule.automationId} onChange={(event) => setRule({ ...rule, automationId: event.target.value })} required><option value="">Choose a native automation</option>{nativeAutomations.map((automation) => <option value={automation.id} key={automation.id}>{automation.name}{automation.status !== 'active' ? ` (${automation.status})` : ''}</option>)}</select></label>
            </div>
            <label className="mail-rule-instruction">Action
              <select
                value={ruleAction}
                onChange={(event) => {
                  const nextAction = event.target.value as MailRuleAction
                  setRuleAction(nextAction)
                  setRule({
                    ...rule,
                    instruction: nextAction === 'create-project-from-email'
                      ? projectFromEmailInstruction
                      : isProjectFromEmailInstruction(rule.instruction)
                        ? emptyRule.instruction
                        : rule.instruction,
                  })
                }}
              >
                <option value="custom">Run a custom Core instruction</option>
                <option value="create-project-from-email" disabled={!canCreateProjectFromEmail}>Create a project from this email</option>
              </select>
              {ruleAction === 'create-project-from-email' ? (
                <small>Uses the subject as the project name, the email body as the scope, and matches the sender email to an existing client or creates one.</small>
              ) : (
                <small>Choose a structured Core action when possible. Custom plans may use the available template fields.</small>
              )}
              {!canCreateProjectFromEmail && <small>Enable “Create projects” on the selected automation to use this action.</small>}
            </label>
            <div className="mail-rule-match"><span>Run when</span><select value={rule.matchMode} onChange={(event) => setRule({ ...rule, matchMode: event.target.value as 'all' | 'any' })}><option value="all">all conditions match</option><option value="any">any condition matches</option></select></div>
            <div className="messages-field-grid">
              <label>Sender contains<input value={rule.sender} onChange={(event) => setRule({ ...rule, sender: event.target.value })} placeholder="@important-client.com" /></label>
              <label>Recipient contains<input value={rule.recipient} onChange={(event) => setRule({ ...rule, recipient: event.target.value })} placeholder="sales@company.com" /></label>
              <label>Subject contains<input value={rule.subject} onChange={(event) => setRule({ ...rule, subject: event.target.value })} placeholder="New project" /></label>
              <label>Body or subject keywords<input value={ruleKeywords} onChange={(event) => setRuleKeywords(event.target.value)} placeholder="quote, urgent, website" /><small>Separate keywords with commas.</small></label>
            </div>
            {ruleAction === 'create-project-from-email' ? (
              <div className="mail-rule-instruction">
                <span>Automation instruction</span>
                <pre>{projectFromEmailInstruction}</pre>
                <small>Each matching message is processed once using its message id as the project idempotency key.</small>
              </div>
            ) : (
              <label className="mail-rule-instruction">Automation instruction<textarea value={rule.instruction} onChange={(event) => setRule({ ...rule, instruction: event.target.value })} required /><small>Available fields: {'{{sender}}'}, {'{{senderEmail}}'}, {'{{senderName}}'}, {'{{recipient}}'}, {'{{subject}}'}, {'{{body}}'}, {'{{messageId}}'}, {'{{ruleId}}'}</small></label>
            )}
            <label className="messages-checkbox"><input type="checkbox" checked={rule.enabled} onChange={(event) => setRule({ ...rule, enabled: event.target.checked })} /> Enable this rule</label>
            <footer><span>Only new incoming messages are evaluated. Each message can trigger this rule once.</span><button className="button button--primary" disabled={savingRule}>{savingRule ? 'Saving…' : 'Save rule'}</button></footer>
          </form>
        </div>
      )}
    </div>
  )
}
