export type IdeaNote = {
  id: string
  boardId: string
  content: string
  version: number
  createdAt: string
  updatedAt: string
  createdBy?: string
  taskLinks?: Array<{
    noteId: string
    taskId: string
    projectId: string
    taskTitle: string
    createdBy: string
    createdAt: string
  }>
  mentions?: Array<{
    userId: string
    name: string
    avatarUrl: string
    status: 'active' | 'invited' | 'disabled'
  }>
}

export type NoteSyncState = 'synced' | 'queued' | 'conflict'

export type LocalIdeaNote = IdeaNote & {
  syncState: NoteSyncState
  conflictCurrent?: IdeaNote
  syncError?: string
}

export type CachedSessionUser = {
  id: string
  name: string
  email: string
  avatarUrl: string
  workspaceId: string
  workspace: string
  role: 'owner' | 'admin' | 'member'
  isAdmin: boolean
  initials: string
}

export type IdeaMutation = {
  id: string
  workspaceId: string
  noteId: string
  boardId: string
  kind: 'create' | 'update'
  url: string
  method: 'POST' | 'PATCH'
  body: {
    id?: string
    boardId?: string
    content: string
    expectedVersion?: number
  }
  status: 'pending' | 'conflict'
  conflictCurrent?: IdeaNote
  error?: string
  createdAt: string
}

type NoteRecord = LocalIdeaNote & {
  key: string
  workspaceId: string
}

const DATABASE_NAME = 'lancee-offline-v1'
const DATABASE_VERSION = 1
const SESSION_KEY = 'last-session'

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener(
      'error',
      () => reject(request.error || new Error('Offline storage request failed.')),
      { once: true },
    )
  })
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener(
      'abort',
      () => reject(transaction.error || new Error('Offline storage transaction aborted.')),
      { once: true },
    )
    transaction.addEventListener(
      'error',
      () => reject(transaction.error || new Error('Offline storage transaction failed.')),
      { once: true },
    )
  })
}

let databasePromise: Promise<IDBDatabase> | null = null

function openOfflineDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
      request.addEventListener('upgradeneeded', () => {
        const database = request.result
        if (!database.objectStoreNames.contains('meta')) {
          database.createObjectStore('meta', { keyPath: 'key' })
        }
        if (!database.objectStoreNames.contains('notes')) {
          const notes = database.createObjectStore('notes', { keyPath: 'key' })
          notes.createIndex('workspaceBoard', ['workspaceId', 'boardId'])
        }
        if (!database.objectStoreNames.contains('mutations')) {
          const mutations = database.createObjectStore('mutations', { keyPath: 'id' })
          mutations.createIndex('workspaceId', 'workspaceId')
        }
      })
      request.addEventListener('success', () => resolve(request.result), { once: true })
      request.addEventListener(
        'error',
        () => reject(request.error || new Error('Offline storage is unavailable.')),
        { once: true },
      )
    })
  }
  return databasePromise
}

function noteKey(workspaceId: string, noteId: string) {
  return `${workspaceId}:${noteId}`
}

export async function cacheSession(user: CachedSessionUser) {
  const database = await openOfflineDatabase()
  const transaction = database.transaction('meta', 'readwrite')
  transaction.objectStore('meta').put({ key: SESSION_KEY, user })
  await transactionComplete(transaction)
}

export async function getCachedSession() {
  const database = await openOfflineDatabase()
  const transaction = database.transaction('meta', 'readonly')
  const completed = transactionComplete(transaction)
  const record = await requestResult<{ key: string; user: CachedSessionUser } | undefined>(
    transaction.objectStore('meta').get(SESSION_KEY),
  )
  await completed
  return record?.user
    ? {
        ...record.user,
        avatarUrl: record.user.avatarUrl || '',
        isAdmin: record.user.isAdmin === true,
      }
    : null
}

export async function clearOfflineData() {
  const database = await openOfflineDatabase()
  const transaction = database.transaction(
    ['meta', 'notes', 'mutations'],
    'readwrite',
  )
  transaction.objectStore('meta').clear()
  transaction.objectStore('notes').clear()
  transaction.objectStore('mutations').clear()
  await transactionComplete(transaction)
}

export async function listCachedIdeaNotes(
  workspaceId: string,
  boardId: string,
) {
  if (!workspaceId || !boardId) return []
  const database = await openOfflineDatabase()
  const transaction = database.transaction('notes', 'readonly')
  const completed = transactionComplete(transaction)
  const records = await requestResult<NoteRecord[]>(
    transaction
      .objectStore('notes')
      .index('workspaceBoard')
      .getAll(IDBKeyRange.only([workspaceId, boardId])),
  )
  await completed
  return records
    .map((record) => ({
      id: record.id,
      boardId: record.boardId,
      content: record.content,
      version: record.version,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      syncState: record.syncState,
      conflictCurrent: record.conflictCurrent,
      syncError: record.syncError,
      createdBy: record.createdBy,
      taskLinks: record.taskLinks || [],
      mentions: record.mentions || [],
    }))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function replaceCachedIdeaNotes(
  workspaceId: string,
  boardId: string,
  notes: LocalIdeaNote[],
) {
  const current = await listCachedIdeaNotes(workspaceId, boardId)
  const database = await openOfflineDatabase()
  const transaction = database.transaction('notes', 'readwrite')
  const store = transaction.objectStore('notes')
  for (const note of current) {
    store.delete(noteKey(workspaceId, note.id))
  }
  for (const note of notes) {
    store.put({
      ...note,
      key: noteKey(workspaceId, note.id),
      workspaceId,
    } satisfies NoteRecord)
  }
  await transactionComplete(transaction)
}

export async function putCachedIdeaNote(
  workspaceId: string,
  note: LocalIdeaNote,
) {
  const database = await openOfflineDatabase()
  const transaction = database.transaction('notes', 'readwrite')
  transaction.objectStore('notes').put({
    ...note,
    key: noteKey(workspaceId, note.id),
    workspaceId,
  } satisfies NoteRecord)
  await transactionComplete(transaction)
}

export async function deleteCachedIdeaNote(
  workspaceId: string,
  noteId: string,
) {
  const database = await openOfflineDatabase()
  const transaction = database.transaction('notes', 'readwrite')
  transaction.objectStore('notes').delete(noteKey(workspaceId, noteId))
  await transactionComplete(transaction)
}

export async function listIdeaMutations(workspaceId: string) {
  if (!workspaceId) return []
  const database = await openOfflineDatabase()
  const transaction = database.transaction('mutations', 'readonly')
  const completed = transactionComplete(transaction)
  const records = await requestResult<IdeaMutation[]>(
    transaction
      .objectStore('mutations')
      .index('workspaceId')
      .getAll(IDBKeyRange.only(workspaceId)),
  )
  await completed
  return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export async function putIdeaMutation(mutation: IdeaMutation) {
  const database = await openOfflineDatabase()
  const transaction = database.transaction('mutations', 'readwrite')
  transaction.objectStore('mutations').put(mutation)
  await transactionComplete(transaction)
}

export async function deleteIdeaMutation(id: string) {
  const database = await openOfflineDatabase()
  const transaction = database.transaction('mutations', 'readwrite')
  transaction.objectStore('mutations').delete(id)
  await transactionComplete(transaction)
}
