import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { api, type Client, type ClientHistory, type Project } from '../../lib/api'
import './dashboard-page.css'

export default function ClientsPage({
  onToast,
  onOpenProject,
  onOpenMessage,
}: {
  onToast: (message: string) => void
  onOpenProject?: (projectId: string) => void
  onOpenMessage?: (target: { folder: string; uid: number }) => void
}) {
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [editName, setEditName] = useState('')
  const [editCompany, setEditCompany] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [history, setHistory] = useState<ClientHistory | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([api.clients.list(), api.projects.list()])
      .then(([clientItems, projectItems]) => {
        if (!active) return
        setClients(clientItems)
        setProjects(projectItems)
        setSelectedId(clientItems[0]?.id || '')
      })
      .catch(() => onToast('Unable to load clients.'))
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [onToast])

  const filteredClients = clients.filter((client) =>
    `${client.name} ${client.company} ${client.email}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )
  const selectedClient =
    clients.find((client) => client.id === selectedId) ||
    filteredClients[0] ||
    null
  const selectedProjects = selectedClient
    ? projects.filter(
        (project) =>
          project.clientId === selectedClient.id ||
          (!project.clientId &&
            project.client.toLowerCase() === selectedClient.name.toLowerCase()),
      )
    : []

  const selectedClientKey = selectedClient?.id || ''

  useEffect(() => {
    if (!selectedClientKey) {
      setHistory(null)
      return
    }
    let active = true
    setHistoryLoading(true)
    api.clients.history(selectedClientKey)
      .then((result) => {
        if (active) setHistory(result)
      })
      .catch(() => {
        if (active) setHistory(null)
      })
      .finally(() => {
        if (active) setHistoryLoading(false)
      })
    return () => {
      active = false
    }
  }, [selectedClientKey, selectedClient?.email])

  const beginEdit = (client: Client) => {
    setEditingClient(client)
    setEditName(client.name)
    setEditCompany(client.company)
    setEditEmail(client.email)
    setEditNotes(client.notes)
  }

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingClient) return
    setSaving(true)
    try {
      const updated = await api.clients.update(editingClient.id, {
        name: editName.trim(),
        company: editCompany.trim(),
        email: editEmail.trim(),
        notes: editNotes.trim(),
      })
      setClients((current) => current.map((item) => item.id === updated.id ? updated : item))
      setEditingClient(null)
      onToast(`${updated.name} was updated`)
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : 'Unable to update client.')
    } finally {
      setSaving(false)
    }
  }

  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !selectedClient) return
    if (file.size > 2 * 1024 * 1024) {
      onToast('Client logos must be 2 MB or smaller.')
      return
    }
    setLogoBusy(true)
    try {
      const updated = await api.clients.uploadLogo(selectedClient.id, file)
      setClients((current) => current.map((item) => item.id === updated.id ? updated : item))
      onToast('Client logo uploaded.')
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : 'Unable to upload the client logo.')
    } finally {
      setLogoBusy(false)
    }
  }

  const removeLogo = async () => {
    if (!selectedClient || !selectedClient.logoUrl) return
    setLogoBusy(true)
    try {
      const updated = await api.clients.removeLogo(selectedClient.id)
      setClients((current) => current.map((item) => item.id === updated.id ? updated : item))
      onToast('Client logo removed.')
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : 'Unable to remove the client logo.')
    } finally {
      setLogoBusy(false)
    }
  }

  const submitClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    try {
      const client = await api.clients.create({
        name: name.trim(),
        company: company.trim(),
        email: email.trim(),
        notes: notes.trim(),
      })
      setClients((current) => [client, ...current])
      setSelectedId(client.id)
      setName('')
      setCompany('')
      setEmail('')
      setNotes('')
      setCreating(false)
      onToast(`${client.name} was added`)
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : 'Unable to add client.')
    } finally {
      setSaving(false)
    }
  }

  const toggleClientStatus = async (client: Client) => {
    try {
      const updated = await api.clients.update(client.id, {
        status: client.status === 'active' ? 'archived' : 'active',
      })
      setClients((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
      onToast(
        `${updated.name} is now ${updated.status === 'active' ? 'active' : 'archived'}`,
      )
    } catch {
      onToast('Unable to update this client.')
    }
  }

  const deleteClient = async (client: Client) => {
    const linkedProjects = projects.filter(
      (project) =>
        project.clientId === client.id ||
        (!project.clientId &&
          project.client.toLowerCase() === client.name.toLowerCase()),
    )
    const projectMessage = linkedProjects.length
      ? ` ${linkedProjects.length} project${linkedProjects.length === 1 ? '' : 's'} will remain but will no longer be linked to this client.`
      : ''
    if (
      !window.confirm(
        `Delete “${client.name}”?${projectMessage} Client-linked Drive shortcuts will be removed.`,
      )
    ) return

    setDeletingId(client.id)
    try {
      await api.clients.remove(client.id)
      const remaining = clients.filter((item) => item.id !== client.id)
      setClients(remaining)
      setSelectedId(remaining[0]?.id || '')
      setProjects((current) =>
        current.map((project) =>
          project.clientId === client.id
            ? { ...project, clientId: null }
            : project,
        ),
      )
      onToast(`${client.name} was deleted`)
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : 'Unable to delete client.')
    } finally {
      setDeletingId('')
    }
  }

  return (
    <div className="dashboard-page clients-page">
      <header className="dashboard-page__header">
        <div>
          <span className="clients-eyebrow">Client directory</span>
          <h1 className="dashboard-page__title">Clients</h1>
          <p className="dashboard-page__description">
            Keep client contacts and every connected project within easy reach.
          </p>
        </div>
        <button className="button button--primary" onClick={() => setCreating(true)}>
          ＋ New Client
        </button>
      </header>

      <section className="dashboard-stat-grid">
        <article className="dashboard-stat">
          <span>Total clients</span>
          <strong>{clients.length}</strong>
        </article>
        <article className="dashboard-stat">
          <span>Active clients</span>
          <strong>{clients.filter((client) => client.status === 'active').length}</strong>
        </article>
        <article className="dashboard-stat">
          <span>Client projects</span>
          <strong>{projects.length}</strong>
        </article>
      </section>

      <div className="clients-layout">
        <section className="clients-directory">
          <label className="clients-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search clients"
            />
          </label>
          <div className="clients-list">
            {loading ? (
              <div className="clients-empty">Loading clients…</div>
            ) : filteredClients.length === 0 ? (
              <div className="clients-empty">No clients found.</div>
            ) : (
              filteredClients.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  className={selectedClient?.id === client.id ? 'is-active' : ''}
                  onClick={() => setSelectedId(client.id)}
                >
                  {client.logoUrl ? (
                    <img className="client-avatar-image" src={client.logoUrl} alt="" />
                  ) : (
                    <i>{client.name.slice(0, 1).toUpperCase()}</i>
                  )}
                  <span>
                    <strong>{client.name}</strong>
                    <small>{client.company || client.email || 'Client workspace'}</small>
                  </span>
                  <em>{client.status}</em>
                </button>
              ))
            )}
          </div>
        </section>

        <aside className="client-detail-panel">
          {selectedClient ? (
            <>
              <div className="client-detail-panel__hero">
                {selectedClient.logoUrl ? (
                  <img className="client-avatar-image" src={selectedClient.logoUrl} alt="" />
                ) : (
                  <i>{selectedClient.name.slice(0, 1).toUpperCase()}</i>
                )}
                <div>
                  <span>{selectedClient.status}</span>
                  <h2>{selectedClient.name}</h2>
                  <p>{selectedClient.company || 'Independent client'}</p>
                </div>
                <div className="client-detail-panel__actions">
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    onClick={() => beginEdit(selectedClient)}
                  >
                    Edit details
                  </button>
                  <label className="button button--secondary button--small client-logo-upload">
                    {logoBusy ? 'Uploading…' : 'Upload logo'}
                    <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadLogo(event)} disabled={logoBusy} />
                  </label>
                  {selectedClient.logoUrl && (
                    <button
                      type="button"
                      className="button button--secondary button--small"
                      onClick={() => void removeLogo()}
                      disabled={logoBusy}
                    >
                      Remove logo
                    </button>
                  )}
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    onClick={() => void toggleClientStatus(selectedClient)}
                  >
                    {selectedClient.status === 'active' ? 'Archive' : 'Restore'}
                  </button>
                  <button
                    type="button"
                    className="button button--danger button--small"
                    disabled={deletingId === selectedClient.id}
                    onClick={() => void deleteClient(selectedClient)}
                  >
                    {deletingId === selectedClient.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </div>
              <dl className="client-contact-grid">
                <div>
                  <dt>Email</dt>
                  <dd>{selectedClient.email || 'Not provided'}</dd>
                </div>
                <div>
                  <dt>Projects</dt>
                  <dd>{selectedProjects.length}</dd>
                </div>
                <div>
                  <dt>Added</dt>
                  <dd>{new Date(selectedClient.createdAt).toLocaleDateString()}</dd>
                </div>
                <div>
                  <dt>Notes</dt>
                  <dd>{selectedClient.notes || 'No notes yet'}</dd>
                </div>
              </dl>
              <div className="client-projects">
                <div>
                  <h3>Projects</h3>
                  <span>{selectedProjects.length} total</span>
                </div>
                {selectedProjects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className="client-project-link"
                    onClick={() => onOpenProject?.(project.id)}
                  >
                    <i style={{ background: project.accent }} />
                    <span>
                      <strong>{project.name}</strong>
                      <small>{project.due || 'No due date'}</small>
                    </span>
                    <em>{project.status}</em>
                  </button>
                ))}
                {selectedProjects.length === 0 && (
                  <p className="clients-empty">No projects for this client yet.</p>
                )}
              </div>
              <section className="client-history">
                <div className="client-history__heading">
                  <div>
                    <h3>History</h3>
                    <span>Projects, meetings, and matching mail activity</span>
                  </div>
                  {history?.domain && <em>{history.domain}</em>}
                </div>
                {historyLoading ? (
                  <p className="client-history__empty">Loading history…</p>
                ) : (
                  <>
                    <div className="client-history__group">
                      <strong>Projects</strong>
                      {(history?.projects || selectedProjects).map((project) => (
                        <button
                          key={project.id}
                          type="button"
                          onClick={() => onOpenProject?.(project.id)}
                        >
                          <span>{project.name}</span>
                          <small>{project.status} · Open Projects ↗</small>
                        </button>
                      ))}
                      {!(history?.projects || selectedProjects).length && <p className="client-history__empty">No project history yet.</p>}
                    </div>
                    <div className="client-history__group">
                      <strong>Meetings</strong>
                      {history?.meetings.map((meeting) => (
                        <div key={meeting.id}>
                          <span>{meeting.title}</span>
                          <small>{new Date(meeting.scheduledStart).toLocaleString()} · {meeting.status} · {meeting.durationMinutes} min</small>
                        </div>
                      ))}
                      {!history?.meetings.length && <p className="client-history__empty">No meeting history yet.</p>}
                    </div>
                    <div className="client-history__group">
                      <strong>Messages</strong>
                      {history?.messages.map((message) => (
                        <button
                          key={`${message.folder}:${message.uid}`}
                          type="button"
                          onClick={() => onOpenMessage?.({ folder: message.folder, uid: message.uid })}
                        >
                          <span>{message.subject || '(No subject)'}</span>
                          <small>{message.from[0]?.address || 'Message'} · Open in Messages ↗</small>
                        </button>
                      ))}
                      {!history?.messages.length && (
                        <p className="client-history__empty">
                          {!history?.domain
                            ? 'Add a client email address to match mail by domain.'
                            : history.mailConnected
                              ? 'No messages matched this client domain.'
                              : 'Connect a mailbox in Messages to see matching mail.'}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </section>
            </>
          ) : (
            <div className="clients-empty">Select a client to view their workspace.</div>
          )}
        </aside>
      </div>

      {editingClient && (
        <div className="clients-modal-backdrop" onMouseDown={() => !saving && setEditingClient(null)}>
          <form
            className="clients-modal"
            onSubmit={saveEdit}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="clients-modal__heading">
              <div>
                <span>Edit client</span>
                <h2>Update client details</h2>
              </div>
              <button type="button" onClick={() => setEditingClient(null)} disabled={saving}>×</button>
            </div>
            <label>
              Client name
              <input value={editName} onChange={(event) => setEditName(event.target.value)} autoFocus required />
            </label>
            <label>
              Company
              <input value={editCompany} onChange={(event) => setEditCompany(event.target.value)} />
            </label>
            <label>
              Email
              <input type="email" value={editEmail} onChange={(event) => setEditEmail(event.target.value)} />
            </label>
            <label>
              Notes
              <textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} rows={4} />
            </label>
            <div className="clients-modal__actions">
              <button type="button" className="button button--secondary" onClick={() => setEditingClient(null)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="button button--primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save details'}
              </button>
            </div>
          </form>
        </div>
      )}

      {creating && (
        <div className="clients-modal-backdrop" onMouseDown={() => setCreating(false)}>
          <form
            className="clients-modal"
            onSubmit={submitClient}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="clients-modal__heading">
              <div>
                <span>New client</span>
                <h2>Create a client workspace</h2>
              </div>
              <button type="button" onClick={() => setCreating(false)}>×</button>
            </div>
            <label>
              Client name
              <input value={name} onChange={(event) => setName(event.target.value)} autoFocus required />
            </label>
            <label>
              Company
              <input value={company} onChange={(event) => setCompany(event.target.value)} />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              Notes
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
            </label>
            <div className="clients-modal__actions">
              <button type="button" className="button button--secondary" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="submit" className="button button--primary" disabled={saving}>
                {saving ? 'Creating…' : 'Create client'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
