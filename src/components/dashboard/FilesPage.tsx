import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
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
  isDefault: boolean
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

type ExplorerIconName =
  | 'bell'
  | 'chevron-down'
  | 'clock'
  | 'file'
  | 'filter'
  | 'folder'
  | 'grid'
  | 'list'
  | 'menu'
  | 'more'
  | 'plus'
  | 'search'
  | 'settings'
  | 'star'
  | 'sun'
  | 'trash'
  | 'upload'
  | 'users'

function ExplorerIcon({ name, size = 18 }: { name: ExplorerIconName; size?: number }) {
  const paths: Record<ExplorerIconName, ReactNode> = {
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    'chevron-down': <path d="m7 10 5 5 5-5" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h6" /></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4" /><circle cx="8" cy="6" r="1" fill="currentColor" stroke="none" /></>,
    folder: <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" />,
    grid: <><rect x="4" y="4" width="5" height="5" rx="1" /><rect x="15" y="4" width="5" height="5" rx="1" /><rect x="4" y="15" width="5" height="5" rx="1" /><rect x="15" y="15" width="5" height="5" rx="1" /></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" /></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    more: <><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63h.01A1.7 1.7 0 0 0 10 3.08V3h4v.09A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9v.01A1.7 1.7 0 0 0 20.92 10H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z" /></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6" /></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 14v5h14v-5" /></>,
    users: <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  }

  return (
    <svg
      className="file-explorer__svg-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

type GooglePickerApi = {
  Action: { PICKED: string; CANCEL: string }
  ViewId: { DOCS: string }
  DocsView: new (viewId?: string) => {
    setIncludeFolders(value: boolean): unknown
    setMimeTypes(value: string): unknown
    setSelectFolderEnabled(value: boolean): unknown
  }
  PickerBuilder: new () => {
    addView(view: unknown): GooglePickerApi['PickerBuilder']['prototype']
    enableFeature(feature: string): GooglePickerApi['PickerBuilder']['prototype']
    setOAuthToken(token: string): GooglePickerApi['PickerBuilder']['prototype']
    setDeveloperKey(key: string): GooglePickerApi['PickerBuilder']['prototype']
    setAppId(appId: string): GooglePickerApi['PickerBuilder']['prototype']
    setOrigin(origin: string): GooglePickerApi['PickerBuilder']['prototype']
    setCallback(callback: (data: { action?: string; docs?: GooglePickerDocument[] }) => void): GooglePickerApi['PickerBuilder']['prototype']
    build(): { setVisible(value: boolean): void }
  }
}

type GooglePickerDocument = {
  id?: string
  name?: string
  mimeType?: string
  url?: string
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
  if (integration.id === 'onedrive') return 'onedrive'
  return null
}

function explorerFileType(name: string, mimeType: string) {
  const lowerName = name.toLowerCase()
  if (mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return { label: 'PDF', className: 'pdf' }
  }
  if (mimeType.includes('spreadsheet') || /\.(xls|xlsx|csv)$/.test(lowerName)) {
    return { label: 'XLS', className: 'sheet' }
  }
  if (mimeType.includes('word') || /\.(doc|docx)$/.test(lowerName)) {
    return { label: 'DOC', className: 'doc' }
  }
  if (mimeType.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/.test(lowerName)) {
    return { label: 'IMG', className: 'image' }
  }
  if (mimeType.includes('presentation') || /\.(ppt|pptx)$/.test(lowerName)) {
    return { label: 'PPT', className: 'presentation' }
  }
  return { label: 'TXT', className: 'text' }
}

function explorerFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function explorerDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export default function FilesPage({
  onOpenConnections,
  onToast,
  ownerName,
  ownerInitials,
  initialStorageProvider,
}: {
  onOpenConnections: () => void
  onToast: (message: string) => void
  ownerName: string
  ownerInitials: string
  initialStorageProvider?: 'dropbox' | 'onedrive' | null
}) {
  const [links, setLinks] = useState<CloudLink[]>([])
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFile[]>([])
  const [driveRootFolder, setDriveRootFolder] = useState<GoogleDriveFile | null>(null)
  const [driveFolderTrail, setDriveFolderTrail] = useState<GoogleDriveFile[]>([])
  const [driveChildren, setDriveChildren] = useState<Record<string, GoogleDriveFile[]>>({})
  const [expandedDriveFolders, setExpandedDriveFolders] = useState<Set<string>>(new Set())
  const [loadingDriveFolders, setLoadingDriveFolders] = useState<Set<string>>(new Set())
  const [selectedDriveFile, setSelectedDriveFile] =
    useState<GoogleDriveFile | null>(null)
  const [selectedDriveResource, setSelectedDriveResource] =
    useState<GoogleDriveFile | null>(null)
  const [driveToolsOpen, setDriveToolsOpen] = useState(false)
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
    useState<'local' | 'drive' | 'dropbox' | 'onedrive'>('local')
  const [uploadingDocument, setUploadingDocument] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [driveListLoaded, setDriveListLoaded] = useState(false)
  const [driveLoading, setDriveLoading] = useState(false)
  const [removingDriveFileId, setRemovingDriveFileId] = useState<string | null>(null)
  const [removingDocumentId, setRemovingDocumentId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [provider, setProvider] = useState<StorageProvider>('drive')
  const [label, setLabel] = useState('')
  const [folderUrl, setFolderUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [makeDefault, setMakeDefault] = useState(false)
  const [documentStoragePointId, setDocumentStoragePointId] = useState('')
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
    setDocumentStoragePointId((current) =>
      linkList.some((link) => link.id === current)
        ? current
        : linkList.find((link) => link.isDefault)?.id || '',
    )
  }, [])

  const fetchDriveFiles = useCallback(async () => {
    setError('')
    setDriveLoading(true)
    try {
      const rootItems = await api.googleDrive.list()
      const rootFolder = rootItems.find(isDriveFolder) || null
      const files = rootFolder
        ? await api.googleDrive.list(rootFolder.id)
        : rootItems
      setDriveRootFolder(rootFolder)
      setDriveFolderTrail(rootFolder ? [rootFolder] : [])
      setDriveFiles(files)
      setDriveChildren(rootFolder ? { [rootFolder.id]: files } : {})
      setExpandedDriveFolders(rootFolder ? new Set([rootFolder.id]) : new Set())
      setLoadingDriveFolders(new Set())
      setSelectedDriveFile(null)
      setSelectedDriveResource(null)
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Drive files')
      setDriveFiles([])
      setDriveRootFolder(null)
      setDriveFolderTrail([])
      setDriveChildren({})
      setExpandedDriveFolders(new Set())
      setLoadingDriveFolders(new Set())
      setSelectedDriveFile(null)
      setSelectedDriveResource(null)
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

  const openDriveFolder = async (
    folder: GoogleDriveFile,
    nextTrail: GoogleDriveFile[] = [...driveFolderTrail, folder],
  ) => {
    if (!isDriveFolder(folder) || driveLoading) return
    setError('')
    setDriveLoading(true)
    try {
      const children = driveChildren[folder.id] || await api.googleDrive.list(folder.id)
      setDriveChildren((current) => ({ ...current, [folder.id]: children }))
      setDriveFolderTrail(nextTrail)
      setDriveFiles(children)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to open this Drive folder.')
    } finally {
      setDriveLoading(false)
    }
  }

  const openDriveFolderAt = async (index: number) => {
    const target = driveFolderTrail[index]
    if (!target || index === driveFolderTrail.length - 1) return
    await openDriveFolder(target, driveFolderTrail.slice(0, index + 1))
  }

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
      docsView.setMimeTypes('application/vnd.google-apps.folder')
      docsView.setSelectFolderEnabled(true)
      let pickedDocuments: GooglePickerDocument[] | null = null
      await new Promise<void>((resolve) => {
        const instance = new picker.PickerBuilder()
          .addView(docsView)
          .setOAuthToken(config.accessToken)
          .setDeveloperKey(config.developerKey)
          .setAppId(config.appId)
          .setOrigin(window.location.origin)
          .setCallback((data) => {
            if (data.action === picker.Action.PICKED) {
              pickedDocuments = data.docs || []
              resolve()
            } else if (data.action === picker.Action.CANCEL) {
              resolve()
            }
          })
          .build()
        instance.setVisible(true)
      })
      const selectedDocuments = pickedDocuments as GooglePickerDocument[] | null
      if (selectedDocuments !== null) {
        const folder = selectedDocuments.find(
          (document) => document.mimeType === 'application/vnd.google-apps.folder',
        )
        if (selectedDocuments.length !== 1 || !folder) {
          throw new Error('Choose one Google Drive folder for this workspace.')
        }
        await api.googleDrive.replaceSelections([{
          driveFileId: String(folder.id || '').trim(),
          name: String(folder.name || '').trim(),
          mimeType: 'application/vnd.google-apps.folder',
          webViewLink: folder.url || null,
        }])
      }
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

  useEffect(() => {
    const refreshAssistantChanges = () => void load().catch(() => undefined)
    window.addEventListener('lancee:dashboard-changed', refreshAssistantChanges)
    return () => window.removeEventListener('lancee:dashboard-changed', refreshAssistantChanges)
  }, [load])

  useEffect(() => {
    if (!initialStorageProvider || loading) return
    setProvider(initialStorageProvider)
    setFormOpen(true)
    setNotice('')
    window.setTimeout(() => {
      document.querySelector('.file-explorer__storage-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
  }, [initialStorageProvider, loading])

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

  const filteredDocuments = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return documents
    return documents.filter((document) =>
      `${document.name} ${document.mimeType}`.toLowerCase().includes(needle),
    )
  }, [documents, query])

  const filteredDriveFiles = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return driveFiles
    return driveFiles.filter((file) =>
      `${file.name} ${file.mimeType}`.toLowerCase().includes(needle),
    )
  }, [driveFiles, query])

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
        isDefault: makeDefault || links.length === 0,
      })
      setLinks((current) => [created, ...current])
      if (created.isDefault) setDocumentStoragePointId(created.id)
      setLabel('')
      setFolderUrl('')
      setNotes('')
      setMakeDefault(false)
      setFormOpen(false)
      setNotice('Cloud folder linked to your workspace.')
      onToast('Folder link saved')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save folder link.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSetDefaultLink = async (link: CloudLink) => {
    if (link.isDefault) return
    setError('')
    try {
      await api.cloudLinks.setDefault(link.id)
      setLinks((current) => current.map((item) => ({ ...item, isDefault: item.id === link.id })))
      setDocumentStoragePointId(link.id)
      onToast(`${link.label} is now the default storage point`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to set the default storage point.')
    }
  }

  const openStoragePointSetup = (nextProvider: StorageProvider) => {
    setProvider(nextProvider)
    setFormOpen(true)
    setNotice('')
    window.setTimeout(() => {
      document.querySelector('.file-explorer__storage-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 0)
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

  const handleTrashDriveFile = async (file: GoogleDriveFile) => {
    if (!file.canDelete || removingDriveFileId) return
    const isFolder = isDriveFolder(file)
    const warning = isFolder
      ? ' This will move the folder and its contents to Google Drive trash.'
      : ' You can restore it from Google Drive trash.'
    if (!window.confirm(`Move “${file.name}” to Google Drive trash?${warning}`)) return
    setRemovingDriveFileId(file.id)
    setError('')
    try {
      await api.googleDrive.trash(file.id)
      if (driveRootFolder?.id === file.id) {
        setDriveRootFolder(null)
        setDriveFolderTrail([])
        setDriveFiles([])
      } else {
        setDriveFiles((current) => current.filter((item) => item.id !== file.id))
      }
      setDriveChildren((current) => {
        const next: Record<string, GoogleDriveFile[]> = {}
        for (const [folderId, children] of Object.entries(current)) {
          if (folderId !== file.id) next[folderId] = children.filter((item) => item.id !== file.id)
        }
        return next
      })
      setExpandedDriveFolders((current) => {
        const next = new Set(current)
        next.delete(file.id)
        return next
      })
      setSelectedDriveFile((current) => (current?.id === file.id ? null : current))
      setSelectedDriveResource((current) => (current?.id === file.id ? null : current))
      setResourceLinks((current) => current.filter((link) => link.driveFileId !== file.id))
      onToast(`${file.name} moved to Google Drive trash`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to remove this Drive file.')
    } finally {
      setRemovingDriveFileId(null)
    }
  }

  const handleDocumentUpload = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!documentFile) return
    if (documentDestination === 'drive' && !driveRootFolder) {
      setError('Choose a Google Drive folder before uploading to Drive.')
      return
    }
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
        documentDestination === 'drive' ? driveRootFolder?.id : undefined,
        documentDestination === 'local' ? undefined : documentStoragePointId || undefined,
      )
      if (result.document) {
        setDocuments((current) => [
          result.document as WorkspaceDocument,
          ...current.filter((item) => item.id !== result.document?.id),
        ])
      }
      if (documentDestination === 'drive') await refreshDriveFiles()
      setDocumentFile(null)
      setUploadOpen(false)
      const storagePoint = links.find((link) => link.id === documentStoragePointId)
      onToast(
        documentDestination === 'drive'
          ? 'Document uploaded to Google Drive'
          : storagePoint
            ? `Document saved to ${storagePoint.label}`
            : 'Document saved in lancee',
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to upload this document.')
    } finally {
      setUploadingDocument(false)
    }
  }

  const handleSyncDocument = async (document: WorkspaceDocument) => {
    if (!driveRootFolder) {
      setError('Choose a Google Drive folder before syncing this document.')
      return
    }
    try {
      const result = await api.documents.syncToDrive(document.id, driveRootFolder.id)
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
                {file.canDelete && (
                  <button
                    type="button"
                    className="file-item-menu__danger"
                    disabled={removingDriveFileId !== null}
                    onClick={() => void handleTrashDriveFile(file)}
                  >
                    {removingDriveFileId === file.id ? 'Moving to trash…' : 'Move to Drive trash'}
                  </button>
                )}
              </div>
            </details>
          </div>
          {folder && expanded && (
            <div className="drive-tree__children">
              {loadingFolder ? (
                <div
                  className="drive-tree__empty"
                  style={{ paddingLeft: `${42 + depth * 22}px` }}
                >
                  Loading folder…
                </div>
              ) : driveChildren[file.id] && driveChildren[file.id].length > 0 ? (
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

  const totalDocumentBytes = documents.reduce((total, document) => total + document.size, 0)
  const defaultStoragePoint = links.find((link) => link.isDefault) || links[0] || null
  const quickAccessDocuments = filteredDocuments.slice(0, 4)
  const storagePointForDocument = (document: WorkspaceDocument) =>
    links.find((link) => link.id === document.storagePointId)

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
    <div className="content-container animate-fade-in dashboard-page files-page file-explorer">
      <aside className="file-explorer__sidebar" aria-label="Files navigation">
        <button
          type="button"
          className="file-explorer__new"
          onClick={() => setUploadOpen((open) => !open)}
        >
          <span className="file-explorer__new-icon"><ExplorerIcon name="plus" size={20} /></span>
          <span>{uploadOpen ? 'Close' : 'New'}</span>
          <span className="file-explorer__new-chevron"><ExplorerIcon name="chevron-down" size={16} /></span>
        </button>

        <nav className="file-explorer__nav" aria-label="File views">
          <button type="button" className="is-active" onClick={() => setQuery('')}>
            <span className="file-explorer__nav-icon"><ExplorerIcon name="file" /></span>
            <span>All files</span>
            <small>{documents.length}</small>
          </button>
          <button type="button" onClick={() => setQuery('')}>
            <span className="file-explorer__nav-icon"><ExplorerIcon name="clock" /></span>
            <span>Recent</span>
          </button>
          <button type="button" onClick={() => setNotice('Starred files will appear here as you mark them.')}>
            <span className="file-explorer__nav-icon"><ExplorerIcon name="star" /></span>
            <span>Starred</span>
          </button>
          <button type="button" onClick={() => setNotice('Shared files are managed from their storage point.')}>
            <span className="file-explorer__nav-icon"><ExplorerIcon name="users" /></span>
            <span>Shared with me</span>
          </button>
          <button type="button" onClick={() => setNotice('Trash is managed by the selected storage provider.')}>
            <span className="file-explorer__nav-icon"><ExplorerIcon name="trash" /></span>
            <span>Trash</span>
          </button>
        </nav>

        <div className="file-explorer__spaces">
          <span className="file-explorer__section-label">Storage points</span>
          {storageIntegrations
            .filter((integration) => providerFromIntegration(integration))
            .map((integration) => {
              const storageProvider = providerFromIntegration(integration)
              if (!storageProvider) return null
              const linked = linksByProvider[storageProvider] || 0
              return (
                <button
                  type="button"
                  className="file-explorer__space-row"
                  key={integration.id}
                  onClick={() => openStoragePointSetup(storageProvider)}
                >
                  <span className={'file-explorer__space-icon file-explorer__space-icon--' + storageProvider}>
                    {storageProvider === 'drive' ? 'G' : storageProvider === 'dropbox' ? 'D' : 'O'}
                  </span>
                  <span>{integration.name.replace('Microsoft ', '')}</span>
                  <small>{linked || (integration.connected ? 1 : 0)}</small>
                </button>
              )
            })}
          {links.slice(0, 4).map((link) => (
            <button
              type="button"
              className={'file-explorer__space-row' + (link.isDefault ? ' is-default' : '')}
              key={link.id}
              onClick={() => void handleSetDefaultLink(link)}
              title={link.isDefault ? 'Default storage point' : 'Make default storage point'}
            >
              <span className={'file-explorer__space-icon file-explorer__space-icon--' + link.provider}>
                {link.provider === 'drive' ? 'G' : link.provider === 'dropbox' ? 'D' : 'O'}
              </span>
              <span>{link.label}</span>
              {link.isDefault && <small>Default</small>}
            </button>
          ))}
          <button
            type="button"
            className="file-explorer__new-space"
            onClick={() => openStoragePointSetup('drive')}
          >
            <span><ExplorerIcon name="plus" size={17} /></span> New storage point
          </button>
        </div>

        <div className="file-explorer__storage-meter">
          <span className="file-explorer__section-label">Workspace storage</span>
          <div className="file-explorer__meter">
            <span style={{ width: String(Math.min(100, Math.max(5, (totalDocumentBytes / (50 * 1024 * 1024)) * 100))) + '%' }} />
          </div>
          <small>
            {explorerFileSize(totalDocumentBytes)} stored in lancee
            {defaultStoragePoint ? ` · ${defaultStoragePoint.label}` : ''}
          </small>
          <button type="button" onClick={() => setUploadOpen(true)}>Manage storage</button>
        </div>

        <button type="button" className="file-explorer__profile" onClick={onOpenConnections}>
          <span className="file-explorer__profile-avatar">{ownerInitials}</span>
          <span>
            <strong>{ownerName}</strong>
            <small>Storage settings</small>
          </span>
          <span className="file-explorer__profile-chevron"><ExplorerIcon name="chevron-down" size={16} /></span>
        </button>
      </aside>

      <main className="file-explorer__main">
        <header className="file-explorer__topbar">
          <div className="file-explorer__topbar-title">
            <span className="file-explorer__mobile-menu"><ExplorerIcon name="menu" size={22} /></span>
            <strong>Files</strong>
          </div>
          <div className="file-explorer__topbar-actions" aria-label="File tools">
            <button type="button" aria-label="Search files" onClick={() => document.querySelector<HTMLInputElement>('.file-explorer__search input')?.focus()}><ExplorerIcon name="search" size={19} /></button>
            <button type="button" aria-label="Display options" onClick={() => setNotice('Display preferences follow your workspace theme.')}><ExplorerIcon name="sun" size={20} /></button>
            <button type="button" className="has-notification" aria-label="Open storage connections" onClick={onOpenConnections}><ExplorerIcon name="bell" size={19} /></button>
          </div>
        </header>

        <div className="file-explorer__content">
          <header className="file-explorer__title-row">
            <div>
              <h1>Files</h1>
              <p>Work from your selected Google Drive folder or your lancee library.</p>
            </div>
            <div className="file-explorer__title-actions">
              <div className="file-explorer__view-toggle" aria-label="File layout">
                <button type="button" className="is-active" aria-label="List view"><ExplorerIcon name="list" size={17} /></button>
                <button type="button" aria-label="Grid view"><ExplorerIcon name="grid" size={16} /></button>
              </div>
              <button type="button" className="button button--primary file-explorer__upload-button" onClick={() => setUploadOpen((open) => !open)}>
                <ExplorerIcon name="upload" size={17} /> {uploadOpen ? 'Close upload' : 'Upload'}
              </button>
            </div>
          </header>

          {error && <div className="dashboard-alert">{error}</div>}
          {notice && <div className="dashboard-alert dashboard-alert--success">{notice}</div>}

          <div className="file-explorer__toolbar">
            <label className="file-explorer__search">
              <span aria-hidden="true"><ExplorerIcon name="search" size={18} /></span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search files and folders…"
                aria-label="Search files and folders"
              />
            </label>
            <button type="button" className="file-explorer__toolbar-button" onClick={() => setNotice('Use a storage point or file name to narrow this view.')}>
              <ExplorerIcon name="filter" size={16} /> <span>Filters</span>
            </button>
            <select className="file-explorer__sort" aria-label="Sort files">
              <option>Name (A–Z)</option>
              <option>Recently updated</option>
              <option>Largest first</option>
            </select>
          </div>

          <section className="file-explorer__section drive-folder-section" aria-labelledby="drive-folder-heading">
            <div className="file-explorer__section-heading drive-folder-section__heading">
              <div>
                <h2 id="drive-folder-heading">Google Drive folder</h2>
                <p className="drive-folder-section__hint">
                  {driveRootFolder
                    ? 'Files here open and save directly in Google Drive.'
                    : 'Choose one folder to make it the workspace file location.'}
                </p>
              </div>
              <div className="drive-folder-section__actions">
                {driveRootFolder?.webViewLink && (
                  <a className="button button--secondary button--small" href={driveRootFolder.webViewLink} target="_blank" rel="noreferrer">
                    Open in Drive ↗
                  </a>
                )}
                <button type="button" className="button button--primary button--small" onClick={() => void openDrivePicker(driveConnected)}>
                  {driveConnected ? (driveRootFolder ? 'Change folder' : 'Choose folder') : 'Connect Google Drive'}
                </button>
              </div>
            </div>
            {!driveConnected ? (
              <div className="drive-folder-section__empty">
                <strong>Connect Google Drive to use a cloud file folder.</strong>
                <span>Files can be viewed and edited here after you choose a folder.</span>
              </div>
            ) : !driveRootFolder ? (
              <div className="drive-folder-section__empty">
                <strong>No Google Drive folder selected.</strong>
                <span>Choose a folder once and the dashboard will remember it for this workspace.</span>
              </div>
            ) : (
              <div className="drive-folder-browser">
                <div className="drive-folder-browser__bar">
                  <nav className="drive-folder-browser__breadcrumbs" aria-label="Google Drive folder path">
                    {driveFolderTrail.map((folder, index) => (
                      <span key={folder.id}>
                        {index > 0 && <span aria-hidden="true">/</span>}
                        <button type="button" disabled={index === driveFolderTrail.length - 1} onClick={() => void openDriveFolderAt(index)}>
                          {folder.name}
                        </button>
                      </span>
                    ))}
                  </nav>
                  <span className="drive-folder-browser__count">
                    {filteredDriveFiles.length} of {driveFiles.length} item{driveFiles.length === 1 ? '' : 's'}
                  </span>
                </div>
                {driveLoading ? (
                  <div className="drive-folder-section__empty">Loading the Google Drive folder…</div>
                ) : (
                  <div className="file-explorer__file-table-wrap">
                    <table className="file-explorer__file-table drive-folder-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Type</th>
                          <th>Updated</th>
                          <th>Size</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDriveFiles.map((file) => {
                          const folder = isDriveFolder(file)
                          const fileType = explorerFileType(file.name, file.mimeType)
                          const mode = driveWorkspaceMode(file)
                          return (
                            <tr key={file.id}>
                              <td>
                                <button
                                  type="button"
                                  className="file-explorer__file-name"
                                  onClick={() => folder ? void openDriveFolder(file) : mode !== 'unsupported' && setSelectedDriveFile(file)}
                                >
                                  <span className={folder ? 'drive-folder-table__folder-icon' : 'file-explorer__file-icon file-explorer__file-icon--' + fileType.className}>
                                    {folder ? <ExplorerIcon name="folder" size={20} /> : fileType.label}
                                  </span>
                                  <span>
                                    <strong>{file.name}</strong>
                                    <small>{folder ? 'Folder' : fileType.label + (file.canEdit ? ' · Editable' : ' · View only')}</small>
                                  </span>
                                </button>
                              </td>
                              <td>{folder ? 'Folder' : fileType.label}</td>
                              <td>{explorerDate(file.modifiedTime || '')}</td>
                              <td>{file.size === null ? '—' : explorerFileSize(file.size)}</td>
                              <td>
                                <details className="file-item-menu">
                                  <summary aria-label={'Actions for ' + file.name}><ExplorerIcon name="more" size={18} /></summary>
                                  <div>
                                    {folder && <button type="button" onClick={() => void openDriveFolder(file)}>Open folder</button>}
                                    {!folder && mode !== 'unsupported' && <button type="button" onClick={() => setSelectedDriveFile(file)}>{file.canEdit && !['pdf', 'image'].includes(mode) ? 'Edit in lancee' : 'View in lancee'}</button>}
                                    {!folder && <button type="button" onClick={() => { setSelectedDriveResource(file); setDriveToolsOpen(true) }}>Link to client or project</button>}
                                    {file.webViewLink && <a href={file.webViewLink} target="_blank" rel="noreferrer">Open in Drive ↗</a>}
                                    {file.canDelete && <button type="button" className="file-item-menu__danger" disabled={removingDriveFileId !== null} onClick={() => void handleTrashDriveFile(file)}>{removingDriveFileId === file.id ? 'Moving to trash…' : 'Move to Drive trash'}</button>}
                                  </div>
                                </details>
                              </td>
                            </tr>
                          )
                        })}
                        {filteredDriveFiles.length === 0 && (
                          <tr><td colSpan={5} className="file-explorer__empty-row">This Google Drive folder is empty.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="file-explorer__section" aria-labelledby="quick-access-heading">
            <div className="file-explorer__section-heading">
              <h2 id="quick-access-heading">Quick access</h2>
              <span>{filteredDocuments.length} file{filteredDocuments.length === 1 ? '' : 's'}</span>
            </div>
            <div className="file-explorer__quick-grid">
              {quickAccessDocuments.map((document) => {
                const fileType = explorerFileType(document.name, document.mimeType)
                const storagePoint = storagePointForDocument(document)
                return (
                  <article className="file-explorer__quick-card" key={document.id}>
                    <button type="button" className="file-explorer__quick-star" aria-label={'Star ' + document.name}><ExplorerIcon name="star" size={17} /></button>
                    <button
                      type="button"
                      className="file-explorer__quick-open"
                      onClick={() => setSelectedLocalDocument(document)}
                    >
                      <span className={'file-explorer__file-icon file-explorer__file-icon--' + fileType.className}>{fileType.label}</span>
                      <strong>{document.name}</strong>
                      <small>{storagePoint?.label || 'Lancee library'}</small>
                      <span className="file-explorer__quick-meta">
                        <span className="file-explorer__mini-avatar">{ownerInitials}</span>
                        Updated {explorerDate(document.updatedAt)}
                      </span>
                    </button>
                  </article>
                )
              })}
              {quickAccessDocuments.length === 0 && (
                <div className="file-explorer__empty-card">
                  <strong>Your workspace is ready for its first file.</strong>
                  <span>Upload a document or set a storage point to get started.</span>
                </div>
              )}
            </div>
          </section>

          <section className="file-explorer__section" aria-labelledby="folders-heading">
            <div className="file-explorer__section-heading">
              <h2 id="folders-heading">Folders</h2>
              <button type="button" onClick={() => openStoragePointSetup('drive')}>Manage storage points</button>
            </div>
            <div className="file-explorer__folder-columns" aria-hidden="true">
              <span>Name <b>↑</b></span>
              <span>Owner</span>
              <span>Updated</span>
              <span>Size</span>
              <span />
            </div>
            <div className="file-explorer__folder-list">
              {[
                {
                  id: 'local',
                  label: 'Lancee library',
                  provider: 'local',
                  count: documents.length,
                  updatedAt: documents[0]?.updatedAt || new Date().toISOString(),
                  isDefault: false,
                },
                ...filteredLinks.map((link) => ({
                  id: link.id,
                  label: link.label,
                  provider: link.provider,
                  count: documents.filter((document) => document.storagePointId === link.id).length,
                  updatedAt: link.updatedAt,
                  isDefault: link.isDefault,
                })),
              ].map((folder) => (
                <div className="file-explorer__folder-row" key={folder.id}>
                  <button
                    type="button"
                    className="file-explorer__folder-main"
                    onClick={() => folder.id === 'local' ? setQuery('') : openStoragePointSetup(folder.provider as StorageProvider)}
                  >
                    <span className={'file-explorer__folder-icon file-explorer__folder-icon--' + folder.provider}><ExplorerIcon name="folder" size={25} /></span>
                    <span>{folder.label}</span>
                  </button>
                  <span className="file-explorer__folder-owner">
                    <span className="file-explorer__mini-avatar">{ownerInitials}</span>
                    {folder.isDefault && <span className="file-explorer__default-pill">Default</span>}
                  </span>
                  <span>{explorerDate(folder.updatedAt)}</span>
                  <span>{folder.count} {folder.count === 1 ? 'item' : 'items'}</span>
                  <button type="button" className="file-explorer__row-menu" aria-label={'Actions for ' + folder.label} onClick={() => folder.id === 'local' ? setUploadOpen(true) : void handleSetDefaultLink(filteredLinks.find((link) => link.id === folder.id) || links[0])}><ExplorerIcon name="more" size={18} /></button>
                </div>
              ))}
              {filteredLinks.length === 0 && (
                <div className="file-explorer__empty-row">
                  No cloud storage points yet. Choose Dropbox, OneDrive, or Google Drive to add one.
                </div>
              )}
            </div>
          </section>

          <section className="file-explorer__section file-explorer__files-section" aria-labelledby="files-heading">
            <div className="file-explorer__section-heading">
              <h2 id="files-heading">Files</h2>
              <span>{filteredDocuments.length ? 'Showing workspace documents' : 'No files yet'}</span>
            </div>
            <div className="file-explorer__file-table-wrap">
              <table className="file-explorer__file-table">
                <thead>
                  <tr>
                    <th>Name <span aria-hidden="true">↑</span></th>
                    <th>Storage point</th>
                    <th>Updated</th>
                    <th>Size</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filteredDocuments.map((document) => {
                    const fileType = explorerFileType(document.name, document.mimeType)
                    const storagePoint = storagePointForDocument(document)
                    return (
                      <tr key={document.id}>
                        <td>
                          <button type="button" className="file-explorer__file-name" onClick={() => setSelectedLocalDocument(document)}>
                            <span className={'file-explorer__file-icon file-explorer__file-icon--' + fileType.className}>{fileType.label}</span>
                            <span>
                              <strong>{document.name}</strong>
                              <small>{fileType.label} document</small>
                            </span>
                          </button>
                        </td>
                        <td>
                          <span className="file-explorer__storage-label">
                            <span className={'file-explorer__space-icon file-explorer__space-icon--' + (storagePoint?.provider || 'local')}>
                              {storagePoint ? (storagePoint.provider === 'drive' ? 'G' : storagePoint.provider === 'dropbox' ? 'D' : 'O') : 'L'}
                            </span>
                            {storagePoint?.label || 'Lancee library'}
                          </span>
                        </td>
                        <td>{explorerDate(document.updatedAt)}</td>
                        <td>{explorerFileSize(document.size)}</td>
                        <td>
                          <details className="file-item-menu">
                            <summary aria-label={'Actions for ' + document.name}><ExplorerIcon name="more" size={18} /></summary>
                            <div>
                              <button type="button" onClick={() => setSelectedLocalDocument(document)}>View in lancee</button>
                              <a href={api.documents.downloadUrl(document.id)}>Download</a>
                              {driveConnected && driveRootFolder && (
                                <button type="button" onClick={() => void handleSyncDocument(document)}>Sync to Google Drive</button>
                              )}
                              <button
                                type="button"
                                className="file-item-menu__danger"
                                disabled={removingDocumentId === document.id}
                                onClick={() => void handleRemoveDocument(document)}
                              >
                                {removingDocumentId === document.id ? 'Removing…' : 'Remove'}
                              </button>
                            </div>
                          </details>
                        </td>
                      </tr>
                    )
                  })}
                  {filteredDocuments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="file-explorer__empty-row">No files match this view. Upload a document to begin.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <footer className="file-explorer__pagination">
              <span>{filteredDocuments.length ? '1–' + filteredDocuments.length + ' of ' + documents.length + ' items' : '0 items'}</span>
              <div><button type="button" aria-label="Previous page">‹</button><button type="button" className="is-active">1</button><button type="button" aria-label="Next page">›</button></div>
            </footer>
          </section>

          {uploadOpen && (
            <form className="file-explorer__upload" onSubmit={handleDocumentUpload}>
              <div className="file-explorer__form-heading">
                <div>
                  <span className="file-explorer__eyebrow">Add a file</span>
                  <h2>Upload to a storage option</h2>
                  <p>Choose a Drive folder for cloud uploads, or keep the file in the lancee library for local editing.</p>
                </div>
                <button type="button" className="file-explorer__close" onClick={() => setUploadOpen(false)}>×</button>
              </div>
              <label className="file-explorer__file-picker">
                <span>{documentFile?.name || 'Choose a document'}</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.md,.markdown,.txt,image/*"
                  onChange={(event) => setDocumentFile(event.target.files?.[0] || null)}
                  required
                />
              </label>
              <label className="file-explorer__form-field">
                Storage option
                <select
                  value={documentDestination}
                  onChange={(event) => {
                    const next = event.target.value as 'local' | 'drive' | 'dropbox' | 'onedrive'
                    setDocumentDestination(next)
                    setDocumentStoragePointId(links.find((link) => link.provider === next && link.isDefault)?.id || links.find((link) => link.provider === next)?.id || '')
                  }}
                >
                  <option value="local">Local workspace</option>
                  <option value="drive" disabled={!driveConnected || !driveRootFolder}>Google Drive folder</option>
                  <option value="dropbox" disabled={!links.some((link) => link.provider === 'dropbox')}>Dropbox</option>
                  <option value="onedrive" disabled={!links.some((link) => link.provider === 'onedrive')}>OneDrive</option>
                </select>
              </label>
              {documentDestination === 'drive' && driveRootFolder && (
                <div className="file-explorer__form-field file-explorer__drive-destination">
                  Google Drive folder
                  <strong>{driveRootFolder.name}</strong>
                  <small>Uploads are saved directly to this folder.</small>
                </div>
              )}
              {documentDestination !== 'local' && documentDestination !== 'drive' && (
                <label className="file-explorer__form-field">
                  Storage point
                  <select value={documentStoragePointId} onChange={(event) => setDocumentStoragePointId(event.target.value)} required>
                    <option value="">Choose a storage point</option>
                    {links.filter((link) => link.provider === documentDestination).map((link) => (
                      <option key={link.id} value={link.id}>{link.label}{link.isDefault ? ' · Default' : ''}</option>
                    ))}
                  </select>
                </label>
              )}
              <button type="submit" className="button button--primary" disabled={!documentFile || uploadingDocument || (documentDestination === 'drive' && !driveRootFolder)}>
                {uploadingDocument ? 'Uploading…' : 'Add file'}
              </button>
            </form>
          )}

          {formOpen && (
            <form className="file-explorer__storage-form" onSubmit={handleAddLink}>
              <div className="file-explorer__form-heading">
                <div>
                  <span className="file-explorer__eyebrow">Storage point</span>
                  <h2>Connect a private file destination</h2>
                  <p>Choose a provider, then point it at the folder where this workspace should place files. lancee does not browse the provider.</p>
                </div>
                <button type="button" className="file-explorer__close" onClick={() => setFormOpen(false)}>×</button>
              </div>
              <div className="file-explorer__form-grid">
                <label className="file-explorer__form-field">
                  Provider
                  <select value={provider} onChange={(event) => setProvider(event.target.value as StorageProvider)}>
                    <option value="drive">Google Drive</option>
                    <option value="dropbox">Dropbox</option>
                    <option value="onedrive">Microsoft OneDrive</option>
                  </select>
                </label>
                <label className="file-explorer__form-field">
                  Storage point name
                  <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Client files" required maxLength={120} />
                </label>
                <label className="file-explorer__form-field file-explorer__form-field--wide">
                  Folder URL
                  <input
                    type="url"
                    value={folderUrl}
                    onChange={(event) => setFolderUrl(event.target.value)}
                    placeholder={provider === 'drive' ? 'https://drive.google.com/drive/folders/…' : provider === 'dropbox' ? 'https://www.dropbox.com/home/…' : 'https://onedrive.live.com/…'}
                    required
                  />
                </label>
                <label className="file-explorer__form-field file-explorer__form-field--wide">
                  Notes
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional delivery or team notes." maxLength={500} />
                </label>
              </div>
              <label className="file-explorer__checkbox">
                <input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} />
                Make this the default storage point
              </label>
              <div className="file-explorer__form-actions">
                <button type="submit" className="button button--primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save storage point'}</button>
                <button type="button" className="button button--secondary" onClick={() => setFormOpen(false)}>Cancel</button>
                <button type="button" className="file-explorer__text-button" onClick={() => void handleRefresh()}>Refresh</button>
              </div>
            </form>
          )}

          {links.length > 0 && (
            <section className="file-explorer__linked-points" aria-labelledby="linked-points-heading">
              <div className="file-explorer__section-heading">
                <h2 id="linked-points-heading">Connected storage points</h2>
                <span>{links.length} configured</span>
              </div>
              <div className="file-explorer__linked-points-list">
                {links.map((link) => (
                  <div className="file-explorer__linked-point" key={link.id}>
                    <span className={'file-explorer__space-icon file-explorer__space-icon--' + link.provider}>
                      {link.provider === 'drive' ? 'G' : link.provider === 'dropbox' ? 'D' : 'O'}
                    </span>
                    <div>
                      <strong>{link.label}{link.isDefault ? ' · Default' : ''}</strong>
                      <small>{providerLabels[link.provider as StorageProvider] || link.provider} · {link.folderUrl}</small>
                    </div>
                    <div className="file-explorer__linked-point-actions">
                      <button type="button" onClick={() => void handleCopyUrl(link.folderUrl)}>Copy URL</button>
                      {!link.isDefault && <button type="button" onClick={() => void handleSetDefaultLink(link)}>Make default</button>}
                      <button type="button" className="is-danger" onClick={() => void handleRemoveLink(link)}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <details className="file-explorer__advanced" open={driveToolsOpen} onToggle={(event) => setDriveToolsOpen(event.currentTarget.open)}>
            <summary>Google Drive tools and resource links</summary>
            <div>
              <p>The selected folder is the primary workspace. Use these tools to change it or link a Drive item to a client or project.</p>
              <button type="button" className="button button--secondary button--small" onClick={() => void openDrivePicker(driveConnected)}>
                {driveConnected ? 'Change Google Drive folder' : 'Connect Google Drive'}
              </button>
              {driveListLoaded && (
                <div className="drive-tree">
                  {driveRootFolder ? renderDriveRows([driveRootFolder]) : driveFiles.length > 0 ? renderDriveRows(driveFiles) : <div className="drive-tree__empty">No Google Drive folder selected.</div>}
                </div>
              )}
              {selectedDriveResource && (
                <div className="file-explorer__resource-linker">
                  <strong>Link {selectedDriveResource.name}</strong>
                  <div className="file-explorer__resource-linker-grid">
                    <select value={linkClientId} onChange={(event) => setLinkClientId(event.target.value)} aria-label="Client for Drive link">
                      <option value="">Choose client</option>
                      {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
                    </select>
                    <select value={linkProjectId} onChange={(event) => setLinkProjectId(event.target.value)} aria-label="Project for Drive link">
                      <option value="">Choose project</option>
                      {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                    </select>
                    <button type="button" className="button button--secondary button--small" disabled={linkingResource || (!linkClientId && !linkProjectId)} onClick={() => void handleLinkDriveResource()}>
                      {linkingResource ? 'Linking…' : 'Link selected item'}
                    </button>
                  </div>
                </div>
              )}
              {resourceLinks.length > 0 && (
                <div className="file-explorer__resource-links">
                  {resourceLinks.map((link) => (
                    <div key={link.id}>
                      <span>{link.name}</span>
                      <small>{link.clientName || link.projectName || 'Workspace resource'}</small>
                      <button type="button" onClick={() => void handleRemoveResourceLink(link)}>Remove link</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>

          <details className="file-explorer__advanced">
            <summary>Workspace document tools</summary>
            <div><PdfStudio onToast={onToast} /></div>
          </details>
        </div>
      </main>

      {selectedDriveFile && (
        <DriveFileWorkspace
          file={selectedDriveFile}
          onClose={() => setSelectedDriveFile(null)}
          onSaved={(saved) => {
            setDriveFiles((current) => current.map((file) => file.id === saved.id ? { ...file, ...saved } : file))
            setSelectedDriveFile((current) => current?.id === saved.id ? { ...current, ...saved } : current)
            onToast(saved.name + ' saved to Google Drive')
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
            canDelete: false,
          }}
          onClose={() => setSelectedLocalDocument(null)}
          onSaved={() => {
            void api.documents.list().then((items) => {
              setDocuments(items)
              const updated = items.find((item) => item.id === selectedLocalDocument.id)
              if (updated) setSelectedLocalDocument(updated)
            })
            onToast(selectedLocalDocument.name + ' saved in lancee')
          }}
        />
      )}
    </div>
  )
}
