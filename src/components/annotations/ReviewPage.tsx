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
  const [busyItemId, setBusyItemId] = useState<string | null>(null)
  const [itemComments, setItemComments] = useState<Record<string, string>>({})
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
    if (review?.packageItems.some((item) => item.status === 'waiting')) {
      setError('Approve or request changes for every item before submitting the review package.')
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

  const respondToItem = async (itemId: string, status: 'approved' | 'needs_changes') => {
    if (!editable) return
    const comment = (itemComments[itemId] || '').trim()
    if (status === 'needs_changes' && !comment) {
      setError('Add a comment describing the changes you need.')
      return
    }
    setBusyItemId(itemId)
    try {
      const item = await annotationService.respondToItem(reviewId, token, itemId, { status, comment })
      setReview((current) => current
        ? { ...current, packageItems: current.packageItems.map((candidate) => candidate.id === item.id ? item : candidate) }
        : current)
      setItemComments((current) => ({ ...current, [itemId]: '' }))
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this response.')
    } finally {
      setBusyItemId(null)
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
          <span className="review-page__eyebrow">Client review package</span>
          <h1>{review.projectName}</h1>
          <p>{review.clientName} · {review.packageItems.length} deliverable{review.packageItems.length === 1 ? '' : 's'}</p>
        </div>
        <span className={`annotation-status annotation-status--${review.status}`}>{review.status === 'open' ? 'Your feedback is open' : review.status === 'submitted' ? 'Review submitted' : 'Review closed'}</span>
      </header>
      <section className="review-page__intro">
        <h2>{review.title}</h2>
        <p>{review.body || 'Review each deliverable, approve it or request changes, then submit the package once.'}</p>
        {review.dueAt && <small>Requested by {new Date(review.dueAt).toLocaleDateString()}</small>}
      </section>
      {error && <p className="annotation-review-error" role="alert">{error}</p>}
      {review.packageItems.length > 0 && (
        <section className="client-review-items" aria-label="Review package deliverables">
          {review.packageItems.map((item) => (
            <article key={item.id} className={`client-review-item client-review-item--${item.status}`}>
              <header>
                <div><span>Deliverable</span><h2>{item.title}</h2></div>
                <span className={`review-state review-state--${item.status}`}>{item.status === 'waiting' ? 'Waiting for review' : item.status === 'needs_changes' ? 'Needs changes' : 'Approved'}</span>
              </header>
              {item.preview?.imageUrl && <img src={item.preview.imageUrl} alt={`${item.title} preview`} />}
              {item.comments.length > 0 && (
                <div className="client-review-item__comments">
                  {item.comments.map((comment) => <blockquote key={comment.id}><p>{comment.body}</p><small>{comment.authorName} · {new Date(comment.createdAt).toLocaleDateString()}</small></blockquote>)}
                </div>
              )}
              {editable && (
                <div className="client-review-item__response">
                  <textarea
                    value={itemComments[item.id] || ''}
                    onChange={(event) => setItemComments((current) => ({ ...current, [item.id]: event.target.value }))}
                    placeholder="Add a comment…"
                    rows={3}
                    maxLength={2_000}
                  />
                  <div>
                    <button type="button" className="button button--secondary" onClick={() => void respondToItem(item.id, 'needs_changes')} disabled={busyItemId === item.id}>Request changes</button>
                    <button type="button" className="button button--primary" onClick={() => void respondToItem(item.id, 'approved')} disabled={busyItemId === item.id}>{busyItemId === item.id ? 'Saving…' : 'Approve'}</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
      {review.artwork && (
        <section className="review-page__annotation-intro"><h2>Focused artwork notes</h2><p>Draw on the artwork when a visual note is more useful than a general comment.</p></section>
      )}
      <div className={`review-page__body${review.artwork ? '' : ' review-page__body--empty'}`}>
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
        ) : null}
        {review.artwork && <AnnotationSidebar
            annotations={annotationState.annotations}
            selectedId={selectedId}
            canEditMetadata={editable}
            canEditStatus={false}
            canDelete={editable}
            onSelect={setSelectedId}
            onSave={(annotation, fields) => void saveMetadata(annotation.id, fields)}
            onDelete={(annotation) => void deleteAnnotation(annotation.id)}
          />}
      </div>
      <footer className="review-page__footer">
        <div>
          <strong>{review.packageItems.filter((item) => item.status !== 'waiting').length} of {review.packageItems.length} reviewed</strong>
          <span>{review.status === 'open' ? 'Responses remain editable until submission.' : 'This review package is now read-only.'}</span>
        </div>
        <div className="review-page__actions">
          {review.status === 'open' && <button type="button" className="button button--primary" onClick={() => void submitReview()} disabled={busy}>{busy ? 'Saving…' : 'Submit review'}</button>}
          {review.status !== 'closed' && <button type="button" className="button button--secondary" onClick={() => void approveWork()} disabled={busy}>Approve work</button>}
        </div>
      </footer>
    </main>
  )
}
