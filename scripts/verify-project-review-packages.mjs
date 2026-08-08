import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/database.mjs'

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'lancee-review-packages-'))
const databasePath = join(temporaryDirectory, 'workspace.sqlite')
const workspaceId = 'wsp_review_packages'
const adminEmail = 'review-packages@example.com'

try {
  const database = await openDatabase({
    databasePath,
    adminEmail,
    adminName: 'Review Package Verifier',
    adminPasswordSalt: 'salt',
    adminPasswordHash: 'hash',
    workspaceId,
    workspaceName: 'Review Package Test',
  })
  const user = await database.getUserByEmail(adminEmail)
  assert(user?.id)

  const client = await database.createClient({
    workspaceId,
    name: 'Vusi Sithole',
    email: 'vusi@example.test',
    company: 'Redefined Construction',
  })
  const project = await database.createProject({
    workspaceId,
    clientId: client.id,
    client: client.name,
    name: 'Redefined Construction',
  })
  const task = await database.createProjectTask({
    workspaceId,
    projectId: project.id,
    bucketId: 'review',
    title: 'Excavator image',
  })
  const completed = await database.updateProjectTask(workspaceId, task.id, {
    completedAt: new Date().toISOString(),
  })
  assert.equal(completed.completed, true)

  const imageBody = Buffer.from('review-package-image')
  const image = await database.createProjectFile({
    workspaceId,
    projectId: project.id,
    name: 'excavator.png',
    mimeType: 'image/png',
    size: imageBody.byteLength,
    storageKey: 'review-package/excavator.png',
    contentBase64: imageBody.toString('base64'),
    contentSha256: createHash('sha256').update(imageBody).digest('hex'),
  })
  const jobCard = await database.ensureJobCard({
    workspaceId,
    projectId: project.id,
    createdBy: user.id,
  })
  const tokenHash = createHash('sha256').update('review-package-token').digest('hex')
  const expiresAt = new Date(Date.now() + 86400000).toISOString()
  const approval = await database.createClientApproval({
    workspaceId,
    projectId: project.id,
    jobCardId: jobCard.id,
    clientId: client.id,
    tokenHash,
    clientName: client.name,
    clientEmail: client.email,
    projectName: project.name,
    title: 'Review Redefined Construction',
    body: 'Please review the selected deliverables.',
    expiresAt,
    dueAt: expiresAt,
  })
  const items = await database.createReviewPackageItems({
    workspaceId,
    projectId: project.id,
    approvalId: approval.id,
    items: [
      { bucketId: 'review', title: 'Excavator image', previewFileId: image.id },
      { bucketId: 'completed', title: 'Email signature', previewFileId: null },
    ],
  })
  const review = await database.createReviewSession({
    approvalId: approval.id,
    workspaceId,
    projectId: project.id,
    artworkFileId: image.id,
    tokenHash,
    expiresAt,
  })
  assert.equal(review.packageItems.length, 2)

  const needsChanges = await database.respondToReviewPackageItem({
    reviewId: review.id,
    tokenHash,
    itemId: items[0].id,
    status: 'needs_changes',
    comment: 'Make the excavator bucket more visible.',
  })
  assert.equal(needsChanges.status, 'needs_changes')
  assert.equal(needsChanges.commentCount, 1)
  await database.respondToReviewPackageItem({
    reviewId: review.id,
    tokenHash,
    itemId: items[1].id,
    status: 'approved',
  })

  const submitted = await database.submitReviewSession(review.id, tokenHash)
  assert.equal(submitted.review.status, 'submitted')
  assert.equal((await database.getClientApproval(workspaceId, approval.id)).status, 'commented')
  const comments = await database.listProjectComments(workspaceId, project.id)
  assert.equal(comments[0].bucketId, 'review')
  assert.equal(comments[0].reviewItemId, items[0].id)

  const packages = await database.listProjectApprovals(workspaceId, project.id)
  assert.equal(packages[0].items.length, 2)
  assert.equal(packages[0].items[0].previewFileId, image.id)

  await database.close()

  console.log('Project review packages verified: task completion, selected buckets, previews, item responses, linked comments, submission, and history.')
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
