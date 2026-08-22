import { isIP } from 'node:net'
import { lookup, resolveMx } from 'node:dns/promises'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import nodemailer from 'nodemailer'
import sanitizeHtml from 'sanitize-html'

const CONNECTION_TIMEOUT_MS = 15_000
const MAX_MESSAGE_BYTES = 10 * 1024 * 1024
const MAX_LIST_MESSAGES = 100

const PROVIDERS = [
  {
    id: 'google',
    name: 'Google Workspace / Gmail',
    domains: ['gmail.com', 'googlemail.com'],
    mx: ['google.com', 'googlemail.com'],
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    smtpSecure: true,
    instructions: [
      'Turn on 2-Step Verification for the Google account.',
      'Create an App password in Google Account > Security > App passwords.',
      'Use the full email address as the username and the 16-character app password here.',
    ],
  },
  {
    id: 'microsoft',
    name: 'Microsoft 365 / Outlook',
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    mx: ['outlook.com', 'microsoft.com'],
    imapHost: 'outlook.office365.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.office365.com',
    smtpPort: 587,
    smtpSecure: false,
    instructions: [
      'Make sure IMAP and authenticated SMTP are allowed for the mailbox.',
      'Use the full email address as the username.',
      'If multi-factor authentication is enabled, use an app password. Some Microsoft tenants require an administrator to allow password-based mail access.',
    ],
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    domains: ['yahoo.com', 'ymail.com', 'rocketmail.com'],
    mx: ['yahoodns.net', 'yahoo.com'],
    imapHost: 'imap.mail.yahoo.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.yahoo.com',
    smtpPort: 465,
    smtpSecure: true,
    instructions: [
      'Open Yahoo Account Security and generate an app password.',
      'Use the full Yahoo email address as the username.',
      'Paste the generated app password instead of the normal account password.',
    ],
  },
  {
    id: 'apple',
    name: 'iCloud Mail',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    mx: ['icloud.com', 'apple.com'],
    imapHost: 'imap.mail.me.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.mail.me.com',
    smtpPort: 587,
    smtpSecure: false,
    instructions: [
      'Create an app-specific password at account.apple.com.',
      'Use the complete iCloud email address as the username.',
      'Paste the app-specific password here.',
    ],
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    domains: ['fastmail.com', 'fastmail.fm'],
    mx: ['messagingengine.com', 'fastmail.com'],
    imapHost: 'imap.fastmail.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.fastmail.com',
    smtpPort: 465,
    smtpSecure: true,
    instructions: [
      'Create an app password in Fastmail Settings > Privacy & Security > Integrations.',
      'Give it Mail access and use the full email address as the username.',
    ],
  },
  {
    id: 'zoho',
    name: 'Zoho Mail',
    domains: ['zoho.com', 'zohomail.com'],
    mx: ['zoho.com', 'zohomail.com'],
    imapHost: 'imap.zoho.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.zoho.com',
    smtpPort: 465,
    smtpSecure: true,
    instructions: [
      'Enable IMAP access in Zoho Mail settings.',
      'If two-factor authentication is enabled, create an application-specific password.',
      'Use the full email address as the username.',
    ],
  },
]

export class MailConnectorError extends Error {
  constructor(code, message, status = 502, details = {}) {
    super(message)
    this.name = 'MailConnectorError'
    this.code = code
    this.status = status
    Object.assign(this, details)
  }
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

function providerResponse(provider, email, detected) {
  const domain = email.split('@')[1].toLowerCase()
  return {
    detected,
    provider: provider?.id || 'custom',
    providerName: provider?.name || 'Other mail provider',
    username: email,
    imapHost: provider?.imapHost || `imap.${domain}`,
    imapPort: provider?.imapPort || 993,
    imapSecure: provider?.imapSecure ?? true,
    smtpHost: provider?.smtpHost || `smtp.${domain}`,
    smtpPort: provider?.smtpPort || 465,
    smtpSecure: provider?.smtpSecure ?? true,
    instructions: provider?.instructions || [
      'Open your mail provider’s help page and search for “IMAP and SMTP settings”.',
      'Enter the incoming IMAP hostname and port, then the outgoing SMTP hostname and port.',
      'Use TLS/SSL where available. If multi-factor authentication is enabled, create an app password.',
      'Your username is usually your complete email address.',
    ],
  }
}

export async function discoverMailSettings(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase()
  if (!validEmail(email)) {
    throw new MailConnectorError('MAIL_EMAIL_INVALID', 'Enter a valid email address.', 400)
  }
  const domain = email.split('@')[1]
  let provider = PROVIDERS.find((candidate) => candidate.domains.includes(domain))
  if (!provider) {
    try {
      const exchanges = (await resolveMx(domain)).map((record) => record.exchange.toLowerCase())
      provider = PROVIDERS.find((candidate) =>
        exchanges.some((exchange) => candidate.mx.some((suffix) => exchange === suffix || exchange.endsWith(`.${suffix}`))),
      )
    } catch {
      // Manual setup remains available when the domain has no discoverable MX records.
    }
  }
  return providerResponse(provider, email, Boolean(provider))
}

function privateAddress(address) {
  if (!isIP(address)) return true
  if (address === '::1' || address === '0.0.0.0' || address === '127.0.0.1') return true
  if (address.startsWith('10.') || address.startsWith('192.168.') || address.startsWith('169.254.')) return true
  const second = Number(address.split('.')[1])
  if (address.startsWith('172.') && second >= 16 && second <= 31) return true
  const normalized = address.toLowerCase()
  return normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')
}

async function assertSafeHost(host) {
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(host)) {
    throw new MailConnectorError('MAIL_HOST_INVALID', 'Enter a valid public mail server hostname.', 400)
  }
  if (process.env.MAIL_ALLOW_PRIVATE_HOSTS === 'true' && process.env.NODE_ENV !== 'production') return
  let records
  try {
    records = await lookup(host, { all: true, verbatim: true })
  } catch {
    throw new MailConnectorError('MAIL_HOST_NOT_FOUND', `The mail server ${host} could not be found.`, 400)
  }
  if (!records.length || records.some((record) => privateAddress(record.address))) {
    throw new MailConnectorError('MAIL_HOST_PRIVATE', 'Private or local mail server addresses are not allowed.', 400)
  }
}

export async function normalizeMailSettings(input) {
  const email = String(input?.email || '').trim().toLowerCase()
  const username = String(input?.username || '').trim()
  const displayName = String(input?.displayName || '').trim().slice(0, 120)
  const imapHost = String(input?.imapHost || '').trim().toLowerCase()
  const smtpHost = String(input?.smtpHost || '').trim().toLowerCase()
  const imapPort = Number(input?.imapPort)
  const smtpPort = Number(input?.smtpPort)
  if (!validEmail(email)) throw new MailConnectorError('MAIL_EMAIL_INVALID', 'Enter a valid email address.', 400)
  if (!username || username.length > 320) throw new MailConnectorError('MAIL_USERNAME_INVALID', 'Enter the mailbox username.', 400)
  if (!Number.isInteger(imapPort) || imapPort < 1 || imapPort > 65535) throw new MailConnectorError('MAIL_IMAP_PORT_INVALID', 'Enter a valid IMAP port.', 400)
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new MailConnectorError('MAIL_SMTP_PORT_INVALID', 'Enter a valid SMTP port.', 400)
  await Promise.all([assertSafeHost(imapHost), assertSafeHost(smtpHost)])
  return {
    email,
    username,
    displayName,
    provider: String(input?.provider || 'custom').slice(0, 40),
    imapHost,
    imapPort,
    imapSecure: Boolean(input?.imapSecure),
    smtpHost,
    smtpPort,
    smtpSecure: Boolean(input?.smtpSecure),
  }
}

function imapClient(settings, password) {
  return new ImapFlow({
    host: settings.imapHost,
    port: settings.imapPort,
    secure: settings.imapSecure,
    doSTARTTLS: settings.imapSecure ? undefined : true,
    auth: { user: settings.username, pass: password },
    logger: false,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: CONNECTION_TIMEOUT_MS,
    socketTimeout: 30_000,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  })
}

function smtpTransport(settings, password) {
  return nodemailer.createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    requireTLS: !settings.smtpSecure,
    auth: { user: settings.username, pass: password },
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: CONNECTION_TIMEOUT_MS,
    socketTimeout: 30_000,
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  })
}

async function withImap(settings, password, operation) {
  const client = imapClient(settings, password)
  try {
    await client.connect()
    return await operation(client)
  } catch (error) {
    if (error instanceof MailConnectorError) throw error
    const authentication = /auth|credential|login|password/i.test(`${error?.code || ''} ${error?.message || ''}`)
    throw new MailConnectorError(
      authentication ? 'MAIL_AUTH_FAILED' : 'MAIL_IMAP_FAILED',
      authentication
        ? 'The mail server rejected the username or password. Use an app password if your provider requires one.'
        : `Unable to connect to the incoming mail server: ${error?.message || 'connection failed'}`,
      authentication ? 401 : 502,
    )
  } finally {
    if (client.usable) await client.logout().catch(() => client.close())
    else client.close()
  }
}

export async function testMailAccount(settings, password) {
  if (!password || String(password).length > 1_024) {
    throw new MailConnectorError('MAIL_PASSWORD_REQUIRED', 'Enter the mailbox password or app password.', 400)
  }
  const inbox = await withImap(settings, password, async (client) => {
    const mailbox = await client.mailboxOpen('INBOX', { readOnly: true })
    return {
      messages: Number(mailbox.exists || 0),
      lastSeenUid: Math.max(0, Number(mailbox.uidNext || 1) - 1),
    }
  })
  try {
    const transport = smtpTransport(settings, password)
    await transport.verify()
    transport.close()
  } catch (error) {
    throw new MailConnectorError(
      'MAIL_SMTP_FAILED',
      `Incoming mail connected, but outgoing mail failed: ${error?.message || 'connection failed'}`,
      502,
    )
  }
  return inbox
}

function addressList(addresses = []) {
  return addresses
    .filter((address) => address?.address)
    .map((address) => ({ name: address.name || '', address: address.address }))
}

function summaryFromMessage(message, folder) {
  const envelope = message.envelope || {}
  const rawDate = envelope.date || message.internalDate || new Date()
  const parsedDate = new Date(rawDate)
  return {
    uid: message.uid,
    folder,
    messageId: envelope.messageId || '',
    subject: envelope.subject || '(No subject)',
    from: addressList(envelope.from),
    to: addressList(envelope.to),
    cc: addressList(envelope.cc),
    date: Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString(),
    unread: !message.flags?.has('\\Seen'),
    flagged: Boolean(message.flags?.has('\\Flagged')),
    size: Number(message.size || 0),
    snippet: '',
  }
}

export async function listMailFolders(settings, password) {
  return await withImap(settings, password, async (client) => {
    const folders = await client.list()
    return folders
      .filter((folder) => !folder.flags?.has('\\Noselect'))
      .map((folder) => ({
        path: folder.path,
        name: folder.name || folder.path,
        delimiter: folder.delimiter || '/',
        specialUse: folder.specialUse || null,
      }))
      .sort((left, right) => {
        if (left.path.toUpperCase() === 'INBOX') return -1
        if (right.path.toUpperCase() === 'INBOX') return 1
        return left.name.localeCompare(right.name)
      })
  })
}

export async function listMailMessages(settings, password, { folder = 'INBOX', query = '', limit = 50 } = {}) {
  const safeLimit = Math.min(MAX_LIST_MESSAGES, Math.max(1, Number(limit) || 50))
  return await withImap(settings, password, async (client) => {
    const lock = await client.getMailboxLock(folder, { readOnly: true })
    try {
      const exists = Number(client.mailbox?.exists || 0)
      if (!exists) return []
      let sequences
      if (query.trim()) {
        sequences = await client.search({ or: [
          { subject: query.trim() },
          { from: query.trim() },
          { to: query.trim() },
          { body: query.trim() },
        ] }) || []
        sequences = sequences.slice(-safeLimit)
      } else {
        const start = Math.max(1, exists - safeLimit + 1)
        sequences = `${start}:*`
      }
      if (Array.isArray(sequences) && !sequences.length) return []
      const messages = []
      for await (const message of client.fetch(sequences, {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
        size: true,
      })) {
        messages.push(summaryFromMessage(message, folder))
      }
      return messages.reverse()
    } finally {
      lock.release()
    }
  })
}

function cleanMessageHtml(value) {
  return sanitizeHtml(String(value || ''), {
    allowedTags: ['p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'],
    allowedAttributes: { a: ['href', 'title', 'target', 'rel'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }) },
  })
}

async function parsedMessage(message, folder) {
  if (!message?.source) throw new MailConnectorError('MAIL_MESSAGE_NOT_FOUND', 'Message not found.', 404)
  const parsed = await simpleParser(message.source, { skipImageLinks: true, maxHtmlLengthToParse: MAX_MESSAGE_BYTES })
  const summary = summaryFromMessage({ ...message, envelope: message.envelope || {
    subject: parsed.subject,
    messageId: parsed.messageId,
    date: parsed.date,
    from: parsed.from?.value,
    to: parsed.to?.value,
    cc: parsed.cc?.value,
  } }, folder)
  return {
    ...summary,
    replyTo: parsed.replyTo?.value || [],
    inReplyTo: String(parsed.inReplyTo || '').trim() || null,
    references: (Array.isArray(parsed.references) ? parsed.references : [parsed.references])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
    text: String(parsed.text || '').slice(0, MAX_MESSAGE_BYTES),
    html: cleanMessageHtml(parsed.html || ''),
    attachments: (parsed.attachments || []).map((attachment) => ({
      filename: attachment.filename || 'attachment',
      contentType: attachment.contentType || 'application/octet-stream',
      size: attachment.size || 0,
      contentId: attachment.contentId || null,
    })),
  }
}

export async function getMailMessage(settings, password, { folder = 'INBOX', uid }) {
  return await withImap(settings, password, async (client) => {
    const lock = await client.getMailboxLock(folder)
    try {
      const message = await client.fetchOne(String(uid), {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
        size: true,
        source: { maxLength: MAX_MESSAGE_BYTES },
      }, { uid: true })
      if (!message) throw new MailConnectorError('MAIL_MESSAGE_NOT_FOUND', 'Message not found.', 404)
      if (Number(message.size || 0) > MAX_MESSAGE_BYTES) {
        throw new MailConnectorError('MAIL_MESSAGE_TOO_LARGE', 'This message is larger than the 10 MB reading limit.', 413)
      }
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true })
      return await parsedMessage(message, folder)
    } finally {
      lock.release()
    }
  })
}

function recipientList(value, label) {
  const recipients = Array.isArray(value) ? value : String(value || '').split(',')
  const cleaned = recipients.map((item) => String(item).trim()).filter(Boolean)
  if (label === 'to' && !cleaned.length) throw new MailConnectorError('MAIL_RECIPIENT_REQUIRED', 'Add at least one recipient.', 400)
  if (cleaned.some((address) => !validEmail(address))) throw new MailConnectorError('MAIL_RECIPIENT_INVALID', `One or more ${label.toUpperCase()} addresses are invalid.`, 400)
  return cleaned
}

export async function sendMailMessage(settings, password, input) {
  const to = recipientList(input?.to, 'to')
  const cc = recipientList(input?.cc, 'cc')
  const bcc = recipientList(input?.bcc, 'bcc')
  const subject = String(input?.subject || '').trim().slice(0, 998)
  const text = String(input?.body || '').trim()
  if (!subject) throw new MailConnectorError('MAIL_SUBJECT_REQUIRED', 'Enter a subject.', 400)
  if (!text || text.length > MAX_MESSAGE_BYTES) throw new MailConnectorError('MAIL_BODY_INVALID', 'Enter a message up to 10 MB.', 400)
  try {
    const transport = smtpTransport(settings, password)
    const result = await transport.sendMail({
      from: { name: settings.displayName || '', address: settings.email },
      to,
      cc: cc.length ? cc : undefined,
      bcc: bcc.length ? bcc : undefined,
      subject,
      text,
      inReplyTo: input?.inReplyTo || undefined,
      references: Array.isArray(input?.references) && input.references.length
        ? input.references
        : undefined,
    })
    transport.close()
    return { messageId: result.messageId, accepted: result.accepted || [], rejected: result.rejected || [] }
  } catch (error) {
    throw new MailConnectorError('MAIL_SEND_FAILED', `Unable to send the message: ${error?.message || 'delivery failed'}`, 502)
  }
}

export async function fetchNewMailMessages(settings, password, lastSeenUid, limit = 50) {
  return await withImap(settings, password, async (client) => {
    const lock = await client.getMailboxLock('INBOX', { readOnly: true })
    try {
      const maximumUid = Math.max(0, Number(client.mailbox?.uidNext || 1) - 1)
      if (maximumUid <= Number(lastSeenUid || 0)) return { messages: [], maximumUid }
      let uids = await client.search({ uid: `${Number(lastSeenUid || 0) + 1}:*` }, { uid: true }) || []
      uids = uids.slice(-Math.min(100, Math.max(1, Number(limit) || 50)))
      if (!uids.length) return { messages: [], maximumUid }
      const messages = []
      for await (const message of client.fetch(uids, {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
        size: true,
        source: { maxLength: MAX_MESSAGE_BYTES },
      }, { uid: true })) {
        if (Number(message.size || 0) <= MAX_MESSAGE_BYTES) {
          messages.push(await parsedMessage(message, 'INBOX'))
        }
      }
      return { messages, maximumUid }
    } finally {
      lock.release()
    }
  })
}
