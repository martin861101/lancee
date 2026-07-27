import type { Project } from '../../lib/api'
import { COLUMN_IDS, STATUS_LABELS } from './types'

export function buildItemsByColumn(projects: Project[]): Record<string, Project[]> {
  const map: Record<string, Project[]> = {}
  for (const id of COLUMN_IDS) {
    map[id] = projects.filter((p) => p.status === STATUS_LABELS[id])
  }
  return map
}
