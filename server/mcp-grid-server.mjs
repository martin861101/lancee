#!/usr/bin/env node

import { createServer } from 'node:http'
import { createInterface } from 'node:readline'
import { TooSClient } from 'mcp-grid-client'

const PROTOCOL_VERSION = '2025-06-18'
const SERVER_NAME = 'lancee-mcp-grid'
const SERVER_VERSION = '0.1.0'
const DEFAULT_GATEWAY_URL = 'https://mcp.hygridtech.co.za'
const DEFAULT_HTTP_HOST = '127.0.0.1'
const DEFAULT_HTTP_PORT = 8787
const MAX_BODY_BYTES = 1_000_000

const toolDescriptions = {
  client_onboard: 'Build a structured client onboarding brief from client, contact, and service details.',
  crm_followup: 'Prepare a CRM follow-up package from a last touchpoint and proposed next action.',
  extract_table_data: 'Extract headers and rows from a table on a public webpage.',
  extract_web_content: 'Extract public-page metadata, headings, links, and readable text.',
  find_replace: 'Apply explicit literal find-and-replace substitutions to text.',
  invoice_remind: 'Prepare an invoice reminder or recovery package from invoice and customer details.',
  lead_capture: 'Normalize and capture inbound lead details for follow-up.',
  meeting_followup: 'Turn meeting notes and action items into a follow-up package.',
  meeting_prepare: 'Prepare a meeting brief from the title, date, agenda, and supplied context.',
  modern_document_pdf: 'Create a polished, branded PDF from Markdown.',
  playwright_screenshot: 'Capture a production-quality PNG or JPEG screenshot of a public webpage.',
  project_complete: 'Produce a structured project-completion package from project details.',
  proposal_accepted: 'Produce a proposal-acceptance and onboarding handoff package.',
  puppeteer_html_pdf: 'Convert supplied HTML into a PDF with scripts disabled and private-network assets blocked.',
  astryx_docs: 'Retrieve documentation for Astryx components and related implementation guidance.',
  playwright_responsive_capture: 'Capture mobile, tablet, and desktop evidence for a public webpage in one operation.',
  playwright_webpage_pdf: 'Render a public webpage to a print-ready PDF with Playwright Chromium.',
  transform_text: 'Apply a deterministic text transformation.',
  text_stats: 'Calculate text statistics and constraint information.',
  web_quality_audit: 'Audit a public webpage for metadata, headings, images, links, responsiveness, and browser errors.',
  hash_text: 'Generate a content hash for supplied text.',
  base64_encode: 'Encode supplied data as Base64; this is not encryption.',
  base64_decode: 'Decode Base64 data.',
  generate_uuids: 'Generate opaque UUID values.',
  seo_metadata_audit: 'Inspect canonical, robots, Open Graph, Twitter Card, and JSON-LD metadata.',
  csv_to_json: 'Convert CSV or delimited tabular input into JSON records.',
  select_fields: 'Select specified fields from structured records.',
  json_to_csv: 'Convert consistent JSON records into CSV.',
  website_smoke_test: 'Verify that a public webpage loads and optionally assert its title, visible text, and a CSS selector.',
}

const selectedToolIds = [
  'client_onboard',
  'crm_followup',
  'extract_table_data',
  'extract_web_content',
  'find_replace',
  'invoice_remind',
  'lead_capture',
  'meeting_followup',
  'meeting_prepare',
  'modern_document_pdf',
  'playwright_screenshot',
  'project_complete',
  'proposal_accepted',
  'puppeteer_html_pdf',
  'astryx_docs',
  'playwright_responsive_capture',
  'playwright_webpage_pdf',
  'transform_text',
  'text_stats',
  'web_quality_audit',
  'hash_text',
  'base64_encode',
  'base64_decode',
  'generate_uuids',
  'seo_metadata_audit',
  'csv_to_json',
  'select_fields',
  'json_to_csv',
  'website_smoke_test',
]

const skills = [
  {
    name: 'client_onboarding',
    title: 'Client Onboarding',
    description: 'Create a client onboarding brief with the client onboarding action.',
    instructions: 'Call client_onboard with the client name, primary contact, and service summary. Treat the returned artifact as the onboarding brief. Do not invent CRM, email, or calendar side effects.',
    toolIds: ['client_onboard'],
  },
  {
    name: 'content_normalization',
    title: 'Content Normalization',
    description: 'Normalize text with deterministic transformations and explicit substitutions.',
    instructions: 'Use transform_text with the requested naming or case convention, apply find_replace only for explicit literal substitutions, then call text_stats when output size or limits matter. Preserve the original meaning.',
    toolIds: ['transform_text', 'find_replace', 'text_stats'],
  },
  {
    name: 'invoice_recovery',
    title: 'Invoice Recovery',
    description: 'Prepare an invoice reminder or recovery package.',
    instructions: 'Call invoice_remind with invoice identity, client, amount due, and due date. Use the returned document as the recovery package. Do not claim that an email was sent unless a dedicated connector exists.',
    toolIds: ['invoice_remind'],
  },
  {
    name: 'lead_qualification',
    title: 'Lead Qualification',
    description: 'Capture and normalize an inbound lead for follow-up.',
    instructions: 'Call lead_capture for each inbound lead. Preserve original notes and report the returned metrics without rewriting lead content.',
    toolIds: ['lead_capture'],
  },
  {
    name: 'meeting_preparation',
    title: 'Meeting Preparation',
    description: 'Prepare a meeting brief and follow-up package.',
    instructions: 'Before a meeting call meeting_prepare with title, date, and agenda. Afterward call meeting_followup with summary and action items.',
    toolIds: ['meeting_prepare', 'meeting_followup'],
  },
  {
    name: 'modern_pdf_publisher',
    title: 'Modern PDF Publisher',
    description: 'Publish polished reports and documents as PDFs.',
    instructions: 'Prefer modern_document_pdf for reports, proposals, briefs, and documentation. Use puppeteer_html_pdf only when exact custom HTML/CSS has already been supplied.',
    toolIds: ['modern_document_pdf', 'puppeteer_html_pdf'],
  },
  {
    name: 'production_web_evidence',
    title: 'Production Web Evidence',
    description: 'Audit, capture, and render evidence from a public webpage.',
    instructions: 'Audit the target URL first, capture the relevant page at an appropriate viewport, and optionally render the whole page to PDF. Record the final URL, status, load time, issues, and artifact URLs.',
    toolIds: ['playwright_screenshot', 'playwright_webpage_pdf', 'web_quality_audit'],
  },
  {
    name: 'safe_encoding_utilities',
    title: 'Safe Encoding Utilities',
    description: 'Use hashes, Base64 transport encoding, and UUID generation safely.',
    instructions: 'Use hash_text for content fingerprints, base64_encode or base64_decode only for transport encoding, and generate_uuids for opaque identifiers. Base64 is not encryption.',
    toolIds: ['hash_text', 'base64_encode', 'base64_decode', 'generate_uuids'],
  },
  {
    name: 'sales_follow_up',
    title: 'Sales Follow-up',
    description: 'Capture new interest and prepare follow-up for existing opportunities.',
    instructions: 'For new inbound interest call lead_capture. For existing opportunities call crm_followup with the last touchpoint and next action. Keep provider-specific CRM writes out of scope.',
    toolIds: ['lead_capture', 'crm_followup'],
  },
  {
    name: 'seo_content_review',
    title: 'SEO Content Review',
    description: 'Review technical SEO metadata and public-page quality.',
    instructions: 'Call seo_metadata_audit first, then web_quality_audit for the same canonical page. Separate missing technical metadata from visible content and accessibility issues.',
    toolIds: ['seo_metadata_audit', 'web_quality_audit'],
  },
  {
    name: 'tabular_data_exchange',
    title: 'Tabular Data Exchange',
    description: 'Convert and shape CSV or JSON records.',
    instructions: 'Inspect headers before conversion, use csv_to_json for delimited input, select_fields to enforce required output columns, and json_to_csv only after the record structure is consistent.',
    toolIds: ['csv_to_json', 'select_fields', 'json_to_csv'],
  },
  {
    name: 'web_research_report',
    title: 'Web Research to Report',
    description: 'Extract public sources, capture evidence, and publish a report.',
    instructions: 'Call extract_web_content for each public source URL and preserve source URLs in the notes. Capture a screenshot when visual evidence matters, then call modern_document_pdf after the report includes sources, findings, recommendations, and limitations.',
    toolIds: ['extract_web_content', 'playwright_screenshot', 'modern_document_pdf'],
  },
  {
    name: 'web_table_extraction',
    title: 'Web Table Extraction',
    description: 'Extract bounded table data from a public webpage.',
    instructions: 'Use extract_table_data with the narrowest stable table selector and an explicit row limit. Preserve the source URL, headers, total row count, and truncation flag.',
    toolIds: ['extract_table_data', 'extract_web_content'],
  },
  {
    name: 'website_release_gate',
    title: 'Website Release Gate',
    description: 'Check a public website before approving a release.',
    instructions: 'Call web_quality_audit on the public candidate URL, then call playwright_responsive_capture. Summarize blocking issues first and never claim a pass when essential failures remain.',
    toolIds: ['web_quality_audit', 'playwright_responsive_capture'],
  },
  {
    name: 'website_smoke_testing',
    title: 'Website Smoke Testing',
    description: 'Run acceptance checks against a public webpage and capture failures.',
    instructions: 'Call website_smoke_test with explicit title, text, or selector expectations. If any check fails, call playwright_screenshot for the same URL and include the temporary evidence link.',
    toolIds: ['website_smoke_test', 'playwright_screenshot'],
  },
]

const fallbackToolMap = new Map(
  selectedToolIds.map((name) => [name, {
    name,
    title: name.replaceAll('_', ' '),
    description: toolDescriptions[name],
    inputSchema: { type: 'object', additionalProperties: true },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    remoteToolId: name,
  }]),
)

function configuredGateway() {
  const gatewayUrl = String(
    process.env.MCP_SERVER_GATEWAY_URL || process.env.MCP_GATEWAY_URL || DEFAULT_GATEWAY_URL,
  ).replace(/\/+$/, '')
  const token = String(process.env.MCP_API_TOKEN || '').trim()
  return { gatewayUrl, token }
}

function createGatewayClient() {
  const { gatewayUrl, token } = configuredGateway()
  return new TooSClient(gatewayUrl, token)
}

function jsonText(value) {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function mcpToolResult(value, isError = false) {
  return {
    content: [{ type: 'text', text: jsonText(value) }],
    structuredContent: value,
    ...(isError ? { isError: true } : {}),
  }
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result }
}

function rpcError(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  }
}

function validArguments(argumentsValue) {
  return argumentsValue && typeof argumentsValue === 'object' && !Array.isArray(argumentsValue)
}

function normalizeRemoteTool(tool) {
  const name = typeof tool.catalog_id === 'string' && selectedToolIds.includes(tool.catalog_id)
    ? tool.catalog_id
    : tool.name
  if (!selectedToolIds.includes(name)) return null
  return {
    name,
    title: tool.title || name.replaceAll('_', ' '),
    description: tool.description || toolDescriptions[name],
    inputSchema: tool.input_schema && typeof tool.input_schema === 'object'
      ? tool.input_schema
      : fallbackToolMap.get(name).inputSchema,
    annotations: tool.annotations || fallbackToolMap.get(name).annotations,
    remoteToolId: name,
  }
}

export function createMcpGridServer({ gatewayClient = createGatewayClient(), logger = console } = {}) {
  let catalogPromise

  async function toolCatalog() {
    if (!catalogPromise) {
      catalogPromise = gatewayClient.capabilities()
        .then((capabilities) => {
          const remoteTools = Array.isArray(capabilities.tools)
            ? capabilities.tools.map(normalizeRemoteTool).filter(Boolean)
            : []
          if (!remoteTools.length) return [...fallbackToolMap.values()]
          const remoteByName = new Map(remoteTools.map((tool) => [tool.name, tool]))
          return selectedToolIds.map((name) => remoteByName.get(name) || fallbackToolMap.get(name))
        })
        .catch((error) => {
          logger.error(`MCP Grid catalog unavailable; using the installed action list: ${error.message}`)
          return [...fallbackToolMap.values()]
        })
    }
    return catalogPromise
  }

  async function handleMessage(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      return rpcError(null, -32600, 'Invalid Request')
    }
    const hasId = Object.hasOwn(message, 'id')
    if (message.method === 'notifications/initialized' || message.method === 'notifications/cancelled') {
      return null
    }
    if (message.method === 'initialize') {
      return rpcResult(message.id ?? null, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {}, prompts: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      })
    }
    if (!hasId) return null
    if (message.method === 'ping') return rpcResult(message.id, {})
    if (message.method === 'tools/list') {
      return rpcResult(message.id, { tools: await toolCatalog() })
    }
    if (message.method === 'prompts/list') {
      return rpcResult(message.id, {
        prompts: skills.map((skill) => ({
          name: skill.name,
          title: skill.title,
          description: skill.description,
          arguments: [{
            name: 'context',
            description: 'Optional task context to append to the skill instructions.',
            required: false,
          }],
        })),
      })
    }
    if (message.method === 'prompts/get') {
      const name = message.params?.name
      const skill = skills.find((item) => item.name === name)
      if (!skill) return rpcError(message.id, -32602, `Unknown MCP skill: ${name}`)
      const context = String(message.params?.arguments?.context || '').trim()
      return rpcResult(message.id, {
        description: skill.description,
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `${skill.instructions}${context ? `\n\nTask context:\n${context}` : ''}`,
          },
        }],
      })
    }
    if (message.method === 'tools/call') {
      const name = message.params?.name
      const argumentsValue = message.params?.arguments || {}
      if (typeof name !== 'string' || !selectedToolIds.includes(name)) {
        return rpcError(message.id, -32602, `Unknown MCP action: ${name}`)
      }
      if (!validArguments(argumentsValue)) {
        return rpcError(message.id, -32602, 'Tool arguments must be a JSON object.')
      }
      try {
        const invocation = await gatewayClient.invoke(name, argumentsValue)
        return rpcResult(message.id, mcpToolResult(invocation, Boolean(invocation?.is_error)))
      } catch (error) {
        logger.error(`MCP Grid action ${name} failed: ${error.message}`)
        return rpcResult(message.id, mcpToolResult({
          error: error.code || 'MCP_REQUEST_FAILED',
          message: error.message || 'MCP action failed.',
          action: name,
        }, true))
      }
    }
    return rpcError(message.id, -32601, `Method not found: ${message.method}`)
  }

  return {
    toolCatalog,
    handleMessage,
    skills,
    selectedToolIds,
  }
}

async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('MCP request body is too large.')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

function authorizedHttpRequest(request) {
  const configuredToken = String(process.env.MCP_SERVER_TOKEN || '').trim()
  const production = process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production'
  if (!configuredToken) {
    return process.env.MCP_HTTP_ALLOW_ANONYMOUS === 'true' && !production
  }
  return request.headers.authorization === `Bearer ${configuredToken}`
}

export function isMcpHttpAuthorized(request) {
  return authorizedHttpRequest(request)
}

export async function dispatchMcpHttpPayload(payload, mcpServer = createMcpGridServer()) {
  const batch = Array.isArray(payload)
  const messages = batch ? payload : [payload]
  const responses = (await Promise.all(messages.map((message) => mcpServer.handleMessage(message))))
    .filter(Boolean)
  return { batch, responses }
}

export function createMcpHttpServer({ mcpServer = createMcpGridServer() } = {}) {
  return createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ ok: true, server: SERVER_NAME, version: SERVER_VERSION }))
      return
    }
    if (request.url !== '/mcp') {
      response.writeHead(404, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: 'not_found' }))
      return
    }
    if (!authorizedHttpRequest(request)) {
      response.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' })
      response.end(JSON.stringify({ error: 'MCP_SERVER_UNAUTHORIZED' }))
      return
    }
    if (request.method !== 'POST') {
      response.writeHead(405, { Allow: 'POST', 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: 'MCP endpoint accepts POST only.' }))
      return
    }
    try {
      const payload = await readBody(request)
      const { batch, responses } = await dispatchMcpHttpPayload(payload, mcpServer)
      if (!responses.length) {
        response.writeHead(202)
        response.end()
        return
      }
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'MCP-Protocol-Version': PROTOCOL_VERSION,
      })
      response.end(JSON.stringify(batch ? responses : responses[0]))
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(rpcError(null, -32700, error.message || 'Parse error')))
    }
  })
}

async function startHttpServer(mcpServer) {
  const host = process.env.MCP_SERVER_HOST || DEFAULT_HTTP_HOST
  const port = Number.parseInt(process.env.MCP_SERVER_PORT || String(DEFAULT_HTTP_PORT), 10)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('MCP_SERVER_PORT must be a valid TCP port.')
  }
  const production = process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production'
  if (
    !String(process.env.MCP_SERVER_TOKEN || '').trim()
    && (production || process.env.MCP_HTTP_ALLOW_ANONYMOUS !== 'true')
  ) {
    throw new Error('MCP_SERVER_TOKEN is required for HTTP transport; use MCP_HTTP_ALLOW_ANONYMOUS=true only on a trusted private listener.')
  }
  const server = createMcpHttpServer({ mcpServer })
  await new Promise((resolve) => server.listen(port, host, resolve))
  console.error(`MCP Grid HTTP server listening on http://${host}:${port}/mcp`)
  return server
}

async function startStdioServer(mcpServer) {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    let response
    try {
      response = await mcpServer.handleMessage(JSON.parse(line))
    } catch (error) {
      response = rpcError(null, -32603, error.message || 'Internal error')
    }
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`)
  }
}

async function main() {
  const transport = String(process.env.MCP_SERVER_TRANSPORT || 'stdio').toLowerCase()
  if (!['stdio', 'http', 'both'].includes(transport)) {
    throw new Error('MCP_SERVER_TRANSPORT must be stdio, http, or both.')
  }
  const mcpServer = createMcpGridServer()
  if (transport === 'http' || transport === 'both') await startHttpServer(mcpServer)
  if (transport === 'stdio' || transport === 'both') await startStdioServer(mcpServer)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
