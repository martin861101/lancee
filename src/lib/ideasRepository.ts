import {
  deleteCachedIdeaNote,
  deleteIdeaMutation,
  listCachedIdeaNotes,
  listIdeaMutations,
  putCachedIdeaNote,
  putIdeaMutation,
  replaceCachedIdeaNotes,
  type IdeaMutation,
  type IdeaNote,
  type LocalIdeaNote,
} from './offlineStore'

export const IDEA_SYNC_EVENT = 'lancee:idea-sync'

type NoteResponse = {
  note?: IdeaNote
  error?: string
  conflict?: { current?: IdeaNote }
}

const activeSyncs = new Map<string, Promise<void>>()

function notifySync(workspaceId: string) {
  window.dispatchEvent(
    new CustomEvent(IDEA_SYNC_EVENT, { detail: { workspaceId } }),
  )
}

function mutationId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

async function requestBackgroundSync() {
  if (!('serviceWorker' in navigator)) return
  try {
    const registration = await navigator.serviceWorker.ready
    const syncRegistration = registration as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> }
    }
    await syncRegistration.sync?.register('lancee-sync-ideas')
  } catch {
    // Foreground `online` handling remains the portable sync path.
  }
}

async function sendMutation(mutation: IdeaMutation) {
  let response: Response
  try {
    response = await fetch(mutation.url, {
      method: mutation.method,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': mutation.id,
      },
      body: JSON.stringify(mutation.body),
    })
  } catch {
    return { outcome: 'offline' as const }
  }

  let payload: NoteResponse = {}
  try {
    payload = (await response.json()) as NoteResponse
  } catch {
    payload = { error: 'The server returned an unreadable sync response.' }
  }

  if (response.ok && payload.note) {
    return { outcome: 'synced' as const, note: payload.note }
  }
  if (response.status === 409) {
    return {
      outcome: 'conflict' as const,
      error: payload.error || 'The note changed on another device.',
      current: payload.conflict?.current,
    }
  }
  if (response.status === 401 || response.status === 403) {
    return { outcome: 'offline' as const }
  }
  if (response.status >= 400 && response.status < 500) {
    return {
      outcome: 'rejected' as const,
      error: payload.error || 'The queued note was rejected.',
      current: payload.conflict?.current,
    }
  }
  return { outcome: 'offline' as const }
}

export async function syncIdeaMutations(workspaceId: string) {
  const active = activeSyncs.get(workspaceId)
  if (active) return active

  const sync = (async () => {
    const mutations = await listIdeaMutations(workspaceId)
    for (const mutation of mutations) {
      if (mutation.status !== 'pending') continue
      const result = await sendMutation(mutation)
      if (result.outcome === 'offline') {
        await requestBackgroundSync()
        break
      }
      if (result.outcome === 'synced') {
        await deleteIdeaMutation(mutation.id)
        await putCachedIdeaNote(workspaceId, {
          ...result.note,
          syncState: 'synced',
        })
        continue
      }

      const conflictMutation: IdeaMutation = {
        ...mutation,
        status: 'conflict',
        conflictCurrent: result.current,
        error: result.error,
      }
      await putIdeaMutation(conflictMutation)
      const cached = (await listCachedIdeaNotes(
        workspaceId,
        mutation.boardId,
      )).find((note) => note.id === mutation.noteId)
      if (cached) {
        await putCachedIdeaNote(workspaceId, {
          ...cached,
          syncState: 'conflict',
          conflictCurrent: result.current,
          syncError: result.error,
        })
      }
    }
    notifySync(workspaceId)
  })().finally(() => {
    activeSyncs.delete(workspaceId)
  })

  activeSyncs.set(workspaceId, sync)
  return sync
}

export async function loadIdeaBoard(
  workspaceId: string,
  boardId: string,
) {
  const cached = await listCachedIdeaNotes(workspaceId, boardId)
  try {
    const response = await fetch(
      `/api/ideas/notes?boardId=${encodeURIComponent(boardId)}`,
      { credentials: 'same-origin' },
    )
    if (!response.ok) {
      throw new Error('Idea notes are unavailable.')
    }
    const payload = (await response.json()) as { notes?: IdeaNote[] }
    if (!Array.isArray(payload.notes)) {
      throw new Error('Idea notes are unavailable.')
    }
    const localById = new Map(
      cached
        .filter((note) => note.syncState !== 'synced')
        .map((note) => [note.id, note]),
    )
    const merged = payload.notes.map((note) => localById.get(note.id) || {
      ...note,
      syncState: 'synced' as const,
    })
    for (const local of localById.values()) {
      if (!merged.some((note) => note.id === local.id)) merged.push(local)
    }
    await replaceCachedIdeaNotes(workspaceId, boardId, merged)
    return { notes: merged, source: 'network' as const }
  } catch {
    return { notes: cached, source: 'cache' as const }
  }
}

export async function loadCachedIdeaBoard(
  workspaceId: string,
  boardId: string,
) {
  return listCachedIdeaNotes(workspaceId, boardId)
}

export async function createIdeaNote(
  workspaceId: string,
  boardId: string,
  content: string,
) {
  const timestamp = new Date().toISOString()
  const note: LocalIdeaNote = {
    id: `note_${crypto.randomUUID()}`,
    boardId,
    content,
    version: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncState: 'queued',
  }
  const mutation: IdeaMutation = {
    id: mutationId('idea-create'),
    workspaceId,
    noteId: note.id,
    boardId,
    kind: 'create',
    url: '/api/ideas/notes',
    method: 'POST',
    body: { id: note.id, boardId, content },
    status: 'pending',
    createdAt: timestamp,
  }
  await putCachedIdeaNote(workspaceId, note)
  await putIdeaMutation(mutation)
  void syncIdeaMutations(workspaceId)
  return note
}

export async function updateIdeaNote(
  workspaceId: string,
  note: LocalIdeaNote,
  content: string,
) {
  const timestamp = new Date().toISOString()
  const mutations = await listIdeaMutations(workspaceId)
  const pendingCreate = mutations.find(
    (mutation) =>
      mutation.noteId === note.id &&
      mutation.kind === 'create' &&
      mutation.status === 'pending',
  )
  if (pendingCreate) {
    await putIdeaMutation({
      ...pendingCreate,
      body: { ...pendingCreate.body, content },
    })
    const updated = {
      ...note,
      content,
      updatedAt: timestamp,
      syncState: 'queued' as const,
    }
    await putCachedIdeaNote(workspaceId, updated)
    void syncIdeaMutations(workspaceId)
    return updated
  }
  if (note.syncState !== 'synced' || note.version < 1) {
    throw new Error('Resolve the current note sync before editing it again.')
  }

  const mutation: IdeaMutation = {
    id: mutationId('idea-update'),
    workspaceId,
    noteId: note.id,
    boardId: note.boardId,
    kind: 'update',
    url: `/api/ideas/notes/${encodeURIComponent(note.id)}`,
    method: 'PATCH',
    body: {
      content,
      expectedVersion: note.version,
    },
    status: 'pending',
    createdAt: timestamp,
  }
  const updated: LocalIdeaNote = {
    ...note,
    content,
    updatedAt: timestamp,
    syncState: 'queued',
  }
  await putCachedIdeaNote(workspaceId, updated)
  await putIdeaMutation(mutation)
  void syncIdeaMutations(workspaceId)
  return updated
}

export async function resolveIdeaConflict(
  workspaceId: string,
  noteId: string,
  resolution: 'server' | 'mine',
) {
  const mutation = (await listIdeaMutations(workspaceId)).find(
    (candidate) =>
      candidate.noteId === noteId && candidate.status === 'conflict',
  )
  if (!mutation) return
  const local = (await listCachedIdeaNotes(
    workspaceId,
    mutation.boardId,
  )).find((note) => note.id === noteId)

  await deleteIdeaMutation(mutation.id)
  if (resolution === 'server') {
    if (mutation.conflictCurrent) {
      await putCachedIdeaNote(workspaceId, {
        ...mutation.conflictCurrent,
        syncState: 'synced',
      })
    } else {
      await deleteCachedIdeaNote(workspaceId, noteId)
    }
    notifySync(workspaceId)
    return
  }
  if (!local || !mutation.conflictCurrent) {
    throw new Error('There is no server version to compare with this note.')
  }

  const retry: IdeaMutation = {
    id: mutationId('idea-resolve'),
    workspaceId,
    noteId,
    boardId: local.boardId,
    kind: 'update',
    url: `/api/ideas/notes/${encodeURIComponent(noteId)}`,
    method: 'PATCH',
    body: {
      content: local.content,
      expectedVersion: mutation.conflictCurrent.version,
    },
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  await putCachedIdeaNote(workspaceId, {
    ...local,
    version: mutation.conflictCurrent.version,
    syncState: 'queued',
    conflictCurrent: undefined,
    syncError: undefined,
  })
  await putIdeaMutation(retry)
  await syncIdeaMutations(workspaceId)
}
