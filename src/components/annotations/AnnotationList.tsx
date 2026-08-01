import type { AnnotationMetadataUpdate, ReviewAnnotation } from '../../types/annotation'
import { AnnotationComment } from './AnnotationComment'

export function AnnotationList({
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
    <div className="annotation-list">
      {annotations.map((annotation, index) => (
        <article
          key={annotation.id}
          className={`annotation-card${selectedId === annotation.id ? ' is-selected' : ''}`}
        >
          <button type="button" className="annotation-card__heading" onClick={() => onSelect(annotation.id)}>
            <span className="annotation-card__number">{index + 1}</span>
            <span>
              <strong>{annotation.comment || 'Needs a comment'}</strong>
              <small>{new Date(annotation.createdAt).toLocaleString()}</small>
            </span>
            <em className={`annotation-badge annotation-badge--${annotation.priority}`}>{annotation.priority}</em>
          </button>
          <AnnotationComment
            annotation={annotation}
            canEditMetadata={canEditMetadata}
            canEditStatus={canEditStatus}
            canDelete={canDelete}
            onSave={(fields) => onSave(annotation, fields)}
            onDelete={() => onDelete(annotation)}
          />
        </article>
      ))}
      {annotations.length === 0 && (
        <div className="annotation-empty">No annotations match these filters.</div>
      )}
    </div>
  )
}
