import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type Integration } from '../../lib/api'
import './dashboard-page.css'

type CloudLink = {
  id: string
  provider: string
  label: string
  folderUrl: string
  notes: string
  createdAt: string
  updatedAt: string
}

type DriveFile = {
  id: string
  name: string
  mimeType: string
  webViewLink: string
}

type StorageProvider = 'drive' | 'dropbox' | 'onedrive' | 'box' | 'other'

const providerLabels: Record<StorageProvider, string> = {
  drive: 'Google Drive',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',
  box: 'Box',
  other: 'Other storage',
}

function providerFromIntegration(integration: Integration): StorageProvider | null {
  if (integration.id === 'drive') return 'drive'
  if (integration.id === 'dropbox') return 'dropbox'
  return null
}

export default function FilesPage({
  onOpenConnections,
  onToast,
}: {
  onOpenConnections: () => void
  onToast: (message: string) => void
}) {
  const [links, setLinks] = useState<CloudLink[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([])
  const [driveLoading, setDriveLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [provider, setProvider] = useState<StorageProvider>('drive')
  const [label, setLabel] = useState('')
  const [folderUrl, setFolderUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setError('')
    const [linkList, integrationList] = await Promise.all([
      api.cloudLinks.list(),
      api.integrations.list(),
    ])
    setLinks(linkList)
    setIntegrations(integrationList)
  }, [])

  useEffect(() => {
    let isMounted = true
    load()
      .catch(() => {
        if (isMounted) setError('Unable to load cloud storage settings.')
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })
    return () => {
      isMounted = false
    }
  }, [load])

  const storageIntegrations = useMemo(
    () => integrations.filter((item) => item.category === 'Storage'),
    [integrations],
  )

  const filteredLinks = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return links
    return links.filter((link) =>
      `${link.label} ${link.folderUrl} ${providerLabels[link.provider as StorageProvider] || link.provider} ${link.notes}`
        .toLowerCase()
        .includes(needle),
    )
  }, [links, query])

  const linksByProvider = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const link of links) {
      counts[link.provider] = (counts[link.provider] || 0) + 1
    }
    return counts
  }, [links])

  const handleRefresh = async () => {
    setNotice('')
    try {
      await load()
      onToast('Storage refreshed')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to refresh cloud storage settings.')
    }
  }

  const handleAddLink = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!label.trim() || !folderUrl.trim()) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const created = await api.cloudLinks.create({
        provider,
        label: label.trim(),
        folderUrl: folderUrl.trim(),
        notes: notes.trim() || undefined,
      })
      setLinks((current) => [created, ...current])
      setLabel('')
      setFolderUrl('')
      setNotes('')
      setFormOpen(false)
      setNotice('Cloud folder linked to your workspace.')
      onToast('Folder link saved')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save folder link.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemoveLink = async (link: CloudLink) => {
    setError('')
    try {
      await api.cloudLinks.remove(link.id)
      setLinks((current) => current.filter((item) => item.id !== link.id))
      onToast('Folder link removed')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to remove folder link.')
    }
  }

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      onToast('Folder URL copied')
    } catch {
      onToast('Copy the URL from the Open link button')
    }
  }

  if (loading) {
    return (
      <div className="content-container dashboard-page">
        <div className="skeleton-line" style={{ width: '220px', height: '28px', marginBottom: '24px' }} />
        <div className="dashboard-card-grid">
          {[1, 2].map((item) => (
            <div key={item} className="card-skeleton" style={{ height: '120px' }} />
          ))}
        </div>
        <div className="skeleton-line" style={{ height: '200px' }} />
      </div>
    )
  }

  return (
    <div className="content-container animate-fade-in dashboard-page">
      <header className="dashboard-page__header">
        <div>
          <h2 className="dashboard-page__title">Files & Cloud Storage</h2>
          <p className="dashboard-page__description">
            Connect Google Drive, or pin a secure link from any storage provider, so your team can open client deliverables from one place.
          </p>
        </div>
        <div className="dashboard-page__actions">
          <button type="button" className="button button--ghost" onClick={() => void handleRefresh()}>
            Refresh
          </button>
          <button type="button" className="button button--secondary" onClick={onOpenConnections}>
            All connections
          </button>
          <button type="button" className="button button--primary" onClick={() => setFormOpen((open) => !open)}>
            {formOpen ? 'Close form' : 'Link folder'}
          </button>
        </div>
      </header>

      {error && <div className="dashboard-alert">{error}</div>}
      {notice && <div className="dashboard-alert dashboard-alert--success">{notice}</div>}

      <div className="dashboard-stat-grid">
        <div className="dashboard-stat">
          <span>Linked folders</span>
          <strong>{links.length}</strong>
        </div>
        <div className="dashboard-stat">
          <span>Storage apps connected</span>
          <strong>{storageIntegrations.filter((item) => item.connected).length}</strong>
        </div>
        <div className="dashboard-stat">
          <span>Providers in use</span>
          <strong>{Object.keys(linksByProvider).length}</strong>
        </div>
      </div>

      <section className="dashboard-card-grid" aria-label="Cloud storage providers">
        {storageIntegrations.map((integration) => {
          const mapped = providerFromIntegration(integration)
          const linkedCount = mapped ? linksByProvider[mapped] || 0 : 0
          const isDrive = integration.id === 'drive'
          return (
            <article key={integration.id} className="dashboard-provider-card">
              <div className="dashboard-provider-card__head">
                <div>
                  <h4>{integration.name}</h4>
                  <p>{integration.description}</p>
                </div>
                <span
                  className={integration.connected ? 'badge badge--success' : 'badge'}
                  style={{ fontSize: '12px', whiteSpace: 'nowrap' }}
                >
                  {integration.connected ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
                {linkedCount} linked folder{linkedCount === 1 ? '' : 's'}
              </p>
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={onOpenConnections}
              >
                Manage in connections
              </button>
              {isDrive && (
                <>
                  <button
                    type="button"
                    className="button button--primary button--small"
                    onClick={async () => {
                      if (!integration.connected) {
                        try {
                          const url = await api.googleDrive.getAuthUrl()
                          window.location.href = url
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Unable to connect Google Drive')
                        }
                        return
                      }
                      setError('')
                      setDriveLoading(true)
                      try {
                        const files = await api.googleDrive.list()
                        setDriveFiles(files)
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'Unable to load Drive files')
                      } finally {
                        setDriveLoading(false)
                      }
                    }}
                  >
                    {driveLoading ? 'Loading…' : integration.connected ? 'View Drive files' : 'Connect Google Drive'}
                  </button>
                  {integration.connected && (
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      onClick={async () => {
                        try {
                          await api.googleDrive.disconnect()
                          setDriveFiles([])
                          await load()
                          onToast('Google Drive disconnected')
                        } catch (caught) {
                          setError(caught instanceof Error ? caught.message : 'Unable to disconnect Google Drive')
                        }
                      }}
                    >
                      Disconnect
                    </button>
                  )}
                </>
              )}
            </article>
          )
        })}
      {/* Drive file list */}
      {driveFiles.length > 0 && (
        <section className="dashboard-card-grid" aria-label="Google Drive files">
          {driveFiles.map((file) => (
            <article key={file.id} className="dashboard-provider-card">
              <div className="dashboard-provider-card__head">
                <div>
                  <h4>{file.name}</h4>
                  <p>{file.mimeType}</p>
                </div>
              </div>
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => window.open(file.webViewLink, '_blank')}
              >
                Open
              </button>
            </article>
          ))}
        </section>
      )}
      </section>

      {formOpen && (
        <form className="dashboard-link-form" onSubmit={handleAddLink}>
          <h3>Link a cloud folder</h3>
          <div className="dashboard-link-form__grid">
            <label>
              Provider
              <select value={provider} onChange={(event) => setProvider(event.target.value as StorageProvider)}>
                {(Object.keys(providerLabels) as StorageProvider[]).map((key) => (
                  <option key={key} value={key}>
                    {providerLabels[key]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Folder label
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Client handoff · Ember Gin"
                required
                maxLength={120}
              />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              Folder URL
              <input
                type="url"
                value={folderUrl}
                onChange={(event) => setFolderUrl(event.target.value)}
                placeholder="https://drive.google.com/drive/folders/..."
                required
              />
            </label>
            <label style={{ gridColumn: '1 / -1' }}>
              Notes (optional)
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Final artwork, source files, or delivery package for the team."
                maxLength={500}
              />
            </label>
          </div>
          <div className="dashboard-link-form__footer">
            <button type="submit" className="button button--primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save folder link'}
            </button>
            <button type="button" className="button button--ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="dashboard-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search linked folders…"
          aria-label="Search linked folders"
        />
      </div>

      <div className="dashboard-panel">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Folder</th>
              <th>Provider</th>
              <th>Notes</th>
              <th>Added</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLinks.map((link) => (
              <tr key={link.id}>
                <td>
                  <strong style={{ display: 'block', color: 'var(--ink)' }}>{link.label}</strong>
                  <small style={{ color: 'var(--muted)', wordBreak: 'break-all' }}>{link.folderUrl}</small>
                </td>
                <td>{providerLabels[link.provider as StorageProvider] || link.provider}</td>
                <td style={{ color: 'var(--muted)', maxWidth: '240px' }}>{link.notes || '—'}</td>
                <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {new Date(link.createdAt).toLocaleDateString()}
                </td>
                <td>
                  <div className="dashboard-row-actions">
                    <a
                      className="button button--secondary button--small"
                      href={link.folderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open
                    </a>
                    <button type="button" className="button button--ghost button--small" onClick={() => void handleCopyUrl(link.folderUrl)}>
                      Copy URL
                    </button>
                    <button type="button" className="button button--ghost button--small" onClick={() => void handleRemoveLink(link)}>
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredLinks.length === 0 && (
              <tr>
                <td colSpan={5} className="dashboard-empty">
                  {links.length === 0
                    ? 'No cloud folders linked yet. Connect a storage app above, then add your first folder URL.'
                    : 'No folders match your search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
