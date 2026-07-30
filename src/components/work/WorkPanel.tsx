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
} from '../../lib/api'
import { api } from '../../lib/api'
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

  useEffect(() => {
    let active = true
    Promise.all([api.projects.list(), api.clients.list()])
      .then(([data, clientList]) => {
        if (active) {
          setProjects(data)
          setClients(clientList)
          const firstClient = clientList.find((client) => client.status === 'active')
          setSelectedClientId((current) => current || firstClient?.id || '')
          setNewProjectClientId((current) => current || firstClient?.id || '')
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
    setWorkspaceLoading(true)
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
    } catch {
      setLinks([])
      setFiles([])
      setProjectDriveLinks([])
      onToast('Some project details could not be loaded.')
    } finally {
      setWorkspaceLoading(false)
    }
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
    { id: 'completed', label: 'Completed', status: 'Ready', tone: 'green' },
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
                <button type="button" className="is-active">▦ Board</button>
                <button type="button" onClick={() => void beginEdit(selectedProject)}>
                  ≡ Details
                </button>
                <button type="button" onClick={() => void beginEdit(selectedProject)}>
                  ◫ Files <span>{files.length}</span>
                </button>
                <button type="button" onClick={() => void beginEdit(selectedProject)}>
                  ↗ Links <span>{links.length + projectDriveLinks.length}</span>
                </button>
              </div>
              <span>Drag the active project card into a stage, or use the lane actions.</span>
            </div>

            {workspaceLoading ? (
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
                          <button type="button" aria-label={`${lane.label} actions`}>⋮</button>
                        </header>
                        <div className="project-lane__body">
                          {lane.id === 'backlog' && (
                            <>
                              <article className="project-kanban-card project-kanban-card--brief">
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
