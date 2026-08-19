import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBrowserWorker } from '../server/browser-worker.mjs'

const worker = createBrowserWorker({ runAsUser: null })
const templates = ['modern', 'classic', 'studio', 'minimal']

try {
  for (const template of templates) {
    const pdf = await worker.renderInvoicePdf({
      documentType: 'invoice',
      template,
      accentColor: '#6d4aff',
      invoiceNumber: `INV-20260818-${template.toUpperCase()}`,
      clientName: 'Isla Verde Spirits',
      clientEmail: 'accounts@islaverde.example',
      projectName: 'Reserve rum label series',
      description: 'Approved identity design, label system, and production-ready artwork.',
      amountMinor: 2840000,
      currency: 'ZAR',
      dueDate: '2026-09-01',
      createdAt: '2026-08-18T12:00:00.000Z',
      senderName: 'Northstar Creative Studio',
      senderEmail: 'hello@northstar.example',
      customFields: [
        { label: 'Purchase order', value: 'IVS-2084' },
        { label: 'Tax number', value: 'ZA-4110288' },
      ],
      bankDetails: {
        accountHolder: 'Northstar Creative Studio',
        bankName: 'First National Bank',
        accountNumber: '6210 458 921',
        branchCode: '250655',
        swiftCode: 'FIRNZAJJ',
      },
      paymentUrl: null,
    })
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
    assert.ok(pdf.byteLength > 20_000)
    await writeFile(join(tmpdir(), `lancee-invoice-${template}.pdf`), pdf)
  }
  console.log(`Invoice PDF verification passed for: ${templates.join(', ')}`)
} finally {
  await worker.close()
}
