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
  avatarUrl: string
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
  execution: 'core' | 'edge'
  runs: number
  successRate: number
  lastRun: string
  tools: string[]
}

export type RunEvent = {
  id: string
  runId: string
  sequence: number
  level: 'info' | 'warning' | 'error'
  eventType: string
  message: string
  toolId: string | null
  input: unknown
  output: unknown
  durationMs: number | null
  createdAt: string
}

export type WorkspaceNotification = {
  id: string
  kind: string
  title: string
  body: string
  entityType: string | null
  entityId: string | null
  readAt: string | null
  createdAt: string
}

export type IntegrationToken = {
  provider: string
  tokenType: string
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

export type Run = {
  id: string
  automationId: string
  automationName: string
  instruction: string
  status: RunStatus
  startedAt: string
  duration: string
  durationSeconds?: number | null
  steps: number
  errorCode?: string | null
  completedAt?: string | null
  events?: RunEvent[]
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

export type GoogleDriveFile = {
  id: string
  name: string
  mimeType: string
  webViewLink: string | null
  modifiedTime: string | null
  size: number | null
  canEdit: boolean
  canDownload: boolean
  canListChildren: boolean
  canDelete: boolean
}

export type GoogleDriveEditorDocument = GoogleDriveFile & {
  kind: 'rich-text' | 'markdown'
  version: string | null
  content: string
  warnings: string[]
}

export type IntegrationRequest = {
  id: string
  name: string
  category: Integration['category'] | 'Other'
  details: string
  status: 'requested' | 'planned' | 'declined'
  createdAt: string
  updatedAt: string
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
  runtimeName?: string
  name: string
  description: string
  inputSchema?: Record<string, unknown>
  tags?: string[]
}

export type McpService = {
  id: string
  name: string
  description: string
  category: 'Browser' | 'Data' | 'Text' | 'Utilities'
  status: 'live' | 'unreachable'
  active: boolean
  tools: McpTool[]
  credentialMode: 'Workspace vault' | 'Credential-free' | 'Server-side access key'
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
  ok: boolean
  serviceId: string
  toolId: string
  requestId: string
  duration: number
  message: string
  data?: unknown
}

export type ProposedMcpAction = {
  serviceId: string
  toolId: string
  arguments: Record<string, unknown>
}

export type StorefrontDomain = {
  id: string
  domain: string
  status: 'pending' | 'verified'
  createdAt: string
  verifiedAt: string | null
  dns: {
    txtName: string
    txtValue: string
    cnameName: string
    cnameTarget: string
  }
}

export type StorefrontSettings = {
  enabled: boolean
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
  credentialSource: 'none' | 'environment' | 'workspace' | 'disabled'
  configuredAt: string | null
  updatedAt: string | null
  currency: 'ZAR'
  webhookUrl: string
}

export type MailAccount = {
  email: string
  displayName: string
  username: string
  provider: string
  imapHost: string
  imapPort: number
  imapSecure: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  status: 'connected' | 'error'
  lastSyncedAt: string | null
  lastError: string
  updatedAt: string
}

export type MailAccountStatus = {
  connected: boolean
  account: MailAccount | null
}

export type MailDiscovery = {
  detected: boolean
  provider: string
  providerName: string
  username: string
  imapHost: string
  imapPort: number
  imapSecure: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  instructions: string[]
}

export type MailAddress = { name: string; address: string }

export type MailFolder = {
  path: string
  name: string
  delimiter: string
  specialUse: string | null
}

export type MailMessageSummary = {
  uid: number
  folder: string
  messageId: string
  subject: string
  from: MailAddress[]
  to: MailAddress[]
  cc: MailAddress[]
  date: string
  unread: boolean
  flagged: boolean
  size: number
  snippet: string
}

export type ClientHistory = {
  projects: Project[]
  messages: MailMessageSummary[]
  domain: string | null
  mailConnected: boolean
}

export type MailMessage = MailMessageSummary & {
  replyTo: MailAddress[]
  text: string
  html: string
  attachments: Array<{
    filename: string
    contentType: string
    size: number
    contentId: string | null
  }>
}

export type MailAutomationRule = {
  id: string
  automationId: string
  automationName: string
  name: string
  sender: string
  recipient: string
  subject: string
  keywords: string[]
  matchMode: 'all' | 'any'
  instruction: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type MailAutomationRuleInput = Omit<
  MailAutomationRule,
  'id' | 'automationName' | 'createdAt' | 'updatedAt'
>

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
  storefrontEnabled: boolean
  updatedAt: string
}

export type Project = {
  id: string
  workspaceId?: string
  clientId?: string | null
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

export type ProjectTask = {
  id: string
  workspaceId: string
  projectId: string
  bucketId: string
  title: string
  notes: string
  createdAt: string
  updatedAt: string
}

export type ProjectInput = {
  name: string
  client: string
  clientId?: string | null
  scope?: string
  due?: string
  status?: string
  boardId?: string | null
}

export type DraftInvoice = {
  id: string
  projectId: string
  clientId: string | null
  invoiceNumber: string
  clientName: string
  clientEmail: string
  projectName: string
  description: string
  amountMinor: number
  currency: 'ZAR'
  dueDate: string | null
  status: 'draft' | 'ready_for_review' | 'sent'
  paymentUrl: string | null
  createdAt: string
  updatedAt: string
  sentAt: string | null
}

export type ProjectComment = {
  id: string
  projectId: string
  authorType: 'workspace' | 'client'
  authorName: string
  body: string
  createdAt: string
}

export type ClientApproval = {
  id: string
  projectId: string
  jobCardId: string
  clientName: string
  clientEmail: string
  projectName: string
  status: 'pending' | 'commented' | 'approved'
  title: string
  body: string
  comment: string | null
  expiresAt: string
  createdAt: string
  respondedAt: string | null
  reviewUrl?: string
  reviewId?: string | null
  artworkVersionId?: string | null
}

export type Client = {
  id: string
  workspaceId: string
  name: string
  email: string
  company: string
  status: 'active' | 'archived'
  notes: string
  logoUrl: string
  projectCount: number
  createdAt: string
  updatedAt: string
}

export type GoogleDriveResourceLink = {
  id: string
  driveFileId: string
  name: string
  mimeType: string
  webViewLink: string | null
  resourceKind: 'folder' | 'file'
  clientId: string | null
  clientName: string | null
  projectId: string | null
  projectName: string | null
  createdAt: string
  updatedAt: string
}

export type WorkspaceDocument = {
  id: string
  workspaceId: string
  name: string
  mimeType: string
  size: number
  sha256: string
  driveFileId: string | null
  driveWebViewLink: string | null
  syncedAt: string | null
  createdAt: string
  updatedAt: string
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
  sha256?: string | null
  createdAt: string
}

export type CodexDeviceAuthorization = {
  userCode: string
  clientId: string
  scope: string
  status: 'pending' | 'approved' | 'denied' | 'consumed' | 'expired'
  expiresAt: string
  workspace: string
}

export type CodexConnection = {
  connected: boolean
  activeConnections: number
  pendingRequests: number
  expiresAt: string | null
}

export type CodexRuntimeAccount = {
  type: string
  email?: string | null
  planType?: string | null
}

export type CodexRuntimeStatus = {
  available: boolean
  authenticated: boolean
  account: CodexRuntimeAccount | null
  requiresOpenaiAuth: boolean
  workspaceRoot: string
  error?: string
}

export type CodexDeviceLogin = {
  type: 'chatgptDeviceCode'
  loginId: string
  verificationUrl: string
  userCode: string
}

export type CodexRuntimeEvent = {
  sequence: number
  method: string
  params: Record<string, unknown>
}

let cachedMcpServices: McpService[] = []
let cachedMcpConnection: McpConnection | null = null

const copy = <T,>(value: T): T => structuredClone(value)

const mutationHeaders = (json = false) => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  'Idempotency-Key': crypto.randomUUID(),
})

export const api = {
  auth: {
    async getConfig() {
      const response = await fetch('/api/auth/config', { credentials: 'same-origin' })
      const payload = (await response.json()) as {
        registrationEnabled?: boolean
        error?: string
      }
      if (!response.ok || typeof payload.registrationEnabled !== 'boolean') {
        throw new Error(payload.error || 'Unable to load registration settings.')
      }
      return { registrationEnabled: payload.registrationEnabled }
    },
    async getInvitation(token: string) {
      const response = await fetch(
        `/api/auth/invitations/${encodeURIComponent(token)}`,
        { credentials: 'same-origin' },
      )
      const payload = (await response.json()) as {
        email?: string
        name?: string
        role?: string
        workspace?: string
        expiresAt?: string
        existingAccount?: boolean
        error?: string
      }
      if (!response.ok || !payload.email || !payload.workspace) {
        throw new Error(payload.error || 'Unable to load this invitation.')
      }
      return payload as {
        email: string
        name: string
        role: string
        workspace: string
        expiresAt: string
        existingAccount: boolean
      }
    },
    async startRegistration(email: string, name?: string, workspace?: string) {
      const response = await fetch('/api/auth/register/start', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, workspace }),
      })
      const payload = (await response.json()) as {
        email?: string
        expiresAt?: string
        error?: string
      }
      if (!response.ok || !payload.email) {
        throw new Error(payload.error || 'Unable to send the confirmation email.')
      }
      return { email: payload.email, expiresAt: payload.expiresAt || '' }
    },
    async confirmRegistration(token: string, password: string) {
      const response = await fetch('/api/auth/register/confirm', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const payload = (await response.json()) as { user?: User; error?: string }
      if (!response.ok || !payload.user) {
        throw new Error(payload.error || 'Unable to finish account setup.')
      }
      void cacheSession(payload.user).catch(() => undefined)
      return payload.user
    },
    async register(
      email: string,
      password: string,
      name?: string,
      workspace?: string,
      invitationToken?: string,
    ) {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, workspace, invitationToken }),
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
    async updateAvatar(file: File) {
      const response = await fetch('/api/account/avatar', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: mutationHeaders(),
        body: file,
      })
      const payload = (await response.json()) as { user?: User; error?: string }
      if (!response.ok || !payload.user) {
        throw new Error(payload.error || 'Unable to update your profile image.')
      }
      void cacheSession(payload.user).catch(() => undefined)
      return payload.user
    },
    async removeAvatar() {
      const response = await fetch('/api/account/avatar', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      const payload = (await response.json()) as { user?: User; error?: string }
      if (!response.ok || !payload.user) {
        throw new Error(payload.error || 'Unable to remove your profile image.')
      }
      void cacheSession(payload.user).catch(() => undefined)
      return payload.user
    },
  },
  codexDevice: {
    async getConnection() {
      const response = await fetch('/api/codex/connection', {
        credentials: 'same-origin',
      })
      const payload = (await response.json()) as
        | CodexConnection
        | { error?: string }
      if (!response.ok || !('connected' in payload)) {
        throw new Error(
          ('error' in payload && payload.error) ||
            'Unable to load the Codex connection.',
        )
      }
      return payload
    },
    async getAuthorization(userCode: string) {
      const response = await fetch(
        `/api/codex/device/authorization?user_code=${encodeURIComponent(userCode)}`,
        { credentials: 'same-origin' },
      )
      const payload = (await response.json()) as
        | CodexDeviceAuthorization
        | { error?: string }
      if (!response.ok || !('userCode' in payload)) {
        throw new Error(
          ('error' in payload && payload.error) ||
            'Unable to load this device request.',
        )
      }
      return payload
    },
    async decide(userCode: string, decision: 'approve' | 'deny') {
      const response = await fetch('/api/codex/device/authorization', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userCode, decision }),
      })
      const payload = (await response.json()) as {
        userCode?: string
        status?: 'approved' | 'denied'
        workspace?: string
        error?: string
      }
      if (!response.ok || !payload.status || !payload.workspace) {
        throw new Error(payload.error || 'Unable to update this device request.')
      }
      return payload as {
        userCode: string
        status: 'approved' | 'denied'
        workspace: string
      }
    },
    async revoke() {
      const response = await fetch('/api/codex/connection/revoke', {
        method: 'POST',
        credentials: 'same-origin',
      })
      const payload = (await response.json()) as
        | CodexConnection
        | { error?: string }
      if (!response.ok || !('connected' in payload)) {
        throw new Error(
          ('error' in payload && payload.error) ||
            'Unable to revoke Codex access.',
        )
      }
      return payload
    },
  },
  codexRuntime: {
    async getStatus() {
      const response = await fetch('/api/codex/runtime/status', {
        credentials: 'same-origin',
      })
      const payload = (await response.json()) as
        | CodexRuntimeStatus
        | { error?: string }
      if (!response.ok || !('available' in payload)) {
        throw new Error(
          ('error' in payload && payload.error) ||
            'Unable to load the Codex runtime.',
        )
      }
      return payload
    },
    async startDeviceLogin() {
      const response = await fetch('/api/codex/runtime/auth/device', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      const payload = (await response.json()) as
        | CodexDeviceLogin
        | { error?: string }
      if (!response.ok || !('userCode' in payload)) {
        throw new Error(
          ('error' in payload && payload.error) ||
            'Unable to start OpenAI device login.',
        )
      }
      return payload
    },
    async logout() {
      const response = await fetch('/api/codex/runtime/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(payload.error || 'Unable to sign out of Codex.')
      }
    },
    async startThread() {
      const response = await fetch('/api/codex/runtime/threads', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      const payload = (await response.json()) as
        | { thread?: { id?: string } }
        | { error?: string }
      if (!response.ok || !('thread' in payload) || !payload.thread?.id) {
        throw new Error(
          ('error' in payload && payload.error) ||
            'Unable to start a Codex thread.',
        )
      }
      return payload.thread.id
    },
    async startTurn(threadId: string, prompt: string) {
      const response = await fetch(
        `/api/codex/runtime/threads/${encodeURIComponent(threadId)}/turns`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: mutationHeaders(true),
          body: JSON.stringify({ prompt }),
        },
      )
      const payload = (await response.json()) as
        | { turn?: { id?: string; status?: string } }
        | { error?: string }
      if (!response.ok || !('turn' in payload) || !payload.turn?.id) {
        throw new Error(
          ('error' in payload && payload.error) ||
            'Unable to start the Codex turn.',
        )
      }
      return payload.turn
    },
    async interrupt(threadId: string, turnId: string) {
      const response = await fetch(
        `/api/codex/runtime/threads/${encodeURIComponent(threadId)}/turns/${encodeURIComponent(turnId)}/interrupt`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: mutationHeaders(),
        },
      )
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(payload.error || 'Unable to stop the Codex turn.')
      }
    },
    streamEvents(
      threadId: string,
      onEvent: (event: CodexRuntimeEvent) => void,
    ) {
      const source = new EventSource(
        `/api/codex/runtime/events?threadId=${encodeURIComponent(threadId)}`,
      )
      source.addEventListener('codex', (message) => {
        onEvent(
          JSON.parse((message as MessageEvent<string>).data) as CodexRuntimeEvent,
        )
      })
      return source
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
    async create(
      input: Pick<Automation, 'name' | 'description' | 'model'> & {
        execution?: Automation['execution']
        tools?: string[]
      },
    ) {
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
    async setStatus(id: string, status: AutomationStatus) {
      const response = await fetch(`/api/automations/${encodeURIComponent(id)}/status`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify({ status }),
      })
      const payload = (await response.json()) as Automation & { error?: string }
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Unable to update automation status.')
      }
      return payload as Automation
    },
    async remove(id: string) {
      const response = await fetch(`/api/automations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(payload.error || 'Unable to delete automation.')
      }
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
    async get(runId: string) {
      const response = await fetch(
        `/api/automations/runs/${encodeURIComponent(runId)}`,
        { credentials: 'same-origin' },
      )
      const payload = (await response.json()) as Run & { error?: string }
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Unable to load automation run.')
      }
      return payload as Run
    },
    async logs(runId: string) {
      const response = await fetch(
        `/api/automations/runs/${encodeURIComponent(runId)}/logs`,
        { credentials: 'same-origin' },
      )
      const payload = (await response.json()) as { runId?: string; logs?: RunEvent[]; error?: string }
      if (!response.ok || !payload.logs) {
        throw new Error(payload.error || 'Unable to load automation logs.')
      }
      return payload.logs
    },
  },
  chat: {
    async complete(message: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []) {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify({ message, history }),
      })
      const payload = (await response.json()) as {
        content?: string
        model?: string
        proposedAction?: ProposedMcpAction | null
        error?: string
      }
      if (!response.ok || typeof payload.content !== 'string') {
        throw new Error(payload.error || 'Unable to reach the workspace assistant.')
      }
      return payload
    },
  },
  mail: {
    async discover(email: string): Promise<MailDiscovery> {
      const response = await fetch('/api/mail/discover', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const payload = (await response.json()) as MailDiscovery & { error?: string }
      if (!response.ok || !payload.provider) {
        throw new Error(payload.error || 'Unable to discover mail settings.')
      }
      return payload
    },
    async getAccount(): Promise<MailAccountStatus> {
      const response = await fetch('/api/mail/account', { credentials: 'same-origin' })
      const payload = (await response.json()) as MailAccountStatus & { error?: string }
      if (!response.ok || typeof payload.connected !== 'boolean') {
        throw new Error(payload.error || 'Unable to load mailbox settings.')
      }
      return payload
    },
    async saveAccount(input: {
      email: string
      displayName: string
      username: string
      password?: string
      provider: string
      imapHost: string
      imapPort: number
      imapSecure: boolean
      smtpHost: string
      smtpPort: number
      smtpSecure: boolean
    }): Promise<MailAccountStatus> {
      const response = await fetch('/api/mail/account', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify(input),
      })
      const payload = (await response.json()) as MailAccountStatus & { error?: string }
      if (!response.ok || typeof payload.connected !== 'boolean') {
        throw new Error(payload.error || 'Unable to connect the mailbox.')
      }
      return payload
    },
    async disconnect(): Promise<void> {
      const response = await fetch('/api/mail/account', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || 'Unable to disconnect the mailbox.')
      }
    },
    async listFolders(): Promise<MailFolder[]> {
      const response = await fetch('/api/mail/folders', { credentials: 'same-origin' })
      const payload = (await response.json()) as { folders?: MailFolder[]; error?: string }
      if (!response.ok || !payload.folders) throw new Error(payload.error || 'Unable to load mail folders.')
      return payload.folders
    },
    async listMessages(folder = 'INBOX', query = ''): Promise<MailMessageSummary[]> {
      const params = new URLSearchParams({ folder, limit: '50' })
      if (query.trim()) params.set('query', query.trim())
      const response = await fetch(`/api/mail/messages?${params}`, { credentials: 'same-origin' })
      const payload = (await response.json()) as { messages?: MailMessageSummary[]; error?: string }
      if (!response.ok || !payload.messages) throw new Error(payload.error || 'Unable to load messages.')
      return payload.messages
    },
    async getMessage(folder: string, uid: number): Promise<MailMessage> {
      const response = await fetch(
        `/api/mail/messages/${encodeURIComponent(uid)}?folder=${encodeURIComponent(folder)}`,
        { credentials: 'same-origin' },
      )
      const payload = (await response.json()) as MailMessage & { error?: string }
      if (!response.ok || !payload.uid) throw new Error(payload.error || 'Unable to open the message.')
      return payload
    },
    async send(input: { to: string[]; cc?: string[]; bcc?: string[]; subject: string; body: string }) {
      const response = await fetch('/api/mail/send', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify(input),
      })
      const payload = (await response.json()) as { messageId?: string; accepted?: string[]; error?: string }
      if (!response.ok || !payload.messageId) throw new Error(payload.error || 'Unable to send the message.')
      return payload
    },
    async sync(): Promise<{ newMessages: number; triggered: number; skipped: boolean }> {
      const response = await fetch('/api/mail/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      const payload = (await response.json()) as { newMessages?: number; triggered?: number; skipped?: boolean; error?: string }
      if (!response.ok || typeof payload.newMessages !== 'number') throw new Error(payload.error || 'Unable to sync messages.')
      return payload as { newMessages: number; triggered: number; skipped: boolean }
    },
    rules: {
      async list(): Promise<MailAutomationRule[]> {
        const response = await fetch('/api/mail/rules', { credentials: 'same-origin' })
        const payload = (await response.json()) as { rules?: MailAutomationRule[]; error?: string }
        if (!response.ok || !payload.rules) throw new Error(payload.error || 'Unable to load message rules.')
        return payload.rules
      },
      async create(input: MailAutomationRuleInput): Promise<MailAutomationRule> {
        const response = await fetch('/api/mail/rules', {
          method: 'POST', credentials: 'same-origin', headers: mutationHeaders(true), body: JSON.stringify(input),
        })
        const payload = (await response.json()) as MailAutomationRule & { error?: string }
        if (!response.ok || !payload.id) throw new Error(payload.error || 'Unable to create the message rule.')
        return payload
      },
      async update(id: string, input: MailAutomationRuleInput): Promise<MailAutomationRule> {
        const response = await fetch(`/api/mail/rules/${encodeURIComponent(id)}`, {
          method: 'PUT', credentials: 'same-origin', headers: mutationHeaders(true), body: JSON.stringify(input),
        })
        const payload = (await response.json()) as MailAutomationRule & { error?: string }
        if (!response.ok || !payload.id) throw new Error(payload.error || 'Unable to update the message rule.')
        return payload
      },
      async remove(id: string): Promise<void> {
        const response = await fetch(`/api/mail/rules/${encodeURIComponent(id)}`, {
          method: 'DELETE', credentials: 'same-origin', headers: mutationHeaders(),
        })
        if (!response.ok) throw new Error('Unable to delete the message rule.')
      },
    },
  },
  projectsWorkflow: {
    async approvals(projectId: string) {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/approvals`, { credentials: 'same-origin' })
      const payload = (await response.json()) as { approvals?: ClientApproval[]; comments?: ProjectComment[]; draftInvoice?: DraftInvoice | null; error?: string }
      if (!response.ok || !payload.approvals || !payload.comments) throw new Error(payload.error || 'Unable to load project review state.')
      return { approvals: payload.approvals, comments: payload.comments, draftInvoice: payload.draftInvoice || null }
    },
    async sendApproval(projectId: string, input: { title?: string; body?: string } = {}) {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/approvals`, {
        method: 'POST', credentials: 'same-origin', headers: mutationHeaders(true), body: JSON.stringify(input),
      })
      const payload = (await response.json()) as { approval?: ClientApproval; delivery?: string; error?: string }
      if (!response.ok || !payload.approval) throw new Error(payload.error || 'Unable to send approval request.')
      return payload as { approval: ClientApproval; delivery: string }
    },
    async listDraftInvoices() {
      const response = await fetch('/api/draft-invoices', { credentials: 'same-origin' })
      const payload = (await response.json()) as { invoices?: DraftInvoice[]; error?: string }
      if (!response.ok || !payload.invoices) throw new Error(payload.error || 'Unable to load draft invoices.')
      return payload.invoices
    },
    async updateDraftInvoice(id: string, input: Partial<Pick<DraftInvoice, 'description' | 'amountMinor' | 'dueDate'>>) {
      const response = await fetch(`/api/draft-invoices/${encodeURIComponent(id)}`, {
        method: 'PATCH', credentials: 'same-origin', headers: mutationHeaders(true), body: JSON.stringify(input),
      })
      const payload = (await response.json()) as DraftInvoice & { error?: string }
      if (!response.ok || !payload.id) throw new Error(payload.error || 'Unable to update draft invoice.')
      return payload as DraftInvoice
    },
    async sendDraftInvoice(id: string) {
      const response = await fetch(`/api/draft-invoices/${encodeURIComponent(id)}/send`, {
        method: 'POST', credentials: 'same-origin', headers: mutationHeaders(true), body: '{}',
      })
      const payload = (await response.json()) as { invoice?: DraftInvoice; delivery?: string; project?: Project; error?: string }
      if (!response.ok || !payload.invoice) throw new Error(payload.error || 'Unable to send draft invoice.')
      return payload as { invoice: DraftInvoice; delivery: string; project?: Project }
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
    tokens: {
      async list() {
        const response = await fetch('/api/integrations/tokens', {
          credentials: 'same-origin',
        })
        const payload = (await response.json()) as {
          tokens?: IntegrationToken[]
          error?: string
        }
        if (!response.ok || !payload.tokens) {
          throw new Error(payload.error || 'Unable to load integration tokens.')
        }
        return payload.tokens
      },
      async save(
        provider: string,
        input: {
          accessToken: string
          refreshToken?: string
          tokenType?: string
          expiresAt?: string
        },
      ) {
        const response = await fetch(
          `/api/integrations/tokens/${encodeURIComponent(provider)}`,
          {
            method: 'PUT',
            credentials: 'same-origin',
            headers: mutationHeaders(true),
            body: JSON.stringify(input),
          },
        )
        const payload = (await response.json()) as IntegrationToken & { error?: string }
        if (!response.ok || !payload.provider) {
          throw new Error(payload.error || 'Unable to save the integration token.')
        }
        return payload
      },
      async get(provider: string) {
        const response = await fetch(
          `/api/integrations/tokens/${encodeURIComponent(provider)}`,
          { credentials: 'same-origin' },
        )
        const payload = (await response.json()) as { token?: IntegrationToken; error?: string }
        if (!response.ok || !payload.token) {
          throw new Error(payload.error || 'Unable to load the integration token.')
        }
        return payload.token
      },
      async remove(provider: string) {
        const response = await fetch(
          `/api/integrations/tokens/${encodeURIComponent(provider)}`,
          {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: mutationHeaders(),
          },
        )
        if (!response.ok && response.status !== 404) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(payload.error || 'Unable to remove the integration token.')
        }
      },
    },
  },
  integrationRequests: {
    async create(input: Pick<IntegrationRequest, 'name' | 'category' | 'details'>) {
      const response = await fetch('/api/integration-requests', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify(input),
      })
      const payload = (await response.json()) as Partial<IntegrationRequest> & { error?: string }
      if (!response.ok || !payload.id || !payload.name || !payload.category) {
        throw new Error(payload.error || 'Unable to save the connection request.')
      }
      return payload as IntegrationRequest
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
      if (!n8nIntegration) throw new Error('n8n integration state is unavailable.')
      return {
        integration: n8nIntegration,
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
      if (!n8nIntegration) throw new Error('n8n integration state is unavailable.')
      return {
        integration: n8nIntegration,
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
      cachedMcpConnection = {
        gatewayUrl: payload.gatewayUrl,
        capabilityEndpoint: '/api/v1/capabilities',
        authSource: 'Managed bearer grant · server-side only',
        sourcePath: 'Server-managed gateway',
        mode: 'DNS gateway',
        accessStatus: payload.status,
        connected: payload.status === 'approved',
        lastSync: 'Never',
        requestedAt: payload.requestedAt,
      }
      return copy(cachedMcpConnection)
    },
    async listServices() {
      const response = await fetch('/api/mcp/services', {
        credentials: 'same-origin',
      })
      const payload = (await response.json()) as {
        services?: McpService[]
        configured?: boolean
        error?: string
      }
      if (!response.ok || !payload.services) {
        throw new Error(payload.error || 'Unable to load MCP service state.')
      }
      cachedMcpServices = payload.services
      return copy(cachedMcpServices)
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
      const previous = cachedMcpConnection
      cachedMcpConnection = {
        gatewayUrl: payload.gatewayUrl || previous?.gatewayUrl || '',
        capabilityEndpoint: '/api/v1/capabilities',
        authSource: 'Managed bearer grant · server-side only',
        sourcePath: 'Server-managed gateway',
        mode: 'DNS gateway',
        accessStatus: payload.status,
        connected: payload.status === 'approved',
        requestedAt: payload.requestedAt ?? previous?.requestedAt ?? null,
        lastSync: payload.status === 'approved' ? 'Just now' : 'Never',
      }
      const integrationResp = await fetch('/api/integrations', { credentials: 'same-origin' })
      const integrationPayload = (await integrationResp.json()) as { integrations?: Integration[] }
      const mcpGridIntegration = (integrationPayload.integrations || []).find((i) => i.id === 'mcp-grid')
      if (!mcpGridIntegration) throw new Error('MCP integration state is unavailable.')
      return {
        integration: mcpGridIntegration,
        connection: copy(cachedMcpConnection),
        services: copy(cachedMcpServices),
      }
    },
    async sync() {
      const response = await fetch('/api/mcp/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      const payload = (await response.json()) as {
        connection?: McpConnection
        services?: McpService[]
        error?: string
      }
      if (!response.ok || !payload.connection || !payload.services) {
        throw new Error(payload.error || 'Unable to sync MCP capabilities.')
      }
      cachedMcpConnection = payload.connection
      cachedMcpServices = payload.services
      return { connection: payload.connection, services: payload.services }
    },
    async toggleService(id: string) {
      if (cachedMcpConnection?.accessStatus !== 'approved') {
        throw new Error('Bearer access must be approved before services can be activated.')
      }
      const current = cachedMcpServices.find((service) => service.id === id)
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
      cachedMcpServices = cachedMcpServices.map((service) =>
        service.id === id ? { ...service, active: payload.active! } : service,
      )
      const service = cachedMcpServices.find((item) => item.id === id)!
      return copy(service)
    },
    async invoke(
      serviceId: string,
      toolId: string,
      toolArguments: Record<string, unknown> = {},
    ) {
      const response = await fetch('/api/mcp/invoke', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify({ serviceId, toolId, arguments: toolArguments }),
      })
      const payload = (await response.json()) as McpInvocationResult & { error?: string }
      if (!response.ok || typeof payload.ok !== 'boolean') {
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
      const previous = cachedMcpConnection
      cachedMcpConnection = {
        gatewayUrl: payload.gatewayUrl || previous?.gatewayUrl || '',
        capabilityEndpoint: '/api/v1/capabilities',
        authSource: 'Managed bearer grant · server-side only',
        sourcePath: 'Server-managed gateway',
        mode: 'DNS gateway',
        accessStatus: payload.status,
        connected: false,
        lastSync: 'Never',
        requestedAt: payload.requestedAt ?? null,
      }
      cachedMcpServices = cachedMcpServices.map((service) => ({ ...service, active: false }))
      const integrationResp = await fetch('/api/integrations', { credentials: 'same-origin' })
      const integrationPayload = (await integrationResp.json()) as { integrations?: Integration[] }
      const mcpGridIntegration = (integrationPayload.integrations || []).find((i) => i.id === 'mcp-grid')
      if (!mcpGridIntegration) throw new Error('MCP integration state is unavailable.')
      return {
        integration: mcpGridIntegration,
        connection: copy(cachedMcpConnection),
        services: copy(cachedMcpServices),
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
    async configurePaystack(secretKey: string) {
      const response = await fetch('/api/money/paystack/connection', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify({ secretKey }),
      })
      const payload = (await response.json()) as PaystackConnection & {
        error?: string
      }
      if (!response.ok || payload.provider !== 'paystack') {
        throw new Error(payload.error || 'Unable to connect Paystack.')
      }
      return payload
    },
    async disconnectPaystack() {
      const response = await fetch('/api/money/paystack/disconnect', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      const payload = (await response.json()) as PaystackConnection & {
        error?: string
      }
      if (!response.ok || payload.provider !== 'paystack' || payload.configured) {
        throw new Error(payload.error || 'Unable to disconnect Paystack.')
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
        headers: mutationHeaders(true),
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
    async update(id: string, input: { name: string; role: 'owner' | 'collaborator' | 'viewer' }) {
      const response = await fetch(`/api/workspace/team/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify(input),
      })
      const payload = await response.json()
      if (!response.ok || !payload.member) {
        throw new Error(payload.error || 'Unable to update this team member.')
      }
      return payload.member as {
        id: string
        name: string
        email: string
        role: string
        status: string
        joinedAt: string
      }
    },
    async remove(id: string) {
      const response = await fetch(`/api/workspace/team/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error || 'Unable to remove this team member.')
      }
    },
    async invite(input: { email: string; name?: string; role: 'owner' | 'collaborator' | 'viewer' }) {
      const response = await fetch('/api/workspace/team/invite', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify({
          email: input.email.trim(),
          name: input.name?.trim() || input.email.split('@')[0],
          role: input.role,
        }),
      })
      const payload = (await response.json()) as {
        id?: string
        name?: string
        email?: string
        role?: string
        status?: string
        joinedAt?: string
        expiresAt?: string
        acceptUrl?: string
        delivery?: 'sent' | 'share' | 'failed'
        error?: string
      }
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Unable to send invitation.')
      }
      return payload as {
        id: string
        name: string
        email: string
        role: string
        status: string
        joinedAt: string
        expiresAt: string
        acceptUrl: string
        delivery: 'sent' | 'share' | 'failed'
      }
    },
  },
  googleDrive: {
    async getAuthUrl(returnTo: 'integrations' | 'files' = 'integrations') {
      const response = await fetch(
        `/api/google-drive/oauth/url?returnTo=${encodeURIComponent(returnTo)}`,
        { credentials: 'same-origin' },
      )
      const payload = await response.json()
      if (!response.ok || !payload.url) throw new Error(payload.error || 'Unable to get auth URL')
      return payload.url
    },
    async list(folderId?: string) {
      const query = folderId
        ? `?folderId=${encodeURIComponent(folderId)}`
        : ''
      const response = await fetch(`/api/google-drive/files${query}`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const payload = (await response.json()) as {
        files?: Array<{
          id: string
          name: string
          mimeType: string
          webViewLink: string | null
          modifiedTime: string | null
          size: number | null
          canEdit: boolean
          canDownload: boolean
          canListChildren: boolean
          canDelete: boolean
        }>
        error?: string
      }
      if (!response.ok || !payload.files) {
        throw new Error(payload.error || 'Unable to load Google Drive files.')
      }
      return payload.files.map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink,
        modifiedTime: file.modifiedTime,
        size: file.size,
        canEdit: file.canEdit,
        canDownload: file.canDownload,
        canListChildren: file.canListChildren,
        canDelete: file.canDelete,
      }))
    },
    async replaceSelections(
      selections: Array<{
        driveFileId: string
        name: string
        mimeType: string
        webViewLink?: string | null
      }>,
    ) {
      const response = await fetch('/api/google-drive/selections', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify({ selections }),
      })
      const payload = (await response.json()) as { selections?: unknown[]; error?: string }
      if (!response.ok || !payload.selections) {
        throw new Error(payload.error || 'Unable to save the selected Drive files.')
      }
      return payload.selections
    },
    async getPickerConfig() {
      const response = await fetch('/api/google-drive/picker-config', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const payload = (await response.json()) as {
        accessToken?: string
        developerKey?: string
        appId?: string
        error?: string
      }
      if (
        !response.ok ||
        !payload.accessToken ||
        !payload.developerKey ||
        !payload.appId
      ) {
        throw new Error(payload.error || 'Unable to start Google Picker.')
      }
      return {
        accessToken: payload.accessToken,
        developerKey: payload.developerKey,
        appId: payload.appId,
      }
    },
    resourceLinks: {
      async list(filters: { clientId?: string; projectId?: string } = {}) {
        const search = new URLSearchParams()
        if (filters.clientId) search.set('clientId', filters.clientId)
        if (filters.projectId) search.set('projectId', filters.projectId)
        const response = await fetch(
          `/api/google-drive/resource-links${search.size ? `?${search}` : ''}`,
          { credentials: 'same-origin' },
        )
        const payload = (await response.json()) as {
          links?: GoogleDriveResourceLink[]
          error?: string
        }
        if (!response.ok || !payload.links) {
          throw new Error(payload.error || 'Unable to load Drive links.')
        }
        return payload.links
      },
      async add(input: {
        driveFileId: string
        name: string
        mimeType: string
        webViewLink: string | null
        resourceKind: 'folder' | 'file'
        clientId?: string | null
        projectId?: string | null
      }) {
        const response = await fetch('/api/google-drive/resource-links', {
          method: 'POST',
          credentials: 'same-origin',
          headers: mutationHeaders(true),
          body: JSON.stringify(input),
        })
        const payload = (await response.json()) as {
          link?: GoogleDriveResourceLink
          error?: string
        }
        if (!response.ok || !payload.link) {
          throw new Error(payload.error || 'Unable to link this Drive item.')
        }
        return payload.link
      },
      async remove(id: string) {
        const response = await fetch(
          `/api/google-drive/resource-links/${encodeURIComponent(id)}`,
          {
            method: 'DELETE',
            credentials: 'same-origin',
            headers: mutationHeaders(),
          },
        )
        if (!response.ok) throw new Error('Unable to remove this Drive link.')
      },
    },
    async getEditorDocument(fileId: string) {
      const response = await fetch(
        `/api/google-drive/files/${encodeURIComponent(fileId)}/editor`,
        { credentials: 'same-origin' },
      )
      const payload = (await response.json()) as {
        document?: GoogleDriveEditorDocument
        error?: string
      }
      if (!response.ok || !payload.document) {
        throw new Error(payload.error || 'Unable to open this Google Drive document.')
      }
      return payload.document
    },
    contentUrl(fileId: string) {
      return `/api/google-drive/files/${encodeURIComponent(fileId)}/content`
    },
    async saveEditorDocument(
      document: GoogleDriveEditorDocument,
      content: string,
    ) {
      const contentType =
        document.kind === 'markdown'
          ? 'text/markdown; charset=utf-8'
          : 'text/html; charset=utf-8'
      const response = await fetch(
        `/api/google-drive/files/${encodeURIComponent(document.id)}/content`,
        {
          method: 'PUT',
          credentials: 'same-origin',
          headers: {
            ...mutationHeaders(),
            'Content-Type': contentType,
            ...(document.version
              ? { 'X-Drive-Version': document.version }
              : {}),
          },
          body: content,
        },
      )
      const payload = (await response.json()) as {
        file?: GoogleDriveFile & { version: string | null }
        error?: string
      }
      if (!response.ok || !payload.file) {
        throw new Error(payload.error || 'Unable to save this Google Drive document.')
      }
      return payload.file
    },
    async trash(fileId: string) {
      const response = await fetch(
        `/api/google-drive/files/${encodeURIComponent(fileId)}/trash`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: mutationHeaders(),
        },
      )
      const payload = (await response.json()) as { file?: GoogleDriveFile; error?: string }
      if (!response.ok || !payload.file) {
        throw new Error(payload.error || 'Unable to move this Drive file to trash.')
      }
      return payload.file
    },
    async disconnect() {
      const response = await fetch('/api/google-drive/disconnect', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      const payload = (await response.json()) as {
        connected?: boolean
        error?: string
      }
      if (!response.ok || payload.connected !== false) {
        throw new Error(payload.error || 'Unable to disconnect Google Drive.')
      }
      return payload
    },
  },
  documents: {
    async list() {
      const response = await fetch('/api/documents', {
        credentials: 'same-origin',
      })
      const payload = (await response.json()) as {
        documents?: WorkspaceDocument[]
        error?: string
      }
      if (!response.ok || !payload.documents) {
        throw new Error(payload.error || 'Unable to load documents.')
      }
      return payload.documents
    },
    async upload(
      file: File,
      destination: 'local' | 'drive' | 'both',
      folderId?: string,
    ) {
      const response = await fetch('/api/documents', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          ...mutationHeaders(),
          'Content-Type': 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name),
          'X-File-Type': file.type || 'application/octet-stream',
          'X-File-Destination': destination,
          ...(folderId ? { 'X-Drive-Folder-Id': folderId } : {}),
        },
        body: file,
      })
      const payload = (await response.json()) as {
        document?: WorkspaceDocument | null
        driveFile?: GoogleDriveFile | null
        error?: string
      }
      if (!response.ok) {
        throw new Error(payload.error || 'Unable to upload this document.')
      }
      return payload
    },
    async syncToDrive(id: string, folderId?: string) {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(id)}/sync-drive`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: mutationHeaders(true),
          body: JSON.stringify({ folderId: folderId || null }),
        },
      )
      const payload = (await response.json()) as {
        document?: WorkspaceDocument
        driveFile?: GoogleDriveFile
        error?: string
      }
      if (!response.ok || !payload.document) {
        throw new Error(payload.error || 'Unable to sync this document.')
      }
      return payload
    },
    async getEditorDocument(id: string) {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(id)}/editor`,
        { credentials: 'same-origin' },
      )
      const payload = (await response.json()) as {
        document?: GoogleDriveEditorDocument
        error?: string
      }
      if (!response.ok || !payload.document) {
        throw new Error(payload.error || 'Unable to open this document.')
      }
      return payload.document
    },
    async saveEditorDocument(
      document: GoogleDriveEditorDocument,
      content: string,
    ) {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(document.id)}/content`,
        {
          method: 'PUT',
          credentials: 'same-origin',
          headers: {
            ...mutationHeaders(),
            'Content-Type':
              document.kind === 'markdown'
                ? 'text/markdown; charset=utf-8'
                : 'text/html; charset=utf-8',
            ...(document.version
              ? { 'X-Document-Version': document.version }
              : {}),
          },
          body: content,
        },
      )
      const payload = (await response.json()) as {
        file?: GoogleDriveFile & { version: string | null }
        error?: string
      }
      if (!response.ok || !payload.file) {
        throw new Error(payload.error || 'Unable to save this document.')
      }
      return payload.file
    },
    contentUrl(id: string) {
      return `/api/documents/${encodeURIComponent(id)}/content`
    },
    downloadUrl(id: string) {
      return `/api/documents/${encodeURIComponent(id)}/download`
    },
    async remove(id: string) {
      const response = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      if (!response.ok) throw new Error('Unable to delete this document.')
    },
  },
  cloudLinks: {
    async list() {
      const response = await fetch('/api/workspace/cloud-links', { credentials: 'same-origin' })
      const payload = (await response.json()) as {
        links?: Array<{
          id: string
          provider: string
          label: string
          folderUrl: string
          notes: string
          createdAt: string
          updatedAt: string
        }>
        error?: string
      }
      if (!response.ok || !payload.links) {
        throw new Error(payload.error || 'Unable to load cloud storage links.')
      }
      return payload.links
    },
    async create(input: {
      provider: 'drive' | 'dropbox' | 'onedrive' | 'box' | 'other'
      label: string
      folderUrl: string
      notes?: string
    }) {
      const response = await fetch('/api/workspace/cloud-links', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify(input),
      })
      const payload = (await response.json()) as {
        id?: string
        provider?: string
        label?: string
        folderUrl?: string
        notes?: string
        createdAt?: string
        updatedAt?: string
        error?: string
      }
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Unable to save cloud storage link.')
      }
      return payload as {
        id: string
        provider: string
        label: string
        folderUrl: string
        notes: string
        createdAt: string
        updatedAt: string
      }
    },
    async remove(linkId: string) {
      const response = await fetch(`/api/workspace/cloud-links/${encodeURIComponent(linkId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      if (!response.ok && response.status !== 204) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string }
        throw new Error(payload.error || 'Unable to remove cloud storage link.')
      }
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
          automationRuntimeHoursThisMonth: number
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
  notifications: {
    async list() {
      const response = await fetch('/api/notifications', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const payload = (await response.json()) as { notifications?: WorkspaceNotification[]; error?: string }
      if (!response.ok || !payload.notifications) throw new Error(payload.error || 'Unable to load notifications.')
      return payload.notifications
    },
    async markRead(id: string) {
      const response = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      const payload = (await response.json()) as { notification?: WorkspaceNotification; error?: string }
      if (!response.ok || !payload.notification) {
        throw new Error(payload.error || 'Unable to update this notification.')
      }
      return payload.notification
    },
  },
  clients: {
    async list() {
      const response = await fetch('/api/clients', {
        credentials: 'same-origin',
      })
      const payload = (await response.json()) as {
        clients?: Client[]
        error?: string
      }
      if (!response.ok || !payload.clients) {
        throw new Error(payload.error || 'Unable to load clients.')
      }
      return payload.clients
    },
    async history(id: string): Promise<ClientHistory> {
      const response = await fetch(`/api/clients/${encodeURIComponent(id)}/history`, {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      const payload = (await response.json()) as ClientHistory & { error?: string }
      if (!response.ok || !payload.projects || !payload.messages) {
        throw new Error(payload.error || 'Unable to load client history.')
      }
      return payload
    },
    async create(input: {
      name: string
      email?: string
      company?: string
      notes?: string
    }) {
      const response = await fetch('/api/clients', {
        method: 'POST',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify(input),
      })
      const payload = (await response.json()) as Client & { error?: string }
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Unable to create client.')
      }
      return payload as Client
    },
    async update(id: string, fields: Partial<Client>) {
      const response = await fetch(`/api/clients/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: mutationHeaders(true),
        body: JSON.stringify(fields),
      })
      const payload = (await response.json()) as Client & { error?: string }
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Unable to update client.')
      }
      return payload as Client
    },
    async uploadLogo(id: string, file: File): Promise<Client> {
      const response = await fetch(`/api/clients/${encodeURIComponent(id)}/logo`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: {
          'Content-Type': file.type,
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: file,
      })
      const payload = (await response.json()) as Client & { error?: string }
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Unable to upload the client logo.')
      }
      return payload as Client
    },
    async removeLogo(id: string): Promise<Client> {
      const response = await fetch(`/api/clients/${encodeURIComponent(id)}/logo`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      const payload = (await response.json()) as Client & { error?: string }
      if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'Unable to remove the client logo.')
      }
      return payload as Client
    },
    async remove(id: string) {
      const response = await fetch(`/api/clients/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(payload.error || 'Unable to delete client.')
      }
    },
  },
  storefront: {
    settings: {
      async get() {
        const response = await fetch('/api/storefront/settings', { credentials: 'same-origin' })
        const payload = (await response.json()) as StorefrontSettings & { error?: string }
        if (!response.ok || typeof payload.enabled !== 'boolean') {
          throw new Error(payload.error || 'Unable to load storefront settings.')
        }
        return payload
      },
      async set(enabled: boolean) {
        const response = await fetch('/api/storefront/settings', {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: mutationHeaders(true),
          body: JSON.stringify({ enabled }),
        })
        const payload = (await response.json()) as StorefrontSettings & { error?: string }
        if (!response.ok || typeof payload.enabled !== 'boolean') {
          throw new Error(payload.error || 'Unable to update storefront settings.')
        }
        return payload
      },
    },
    domains: {
      async list() {
        const response = await fetch('/api/storefront/domains', { credentials: 'same-origin' })
        const payload = (await response.json()) as { domains?: StorefrontDomain[]; error?: string }
        if (!response.ok || !payload.domains) {
          throw new Error(payload.error || 'Unable to load storefront domains.')
        }
        return payload.domains
      },
      async add(domain: string) {
        const response = await fetch('/api/storefront/domains', {
          method: 'POST',
          credentials: 'same-origin',
          headers: mutationHeaders(true),
          body: JSON.stringify({ domain }),
        })
        const payload = (await response.json()) as { domain?: StorefrontDomain; error?: string }
        if (!response.ok || !payload.domain) {
          throw new Error(payload.error || 'Unable to add the custom domain.')
        }
        return payload.domain
      },
      async verify(id: string) {
        const response = await fetch(`/api/storefront/domains/${encodeURIComponent(id)}/verify`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: mutationHeaders(),
        })
        const payload = (await response.json()) as {
          verified?: boolean
          domain?: StorefrontDomain
          message?: string
          error?: string
        }
        if (!response.ok || !payload.domain) {
          throw new Error(payload.error || 'Unable to verify the custom domain.')
        }
        return payload
      },
      async remove(id: string) {
        const response = await fetch(`/api/storefront/domains/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: mutationHeaders(),
        })
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error || 'Unable to remove the custom domain.')
        }
      },
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
    tasks: {
      async list(projectId: string): Promise<ProjectTask[]> {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/tasks`, {
          credentials: 'same-origin',
        })
        const payload = (await response.json()) as { tasks?: ProjectTask[]; error?: string }
        if (!response.ok || !payload.tasks) {
          throw new Error(payload.error || 'Unable to load project tasks.')
        }
        return payload.tasks
      },
      async create(projectId: string, input: { bucketId: string; title: string; notes: string }): Promise<ProjectTask> {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/tasks`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: mutationHeaders(true),
          body: JSON.stringify(input),
        })
        const payload = (await response.json()) as { task?: ProjectTask; error?: string }
        if (!response.ok || !payload.task) {
          throw new Error(payload.error || 'Unable to create project task.')
        }
        return payload.task
      },
      async update(projectId: string, taskId: string, fields: Partial<Pick<ProjectTask, 'bucketId' | 'title' | 'notes'>>): Promise<ProjectTask> {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: mutationHeaders(true),
          body: JSON.stringify(fields),
        })
        const payload = (await response.json()) as { task?: ProjectTask; error?: string }
        if (!response.ok || !payload.task) {
          throw new Error(payload.error || 'Unable to update project task.')
        }
        return payload.task
      },
      async remove(projectId: string, taskId: string): Promise<void> {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: mutationHeaders(),
        })
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(payload.error || 'Unable to delete project task.')
        }
      },
    },
    async remove(id: string) {
      const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: mutationHeaders(),
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
          headers: mutationHeaders(),
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
      async add(projectId: string, selectedFile: File): Promise<ProjectFile> {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            ...mutationHeaders(),
            'Content-Type': 'application/octet-stream',
            'X-File-Name': encodeURIComponent(selectedFile.name),
            'X-File-Type': selectedFile.type || 'application/octet-stream',
          },
          body: selectedFile,
        })
        const payload = (await response.json()) as { file?: ProjectFile; error?: string }
        if (!response.ok || !payload.file) throw new Error(payload.error || 'Unable to add file.')
        return payload.file
      },
      downloadUrl(fileId: string) {
        return `/api/projects/files/${encodeURIComponent(fileId)}/download`
      },
      async remove(fileId: string): Promise<void> {
        const response = await fetch(`/api/projects/files/${encodeURIComponent(fileId)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
          headers: mutationHeaders(),
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
        headers: mutationHeaders(true),
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
        headers: mutationHeaders(),
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
        headers: mutationHeaders(true),
        body: JSON.stringify({ boardId, id, kind, x, y, data }),
      })
      if (!response.ok) throw new Error('Unable to save canvas element.')
    },
    async deleteElement(elementId: string): Promise<void> {
      const response = await fetch(`/api/ideas/elements/${encodeURIComponent(elementId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: mutationHeaders(),
      })
      if (!response.ok) throw new Error('Unable to delete canvas element.')
    },
    async getScene(boardId: string): Promise<Record<string, unknown> | null> {
      const response = await fetch(
        `/api/ideas/boards/${encodeURIComponent(boardId)}/scene`,
        { credentials: 'same-origin' },
      )
      const payload = (await response.json()) as { scene?: Record<string, unknown> | null; error?: string }
      if (!response.ok) throw new Error(payload.error || 'Unable to load canvas scene.')
      return payload.scene ?? null
    },
    async saveScene(boardId: string, scene: Record<string, unknown>): Promise<void> {
      const response = await fetch(
        `/api/ideas/boards/${encodeURIComponent(boardId)}/scene`,
        {
          method: 'PUT',
          credentials: 'same-origin',
          headers: mutationHeaders(true),
          body: JSON.stringify({ scene }),
        },
      )
      if (!response.ok) throw new Error('Unable to save canvas scene.')
    },
  },
}
