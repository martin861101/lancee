import { useEffect, useState } from 'react'
import type { ImageAnnotation } from '@annotorious/react'
import { useAnnotations } from '../../hooks/useAnnotations'
import { annotationService } from '../../services/annotationService'
import type { AnnotationMetadataUpdate, Review } from '../../types/annotation'
import { AnnotationSidebar } from './AnnotationSidebar'
import { ArtworkAnnotator } from './ArtworkAnnotator'
import './annotations.css'

export default function ReviewPage({ reviewId, token }: { reviewId: string; token: string }) {
  const [review, setReview] = useState<Review | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const annotationState = useAnnotations()
  const { replaceAnnotations } = annotationState

  useEffect(() => {
    let active = true
    annotationService.getReview(reviewId, token)
      .then((loaded) => {
        if (!active) return
        setReview(loaded)
        replaceAnnotations(loaded.annotations)
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'This review link is no longer available.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [replaceAnnotations, reviewId, token])

  const editable = review?.status === 'open'

  const saveMetadata = async (annotationId: string, fields: AnnotationMetadataUpdate) => {
    if (!editable) return
    setBusy(true)
    try {
      const updated = await annotationService.updateAnnotation(reviewId, token, annotationId, fields)
      annotationState.updateAnnotation(updated)
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save annotation.')
    } finally {
      setBusy(false)
    }
  }

  const createAnnotation = async (annotation: ImageAnnotation) => {
    if (!editable) return
    setBusy(true)
    try {
      const saved = await annotationService.createAnnotation(reviewId, token, annotation)
      annotationState.addAnnotation(saved)
      setSelectedId(saved.id)
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the new annotation.')
    } finally {
      setBusy(false)
    }
  }

  const updateGeometry = async (annotation: ImageAnnotation) => {
    if (!editable || !annotationState.annotations.some((item) => item.id === annotation.id)) return
    try {
      const updated = await annotationService.updateAnnotation(reviewId, token, annotation.id, { annotation })
      annotationState.updateAnnotation(updated)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the annotation shape.')
    }
  }

  const deleteAnnotation = async (annotationId: string) => {
    if (!editable) return
    setBusy(true)
    try {
      await annotationService.deleteAnnotation(reviewId, token, annotationId)
      annotationState.removeAnnotation(annotationId)
      setSelectedId(null)
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete annotation.')
    } finally {
      setBusy(false)
    }
  }

  const submitReview = async () => {
    if (!editable) return
    const missingComment = annotationState.annotations.find((annotation) => !annotation.comment.trim())
    if (missingComment) {
      setSelectedId(missingComment.id)
      setError('Every annotation needs a comment before you submit the review.')
      return
    }
    setBusy(true)
    try {
      const submitted = await annotationService.submitReview(reviewId, token)
      setReview(submitted)
      annotationState.replaceAnnotations(submitted.annotations)
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit the review.')
    } finally {
      setBusy(false)
    }
  }

  const approveWork = async () => {
    if (!review || review.status === 'closed') return
    setBusy(true)
    try {
      const approved = await annotationService.approveReview(reviewId, token)
      setReview(approved)
      annotationState.replaceAnnotations(approved.annotations)
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to approve the work.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <main className="review-page review-page--state"><span className="spinner" /><p>Loading your review…</p></main>
  if (!review) return <main className="review-page review-page--state"><h1>Review unavailable</h1><p>{error || 'This review link has expired or is invalid.'}</p></main>

  return (
    <main className="review-page">
      <header className="review-page__header">
        <div>
          <span className="review-page__eyebrow">Client artwork review</span>
          <h1>{review.projectName}</h1>
          <p>{review.clientName} · {review.artwork?.name || 'No artwork selected'}</p>
        </div>
        <span className={`annotation-status annotation-status--${review.status}`}>{review.status === 'open' ? 'Your feedback is open' : review.status === 'submitted' ? 'Review submitted' : 'Review closed'}</span>
      </header>
      <section className="review-page__intro">
        <h2>Review the artwork</h2>
        <p>Click an area to select it, or draw a rectangle or polygon to leave focused feedback. Add a comment to every note before submitting.</p>
      </section>
      {error && <p className="annotation-review-error" role="alert">{error}</p>}
      <div className="review-page__body">
        {review.artwork ? (
          <ArtworkAnnotator
            artworkUrl={review.artwork.imageUrl}
            artworkName={review.artwork.name}
            annotations={annotationState.annotations}
            selectedId={selectedId}
            readOnly={!editable}
            onSelect={setSelectedId}
            onCreate={(annotation) => void createAnnotation(annotation)}
            onUpdate={(annotation) => void updateGeometry(annotation)}
            onDelete={(annotationId) => void deleteAnnotation(annotationId)}
          />
        ) : (
          <div className="annotation-review-state"><strong>No artwork is available for this review.</strong></div>
        )}
        <AnnotationSidebar
          annotations={annotationState.annotations}
          selectedId={selectedId}
          canEditMetadata={editable}
          canEditStatus={false}
          canDelete={editable}
          onSelect={setSelectedId}
          onSave={(annotation, fields) => void saveMetadata(annotation.id, fields)}
          onDelete={(annotation) => void deleteAnnotation(annotation.id)}
        />
      </div>
      <footer className="review-page__footer">
        <div>
          <strong>{annotationState.annotations.length} annotation{annotationState.annotations.length === 1 ? '' : 's'}</strong>
          <span>{review.status === 'open' ? 'Your feedback remains editable until submission.' : 'This review is now read-only.'}</span>
        </div>
        <div className="review-page__actions">
          {review.status === 'open' && <button type="button" className="button button--primary" onClick={() => void submitReview()} disabled={busy}>{busy ? 'Saving…' : 'Submit review'}</button>}
          {review.status !== 'closed' && <button type="button" className="button button--secondary" onClick={() => void approveWork()} disabled={busy}>Approve work</button>}
        </div>
      </footer>
    </main>
  )
}
