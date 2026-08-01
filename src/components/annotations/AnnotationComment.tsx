import { useEffect, useState } from 'react'
import type {
  AnnotationCategory,
  AnnotationMetadataUpdate,
  AnnotationPriority,
  AnnotationStatus,
  ReviewAnnotation,
} from '../../types/annotation'

const priorities: AnnotationPriority[] = ['low', 'medium', 'high']
const categories: AnnotationCategory[] = [
  'design',
  'typography',
  'spacing',
  'color',
  'content',
  'other',
]
const statuses: AnnotationStatus[] = ['open', 'in_progress', 'resolved', 'rejected']

function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function AnnotationComment({
  annotation,
  canEditMetadata,
  canEditStatus,
  canDelete,
  onSave,
  onDelete,
}: {
  annotation: ReviewAnnotation
  canEditMetadata: boolean
  canEditStatus: boolean
  canDelete: boolean
  onSave: (fields: AnnotationMetadataUpdate) => void
  onDelete: () => void
}) {
  const [comment, setComment] = useState(annotation.comment)
  const [priority, setPriority] = useState(annotation.priority)
  const [category, setCategory] = useState(annotation.category)
  const [status, setStatus] = useState(annotation.status)

  useEffect(() => {
    setComment(annotation.comment)
    setPriority(annotation.priority)
    setCategory(annotation.category)
    setStatus(annotation.status)
  }, [annotation])

  return (
    <div className="annotation-comment">
      <label>
        <span>Comment</span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Describe what should change…"
          maxLength={2000}
          disabled={!canEditMetadata}
          required
        />
      </label>
      <div className="annotation-comment__fields">
        <label>
          <span>Priority</span>
          <select value={priority} onChange={(event) => setPriority(event.target.value as AnnotationPriority)} disabled={!canEditMetadata}>
            {priorities.map((item) => <option key={item} value={item}>{label(item)}</option>)}
          </select>
        </label>
        <label>
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as AnnotationCategory)} disabled={!canEditMetadata}>
            {categories.map((item) => <option key={item} value={item}>{label(item)}</option>)}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as AnnotationStatus)} disabled={!canEditStatus}>
            {statuses.map((item) => <option key={item} value={item}>{label(item)}</option>)}
          </select>
        </label>
      </div>
      <div className="annotation-comment__actions">
        {(canEditMetadata || canEditStatus) && (
          <button
            type="button"
            className="button button--primary button--small"
            onClick={() => onSave({ comment, priority, category, status })}
          >
            Save annotation
          </button>
        )}
        {canDelete && (
          <button type="button" className="text-button text-button--danger" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
