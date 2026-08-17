import DOMPurify from 'dompurify'
import { marked } from 'marked'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from 'react'
import {
  api,
  type GoogleDriveEditorDocument,
  type GoogleDriveFile,
} from '../../lib/api'
import { driveWorkspaceMode } from './driveFileUtils'

function RichTextToolbar({ onChange }: { onChange: () => void }) {
  const command = (
    event: MouseEvent<HTMLButtonElement>,
    name: string,
    value?: string,
  ) => {
    event.preventDefault()
    globalThis.document.execCommand(name, false, value)
    onChange()
  }

  return (
    <div className="drive-workspace__toolbar" aria-label="Document formatting">
      <button type="button" title="Bold" onMouseDown={(event) => command(event, 'bold')}>
        <strong>B</strong>
      </button>
      <button type="button" title="Italic" onMouseDown={(event) => command(event, 'italic')}>
        <em>I</em>
      </button>
      <button type="button" title="Underline" onMouseDown={(event) => command(event, 'underline')}>
        <u>U</u>
      </button>
      <span aria-hidden="true" />
      <button type="button" onMouseDown={(event) => command(event, 'formatBlock', 'h1')}>
        H1
      </button>
      <button type="button" onMouseDown={(event) => command(event, 'formatBlock', 'h2')}>
        H2
      </button>
      <button type="button" onMouseDown={(event) => command(event, 'formatBlock', 'p')}>
        Text
      </button>
      <span aria-hidden="true" />
      <button type="button" title="Bulleted list" onMouseDown={(event) => command(event, 'insertUnorderedList')}>
        • List
      </button>
      <button type="button" title="Numbered list" onMouseDown={(event) => command(event, 'insertOrderedList')}>
        1. List
      </button>
      <button
        type="button"
        title="Add link"
        onMouseDown={(event) => {
          event.preventDefault()
          const url = window.prompt('Paste a link URL')
          if (url) {
            globalThis.document.execCommand('createLink', false, url)
            onChange()
          }
        }}
      >
        Link
      </button>
      <button type="button" title="Undo" onMouseDown={(event) => command(event, 'undo')}>
        Undo
      </button>
      <button type="button" title="Redo" onMouseDown={(event) => command(event, 'redo')}>
        Redo
      </button>
    </div>
  )
}

export default function DriveFileWorkspace({
  file,
  source = 'drive',
  onClose,
  onSaved,
}: {
  file: GoogleDriveFile
  source?: 'drive' | 'local'
  onClose: () => void
  onSaved: (file: GoogleDriveFile) => void
}) {
  const mode = driveWorkspaceMode(file)
  const sourceContentUrl =
    source === 'local'
      ? api.documents.contentUrl(file.id)
      : api.googleDrive.contentUrl(file.id)
  const editorRef = useRef<HTMLDivElement>(null)
  const [document, setDocument] = useState<GoogleDriveEditorDocument | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(mode === 'rich-text' || mode === 'markdown')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [markdownPreview, setMarkdownPreview] = useState(false)
  const [binaryPreviewUrl, setBinaryPreviewUrl] = useState('')

  useEffect(() => {
    if (mode !== 'pdf' && mode !== 'image') {
      setBinaryPreviewUrl('')
      return
    }
    const controller = new AbortController()
    let objectUrl = ''
    setLoading(true)
    setError('')
    setBinaryPreviewUrl('')
    void fetch(sourceContentUrl, {
      credentials: 'same-origin',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string }
          throw new Error(payload.error || 'Unable to load this file preview.')
        }
        return response.blob()
      })
      .then((blob) => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setBinaryPreviewUrl(objectUrl)
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : 'Unable to load this file preview.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [mode, sourceContentUrl])

  useEffect(() => {
    if (mode !== 'rich-text' && mode !== 'markdown') return
    let active = true
    setLoading(true)
    setError('')
    const editorApi =
      source === 'local' ? api.documents : api.googleDrive
    editorApi
      .getEditorDocument(file.id)
      .then((loaded) => {
        if (!active) return
        setDocument(loaded)
        setContent(loaded.content)
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Unable to open this document.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [file.id, mode, source])

  const renderedMarkdown = useMemo(() => {
    if (mode !== 'markdown' || !markdownPreview) return ''
    return DOMPurify.sanitize(marked.parse(content) as string)
  }, [content, markdownPreview, mode])

  const close = () => {
    if (dirty && !window.confirm('Close without saving your changes?')) return
    onClose()
  }

  const save = async () => {
    if (!document || !document.canEdit || saving) return
    setSaving(true)
    setError('')
    try {
      const saved =
        source === 'local'
          ? await api.documents.saveEditorDocument(document, content)
          : await api.googleDrive.saveEditorDocument(document, content)
      setDocument((current) =>
        current
          ? {
              ...current,
              ...saved,
              content,
            }
          : current,
      )
      setDirty(false)
      onSaved(saved)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save this document.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save()
      } else if (event.key === 'Escape') {
        close()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  const updateRichText = (event: FormEvent<HTMLDivElement>) => {
    setContent(event.currentTarget.innerHTML)
    setDirty(true)
  }

  const syncRichText = () => {
    if (!editorRef.current) return
    setContent(editorRef.current.innerHTML)
    setDirty(true)
  }

  const canSave = Boolean(document?.canEdit && dirty && !saving)
  return (
    <div className="drive-workspace" role="dialog" aria-modal="true" aria-label={file.name}>
      <header className="drive-workspace__header">
        <div>
          <span>{source === 'local' ? 'lancee document library' : 'Google Drive'}</span>
          <h2>{file.name}</h2>
        </div>
        <div className="drive-workspace__actions">
          {dirty && <span className="drive-workspace__unsaved">Unsaved changes</span>}
          {document && !document.canEdit && <span className="badge">View only</span>}
          {(mode === 'rich-text' || mode === 'markdown') && (
            <button
              type="button"
              className="button button--primary button--small"
              disabled={!canSave}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : source === 'local' ? 'Save in lancee' : 'Save to Drive'}
            </button>
          )}
          {source === 'local' && (
            <a
              className="button button--ghost button--small"
              href={api.documents.downloadUrl(file.id)}
              download={file.name}
            >
              Download
            </a>
          )}
          <button type="button" className="button button--ghost button--small" onClick={close}>
            Close
          </button>
        </div>
      </header>

      {error && <div className="dashboard-alert drive-workspace__alert">{error}</div>}

      <main className="drive-workspace__body">
        {loading && <div className="drive-workspace__loading">Preparing document editor…</div>}

        {!loading && mode === 'pdf' && binaryPreviewUrl && (
          <iframe className="drive-workspace__frame" src={binaryPreviewUrl} title={file.name} />
        )}

        {!loading && mode === 'image' && binaryPreviewUrl && (
          <div className="drive-workspace__image-stage">
            <img src={binaryPreviewUrl} alt={file.name} />
          </div>
        )}

        {!loading && error && (mode === 'pdf' || mode === 'image') && (
          <div className="drive-workspace__loading">
            <a className="button button--primary" href={sourceContentUrl} target="_blank" rel="noreferrer">
              Open file in a new tab
            </a>
          </div>
        )}

        {!loading && mode === 'unsupported' && (
          <div className="drive-workspace__loading">
            {source === 'local'
              ? <a className="button button--primary" href={api.documents.downloadUrl(file.id)}>Download {file.name}</a>
              : <span>This file type opens in its storage provider.</span>}
          </div>
        )}

        {!loading && document?.kind === 'markdown' && (
          <div className="drive-workspace__markdown">
            <div className="drive-workspace__view-switch">
              <button
                type="button"
                className={!markdownPreview ? 'is-active' : ''}
                onClick={() => setMarkdownPreview(false)}
              >
                Edit
              </button>
              <button
                type="button"
                className={markdownPreview ? 'is-active' : ''}
                onClick={() => setMarkdownPreview(true)}
              >
                Preview
              </button>
            </div>
            {markdownPreview ? (
              <article
                className="drive-workspace__paper drive-workspace__rendered-markdown"
                dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
              />
            ) : (
              <textarea
                value={content}
                readOnly={!document.canEdit}
                spellCheck
                onChange={(event) => {
                  setContent(event.target.value)
                  setDirty(true)
                }}
              />
            )}
          </div>
        )}

        {!loading && document?.kind === 'rich-text' && (
          <div className="drive-workspace__rich-text">
            {document.canEdit && <RichTextToolbar onChange={syncRichText} />}
            <p className="drive-workspace__conversion-note">
              Rich text is preserved; tracked changes and complex page layout may be simplified when saved.
              {document.warnings.length > 0 ? ' This file contains formatting conversion warnings.' : ''}
            </p>
            <div
              ref={editorRef}
              className="drive-workspace__paper drive-workspace__editable"
              contentEditable={document.canEdit}
              suppressContentEditableWarning
              spellCheck
              onInput={updateRichText}
              dangerouslySetInnerHTML={{ __html: document.content }}
            />
          </div>
        )}
      </main>
    </div>
  )
}
