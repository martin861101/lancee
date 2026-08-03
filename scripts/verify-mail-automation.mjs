import assert from 'node:assert/strict'
import { mailRuleInstruction, mailRuleMatches } from '../server/mail-automation.mjs'

const message = {
  uid: 17,
  messageId: '<mail-17@example.com>',
  from: [{ name: 'Ada Lovelace', address: 'Ada@Example.com' }],
  to: [{ name: 'Sales', address: 'sales@example.com' }],
  cc: [],
  subject: 'New project: “Packaging refresh”',
  text: 'Please quote the urgent packaging refresh. Include the “foil” option.',
}

const matchingRule = {
  id: 'mailrule_test',
  sender: 'ada@example.com',
  recipient: 'sales@example.com',
  subject: 'new project',
  keywords: ['urgent', 'foil'],
  matchMode: 'all',
}
assert.equal(mailRuleMatches(matchingRule, message), true)
assert.equal(mailRuleMatches({ ...matchingRule, sender: 'other@example.com' }, message), false)
assert.equal(mailRuleMatches({ ...matchingRule, sender: '@example.com', matchMode: 'any', keywords: ['missing'] }, message), true)

const instruction = mailRuleInstruction({
  id: 'mailrule_test',
  instruction: JSON.stringify({
    steps: [{
      tool: 'projects.create',
      input: {
        name: '{{subject}}',
        clientName: '{{senderName}}',
        clientEmail: '{{senderEmail}}',
        scope: '{{body}}',
        sourceKey: 'mail:{{ruleId}}:{{messageId}}',
      },
    }],
  }),
}, message)
const expanded = JSON.parse(instruction)
assert.equal(expanded.steps[0].input.name, message.subject)
assert.equal(expanded.steps[0].input.clientName, 'Ada Lovelace')
assert.equal(expanded.steps[0].input.clientEmail, 'ada@example.com')
assert.equal(expanded.steps[0].input.scope, message.text)
assert.equal(expanded.steps[0].input.sourceKey, 'mail:mailrule_test:<mail-17@example.com>')

console.log('Mail automation verified: normalized criteria, exact email matching, safe structured template expansion, and idempotency keys.')
