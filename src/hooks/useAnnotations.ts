import { useCallback, useState } from 'react'
import type { ReviewAnnotation } from '../types/annotation'

export function useAnnotations(initial: ReviewAnnotation[] = []) {
  const [annotations, setAnnotations] = useState<ReviewAnnotation[]>(initial)

  const replaceAnnotations = useCallback((next: ReviewAnnotation[]) => {
    setAnnotations(next)
  }, [])

  const addAnnotation = useCallback((annotation: ReviewAnnotation) => {
    setAnnotations((current) => [
      ...current.filter((item) => item.id !== annotation.id),
      annotation,
    ])
  }, [])

  const updateAnnotation = useCallback((annotation: ReviewAnnotation) => {
    setAnnotations((current) =>
      current.map((item) => (item.id === annotation.id ? annotation : item)),
    )
  }, [])

  const removeAnnotation = useCallback((annotationId: string) => {
    setAnnotations((current) => current.filter((item) => item.id !== annotationId))
  }, [])

  return {
    annotations,
    replaceAnnotations,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
  }
}
