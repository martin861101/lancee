import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { DragDropProvider, DragOverlay } from '@dnd-kit/react'
import type { DragEndEvent, DragOverEvent } from '@dnd-kit/react'
import BoardColumn from './BoardColumn'
import DragOverlayCard from './DragOverlay'
import { buildItemsByColumn } from './utils'
import { COLUMN_IDS, REVERSE_STATUS, type ColumnId } from './types'
import type { Project, ProjectLink, ProjectFile } from '../../lib/api'
import { api } from '../../lib/api'
import '../work-page.css'
import './work-panel.css'

export default function WorkPanel({
  onToast,
}: {
  onToast: (message: string) => void
}) {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [clientName, setClientName] = useState('')
  const [projectDue, setProjectDue] = useState('')
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [editName, setEditName] = useState('')
  const [editClient, setEditClient] = useState('')
  const [editScope, setEditScope] = useState('')
  const [editDue, setEditDue] = useState('')
  const [editBoardId, setEditBoardId] = useState<string | null>(null)
  const [boards, setBoards] = useState<Array<{ id: string; label: string }>>([])
  const [links, setLinks] = useState<ProjectLink[]>([])
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [newLinkUrl, setNewLinkUrl] = useState('')
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [error, setError] = useState('')
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>([...COLUMN_IDS])
  const prevProjects = useRef<Project[]>([])

  const itemsByColumnRef = useRef<Record<string, Project[]>>({})

  useEffect(() => {
    let active = true
    api.projects.list()
      .then((data) => {
        if (active) {
          setProjects(data)
          prevProjects.current = data
          itemsByColumnRef.current = buildItemsByColumn(data)
        }
      })
      .catch(() => setError('Unable to load projects'))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const itemsByColumn = buildItemsByColumn(projects)
  itemsByColumnRef.current = itemsByColumn

  const findProject = useCallback((id: string) => projects.find((p) => p.id === id) || null, [projects])

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { source, target } = event.operation
    if (!source || !target) return
    if (source.type === 'column') return

    const targetId = String(target.id)
    if (!targetId.endsWith('__body')) return

    const targetColId = targetId.replace('__body', '') as ColumnId
    if (!COLUMN_IDS.includes(targetColId)) return

    setProjects((current) => {
      const project = current.find((p) => p.id === source.id)
      if (!project) return current
      const newStatus = REVERSE_STATUS[targetColId]
      if (!newStatus || project.status === newStatus) return current
      return current.map((p) =>
        p.id === source.id ? { ...p, status: newStatus as Project['status'] } : p,
      )
    })
  }, [])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { source, target } = event.operation
    if (!source) return

    if (source.type === 'column') {
      if (!target) return
      setColumnOrder((order) => {
        const oldIdx = order.indexOf(source.id as ColumnId)
        const newIdx = order.indexOf(target.id as ColumnId)
        if (oldIdx === -1 || newIdx === -1) return order
        const next = [...order]
        const [moved] = next.splice(oldIdx, 1)
        next.splice(newIdx, 0, moved)
        return next
      })
      return
    }

    const sourceId = String(source.id)
    const currentItems = itemsByColumnRef.current

    for (const colId of COLUMN_IDS) {
      const colProjects = currentItems[colId]
      const idx = colProjects.findIndex((p) => p.id === sourceId)
      if (idx !== -1) {
        const projectStatus = colProjects[idx].status
        const targetStatus = REVERSE_STATUS[colId]
        if (projectStatus !== targetStatus) {
          api.projects.updateStatus(sourceId, targetStatus)
            .then((updated) => {
              setProjects((current) => current.map((p) => (p.id === updated.id ? updated : p)))
            })
            .catch(() => {
              setProjects(prevProjects.current)
              onToast('Failed to update project status.')
            })
        }
        return
      }
    }
  }, [onToast])

  const deleteProject = useCallback(async (id: string) => {
    try {
      await api.projects.remove(id)
      setProjects((current) => current.filter((p) => p.id !== id))
      onToast('Project deleted')
    } catch { onToast('Unable to delete project.') }
  }, [onToast])

  const submitProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const project = await api.projects.create({
        name: projectName.trim(),
        client: clientName.trim(),
        due: projectDue.trim() || undefined,
      })
      setProjects((current) => [project, ...current])
      setProjectName('')
      setClientName('')
      setProjectDue('')
      setCreating(false)
      onToast(`${project.name} was added to your work`)
    } catch (caught) {
      onToast(caught instanceof Error ? caught.message : 'Failed to create project')
    }
  }

  const beginEdit = async (project: Project) => {
    setEditingProject(project)
    setEditName(project.name)
    setEditClient(project.client)
    setEditScope(project.scope)
    setEditDue(project.due)
    setEditBoardId(project.boardId || null)
    setNewLinkUrl('')
    setNewLinkLabel('')
    try {
      const [boardList, projectLinks, projectFiles] = await Promise.all([
        api.ideas.listBoards(),
        api.projects.links.list(project.id),
        api.projects.files.list(project.id),
      ])
      setBoards(boardList)
      setLinks(projectLinks)
      setFiles(projectFiles)
    } catch {
      setBoards([])
      setLinks([])
      setFiles([])
    }
  }

  const saveEdit = async () => {
    if (!editingProject) return
    const name = editName.trim()
    const client = editClient.trim()
    if (!name || !client) { setEditingProject(null); return }
    try {
      const fields: Record<string, unknown> = { name, client }
      const scope = editScope.trim()
      if (scope && scope !== editingProject.scope) fields.scope = scope
      if (editDue !== editingProject.due) fields.due = editDue
      if (editBoardId !== editingProject.boardId) fields.boardId = editBoardId
      const updated = await api.projects.update(editingProject.id, fields as Partial<Parameters<typeof api.projects.update>[1]>)
      setProjects((current) => current.map((p) => (p.id === updated.id ? updated : p)))
      setEditingProject(null)
    } catch { onToast('Unable to update project.') }
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

  const openCount = projects.length
  const uniqueClients = new Set(projects.map((p) => p.client)).size
  const dueSoon = projects.filter((p) => p.status === 'In review' || p.status === 'In progress').length

  return (
    <>
      <header className="work-header">
        <div>
          <span className="work-eyebrow">Clients & projects</span>
          <h1>Your work, without the admin fog.</h1>
          <p>Keep every brief, deadline, decision, and deliverable in one calm place.</p>
        </div>
        <button className="button button--primary" onClick={() => setCreating(true)}>
          <span aria-hidden="true">＋</span> New project
        </button>
      </header>

      <section className="travel-strip" aria-label="Travel-aware workspace">
        <span className="travel-strip__pin" aria-hidden="true">⌁</span>
        <div>
          <strong>Working across timezones</strong>
          <span>Client deadlines and reminders stay in their local time</span>
        </div>
        <button onClick={() => onToast('Travel preferences opened')}>Travel settings</button>
      </section>

      <section className="work-snapshot" aria-label="Work snapshot">
        <article>
          <span>Open projects</span>
          <strong>{openCount}</strong>
          <small>Across {uniqueClients} client{uniqueClients !== 1 ? 's' : ''}</small>
        </article>
        <article>
          <span>In progress</span>
          <strong>{projects.filter((p) => p.status === 'In progress').length}</strong>
          <small>{dueSoon} active projects</small>
        </article>
        <article>
          <span>In review</span>
          <strong>{projects.filter((p) => p.status === 'In review').length}</strong>
          <small>Waiting for feedback</small>
        </article>
        <article>
          <span>Ready</span>
          <strong>{projects.filter((p) => p.status === 'Ready').length}</strong>
          <small>Completed projects</small>
        </article>
      </section>

      {error && <div className="work-error"><strong>{error}</strong></div>}

      {loading ? (
        <div className="board-loading"><strong>Loading board…</strong></div>
      ) : (
        <DragDropProvider
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <section className="board-scroll">
            <div className="board">
              {columnOrder.map((columnId, columnIndex) => (
                <BoardColumn
                  key={columnId}
                  columnId={columnId}
                  columnIndex={columnIndex}
                  items={itemsByColumn[columnId] || []}
                  onDelete={deleteProject}
                  onEdit={beginEdit}
                />
              ))}
            </div>
          </section>

          <DragOverlay>
            {(source) => {
              if (!source) return null
              const project = findProject(String(source.id))
              if (!project) return null
              return <DragOverlayCard project={project} />
            }}
          </DragOverlay>
        </DragDropProvider>
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
                  <input value={editClient} onChange={(e) => setEditClient(e.target.value)} placeholder="Client name" required />
                </label>
                <label>
                  <span>Scope / deliverables</span>
                  <input value={editScope} onChange={(e) => setEditScope(e.target.value)} placeholder="e.g. Brand identity, web design" />
                </label>
                <label>
                  <span>Due date</span>
                  <input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
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
                {files.length === 0 ? (
                  <p className="work-dialog__hint">No files attached.</p>
                ) : (
                  <div className="work-dialog__files">
                    {files.map((file) => (
                      <div key={file.id} className="work-dialog__file-row">
                        <span>{file.name}</span>
                        <span className="work-dialog__file-size">{(file.size / 1024).toFixed(1)} KB</span>
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
        <div className="work-dialog-backdrop" onMouseDown={() => setCreating(false)}>
          <form
            className="work-dialog"
            onSubmit={submitProject}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="work-dialog__header">
              <span>New project</span>
              <button type="button" onClick={() => setCreating(false)} aria-label="Close">×</button>
            </div>
            <h2>What are you making?</h2>
            <p>Start small. You can add the brief, files, dates, and invoice next.</p>
            <label>
              <span>Project name</span>
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Coastal Dry Gin label" autoFocus required />
            </label>
            <label>
              <span>Client</span>
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client or studio name" required />
            </label>
            <label>
              <span>Due date</span>
              <input type="date" value={projectDue} onChange={(e) => setProjectDue(e.target.value)} />
            </label>
            <div className="work-dialog__actions">
              <button className="button button--secondary" type="button" onClick={() => setCreating(false)}>Cancel</button>
              <button className="button button--primary" type="submit">Create project</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
