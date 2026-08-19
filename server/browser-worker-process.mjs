import { createInterface } from 'node:readline'
import { createBrowserWorker } from './browser-worker.mjs'

const worker = createBrowserWorker({ runAsUser: null })
const lines = createInterface({ input: process.stdin })
let closing = false

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

async function handle(message) {
  const id = message?.id
  try {
    let result
    if (message.method === 'read') result = await worker.read(message.url, message.options || {})
    else if (message.method === 'snapshot') result = await worker.snapshot(message.url, message.options || {})
    else if (message.method === 'screenshot' || message.method === 'pdf') {
      result = await worker[message.method](message.url, message.options || {})
      result = { ...result, bodyBase64: result.body.toString('base64') }
      delete result.body
    } else if (message.method === 'renderDocumentPdf') {
      const body = await worker.renderDocumentPdf(message.options || {})
      result = { bodyBase64: body.toString('base64') }
    } else if (message.method === 'renderInvoicePdf') {
      const body = await worker.renderInvoicePdf(message.options || {})
      result = { bodyBase64: body.toString('base64') }
    } else if (message.method === 'health') result = await worker.health()
    else if (message.method === 'close') {
      closing = true
      await worker.close()
      result = { closed: true }
    } else {
      const error = new Error('Unknown browser worker operation.')
      error.code = 'BROWSER_OPERATION_NOT_FOUND'
      error.status = 404
      throw error
    }
    send({ id, result })
  } catch (error) {
    send({
      id,
      error: {
        code: error?.code || 'BROWSER_FAILED',
        message: error?.message || 'The isolated browser operation failed.',
        status: error?.status || 502,
      },
    })
  }
}

lines.on('line', (line) => {
  if (closing || line.length > 250_000) return
  try {
    void handle(JSON.parse(line))
  } catch {
    send({ id: null, error: { code: 'BROWSER_INVALID_REQUEST', message: 'Invalid browser worker request.', status: 400 } })
  }
})

lines.on('close', async () => {
  await worker.close()
  process.exit(0)
})

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    await worker.close()
    process.exit(0)
  })
}
