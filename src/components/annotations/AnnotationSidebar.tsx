import type { AnnotationMetadataUpdate, ReviewAnnotation } from '../../types/annotation'
import { AnnotationList } from './AnnotationList'

export function AnnotationSidebar({
  annotations,
  selectedId,
  canEditMetadata,
  canEditStatus,
  canDelete,
  onSelect,
  onSave,
  onDelete,
}: {
  annotations: ReviewAnnotation[]
  selectedId: string | null
  canEditMetadata: boolean
  canEditStatus: boolean
  canDelete: boolean
  onSelect: (annotationId: string) => void
  onSave: (annotation: ReviewAnnotation, fields: AnnotationMetadataUpdate) => void
  onDelete: (annotation: ReviewAnnotation) => void
}) {
  return (
    <aside className="annotation-sidebar" aria-label="Review annotations">
      <header className="annotation-sidebar__header">
        <div>
          <span className="micro-label">Feedback</span>
          <h2>Annotations</h2>
        </div>
        <span className="annotation-sidebar__count">{annotations.length}</span>
      </header>
      <p className="annotation-sidebar__hint">
        Select a note to highlight its area on the artwork.
      </p>
      <AnnotationList
        annotations={annotations}
        selectedId={selectedId}
        canEditMetadata={canEditMetadata}
        canEditStatus={canEditStatus}
        canDelete={canDelete}
        onSelect={onSelect}
        onSave={onSave}
        onDelete={onDelete}
      />
    </aside>
  )
}
