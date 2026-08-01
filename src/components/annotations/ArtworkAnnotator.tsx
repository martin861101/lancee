import {
  Annotorious,
  ImageAnnotator,
  UserSelectAction,
  useAnnotations as useAnnotoriousAnnotations,
  useAnnotator,
  type AnnotationState,
  type AnnotoriousImageAnnotator,
  type DrawingTool,
  type ImageAnnotation,
} from '@annotorious/react'
import { useCallback, useEffect, useState } from 'react'
import { AnnotationToolbar } from './AnnotationToolbar'
import type { ReviewAnnotation } from '../../types/annotation'
import './annotations.css'
import '@annotorious/react/annotorious-react.css'

type ArtworkAnnotatorProps = {
  artworkUrl: string
  artworkName: string
  annotations: ReviewAnnotation[]
  selectedId: string | null
  readOnly: boolean
  onSelect: (annotationId: string | null) => void
  onCreate?: (annotation: ImageAnnotation) => void
  onUpdate?: (annotation: ImageAnnotation) => void
  onDelete?: (annotationId: string) => void
}

function AnnotationCanvas({
  artworkUrl,
  artworkName,
  annotations,
  selectedId,
  readOnly,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
}: ArtworkAnnotatorProps) {
  const annotator = useAnnotator<AnnotoriousImageAnnotator>()
  const liveAnnotations = useAnnotoriousAnnotations<ImageAnnotation>(100)
  const [tool, setTool] = useState<DrawingTool>('rectangle')

  useEffect(() => {
    if (!annotator) return
    annotator.setAnnotations(annotations.map((item) => item.annotation), true)
  }, [annotator, annotations])

  useEffect(() => {
    if (!annotator) return
    const handleCreate = (annotation: ImageAnnotation) => onCreate?.(annotation)
    const handleUpdate = (annotation: ImageAnnotation) => onUpdate?.(annotation)
    const handleDelete = (annotation: ImageAnnotation) => onDelete?.(annotation.id)
    const handleSelection = (selected: ImageAnnotation[]) => {
      onSelect(selected[0]?.id || null)
    }
    annotator.on('createAnnotation', handleCreate)
    annotator.on('updateAnnotation', handleUpdate)
    annotator.on('deleteAnnotation', handleDelete)
    annotator.on('selectionChanged', handleSelection)
    return () => {
      annotator.off('createAnnotation', handleCreate)
      annotator.off('updateAnnotation', handleUpdate)
      annotator.off('deleteAnnotation', handleDelete)
      annotator.off('selectionChanged', handleSelection)
    }
  }, [annotator, onCreate, onDelete, onSelect, onUpdate])

  useEffect(() => {
    if (!annotator || !selectedId) return
    annotator.setSelected(selectedId, false)
  }, [annotator, selectedId])

  const style = useCallback((annotation: ImageAnnotation, state?: AnnotationState) => ({
    fill: annotation.id === selectedId ? '#f29d61' as const : '#8aa76c' as const,
    fillOpacity: annotation.id === selectedId ? 0.38 : state?.hovered ? 0.3 : 0.2,
    stroke: annotation.id === selectedId ? '#b85e2b' as const : '#466f3a' as const,
    strokeOpacity: 0.95,
    strokeWidth: annotation.id === selectedId ? 3 : 2,
  }), [selectedId])

  return (
    <div className="annotation-canvas">
      <AnnotationToolbar tool={tool} onToolChange={setTool} readOnly={readOnly} />
      <div className="annotation-canvas__image">
        <ImageAnnotator
          key={artworkUrl}
          tool={tool}
          style={style}
          drawingEnabled={!readOnly}
          userSelectAction={readOnly ? UserSelectAction.SELECT : UserSelectAction.EDIT}
        >
          <img src={artworkUrl} alt={artworkName} />
        </ImageAnnotator>
      </div>
      <div className="annotation-canvas__meta">
        <span>{liveAnnotations.length} visible annotation{liveAnnotations.length === 1 ? '' : 's'}</span>
        <span>Click a mark to edit or inspect it</span>
      </div>
    </div>
  )
}

export function ArtworkAnnotator(props: ArtworkAnnotatorProps) {
  return (
    <Annotorious>
      <AnnotationCanvas {...props} />
    </Annotorious>
  )
}
