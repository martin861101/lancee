import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/database.mjs'

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'lancee-client-files-'))
const databasePath = join(temporaryDirectory, 'workspace.sqlite')
const workspaceId = 'wsp_client_files'

try {
  const database = await openDatabase({
    databasePath,
    adminEmail: 'client-files@example.com',
    adminName: 'Client Files Verifier',
    adminPasswordSalt: 'salt',
    adminPasswordHash: 'hash',
    workspaceId,
    workspaceName: 'Client Files Test',
  })

  const client = await database.createClient({
    workspaceId,
    name: 'Northwind Studio',
    email: 'hello@northwind.example',
    company: 'Northwind',
  })
  assert.equal(client.name, 'Northwind Studio')

  const project = await database.createProject({
    workspaceId,
    name: 'Website launch',
    clientId: client.id,
    client: client.name,
  })
  assert.equal(project.clientId, client.id)

  const driveLink = await database.createDriveResourceLink({
    workspaceId,
    driveFileId: 'drive_folder_123',
    name: 'Website launch assets',
    mimeType: 'application/vnd.google-apps.folder',
    resourceKind: 'folder',
    clientId: client.id,
    projectId: project.id,
    webViewLink: 'https://drive.google.com/drive/folders/drive_folder_123',
  })
  assert.equal(driveLink.projectName, project.name)

  const body = Buffer.from('# Client brief\n\nReady for review.', 'utf8')
  const document = await database.createWorkspaceDocument({
    workspaceId,
    name: 'brief.md',
    mimeType: 'text/markdown',
    body,
  })
  assert.equal(document.size, body.byteLength)
  assert.equal(
    (await database.getWorkspaceDocument(workspaceId, document.id)).body.toString(),
    body.toString(),
  )

  const synced = await database.markWorkspaceDocumentSynced(
    workspaceId,
    document.id,
    {
      id: 'drive_file_456',
      webViewLink: 'https://drive.google.com/file/d/drive_file_456/view',
    },
  )
  assert.equal(synced.driveFileId, 'drive_file_456')

  assert.equal((await database.listClients(workspaceId))[0].projectCount, 1)
  assert.equal(
    (await database.listDriveResourceLinks(workspaceId, {
      clientId: client.id,
    })).length,
    1,
  )
  assert.equal((await database.listWorkspaceDocuments(workspaceId)).length, 1)

  await database.close()
  console.log(
    'Client file workspaces verified: durable clients, client-scoped projects, Drive relationships, local documents, and Drive sync metadata.',
  )
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
