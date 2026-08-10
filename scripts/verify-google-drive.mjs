import assert from 'node:assert/strict'
import {
  accessTokenIsFresh,
  buildGoogleAuthUrl,
  convertDriveEditorContent,
  createOAuthState,
  decryptDriveSecret,
  encryptDriveSecret,
  exchangeAuthorizationCode,
  googleDriveEditorKind,
  getGoogleDriveConfig,
  listGoogleDriveFiles,
  loadEditorDocumentFromBuffer,
  parseOAuthState,
  refreshGoogleAccessToken,
  sanitizeDriveEditorHtml,
  updateGoogleDriveFileContent,
  uploadGoogleDriveFile,
} from '../server/google-drive.mjs'

const serverSecret = 'google-drive-verifier-server-secret'
const driveConfig = getGoogleDriveConfig({
  publicOrigin: 'https://app.example',
  env: {
    GOOGLE_DRIVE_CLIENT_ID: 'drive-client-id',
    GOOGLE_DRIVE_CLIENT_SECRET: 'drive-client-secret',
    GOOGLE_PICKER_API_KEY: 'browser-key',
    GOOGLE_PICKER_APP_ID: '1234567890',
  },
})
assert.equal(driveConfig.pickerConfigured, true)
assert.equal(driveConfig.pickerAppId, '1234567890')
const encrypted = encryptDriveSecret('refresh-token-secret', serverSecret)
assert.notEqual(encrypted, 'refresh-token-secret')
assert.equal(decryptDriveSecret(encrypted, serverSecret), 'refresh-token-secret')
assert.throws(() => decryptDriveSecret(encrypted, 'wrong-secret'))

const state = createOAuthState({
  workspaceId: 'wsp_drive_test',
  userId: 'usr_drive_test',
  serverSecret,
  returnTo: 'files',
})
assert.equal(parseOAuthState(state, serverSecret).workspaceId, 'wsp_drive_test')
assert.equal(parseOAuthState(state, serverSecret).returnTo, 'files')
assert.throws(() => parseOAuthState(`${state}x`, serverSecret))

const authorizationUrl = new URL(buildGoogleAuthUrl({
  clientId: 'drive-client-id',
  redirectUri: 'https://app.example/api/google-drive/oauth/callback',
  state,
}))
assert.equal(authorizationUrl.hostname, 'accounts.google.com')
assert.equal(authorizationUrl.searchParams.get('access_type'), 'offline')
assert.match(authorizationUrl.searchParams.get('scope'), /drive\.file/)
assert.equal(
  authorizationUrl.searchParams.get('include_granted_scopes'),
  'false',
)
assert.equal(authorizationUrl.searchParams.get('trigger_onepick'), 'true')
assert.equal(authorizationUrl.searchParams.get('allow_multiple'), 'true')
assert.equal(authorizationUrl.searchParams.get('allow_folder_selection'), 'true')

const googleDocument = {
  id: 'doc_google',
  name: 'Proposal',
  mimeType: 'application/vnd.google-apps.document',
}
const docxDocument = {
  id: 'doc_word',
  name: 'Proposal.docx',
  mimeType:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}
assert.equal(googleDriveEditorKind(googleDocument), 'rich-text')
assert.equal(googleDriveEditorKind(docxDocument), 'rich-text')
assert.equal(
  googleDriveEditorKind({
    id: 'doc_markdown',
    name: 'README.md',
    mimeType: 'application/octet-stream',
  }),
  'markdown',
)
assert.equal(
  googleDriveEditorKind({
    id: 'doc_pdf',
    name: 'Proposal.pdf',
    mimeType: 'application/pdf',
  }),
  'pdf',
)
const sanitized = sanitizeDriveEditorHtml(
  '<h1>Safe</h1><script>alert(1)</script><a href="javascript:alert(1)">bad</a>',
)
assert.match(sanitized, /<h1>Safe<\/h1>/)
assert.doesNotMatch(sanitized, /script|javascript/)
const googleDocumentUpload = await convertDriveEditorContent({
  file: googleDocument,
  content: '<h1>Updated proposal</h1><script>bad()</script>',
})
assert.match(googleDocumentUpload.contentType, /^text\/html/)
assert.match(googleDocumentUpload.body.toString(), /Updated proposal/)
assert.doesNotMatch(googleDocumentUpload.body.toString(), /script/)
const docxUpload = await convertDriveEditorContent({
  file: docxDocument,
  content: '<h1>Updated proposal</h1><p><strong>Approved</strong></p>',
})
assert.equal(
  docxUpload.contentType,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
)
assert.equal(docxUpload.body.subarray(0, 2).toString(), 'PK')
const localDocx = await loadEditorDocumentFromBuffer({
  file: {
    ...docxDocument,
    canEdit: true,
    version: 'local-version',
  },
  body: docxUpload.body,
})
assert.equal(localDocx.kind, 'rich-text')
assert.match(localDocx.content, /Updated proposal/)
const localMarkdown = await loadEditorDocumentFromBuffer({
  file: {
    id: 'doc_local_markdown',
    name: 'brief.md',
    mimeType: 'text/markdown',
    canEdit: true,
  },
  body: Buffer.from('# Local brief'),
})
assert.equal(localMarkdown.kind, 'markdown')
assert.equal(localMarkdown.content, '# Local brief')

const originalFetch = globalThis.fetch
const calls = []
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init })
  if (String(url).includes('/token')) {
    return new Response(JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  if (String(url).includes('/upload/drive/')) {
    return new Response(JSON.stringify({
      id: 'file_1',
      name: 'Client handoff',
      mimeType: 'text/markdown',
      modifiedTime: '2026-07-29T11:00:00.000Z',
      version: '8',
      capabilities: { canEdit: true, canDownload: true },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  if (String(url).includes('/files/missing_file')) {
    return new Response(JSON.stringify({
      error: { message: 'File not found: missing_file' },
    }), { status: 404, headers: { 'Content-Type': 'application/json' } })
  }
  if (String(url).includes('/files/available_file')) {
    return new Response(JSON.stringify({
      id: 'available_file',
      name: 'Available brief',
      mimeType: 'text/markdown',
      capabilities: { canEdit: true, canDownload: true },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return new Response(JSON.stringify({
    files: [{
      id: 'file_1',
      name: 'Client handoff',
      mimeType: 'application/vnd.google-apps.folder',
      webViewLink: 'https://drive.google.com/drive/folders/file_1',
      capabilities: {
        canEdit: true,
        canDownload: true,
        canListChildren: true,
      },
    }],
    nextPageToken: 'next-page',
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

try {
  const exchanged = await exchangeAuthorizationCode({
    code: 'authorization-code',
    clientId: 'drive-client-id',
    clientSecret: 'drive-client-secret',
    redirectUri: 'https://app.example/api/google-drive/oauth/callback',
  })
  assert.equal(exchanged.refreshToken, 'refresh-token')
  assert(accessTokenIsFresh(exchanged.expiresAt))

  const refreshed = await refreshGoogleAccessToken({
    refreshToken: 'existing-refresh-token',
    clientId: 'drive-client-id',
    clientSecret: 'drive-client-secret',
  })
  assert.equal(refreshed.accessToken, 'access-token')

  const listing = await listGoogleDriveFiles({
    accessToken: 'access-token',
    pageSize: 25,
  })
  assert.equal(listing.files[0].name, 'Client handoff')
  assert.equal(listing.files[0].canListChildren, true)
  assert.equal(listing.nextPageToken, 'next-page')
  assert.equal(calls[2].init.headers.Authorization, 'Bearer access-token')

  await listGoogleDriveFiles({
    accessToken: 'access-token',
    pageSize: 25,
    folderId: 'folder_123',
  })
  const folderListingUrl = new URL(calls[3].url)
  assert.match(
    folderListingUrl.searchParams.get('q'),
    /'folder_123' in parents/,
  )

  const selectedListing = await listGoogleDriveFiles({
    accessToken: 'access-token',
    fileIds: ['available_file', 'missing_file'],
  })
  assert.deepEqual(selectedListing.files.map((file) => file.id), ['available_file'])
  assert.deepEqual(selectedListing.unavailableFileIds, ['missing_file'])

  const updated = await updateGoogleDriveFileContent({
    accessToken: 'access-token',
    fileId: 'file_1',
    body: Buffer.from('# Updated'),
    contentType: 'text/markdown',
    etag: '"drive-file-etag"',
  })
  assert.equal(updated.version, '8')
  assert.equal(updated.canEdit, true)
  assert.equal(calls[6].init.method, 'PATCH')
  assert.equal(calls[6].init.headers['If-Match'], '"drive-file-etag"')

  const uploaded = await uploadGoogleDriveFile({
    accessToken: 'access-token',
    name: 'Client brief.md',
    body: Buffer.from('# Brief'),
    contentType: 'text/markdown',
    folderId: 'folder_123',
  })
  assert.equal(uploaded.id, 'file_1')
  assert.equal(calls[7].init.method, 'POST')
  assert.match(calls[7].init.headers['Content-Type'], /^multipart\/related/)
  assert.match(calls[7].init.body.toString(), /Client brief\.md/)
  assert.match(calls[7].init.body.toString(), /folder_123/)

  console.log(
    'Google Drive verified: encrypted refresh tokens, signed OAuth state, Picker auth, resilient selected-file listing, folder listing, safe editor conversion, Drive updates, and multipart uploads.',
  )
} finally {
  globalThis.fetch = originalFetch
}
