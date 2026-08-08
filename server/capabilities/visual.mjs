import sharp from 'sharp'
import { LanceeCapabilityError, textInput } from './registry.mjs'

const MAX_IMAGE_BYTES = 10_000_000
const MAX_IMAGE_PIXELS = 20_000_000
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

function hex(red, green, blue) {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

async function loadImage(database, context, input) {
  const fileId = textInput(input, 'file_id', { required: true, maxLength: 100 })
  const file = await database.getWorkspaceDocument(context.workspace.id, fileId)
  if (!file) throw new LanceeCapabilityError('NOT_FOUND', 'The workspace image was not found.', 404)
  if (!SUPPORTED_IMAGE_TYPES.has(file.mimeType)) {
    throw new LanceeCapabilityError('UNSUPPORTED_MEDIA_TYPE', 'Visual inspection supports PNG, JPEG, and WebP files.', 415)
  }
  if (file.body.byteLength > MAX_IMAGE_BYTES) {
    throw new LanceeCapabilityError('BODY_TOO_LARGE', 'The image exceeds 10 MB.', 413)
  }
  return file
}

async function imageMetadata(sharpImpl, file) {
  let metadata
  try {
    metadata = await sharpImpl(file.body, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata()
  } catch {
    throw new LanceeCapabilityError('INVALID_MEDIA', 'The image could not be decoded.', 422)
  }
  if ((metadata.width || 0) * (metadata.height || 0) > MAX_IMAGE_PIXELS) {
    throw new LanceeCapabilityError('BODY_TOO_LARGE', 'The image exceeds 20 megapixels.', 413)
  }
  return metadata
}

async function palette(sharpImpl, file, limit) {
  let output
  try {
    output = await sharpImpl(file.body, { limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate()
      .resize({ width: 64, height: 64, fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
  } catch {
    throw new LanceeCapabilityError('INVALID_MEDIA', 'The image palette could not be decoded.', 422)
  }
  const counts = new Map()
  const channels = output.info.channels
  for (let index = 0; index < output.data.length; index += channels) {
    const alpha = output.data[index + 3]
    if (alpha < 32) continue
    const red = Math.min(255, Math.round(output.data[index] / 32) * 32)
    const green = Math.min(255, Math.round(output.data[index + 1] / 32) * 32)
    const blue = Math.min(255, Math.round(output.data[index + 2] / 32) * 32)
    const color = hex(red, green, blue)
    counts.set(color, (counts.get(color) || 0) + 1)
  }
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0) || 1
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([color, count]) => ({ color, percentage: Math.round((count / total) * 10_000) / 100 }))
}

export function createVisualCapabilities({ database, sharpImpl = sharp } = {}) {
  if (!database?.getWorkspaceDocument) {
    throw new TypeError('Visual capabilities require the Lancee database adapter.')
  }
  const fileInput = {
    type: 'object',
    properties: { file_id: { type: 'string', minLength: 1, maxLength: 100 } },
    required: ['file_id'],
    additionalProperties: false,
  }
  return [
    {
      id: 'visual.inspect',
      namespace: 'visual',
      version: '1.0.0',
      description: 'Inspect deterministic metadata for a workspace-owned PNG, JPEG, or WebP image.',
      provider: 'lancee.visual.sharp',
      inputSchema: fileInput,
      outputSchema: { type: 'object', required: ['fileId', 'mimeType', 'width', 'height', 'format'] },
      requiredPermissions: ['files:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 10_000,
      concurrencyLimit: 2,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['visual', 'image', 'metadata'],
      async execute({ input, context }) {
        const file = await loadImage(database, context, input)
        const metadata = await imageMetadata(sharpImpl, file)
        return {
          fileId: file.id,
          name: file.name,
          mimeType: file.mimeType,
          size: file.size,
          sha256: file.sha256,
          width: metadata.width || null,
          height: metadata.height || null,
          format: metadata.format || null,
          space: metadata.space || null,
          channels: metadata.channels || null,
          hasAlpha: Boolean(metadata.hasAlpha),
          orientation: metadata.orientation || null,
        }
      },
    },
    {
      id: 'visual.extract-palette',
      namespace: 'visual',
      version: '1.0.0',
      description: 'Extract a deterministic, downsampled dominant-colour palette from a workspace image.',
      provider: 'lancee.visual.sharp',
      inputSchema: {
        type: 'object',
        properties: {
          file_id: { type: 'string', minLength: 1, maxLength: 100 },
          colors: { type: 'integer', minimum: 1, maximum: 12 },
        },
        required: ['file_id'],
        additionalProperties: false,
      },
      outputSchema: { type: 'object', required: ['fileId', 'palette'] },
      requiredPermissions: ['files:read'],
      riskLevel: 'read',
      requiresApproval: false,
      timeoutMs: 10_000,
      concurrencyLimit: 2,
      estimatedCost: 0,
      supportsAsync: false,
      tags: ['visual', 'image', 'palette', 'color'],
      async execute({ input, context }) {
        const file = await loadImage(database, context, input)
        await imageMetadata(sharpImpl, file)
        return {
          fileId: file.id,
          palette: await palette(sharpImpl, file, Number.isInteger(input.colors) ? input.colors : 6),
          method: '32-level RGB quantization after bounded 64×64 downsampling',
        }
      },
    },
  ]
}
