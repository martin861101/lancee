import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import type {
  ExcalidrawInitialDataState,
  ExcalidrawProps,
  LibraryItems,
} from '@excalidraw/excalidraw/types'
import '@excalidraw/excalidraw/index.css'
import { api } from '../lib/api'
import './ideas-canvas.css'

type Board = {
  id: string
  label: string
}

const SCENE_DATABASE = 'lancee-excalidraw'
const SCENE_STORE = 'scenes'

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

function openSceneDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SCENE_DATABASE, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SCENE_STORE)) {
        request.result.createObjectStore(SCENE_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function loadScene(
  persistenceKey: string,
  workspaceId: string,
): Promise<ExcalidrawInitialDataState> {
  try {
    const database = await openSceneDatabase()
    const scene = await new Promise<ExcalidrawInitialDataState | undefined>(
      (resolve, reject) => {
        const transaction = database.transaction(SCENE_STORE, 'readonly')
        const request = transaction.objectStore(SCENE_STORE).get(persistenceKey)
        request.onsuccess = () =>
          resolve(request.result as ExcalidrawInitialDataState | undefined)
        request.onerror = () => reject(request.error)
      },
    )
    database.close()
    if (scene) {
      return {
        ...scene,
        appState: {
          ...scene.appState,
          theme: 'dark',
        },
        libraryItems: readLibrary(workspaceId),
      }
    }
  } catch {
    // The editor can still open when private browsing blocks IndexedDB.
  }
  return {
    appState: {
      theme: 'dark',
      viewBackgroundColor: '#0f151f',
    },
    libraryItems: readLibrary(workspaceId),
  }
}

async function saveScene(
  persistenceKey: string,
  scene: ExcalidrawInitialDataState,
) {
  const database = await openSceneDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(SCENE_STORE, 'readwrite')
    transaction.objectStore(SCENE_STORE).put(scene, persistenceKey)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

async function deleteScene(persistenceKey: string) {
  try {
    const database = await openSceneDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(SCENE_STORE, 'readwrite')
      transaction.objectStore(SCENE_STORE).delete(persistenceKey)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  } catch {
    // The server board is already deleted; stale browser data is harmless.
  }
}

function ExcalidrawBoard({
  board,
  persistenceKey,
  workspaceId,
}: {
  board: Board
  persistenceKey: string
  workspaceId: string
}) {
  const saveTimer = useRef<number | null>(null)
  const pendingScene = useRef<ExcalidrawInitialDataState | null>(null)

  const flushScene = useCallback(() => {
    if (!pendingScene.current) return
    const scene = pendingScene.current
    pendingScene.current = null
    void saveScene(persistenceKey, scene).catch(() => undefined)
  }, [persistenceKey])

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
          theme: 'dark',
          viewBackgroundColor: appState.viewBackgroundColor,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          zoom: appState.zoom,
          gridSize: appState.gridSize,
          gridStep: appState.gridStep,
          objectsSnapModeEnabled: appState.objectsSnapModeEnabled,
        },
      }
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(flushScene, 450)
    },
    [flushScene],
  )

  return (
    <Excalidraw
      autoFocus
      handleKeyboardGlobally
      initialData={() => loadScene(persistenceKey, workspaceId)}
      name={board.label}
      onChange={handleChange}
      onLibraryChange={(items) => cacheLibrary(workspaceId, items)}
      theme="dark"
    />
  )
}

export default function IdeasCanvasPage({ workspaceId }: { workspaceId: string }) {
  const cachedBoards = useMemo(() => readCachedBoards(workspaceId), [workspaceId])
  const [boards, setBoards] = useState<Board[]>(cachedBoards)
  const [activeBoardId, setActiveBoardId] = useState<string | null>(
    cachedBoards[0]?.id ?? null,
  )
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [error, setError] = useState('')
  const [showNewBoard, setShowNewBoard] = useState(false)
  const [newBoardLabel, setNewBoardLabel] = useState('')
  const [saving, setSaving] = useState(false)

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
      void deleteScene(`lancee:excalidraw:${workspaceId}:${board.id}`)
      if (activeBoardId === board.id) setActiveBoardId(nextBoards[0]?.id ?? null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete the board.')
    }
  }

  const activeBoard = boards.find((board) => board.id === activeBoardId) ?? null
  const persistenceKey = activeBoard
    ? `lancee:excalidraw:${workspaceId}:${activeBoard.id}`
    : undefined

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
            {online ? 'Saved locally' : 'Offline · changes stay here'}
          </span>
          <button className="ideas-new-board" onClick={() => setShowNewBoard(true)}>
            <span aria-hidden="true">+</span> New board
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

      {error && (
        <div className="ideas-error" role="alert">
          {error}
        </div>
      )}

      <div className="ideas-editor-frame">
        {loading && !activeBoard ? (
          <div className="ideas-empty">
            <span className="ideas-empty__loader" />
            <h2>Opening your canvas</h2>
            <p>Loading boards and editor tools…</p>
          </div>
        ) : activeBoard && persistenceKey ? (
          <div className="ideas-excalidraw-shell" aria-label={`${activeBoard.label} canvas`}>
            <ExcalidrawBoard
              board={activeBoard}
              key={activeBoard.id}
              persistenceKey={persistenceKey}
              workspaceId={workspaceId}
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
