import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/database.mjs'
import { discoverMailSettings } from '../server/mail.mjs'

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'lancee-mail-verify-'))
const previousDirectory = process.cwd()
process.chdir(temporaryDirectory)
process.env.SEED_DEMO_DATA = 'true'

let database
try {
  const discovery = await discoverMailSettings('owner@gmail.com')
  assert.equal(discovery.detected, true)
  assert.equal(discovery.imapHost, 'imap.gmail.com')

  database = await openDatabase({
    databasePath: join(temporaryDirectory, 'mail.sqlite'),
    adminEmail: 'mail-owner@example.com',
    adminName: 'Mail Owner',
    adminPasswordSalt: 'test-salt',
    adminPasswordHash: 'test-hash',
    workspaceId: 'wsp_mail_verify',
    workspaceName: 'Mail verification',
  })

  const owner = await database.getUserByEmail('mail-owner@example.com')
  const automations = await database.listAutomations('wsp_mail_verify')
  const automation = automations.find((item) => item.execution === 'core')
  assert.ok(owner?.id, 'expected the seeded workspace owner')
  assert.ok(automation?.id, 'expected a native Core automation')

  const account = await database.saveMailAccount({
    workspaceId: 'wsp_mail_verify',
    connectedBy: owner.id,
    email: 'inbox@example.com',
    displayName: 'Example inbox',
    username: 'inbox@example.com',
    provider: 'custom',
    passwordCiphertext: 'ciphertext',
    passwordIv: 'iv',
    passwordTag: 'tag',
    imapHost: 'imap.example.com',
    imapPort: 993,
    imapSecure: true,
    smtpHost: 'smtp.example.com',
    smtpPort: 465,
    smtpSecure: true,
    lastSeenUid: 42,
  })
  assert.equal(account.email, 'inbox@example.com')
  assert.equal(account.lastSeenUid, 42)

  const rule = await database.createMailAutomationRule({
    workspaceId: 'wsp_mail_verify',
    automationId: automation.id,
    createdBy: owner.id,
    name: 'New enquiry',
    sender: '@client.example',
    subject: 'project',
    keywords: ['quote', 'urgent'],
    matchMode: 'all',
    instruction: 'Summarize {{subject}} from {{sender}}.',
  })
  assert.equal(rule.keywords.length, 2)
  assert.equal(rule.automationName, automation.name)

  const eventId = await database.claimMailRuleEvent({
    workspaceId: 'wsp_mail_verify',
    ruleId: rule.id,
    messageKey: 'inbox@example.com:<message-1@example.com>',
  })
  assert.ok(eventId, 'expected the first message/rule event to be claimed')
  assert.equal(
    await database.claimMailRuleEvent({
      workspaceId: 'wsp_mail_verify',
      ruleId: rule.id,
      messageKey: 'inbox@example.com:<message-1@example.com>',
    }),
    null,
    'expected duplicate message/rule events to be ignored',
  )

  const integrations = await database.listIntegrations('wsp_mail_verify')
  assert.equal(integrations.find((item) => item.id === 'mail')?.connected, true)
  console.log('Mail connector persistence and trigger idempotency verified.')
} finally {
  if (database) await database.close()
  process.chdir(previousDirectory)
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
