import assert from 'node:assert/strict'
import {
  accessTokenIsFresh,
  buildGoogleAuthUrl,
  createOAuthState,
  decryptDriveSecret,
  encryptDriveSecret,
  exchangeAuthorizationCode,
  listGoogleDriveFiles,
  parseOAuthState,
  refreshGoogleAccessToken,
} from '../server/google-drive.mjs'

const serverSecret = 'google-drive-verifier-server-secret'
const encrypted = encryptDriveSecret('refresh-token-secret', serverSecret)
assert.notEqual(encrypted, 'refresh-token-secret')
assert.equal(decryptDriveSecret(encrypted, serverSecret), 'refresh-token-secret')
assert.throws(() => decryptDriveSecret(encrypted, 'wrong-secret'))

const state = createOAuthState({
  workspaceId: 'wsp_drive_test',
  userId: 'usr_drive_test',
  serverSecret,
})
assert.equal(parseOAuthState(state, serverSecret).workspaceId, 'wsp_drive_test')
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
  return new Response(JSON.stringify({
    files: [{
      id: 'file_1',
      name: 'Client handoff',
      mimeType: 'application/vnd.google-apps.folder',
      webViewLink: 'https://drive.google.com/drive/folders/file_1',
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
  assert.equal(listing.nextPageToken, 'next-page')
  assert.equal(calls[2].init.headers.Authorization, 'Bearer access-token')

  console.log(
    'Google Drive verified: encrypted refresh tokens, signed OAuth state, auth URL, token exchange/refresh, and file listing.',
  )
} finally {
  globalThis.fetch = originalFetch
}
