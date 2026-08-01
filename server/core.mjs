export const CORE_TOOL_CATALOG = [
  { id: 'workspace.summary', label: 'Read workspace summary', mutating: false },
  { id: 'projects.list', label: 'Read projects', mutating: false },
  { id: 'clients.list', label: 'Read clients', mutating: false },
  { id: 'invoices.list', label: 'Read invoices', mutating: false },
  { id: 'projects.update_status', label: 'Update project status', mutating: true },
  { id: 'projects.create_draft_invoice', label: 'Create draft invoice', mutating: true },
]

const TOOL_IDS = new Set(CORE_TOOL_CATALOG.map((tool) => tool.id))
const MUTATING_TOOL_IDS = new Set(
  CORE_TOOL_CATALOG.filter((tool) => tool.mutating).map((tool) => tool.id),
)

export class CoreAutomationError extends Error {
  constructor(code, message, status = 422) {
    super(message)
    this.name = 'CoreAutomationError'
    this.code = code
    this.status = status
  }
}

function projectStatus(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['ready', 'done', 'completed', 'complete'].includes(normalized)) return 'Ready'
  if (['review', 'in review', 'client review'].includes(normalized)) return 'In review'
  if (['waiting', 'waiting on client'].includes(normalized)) return 'Waiting on client'
  if (['progress', 'in progress', 'working'].includes(normalized)) return 'In progress'
  return null
}

function projectFromInput(projects, input) {
  const value = String(input?.projectId || input?.project || input?.name || '').trim().toLowerCase()
  if (!value) throw new CoreAutomationError('CORE_PROJECT_REQUIRED', 'A project id or project name is required.')
  const project = projects.find((item) => item.id.toLowerCase() === value)
    || projects.find((item) => item.name.toLowerCase() === value)
    || projects.find((item) => item.name.toLowerCase().includes(value))
  if (!project) throw new CoreAutomationError('CORE_PROJECT_NOT_FOUND', `Project “${value}” was not found.`)
  return project
}

function inferPlan(instruction) {
  const text = String(instruction || '').trim()
  const jsonStart = text.indexOf('{')
  if (jsonStart === 0) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed.steps)) return parsed
    } catch {
      throw new CoreAutomationError('CORE_INVALID_PLAN', 'The JSON automation plan is invalid.')
    }
  }

  const statusMatch = text.match(
    /(?:mark|move|set)\s+(?:the\s+)?project\s+[“"']?(.+?)[”"']?\s+(?:to|as)\s+(ready|done|completed|in progress|in review|client review|waiting on client)\b/i,
  )
  if (statusMatch) {
    return {
      steps: [{
        tool: 'projects.update_status',
        input: { project: statusMatch[1].trim(), status: statusMatch[2] },
      }],
    }
  }
  if (/draft\s+invoice|invoice\s+draft/i.test(text)) {
    const projectMatch = text.match(/(?:for|on)\s+(?:the\s+)?project\s+[“"']?(.+?)[”"']?$/i)
    return {
      steps: [{
        tool: 'projects.create_draft_invoice',
        input: { project: projectMatch?.[1]?.trim() || '' },
      }],
    }
  }
  if (/\b(list|show|summari[sz]e|review)\b/i.test(text)) {
    return { steps: [{ tool: 'workspace.summary', input: {} }] }
  }
  return { steps: [{ tool: 'workspace.summary', input: {} }] }
}

export function automationPlan(instruction) {
  const plan = inferPlan(instruction)
  if (!Array.isArray(plan.steps) || plan.steps.length < 1 || plan.steps.length > 12) {
    throw new CoreAutomationError('CORE_INVALID_PLAN', 'A Core automation must contain between 1 and 12 steps.')
  }
  return {
    steps: plan.steps.map((step) => {
      const tool = String(step?.tool || '').trim()
      if (!TOOL_IDS.has(tool)) {
        throw new CoreAutomationError('CORE_UNKNOWN_TOOL', `Core tool “${tool || 'unknown'}” is not available.`)
      }
      return { tool, input: step?.input && typeof step.input === 'object' ? step.input : {} }
    }),
  }
}

function assertToolPermission(automation, tool) {
  const permissions = Array.isArray(automation.tools) ? automation.tools : []
  if (MUTATING_TOOL_IDS.has(tool) && !permissions.includes(tool)) {
    throw new CoreAutomationError(
      'CORE_TOOL_NOT_ALLOWED',
      `The automation does not have permission to use ${tool}. Enable that tool in the automation settings.`,
      403,
    )
  }
}

export async function executeCoreAutomation({ context, automation, run, database, log }) {
  const plan = automationPlan(run.instruction)
  await log({
    eventType: 'plan.created',
    message: `Core planned ${plan.steps.length} bounded step${plan.steps.length === 1 ? '' : 's'}.`,
    output: { steps: plan.steps.map((step) => step.tool) },
  })
  const results = []
  for (const [index, step] of plan.steps.entries()) {
    const startedAt = performance.now()
    assertToolPermission(automation, step.tool)
    await log({
      eventType: 'step.started',
      message: `Starting ${step.tool}.`,
      toolId: step.tool,
      input: step.input,
    })
    let output
    if (step.tool === 'workspace.summary') {
      const [projects, clients, invoices, drafts] = await Promise.all([
        database.listProjects(context.workspace.id),
        database.listClients(context.workspace.id),
        database.listInvoices(context.workspace.id),
        database.listDraftInvoices(context.workspace.id),
      ])
      output = {
        projects: projects.length,
        clients: clients.length,
        invoices: invoices.length,
        draftInvoices: drafts.length,
      }
    } else if (step.tool === 'projects.list') {
      output = await database.listProjects(context.workspace.id)
    } else if (step.tool === 'clients.list') {
      output = await database.listClients(context.workspace.id)
    } else if (step.tool === 'invoices.list') {
      output = await database.listInvoices(context.workspace.id)
    } else if (step.tool === 'projects.update_status') {
      const projects = await database.listProjects(context.workspace.id)
      const project = projectFromInput(projects, step.input)
      const status = projectStatus(step.input.status)
      if (!status) throw new CoreAutomationError('CORE_INVALID_STATUS', 'Use a supported project status.')
      output = await database.updateProjectStatus(context.workspace.id, project.id, status)
    } else if (step.tool === 'projects.create_draft_invoice') {
      const projects = await database.listProjects(context.workspace.id)
      const project = projectFromInput(projects, step.input)
      output = await database.createDraftInvoiceForProject({
        workspaceId: context.workspace.id,
        projectId: project.id,
      })
    }
    const durationMs = performance.now() - startedAt
    results.push({ index, tool: step.tool, output })
    await log({
      eventType: 'step.completed',
      message: `${step.tool} completed successfully.`,
      toolId: step.tool,
      output,
      durationMs,
    })
  }
  return { steps: results.length, results }
}

export function coreToolCatalog() {
  return CORE_TOOL_CATALOG.map((tool) => ({ ...tool }))
}
