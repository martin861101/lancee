import assert from 'node:assert/strict'
import { createHmac, scryptSync } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

const projectDirectory = new URL('..', import.meta.url).pathname
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lancee-paystack-'))
const databasePath = join(temporaryDirectory, 'lancee.sqlite')
const password = 'paystack-test-password'
const passwordSalt = 'paystack-test-salt'
const passwordHash = scryptSync(password, passwordSalt, 64).toString('hex')
const adminEmail = 'paystack-test@example.com'
const paystackSecret = 'sk_test_lanceeverifier123456789'
let initializeCalls = 0
let lastInitialization = null

async function availablePort() {
  const server = createNetServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert(address && typeof address === 'object')
  const port = address.port
  server.close()
  await once(server, 'close')
  return port
}

async function readRequestBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks)
}

async function startPaystackStub() {
  const port = await availablePort()
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/transaction/initialize') {
      response.writeHead(404, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ status: false }))
      return
    }
    assert.equal(request.headers.authorization, `Bearer ${paystackSecret}`)
    const body = JSON.parse((await readRequestBody(request)).toString('utf8'))
    initializeCalls += 1
    lastInitialization = body
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(
      JSON.stringify({
        status: true,
        message: 'Authorization URL created',
        data: {
          authorization_url: `https://checkout.paystack.test/${body.reference}`,
          access_code: `access-${body.reference}`,
          reference: body.reference,
        },
      }),
    )
  })
  server.listen(port, '127.0.0.1')
  await once(server, 'listening')
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
  }
}

async function stopServer(server) {
  server.close()
  await once(server, 'close')
}

async function startApplication(paystackBaseUrl) {
  const port = await availablePort()
  const origin = `http://127.0.0.1:${port}`
  const output = []
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: projectDirectory,
    env: {
      ...process.env,
      APP_ENV: 'development',
      PORT: String(port),
      PUBLIC_ORIGIN: origin,
      DATABASE_PATH: databasePath,
      SESSION_SECRET: 'paystack-test-session-secret-with-sufficient-entropy',
      ADMIN_NAME: 'Paystack Test Admin',
      ADMIN_EMAIL: adminEmail,
      ADMIN_PASSWORD_SALT: passwordSalt,
      ADMIN_PASSWORD_HASH: passwordHash,
      WORKSPACE_ID: 'wsp_paystack_test',
      WORKSPACE_NAME: 'Paystack Test Workspace',
      PAYSTACK_SECRET_KEY: paystackSecret,
      PAYSTACK_BASE_URL: paystackBaseUrl,
      PAYSTACK_CALLBACK_URL: `${origin}/?payment=paystack`,
      SMTP_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))

  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Application exited before startup:\n${output.join('')}`)
    }
    try {
      const response = await fetch(`${origin}/api/health`)
      if (response.ok) return { child, origin, output }
    } catch {
      // The listener is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  child.kill('SIGTERM')
  throw new Error(`Application did not become healthy:\n${output.join('')}`)
}

async function stopApplication(application) {
  if (application.child.exitCode !== null) return
  application.child.kill('SIGTERM')
  await once(application.child, 'exit')
}

async function login(origin) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: origin,
    },
    body: JSON.stringify({ email: adminEmail, password }),
  })
  assert.equal(response.status, 200)
  return response.headers.get('set-cookie').split(';', 1)[0]
}

async function sessionRequest(origin, cookie, path, options = {}) {
  return fetch(`${origin}${path}`, {
    ...options,
    headers: {
      Cookie: cookie,
      Origin: origin,
      ...(options.headers || {}),
    },
  })
}

function signedWebhook(origin, payload, signature = null) {
  const rawBody = JSON.stringify(payload)
  const value =
    signature ||
    createHmac('sha512', paystackSecret).update(rawBody).digest('hex')
  return fetch(`${origin}/api/webhooks/paystack`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-paystack-signature': value,
    },
    body: rawBody,
  })
}

let application
let paystackStub
try {
  paystackStub = await startPaystackStub()
  application = await startApplication(paystackStub.baseUrl)
  let cookie = await login(application.origin)

  const status = await sessionRequest(
    application.origin,
    cookie,
    '/api/money/paystack/status',
  )
  const statusPayload = await status.json()
  assert.equal(statusPayload.provider, 'paystack')
  assert.equal(statusPayload.configured, true)
  assert.equal(statusPayload.mode, 'test')
  assert.equal(statusPayload.credentialSource, 'environment')
  assert.equal(statusPayload.currency, 'ZAR')
  assert(statusPayload.configuredAt)
  assert(statusPayload.updatedAt)

  const invoiceInput = {
    clientName: 'Isla Verde Spirits',
    clientEmail: 'accounts@islaverde.example',
    projectName: 'Summer aperitivo labels',
    description: 'Approved label design and production artwork',
    amountMinor: 2_840_000,
    currency: 'ZAR',
    dueDate: '2026-08-12',
  }
  const createOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': 'paystack-payment-link-0001',
    },
    body: JSON.stringify(invoiceInput),
  }
  const create = await sessionRequest(
    application.origin,
    cookie,
    '/api/money/paystack/payment-links',
    createOptions,
  )
  assert.equal(create.status, 201)
  assert.equal(create.headers.get('idempotency-replayed'), 'false')
  const created = await create.json()
  assert.match(created.invoice.providerReference, /^lnc-[a-f0-9]{32}$/)
  assert.equal(created.invoice.status, 'pending')
  assert.equal(created.paymentLink.status, 'pending')
  assert.equal(initializeCalls, 1)
  assert.equal(lastInitialization.email, invoiceInput.clientEmail)
  assert.equal(lastInitialization.amount, String(invoiceInput.amountMinor))
  assert.equal(lastInitialization.currency, 'ZAR')
  assert.equal(lastInitialization.reference, created.invoice.providerReference)
  assert.equal(
    JSON.parse(lastInitialization.metadata).invoice_id,
    created.invoice.id,
  )

  const replay = await sessionRequest(
    application.origin,
    cookie,
    '/api/money/paystack/payment-links',
    createOptions,
  )
  assert.equal(replay.status, 200)
  assert.equal(replay.headers.get('idempotency-replayed'), 'true')
  assert.equal((await replay.json()).invoice.id, created.invoice.id)
  assert.equal(initializeCalls, 1)

  const conflict = await sessionRequest(
    application.origin,
    cookie,
    '/api/money/paystack/payment-links',
    {
      ...createOptions,
      body: JSON.stringify({ ...invoiceInput, amountMinor: 100 }),
    },
  )
  assert.equal(conflict.status, 409)

  const invalidSignature = await signedWebhook(
    application.origin,
    { event: 'charge.success', data: {} },
    '00',
  )
  assert.equal(invalidSignature.status, 401)

  const mismatchedWebhook = {
    event: 'charge.success',
    data: {
      id: 41,
      status: 'success',
      reference: created.invoice.providerReference,
      amount: invoiceInput.amountMinor + 1,
      currency: 'ZAR',
      paid_at: '2026-07-26T17:00:00.000Z',
    },
  }
  const mismatched = await signedWebhook(application.origin, mismatchedWebhook)
  assert.equal(mismatched.status, 200)
  assert.equal((await mismatched.json()).processed, false)

  const successfulWebhook = {
    event: 'charge.success',
    data: {
      id: 42,
      status: 'success',
      reference: created.invoice.providerReference,
      amount: invoiceInput.amountMinor,
      currency: 'ZAR',
      paid_at: '2026-07-26T17:01:00.000Z',
    },
  }
  const successful = await signedWebhook(application.origin, successfulWebhook)
  assert.equal(successful.status, 200)
  assert.equal((await successful.json()).processed, true)

  const duplicate = await signedWebhook(application.origin, successfulWebhook)
  assert.equal(duplicate.status, 200)
  assert.equal((await duplicate.json()).duplicate, true)

  const invoices = await sessionRequest(
    application.origin,
    cookie,
    '/api/money/invoices',
  )
  const invoicePayload = await invoices.json()
  assert.equal(invoicePayload.invoices.length, 1)
  assert.equal(invoicePayload.invoices[0].status, 'paid')
  assert.equal(invoicePayload.invoices[0].providerReference, created.invoice.providerReference)

  await stopApplication(application)
  application = null

  const databaseBytes = await readFile(databasePath)
  assert.equal(databaseBytes.includes(Buffer.from(paystackSecret)), false)
  const persisted = new DatabaseSync(databasePath)
  assert.throws(() =>
    persisted
      .prepare('UPDATE invoices SET provider_reference = ? WHERE id = ?')
      .run('changed-reference', created.invoice.id),
  )
  assert.equal(
    persisted.prepare('SELECT COUNT(*) AS count FROM payment_events').get().count,
    2,
  )
  persisted.close()

  application = await startApplication(paystackStub.baseUrl)
  cookie = await login(application.origin)
  const afterRestart = await sessionRequest(
    application.origin,
    cookie,
    '/api/money/invoices',
  )
  const restartPayload = await afterRestart.json()
  assert.equal(restartPayload.invoices[0].status, 'paid')
  assert.equal(restartPayload.invoices[0].paidAt, '2026-07-26T17:01:00.000Z')

  console.log(
    'Paystack flow verified: server-side auth, initialization, idempotency, immutable references, signed webhook reconciliation, duplicate handling, and restart persistence.',
  )
} finally {
  if (application) await stopApplication(application)
  if (paystackStub) await stopServer(paystackStub.server)
  await rm(temporaryDirectory, { recursive: true, force: true })
}
