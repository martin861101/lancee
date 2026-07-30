import { useEffect, useState, type FormEvent } from 'react'
import { api, type Client, type Project } from '../../lib/api'
import './dashboard-page.css'

export default function ClientsPage({
  onToast,
}: {
  onToast: (message: string) => void
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
                  <i>{client.name.slice(0, 1).toUpperCase()}</i>
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
                <i>{selectedClient.name.slice(0, 1).toUpperCase()}</i>
                <div>
                  <span>{selectedClient.status}</span>
                  <h2>{selectedClient.name}</h2>
                  <p>{selectedClient.company || 'Independent client'}</p>
                </div>
                <div className="client-detail-panel__actions">
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
                  <article key={project.id}>
                    <i style={{ background: project.accent }} />
                    <span>
                      <strong>{project.name}</strong>
                      <small>{project.due || 'No due date'}</small>
                    </span>
                    <em>{project.status}</em>
                  </article>
                ))}
                {selectedProjects.length === 0 && (
                  <p className="clients-empty">No projects for this client yet.</p>
                )}
              </div>
            </>
          ) : (
            <div className="clients-empty">Select a client to view their workspace.</div>
          )}
        </aside>
      </div>

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
