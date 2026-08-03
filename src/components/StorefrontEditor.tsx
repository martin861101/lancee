import { useEffect, useState, type ChangeEvent, type DragEvent } from 'react'

export type StorefrontTemplateId = 'black-white' | 'blue-splash' | 'gold-dune' | 'red-tech' | 'gsap-flowish'
export type StorefrontMode = 'store' | 'basic'

type StorefrontBlockKind = 'hero' | 'text' | 'products' | 'logo' | 'cta'

interface StorefrontProduct {
  id: string
  name: string
  price: string
  detail: string
  imageUrl: string
}

interface StorefrontBlock {
  id: string
  kind: StorefrontBlockKind
  eyebrow?: string
  title?: string
  body?: string
  buttonText?: string
  heading?: string
  logoUrl?: string
  logoAlt?: string
  logoText?: string
  products?: StorefrontProduct[]
}

interface StorefrontDocument {
  blocks: StorefrontBlock[]
}

interface StorefrontEditorProps {
  workspaceId: string
  template: StorefrontTemplateId
  mode: StorefrontMode
  templateName: string
  onClose: () => void
}

interface BlockLibraryItem {
  kind: StorefrontBlockKind
  label: string
  description: string
  icon: string
}

const blockKinds: readonly StorefrontBlockKind[] = ['hero', 'text', 'products', 'logo', 'cta']

const blockLibrary: readonly BlockLibraryItem[] = [
  { kind: 'hero', label: 'Hero', description: 'Lead with a statement', icon: '✦' },
  { kind: 'products', label: 'Products', description: 'Showcase your catalog', icon: '▦' },
  { kind: 'logo', label: 'Logo', description: 'Add your brand mark', icon: '◒' },
  { kind: 'text', label: 'Text section', description: 'Tell your story', icon: 'T' },
  { kind: 'cta', label: 'Call to action', description: 'Guide the next click', icon: '→' },
]

const templateCopy: Record<StorefrontTemplateId, { eyebrow: string; title: string; body: string; logo: string }> = {
  'black-white': {
    eyebrow: 'New collection',
    title: 'Objects with a point of view.',
    body: 'A considered collection for everyday rituals and the people who make them their own.',
    logo: 'Northstar Studio',
  },
  'blue-splash': {
    eyebrow: 'The latest drop',
    title: 'Make every launch feel inevitable.',
    body: 'Bright ideas, useful objects, and a storefront built to move at your speed.',
    logo: 'Northstar Labs',
  },
  'gold-dune': {
    eyebrow: 'A slower collection',
    title: 'Objects made for the long way around.',
    body: 'Warm materials and lasting forms, selected for the moments worth lingering over.',
    logo: 'Northstar Atelier',
  },
  'red-tech': {
    eyebrow: 'SYSTEM / ONLINE',
    title: 'Ship better things.',
    body: 'A precise collection of tools for people who care how the work gets done.',
    logo: 'NORTHSTAR // 01',
  },
  'gsap-flowish': {
    eyebrow: 'Explore the collection',
    title: 'Move through the collection.',
    body: 'A gallery of useful forms, made to be discovered one frame at a time.',
    logo: 'Northstar Objects',
  },
}

const defaultProducts: readonly StorefrontProduct[] = [
  { id: 'product-1', name: 'Studio mug', price: '$18.00', detail: 'Accessories', imageUrl: '' },
  { id: 'product-2', name: 'Canvas tote', price: '$32.00', detail: 'Everyday carry', imageUrl: '' },
  { id: 'product-3', name: 'Field notebook', price: '$14.00', detail: 'Stationery', imageUrl: '' },
]

function editorStorageKey(workspaceId: string, template: StorefrontTemplateId, mode: StorefrontMode) {
  return `lancee:storefront-editor:${workspaceId}:${mode}:${template}`
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createBlock(kind: StorefrontBlockKind, template: StorefrontTemplateId): StorefrontBlock {
  const copy = templateCopy[template]
  const base = { id: createId(kind), kind }

  if (kind === 'hero') {
    return { ...base, eyebrow: copy.eyebrow, title: copy.title, body: copy.body, buttonText: 'Shop collection' }
  }
  if (kind === 'products') {
    return {
      ...base,
      eyebrow: 'Curated for you',
      heading: 'Featured products',
      products: defaultProducts.map((product) => ({ ...product, id: createId('product') })),
    }
  }
  if (kind === 'logo') {
    return { ...base, logoText: copy.logo, logoAlt: `${copy.logo} logo`, logoUrl: '' }
  }
  if (kind === 'text') {
    return {
      ...base,
      eyebrow: 'The story behind the collection',
      title: 'Made with intention.',
      body: 'Share what makes your products different. Give visitors a reason to stay, explore, and come back.',
    }
  }
  return {
    ...base,
    eyebrow: 'Keep exploring',
    title: 'Find your next everyday favorite.',
    body: 'Bring the collection home.',
    buttonText: 'View all products',
  }
}

function createDefaultDocument(template: StorefrontTemplateId, mode: StorefrontMode): StorefrontDocument {
  const blocks: StorefrontBlockKind[] = mode === 'store'
    ? ['hero', 'logo', 'products', 'text', 'cta']
    : ['hero', 'logo', 'text', 'cta']

  return {
    blocks: blocks.map((kind) => createBlock(kind, template)),
  }
}

function normalizeProduct(value: unknown, index: number): StorefrontProduct | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<StorefrontProduct>
  if (typeof candidate.name !== 'string') return null
  return {
    id: typeof candidate.id === 'string' ? candidate.id : `product-${index + 1}`,
    name: candidate.name,
    price: typeof candidate.price === 'string' ? candidate.price : '',
    detail: typeof candidate.detail === 'string' ? candidate.detail : '',
    imageUrl: typeof candidate.imageUrl === 'string' ? candidate.imageUrl : '',
  }
}

function isBlockKind(value: unknown): value is StorefrontBlockKind {
  return typeof value === 'string' && blockKinds.includes(value as StorefrontBlockKind)
}

function normalizeBlock(value: unknown, index: number, template: StorefrontTemplateId, mode: StorefrontMode): StorefrontBlock | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<StorefrontBlock>
  if (!isBlockKind(candidate.kind)) return null
  if (mode === 'basic' && candidate.kind === 'products') return null

  const defaults = createBlock(candidate.kind, template)
  const products = Array.isArray(candidate.products)
    ? candidate.products.map(normalizeProduct).filter((product): product is StorefrontProduct => Boolean(product))
    : defaults.products

  return {
    ...defaults,
    ...candidate,
    id: typeof candidate.id === 'string' ? candidate.id : `${candidate.kind}-${index + 1}`,
    products,
  }
}

function readDocument(workspaceId: string, template: StorefrontTemplateId, mode: StorefrontMode): StorefrontDocument {
  const fallback = createDefaultDocument(template, mode)
  if (typeof window === 'undefined') return fallback

  try {
    const stored = window.localStorage.getItem(editorStorageKey(workspaceId, template, mode))
    if (!stored) return fallback
    const parsed = JSON.parse(stored) as Partial<StorefrontDocument>
    const blocks = Array.isArray(parsed.blocks)
      ? parsed.blocks.map((block, index) => normalizeBlock(block, index, template, mode)).filter((block): block is StorefrontBlock => Boolean(block))
      : []
    return blocks.length > 0 ? { blocks } : fallback
  } catch {
    return fallback
  }
}

function parseDragPayload(event: DragEvent<HTMLElement>): { type: 'block'; id: string } | { type: 'palette'; kind: StorefrontBlockKind } | null {
  const raw = event.dataTransfer.getData('application/x-lancee-storefront-block')
  if (!raw) return null

  try {
    const payload = JSON.parse(raw) as { type?: string; id?: unknown; kind?: unknown }
    if (payload.type === 'block' && typeof payload.id === 'string') return { type: 'block', id: payload.id }
    if (payload.type === 'palette' && isBlockKind(payload.kind)) return { type: 'palette', kind: payload.kind }
  } catch {
    return null
  }
  return null
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <label className="storefront-editor__field">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={4} />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      )}
    </label>
  )
}

function BlockInspector({
  block,
  onChange,
  onProductChange,
  onAddProduct,
  onRemoveProduct,
  onLogoUpload,
  onDelete,
}: {
  block: StorefrontBlock
  onChange: (updates: Partial<StorefrontBlock>) => void
  onProductChange: (productId: string, updates: Partial<StorefrontProduct>) => void
  onAddProduct: () => void
  onRemoveProduct: (productId: string) => void
  onLogoUpload: (event: ChangeEvent<HTMLInputElement>) => void
  onDelete: () => void
}) {
  return (
    <div className="storefront-editor__inspector-content">
      <div className="storefront-editor__inspector-heading">
        <div>
          <span className="storefront-eyebrow">Editing section</span>
          <h3>{blockLibrary.find((item) => item.kind === block.kind)?.label}</h3>
        </div>
        <span className="storefront-editor__section-number">{block.kind}</span>
      </div>

      {block.kind === 'hero' && <>
        <TextField label="Eyebrow" value={block.eyebrow || ''} onChange={(value) => onChange({ eyebrow: value })} />
        <TextField label="Headline" value={block.title || ''} onChange={(value) => onChange({ title: value })} multiline />
        <TextField label="Description" value={block.body || ''} onChange={(value) => onChange({ body: value })} multiline />
        <TextField label="Button label" value={block.buttonText || ''} onChange={(value) => onChange({ buttonText: value })} />
      </>}

      {block.kind === 'text' && <>
        <TextField label="Eyebrow" value={block.eyebrow || ''} onChange={(value) => onChange({ eyebrow: value })} />
        <TextField label="Heading" value={block.title || ''} onChange={(value) => onChange({ title: value })} multiline />
        <TextField label="Body copy" value={block.body || ''} onChange={(value) => onChange({ body: value })} multiline />
      </>}

      {block.kind === 'cta' && <>
        <TextField label="Eyebrow" value={block.eyebrow || ''} onChange={(value) => onChange({ eyebrow: value })} />
        <TextField label="Heading" value={block.title || ''} onChange={(value) => onChange({ title: value })} multiline />
        <TextField label="Description" value={block.body || ''} onChange={(value) => onChange({ body: value })} multiline />
        <TextField label="Button label" value={block.buttonText || ''} onChange={(value) => onChange({ buttonText: value })} />
      </>}

      {block.kind === 'logo' && <>
        <TextField label="Brand name" value={block.logoText || ''} onChange={(value) => onChange({ logoText: value })} />
        <TextField label="Logo image URL" value={block.logoUrl || ''} onChange={(value) => onChange({ logoUrl: value })} placeholder="https://…" />
        <label className="storefront-editor__upload">
          <span>Upload logo</span>
          <input type="file" accept="image/*" onChange={onLogoUpload} />
          <small>PNG, JPG, SVG, or WebP</small>
        </label>
        <TextField label="Accessibility text" value={block.logoAlt || ''} onChange={(value) => onChange({ logoAlt: value })} />
      </>}

      {block.kind === 'products' && <>
        <TextField label="Eyebrow" value={block.eyebrow || ''} onChange={(value) => onChange({ eyebrow: value })} />
        <TextField label="Section heading" value={block.heading || ''} onChange={(value) => onChange({ heading: value })} />
        <div className="storefront-editor__product-list">
          <div className="storefront-editor__product-list-heading">
            <span>Products in this section</span>
            <button type="button" className="text-button" onClick={onAddProduct}>+ Add product</button>
          </div>
          {(block.products || []).map((product, index) => (
            <div className="storefront-editor__product-editor" key={product.id}>
              <div className="storefront-editor__product-editor-heading">
                <strong>Product {index + 1}</strong>
                <button type="button" className="text-button is-danger" onClick={() => onRemoveProduct(product.id)}>Remove</button>
              </div>
              <TextField label="Name" value={product.name} onChange={(value) => onProductChange(product.id, { name: value })} />
              <div className="storefront-editor__field-row">
                <TextField label="Price" value={product.price} onChange={(value) => onProductChange(product.id, { price: value })} />
                <TextField label="Category" value={product.detail} onChange={(value) => onProductChange(product.id, { detail: value })} />
              </div>
              <TextField label="Product image URL" value={product.imageUrl} onChange={(value) => onProductChange(product.id, { imageUrl: value })} placeholder="https://…" />
            </div>
          ))}
          {(block.products || []).length === 0 && <p className="storefront-editor__empty-products">Add a product to populate this section.</p>}
        </div>
      </>}

      <button type="button" className="storefront-editor__delete" onClick={onDelete}>Delete section</button>
    </div>
  )
}

export default function StorefrontEditor({ workspaceId, template, mode, templateName, onClose }: StorefrontEditorProps) {
  const [document, setDocument] = useState<StorefrontDocument>(() => readDocument(workspaceId, template, mode))
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(() => document.blocks[0]?.id || null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [saveLabel, setSaveLabel] = useState('Saved locally')

  useEffect(() => {
    try {
      window.localStorage.setItem(editorStorageKey(workspaceId, template, mode), JSON.stringify(document))
      setSaveLabel('Saved locally')
    } catch {
      setSaveLabel('Save failed — try a smaller image')
    }
  }, [document, mode, template, workspaceId])

  const selectedBlock = document.blocks.find((block) => block.id === selectedBlockId) || null

  const updateBlock = (blockId: string, updates: Partial<StorefrontBlock>) => {
    setDocument((current) => ({
      blocks: current.blocks.map((block) => block.id === blockId ? { ...block, ...updates } : block),
    }))
  }

  const addBlock = (kind: StorefrontBlockKind, beforeId?: string) => {
    const block = createBlock(kind, template)
    setDocument((current) => {
      const blocks = [...current.blocks]
      const index = beforeId ? blocks.findIndex((item) => item.id === beforeId) : -1
      blocks.splice(index >= 0 ? index : blocks.length, 0, block)
      return { blocks }
    })
    setSelectedBlockId(block.id)
  }

  const deleteBlock = (blockId: string) => {
    setDocument((current) => ({ blocks: current.blocks.filter((block) => block.id !== blockId) }))
    setSelectedBlockId((current) => current === blockId ? null : current)
  }

  const moveBlock = (blockId: string, direction: -1 | 1) => {
    setDocument((current) => {
      const blocks = [...current.blocks]
      const index = blocks.findIndex((block) => block.id === blockId)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= blocks.length) return current
      const [block] = blocks.splice(index, 1)
      blocks.splice(nextIndex, 0, block)
      return { blocks }
    })
  }

  const reorderBlock = (blockId: string, targetId: string) => {
    if (blockId === targetId) return
    setDocument((current) => {
      const blocks = [...current.blocks]
      const fromIndex = blocks.findIndex((block) => block.id === blockId)
      const targetIndex = blocks.findIndex((block) => block.id === targetId)
      if (fromIndex < 0 || targetIndex < 0) return current
      const [block] = blocks.splice(fromIndex, 1)
      blocks.splice(blocks.findIndex((item) => item.id === targetId), 0, block)
      return { blocks }
    })
  }

  const updateProduct = (blockId: string, productId: string, updates: Partial<StorefrontProduct>) => {
    setDocument((current) => ({
      blocks: current.blocks.map((block) => block.id === blockId
        ? { ...block, products: (block.products || []).map((product) => product.id === productId ? { ...product, ...updates } : product) }
        : block),
    }))
  }

  const addProduct = (blockId: string) => {
    const product: StorefrontProduct = {
      id: createId('product'),
      name: 'New product',
      price: '$0.00',
      detail: 'Category',
      imageUrl: '',
    }
    setDocument((current) => ({
      blocks: current.blocks.map((block) => block.id === blockId ? { ...block, products: [...(block.products || []), product] } : block),
    }))
  }

  const removeProduct = (blockId: string, productId: string) => {
    setDocument((current) => ({
      blocks: current.blocks.map((block) => block.id === blockId ? { ...block, products: (block.products || []).filter((product) => product.id !== productId) } : block),
    }))
  }

  const handleLogoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !selectedBlock) return
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') updateBlock(selectedBlock.id, { logoUrl: reader.result })
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const startDrag = (event: DragEvent<HTMLElement>, payload: { type: 'block'; id: string } | { type: 'palette'; kind: StorefrontBlockKind }) => {
    event.dataTransfer.effectAllowed = payload.type === 'block' ? 'move' : 'copy'
    event.dataTransfer.setData('application/x-lancee-storefront-block', JSON.stringify(payload))
    setDraggingId(payload.type === 'block' ? payload.id : null)
  }

  const dropOnBlock = (event: DragEvent<HTMLElement>, targetId: string) => {
    event.preventDefault()
    event.stopPropagation()
    const payload = parseDragPayload(event)
    if (!payload) return
    if (payload.type === 'block') reorderBlock(payload.id, targetId)
    if (payload.type === 'palette') addBlock(payload.kind, targetId)
    setDraggingId(null)
    setDropTargetId(null)
  }

  const dropAtEnd = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    const payload = parseDragPayload(event)
    if (!payload) return
    if (payload.type === 'palette') addBlock(payload.kind)
    if (payload.type === 'block') {
      const lastBlock = document.blocks[document.blocks.length - 1]
      if (lastBlock && lastBlock.id !== payload.id) reorderBlock(payload.id, lastBlock.id)
    }
    setDraggingId(null)
    setDropTargetId(null)
  }

  const renderBlock = (block: StorefrontBlock) => {
    if (block.kind === 'hero') {
      return <section className="storefront-editor__preview-hero"><div><span className="storefront-editor__preview-eyebrow">{block.eyebrow}</span><h1>{block.title}</h1><p>{block.body}</p>{block.buttonText && <span className="storefront-editor__preview-button">{block.buttonText} <b>↗</b></span>}</div><div className="storefront-editor__preview-hero-art"><span /></div></section>
    }
    if (block.kind === 'logo') {
      return <section className="storefront-editor__preview-logo">{block.logoUrl ? <img src={block.logoUrl} alt={block.logoAlt || ''} /> : <span className="storefront-editor__preview-logo-mark">{(block.logoText || 'BR').slice(0, 2).toUpperCase()}</span>}<strong>{block.logoText}</strong></section>
    }
    if (block.kind === 'products') {
      return <section className="storefront-editor__preview-products"><div className="storefront-editor__preview-section-heading"><div><span className="storefront-editor__preview-eyebrow">{block.eyebrow}</span><h2>{block.heading}</h2></div><span>{(block.products || []).length} products →</span></div><div className="storefront-editor__preview-product-grid">{(block.products || []).map((product, index) => <article key={product.id}><div className={`storefront-editor__preview-product-image product-tone-${index % 3}`}>{product.imageUrl && <img src={product.imageUrl} alt="" />}{!product.imageUrl && <span>{product.name.slice(0, 1).toUpperCase()}</span>}</div><div className="storefront-editor__preview-product-meta"><strong>{product.name}</strong><b>{product.price}</b></div><small>{product.detail}</small></article>)}</div></section>
    }
    if (block.kind === 'text') {
      return <section className="storefront-editor__preview-text"><span className="storefront-editor__preview-eyebrow">{block.eyebrow}</span><h2>{block.title}</h2><p>{block.body}</p></section>
    }
    return <section className="storefront-editor__preview-cta"><div><span className="storefront-editor__preview-eyebrow">{block.eyebrow}</span><h2>{block.title}</h2><p>{block.body}</p></div>{block.buttonText && <span className="storefront-editor__preview-button">{block.buttonText} <b>↗</b></span>}</section>
  }

  return (
    <section className="storefront-editor" aria-labelledby="storefront-editor-title">
      <header className="storefront-editor__header">
        <div>
          <span className="storefront-eyebrow">Template editor</span>
          <h2 id="storefront-editor-title">Edit {templateName}</h2>
          <p>Drag sections into a new order, then select one to change its copy{mode === 'store' ? ', products,' : ''} or logo.</p>
        </div>
        <div className="storefront-editor__header-actions">
          <span className="storefront-editor__save-status"><i />{saveLabel}</span>
          <button type="button" className="button button--secondary" onClick={onClose}>Done editing</button>
        </div>
      </header>

      <div className="storefront-editor__layout">
        <aside className="storefront-editor__panel storefront-editor__palette" aria-label="Add storefront sections">
          <div className="storefront-editor__panel-heading"><span className="storefront-eyebrow">Content blocks</span><h3>Add to page</h3></div>
          <p className="storefront-editor__hint">Drag a block into the canvas or click to add it at the bottom.</p>
          <div className="storefront-editor__palette-list">
            {blockLibrary.filter((item) => mode === 'store' || item.kind !== 'products').map((item) => <button key={item.kind} type="button" className="storefront-editor__palette-item" draggable onDragStart={(event) => startDrag(event, { type: 'palette', kind: item.kind })} onClick={() => addBlock(item.kind)}><span className="storefront-editor__palette-icon">{item.icon}</span><span><strong>{item.label}</strong><small>{item.description}</small></span><b>+</b></button>)}
          </div>
          <div className="storefront-editor__tip"><span>↕</span><p>Reorder any section with its drag handle. Your changes are saved automatically for this workspace.</p></div>
        </aside>

        <div className={`storefront-editor__canvas-shell storefront-editor__canvas-shell--${template}`}>
          <div className="storefront-editor__canvas-toolbar"><span><i />Live canvas</span><small>{mode === 'store' ? 'Desktop storefront' : 'Desktop page'} · {document.blocks.length} sections</small></div>
          <div className={`storefront-editor__canvas storefront-editor__canvas--${template}`} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={dropAtEnd}>
            {document.blocks.length === 0 && <div className="storefront-editor__empty-canvas"><span>+</span><strong>Drop a section here</strong><small>Choose a content block from the left.</small></div>}
            {document.blocks.map((block, index) => <div key={block.id} className={`storefront-editor__block${selectedBlockId === block.id ? ' is-selected' : ''}${draggingId === block.id ? ' is-dragging' : ''}${dropTargetId === block.id ? ' is-drop-target' : ''}`} draggable onClick={() => setSelectedBlockId(block.id)} onDragStart={(event) => startDrag(event, { type: 'block', id: block.id })} onDragEnd={() => { setDraggingId(null); setDropTargetId(null) }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); setDropTargetId(block.id); event.dataTransfer.dropEffect = 'move' }} onDrop={(event) => dropOnBlock(event, block.id)} aria-label={`${blockLibrary.find((item) => item.kind === block.kind)?.label} section`}>
              <div className="storefront-editor__block-toolbar"><span className="storefront-editor__drag-handle" title="Drag to reorder">⠿</span><strong>{blockLibrary.find((item) => item.kind === block.kind)?.label}</strong><span className="storefront-editor__block-actions"><button type="button" onClick={(event) => { event.stopPropagation(); moveBlock(block.id, -1) }} disabled={index === 0} aria-label="Move section up">↑</button><button type="button" onClick={(event) => { event.stopPropagation(); moveBlock(block.id, 1) }} disabled={index === document.blocks.length - 1} aria-label="Move section down">↓</button><button type="button" onClick={(event) => { event.stopPropagation(); deleteBlock(block.id) }} aria-label="Delete section">×</button></span></div>
              {renderBlock(block)}
            </div>)}
            {document.blocks.length > 0 && <div className="storefront-editor__drop-tail"><span>Drop here to add to the end</span></div>}
          </div>
        </div>

        <aside className="storefront-editor__panel storefront-editor__inspector" aria-label="Edit selected storefront section">
          {selectedBlock ? <BlockInspector block={selectedBlock} onChange={(updates) => updateBlock(selectedBlock.id, updates)} onProductChange={(productId, updates) => updateProduct(selectedBlock.id, productId, updates)} onAddProduct={() => addProduct(selectedBlock.id)} onRemoveProduct={(productId) => removeProduct(selectedBlock.id, productId)} onLogoUpload={handleLogoUpload} onDelete={() => deleteBlock(selectedBlock.id)} /> : <div className="storefront-editor__inspector-empty"><span>✦</span><h3>Select a section</h3><p>Choose a section in the canvas to edit its text, products, or logo.</p></div>}
        </aside>
      </div>
    </section>
  )
}
