import { useSortable } from '@dnd-kit/react/sortable'
import { useDroppable } from '@dnd-kit/react'
import { TaskCard } from './TaskCard'
import { STATUS_LABELS, type ColumnId } from './types'
import type { Project } from '../../lib/api'

export default function BoardColumn({
  columnId,
  columnIndex,
  items,
  onDelete,
  onEdit,
}: {
  columnId: ColumnId
  columnIndex: number
  items: Project[]
  onDelete: (id: string) => void
  onEdit: (project: Project) => void
}) {
  const {
    ref: headerRef,
    isDragging: columnIsDragging,
  } = useSortable({
    id: columnId,
    index: columnIndex,
    type: 'column',
    accept: 'column',
  })

  const { ref: dropRef, isDropTarget } = useDroppable({
    id: `${columnId}__body`,
    data: { type: 'column-body', columnId },
  })

  return (
    <div className="board-column">
      <div ref={headerRef} className="board-column__header" style={{ opacity: columnIsDragging ? 0.5 : 1 }}>
        <h3>{STATUS_LABELS[columnId]}</h3>
        <span className="board-column__count">{items.length}</span>
      </div>
      <div
        ref={dropRef}
        className="board-column__tasks"
        style={{ outline: isDropTarget ? '2px dashed #6854e8' : undefined, outlineOffset: -2, borderRadius: 10 }}
      >
        {items.map((project, index) => (
          <TaskCard
            key={project.id}
            project={project}
            index={index}
            columnId={columnId}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        ))}
        {items.length === 0 && (
          <div className="board-column__empty">Drop tasks here</div>
        )}
      </div>
    </div>
  )
}
