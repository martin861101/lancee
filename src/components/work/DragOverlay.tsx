import type { Project } from '../../lib/api'

export default function DragOverlayCard({ project }: { project: Project }) {
  return (
    <div className="task-card task-card--dragging">
      <span className="task-card__swatch" style={{ background: project.accent }} aria-hidden="true" />
      <div className="task-card__body">
        <strong>{project.name}</strong>
        <span>{project.client}</span>
      </div>
    </div>
  )
}
