import { useEffect, useMemo, useState } from 'react'
import { useAnnotations } from '../../hooks/useAnnotations'
import { annotationService } from '../../services/annotationService'
import type {
  AnnotationMetadataUpdate,
  Review,
  ReviewAnnotation,
} from '../../types/annotation'
import { AnnotationSidebar } from './AnnotationSidebar'
import { ArtworkAnnotator } from './ArtworkAnnotator'
import './annotations.css'

const filterValues = {
  priority: ['all', 'low', 'medium', 'high'] as const,
  category: ['all', 'design', 'typography', 'spacing', 'color', 'content', 'other'] as const,
  status: ['all', 'open', 'in_progress', 'resolved', 'rejected'] as const,
}

function displayLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function AnnotationReviewPanel({
  projectId,
  imageUrl,
}: {
  projectId: string
  imageUrl: string | null
}) {
  const [review, setReview] = useState<Review | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<(typeof filterValues.priority)[number]>('all')
  const [categoryFilter, setCategoryFilter] = useState<(typeof filterValues.category)[number]>('all')
  const [statusFilter, setStatusFilter] = useState<(typeof filterValues.status)[number]>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const annotationState = useAnnotations()
  const { replaceAnnotations } = annotationState

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    annotationService.loadDesignerReview(projectId)
      .then((loaded) => {
        if (!active) return
        setReview(loaded)
        replaceAnnotations(loaded?.annotations || [])
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load review annotations.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [projectId, replaceAnnotations])

  const visibleAnnotations = useMemo(() => annotationState.annotations.filter((annotation) => {
    if (priorityFilter !== 'all' && annotation.priority !== priorityFilter) return false
    if (categoryFilter !== 'all' && annotation.category !== categoryFilter) return false
    if (statusFilter !== 'all' && annotation.status !== statusFilter) return false
    return true
  }), [annotationState.annotations, categoryFilter, priorityFilter, statusFilter])

  const saveAnnotation = async (annotation: ReviewAnnotation, fields: AnnotationMetadataUpdate) => {
    if (!review) return
    setBusyId(annotation.id)
    try {
      const updated = await annotationService.updateDesignerAnnotation(review.id, annotation.id, fields)
      annotationState.updateAnnotation(updated)
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update annotation.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <div className="annotation-review-state">Loading review annotations…</div>
  if (error && !review) return <div className="annotation-review-state annotation-review-state--error">{error}</div>
  if (!review) {
    return (
      <div className="annotation-review-state">
        <strong>No client review yet.</strong>
        <span>Send the project to the client to create a tokenized artwork review session.</span>
      </div>
    )
  }

  return (
    <section className="annotation-review-panel" aria-label="Designer annotation review">
      <header className="annotation-review-panel__header">
        <div>
          <span className="projects-eyebrow">Designer review</span>
          <h2>{review.projectName} annotations</h2>
          <p>{review.clientName} · {review.status === 'submitted' ? 'Client feedback submitted' : displayLabel(review.status)}</p>
        </div>
        <div className="annotation-review-panel__summary">
          <span className={`annotation-status annotation-status--${review.status}`}>{displayLabel(review.status)}</span>
          <span>{annotationState.annotations.length} total</span>
        </div>
      </header>
      {error && <p className="annotation-review-error" role="alert">{error}</p>}
      <div className="annotation-filter-bar" aria-label="Filter annotations">
        <label>Priority<select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as typeof priorityFilter)}>{filterValues.priority.map((value) => <option key={value} value={value}>{displayLabel(value)}</option>)}</select></label>
        <label>Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as typeof categoryFilter)}>{filterValues.category.map((value) => <option key={value} value={value}>{displayLabel(value)}</option>)}</select></label>
        <label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>{filterValues.status.map((value) => <option key={value} value={value}>{displayLabel(value)}</option>)}</select></label>
        {busyId && <span className="annotation-saving">Saving annotation…</span>}
      </div>
      <div className="annotation-review-panel__body">
        {review.artwork && imageUrl ? (
          <ArtworkAnnotator
            artworkUrl={imageUrl}
            artworkName={review.artwork.name}
            annotations={visibleAnnotations}
            selectedId={selectedId}
            readOnly
            onSelect={setSelectedId}
          />
        ) : (
          <div className="annotation-review-state"><strong>No image artwork is attached.</strong><span>Attach a PNG, JPG, GIF, WEBP, or SVG file before sending an artwork review.</span></div>
        )}
        <AnnotationSidebar
          annotations={visibleAnnotations}
          selectedId={selectedId}
          canEditMetadata={false}
          canEditStatus
          canDelete={false}
          onSelect={setSelectedId}
          onSave={(annotation, fields) => void saveAnnotation(annotation, fields)}
          onDelete={() => undefined}
        />
      </div>
    </section>
  )
}
