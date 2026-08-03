// Server-side canonical business identity.
//
// Reads the same env keys as shared/business.mjs (see BUSINESS_ENV_KEYS) from
// process.env, so the server and the client (Vite) stay in sync as long as
// both configure the same values. Unknown company details default to empty
// documented placeholders until the operator supplies them.

import { loadBusinessIdentity } from '../shared/business.mjs'

export const businessIdentity = loadBusinessIdentity(process.env)

export { loadBusinessIdentity } from '../shared/business.mjs'
