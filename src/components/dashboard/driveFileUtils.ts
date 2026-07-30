import type { GoogleDriveFile } from '../../lib/api'

const GOOGLE_DOCUMENT_MIME = 'application/vnd.google-apps.document'
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const GOOGLE_DRIVE_FOLDER_MIME =
  'application/vnd.google-apps.folder'

export function isDriveFolder(file: GoogleDriveFile) {
  return file.mimeType === GOOGLE_DRIVE_FOLDER_MIME
}

export type DriveWorkspaceMode =
  | 'rich-text'
  | 'markdown'
  | 'pdf'
  | 'image'
  | 'unsupported'

export function driveWorkspaceMode(file: GoogleDriveFile): DriveWorkspaceMode {
  const mimeType = file.mimeType.toLowerCase()
  const name = file.name.toLowerCase()
  if (mimeType === GOOGLE_DOCUMENT_MIME || mimeType === DOCX_MIME) {
    return 'rich-text'
  }
  if (
    mimeType === 'text/markdown' ||
    mimeType === 'text/x-markdown' ||
    name.endsWith('.md') ||
    name.endsWith('.markdown')
  ) {
    return 'markdown'
  }
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  return 'unsupported'
}
