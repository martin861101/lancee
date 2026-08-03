const MAIL_TEMPLATE_PATTERN = /\{\{(sender|senderEmail|senderName|recipient|recipientEmail|subject|body|messageId|ruleId)\}\}/g

function normalizedAddress(value) {
  return String(value || '').trim().toLowerCase()
}

function addressesFromMessage(message, key) {
  return (message?.[key] || [])
    .map((address) => normalizedAddress(address?.address))
    .filter(Boolean)
}

function criterionMatches(addresses, criterion) {
  const value = normalizedAddress(criterion)
  if (!value) return false
  return addresses.some((address) => value.includes('@') && !value.startsWith('@')
    ? address === value
    : address.includes(value))
}

function firstAddress(message, key) {
  return (message?.[key] || []).find((address) => address?.address) || null
}

function templateValues(rule, message) {
  const sender = firstAddress(message, 'from')
  const recipients = [...(message?.to || []), ...(message?.cc || [])]
  const firstRecipient = recipients.find((address) => address?.address) || null
  return {
    sender: addressesFromMessage(message, 'from').join(', '),
    senderEmail: normalizedAddress(sender?.address),
    senderName: String(sender?.name || sender?.address || '').trim(),
    recipient: recipients.map((address) => normalizedAddress(address?.address)).filter(Boolean).join(', '),
    recipientEmail: normalizedAddress(firstRecipient?.address),
    subject: String(message?.subject || ''),
    body: String(message?.text || '').slice(0, 2_000),
    messageId: String(message?.messageId || `uid:${message?.uid || ''}`),
    ruleId: String(rule?.id || ''),
  }
}

function expandTemplates(value, values) {
  if (typeof value === 'string') {
    return value.replace(MAIL_TEMPLATE_PATTERN, (_match, key) => values[key] ?? '')
  }
  if (Array.isArray(value)) return value.map((item) => expandTemplates(item, values))
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, expandTemplates(child, values)]),
    )
  }
  return value
}

export function mailRuleMatches(rule, message) {
  const senders = addressesFromMessage(message, 'from')
  const recipients = [
    ...addressesFromMessage(message, 'to'),
    ...addressesFromMessage(message, 'cc'),
  ]
  const subject = String(message?.subject || '').trim().toLowerCase()
  const searchable = `${subject}\n${String(message?.text || '').toLowerCase()}`
  const checks = []

  if (rule?.sender) checks.push(criterionMatches(senders, rule.sender))
  if (rule?.recipient) checks.push(criterionMatches(recipients, rule.recipient))
  if (rule?.subject) checks.push(subject.includes(normalizedAddress(rule.subject)))

  const keywords = Array.isArray(rule?.keywords) ? rule.keywords.filter(Boolean) : []
  if (keywords.length) {
    const keywordChecks = keywords.map((keyword) => searchable.includes(normalizedAddress(keyword)))
    checks.push(rule.matchMode === 'all' ? keywordChecks.every(Boolean) : keywordChecks.some(Boolean))
  }

  if (!checks.length) return false
  return rule.matchMode === 'all' ? checks.every(Boolean) : checks.some(Boolean)
}

export function mailRuleInstruction(rule, message) {
  const source = String(rule?.instruction || '').trim()
  const values = templateValues(rule, message)

  if (source.startsWith('{')) {
    let parsed
    try {
      parsed = JSON.parse(source)
    } catch {
      return source.slice(0, 5_000)
    }
    if (Array.isArray(parsed?.steps)) {
      const expanded = JSON.stringify(expandTemplates(parsed, values))
      if (expanded.length > 5_000) {
        throw new Error('The matched email is too large for this automation instruction.')
      }
      return expanded
    }
  }

  return source.replace(MAIL_TEMPLATE_PATTERN, (_match, key) => values[key] ?? '').slice(0, 5_000)
}
