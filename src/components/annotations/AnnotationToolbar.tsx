import type { DrawingTool } from '@annotorious/react'

type AnnotationToolbarProps = {
  tool: DrawingTool
  onToolChange: (tool: DrawingTool) => void
  readOnly: boolean
}

export function AnnotationToolbar({ tool, onToolChange, readOnly }: AnnotationToolbarProps) {
  return (
    <div className="annotation-toolbar" aria-label="Annotation tools">
      <span className="annotation-toolbar__label">Mark an area</span>
      <button
        type="button"
        className={tool === 'rectangle' ? 'is-active' : ''}
        onClick={() => onToolChange('rectangle')}
        disabled={readOnly}
        aria-pressed={tool === 'rectangle'}
      >
        Rectangle
      </button>
      <button
        type="button"
        className={tool === 'polygon' ? 'is-active' : ''}
        onClick={() => onToolChange('polygon')}
        disabled={readOnly}
        aria-pressed={tool === 'polygon'}
      >
        Polygon
      </button>
      {readOnly && <span className="annotation-toolbar__locked">Read-only</span>}
    </div>
  )
}
