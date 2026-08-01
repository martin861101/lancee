import type {
  AnnotationMetadataUpdate,
  Review,
  ReviewAnnotation,
} from '../types/annotation'
import type { ImageAnnotation } from '@annotorious/react'

type ReviewPayload = {
  review?: Review
  annotations?: ReviewAnnotation[]
  error?: string
}

type AnnotationPayload = {
  annotation?: ReviewAnnotation
  error?: string
}

async function readPayload<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to update the review.')
  }
  return payload
}

function publicReviewPath(reviewId: string, token: string, suffix = '') {
  const query = `?token=${encodeURIComponent(token)}`
  return `/api/public/reviews/${encodeURIComponent(reviewId)}${suffix}${query}`
}

async function publicRequest<T>(
  reviewId: string,
  token: string,
  init: RequestInit = {},
  suffix = '',
) {
  const response = await fetch(publicReviewPath(reviewId, token, suffix), {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  return readPayload<T>(response)
}

export const annotationService = {
  // TODO: Keep this service boundary when the review API is split into its own service.
  async createReview(projectId: string, input: { title?: string; body?: string } = {}) {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/approvals`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    return readPayload<{ approval: { reviewUrl?: string }; review?: Review }>(response)
  },

  async getReview(reviewId: string, token: string) {
    const payload = await publicRequest<ReviewPayload>(reviewId, token)
    if (!payload.review) throw new Error('Review not found or expired.')
    return payload.review
  },

  async loadAnnotations(reviewId: string, token: string) {
    const review = await this.getReview(reviewId, token)
    return review.annotations
  },

  async saveAnnotations(reviewId: string, token: string, annotations: ReviewAnnotation[]) {
    const saved = [] as ReviewAnnotation[]
    for (const annotation of annotations) {
      const payload = await publicRequest<AnnotationPayload>(reviewId, token, {
        method: 'POST',
        body: JSON.stringify({
          annotation: annotation.annotation,
          comment: annotation.comment,
          priority: annotation.priority,
          category: annotation.category,
          status: annotation.status,
        }),
      }, '/annotations')
      if (payload.annotation) saved.push(payload.annotation)
    }
    return saved
  },

  async createAnnotation(
    reviewId: string,
    token: string,
    annotation: ImageAnnotation,
    metadata: AnnotationMetadataUpdate = {},
  ) {
    const payload = await publicRequest<AnnotationPayload>(reviewId, token, {
      method: 'POST',
      body: JSON.stringify({ annotation, ...metadata }),
    }, '/annotations')
    if (!payload.annotation) throw new Error('The annotation could not be saved.')
    return payload.annotation
  },

  async updateAnnotation(
    reviewId: string,
    token: string,
    annotationId: string,
    fields: AnnotationMetadataUpdate & { annotation?: ImageAnnotation },
  ) {
    const payload = await publicRequest<AnnotationPayload>(reviewId, token, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    }, `/annotations/${encodeURIComponent(annotationId)}`)
    if (!payload.annotation) throw new Error('The annotation could not be updated.')
    return payload.annotation
  },

  async deleteAnnotation(reviewId: string, token: string, annotationId: string) {
    await publicRequest<{ ok: true }>(reviewId, token, {
      method: 'DELETE',
    }, `/annotations/${encodeURIComponent(annotationId)}`)
  },

  async submitReview(reviewId: string, token: string) {
    const payload = await publicRequest<ReviewPayload>(reviewId, token, {
      method: 'POST',
      body: JSON.stringify({}),
    }, '/submit')
    if (!payload.review) throw new Error('The review could not be submitted.')
    return payload.review
  },

  async approveReview(reviewId: string, token: string) {
    const payload = await publicRequest<ReviewPayload>(reviewId, token, {
      method: 'POST',
      body: JSON.stringify({}),
    }, '/approve')
    if (!payload.review) throw new Error('The work could not be approved.')
    return payload.review
  },

  async loadDesignerReview(projectId: string) {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/reviews`, {
      credentials: 'same-origin',
    })
    const payload = await readPayload<ReviewPayload>(response)
    return payload.review || null
  },

  async updateDesignerAnnotation(
    reviewId: string,
    annotationId: string,
    fields: AnnotationMetadataUpdate,
  ) {
    const response = await fetch(
      `/api/reviews/${encodeURIComponent(reviewId)}/annotations/${encodeURIComponent(annotationId)}`,
      {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      },
    )
    const payload = await readPayload<AnnotationPayload>(response)
    if (!payload.annotation) throw new Error('The annotation could not be updated.')
    return payload.annotation
  },

  async closeReview(reviewId: string) {
    const response = await fetch(`/api/reviews/${encodeURIComponent(reviewId)}/close`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const payload = await readPayload<ReviewPayload>(response)
    if (!payload.review) throw new Error('The review could not be closed.')
    return payload.review
  },
}
