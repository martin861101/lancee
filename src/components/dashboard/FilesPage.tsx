import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  api,
  type Client,
  type GoogleDriveFile,
  type GoogleDriveResourceLink,
  type Integration,
  type Project,
  type WorkspaceDocument,
} from '../../lib/api'
import DriveFileWorkspace from './DriveFileWorkspace'
import PdfStudio from './PdfStudio'
import { driveWorkspaceMode, isDriveFolder } from './driveFileUtils'
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

type StorageProvider = 'drive' | 'dropbox' | 'onedrive' | 'box' | 'other'

const providerLabels: Record<StorageProvider, string> = {
  drive: 'Google Drive',
  dropbox: 'Dropbox',
  onedrive: 'OneDrive',
  box: 'Box',
  other: 'Other storage',
}

type GooglePickerApi = {
  Action: { PICKED: string; CANCEL: string }
  Feature: { MULTISELECT_ENABLED: string }
  ViewId: { DOCS: string }
  DocsView: new (viewId?: string) => {
    setIncludeFolders(value: boolean): unknown
    setSelectFolderEnabled(value: boolean): unknown
  }
  PickerBuilder: new () => {
    addView(view: unknown): GooglePickerApi['PickerBuilder']['prototype']
    enableFeature(feature: string): GooglePickerApi['PickerBuilder']['prototype']
    setOAuthToken(token: string): GooglePickerApi['PickerBuilder']['prototype']
    setDeveloperKey(key: string): GooglePickerApi['PickerBuilder']['prototype']
    setAppId(appId: string): GooglePickerApi['PickerBuilder']['prototype']
    setOrigin(origin: string): GooglePickerApi['PickerBuilder']['prototype']
    setCallback(callback: (data: { action?: string }) => void): GooglePickerApi['PickerBuilder']['prototype']
    build(): { setVisible(value: boolean): void }
  }
}

declare global {
  interface Window {
    gapi?: {
      load(
        library: string,
        options: { callback: () => void; onerror: () => void },
      ): void
    }
    google?: { picker?: GooglePickerApi }
  }
}

let googlePickerLibraryPromise: Promise<GooglePickerApi> | null = null

function loadGooglePickerLibrary() {
  if (window.google?.picker) return Promise.resolve(window.google.picker)
  if (googlePickerLibraryPromise) return googlePickerLibraryPromise
  googlePickerLibraryPromise = new Promise<GooglePickerApi>((resolve, reject) => {
    const loadPicker = () => {
      if (!window.gapi) {
        reject(new Error('Google Picker could not be loaded.'))
        return
      }
      window.gapi.load('picker', {
        callback: () => {
          if (window.google?.picker) resolve(window.google.picker)
          else reject(new Error('Google Picker is unavailable.'))
        },
        onerror: () => reject(new Error('Google Picker could not be loaded.')),
      })
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-lancee-google-picker]',
    )
    if (existing) {
      existing.addEventListener('load', loadPicker, { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('Google Picker script failed to load.')),
        { once: true },
      )
      if (window.gapi) loadPicker()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.async = true
    script.dataset.lanceeGooglePicker = 'true'
    script.addEventListener('load', loadPicker, { once: true })
    script.addEventListener(
      'error',
      () => reject(new Error('Google Picker script failed to load.')),
      { once: true },
    )
    document.head.append(script)
  }).catch((error) => {
    googlePickerLibraryPromise = null
    throw error
  })
  return googlePickerLibraryPromise
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
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([])
  const [driveChildren, setDriveChildren] = useState<Record<string, GoogleDriveFile[]>>({})
  const [expandedDriveFolders, setExpandedDriveFolders] = useState<Set<string>>(new Set())
  const [loadingDriveFolders, setLoadingDriveFolders] = useState<Set<string>>(new Set())
  const [selectedDriveFile, setSelectedDriveFile] =
    useState<GoogleDriveFile | null>(null)
  const [selectedDriveResource, setSelectedDriveResource] =
    useState<GoogleDriveFile | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [resourceLinks, setResourceLinks] = useState<GoogleDriveResourceLink[]>([])
  const [linkClientId, setLinkClientId] = useState('')
  const [linkProjectId, setLinkProjectId] = useState('')
  const [linkingResource, setLinkingResource] = useState(false)
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([])
  const [selectedLocalDocument, setSelectedLocalDocument] =
    useState<WorkspaceDocument | null>(null)
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [documentDestination, setDocumentDestination] =
    useState<'local' | 'drive' | 'both'>('local')
  const [uploadingDocument, setUploadingDocument] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [driveListLoaded, setDriveListLoaded] = useState(false)
  const [driveLoading, setDriveLoading] = useState(false)
  const [removingDocumentId, setRemovingDocumentId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [provider, setProvider] = useState<StorageProvider>('drive')
  const [label, setLabel] = useState('')
  const [folderUrl, setFolderUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    setError('')
    const [linkList, integrationList, clientList, projectList, documentList, driveLinks] = await Promise.all([
      api.cloudLinks.list(),
      api.integrations.list(),
      api.clients.list(),
      api.projects.list(),
      api.documents.list(),
      api.googleDrive.resourceLinks.list(),
    ])
    setLinks(linkList)
    setIntegrations(integrationList)
    setClients(clientList)
    setProjects(projectList)
    setDocuments(documentList)
    setResourceLinks(driveLinks)
    const firstClient = clientList.find((client) => client.status === 'active')
    setLinkClientId((current) => current || firstClient?.id || '')
  }, [])

  const fetchDriveFiles = useCallback(async () => {
    setError('')
    setDriveLoading(true)
    try {
      setDriveFiles(await api.googleDrive.list())
      setDriveChildren({})
      setExpandedDriveFolders(new Set())
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Drive files')
      setDriveFiles([])
      return false
    } finally {
      setDriveListLoaded(true)
      setDriveLoading(false)
    }
  }, [])

  const refreshDriveFiles = useCallback(
    async () => {
      await fetchDriveFiles()
    },
    [fetchDriveFiles],
  )

  const toggleDriveFolder = async (folder: GoogleDriveFile) => {
    if (driveLoading || !isDriveFolder(folder)) return
    if (expandedDriveFolders.has(folder.id)) {
      setExpandedDriveFolders((current) => {
        const next = new Set(current)
        next.delete(folder.id)
        return next
      })
      return
    }
    if (!driveChildren[folder.id]) {
      setLoadingDriveFolders((current) => new Set(current).add(folder.id))
      try {
        const children = await api.googleDrive.list(folder.id)
        setDriveChildren((current) => ({ ...current, [folder.id]: children }))
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Unable to open this Drive folder.')
        return
      } finally {
        setLoadingDriveFolders((current) => {
          const next = new Set(current)
          next.delete(folder.id)
          return next
        })
      }
    }
    setExpandedDriveFolders((current) => new Set(current).add(folder.id))
  }

  const openDrivePicker = useCallback(async (connected = false) => {
    setError('')
    try {
      if (!connected) {
        const url = await api.googleDrive.getAuthUrl('files')
        window.location.assign(url)
        return
      }
      const [config, picker] = await Promise.all([
        api.googleDrive.getPickerConfig(),
        loadGooglePickerLibrary(),
      ])
      const docsView = new picker.DocsView(picker.ViewId.DOCS)
      docsView.setIncludeFolders(true)
      docsView.setSelectFolderEnabled(true)
      await new Promise<void>((resolve) => {
        const instance = new picker.PickerBuilder()
          .addView(docsView)
          .enableFeature(picker.Feature.MULTISELECT_ENABLED)
          .setOAuthToken(config.accessToken)
          .setDeveloperKey(config.developerKey)
          .setAppId(config.appId)
          .setOrigin(window.location.origin)
          .setCallback((data) => {
            if (
              data.action === picker.Action.PICKED ||
              data.action === picker.Action.CANCEL
            ) {
              resolve()
            }
          })
          .build()
        instance.setVisible(true)
      })
      await fetchDriveFiles()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to open Google Drive')
    }
  }, [fetchDriveFiles])

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

  const driveConnected = integrations.some(
    (integration) => integration.id === 'drive' && integration.connected,
  )

  useEffect(() => {
    if (loading || !driveConnected || driveListLoaded || driveLoading) return
    void fetchDriveFiles()
  }, [driveConnected, driveListLoaded, driveLoading, fetchDriveFiles, loading])

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

  const handleLinkDriveResource = async () => {
    if (!selectedDriveResource || (!linkClientId && !linkProjectId)) return
    setLinkingResource(true)
    try {
      const link = await api.googleDrive.resourceLinks.add({
        driveFileId: selectedDriveResource.id,
        name: selectedDriveResource.name,
        mimeType: selectedDriveResource.mimeType,
        webViewLink: selectedDriveResource.webViewLink,
        resourceKind: isDriveFolder(selectedDriveResource) ? 'folder' : 'file',
        clientId: linkClientId || null,
        projectId: linkProjectId || null,
      })
      setResourceLinks((current) => [
        link,
        ...current.filter((item) => item.id !== link.id),
      ])
      onToast(`${selectedDriveResource.name} linked`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to link this Drive item.')
    } finally {
      setLinkingResource(false)
    }
  }

  const handleRemoveResourceLink = async (link: GoogleDriveResourceLink) => {
    try {
      await api.googleDrive.resourceLinks.remove(link.id)
      setResourceLinks((current) => current.filter((item) => item.id !== link.id))
      onToast('Drive link removed')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to remove this Drive link.')
    }
  }

  const handleDocumentUpload = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!documentFile) return
    if (documentFile.size <= 0 || documentFile.size > 10 * 1024 * 1024) {
      setError('Documents must be non-empty and no larger than 10 MB.')
      return
    }
    setUploadingDocument(true)
    setError('')
    try {
      const result = await api.documents.upload(
        documentFile,
        documentDestination,
      )
      if (result.document) {
        setDocuments((current) => [
          result.document as WorkspaceDocument,
          ...current.filter((item) => item.id !== result.document?.id),
        ])
      }
      if (result.driveFile) await refreshDriveFiles()
      setDocumentFile(null)
      setUploadOpen(false)
      onToast(
        documentDestination === 'both'
          ? 'Document saved in lancee and synced to Drive'
          : documentDestination === 'drive'
            ? 'Document uploaded to Google Drive'
            : 'Document saved in lancee',
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to upload this document.')
    } finally {
      setUploadingDocument(false)
    }
  }

  const handleSyncDocument = async (document: WorkspaceDocument) => {
    try {
      const result = await api.documents.syncToDrive(document.id)
      if (result.document) {
        setDocuments((current) =>
          current.map((item) =>
            item.id === result.document?.id
              ? (result.document as WorkspaceDocument)
              : item,
          ),
        )
      }
      await refreshDriveFiles()
      onToast(`${document.name} synced to Google Drive`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sync this document.')
    }
  }

  const handleRemoveDocument = async (document: WorkspaceDocument) => {
    const driveCopyMessage = document.driveWebViewLink
      ? ' Its Google Drive copy will remain.'
      : ''
    if (
      !window.confirm(
        `Remove “${document.name}” from lancee? This cannot be undone.${driveCopyMessage}`,
      )
    ) {
      return
    }
    setRemovingDocumentId(document.id)
    setError('')
    try {
      await api.documents.remove(document.id)
      setDocuments((current) => current.filter((item) => item.id !== document.id))
      setSelectedLocalDocument((current) =>
        current?.id === document.id ? null : current,
      )
      onToast('Document removed from lancee')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to remove this document.')
    } finally {
      setRemovingDocumentId(null)
    }
  }

  const renderDriveRows = (
    items: GoogleDriveFile[],
    depth = 0,
  ): React.ReactNode =>
    items.map((file) => {
      const folder = isDriveFolder(file)
      const expanded = expandedDriveFolders.has(file.id)
      const loadingFolder = loadingDriveFolders.has(file.id)
      const linkedCount = resourceLinks.filter(
        (link) => link.driveFileId === file.id,
      ).length
      return (
        <div key={`${depth}:${file.id}`} className="drive-tree__branch">
          <div
            className={`drive-tree__row${selectedDriveResource?.id === file.id ? ' is-selected' : ''}`}
            style={{ paddingLeft: `${12 + depth * 22}px` }}
          >
            <button
              type="button"
              className="drive-tree__toggle"
              onClick={() => {
                if (folder) void toggleDriveFolder(file)
              }}
              aria-label={folder ? `${expanded ? 'Collapse' : 'Expand'} ${file.name}` : undefined}
              disabled={!folder || loadingFolder}
            >
              {folder ? (loadingFolder ? '…' : expanded ? '▾' : '▸') : '·'}
            </button>
            <button
              type="button"
              className="drive-tree__name"
              onClick={() => {
                setSelectedDriveResource(file)
                if (folder) void toggleDriveFolder(file)
                else if (driveWorkspaceMode(file) !== 'unsupported') {
                  setSelectedDriveFile(file)
                }
              }}
            >
              <span aria-hidden="true">{folder ? '▰' : '▤'}</span>
              <span>
                <strong>{file.name}</strong>
                <small>
                  {folder ? 'Folder' : file.mimeType}
                  {file.modifiedTime
                    ? ` · ${new Date(file.modifiedTime).toLocaleDateString()}`
                    : ''}
                </small>
              </span>
            </button>
            {linkedCount > 0 && (
              <span className="drive-tree__linked">
                Linked {linkedCount}
              </span>
            )}
            <details className="file-item-menu">
              <summary aria-label={`Actions for ${file.name}`}>⋮</summary>
              <div>
                <button type="button" onClick={() => setSelectedDriveResource(file)}>Link to client or project</button>
                {!folder && driveWorkspaceMode(file) !== 'unsupported' && (
                  <button type="button" onClick={() => setSelectedDriveFile(file)}>
                    {file.canEdit && !['pdf', 'image'].includes(driveWorkspaceMode(file)) ? 'Edit' : 'View'}
                  </button>
                )}
                {file.webViewLink && <a href={file.webViewLink} target="_blank" rel="noreferrer">Open in Drive ↗</a>}
              </div>
            </details>
          </div>
          {folder && expanded && (
            <div className="drive-tree__children">
              {(driveChildren[file.id] || []).length > 0 ? (
                renderDriveRows(driveChildren[file.id], depth + 1)
              ) : (
                <div
                  className="drive-tree__empty"
                  style={{ paddingLeft: `${42 + depth * 22}px` }}
                >
                  This folder is empty or has no files shared with lancee.
                </div>
              )}
            </div>
          )}
        </div>
      )
    })

  if (loading) {
    return (
      <div className="content-container dashboard-page files-page">
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
    <div className="content-container animate-fade-in dashboard-page files-page">
      <header className="dashboard-page__header">
        <div>
          <h2 className="dashboard-page__title">File <em>explorer</em></h2>
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
          <button type="button" className="button button--secondary" onClick={() => setUploadOpen((open) => !open)}>
            {uploadOpen ? 'Close upload' : 'Upload document'}
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
                        await openDrivePicker(integration.connected)
                        return
                      }
                      await refreshDriveFiles()
                    }}
                  >
                    {driveLoading ? 'Loading…' : integration.connected ? 'Refresh Drive files' : 'Connect & choose files'}
                  </button>
                  {integration.connected && (
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      onClick={async () => {
                        try {
                          await api.googleDrive.disconnect()
                          setDriveFiles([])
                          setSelectedDriveFile(null)
                          setSelectedDriveResource(null)
                          setDriveChildren({})
                          setExpandedDriveFolders(new Set())
                          setDriveListLoaded(false)
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
      </section>

      {uploadOpen && (
        <form className="document-upload" onSubmit={handleDocumentUpload}>
          <div>
            <h3>Upload a document</h3>
            <p>PDF, DOC/DOCX, Markdown, text, and images up to 10 MB.</p>
          </div>
          <label className="document-upload__picker">
            <span>{documentFile?.name || 'Choose a document'}</span>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.md,.markdown,.txt,image/*"
              onChange={(event) => setDocumentFile(event.target.files?.[0] || null)}
              required
            />
          </label>
          <label>
            Keep it in
            <select
              value={documentDestination}
              onChange={(event) =>
                setDocumentDestination(
                  event.target.value as 'local' | 'drive' | 'both',
                )
              }
            >
              <option value="local">lancee only</option>
              <option value="both" disabled={!driveConnected}>lancee + Google Drive</option>
              <option value="drive" disabled={!driveConnected}>Google Drive only</option>
            </select>
          </label>
          <button
            type="submit"
            className="button button--primary"
            disabled={!documentFile || uploadingDocument}
          >
            {uploadingDocument ? 'Uploading…' : 'Upload'}
          </button>
        </form>
      )}

      <PdfStudio onToast={onToast} />

      <section className="dashboard-document-library" aria-label="Documents stored in lancee">
        <div className="dashboard-drive-browser__header">
          <div>
            <h3>lancee document library</h3>
            <p>Documents stored securely in this workspace. Sync any item to Drive when it is ready.</p>
          </div>
          <span className="badge">{documents.length} stored</span>
        </div>
        {documents.length === 0 ? (
          <div className="dashboard-empty">No documents are stored in lancee yet.</div>
        ) : (
          <div className="document-library__list">
            {documents.map((document) => (
              <div key={document.id} className="document-library__row">
                <div>
                  <strong>{document.name}</strong>
                  <small>
                    {(document.size / 1024).toFixed(1)} KB · {document.mimeType}
                  </small>
                </div>
                <span className={document.syncedAt ? 'badge badge--success' : 'badge'}>
                  {document.syncedAt ? 'Synced to Drive' : 'lancee only'}
                </span>
                <details className="file-item-menu">
                  <summary aria-label={`Actions for ${document.name}`}>⋮</summary>
                  <div>
                  {driveWorkspaceMode({
                    id: document.id,
                    name: document.name,
                    mimeType: document.mimeType,
                    webViewLink: null,
                    modifiedTime: document.updatedAt,
                    size: document.size,
                    canEdit: true,
                    canDownload: true,
                    canListChildren: false,
                  }) !== 'unsupported' && (
                    <button
                      type="button"
                      onClick={() => setSelectedLocalDocument(document)}
                    >
                      {document.mimeType === 'application/pdf' ||
                      document.mimeType.startsWith('image/')
                        ? 'View in lancee'
                        : 'Edit in lancee'}
                    </button>
                  )}
                  <a
                    href={api.documents.downloadUrl(document.id)}
                  >
                    Download
                  </a>
                  {document.driveWebViewLink ? (
                    <a
                      href={document.driveWebViewLink}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open Drive copy
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled={!driveConnected}
                      onClick={() => void handleSyncDocument(document)}
                    >
                      Sync to Drive
                    </button>
                  )}
                  </div>
                </details>
                <button
                  type="button"
                  className="button button--danger button--small document-library__remove"
                  disabled={removingDocumentId !== null}
                  aria-label={`Remove ${document.name} from platform`}
                  onClick={() => void handleRemoveDocument(document)}
                >
                  {removingDocumentId === document.id ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {driveConnected && driveListLoaded && (
        <section className="dashboard-drive-browser" aria-label="Google Drive files">
          <div className="dashboard-drive-browser__header">
            <div>
              <h3>
                Google Drive folder tree
              </h3>
              <p>
                Expand folders in place, open supported files in lancee, or link any item to a client and project.
              </p>
            </div>
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={() => void openDrivePicker(true)}
            >
              Choose Drive files
            </button>
          </div>
          {driveFiles.length === 0 ? (
            <div className="dashboard-empty dashboard-drive-browser__empty">
              No Drive files have been shared with lancee yet. Choose files or folders to make them available here.
            </div>
          ) : (
            <div className="drive-tree">
              <div className="drive-tree__column-head">
                <span>Name</span>
                <span>Relationship & actions</span>
              </div>
              {renderDriveRows(driveFiles)}
            </div>
          )}
          {selectedDriveResource && (
            <div className="drive-linker">
              <div>
                <span>{isDriveFolder(selectedDriveResource) ? 'Folder' : 'File'} selected</span>
                <strong>{selectedDriveResource.name}</strong>
              </div>
              <label>
                Client
                <select
                  value={linkClientId}
                  onChange={(event) => {
                    setLinkClientId(event.target.value)
                    setLinkProjectId('')
                  }}
                >
                  <option value="">Select client</option>
                  {clients.filter((client) => client.status === 'active').map((client) => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Project <small>Optional</small>
                <select
                  value={linkProjectId}
                  onChange={(event) => setLinkProjectId(event.target.value)}
                  disabled={!linkClientId}
                >
                  <option value="">Client-level link</option>
                  {projects
                    .filter((project) => project.clientId === linkClientId)
                    .map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                className="button button--primary button--small"
                disabled={!linkClientId || linkingResource}
                onClick={() => void handleLinkDriveResource()}
              >
                {linkingResource ? 'Linking…' : 'Link to workspace'}
              </button>
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => setSelectedDriveResource(null)}
              >
                Close
              </button>
              {resourceLinks
                .filter((link) => link.driveFileId === selectedDriveResource.id)
                .map((link) => (
                  <div key={link.id} className="drive-linker__existing">
                    <span>
                      {link.clientName}
                      {link.projectName ? ` · ${link.projectName}` : ''}
                    </span>
                    <button type="button" onClick={() => void handleRemoveResourceLink(link)}>
                      Remove
                    </button>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}

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

      {selectedDriveFile && (
        <DriveFileWorkspace
          file={selectedDriveFile}
          onClose={() => setSelectedDriveFile(null)}
          onSaved={(saved) => {
            setDriveFiles((current) =>
              current.map((file) =>
                file.id === saved.id ? { ...file, ...saved } : file,
              ),
            )
            setSelectedDriveFile((current) =>
              current?.id === saved.id ? { ...current, ...saved } : current,
            )
            onToast(`${saved.name} saved to Google Drive`)
          }}
        />
      )}
      {selectedLocalDocument && (
        <DriveFileWorkspace
          source="local"
          file={{
            id: selectedLocalDocument.id,
            name: selectedLocalDocument.name,
            mimeType: selectedLocalDocument.mimeType,
            webViewLink: null,
            modifiedTime: selectedLocalDocument.updatedAt,
            size: selectedLocalDocument.size,
            canEdit: true,
            canDownload: true,
            canListChildren: false,
          }}
          onClose={() => setSelectedLocalDocument(null)}
          onSaved={() => {
            void api.documents.list().then((items) => {
              setDocuments(items)
              const updated = items.find(
                (item) => item.id === selectedLocalDocument.id,
              )
              if (updated) setSelectedLocalDocument(updated)
            })
            onToast(`${selectedLocalDocument.name} saved in lancee`)
          }}
        />
      )}
    </div>
  )
}
