import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const KEY_LENGTH = 32
const TAG_LENGTH = 16

export class VaultError extends Error {
  constructor(code, message, status = 500, details = {}) {
    super(message)
    this.name = 'VaultError'
    this.code = code
    this.status = status
    Object.assign(this, details)
  }
}

export function generateMasterKey() {
  return randomBytes(KEY_LENGTH).toString('hex')
}

function parseMasterKey(masterKeyString, variableName) {
  if (!masterKeyString) {
    throw new VaultError(
      'VAULT_KEY_MISSING',
      `${variableName} is not configured. Set a 64-character hex key before storing integration tokens.`,
      503,
    )
  }
  const keyBuffer = Buffer.from(masterKeyString, 'hex')
  if (keyBuffer.length !== KEY_LENGTH) {
    throw new VaultError(
      'VAULT_KEY_INVALID',
      `${variableName} must be 64 hexadecimal characters (32 bytes).`,
      503,
    )
  }
  return keyBuffer
}

function getMasterKeys() {
  const current = parseMasterKey(
    process.env.ENCRYPTION_MASTER_KEY,
    'ENCRYPTION_MASTER_KEY',
  )
  const previousValue = process.env.ENCRYPTION_MASTER_KEY_PREVIOUS
  return previousValue
    ? [current, parseMasterKey(previousValue, 'ENCRYPTION_MASTER_KEY_PREVIOUS')]
    : [current]
}

function getMasterKey() {
  return getMasterKeys()[0]
}

export function encryptToken(plainTextToken) {
  const key = getMasterKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(String(plainTextToken), 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()
  if (authTag.length !== TAG_LENGTH) {
    throw new VaultError('VAULT_TAG_LENGTH', 'Unexpected authentication tag length.')
  }

  return {
    encrypted_access_token: encrypted,
    iv: iv.toString('hex'),
    auth_tag: authTag.toString('hex'),
  }
}

export function decryptToken(encryptedData) {
  const ivBuffer = Buffer.from(encryptedData.iv, 'hex')
  const authTagBuffer = Buffer.from(encryptedData.auth_tag, 'hex')

  if (ivBuffer.length !== IV_LENGTH || authTagBuffer.length !== TAG_LENGTH) {
    throw new VaultError('VAULT_PAYLOAD_INVALID', 'The stored token payload is malformed.')
  }

  for (const key of getMasterKeys()) {
    try {
      const decipher = createDecipheriv(ALGORITHM, key, ivBuffer)
      decipher.setAuthTag(authTagBuffer)
      let decrypted = decipher.update(
        encryptedData.encrypted_access_token,
        'hex',
        'utf8',
      )
      decrypted += decipher.final('utf8')
      return decrypted
    } catch {
      // Try the previous rotation key before reporting a tampered payload.
    }
  }

  throw new VaultError(
    'VAULT_DECRYPT_FAILED',
    'Token decryption failed. The payload may have been tampered with or the master key changed.',
    500,
  )
}
