import {
  useEffect,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react'
import type {
  Client,
  GoogleDriveResourceLink,
  Project,
  ProjectLink,
  ProjectFile,
  ProjectComment,
  DraftInvoice,
} from '../../lib/api'
import { api } from '../../lib/api'
import { AnnotationReviewPanel } from '../annotations/AnnotationReviewPanel'
import '../work-page.css'
import './work-panel.css'

export default function WorkPanel({
  onToast,
  ownerName,
  ownerInitials,
}: {
  onToast: (message: string) => void
  ownerName: string
  ownerInitials: string
}) {
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [creatingClient, setCreatingClient] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [newClientCompany, setNewClientCompany] = useState('')
  const [savingClient, setSavingClient] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [clientName, setClientName] = useState('')
  const [newProjectClientId, setNewProjectClientId] = useState('')
  const [projectDue, setProjectDue] = useState('')
  const [newProjectFiles, setNewProjectFiles] = useState<File[]>([])
  const [submittingProject, setSubmittingProject] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [workspaceLoading, setWorkspaceLoading] = useState(false)
  const [editName, setEditName] = useState('')
  const [editClient, setEditClient] = useState('')
  const [editClientId, setEditClientId] = useState('')
  const [editScope, setEditScope] = useState('')
  const [editDue, setEditDue] = useState('')
  const [editStatus, setEditStatus] = useState<Project['status']>('In progress')
  const [editBoardId, setEditBoardId] = useState<string | null>(null)
  const [boards, setBoards] = useState<Array<{ id: string; label: string }>>([])
  const [links, setLinks] = useState<ProjectLink[]>([])
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [projectDriveLinks, setProjectDriveLinks] = useState<GoogleDriveResourceLink[]>([])
  const [uploadingFiles, setUploadingFiles] = useState(false)
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | Project['status']>('All')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null)
  const [dropLaneId, setDropLaneId] = useState<string | null>(null)
  const [activeProjectTab, setActiveProjectTab] =
    useState<'board' | 'details' | 'files' | 'links' | 'review'>('board')
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string }>>([])
  const [customBuckets, setCustomBuckets] = useState<Array<{ id: string; label: string }>>([])
  const [bucketAssignees, setBucketAssignees] = useState<Record<string, string>>({})
  const [reviewComments, setReviewComments] = useState<ProjectComment[]>([])
  const [draftInvoice, setDraftInvoice] = useState<DraftInvoice | null>(null)
  const [draftAmount, setDraftAmount] = useState('')
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [lastReviewUrl, setLastReviewUrl] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([api.projects.list(), api.clients.list(), api.team.list().catch(() => [])])
      .then(([data, clientList, members]) => {
        if (active) {
          setProjects(data)
          setClients(clientList)
          const firstClient = clientList.find((client) => client.status === 'active')
          setSelectedClientId((current) => current || firstClient?.id || '')
          setNewProjectClientId((current) => current || firstClient?.id || '')
          setTeamMembers(members.filter((member) => member.status === 'active'))
        }
      })
      .catch(() => setError('Unable to load clients and projects'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const deleteProject = async (project: Project) => {
    if (
      !window.confirm(
        `Delete “${project.name}”? Its attached files, links, and project workspace will also be removed.`,
      )
    ) return
    try {
      await api.projects.remove(project.id)
      setProjects((current) => current.filter((item) => item.id !== project.id))
      setSelectedProject((current) =>
        current?.id === project.id ? null : current,
      )
      onToast('Project deleted')
    } catch { onToast('Unable to delete project.') }
  }

  const submitProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmittingProject(true)
    try {
      const project = await api.projects.create({
        name: projectName.trim(),
        clientId: newProjectClientId,
        client:
          clients.find((client) => client.id === newProjectClientId)?.name ||
          clientName.trim(),
        due: projectDue.trim() || undefined,
      })
      setProjects((current) => {
        return [project, ...current]
      })
      setProjectName('')
      setClientName('')
      setProjectDue('')
      let attachedCount = 0
      const failedFiles: string[] = []
      for (const selectedFile of newProjectFiles) {
        try {
          await api.projects.files.add(project.id, selectedFile)
          attachedCount += 1
        } catch {
          failedFiles.push(selectedFile.name)
        }
      }
      setNewProjectFiles([])
      setCreating(false)
      onToast(
        failedFiles.length > 0
          ? `${project.name} was created; ${failedFiles.length} file upload${failedFiles.length === 1 ? '' : 's'} failed`
          : `${project.name} was added${attachedCount ? ` with ${attachedCount} file${attachedCount === 1 ? '' : 's'}` : ''}`,
      )
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : 'Failed to create project')
    } finally {
      setSubmittingProject(false)
    }
  }

  const beginEdit = async (project: Project) => {
    setEditingProject(project)
    setEditName(project.name)
    setEditClient(project.client)
    setEditClientId(project.clientId || '')
    setEditScope(project.scope)
    setEditDue(project.due)
    setEditStatus(project.status)
    setEditBoardId(project.boardId || null)
    setNewLinkUrl('')
    setNewLinkLabel('')
    try {
      const [boardList, projectLinks, projectFiles, driveLinks] = await Promise.all([
        api.ideas.listBoards(),
        api.projects.links.list(project.id),
        api.projects.files.list(project.id),
        api.googleDrive.resourceLinks.list({ projectId: project.id }),
      ])
      setBoards(boardList)
      setLinks(projectLinks)
      setFiles(projectFiles)
      setProjectDriveLinks(driveLinks)
    } catch {
      setBoards([])
      setLinks([])
      setFiles([])
      setProjectDriveLinks([])
    }
  }

  const openProjectWorkspace = async (project: Project) => {
    setSelectedProject(project)
    setLastReviewUrl('')
    setWorkspaceLoading(true)
    setActiveProjectTab('board')
    try {
      setCustomBuckets(JSON.parse(localStorage.getItem(`lancee:project-buckets:${project.id}`) || '[]'))
      setBucketAssignees(JSON.parse(localStorage.getItem(`lancee:bucket-assignees:${project.id}`) || '{}'))
    } catch {
      setCustomBuckets([])
      setBucketAssignees({})
    }
    setLinks([])
    setFiles([])
    setProjectDriveLinks([])
    try {
      const [projectLinks, projectFiles, driveLinks] = await Promise.all([
        api.projects.links.list(project.id),
        api.projects.files.list(project.id),
        api.googleDrive.resourceLinks.list({ projectId: project.id }),
      ])
      setLinks(projectLinks)
      setFiles(projectFiles)
      setProjectDriveLinks(driveLinks)
      const review = await api.projectsWorkflow.approvals(project.id)
      setReviewComments(review.comments)
      setDraftInvoice(review.draftInvoice)
      setDraftAmount(review.draftInvoice ? String(review.draftInvoice.amountMinor / 100) : '')
    } catch {
      setLinks([])
      setFiles([])
      setProjectDriveLinks([])
      onToast('Some project details could not be loaded.')
    } finally {
      setWorkspaceLoading(false)
    }
  }

  const sendForApproval = async () => {
    if (!selectedProject || approvalBusy) return
    setApprovalBusy(true)
    try {
      const result = await api.projectsWorkflow.sendApproval(selectedProject.id)
      setLastReviewUrl(result.approval.reviewUrl || '')
      setSelectedProject((current) => current ? { ...current, status: 'In review' } : current)
      setProjects((current) => current.map((item) => item.id === selectedProject.id ? { ...item, status: 'In review' } : item))
      onToast(result.delivery === 'sent' ? 'Tokenized review link sent to the client.' : 'Tokenized review link created. Configure SMTP to send it automatically.')
    } catch (error) {
      onToast(error instanceof Error ? error.message : 'Unable to send approval request.')
    } finally {
      setApprovalBusy(false)
    }
  }

  const copyReviewUrl = async () => {
    if (!lastReviewUrl) return
    try {
      await navigator.clipboard.writeText(lastReviewUrl)
      onToast('Tokenized review link copied.')
    } catch {
      onToast('Copy the review link from the field.')
    }
  }

  const saveDraftAmount = async () => {
    if (!draftInvoice) return
    try {
      const updated = await api.projectsWorkflow.updateDraftInvoice(draftInvoice.id, { amountMinor: Math.round(Number(draftAmount) * 100) })
      setDraftInvoice(updated)
      onToast('Draft invoice updated.')
    } catch (error) { onToast(error instanceof Error ? error.message : 'Unable to update draft invoice.') }
  }

  const sendDraftInvoice = async () => {
    if (!draftInvoice) return
    try {
      const result = await api.projectsWorkflow.sendDraftInvoice(draftInvoice.id)
      setDraftInvoice(result.invoice)
      const completedProject = result.project
      if (completedProject) {
        setSelectedProject(completedProject)
        setProjects((current) => current.map((item) => item.id === completedProject.id ? completedProject : item))
      }
      onToast(result.delivery === 'sent' ? 'Invoice sent to the client.' : 'Invoice prepared. Configure SMTP to email it automatically.')
    } catch (error) { onToast(error instanceof Error ? error.message : 'Unable to send invoice.') }
  }

  const addCustomBucket = () => {
    if (!selectedProject) return
    const label = window.prompt('Name this bucket')
    if (!label?.trim()) return
    const next = [...customBuckets, { id: `custom-${crypto.randomUUID()}`, label: label.trim().slice(0, 60) }]
    setCustomBuckets(next)
    localStorage.setItem(`lancee:project-buckets:${selectedProject.id}`, JSON.stringify(next))
  }

  const manageBucket = (bucket: { id: string; label: string }) => {
    if (!selectedProject) return
    if (!bucket.id.startsWith('custom-')) {
      onToast(`${bucket.label} is a built-in project stage. Assign a teammate with the selector below.`)
      return
    }
    const label = window.prompt('Rename this bucket. Leave blank to delete it.', bucket.label)
    const next = label?.trim()
      ? customBuckets.map((item) => item.id === bucket.id ? { ...item, label: label.trim().slice(0, 60) } : item)
      : customBuckets.filter((item) => item.id !== bucket.id)
    setCustomBuckets(next)
    localStorage.setItem(`lancee:project-buckets:${selectedProject.id}`, JSON.stringify(next))
  }

  const assignBucket = (bucketId: string, memberId: string) => {
    if (!selectedProject) return
    const next = { ...bucketAssignees, [bucketId]: memberId }
    if (!memberId) delete next[bucketId]
    setBucketAssignees(next)
    localStorage.setItem(`lancee:bucket-assignees:${selectedProject.id}`, JSON.stringify(next))
  }

  const moveProject = async (
    project: Project,
    status: Project['status'],
  ) => {
    if (project.status === status) return
    try {
      const updated = await api.projects.updateStatus(project.id, status)
      setProjects((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
      setSelectedProject(updated)
      onToast(`${updated.name} moved to ${statusLabels[updated.status]}`)
    } catch {
      onToast('Unable to move this project.')
    }
  }

  const startProjectDrag = (
    event: DragEvent<HTMLElement>,
    project: Project,
  ) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', project.id)
    setDraggingProjectId(project.id)
  }

  const dragOverLane = (
    event: DragEvent<HTMLElement>,
    laneId: string,
    status: Project['status'] | null,
  ) => {
    if (!status || status === selectedProject?.status) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropLaneId(laneId)
  }

  const dropProjectInLane = (
    event: DragEvent<HTMLElement>,
    status: Project['status'] | null,
  ) => {
    event.preventDefault()
    const projectId = event.dataTransfer.getData('text/plain')
    setDropLaneId(null)
    setDraggingProjectId(null)
    if (!status || !selectedProject || projectId !== selectedProject.id) return
    void moveProject(selectedProject, status)
  }

  const saveEdit = async () => {
    if (!editingProject) return
    const name = editName.trim()
    const client =
      clients.find((item) => item.id === editClientId)?.name ||
      editClient.trim()
    if (!name || !client) { setEditingProject(null); return }
    try {
      const fields: Record<string, unknown> = {
        name,
        client,
        clientId: editClientId || undefined,
      }
      const scope = editScope.trim()
      if (scope && scope !== editingProject.scope) fields.scope = scope
      if (editDue !== editingProject.due) fields.due = editDue
      if (editStatus !== editingProject.status) fields.status = editStatus
      if (editBoardId !== editingProject.boardId) fields.boardId = editBoardId
      const updated = await api.projects.update(editingProject.id, fields as Partial<Parameters<typeof api.projects.update>[1]>)
      setProjects((current) => {
        return current.map((p) => (p.id === updated.id ? updated : p))
      })
      setSelectedProject((current) =>
        current?.id === updated.id ? updated : current,
      )
      setEditingProject(null)
    } catch { onToast('Unable to update project.') }
  }

  const submitClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavingClient(true)
    try {
      const client = await api.clients.create({
        name: newClientName.trim(),
        email: newClientEmail.trim(),
        company: newClientCompany.trim(),
      })
      setClients((current) => [
        client,
        ...current.filter((item) => item.id !== client.id),
      ])
      setSelectedClientId(client.id)
      setNewProjectClientId(client.id)
      setNewClientName('')
      setNewClientEmail('')
      setNewClientCompany('')
      setCreatingClient(false)
      onToast(`${client.name} was added`)
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : 'Unable to add client.')
    } finally {
      setSavingClient(false)
    }
  }

  const addLink = async () => {
    if (!editingProject || !newLinkUrl.trim()) return
    try {
      const link = await api.projects.links.add(editingProject.id, newLinkUrl.trim(), newLinkLabel.trim())
      setLinks((current) => [...current, link])
      setNewLinkUrl('')
      setNewLinkLabel('')
    } catch { onToast('Unable to add link.') }
  }

  const removeLink = async (linkId: string) => {
    try {
      await api.projects.links.remove(linkId)
      setLinks((current) => current.filter((l) => l.id !== linkId))
    } catch { onToast('Unable to remove link.') }
  }

  const validateSelectedFiles = (selected: File[]) => {
    const maximumBytes = 10 * 1024 * 1024
    const accepted = selected.filter(
      (file) => file.size > 0 && file.size <= maximumBytes,
    )
    if (accepted.length !== selected.length) {
      onToast('Files must be non-empty and no larger than 10 MB each.')
    }
    return accepted.slice(0, 10)
  }

  const chooseNewProjectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = validateSelectedFiles(Array.from(event.target.files || []))
    setNewProjectFiles(selected)
    event.target.value = ''
  }

  const attachFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!editingProject) return
    const selected = validateSelectedFiles(Array.from(event.target.files || []))
    event.target.value = ''
    if (selected.length === 0) return
    setUploadingFiles(true)
    let uploaded = 0
    try {
      for (const selectedFile of selected) {
        const attached = await api.projects.files.add(
          editingProject.id,
          selectedFile,
        )
        setFiles((current) => [...current, attached])
        uploaded += 1
      }
      onToast(`${uploaded} file${uploaded === 1 ? '' : 's'} attached`)
    } catch (caught) {
      onToast(
        caught instanceof Error ? caught.message : 'Unable to attach the file.',
      )
    } finally {
      setUploadingFiles(false)
    }
  }

  const removeFile = async (fileId: string) => {
    try {
      await api.projects.files.remove(fileId)
      setFiles((current) => current.filter((file) => file.id !== fileId))
      onToast('File removed')
    } catch {
      onToast('Unable to remove file.')
    }
  }

  const statusLabels: Record<Project['status'], string> = {
    'In progress': 'In Progress',
    'In review': 'Review',
    'Waiting on client': 'Pending',
    Ready: 'Completed',
  }
  const filteredProjects = projects.filter((project) => {
    const matchesQuery = `${project.name} ${project.client} ${project.scope}`
      .toLowerCase()
      .includes(query.trim().toLowerCase())
    return matchesQuery && (statusFilter === 'All' || project.status === statusFilter)
  })
  const pageSize = 7
  const pageCount = Math.max(1, Math.ceil(filteredProjects.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const visibleProjects = filteredProjects.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  )
  const firstVisible = filteredProjects.length === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const lastVisible = Math.min(currentPage * pageSize, filteredProjects.length)
  const formatDate = (value?: string) => {
    if (!value) return '—'
    const date = new Date(value)
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
        }).format(date)
  }
  const projectLanes: Array<{
    id: string
    label: string
    status: Project['status'] | null
    tone: string
  }> = [
    { id: 'backlog', label: 'Project brief', status: null, tone: 'slate' },
    { id: 'in-progress', label: 'In progress', status: 'In progress', tone: 'blue' },
    { id: 'waiting', label: 'Waiting on client', status: 'Waiting on client', tone: 'amber' },
    { id: 'review', label: 'Review', status: 'In review', tone: 'pink' },
    { id: 'client-comments', label: 'Client Comments', status: null, tone: 'violet' },
    { id: 'completed', label: 'Completed', status: 'Ready', tone: 'green' },
    ...customBuckets.map((bucket, index) => ({
      ...bucket,
      status: null,
      tone: ['blue', 'amber', 'pink', 'green'][index % 4],
    })),
  ]

  return (
    <>
      <div className="page projects-page">
        {selectedProject ? (
          <section className="project-workspace">
            <div className="project-workspace__breadcrumb">
              <button type="button" onClick={() => setSelectedProject(null)}>
                ← Projects
              </button>
              <span>/</span>
              <strong>{selectedProject.name}</strong>
            </div>

            <header className="project-workspace__header">
              <div>
                <span className="projects-eyebrow">Project workspace</span>
                <h1>{selectedProject.name}</h1>
                <p>
                  {selectedProject.client} · {selectedProject.scope || 'Project delivery workspace'}
                </p>
              </div>
              <div className="project-workspace__actions">
                <span className={`projects-status projects-status--${selectedProject.status.toLowerCase().replaceAll(' ', '-')}`}>
                  {statusLabels[selectedProject.status]}
                </span>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => void beginEdit(selectedProject)}
                >
                  Edit details
                </button>
                <button type="button" className="button button--primary" onClick={() => void sendForApproval()} disabled={approvalBusy || !clients.find((client) => client.id === selectedProject.clientId)?.email}>
                  {approvalBusy ? 'Sending…' : 'Send for approval'}
                </button>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() => void deleteProject(selectedProject)}
                >
                  Delete project
                </button>
                <button
                  type="button"
                  className="projects-new"
                  onClick={() => {
                    setNewProjectClientId(selectedProject.clientId || selectedClientId)
                    setCreating(true)
                  }}
                >
                  ＋ New Project
                </button>
              </div>
            </header>

            {lastReviewUrl && (
              <div className="project-review-link" role="status">
                <div><strong>Tokenized client review link</strong><span>The artwork is fetched only after the client opens this link.</span></div>
                <input value={lastReviewUrl} readOnly aria-label="Tokenized client review link" />
                <button type="button" className="button button--secondary button--small" onClick={() => void copyReviewUrl()}>Copy link</button>
              </div>
            )}

            <section className="project-workspace__stats" aria-label="Project summary">
              <article>
                <span>Progress</span>
                <strong>{selectedProject.progress}%</strong>
                <i><b style={{ width: `${selectedProject.progress}%` }} /></i>
              </article>
              <article>
                <span>Due date</span>
                <strong>{formatDate(selectedProject.due)}</strong>
                <small>{selectedProject.due ? 'Project deadline' : 'No deadline set'}</small>
              </article>
              <article>
                <span>Project assets</span>
                <strong>{files.length + links.length + projectDriveLinks.length}</strong>
                <small>{files.length} files · {links.length + projectDriveLinks.length} links</small>
              </article>
              <article>
                <span>Owner</span>
                <strong className="project-workspace__owner">
                  <i>{ownerInitials}</i>{ownerName}
                </strong>
                <small>Workspace owner</small>
              </article>
            </section>

            <div className="project-workspace__toolbar">
              <div>
                <button type="button" className={activeProjectTab === 'board' ? 'is-active' : ''} onClick={() => setActiveProjectTab('board')}>▦ Board</button>
                <button type="button" className={activeProjectTab === 'details' ? 'is-active' : ''} onClick={() => setActiveProjectTab('details')}>
                  ≡ Details
                </button>
                <button type="button" className={activeProjectTab === 'files' ? 'is-active' : ''} onClick={() => setActiveProjectTab('files')}>
                  ◫ Files <span>{files.length}</span>
                </button>
                <button type="button" className={activeProjectTab === 'review' ? 'is-active' : ''} onClick={() => setActiveProjectTab('review')}>
                  ◉ Review
                </button>
                <button type="button" className={activeProjectTab === 'links' ? 'is-active' : ''} onClick={() => setActiveProjectTab('links')}>
                  ↗ Links <span>{links.length + projectDriveLinks.length}</span>
                </button>
              </div>
              {activeProjectTab === 'board' ? (
                <button type="button" className="button button--secondary button--small" onClick={addCustomBucket}>＋ Add bucket</button>
              ) : (
                <span>Each section keeps its own focused project tools.</span>
              )}
            </div>

            {activeProjectTab === 'review' ? (
              <section className="project-section-panel project-section-panel--review">
                <AnnotationReviewPanel
                  projectId={selectedProject.id}
                  imageUrl={(() => {
                    const image = files.find((file) => file.mimeType.toLowerCase().startsWith('image/'))
                    return image ? api.projects.files.downloadUrl(image.id) : null
                  })()}
                />
              </section>
            ) : activeProjectTab === 'details' ? (
              <section className="project-section-panel">
                <header><div><span>Project details</span><h2>{selectedProject.name}</h2></div><button className="button button--secondary" onClick={() => void beginEdit(selectedProject)}>Edit details</button></header>
                <dl>
                  <div><dt>Client</dt><dd>{selectedProject.client}</dd></div>
                  <div><dt>Scope</dt><dd>{selectedProject.scope || 'No project scope added yet.'}</dd></div>
                  <div><dt>Status</dt><dd>{statusLabels[selectedProject.status]}</dd></div>
                  <div><dt>Due date</dt><dd>{formatDate(selectedProject.due)}</dd></div>
                  <div><dt>Owner</dt><dd>{ownerName}</dd></div>
                  <div><dt>Idea board</dt><dd>{selectedProject.boardId ? 'Connected' : 'Not connected'}</dd></div>
                </dl>
              </section>
            ) : activeProjectTab === 'files' ? (
              <section className="project-section-panel">
                <header>
                  <div><span>Project files</span><h2>Files and deliverables</h2></div>
                  <label className="button button--secondary">＋ Upload files<input hidden multiple type="file" onChange={(event) => void attachFiles(event)} /></label>
                </header>
                <div className="project-section-list">
                  {files.map((file) => (
                    <article key={file.id}><span>◫</span><div><strong>{file.name}</strong><small>{(file.size / 1024).toFixed(1)} KB · {file.mimeType}</small></div><a href={api.projects.files.downloadUrl(file.id)}>Download</a><button onClick={() => void removeFile(file.id)}>Remove</button></article>
                  ))}
                  {projectDriveLinks.map((link) => (
                    <article key={link.id}><span>▰</span><div><strong>{link.name}</strong><small>Google Drive · {link.resourceKind}</small></div>{link.webViewLink && <a href={link.webViewLink} target="_blank" rel="noreferrer">Open ↗</a>}</article>
                  ))}
                  {!files.length && !projectDriveLinks.length && <p>No project files yet.</p>}
                </div>
              </section>
            ) : activeProjectTab === 'links' ? (
              <section className="project-section-panel">
                <header><div><span>Project links</span><h2>References and shared URLs</h2></div></header>
                <div className="project-link-composer">
                  <input value={newLinkLabel} onChange={(event) => setNewLinkLabel(event.target.value)} placeholder="Label" />
                  <input value={newLinkUrl} onChange={(event) => setNewLinkUrl(event.target.value)} placeholder="https://…" />
                  <button className="button button--primary" onClick={() => void addLink()}>Add link</button>
                </div>
                <div className="project-section-list">
                  {links.map((link) => (
                    <article key={link.id}><span>↗</span><div><strong>{link.label || 'Shared reference'}</strong><small>{link.url}</small></div><a href={link.url} target="_blank" rel="noreferrer">Open ↗</a><button onClick={() => void removeLink(link.id)}>Remove</button></article>
                  ))}
                  {!links.length && <p>No project links yet.</p>}
                </div>
              </section>
            ) : workspaceLoading ? (
              <div className="project-workspace__loading">Loading the project workspace…</div>
            ) : (
              <div className="project-kanban-scroll">
                <div className="project-kanban">
                  {projectLanes.map((lane) => {
                    const isCurrent = lane.status === selectedProject.status
                    const laneAssetCount =
                      lane.id === 'backlog'
                        ? 1 + (selectedProject.boardId ? 1 : 0)
                        : lane.id === 'in-progress'
                          ? files.length + (isCurrent ? 1 : 0)
                          : lane.id === 'waiting'
                            ? links.length + (isCurrent ? 1 : 0)
                            : lane.id === 'review'
                              ? projectDriveLinks.length + (isCurrent ? 1 : 0)
                              : lane.id === 'client-comments'
                                ? reviewComments.length + (draftInvoice ? 1 : 0)
                              : isCurrent ? 1 : 0
                    return (
                      <section
                        key={lane.id}
                        className={`project-lane project-lane--${lane.tone}${isCurrent ? ' is-current' : ''}${dropLaneId === lane.id ? ' is-drop-target' : ''}`}
                        onDragLeave={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                            setDropLaneId((current) => current === lane.id ? null : current)
                          }
                        }}
                        onDragOver={(event) => dragOverLane(event, lane.id, lane.status)}
                        onDrop={(event) => dropProjectInLane(event, lane.status)}
                      >
                        <header>
                          <div>
                            <i />
                            <strong>{lane.label}</strong>
                            <span>{laneAssetCount}</span>
                          </div>
                          <button type="button" aria-label={`${lane.label} actions`} onClick={() => manageBucket(lane)}>⋮</button>
                        </header>
                        <label className="project-lane__assignee">
                          <span>Assigned to</span>
                          <select value={bucketAssignees[lane.id] || ''} onChange={(event) => assignBucket(lane.id, event.target.value)}>
                            <option value="">Unassigned</option>
                            {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                          </select>
                        </label>
                        <div className="project-lane__body">
                          {lane.id === 'backlog' && (
                            <>
                              <article className="project-kanban-card project-kanban-card--brief" role="button" tabIndex={0} onClick={() => setActiveProjectTab('details')}>
                                <span>Project brief</span>
                                <h3>{selectedProject.scope || 'Define the project deliverables'}</h3>
                                <p>
                                  Client: {selectedProject.client}<br />
                                  Created: {formatDate(selectedProject.createdAt)}
                                </p>
                                <footer>
                                  <em>Brief</em>
                                  <i>{ownerInitials}</i>
                                </footer>
                              </article>
                              {selectedProject.boardId && (
                                <article className="project-kanban-card">
                                  <span>Idea board</span>
                                  <h3>Linked creative canvas</h3>
                                  <p>References and early thinking connected to this project.</p>
                                  <footer><em>Ideas</em><b>↗</b></footer>
                                </article>
                              )}
                            </>
                          )}

                          {lane.id.startsWith('custom-') && (
                            <div className="project-lane__empty">
                              <span>Custom bucket ready for assigned work</span>
                            </div>
                          )}

                          {lane.id === 'client-comments' && (
                            <>
                              {reviewComments.map((comment) => (
                                <article key={comment.id} className="project-kanban-card">
                                  <span>Client comment</span><h3>{comment.authorName}</h3><p>{comment.body}</p><footer><em>{new Date(comment.createdAt).toLocaleDateString()}</em><i>CC</i></footer>
                                </article>
                              ))}
                              {draftInvoice && (
                                <article className="project-kanban-card">
                                  <span>Draft invoice · {draftInvoice.status.replaceAll('_', ' ')}</span><h3>{draftInvoice.invoiceNumber}</h3><p>{draftInvoice.description}</p><label className="project-invoice-amount"><span>Amount (ZAR)</span><input type="number" min="0" step="0.01" value={draftAmount} onChange={(event) => setDraftAmount(event.target.value)} /></label><footer><button type="button" onClick={() => void saveDraftAmount()}>Save</button>{draftInvoice.status !== 'sent' && <button type="button" onClick={() => void sendDraftInvoice()} disabled={draftInvoice.amountMinor < 100}>Send invoice</button>}</footer>
                                </article>
                              )}
                              {!reviewComments.length && !draftInvoice && <div className="project-lane__empty"><span>Comments and approved invoice drafts appear here.</span></div>}
                            </>
                          )}

                          {isCurrent && (
                            <article
                              className={`project-kanban-card project-kanban-card--primary${draggingProjectId === selectedProject.id ? ' is-dragging' : ''}`}
                              draggable
                              onDragEnd={() => {
                                setDraggingProjectId(null)
                                setDropLaneId(null)
                              }}
                              onDragStart={(event) => startProjectDrag(event, selectedProject)}
                              title="Drag this project into another status lane"
                            >
                              <span>Active project</span>
                              <h3>{selectedProject.name}</h3>
                              <p>{selectedProject.scope || 'Project delivery and client collaboration.'}</p>
                              <div className="project-kanban-card__progress">
                                <i><b style={{ width: `${selectedProject.progress}%` }} /></i>
                                <span>{selectedProject.progress}%</span>
                              </div>
                              <footer>
                                <em>{statusLabels[selectedProject.status]}</em>
                                <i>{ownerInitials}</i>
                              </footer>
                              <button type="button" className="project-card-action" onClick={(event) => { event.stopPropagation(); void sendForApproval() }} disabled={approvalBusy}>Send to client</button>
                            </article>
                          )}

                          {lane.id === 'in-progress' && files.map((file) => (
                            <article key={file.id} className="project-kanban-card">
                              <span>Attached file</span>
                              <h3>{file.name}</h3>
                              <p>{(file.size / 1024).toFixed(1)} KB · {file.mimeType || 'Project file'}</p>
                              <footer>
                                <em>File</em>
                                <a href={api.projects.files.downloadUrl(file.id)}>Download</a>
                              </footer>
                            </article>
                          ))}

                          {lane.id === 'waiting' && links.map((link) => (
                            <article key={link.id} className="project-kanban-card">
                              <span>Project link</span>
                              <h3>{link.label || 'Shared reference'}</h3>
                              <p>External reference waiting for review or feedback.</p>
                              <footer>
                                <em>Link</em>
                                <a href={link.url} target="_blank" rel="noopener noreferrer">Open ↗</a>
                              </footer>
                            </article>
                          ))}

                          {lane.id === 'review' && projectDriveLinks.map((link) => (
                            <article key={link.id} className="project-kanban-card">
                              <span>Google Drive</span>
                              <h3>{link.name}</h3>
                              <p>{link.resourceKind === 'folder' ? 'Shared project folder' : 'Drive project file'}</p>
                              <footer>
                                <em>Drive</em>
                                {link.webViewLink && (
                                  <a href={link.webViewLink} target="_blank" rel="noopener noreferrer">Open ↗</a>
                                )}
                              </footer>
                            </article>
                          ))}

                          {laneAssetCount === 0 && (
                            <div className="project-lane__empty">
                              <span>No items in this stage</span>
                            </div>
                          )}
                          {lane.status && !isCurrent && (
                            <button
                              type="button"
                              className="project-lane__move"
                              onClick={() => void moveProject(selectedProject, lane.status!)}
                            >
                              ＋ Move project here
                            </button>
                          )}
                        </div>
                      </section>
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        ) : (
          <>
        <header className="projects-header">
          <div>
            <span className="projects-eyebrow">Project directory</span>
            <h1>Projects</h1>
            <p>Track every client project, deadline, status, and owner in one view.</p>
          </div>
          <div className="projects-header__actions">
            <label className="projects-search">
              <span aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setPage(1)
                }}
                placeholder="Search projects"
                aria-label="Search projects"
              />
              <kbd>⌘K</kbd>
            </label>
            <div className="projects-filter-wrap">
              <button
                type="button"
                className={`projects-filter${statusFilter !== 'All' ? ' is-active' : ''}`}
                onClick={() => setFiltersOpen((open) => !open)}
                aria-expanded={filtersOpen}
              >
                <span aria-hidden="true">⌘</span>
                Filters
                <span aria-hidden="true">⌄</span>
              </button>
              {filtersOpen && (
                <div className="projects-filter-menu">
                  {(['All', 'In progress', 'In review', 'Waiting on client', 'Ready'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={statusFilter === status ? 'is-active' : ''}
                      onClick={() => {
                        setStatusFilter(status)
                        setPage(1)
                        setFiltersOpen(false)
                      }}
                    >
                      <span>{statusFilter === status ? '✓' : ''}</span>
                      {status === 'All' ? 'All statuses' : statusLabels[status]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="projects-new"
              onClick={() => {
                if (!selectedClientId) {
                  setCreatingClient(true)
                  return
                }
                setNewProjectClientId(selectedClientId)
                setCreating(true)
              }}
            >
              <span aria-hidden="true">＋</span> New Project
            </button>
          </div>
        </header>

        {error && <div className="work-error"><strong>{error}</strong></div>}

        <section className="projects-table-card" aria-label="Projects table">
          {loading ? (
            <div className="projects-empty"><strong>Loading projects…</strong></div>
          ) : (
            <>
              <div className="projects-table-scroll">
                <table className="projects-table">
                  <thead>
                    <tr>
                      <th>Project name</th>
                      <th>Client</th>
                      <th>Status</th>
                      <th>Due date</th>
                      <th>Created</th>
                      <th>Owner</th>
                      <th><span className="sr-only">Quick actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProjects.map((project) => (
                      <tr key={project.id}>
                        <td>
                          <button
                            type="button"
                            className="project-name-button"
                            onClick={() => void openProjectWorkspace(project)}
                          >
                            <span className="project-accent" style={{ background: project.accent }} />
                            <span>
                              <strong>{project.name}</strong>
                              <small>{project.scope || 'Project workspace'}</small>
                            </span>
                          </button>
                        </td>
                        <td>
                          <span className="project-client">
                            <i>{project.client.slice(0, 1).toUpperCase()}</i>
                            {project.client}
                          </span>
                        </td>
                        <td>
                          <span className={`projects-status projects-status--${project.status.toLowerCase().replaceAll(' ', '-')}`}>
                            {statusLabels[project.status]}
                          </span>
                        </td>
                        <td>{formatDate(project.due)}</td>
                        <td>{formatDate(project.createdAt)}</td>
                        <td>
                          <span className="project-owner">
                            <i>{ownerInitials}</i>
                            {ownerName}
                          </span>
                        </td>
                        <td>
                          <div className="project-quick-actions">
                            <button
                              type="button"
                              aria-label={`Edit ${project.name}`}
                              title="Edit project"
                              onClick={() => void beginEdit(project)}
                            >
                              ⋮
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${project.name}`}
                              title="Delete project"
                              onClick={() => void deleteProject(project)}
                            >
                              ×
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visibleProjects.length === 0 && (
                  <div className="projects-empty">
                    <strong>No projects found</strong>
                    <span>Try another search or clear the active filter.</span>
                  </div>
                )}
              </div>
              <footer className="projects-pagination">
                <span>
                  Showing {firstVisible} to {lastVisible} of {filteredProjects.length} projects
                </span>
                <div>
                  <button
                    type="button"
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                  >
                    ‹
                  </button>
                  {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      className={currentPage === pageNumber ? 'is-active' : ''}
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                    disabled={currentPage === pageCount}
                    aria-label="Next page"
                  >
                    ›
                  </button>
                </div>
              </footer>
            </>
          )}
        </section>
          </>
        )}
      </div>

      {creatingClient && (
        <div
          className="work-dialog-backdrop"
          onMouseDown={() => {
            if (!savingClient) setCreatingClient(false)
          }}
        >
          <form
            className="work-dialog"
            onSubmit={submitClient}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="work-dialog__header">
              <span>New client</span>
              <button
                type="button"
                onClick={() => setCreatingClient(false)}
                disabled={savingClient}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <h2>Create a client workspace</h2>
            <p>Their projects, task buckets, and linked Drive folders will stay together.</p>
            <label>
              <span>Client name</span>
              <input
                value={newClientName}
                onChange={(event) => setNewClientName(event.target.value)}
                placeholder="e.g. Northwind Studio"
                autoFocus
                required
              />
            </label>
            <label>
              <span>Company <small>Optional</small></span>
              <input
                value={newClientCompany}
                onChange={(event) => setNewClientCompany(event.target.value)}
                placeholder="Company or brand"
              />
            </label>
            <label>
              <span>Email <small>Optional</small></span>
              <input
                type="email"
                value={newClientEmail}
                onChange={(event) => setNewClientEmail(event.target.value)}
                placeholder="client@example.com"
              />
            </label>
            <div className="work-dialog__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setCreatingClient(false)}
                disabled={savingClient}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button--primary"
                disabled={savingClient}
              >
                {savingClient ? 'Creating…' : 'Create client'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingProject && (
        <div className="work-dialog-backdrop" onMouseDown={() => setEditingProject(null)}>
          <form
            className="work-dialog work-dialog--wide"
            onSubmit={(e) => { e.preventDefault(); void saveEdit() }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="work-dialog__header">
              <span>Edit project</span>
              <button type="button" onClick={() => setEditingProject(null)} aria-label="Close">×</button>
            </div>

            <div className="work-dialog__body">
              <div className="work-dialog__grid">
                <label>
                  <span>Project name</span>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Project name" autoFocus required />
                </label>
                <label>
                  <span>Client</span>
                  <select
                    value={editClientId}
                    onChange={(event) => {
                      const id = event.target.value
                      setEditClientId(id)
                      setEditClient(
                        clients.find((client) => client.id === id)?.name || '',
                      )
                    }}
                    required
                  >
                    <option value="">Select a client</option>
                    {clients.filter((client) => client.status === 'active').map((client) => (
                      <option key={client.id} value={client.id}>{client.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Scope / deliverables</span>
                  <input value={editScope} onChange={(e) => setEditScope(e.target.value)} placeholder="e.g. Brand identity, web design" />
                </label>
                <label>
                  <span>Due date</span>
                  <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value as Project['status'])}
                  >
                    <option value="In progress">In progress</option>
                    <option value="In review">In review</option>
                    <option value="Waiting on client">Waiting on client</option>
                    <option value="Ready">Ready</option>
                  </select>
                </label>
              </div>

              <fieldset className="work-dialog__fieldset">
                <legend>Linked idea board</legend>
                {boards.length === 0 ? (
                  <p className="work-dialog__hint">No boards yet. Create one in Ideas.</p>
                ) : (
                  <select
                    value={editBoardId || ''}
                    onChange={(e) => setEditBoardId(e.target.value || null)}
                  >
                    <option value="">None</option>
                    {boards.map((b) => (
                      <option key={b.id} value={b.id}>{b.label}</option>
                    ))}
                  </select>
                )}
              </fieldset>

              <fieldset className="work-dialog__fieldset">
                <legend>Google Drive ({projectDriveLinks.length})</legend>
                {projectDriveLinks.length === 0 ? (
                  <p className="work-dialog__hint">
                    No Drive files or folders linked. Open Files to connect one to this project.
                  </p>
                ) : (
                  <div className="work-dialog__links">
                    {projectDriveLinks.map((link) => (
                      <div key={link.id} className="work-dialog__link-row">
                        <a
                          href={link.webViewLink || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {link.resourceKind === 'folder' ? 'Folder · ' : ''}
                          {link.name}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </fieldset>

              <fieldset className="work-dialog__fieldset">
                <legend>Links ({links.length})</legend>
                <div className="work-dialog__links">
                  {links.map((link) => (
                    <div key={link.id} className="work-dialog__link-row">
                      <a href={link.url} target="_blank" rel="noopener noreferrer">{link.label || link.url}</a>
                      <button type="button" className="work-dialog__link-remove" onClick={() => removeLink(link.id)}>×</button>
                    </div>
                  ))}
                </div>
                <div className="work-dialog__add-link">
                  <input
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    placeholder="https://…"
                  />
                  <input
                    value={newLinkLabel}
                    onChange={(e) => setNewLinkLabel(e.target.value)}
                    placeholder="Label (optional)"
                  />
                  <button type="button" className="button button--primary" onClick={addLink}>Add</button>
                </div>
              </fieldset>

              <fieldset className="work-dialog__fieldset">
                <legend>Files ({files.length})</legend>
                <label className="work-dialog__file-picker">
                  <input
                    type="file"
                    multiple
                    onChange={(event) => void attachFiles(event)}
                    disabled={uploadingFiles}
                  />
                  <span className="button button--secondary button--small">
                    {uploadingFiles ? 'Uploading…' : 'Attach files'}
                  </span>
                  <small>Up to 10 files, 10 MB each</small>
                </label>
                {files.length === 0 ? (
                  <p className="work-dialog__hint">No files attached.</p>
                ) : (
                  <div className="work-dialog__files">
                    {files.map((file) => (
                      <div key={file.id} className="work-dialog__file-row">
                        <a href={api.projects.files.downloadUrl(file.id)}>
                          {file.name}
                        </a>
                        <span className="work-dialog__file-size">{(file.size / 1024).toFixed(1)} KB</span>
                        <button
                          type="button"
                          className="work-dialog__link-remove"
                          aria-label={`Remove ${file.name}`}
                          onClick={() => void removeFile(file.id)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </fieldset>
            </div>

            <div className="work-dialog__actions">
              <button className="button button--secondary" type="button" onClick={() => setEditingProject(null)}>Cancel</button>
              <button className="button button--primary" type="submit">Save</button>
            </div>
          </form>
        </div>
      )}

      {creating && (
        <div
          className="work-dialog-backdrop"
          onMouseDown={() => {
            if (!submittingProject) {
              setCreating(false)
              setNewProjectFiles([])
            }
          }}
        >
          <form
            className="work-dialog"
            onSubmit={submitProject}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="work-dialog__header">
              <span>New project</span>
              <button
                type="button"
                onClick={() => {
                  setCreating(false)
                  setNewProjectFiles([])
                }}
                aria-label="Close"
                disabled={submittingProject}
              >
                ×
              </button>
            </div>
            <h2>What are you making?</h2>
            <p>Start small. You can add the brief, files, dates, and invoice next.</p>
            <label>
              <span>Project name</span>
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Coastal Dry Gin label" autoFocus required />
            </label>
            <label>
              <span>Client</span>
              <select
                value={newProjectClientId}
                onChange={(event) => {
                  const id = event.target.value
                  setNewProjectClientId(id)
                  setClientName(
                    clients.find((client) => client.id === id)?.name || '',
                  )
                }}
                required
              >
                <option value="">Select a client</option>
                {clients.filter((client) => client.status === 'active').map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Due date</span>
              <input type="date" value={projectDue} onChange={(e) => setProjectDue(e.target.value)} />
            </label>
            <label className="work-dialog__file-picker">
              <span>Files <small>Optional</small></span>
              <input type="file" multiple onChange={chooseNewProjectFiles} />
              <span className="button button--secondary button--small">
                Choose files
              </span>
              <small>Up to 10 files, 10 MB each</small>
            </label>
            {newProjectFiles.length > 0 && (
              <div className="work-dialog__selected-files">
                {newProjectFiles.map((file) => (
                  <span key={`${file.name}:${file.lastModified}`}>
                    {file.name} · {(file.size / 1024).toFixed(1)} KB
                  </span>
                ))}
              </div>
            )}
            <div className="work-dialog__actions">
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  setCreating(false)
                  setNewProjectFiles([])
                }}
                disabled={submittingProject}
              >
                Cancel
              </button>
              <button
                className="button button--primary"
                type="submit"
                disabled={submittingProject}
              >
                {submittingProject ? 'Creating & uploading…' : 'Create project'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
