import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Excalidraw,
  convertToExcalidrawElements,
  exportToBlob,
  getCommonBounds,
  loadLibraryFromBlob,
  newElementWith,
} from '@excalidraw/excalidraw'
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
  LibraryItem,
  LibraryItems,
} from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'
import { api } from '../lib/api'
import type { Theme } from '../lib/theme'
import './ideas-canvas.css'

type Board = {
  id: string
  label: string
}

type LibraryGroup = {
  id: string
  title: string
  items: LibraryItem[]
}

const bundledLibrarySources = import.meta.glob(
  './canvasui/library/*.excalidrawlib',
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>
let libraryGroupsPromise: Promise<LibraryGroup[]> | null = null

function libraryTitle(fileKey: string) {
  const base =
    fileKey.split('/').pop()?.replace(/\.excalidrawlib$/, '') || fileKey
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

async function loadLibraryGroups(): Promise<LibraryGroup[]> {
  if (!libraryGroupsPromise) {
    libraryGroupsPromise = Promise.all(
      Object.entries(bundledLibrarySources).map(async ([fileKey, source]) => {
        try {
          const items = await loadLibraryFromBlob(
            new Blob([source], { type: 'application/json' }),
            'published',
          )
          return { id: fileKey, title: libraryTitle(fileKey), items }
        } catch {
          console.warn(`Unable to load bundled canvas library: ${fileKey}`)
          return { id: fileKey, title: libraryTitle(fileKey), items: [] }
        }
      }),
    )
  }
  return libraryGroupsPromise
}

async function loadBundledLibrary(): Promise<LibraryItems> {
  const groups = await loadLibraryGroups()
  return groups.flatMap((group) => group.items) as LibraryItems
}

const thumbnailCache = new Map<string, Promise<string>>()
const thumbnailQueue: Array<() => Promise<void>> = []
const THUMBNAIL_CONCURRENCY = 4
let thumbnailWorkers = 0

function pumpThumbnails() {
  while (thumbnailWorkers < THUMBNAIL_CONCURRENCY && thumbnailQueue.length) {
    const next = thumbnailQueue.shift()
    if (!next) return
    thumbnailWorkers += 1
    next().finally(() => {
      thumbnailWorkers -= 1
      pumpThumbnails()
    })
  }
}

function enqueueThumbnail<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    thumbnailQueue.push(() => task().then(resolve, reject))
    pumpThumbnails()
  })
}

async function renderThumbnail(item: LibraryItem): Promise<string> {
  const blob = await exportToBlob({
    elements: item.elements,
    appState: {
      exportBackground: false,
      viewBackgroundColor: '#00000000',
      exportPadding: 6,
    },
    files: {},
    mimeType: 'image/svg+xml',
  })
  return URL.createObjectURL(blob)
}

function thumbnailForItem(item: LibraryItem): Promise<string> {
  const cached = thumbnailCache.get(item.id)
  if (cached) return cached
  const promise = enqueueThumbnail(() => renderThumbnail(item))
  thumbnailCache.set(item.id, promise)
  return promise
}

function libraryItemName(item: LibraryItem, index: number) {
  if (item.name) return item.name
  const textElement = item.elements.find((element) => {
    if (element.type !== 'text') return false
    const text = (element as { text?: unknown }).text
    return typeof text === 'string' && text.trim().length > 0
  })
  if (textElement) {
    const text = (textElement as { text: string }).text
    return text.trim().replace(/\s+/g, ' ').slice(0, 42)
  }
  return `Item ${index + 1}`
}

async function insertLibraryItem(
  excalidrawApi: ExcalidrawImperativeAPI,
  item: LibraryItem,
) {
  const added = convertToExcalidrawElements(
    item.elements as unknown as Parameters<typeof convertToExcalidrawElements>[0],
    { regenerateIds: true },
  )
  if (!added.length) return
  const appState = excalidrawApi.getAppState()
  const targetX = -appState.scrollX + appState.width / (2 * appState.zoom.value)
  const targetY = -appState.scrollY + appState.height / (2 * appState.zoom.value)
  const bounds = getCommonBounds(added)
  const centerX = (bounds[0] + bounds[2]) / 2
  const centerY = (bounds[1] + bounds[3]) / 2
  const positioned = added.map((element) =>
    newElementWith(element, {
      x: element.x + targetX - centerX,
      y: element.y + targetY - centerY,
    }),
  )
  excalidrawApi.updateScene({
    elements: [...excalidrawApi.getSceneElements(), ...positioned],
  })
}

async function availableLibrary(workspaceId: string): Promise<LibraryItems> {
  const bundled = await loadBundledLibrary()
  const custom = readLibrary(workspaceId)
  const byId = new Map([...bundled, ...custom].map((item) => [item.id, item]))
  return [...byId.values()] as LibraryItems
}

function boardCacheKey(workspaceId: string) {
  return `lancee:excalidraw:boards:${workspaceId}`
}

function libraryCacheKey(workspaceId: string) {
  return `lancee:excalidraw:library:${workspaceId}`
}

function readCachedBoards(workspaceId: string): Board[] {
  try {
    const cached = localStorage.getItem(boardCacheKey(workspaceId))
    return cached ? (JSON.parse(cached) as Board[]) : []
  } catch {
    return []
  }
}

function cacheBoards(workspaceId: string, boards: Board[]) {
  localStorage.setItem(boardCacheKey(workspaceId), JSON.stringify(boards))
}

function readLibrary(workspaceId: string): LibraryItems {
  try {
    const cached = localStorage.getItem(libraryCacheKey(workspaceId))
    return cached ? (JSON.parse(cached) as LibraryItems) : []
  } catch {
    return []
  }
}

function cacheLibrary(workspaceId: string, items: LibraryItems) {
  try {
    localStorage.setItem(libraryCacheKey(workspaceId), JSON.stringify(items))
  } catch {
    // A library remains usable for the current session if browser storage is full.
  }
}

async function loadScene(
  boardId: string,
  workspaceId: string,
  theme: Theme,
): Promise<ExcalidrawInitialDataState> {
  try {
    const stored = (await api.ideas.getScene(boardId)) as
      | ExcalidrawInitialDataState
      | null
    if (stored) {
      return {
        ...stored,
        appState: {
          ...(stored.appState || {}),
          theme,
        },
        libraryItems: await availableLibrary(workspaceId),
      }
    }
  } catch {
    // The canvas opens fresh when the saved scene cannot be loaded.
  }
  return {
    appState: {
      theme,
      viewBackgroundColor: theme === 'dark' ? '#0f151f' : '#ffffff',
    },
    libraryItems: await availableLibrary(workspaceId),
  }
}

async function saveScene(boardId: string, scene: ExcalidrawInitialDataState) {
  await api.ideas.saveScene(
    boardId,
    scene as unknown as Record<string, unknown>,
  )
}

function ExcalidrawBoard({
  board,
  boardId,
  workspaceId,
  theme,
  onSceneChange,
  onSaveError,
  onReady,
}: {
  board: Board
  boardId: string
  workspaceId: string
  theme: Theme
  onSceneChange: (scene: ExcalidrawInitialDataState) => void
  onSaveError: (message: string) => void
  onReady: (api: ExcalidrawImperativeAPI) => void
}) {
  const saveTimer = useRef<number | null>(null)
  const pendingScene = useRef<ExcalidrawInitialDataState | null>(null)

  const flushScene = useCallback(() => {
    if (!pendingScene.current) return
    const scene = pendingScene.current
    void saveScene(boardId, scene)
      .then(() => {
        if (pendingScene.current === scene) pendingScene.current = null
      })
      .catch((reason: unknown) => {
        onSaveError(
          reason instanceof Error ? reason.message : 'Unable to save this board.',
        )
      })
  }, [boardId, onSaveError])

  useEffect(
    () => () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
      flushScene()
    },
    [flushScene],
  )

  const handleChange = useCallback<NonNullable<ExcalidrawProps['onChange']>>(
    (elements, appState, files) => {
      pendingScene.current = {
        elements,
        files,
        appState: {
          name: appState.name,
          theme,
          viewBackgroundColor: appState.viewBackgroundColor,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          zoom: appState.zoom,
          gridSize: appState.gridSize,
          gridStep: appState.gridStep,
          objectsSnapModeEnabled: appState.objectsSnapModeEnabled,
        },
      }
      onSceneChange(pendingScene.current)
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(flushScene, 450)
    },
    [flushScene, onSceneChange, theme],
  )

  return (
    <Excalidraw
      autoFocus
      handleKeyboardGlobally
      initialData={() => loadScene(boardId, workspaceId, theme)}
      name={board.label}
      onChange={handleChange}
      onLibraryChange={(items) => cacheLibrary(workspaceId, items)}
      excalidrawAPI={onReady}
      theme={theme}
    />
  )
}

function LibraryPanel({
  groups,
  onInsertItem,
}: {
  groups: LibraryGroup[]
  onInsertItem: (item: LibraryItem) => void
}) {
  return (
    <div className="ideas-library-panel__groups">
      {groups.map((group) => (
        <LibraryGroupSection
          group={group}
          key={group.id}
          onInsertItem={onInsertItem}
        />
      ))}
    </div>
  )
}

function LibraryGroupSection({
  group,
  onInsertItem,
}: {
  group: LibraryGroup
  onInsertItem: (item: LibraryItem) => void
}) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    Promise.all(
      group.items.map(async (item) => {
        try {
          const url = await thumbnailForItem(item)
          return { id: item.id, url } as const
        } catch {
          return null
        }
      }),
    ).then((results) => {
      if (cancelled) return
      setThumbs(
        Object.fromEntries(
          results.filter((result) => result).map((result) => [result!.id, result!.url]),
        ),
      )
    })
    return () => {
      cancelled = true
    }
  }, [group])

  return (
    <details className="ideas-library-group" open>
      <summary>
        {group.title}
        <span className="ideas-library-group__count">{group.items.length}</span>
      </summary>
      <div className="ideas-library-group__items">
        {group.items.map((item, index) => {
          const name = libraryItemName(item, index)
          return (
            <button
              className="ideas-library-item"
              key={item.id}
              type="button"
              title={name}
              onClick={() => onInsertItem(item)}
            >
              <span className="ideas-library-item__preview">
                {thumbs[item.id] ? (
                  <img src={thumbs[item.id]} alt="" />
                ) : (
                  <span className="ideas-library-item__loader" />
                )}
              </span>
              <span className="ideas-library-item__name">{name}</span>
            </button>
          )
        })}
      </div>
    </details>
  )
}

export default function IdeasCanvasPage({
  workspaceId,
  theme,
}: {
  workspaceId: string
  theme: Theme
}) {
  const cachedBoards = useMemo(() => readCachedBoards(workspaceId), [workspaceId])
  const [boards, setBoards] = useState<Board[]>(cachedBoards)
  const [activeBoardId, setActiveBoardId] = useState<string | null>(
    cachedBoards[0]?.id ?? null,
  )
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [error, setError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [showNewBoard, setShowNewBoard] = useState(false)
  const [newBoardLabel, setNewBoardLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryGroups, setLibraryGroups] = useState<LibraryGroup[] | null>(null)
  const latestScene = useRef<ExcalidrawInitialDataState | null>(null)
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null)

  const handleReady = useCallback((api: ExcalidrawImperativeAPI) => {
    excalidrawApiRef.current = api
  }, [])

  const handleInsertLibraryItem = useCallback((item: LibraryItem) => {
    const excalidrawApi = excalidrawApiRef.current
    if (!excalidrawApi) return
    void insertLibraryItem(excalidrawApi, item)
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadLibraryGroups().then((groups) => {
      if (!cancelled) setLibraryGroups(groups)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    setLoading(true)
    setError('')

    void api.ideas
      .listBoards()
      .then((nextBoards) => {
        if (cancelled) return
        setBoards(nextBoards)
        cacheBoards(workspaceId, nextBoards)
        setActiveBoardId((current) =>
          current && nextBoards.some((board) => board.id === current)
            ? current
            : (nextBoards[0]?.id ?? null),
        )
      })
      .catch((reason: unknown) => {
        if (cancelled || cachedBoards.length) return
        setError(reason instanceof Error ? reason.message : 'Unable to load idea boards.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [cachedBoards, workspaceId])

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  async function createBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const label = newBoardLabel.trim()
    if (!label || saving) return

    setSaving(true)
    setError('')
    try {
      const board = await api.ideas.createBoard(label)
      const nextBoards = [...boards, board]
      setBoards(nextBoards)
      cacheBoards(workspaceId, nextBoards)
      setActiveBoardId(board.id)
      setNewBoardLabel('')
      setShowNewBoard(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create the board.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteBoard(board: Board) {
    if (!window.confirm(`Delete “${board.label}”? This cannot be undone.`)) return

    setError('')
    try {
      await api.ideas.deleteBoard(board.id)
      const nextBoards = boards.filter((candidate) => candidate.id !== board.id)
      setBoards(nextBoards)
      cacheBoards(workspaceId, nextBoards)
      if (activeBoardId === board.id) setActiveBoardId(nextBoards[0]?.id ?? null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete the board.')
    }
  }

  async function exportPdf() {
    if (!activeBoard || !latestScene.current || exporting) return
    setExporting(true)
    setError('')
    try {
      const scene = latestScene.current
      const image = await exportToBlob({
        elements: scene.elements || [],
        appState: {
          ...(scene.appState || {}),
          exportBackground: true,
          viewBackgroundColor: scene.appState?.viewBackgroundColor || '#ffffff',
        },
        files: scene.files || {},
        mimeType: 'image/png',
      })
      const bitmap = await createImageBitmap(image)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas export is unavailable in this browser.')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0)
      bitmap.close()
      const jpeg = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('Unable to render PDF image.')),
          'image/jpeg',
          .92,
        ),
      )
      const jpegBytes = new Uint8Array(await jpeg.arrayBuffer())
      const encoder = new TextEncoder()
      const pageWidth = 842
      const pageHeight = Math.max(595, Math.round(pageWidth * canvas.height / canvas.width))
      const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ\n`
      const objects: Array<Uint8Array> = [
        encoder.encode('<< /Type /Catalog /Pages 2 0 R >>'),
        encoder.encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
        encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
        new Uint8Array([
          ...encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`),
          ...jpegBytes,
          ...encoder.encode('\nendstream'),
        ]),
        encoder.encode(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`),
      ]
      const chunks: Uint8Array[] = [encoder.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')]
      const offsets = [0]
      let length = chunks[0].length
      objects.forEach((object, index) => {
        offsets.push(length)
        const chunk = new Uint8Array([
          ...encoder.encode(`${index + 1} 0 obj\n`),
          ...object,
          ...encoder.encode('\nendobj\n'),
        ])
        chunks.push(chunk)
        length += chunk.length
      })
      const xrefOffset = length
      const xref = [
        `xref\n0 ${objects.length + 1}\n`,
        '0000000000 65535 f \n',
        ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
      ].join('')
      chunks.push(encoder.encode(xref))
      const pdfBytes = new Uint8Array(
        chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
      )
      let pdfOffset = 0
      chunks.forEach((chunk) => {
        pdfBytes.set(chunk, pdfOffset)
        pdfOffset += chunk.byteLength
      })
      const pdf = new Blob([pdfBytes.buffer], { type: 'application/pdf' })
      const safeName = activeBoard.label.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'idea-board'
      const pdfFile = new File([pdf], `${safeName}.pdf`, { type: 'application/pdf' })
      const linkedProjects = (await api.projects.list())
        .filter((project) => project.boardId === activeBoard.id)
      await Promise.all([
        api.documents.upload(pdfFile, 'local'),
        ...linkedProjects.map((project) => api.projects.files.add(project.id, pdfFile)),
      ])
      const url = URL.createObjectURL(pdf)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${safeName}.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to export this board.')
    } finally {
      setExporting(false)
    }
  }

  const activeBoard = boards.find((board) => board.id === activeBoardId) ?? null

  return (
    <section className="ideas-page">
      <header className="ideas-header">
        <div>
          <span className="ideas-eyebrow">Creative workspace</span>
          <h1>Ideas</h1>
          <p>Sketch, diagram, collect references, and shape early thinking together.</p>
        </div>
        <div className="ideas-header__actions">
          <span className={`ideas-connection ${online ? 'is-online' : 'is-offline'}`}>
            <i />
            {online ? 'Saved to workspace' : 'Offline · reconnect to save'}
          </span>
          <button
            className={`ideas-library-toggle ${libraryOpen ? 'is-active' : ''}`}
            type="button"
            aria-pressed={libraryOpen}
            onClick={() => setLibraryOpen((open) => !open)}
          >
            {libraryOpen ? 'Close library' : 'Libraries'}
          </button>
          <button className="ideas-new-board" onClick={() => setShowNewBoard(true)}>
            <span aria-hidden="true">+</span> New board
          </button>
          <button
            className="ideas-export-pdf"
            type="button"
            disabled={!activeBoard || !latestScene.current || exporting}
            onClick={() => void exportPdf()}
          >
            {exporting ? 'Creating PDF…' : 'Export PDF to Files'}
          </button>
        </div>
      </header>

      <div className="ideas-boardbar" aria-label="Idea boards">
        <div className="ideas-boardbar__tabs" role="tablist">
          {boards.map((board) => (
            <div
              className={`ideas-board-tab ${board.id === activeBoardId ? 'is-active' : ''}`}
              key={board.id}
            >
              <button
                role="tab"
                aria-selected={board.id === activeBoardId}
                onClick={() => setActiveBoardId(board.id)}
              >
                {board.label}
              </button>
              <button
                className="ideas-board-tab__delete"
                aria-label={`Delete ${board.label}`}
                title={`Delete ${board.label}`}
                onClick={() => void deleteBoard(board)}
              >
                ×
              </button>
            </div>
          ))}
          <button
            className="ideas-boardbar__add"
            aria-label="Create a new board"
            onClick={() => setShowNewBoard(true)}
          >
            +
          </button>
        </div>
        <div className="ideas-capabilities" aria-label="Editor capabilities">
          <span>Draw</span>
          <span>Diagram</span>
          <span>Media</span>
          <span>Libraries</span>
          <span>Export</span>
        </div>
      </div>

      {(error || saveError) && (
        <div className="ideas-error" role="alert">
          {error || saveError}
        </div>
      )}

      <div className="ideas-editor-frame">
        {loading && !activeBoard ? (
          <div className="ideas-empty">
            <span className="ideas-empty__loader" />
            <h2>Opening your canvas</h2>
            <p>Loading boards and editor tools…</p>
          </div>
        ) : activeBoard ? (
          <div className="ideas-excalidraw-shell" aria-label={`${activeBoard.label} canvas`}>
            <ExcalidrawBoard
              board={activeBoard}
              key={activeBoard.id}
              boardId={activeBoard.id}
              workspaceId={workspaceId}
              theme={theme}
              onReady={handleReady}
              onSaveError={setSaveError}
              onSceneChange={(scene) => {
                latestScene.current = scene
              }}
            />
          </div>
        ) : (
          <div className="ideas-empty">
            <span className="ideas-empty__mark" aria-hidden="true">✦</span>
            <h2>Start with a fresh canvas</h2>
            <p>Create a board for loose thinking, references, diagrams, and project ideas.</p>
            <button className="ideas-new-board" onClick={() => setShowNewBoard(true)}>
              <span aria-hidden="true">+</span> Create first board
            </button>
          </div>
        )}

        {libraryOpen && (
          <aside className="ideas-library-panel" aria-label="Canvas libraries">
            <header className="ideas-library-panel__header">
              <strong>Libraries</strong>
              <button
                type="button"
                aria-label="Close libraries"
                onClick={() => setLibraryOpen(false)}
              >
                ×
              </button>
            </header>
            {libraryGroups ? (
              <LibraryPanel
                groups={libraryGroups}
                onInsertItem={handleInsertLibraryItem}
              />
            ) : (
              <div className="ideas-library-panel__loading">
                <span className="ideas-empty__loader" />
              </div>
            )}
          </aside>
        )}
      </div>

      {showNewBoard && (
        <div className="ideas-dialog-backdrop" role="presentation">
          <form className="ideas-dialog" onSubmit={(event) => void createBoard(event)}>
            <span className="ideas-eyebrow">New creative space</span>
            <h2>Create an idea board</h2>
            <p>Give this canvas a clear name. Create another board whenever a direction needs its own space.</p>
            <label>
              Board name
              <input
                autoFocus
                maxLength={80}
                placeholder="Brand exploration"
                value={newBoardLabel}
                onChange={(event) => setNewBoardLabel(event.target.value)}
              />
            </label>
            <div>
              <button
                className="ideas-dialog__cancel"
                type="button"
                onClick={() => setShowNewBoard(false)}
              >
                Cancel
              </button>
              <button className="ideas-new-board" disabled={!newBoardLabel.trim() || saving}>
                {saving ? 'Creating…' : 'Create board'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
