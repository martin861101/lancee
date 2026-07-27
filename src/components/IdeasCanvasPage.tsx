import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createIdeaNote,
  IDEA_SYNC_EVENT,
  loadCachedIdeaBoard,
  loadIdeaBoard,
  syncIdeaMutations,
} from '../lib/ideasRepository'
import type { LocalIdeaNote } from '../lib/offlineStore'
import { IDEA_SYNC_REQUEST_EVENT } from '../pwa'
import { Stage, Layer, Group, Rect, Text, Image as KonvaImage, Circle, Star, Transformer } from 'react-konva'
import type Konva from 'konva'
import useImage from 'use-image'
import './ideas-canvas.css'

type Board = { id: string; label: string }

type CanvasElement = {
  id: string
  kind: string
  x: number
  y: number
  width: number
  height: number
  fill: string
  text?: string
  data: Record<string, unknown>
}

const BOARDS_KEY = (wid: string) => `lancee:boards:${wid}`
const ELEMENTS_KEY = (wid: string, bid: string) => `lancee:canvas-elements:${wid}:${bid}`

const COLORS = ['#f6d989', '#d9ddd1', '#f0b347', '#9fbdaf', '#e8d4bf', '#c8a9e8', '#a9cce8', '#f5b7b1']
const STICKY_COLOR = '#f6d989'

function elementId(): string {
  return `elem_${crypto.randomUUID()}`
}

function KonvaText({ text, ...rest }: { text: string; x: number; y: number; width: number; height: number } & Record<string, unknown>) {
  return (
    <Text
      text={text}
      fontFamily="system-ui, sans-serif"
      fontSize={13}
      fill="#3e433b"
      padding={6}
      {...rest}
    />
  )
}

function ElementGroup({ el, isSelected, onSelect, onChange, onDelete, onDblClick, children }: {
  el: CanvasElement
  isSelected: boolean
  onSelect: () => void
  onChange: (attrs: Partial<CanvasElement>) => void
  onDelete: () => void
  onDblClick: () => void
  children: React.ReactNode
}) {
  const shapeRef = useRef<Konva.Group>(null)
  const trRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current])
      trRef.current.getLayer()?.batchDraw()
    }
  }, [isSelected])

  return (
    <>
      <Group
        ref={shapeRef}
        id={el.id}
        x={el.x}
        y={el.y}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDblClick={onDblClick}
        onDblTap={onDblClick}
        onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const node = shapeRef.current
          if (node) {
            const scaleX = node.scaleX()
            const scaleY = node.scaleY()
            node.scaleX(1)
            node.scaleY(1)
            onChange({
              x: node.x(),
              y: node.y(),
              width: Math.max(30, node.width() * scaleX),
              height: Math.max(30, node.height() * scaleY),
            })
          }
        }}
      >
        {children}
        {isSelected && (
          <Rect
            x={el.width - 22}
            y={2}
            width={20}
            height={20}
            fill="#d14"
            cornerRadius={4}
            onClick={onDelete}
            onTap={onDelete}
          />
        )}
      </Group>
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) =>
            newBox.width < 30 || newBox.height < 30 ? oldBox : newBox
          }
        />
      )}
    </>
  )
}

function HtmlTextarea({ el, onSave, onCancel }: {
  el: CanvasElement
  onSave: (text: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(el.text || '')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  return (
    <div
      className="canvas-text-editor"
      style={{
        position: 'absolute',
        left: `${el.x + 6}px`,
        top: `${el.y + 6}px`,
        zIndex: 1000,
      }}
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onSave(value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(value)
        }}
        style={{
          width: `${el.width - 12}px`,
          minHeight: `${el.height - 12}px`,
          padding: '8px',
          fontSize: '13px',
          fontFamily: 'system-ui, sans-serif',
          border: '2px solid #6854e8',
          borderRadius: '8px',
          background: el.fill || '#fff',
          resize: 'both',
          outline: 'none',
        }}
      />
    </div>
  )
}

export default function IdeasCanvasPage({ workspaceId }: { workspaceId: string }) {
  const [boards, setBoards] = useState<Board[]>([])
  const [boardsLoaded, setBoardsLoaded] = useState(false)
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null)
  const [notes, setNotes] = useState<LocalIdeaNote[]>([])
  const [source, setSource] = useState<'loading' | 'network' | 'cache'>('loading')
  const [online, setOnline] = useState(() => navigator.onLine)
  const [error, setError] = useState('')
  const [showNewBoard, setShowNewBoard] = useState(false)
  const [newBoardLabel, setNewBoardLabel] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [elements, setElements] = useState<CanvasElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingEl, setEditingEl] = useState<CanvasElement | null>(null)
  const [tool, setTool] = useState<'select' | 'sticky' | 'shape' | 'text' | 'image' | 'link'>('select')
  const [stageScale, setStageScale] = useState(0.8)
  const stageRef = useRef<Konva.Stage>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const loadingBoards = useRef(false)

  useEffect(() => {
    if (loadingBoards.current) return
    loadingBoards.current = true
    const cached = localStorage.getItem(BOARDS_KEY(workspaceId))
    if (cached) {
      try {
        const parsed: Board[] = JSON.parse(cached)
        if (parsed.length) {
          setBoards(parsed)
          setActiveBoardId((prev) => prev || parsed[0].id)
        }
      } catch { /* ignore */ }
    }
    fetch('/api/ideas/boards', { credentials: 'same-origin' }).then(async (res) => {
      if (!res.ok) throw new Error('Failed')
      const payload = await res.json() as { boards?: Board[] }
      if (!payload.boards) throw new Error('No boards')
      setBoards(payload.boards)
      localStorage.setItem(BOARDS_KEY(workspaceId), JSON.stringify(payload.boards))
      setActiveBoardId((prev) => prev && payload.boards!.some((b) => b.id === prev) ? prev : payload.boards![0]?.id || prev)
    }).catch(() => {
      try {
        const fallback = localStorage.getItem(BOARDS_KEY(workspaceId))
        if (fallback) {
          const parsed: Board[] = JSON.parse(fallback)
          if (parsed.length) {
            setBoards(parsed)
            setActiveBoardId((prev) => prev || parsed[0].id)
          }
        }
      } catch { /* ignore */ }
    }).finally(() => {
      setBoardsLoaded(true)
      loadingBoards.current = false
    })
  }, [workspaceId])

  useEffect(() => {
    if (boards.length) localStorage.setItem(BOARDS_KEY(workspaceId), JSON.stringify(boards))
  }, [boards, workspaceId])

  useEffect(() => {
    if (!activeBoardId) return
    let active = true
    setError('')
    setNotes([])
    const cachedElements = localStorage.getItem(ELEMENTS_KEY(workspaceId, activeBoardId))
    if (cachedElements) {
      try { setElements(JSON.parse(cachedElements)) } catch { /* ignore */ }
    }
    void loadCachedIdeaBoard(workspaceId, activeBoardId)
      .then((cached) => { if (active && cached.length) setNotes(cached) })
      .then(() => loadIdeaBoard(workspaceId, activeBoardId))
      .then((result) => { if (!active) return; setNotes(result.notes); setSource(result.source) })
      .catch(() => { if (active) { setSource('cache'); setError('This board could not be read from offline storage.') } })
    const loadElements = async () => {
      try {
        const response = await fetch(`/api/ideas/elements?boardId=${encodeURIComponent(activeBoardId)}`, { credentials: 'same-origin' })
        if (!response.ok) return
        const payload = await response.json() as { elements?: any[] }
        if (!Array.isArray(payload.elements)) return
        const mapped: CanvasElement[] = payload.elements.map((el: any) => {
          const data = typeof el.dataJson === 'string' ? JSON.parse(el.dataJson) : (el.data || {})
          return {
            id: el.id,
            kind: el.kind,
            x: el.x,
            y: el.y,
            width: data.width || 200,
            height: data.height || 160,
            fill: data.fill || (el.kind === 'sticky' ? STICKY_COLOR : COLORS[Math.floor(Math.random() * COLORS.length)]),
            text: data.text || '',
            data,
          }
        })
        if (!active) return
        setElements(mapped)
        localStorage.setItem(ELEMENTS_KEY(workspaceId, activeBoardId), JSON.stringify(mapped))
      } catch { /* use cached */ }
    }
    void loadElements()
    return () => { active = false }
  }, [activeBoardId, workspaceId])

  const saveElementToServer = useCallback((el: CanvasElement) => {
    if (navigator.onLine && activeBoardId) {
      const data = { ...el.data, width: el.width, height: el.height, fill: el.fill, text: el.text }
      const method = el.id.startsWith('elem_') ? 'PUT' : 'POST'
      const url = method === 'PUT' ? `/api/ideas/elements/${encodeURIComponent(el.id)}` : '/api/ideas/elements'
      fetch(url, {
        method, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId: activeBoardId, id: el.id, kind: el.kind, x: el.x, y: el.y, data }),
      }).catch(() => undefined)
    }
  }, [activeBoardId])

  const updateElement = useCallback((id: string, attrs: Partial<CanvasElement>) => {
    setElements((current) => {
      const next = current.map((el) => (el.id === id ? { ...el, ...attrs } : el))
      const changed = next.find((el) => el.id === id)
      if (changed) saveElementToServer(changed)
      if (activeBoardId) localStorage.setItem(ELEMENTS_KEY(workspaceId, activeBoardId), JSON.stringify(next))
      return next
    })
  }, [activeBoardId, workspaceId, saveElementToServer])

  const addElement = useCallback((kind: string, x: number, y: number, extra: Partial<CanvasElement> = {}) => {
    const dims = kind === 'sticky' ? { width: 220, height: 160 } :
                 kind === 'shape' ? { width: 120, height: 120 } :
                 kind === 'image' ? { width: 240, height: 200 } :
                 { width: 200, height: 100 }
    const el: CanvasElement = {
      id: elementId(),
      kind,
      x, y,
      width: dims.width,
      height: dims.height,
      fill: kind === 'sticky' ? STICKY_COLOR : COLORS[Math.floor(Math.random() * COLORS.length)],
      text: kind === 'text' ? 'Double-click to edit' : '',
      data: extra.data || {},
      ...extra,
    }
    setElements((current) => {
      const next = [...current, el]
      if (activeBoardId) localStorage.setItem(ELEMENTS_KEY(workspaceId, activeBoardId), JSON.stringify(next))
      saveElementToServer(el)
      return next
    })
    setSelectedId(el.id)
    if (el.kind === 'text' || el.kind === 'sticky') setEditingEl(el)
  }, [activeBoardId, workspaceId, saveElementToServer])

  const deleteElement = useCallback((id: string) => {
    setElements((current) => {
      const next = current.filter((el) => el.id !== id)
      if (activeBoardId) localStorage.setItem(ELEMENTS_KEY(workspaceId, activeBoardId), JSON.stringify(next))
      return next
    })
    if (navigator.onLine) fetch(`/api/ideas/elements/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined)
    setSelectedId(null)
    setEditingEl(null)
  }, [activeBoardId, workspaceId])

  useEffect(() => {
    const refreshFromCache = () => { void loadCachedIdeaBoard(workspaceId, activeBoardId!).then(setNotes) }
    const handleOnline = () => { setOnline(true); void syncIdeaMutations(workspaceId) }
    const handleOffline = () => setOnline(false)
    const handleSync = (event: Event) => {
      const detail = (event as CustomEvent<{ workspaceId?: string }>).detail
      if (!detail?.workspaceId || detail.workspaceId === workspaceId) refreshFromCache()
    }
    const handleSyncRequest = () => { if (navigator.onLine) void syncIdeaMutations(workspaceId) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener(IDEA_SYNC_EVENT, handleSync)
    window.addEventListener(IDEA_SYNC_REQUEST_EVENT, handleSyncRequest)
    if (navigator.onLine) void syncIdeaMutations(workspaceId)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener(IDEA_SYNC_EVENT, handleSync)
      window.removeEventListener(IDEA_SYNC_REQUEST_EVENT, handleSyncRequest)
    }
  }, [activeBoardId, workspaceId])

  const addNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = quickNote.trim()
    if (!value || !activeBoardId) return
    setQuickNote('')
    setError('')
    try {
      const note = await createIdeaNote(workspaceId, activeBoardId, value)
      setNotes((current) => [...current.filter((item) => item.id !== note.id), note])
      addElement('sticky', 40 + (elements.length % 4) * 30, 300 + Math.floor(elements.length / 4) * 40, {
        text: value,
        data: { noteId: note.id },
      })
    } catch (caught) {
      setQuickNote(value)
      setError(caught instanceof Error ? caught.message : 'The idea could not be saved.')
    }
  }

  const addBoard = async () => {
    const label = newBoardLabel.trim()
    if (!label) return
    setNewBoardLabel('')
    setShowNewBoard(false)
    try {
      const response = await fetch('/api/ideas/boards', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      const payload = await response.json() as { board?: Board; error?: string }
      if (!response.ok || !payload.board) throw new Error(payload.error || 'Unable to create board.')
      setBoards((current) => {
        if (current.some((b) => b.id === payload.board!.id)) return current
        return [...current, payload.board!]
      })
      setActiveBoardId(payload.board.id)
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Board could not be created.') }
  }

  const deleteBoard = async (boardId: string) => {
    try {
      await fetch(`/api/ideas/boards/${encodeURIComponent(boardId)}`, { method: 'DELETE', credentials: 'same-origin' })
      setBoards((current) => current.filter((b) => b.id !== boardId))
      if (activeBoardId === boardId) setActiveBoardId(boards.find((b) => b.id !== boardId)?.id || null)
      localStorage.removeItem(ELEMENTS_KEY(workspaceId, boardId))
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Board could not be deleted.') }
  }

  const suggestWithAi = useCallback(async () => {
    if (notes.length < 2 || aiBusy) return
    setAiBusy(true)
    try {
      const noteContents = notes.map((n) => n.content)
      const response = await fetch('/api/ai/complete', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Group these creative ideas into meaningful clusters and suggest a creative direction:\n${noteContents.map((c, i) => `${i + 1}. ${c}`).join('\n')}` }],
          systemPrompt: 'You are a creative director helping organise design ideas. Return 2-3 groups as simple JSON with group names and member indices.',
        }),
      })
      const payload = await response.json() as { content?: string }
      if (payload.content) setError(`AI suggestion: ${payload.content.slice(0, 200)}…`)
      else setError('AI suggestion could not be generated.')
    } catch { setError('AI suggestion request failed.') }
    finally { setAiBusy(false) }
  }, [notes, aiBusy])

  const toggleShape = useCallback(() => {
    if (!selectedId) return
    const el = elements.find((e) => e.id === selectedId)
    if (!el || el.kind !== 'shape') return
    const isCircle = el.data?.shape === 'circle'
    updateElement(selectedId, { data: { ...el.data, shape: isCircle ? 'rect' : 'circle' } })
  }, [selectedId, elements, updateElement])

  const getPointerPos = () => {
    const stage = stageRef.current
    if (!stage) return null
    const pointer = stage.getPointerPosition()
    if (!pointer) return null
    return {
      x: (pointer.x - stage.x()) / stageScale,
      y: (pointer.y - stage.y()) / stageScale,
    }
  }

  const handleStageClick = useCallback((e: Konva.KonvaEventObject<any>) => {
    if (e.target === e.target.getStage()) { setSelectedId(null); return }
    const group = e.target.findAncestor('Group')
    if (group) { const id = group.id(); if (id) setSelectedId(id) }
  }, [])

  const handleStageDblClick = useCallback((e: Konva.KonvaEventObject<any>) => {
    const group = e.target.findAncestor('Group')
    if (group) {
      const el = elements.find((el) => el.id === group.id())
      if (el && (el.kind === 'text' || el.kind === 'sticky')) {
        setEditingEl(el)
      }
      return
    }
    const pos = getPointerPos()
    if (!pos) return
    if (tool === 'sticky') addElement('sticky', pos.x, pos.y, { text: 'New note' })
    else if (tool === 'shape') addElement('shape', pos.x, pos.y)
    else if (tool === 'text') addElement('text', pos.x, pos.y)
    else if (tool === 'image') {
      const url = prompt('Enter image URL:')
      if (url) addElement('image', pos.x, pos.y, { data: { src: url, width: 240, height: 200 }, width: 240, height: 200 })
    }
    else if (tool === 'link') {
      const url = prompt('Enter URL:')
      const label = prompt('Enter link label:')
      if (url) addElement('text', pos.x, pos.y, { text: label || url, data: { url, isLink: true }, fill: '#e8f0fe' })
    }
  }, [tool, stageScale, addElement, elements])

  const [quickNote, setQuickNote] = useState('')
  const activeBoard = boards.find((board) => board.id === activeBoardId)

  const handleWheel = useCallback((e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const oldScale = stageScale
    const pointer = stage.getPointerPosition()
    if (!pointer) return
    const newScale = e.evt.deltaY < 0 ? oldScale * 1.08 : oldScale / 1.08
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale }
    setStageScale(Math.max(0.3, Math.min(2, newScale)))
    stage.position({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale })
    stage.batchDraw()
  }, [stageScale])

  const selectedEl = elements.find((el) => el.id === selectedId)

  if (!boardsLoaded) return <div className="ideas-page"><p>Loading boards…</p></div>

  return (
    <div className="ideas-page">
      <header className="ideas-header">
        <div>
          <div className="ideas-breadcrumb">
            <span>Projects</span><span aria-hidden="true">/</span>
            <strong>{activeBoard?.label || 'Ideas canvas'}</strong>
          </div>
          <h1>Ideas canvas</h1>
        </div>
        <div className="ideas-header__actions">
          <div className="ideas-presence" aria-label="Board collaborators">
            <span className="ideas-avatar">ME</span>
          </div>
          <button className="ideas-share" type="button">Share canvas</button>
        </div>
      </header>

      <nav className="board-tabs" aria-label="Idea boards">
        {boards.map((board) => (
          <div className="board-tab-wrapper" key={board.id}>
            <button className={activeBoardId === board.id ? 'board-tab board-tab--active' : 'board-tab'} type="button" onClick={() => setActiveBoardId(board.id)} aria-current={activeBoardId === board.id ? 'page' : undefined}>{board.label}</button>
            <button className="board-tab-delete" type="button" aria-label={`Delete ${board.label}`} onClick={() => deleteBoard(board.id)}>×</button>
          </div>
        ))}
        {showNewBoard ? (
          <form className="board-tab board-tab--form" onSubmit={(e) => { e.preventDefault(); void addBoard() }}>
            <input value={newBoardLabel} onChange={(e) => setNewBoardLabel(e.target.value)} placeholder="Board name…" autoFocus onBlur={() => { if (!newBoardLabel.trim()) setShowNewBoard(false) }} />
          </form>
        ) : (
          <button className="board-tab board-tab--add" type="button" aria-label="Add a board" onClick={() => setShowNewBoard(true)}>＋</button>
        )}
      </nav>

      <div className={`ideas-sync-strip${online ? '' : ' is-offline'}`} role="status">
        <span aria-hidden="true" />
        {!online ? 'Offline · cached ideas remain available and changes will sync on reconnect'
          : notes.some((note) => note.syncState === 'conflict') ? 'A queued idea needs your conflict decision'
          : notes.some((note) => note.syncState === 'queued') ? 'Saving queued ideas…'
          : source === 'cache' ? 'Server unavailable · showing the last cached board'
          : 'Ideas are synced'}
      </div>

      <section className="ideas-workspace" ref={containerRef}>
        <div className="canvas-toolbar" aria-label="Canvas tools">
          <button type="button" aria-label="Select" className={tool === 'select' ? 'tool-button tool-button--active' : 'tool-button'} onClick={() => setTool('select')}>↖</button>
          <button type="button" aria-label="Sticky note" className={tool === 'sticky' ? 'tool-button tool-button--active' : 'tool-button'} onClick={() => setTool('sticky')}>📝</button>
          <button type="button" aria-label="Shape" className={tool === 'shape' ? 'tool-button tool-button--active' : 'tool-button'} onClick={() => setTool('shape')}>◇</button>
          <button type="button" aria-label="Text" className={tool === 'text' ? 'tool-button tool-button--active' : 'tool-button'} onClick={() => setTool('text')}>T</button>
          <button type="button" aria-label="Image" className={tool === 'image' ? 'tool-button tool-button--active' : 'tool-button'} onClick={() => setTool('image')}>🖼</button>
          <button type="button" aria-label="Link" className={tool === 'link' ? 'tool-button tool-button--active' : 'tool-button'} onClick={() => setTool('link')}>🔗</button>
          <span className="tool-divider" />
          <button type="button" aria-label="Zoom out" onClick={() => setStageScale((s) => Math.max(0.3, s - 0.1))}>−</button>
          <output aria-label="Current zoom">{Math.round(stageScale * 100)}%</output>
          <button type="button" aria-label="Zoom in" onClick={() => setStageScale((s) => Math.min(2, s + 0.1))}>＋</button>
          <button type="button" aria-label="Fit canvas" onClick={() => { setStageScale(0.8); stageRef.current?.position({ x: 0, y: 0 }); stageRef.current?.batchDraw() }}>⌗</button>
          <span className="tool-divider" />
          {selectedEl?.kind === 'shape' && (
            <button type="button" aria-label="Toggle shape" onClick={toggleShape}>
              {selectedEl.data?.shape === 'circle' ? '▢' : '○'}
            </button>
          )}
          {selectedId && (
            <button type="button" aria-label="Delete element" onClick={() => deleteElement(selectedId)} style={{ color: '#d14' }}>✕</button>
          )}
        </div>

        <div className="konva-container" style={{ position: 'relative' }}>
          <Stage
            ref={stageRef}
            width={containerRef.current?.clientWidth || 1200}
            height={containerRef.current?.clientHeight ? containerRef.current.clientHeight - 60 : 700}
            scaleX={stageScale}
            scaleY={stageScale}
            onWheel={handleWheel}
            onClick={handleStageClick}
            onTap={handleStageClick}
            onDblClick={handleStageDblClick}
            onDblTap={handleStageDblClick}
          >
            <Layer>
              {elements.map((el) => {
                const isSelected = selectedId === el.id
                const onSelect = () => setSelectedId(el.id)
                const onChange = (attrs: Partial<CanvasElement>) => updateElement(el.id, attrs)
                const onDelete = () => deleteElement(el.id)
                const onDblClick = () => {
                  if (el.kind === 'text' || el.kind === 'sticky') setEditingEl(el)
                  else if (el.kind === 'image') {
                    const url = prompt('Change image URL:', (el.data?.src as string) || '')
                    if (url) updateElement(el.id, { data: { ...el.data, src: url } })
                  }
                  else if (el.kind === 'link' || el.data?.isLink) {
                    const url = prompt('Change URL:', (el.data?.url as string) || '')
                    if (url) updateElement(el.id, { data: { ...el.data, url } })
                  }
                }

                if (el.kind === 'shape') {
                  return (
                    <ElementGroup key={el.id} el={el} isSelected={isSelected} onSelect={onSelect} onChange={onChange} onDelete={onDelete} onDblClick={onDblClick}>
                      {el.data?.shape === 'circle' ? (
                        <Circle radius={Math.min(el.width, el.height) / 2} fill={el.fill} stroke={isSelected ? '#6854e8' : 'transparent'} strokeWidth={isSelected ? 2 : 0} />
                      ) : el.data?.shape === 'star' ? (
                        <Star numPoints={5} innerRadius={el.width * 0.3} outerRadius={el.width * 0.5} fill={el.fill} stroke={isSelected ? '#6854e8' : 'transparent'} strokeWidth={isSelected ? 2 : 0} />
                      ) : (
                        <Rect width={el.width} height={el.height} fill={el.fill} cornerRadius={4} stroke={isSelected ? '#6854e8' : 'transparent'} strokeWidth={isSelected ? 2 : 0} />
                      )}
                    </ElementGroup>
                  )
                }

                if (el.kind === 'image') {
                  return <ImageElement key={el.id} el={el} isSelected={isSelected} onSelect={onSelect} onChange={onChange} onDelete={onDelete} onDblClick={onDblClick} />
                }

                if (el.kind === 'sticky') {
                  return (
                    <ElementGroup key={el.id} el={el} isSelected={isSelected} onSelect={onSelect} onChange={onChange} onDelete={onDelete} onDblClick={onDblClick}>
                      <Rect width={el.width} height={el.height} fill={el.fill || STICKY_COLOR} stroke={isSelected ? '#6854e8' : 'transparent'} strokeWidth={isSelected ? 2 : 0} cornerRadius={8}
                        shadowColor="rgba(39,43,34,.12)" shadowBlur={12} shadowOffset={{ x: 0, y: 4 }} shadowOpacity={1} />
                      <KonvaText text={el.text || ''} width={el.width} height={el.height} x={0} y={0} />
                    </ElementGroup>
                  )
                }

                return (
                  <ElementGroup key={el.id} el={el} isSelected={isSelected} onSelect={onSelect} onChange={onChange} onDelete={onDelete} onDblClick={onDblClick}>
                    <Rect width={el.width} height={el.height} fill={el.fill || '#fff'} stroke={isSelected ? '#6854e8' : 'transparent'} strokeWidth={isSelected ? 2 : 0} cornerRadius={6} />
                    <KonvaText text={el.text || ''} width={el.width} height={el.height} x={0} y={0} />
                  </ElementGroup>
                )
              })}
            </Layer>
          </Stage>

          {editingEl && (
            <HtmlTextarea
              el={editingEl}
              onSave={(text) => {
                updateElement(editingEl.id, { text })
                setEditingEl(null)
              }}
              onCancel={() => setEditingEl(null)}
            />
          )}
        </div>

        <form className="quick-add" onSubmit={addNote}>
          <label className="sr-only" htmlFor="quick-note">Add an idea to this canvas</label>
          <span aria-hidden="true">＋</span>
          <input id="quick-note" value={quickNote} onChange={(event) => setQuickNote(event.target.value)} placeholder="Drop a thought on the canvas…" />
          <button type="submit">Add note</button>
        </form>

        {error && <p className="ideas-error" role="alert">{error}</p>}

        <aside className="ai-helper">
          <span aria-hidden="true">✦</span>
          <div><strong>Shape with AI</strong><small>Group loose notes or suggest a direction</small></div>
          <button type="button" onClick={suggestWithAi} disabled={aiBusy || notes.length < 2}>{aiBusy ? 'Thinking…' : 'Explore'}</button>
        </aside>
      </section>
    </div>
  )
}

function ImageElement({ el, isSelected, onSelect, onChange, onDelete, onDblClick }: {
  el: CanvasElement; isSelected: boolean; onSelect: () => void
  onChange: (attrs: Partial<CanvasElement>) => void; onDelete: () => void; onDblClick: () => void
}) {
  const [image] = useImage((el.data?.src as string) || '')
  return (
    <ElementGroup el={el} isSelected={isSelected} onSelect={onSelect} onChange={onChange} onDelete={onDelete} onDblClick={onDblClick}>
      {image ? (
        <KonvaImage image={image} width={el.width} height={el.height} stroke={isSelected ? '#6854e8' : 'transparent'} strokeWidth={isSelected ? 2 : 0} cornerRadius={6} />
      ) : (
        <Rect width={el.width} height={el.height} fill="#e5e7df" stroke={isSelected ? '#6854e8' : '#c8cbc2'} strokeWidth={isSelected ? 2 : 1} cornerRadius={6} dash={[6, 4]} />
      )}
      {!image && <KonvaText text="Double-click to set URL" width={el.width} height={el.height} x={0} y={0} />}
    </ElementGroup>
  )
}
