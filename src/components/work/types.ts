export const COLUMN_IDS = ['in-progress', 'in-review', 'waiting-on-client', 'ready'] as const
export type ColumnId = (typeof COLUMN_IDS)[number]

export const STATUS_LABELS: Record<ColumnId, string> = {
  'in-progress': 'In progress',
  'in-review': 'In review',
  'waiting-on-client': 'Waiting on client',
  'ready': 'Ready',
}

export const STATUS_MAP: Record<string, ColumnId> = {
  'In progress': 'in-progress',
  'In review': 'in-review',
  'Waiting on client': 'waiting-on-client',
  'Ready': 'ready',
}

export const REVERSE_STATUS: Record<ColumnId, string> = {
  'in-progress': 'In progress',
  'in-review': 'In review',
  'waiting-on-client': 'Waiting on client',
  'ready': 'Ready',
}
