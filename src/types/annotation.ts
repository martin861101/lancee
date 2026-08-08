import type { ImageAnnotation } from '@annotorious/react'
import type { ReviewPackageItem } from '../lib/api'

export type ReviewStatus = 'open' | 'submitted' | 'closed'
export type AnnotationPriority = 'low' | 'medium' | 'high'
export type AnnotationCategory =
  | 'design'
  | 'typography'
  | 'spacing'
  | 'color'
  | 'content'
  | 'other'
export type AnnotationStatus = 'open' | 'in_progress' | 'resolved' | 'rejected'

export type ReviewAnnotation = {
  id: string
  artworkId: string
  reviewId: string
  annotation: ImageAnnotation
  geometry: ImageAnnotation['target']['selector']
  comment: string
  priority: AnnotationPriority
  category: AnnotationCategory
  status: AnnotationStatus
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type ReviewArtwork = {
  id: string
  name: string
  mimeType: string
  size: number
  imageUrl: string
}

export type Review = {
  id: string
  projectId: string
  projectName: string
  clientName: string
  clientEmail: string
  approvalId: string
  title: string
  body: string
  dueAt: string | null
  artworkId: string | null
  artworkVersionId: string | null
  artwork: ReviewArtwork | null
  status: ReviewStatus
  expiresAt: string
  createdAt: string
  submittedAt: string | null
  closedAt: string | null
  annotations: ReviewAnnotation[]
  packageItems: ReviewPackageItem[]
}

export type AnnotationMetadataUpdate = Partial<
  Pick<ReviewAnnotation, 'comment' | 'priority' | 'category' | 'status'>
>
