const MAIL_TEMPLATE_PATTERN = /\{\{(sender|senderEmail|senderName|recipient|recipientEmail|subject|body|messageId|ruleId|event\.(?:subject|body|messageId|sender\.email|sender\.name))\}\}/g

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

function workflowConditionMatches(condition, message) {
  const field = condition?.field
  const expected = normalizedAddress(condition?.value)
  if (!expected) return false
  const sender = addressesFromMessage(message, 'from')
  const recipients = [...addressesFromMessage(message, 'to'), ...addressesFromMessage(message, 'cc')]
  const value = field === 'sender.email' ? sender
    : field === 'recipient.email' ? recipients
      : [field === 'subject' ? String(message?.subject || '').toLowerCase() : String(message?.text || '').toLowerCase()]
  return condition.operator === 'equals'
    ? value.some((entry) => entry === expected)
    : value.some((entry) => entry.includes(expected))
}

export function mailRuleMatches(rule, message) {
  if (Array.isArray(rule?.conditions) && rule.conditions.length) {
    const matches = rule.conditions.map((condition) => workflowConditionMatches(condition, message))
    return rule.matchMode === 'any' ? matches.some(Boolean) : matches.every(Boolean)
  }
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
  values['event.subject'] = values.subject
  values['event.body'] = values.body
  values['event.messageId'] = values.messageId
  values['event.sender.email'] = values.senderEmail
  values['event.sender.name'] = values.senderName

  if (source.startsWith('{')) {
    let parsed
    try {
      parsed = JSON.parse(source)
    } catch {
      return source.slice(0, 5_000)
    }
    if (parsed?.workflow || Array.isArray(parsed?.steps)) {
      if (parsed.workflow) {
        parsed.event = {
          messageId: values.messageId,
          subject: values.subject,
          body: values.body,
          sender: { name: values.senderName, email: values.senderEmail },
          recipients: values.recipient.split(', ').filter(Boolean),
        }
      }
      const expanded = JSON.stringify(expandTemplates(parsed, values))
      if (expanded.length > 5_000) {
        throw new Error('The matched email is too large for this automation instruction.')
      }
      return expanded
    }
  }

  return source.replace(MAIL_TEMPLATE_PATTERN, (_match, key) => values[key] ?? '').slice(0, 5_000)
}
