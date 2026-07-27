import {
  cacheSession,
  clearOfflineData,
  getCachedSession,
} from './offlineStore'

export type AutomationStatus = 'active' | 'paused' | 'draft'
export type RunStatus = 'completed' | 'running' | 'failed'

export type User = {
  id: string
  name: string
  email: string
  workspaceId: string
  workspace: string
  role: 'owner' | 'collaborator'
  initials: string
}

export type Automation = {
  id: string
  name: string
  description: string
  icon: string
  accent: string
  status: AutomationStatus
  model: string
  runs: number
  successRate: number
  lastRun: string
  tools: string[]
}

export type Run = {
  id: string
  automationId: string
  automationName: string
  instruction: string
  status: RunStatus
  startedAt: string
  duration: string
  steps: number
}

export type Integration = {
  id: string
  name: string
  description: string
  category: 'Automation' | 'Communication' | 'Design' | 'Payments' | 'Storage'
  connected: boolean
  icon: string
  accent: string
}

export type N8nMethod = 'GET' | 'POST'
export type N8nDirection = 'to-n8n' | 'from-n8n'

export type N8nConfig = {
  connected: boolean
  outboundUrl: string
  callbackUrl: string
  methods: N8nMethod[]
  signingSecretConfigured: boolean
  updatedAt: string | null
  lastDeliveryAt: string | null
}

export type N8nConfigInput = {
  outboundUrl: string
  methods: N8nMethod[]
  signingSecret: string
}

export type N8nDelivery = {
  id: string
  direction: 'outbound' | 'inbound'
  method: N8nMethod
  eventType: string
  status: 'pending' | 'succeeded' | 'failed' | 'accepted' | 'rejected'
  responseStatus: number | null
  duration: number | null
  errorCode: string | null
  attemptNumber: number
  retryOf: string | null
  correlationId: string
  createdAt: string
  completedAt: string | null
}

export type N8nTestResult = {
  ok: true
  direction: N8nDirection
  method: N8nMethod
  status: number
  latency: number
  message: string
  delivery: N8nDelivery
}

export type McpTool = {
  id: string
  name: string
  description: string
}

export type McpService = {
  id: string
  name: string
  description: string
  category: 'Browser' | 'Data' | 'Text' | 'Utilities'
  status: 'live' | 'unreachable'
  active: boolean
  tools: McpTool[]
  credentialMode: 'Workspace vault' | 'Credential-free'
}

export type McpConnection = {
  gatewayUrl: string
  capabilityEndpoint: string
  authSource: string
  sourcePath: string
  mode: 'DNS gateway'
  accessStatus: 'available' | 'pending' | 'approved'
  connected: boolean
  lastSync: string
  requestedAt: string | null
}

export type McpInvocationResult = {
  ok: true
  serviceId: string
  toolId: string
  requestId: string
  duration: number
  message: string
}

export type ApiKeyPermission = 'workspace:read' | 'mcp:read'

export type ApiKey = {
  id: string
  name: string
  prefix: string
  permissions: ApiKeyPermission[]
  createdAt: string
  lastUsedAt: string | null
}

export type PaystackConnection = {
  provider: 'paystack'
  configured: boolean
  mode: 'none' | 'test' | 'live'
  credentialSource: 'none' | 'environment'
  configuredAt: string | null
  updatedAt: string | null
  currency: 'ZAR'
}

export type MoneyInvoice = {
  id: string
  invoiceNumber: string
  clientName: string
  clientEmail: string
  projectName: string
  description: string
  amountMinor: number
  currency: 'ZAR'
  dueDate: string | null
  status: 'initializing' | 'pending' | 'paid' | 'failed'
  provider: 'paystack'
  providerReference: string
  paymentUrl: string | null
  createdAt: string
  updatedAt: string
  paidAt: string | null
}

export type CreatePaystackPaymentLinkInput = {
  clientName: string
  clientEmail: string
  projectName: string
  description: string
  amountMinor: number
  currency: 'ZAR'
  dueDate: string | null
}

export type PaystackPaymentLinkResult = {
  invoice: MoneyInvoice
  paymentLink: {
    id: string
    provider: 'paystack'
    providerReference: string
    authorizationUrl: string
    status: 'pending' | 'paid'
    createdAt: string
    updatedAt: string
    paidAt: string | null
  }
}

export type WorkspaceSettings = {
  name: string
  logoUrl: string
  email: string
  timezone: string
  travelMode: string
  travelLocation: string
  updatedAt: string
}

export type Project = {
  id: string
  workspaceId?: string
  name: string
  client: string
  scope: string
  due: string
  status: 'In progress' | 'In review' | 'Waiting on client' | 'Ready'
  progress: number
  accent: string
  boardId?: string | null
  createdAt?: string
  updatedAt?: string
}

export type ProjectInput = {
  name: string
  client: string
  scope?: string
  due?: string
  status?: string
  boardId?: string | null
}

export type ProjectLink = {
  id: string
  projectId: string
  workspaceId: string
  url: string
  label: string
  createdAt: string
}

export type ProjectFile = {
  id: string
  projectId: string
  workspaceId: string
  name: string
  mimeType: string
  size: number
  storageKey: string
  createdAt: string
}

let mcpConnection: McpConnection = {
  gatewayUrl: 'https://mcp.hygridtech.co.za',
  capabilityEndpoint: '/api/v1/capabilities',
  authSource: 'Managed bearer grant · server-side only',
  sourcePath: '/home/apps/mcp',
  mode: 'DNS gateway',
  accessStatus: 'available',
  connected: false,
  lastSync: 'Never',
  requestedAt: null,
}

let mcpServices: McpService[] = [
  {
    id: 'browser-worker',
    name: 'Browser & documents',
    description: 'Guarded browser automation, web audits, extraction, screenshots, and PDFs.',
    category: 'Browser',
    status: 'live',
    active: false,
    credentialMode: 'Workspace vault',
    tools: [
      {
        id: 'playwright_screenshot',
        name: 'Playwright screenshot',
        description: 'Capture a public webpage at a configured viewport.',
      },
      {
        id: 'playwright_responsive_capture',
        name: 'Responsive capture',
        description: 'Capture mobile, tablet, and desktop evidence.',
      },
      {
        id: 'playwright_webpage_pdf',
        name: 'Webpage to PDF',
        description: 'Publish a public webpage as a PDF.',
      },
      {
        id: 'puppeteer_html_pdf',
        name: 'HTML to PDF',
        description: 'Render sanitized supplied HTML to PDF.',
      },
      {
        id: 'modern_document_pdf',
        name: 'Modern document PDF',
        description: 'Turn sanitized Markdown into a styled PDF.',
      },
      {
        id: 'web_quality_audit',
        name: 'Web quality audit',
        description: 'Inspect metadata, headings, image alts, and browser errors.',
      },
      {
        id: 'extract_web_content',
        name: 'Extract web content',
        description: 'Return structured metadata, links, headings, and readable text.',
      },
      {
        id: 'website_smoke_test',
        name: 'Website smoke test',
        description: 'Run deterministic title, text, and selector assertions.',
      },
      {
        id: 'extract_table_data',
        name: 'Extract table data',
        description: 'Read bounded table rows into structured JSON.',
      },
      {
        id: 'seo_metadata_audit',
        name: 'SEO metadata audit',
        description: 'Inspect canonical, robots, social cards, and JSON-LD.',
      },
    ],
  },
  {
    id: 'text-worker',
    name: 'Text processing',
    description: 'Deterministic text transformation, statistics, and literal replacement.',
    category: 'Text',
    status: 'live',
    active: false,
    credentialMode: 'Credential-free',
    tools: [
      {
        id: 'transform_text',
        name: 'Transform text',
        description: 'Apply case and formatting transformations.',
      },
      {
        id: 'text_stats',
        name: 'Text statistics',
        description: 'Count characters, words, bytes, and lines.',
      },
      {
        id: 'find_replace',
        name: 'Find and replace',
        description: 'Apply ordered literal replacements.',
      },
    ],
  },
  {
    id: 'data-worker',
    name: 'Structured data',
    description: 'Bounded CSV and JSON conversion with safe field projection.',
    category: 'Data',
    status: 'live',
    active: false,
    credentialMode: 'Credential-free',
    tools: [
      {
        id: 'csv_to_json',
        name: 'CSV to JSON',
        description: 'Parse a bounded delimited document.',
      },
      {
        id: 'json_to_csv',
        name: 'JSON to CSV',
        description: 'Serialize bounded records with ordered fields.',
      },
      {
        id: 'select_fields',
        name: 'Select fields',
        description: 'Project records onto an approved field list.',
      },
    ],
  },
  {
    id: 'utility-worker',
    name: 'Encoding & identifiers',
    description: 'Hashing, Base64 transport encoding, and UUID generation.',
    category: 'Utilities',
    status: 'live',
    active: false,
    credentialMode: 'Credential-free',
    tools: [
      {
        id: 'hash_text',
        name: 'Hash text',
        description: 'Create SHA-256, SHA-512, or BLAKE2b digests.',
      },
      {
        id: 'base64_encode',
        name: 'Base64 encode',
        description: 'Encode UTF-8 content for transport.',
      },
      {
        id: 'base64_decode',
        name: 'Base64 decode',
        description: 'Decode and validate Base64 as UTF-8.',
      },
      {
        id: 'generate_uuids',
        name: 'Generate UUIDs',
        description: 'Generate up to 100 UUIDv4 identifiers.',
      },
    ],
  },
]

const copy = <T,>(value: T): T => structuredClone(value)

const mutationHeaders = (json = false) => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  'Idempotency-Key': crypto.randomUUID(),
})

export const api = {
  auth: {
    async register(email: string, password: string, name?: string, workspace?: string) {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, workspace }),
      })
      const payload = (await response.json()) as { user?: User; error?: string }
      if (!response.ok || !payload.user) {
        throw new Error(payload.error || 'Unable to create account.')
      }
      void cacheSession(payload.user).catch(() => undefined)
      return payload.user
    },
    async session() {
      let response: Response
      try {
        response = await fetch('/api/auth/session', {
          credentials: 'same-origin',
        })
      } catch {
        return getCachedSession().catch(() => null)
      }
      if (response.status === 401 || response.status === 403) {
        void clearOfflineData().catch(() => undefined)
        return null
      }
      if (!response.ok) return getCachedSession().catch(() => null)
      let payload: { user: User }
      try {
        payload = (await response.json()) as { user: User }
      } catch {
        return getCachedSession().catch(() => null)
      }
      void cacheSession(payload.user).catch(() => undefined)
      return payload.user
    },
    async signIn(email: string, password: string) {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const payload = (await response.json()) as { user?: User; error?: string }
      if (!response.ok || !payload.user) {
        throw new Error(payload.error || 'Unable to sign in.')
      }
      void cacheSession(payload.user).catch(() => undefined)
      return payload.user
    },
    async signOut() {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
      })
      if (!response.ok) throw new Error('Unable to sign out.')
      await clearOfflineData().catch(() => undefined)
      return { ok: true }
    },
  },
  automations: {
    async list() {
      const response = await fetch('/api/automations', { credentials: 'same-origin' })
      const payload = (await response.json()) as {
        automations?: Automation[]
        error?: string
      }
      if (!response.ok || !payload.automations) {
        throw new Error(payload.error || 'Unable to load automations.')
      }
      return payload.automations
    },
    async create(input: Pick<Automation, 'name' | 'description' | 'model'>) {
      const response = await fetch('/api/automations', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify(input),
      })
      const payload = (await response.json()) as Automation & { error?: string }
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Unable to create automation.')
      }
      return payload as Automation
    },
    async toggle(id: string) {
      const response = await fetch(`/api/automations/${encodeURIComponent(id)}/toggle`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      const payload = (await response.json()) as Automation & { error?: string }
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Unable to toggle automation.')
      }
      return payload as Automation
    },
  },
  runs: {
    async list() {
      const response = await fetch('/api/automations/runs', { credentials: 'same-origin' })
      const payload = (await response.json()) as {
        runs?: Run[]
        error?: string
      }
      if (!response.ok || !payload.runs) {
        throw new Error(payload.error || 'Unable to load automation runs.')
      }
      return payload.runs
    },
    async dispatch(automationId: string, instruction: string) {
      const response = await fetch('/api/automations/runs', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify({ automationId, instruction }),
      })
      const payload = (await response.json()) as Run & { error?: string }
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Unable to dispatch automation run.')
      }
      return payload as Run
    },
  },
  integrations: {
    async list() {
      const response = await fetch('/api/integrations', { credentials: 'same-origin' })
      const payload = (await response.json()) as {
        integrations?: Integration[]
        error?: string
      }
      if (!response.ok || !payload.integrations) {
        throw new Error(payload.error || 'Unable to load integrations.')
      }
      return payload.integrations
    },
    async toggle(id: string) {
      const response = await fetch(`/api/integrations/${encodeURIComponent(id)}/toggle`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      const payload = (await response.json()) as Integration & { error?: string }
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Unable to toggle integration.')
      }
      return payload as Integration
    },
  },
  n8n: {
    async getConfig() {
      const response = await fetch('/api/n8n/config', {
        credentials: 'same-origin',
      })
      const payload = (await response.json()) as N8nConfig & { error?: string }
      if (!response.ok || typeof payload.connected !== 'boolean') {
        throw new Error(payload.error || 'Unable to load n8n configuration.')
      }
      return payload
    },
    async configure(input: N8nConfigInput) {
      const response = await fetch('/api/n8n/config', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify(input),
      })
      const payload = (await response.json()) as N8nConfig & { error?: string }
      if (!response.ok || typeof payload.connected !== 'boolean') {
        throw new Error(payload.error || 'Unable to save the n8n connection.')
      }
      const integrationResp = await fetch('/api/integrations', { credentials: 'same-origin' })
      const integrationPayload = (await integrationResp.json()) as { integrations?: Integration[] }
      const n8nIntegration = (integrationPayload.integrations || []).find((i) => i.id === 'n8n')
      return {
        integration: n8nIntegration || { id: 'n8n', name: 'n8n', description: '', category: 'Automation', connected: true, icon: 'n8n', accent: '#ea4b71' },
        config: payload,
      }
    },
    async trigger(
      direction: N8nDirection,
      method: N8nMethod,
    ): Promise<N8nTestResult> {
      const endpoint =
        direction === 'to-n8n'
          ? '/api/n8n/deliveries'
          : '/api/n8n/inbound-self-test'
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify(
          direction === 'to-n8n'
            ? {
                method,
                event: {
                  type: 'lancee.connection_test',
                  source: 'connections',
                },
              }
            : { method },
        ),
      })
      const payload = (await response.json()) as {
        ok?: boolean
        direction?: N8nDirection
        method?: N8nMethod
        status?: number
        latency?: number
        message?: string
        delivery?: N8nDelivery
        error?: string
      }
      if (!response.ok || !payload.delivery) {
        throw new Error(payload.error || 'The n8n test delivery failed.')
      }
      if (direction === 'from-n8n') {
        return payload as N8nTestResult
      }
      return {
        ok: true,
        direction,
        method,
        status: payload.delivery.responseStatus || 200,
        latency: payload.delivery.duration || 0,
        message: `lancee → n8n ${method} delivery succeeded`,
        delivery: payload.delivery,
      }
    },
    async listDeliveries() {
      const response = await fetch('/api/n8n/deliveries', {
        credentials: 'same-origin',
      })
      const payload = (await response.json()) as {
        deliveries?: N8nDelivery[]
        error?: string
      }
      if (!response.ok || !payload.deliveries) {
        throw new Error(payload.error || 'Unable to load n8n delivery history.')
      }
      return payload.deliveries
    },
    async retry(deliveryId: string) {
      const response = await fetch(
        `/api/n8n/deliveries/${encodeURIComponent(deliveryId)}/retry`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: mutationHeaders(),
        },
      )
      const payload = (await response.json()) as {
        ok?: boolean
        delivery?: N8nDelivery
        error?: string
      }
      if (!response.ok || !payload.delivery) {
        throw new Error(payload.error || 'The n8n retry failed.')
      }
      return payload.delivery
    },
    async disconnect() {
      const response = await fetch('/api/n8n/disconnect', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      const payload = (await response.json()) as N8nConfig & { error?: string }
      if (!response.ok || payload.connected !== false) {
        throw new Error(payload.error || 'Unable to disconnect n8n.')
      }
      const integrationResp = await fetch('/api/integrations', { credentials: 'same-origin' })
      const integrationPayload = (await integrationResp.json()) as { integrations?: Integration[] }
      const n8nIntegration = (integrationPayload.integrations || []).find((i) => i.id === 'n8n')
      return {
        integration: n8nIntegration || { id: 'n8n', name: 'n8n', description: '', category: 'Automation', connected: false, icon: 'n8n', accent: '#ea4b71' },
        config: payload,
      }
    },
  },
  mcp: {
    async getConnection() {
      const response = await fetch('/api/mcp/access', {
        credentials: 'same-origin',
      })
      if (!response.ok) throw new Error('Unable to load MCP platform access.')
      const payload = (await response.json()) as {
        status: McpConnection['accessStatus']
        gatewayUrl: string
        requestedAt: string | null
      }
      mcpConnection = {
        ...mcpConnection,
        gatewayUrl: payload.gatewayUrl,
        accessStatus: payload.status,
        connected: payload.status === 'approved',
        requestedAt: payload.requestedAt,
      }
      return copy(mcpConnection)
    },
    async listServices() {
      const response = await fetch('/api/mcp/services', {
        credentials: 'same-origin',
      })
      const payload = (await response.json()) as {
        services?: Array<{ serviceId: string; active: boolean }>
        error?: string
      }
      if (!response.ok || !payload.services) {
        throw new Error(payload.error || 'Unable to load MCP service state.')
      }
      const activeById = new Map(
        payload.services.map((service) => [service.serviceId, service.active]),
      )
      mcpServices = mcpServices.map((service) => ({
        ...service,
        active: activeById.get(service.id) ?? false,
      }))
      return copy(mcpServices)
    },
    async requestAccess() {
      const response = await fetch('/api/mcp/access-request', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      const payload = (await response.json()) as {
        status?: McpConnection['accessStatus']
        gatewayUrl?: string
        requestedAt?: string | null
        error?: string
      }
      if (!response.ok || !payload.status) {
        throw new Error(payload.error || 'Unable to request MCP bearer access.')
      }
      mcpConnection = {
        ...mcpConnection,
        gatewayUrl: payload.gatewayUrl || mcpConnection.gatewayUrl,
        accessStatus: payload.status,
        connected: payload.status === 'approved',
        requestedAt: payload.requestedAt ?? mcpConnection.requestedAt,
        lastSync: payload.status === 'approved' ? 'Just now' : 'Never',
      }
      const integrationResp = await fetch('/api/integrations', { credentials: 'same-origin' })
      const integrationPayload = (await integrationResp.json()) as { integrations?: Integration[] }
      const mcpGridIntegration = (integrationPayload.integrations || []).find((i) => i.id === 'mcp-grid')
      return {
        integration: mcpGridIntegration || { id: 'mcp-grid', name: 'Service connector', description: '', category: 'Automation', connected: payload.status === 'approved', icon: 'mcp', accent: '#786bff' },
        connection: copy(mcpConnection),
        services: copy(mcpServices),
      }
    },
    async sync() {
      const response = await fetch('/api/mcp/sync', {
        method: 'POST',
        credentials: 'same-origin',
      })
      const payload = (await response.json()) as {
        connection?: McpConnection
        services?: McpService[]
        error?: string
      }
      if (!response.ok || !payload.connection || !payload.services) {
        throw new Error(payload.error || 'Unable to sync MCP capabilities.')
      }
      mcpConnection = payload.connection
      mcpServices = payload.services
      return { connection: payload.connection, services: payload.services }
    },
    async toggleService(id: string) {
      if (mcpConnection.accessStatus !== 'approved') {
        throw new Error('Bearer access must be approved before services can be activated.')
      }
      const current = mcpServices.find((service) => service.id === id)
      if (!current) throw new Error('MCP service not found.')
      const response = await fetch(`/api/mcp/services/${encodeURIComponent(id)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify({ active: !current.active }),
      })
      const payload = (await response.json()) as {
        serviceId?: string
        active?: boolean
        error?: string
      }
      if (!response.ok || payload.serviceId !== id || typeof payload.active !== 'boolean') {
        throw new Error(payload.error || 'Unable to update MCP service state.')
      }
      mcpServices = mcpServices.map((service) =>
        service.id === id ? { ...service, active: payload.active! } : service,
      )
      const service = mcpServices.find((item) => item.id === id)!
      return copy(service)
    },
    async invoke(serviceId: string, toolId: string) {
      const response = await fetch('/api/mcp/invoke', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify({ serviceId, toolId }),
      })
      const payload = (await response.json()) as McpInvocationResult & { error?: string }
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Unable to invoke MCP tool.')
      }
      return payload as McpInvocationResult
    },
    async revokeAccess() {
      const response = await fetch('/api/mcp/access/revoke', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      const payload = (await response.json()) as {
        status?: McpConnection['accessStatus']
        gatewayUrl?: string
        requestedAt?: string | null
        error?: string
      }
      if (!response.ok || !payload.status) {
        throw new Error(payload.error || 'Unable to revoke MCP bearer access.')
      }
      mcpConnection = {
        ...mcpConnection,
        gatewayUrl: payload.gatewayUrl || mcpConnection.gatewayUrl,
        accessStatus: payload.status,
        connected: false,
        lastSync: 'Never',
        requestedAt: payload.requestedAt ?? null,
      }
      mcpServices = mcpServices.map((service) => ({ ...service, active: false }))
      const integrationResp = await fetch('/api/integrations', { credentials: 'same-origin' })
      const integrationPayload = (await integrationResp.json()) as { integrations?: Integration[] }
      const mcpGridIntegration = (integrationPayload.integrations || []).find((i) => i.id === 'mcp-grid')
      return {
        integration: mcpGridIntegration || { id: 'mcp-grid', name: 'Service connector', description: '', category: 'Automation', connected: false, icon: 'mcp', accent: '#786bff' },
        connection: copy(mcpConnection),
        services: copy(mcpServices),
      }
    },
  },
  apiKeys: {
    async list() {
      const response = await fetch('/api/api-keys', {
        credentials: 'same-origin',
      })
      const payload = (await response.json()) as {
        keys?: ApiKey[]
        error?: string
      }
      if (!response.ok || !payload.keys) {
        throw new Error(payload.error || 'Unable to load API keys.')
      }
      return payload.keys
    },
    async create(name: string, permissions: ApiKeyPermission[]) {
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify({ name, permissions }),
      })
      const payload = (await response.json()) as {
        key?: ApiKey
        secret?: string
        error?: string
      }
      if (!response.ok || !payload.key || !payload.secret) {
        throw new Error(payload.error || 'Unable to create API key.')
      }
      return { key: payload.key, secret: payload.secret }
    },
    async revoke(id: string) {
      const response = await fetch(`/api/api-keys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      const payload = (await response.json()) as {
        ok?: boolean
        error?: string
      }
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Unable to revoke API key.')
      }
      return payload
    },
  },
  money: {
    async getPaystackStatus() {
      const response = await fetch('/api/money/paystack/status', {
        credentials: 'same-origin',
      })
      const payload = (await response.json()) as PaystackConnection & {
        error?: string
      }
      if (!response.ok || payload.provider !== 'paystack') {
        throw new Error(payload.error || 'Unable to load Paystack status.')
      }
      return payload
    },
    async listInvoices() {
      const response = await fetch('/api/money/invoices', {
        credentials: 'same-origin',
      })
      const payload = (await response.json()) as {
        invoices?: MoneyInvoice[]
        error?: string
      }
      if (!response.ok || !payload.invoices) {
        throw new Error(payload.error || 'Unable to load invoices.')
      }
      return payload.invoices
    },
    async createPaystackPaymentLink(input: CreatePaystackPaymentLinkInput) {
      const response = await fetch('/api/money/paystack/payment-links', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify(input),
      })
      const payload = (await response.json()) as PaystackPaymentLinkResult & {
        error?: string
      }
      if (
        !response.ok ||
        !payload.invoice ||
        !payload.paymentLink?.authorizationUrl
      ) {
        throw new Error(payload.error || 'Unable to create Paystack payment link.')
      }
      return payload
    },
  },
  ai: {
    async complete(messages: Array<{ role: string; content: string }>, systemPrompt?: string) {
      const response = await fetch('/api/ai/complete', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, systemPrompt }),
      })
      const payload = (await response.json()) as {
        content?: string
        model?: string
        usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
        error?: string
      }
      if (!response.ok || typeof payload.content !== 'string') {
        throw new Error(payload.error || 'AI request failed.')
      }
      return payload as { content: string; model: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }
    },
  },
  workspace: {
    async getSettings() {
      const response = await fetch('/api/workspace/settings', { credentials: 'same-origin' })
      const payload = (await response.json()) as WorkspaceSettings & { error?: string }
      if (!response.ok || typeof payload.name !== 'string') {
        throw new Error(payload.error || 'Unable to load workspace settings.')
      }
      return payload as WorkspaceSettings
    },
    async updateSettings(settings: Partial<WorkspaceSettings>) {
      const response = await fetch('/api/workspace/settings', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify(settings),
      })
      const payload = (await response.json()) as WorkspaceSettings & { error?: string }
      if (!response.ok || typeof payload.name !== 'string') {
        throw new Error(payload.error || 'Unable to save workspace settings.')
      }
      return payload as WorkspaceSettings
    },
  },
  database: {
    async getInfo() {
      const response = await fetch('/api/database/info', { credentials: 'same-origin' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error('Unable to load database metrics.')
      }
      return payload as {
        provider: string
        mode: string
        version: string
        status: string
        tablesCount: number
      }
    },
  },
  team: {
    async list() {
      const response = await fetch('/api/workspace/team', { credentials: 'same-origin' })
      const payload = await response.json()
      if (!response.ok || !payload.members) {
        throw new Error('Unable to load team members.')
      }
      return payload.members as Array<{
        id: string
        name: string
        email: string
        role: string
        status: string
        joinedAt: string
      }>
    },
  },
  analytics: {
    async get() {
      const response = await fetch('/api/workspace/analytics', { credentials: 'same-origin' })
      const payload = await response.json()
      if (!response.ok || !payload.metrics) {
        throw new Error('Unable to load analytics.')
      }
      return payload as {
        metrics: {
          activeAutomations: number
          connectedIntegrations: number
          totalRuns: number
          successRate: number
          averageRunDurationSec: number
          savedHoursThisMonth: number
          apiCallsThisMonth: number
          databaseQueryTimeMs: number
          openProjects: number
          dueSoonProjects: number
          totalClients: number
          outstandingAmount: number
          pendingInvoices: number
          dueThisWeek: number
        }
        weeklyActivity: Array<{ day: string; runs: number; success: number }>
      }
    },
  },
  projects: {
    async list() {
      const response = await fetch('/api/projects', { credentials: 'same-origin' })
      const payload = (await response.json()) as { projects?: Project[]; error?: string }
      if (!response.ok || !payload.projects) {
        throw new Error(payload.error || 'Unable to load projects.')
      }
      return payload.projects
    },
    async create(input: ProjectInput) {
      const response = await fetch('/api/projects', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify(input),
      })
      const payload = (await response.json()) as Project & { error?: string }
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Unable to create project.')
      }
      return payload as Project
    },
    async updateStatus(id: string, status: string) {
      const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify({ status }),
      })
      const payload = (await response.json()) as Project & { error?: string }
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Unable to update project.')
      }
      return payload as Project
    },
    async update(id: string, fields: Partial<ProjectInput & { status: string; scope: string; due: string }>) {
      const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify(fields),
      })
      const payload = (await response.json()) as Project & { error?: string }
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Unable to update project.')
      }
      return payload as Project
    },
    async remove(id: string) {
      const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!response.ok) throw new Error('Unable to delete project.')
    },
    links: {
      async list(projectId: string): Promise<ProjectLink[]> {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/links`, { credentials: 'same-origin' })
        const payload = (await response.json()) as { links?: ProjectLink[]; error?: string }
        if (!response.ok || !payload.links) throw new Error(payload.error || 'Unable to load links.')
        return payload.links
      },
      async add(projectId: string, url: string, label: string): Promise<ProjectLink> {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/links`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: mutationHeaders(true),
          body: JSON.stringify({ url, label }),
        })
        const payload = (await response.json()) as { link?: ProjectLink; error?: string }
        if (!response.ok || !payload.link) throw new Error(payload.error || 'Unable to add link.')
        return payload.link
      },
      async remove(linkId: string): Promise<void> {
        const response = await fetch(`/api/projects/links/${encodeURIComponent(linkId)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        })
        if (!response.ok) throw new Error('Unable to delete link.')
      },
    },
    files: {
      async list(projectId: string): Promise<ProjectFile[]> {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, { credentials: 'same-origin' })
        const payload = (await response.json()) as { files?: ProjectFile[]; error?: string }
        if (!response.ok || !payload.files) throw new Error(payload.error || 'Unable to load files.')
        return payload.files
      },
      async add(projectId: string, fileInfo: { name: string; mimeType?: string; size?: number; storageKey: string }): Promise<ProjectFile> {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: mutationHeaders(true),
          body: JSON.stringify(fileInfo),
        })
        const payload = (await response.json()) as { file?: ProjectFile; error?: string }
        if (!response.ok || !payload.file) throw new Error(payload.error || 'Unable to add file.')
        return payload.file
      },
      async remove(fileId: string): Promise<void> {
        const response = await fetch(`/api/projects/files/${encodeURIComponent(fileId)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        })
        if (!response.ok) throw new Error('Unable to delete file.')
      },
    },
  },
  ideas: {
    async listBoards(): Promise<Array<{ id: string; label: string }>> {
      const response = await fetch('/api/ideas/boards', { credentials: 'same-origin' })
      const payload = (await response.json()) as { boards?: Array<{ id: string; label: string }>; error?: string }
      if (!response.ok || !payload.boards) throw new Error(payload.error || 'Unable to load boards.')
      return payload.boards
    },
    async createBoard(label: string): Promise<{ id: string; label: string }> {
      const response = await fetch('/api/ideas/boards', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      const payload = (await response.json()) as { board?: { id: string; label: string }; error?: string }
      if (!response.ok || !payload.board) throw new Error(payload.error || 'Unable to create board.')
      return payload.board
    },
    async deleteBoard(boardId: string): Promise<void> {
      const response = await fetch(`/api/ideas/boards/${encodeURIComponent(boardId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!response.ok) throw new Error('Unable to delete board.')
    },
    async listElements(boardId: string): Promise<Array<{ id: string; kind: string; x: number; y: number; data: Record<string, unknown> }>> {
      const response = await fetch(`/api/ideas/elements?boardId=${encodeURIComponent(boardId)}`, { credentials: 'same-origin' })
      const payload = (await response.json()) as { elements?: Array<any>; error?: string }
      if (!response.ok || !payload.elements) throw new Error(payload.error || 'Unable to load elements.')
      return payload.elements.map((el: any) => ({
        id: el.id,
        kind: el.kind,
        x: el.x,
        y: el.y,
        data: typeof el.dataJson === 'string' ? JSON.parse(el.dataJson) : (el.data || {}),
      }))
    },
    async saveElement(boardId: string, id: string, kind: string, x: number, y: number, data: Record<string, unknown>): Promise<void> {
      const isNew = id.startsWith('elem_') && !(await this.listElements(boardId)).some((e) => e.id === id)
      const response = await fetch(isNew ? '/api/ideas/elements' : `/api/ideas/elements/${encodeURIComponent(id)}`, {
        method: isNew ? 'POST' : 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId, id, kind, x, y, data }),
      })
      if (!response.ok) throw new Error('Unable to save canvas element.')
    },
    async deleteElement(elementId: string): Promise<void> {
      const response = await fetch(`/api/ideas/elements/${encodeURIComponent(elementId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!response.ok) throw new Error('Unable to delete canvas element.')
    },
  },
}

