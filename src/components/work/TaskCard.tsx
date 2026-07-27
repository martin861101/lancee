import { memo } from 'react'
import { useSortable } from '@dnd-kit/react/sortable'
import type { ColumnId } from './types'
import type { Project } from '../../lib/api'

function TaskCardInner({
  project,
  index,
  columnId,
  onDelete,
  onEdit,
}: {
  project: Project
  index: number
  columnId: ColumnId
  onDelete: (id: string) => void
  onEdit: (project: Project) => void
}) {
  const { ref, isDragging } = useSortable({
    id: project.id,
    index,
    group: columnId,
    type: 'task',
    accept: 'task',
  })

  return (
    <article
      ref={ref}
      className={`task-card${isDragging ? ' task-card--origin' : ''}`}
    >
      <span className="task-card__swatch" style={{ background: project.accent }} aria-hidden="true" />
      <div className="task-card__body">
        <strong>{project.name}</strong>
        <span>{project.client}</span>
        <div className="task-card__meta">
          <span className="task-card__scope">{project.scope}</span>
          <span className="task-card__due">Due {project.due}</span>
        </div>
        <div className="task-card__badges">
          {project.boardId && <span className="task-card__badge task-card__badge--board">Ideas</span>}
        </div>
      </div>
      <div className="task-card__actions">
        <button
          className="task-card__action"
          aria-label={`Edit ${project.name}`}
          onClick={(e) => { e.stopPropagation(); onEdit(project) }}
        >
          ✎
        </button>
        <button
          className="task-card__action task-card__action--delete"
          aria-label={`Delete ${project.name}`}
          onClick={(e) => { e.stopPropagation(); onDelete(project.id) }}
        >
          ×
        </button>
      </div>
    </article>
  )
}

export const TaskCard = memo(TaskCardInner)
