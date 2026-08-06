const moduleCatalog = [
  ['dashboard', 'Dashboard', 'A focused view of priorities, deadlines, and activity.'],
  ['projects', 'Projects', 'Projects, milestones, deliverables, and client work.'],
  ['clients', 'Clients', 'Customer records, relationships, and shared history.'],
  ['tasks', 'Tasks', 'Personal and team task management.'],
  ['calendar', 'Calendar', 'Meetings, deadlines, and schedules.'],
  ['files', 'Files', 'Central document storage and version history.'],
  ['notes', 'Notes', 'Personal and shared notes.'],
  ['approvals', 'Approvals', 'Configurable internal and client approvals.'],
  ['workflows', 'Workflows', 'Visual, repeatable business processes.'],
  ['forms', 'Forms', 'Flexible intake and process forms.'],
  ['knowledge-base', 'Knowledge base', 'Internal documentation and SOPs.'],
  ['assets', 'Assets', 'Equipment, vehicles, and resource tracking.'],
  ['quotes', 'Quotes', 'Create and manage quotations.'],
  ['invoices', 'Invoices', 'Invoices, payment links, and payment status.'],
  ['time-tracking', 'Time tracking', 'Billable and non-billable hours.'],
  ['client-portal', 'Client portal', 'Secure client collaboration.'],
  ['whiteboard', 'Whiteboard', 'Visual planning and brainstorming.'],
  ['templates', 'Templates', 'Reusable project and document templates.'],
  ['annotations', 'Annotations', 'Turn feedback on files into tasks and approvals.'],
].map(([id, name, description]) => ({ id, name, description }))

const integrationCatalog = [
  ['gmail', 'Gmail', 'Email'],
  ['google-calendar', 'Google Calendar', 'Calendar'],
  ['calendly', 'Calendly', 'Calendar'],
  ['zoom', 'Zoom', 'Meetings'],
  ['google-meet', 'Google Meet', 'Meetings'],
  ['drive', 'Google Drive', 'Cloud storage'],
  ['dropbox', 'Dropbox', 'Cloud storage'],
  ['box', 'Box', 'Cloud storage'],
  ['xero', 'Xero', 'Accounting'],
  ['quickbooks', 'QuickBooks', 'Accounting'],
  ['sage', 'Sage', 'Accounting'],
  ['hubspot', 'HubSpot', 'CRM'],
  ['salesforce', 'Salesforce', 'CRM'],
  ['slack', 'Slack', 'Communication'],
  ['whatsapp-business', 'WhatsApp Business', 'Communication'],
  ['discord', 'Discord', 'Communication'],
  ['telegram', 'Telegram', 'Communication'],
].map(([id, name, category]) => ({ id, name, category }))

const activityCatalog = [
  ['projects', 'Managing projects'],
  ['clients', 'Working with clients'],
  ['documents', 'Managing documents'],
  ['quotations', 'Sending quotations'],
  ['invoices', 'Tracking invoices'],
  ['inspections', 'Site inspections'],
  ['equipment', 'Equipment management'],
  ['team', 'Team collaboration'],
  ['meetings', 'Scheduling meetings'],
  ['support', 'Customer support'],
  ['content', 'Content creation'],
  ['procurement', 'Procurement'],
  ['maintenance', 'Maintenance'],
  ['crm', 'CRM'],
  ['administration', 'Internal administration'],
].map(([id, name]) => ({ id, name }))

const processCatalog = [
  ['internalApprovals', 'Do you require internal approvals?'],
  ['clientApprovals', 'Do clients approve work?'],
  ['meetings', 'Do you regularly schedule meetings?'],
  ['recurringProjects', 'Do you manage recurring projects?'],
  ['quotations', 'Do you create quotations?'],
  ['documents', 'Do you work from documents?'],
  ['equipment', 'Do you track equipment?'],
  ['reports', 'Do you submit reports?'],
].map(([id, question]) => ({ id, question }))

const automationCatalog = {
  'meeting-follow-up': {
    id: 'meeting-follow-up',
    name: 'Create tasks after meetings',
    description: 'Create a follow-up task when a meeting is completed.',
    trigger: 'Meeting completed',
    actions: ['Create follow-up task', 'Notify assigned users'],
  },
  'approval-notification': {
    id: 'approval-notification',
    name: 'Notify when approval is completed',
    description: 'Keep project owners informed as soon as an approval is completed.',
    trigger: 'Approval completed',
    actions: ['Update status', 'Notify users'],
  },
  'archive-project': {
    id: 'archive-project',
    name: 'Archive completed projects',
    description: 'Keep the workspace calm by archiving finished work.',
    trigger: 'Project completed',
    actions: ['Archive project'],
  },
  'invoice-follow-up': {
    id: 'invoice-follow-up',
    name: 'Follow up overdue invoices',
    description: 'Create a reminder when an invoice passes its due date.',
    trigger: 'Invoice overdue',
    actions: ['Create reminder', 'Send email'],
  },
  'quote-to-project': {
    id: 'quote-to-project',
    name: 'Start work from accepted quotes',
    description: 'Create the project and its first tasks when a quote is accepted.',
    trigger: 'Quote accepted',
    actions: ['Create project', 'Duplicate template'],
  },
  'recurring-project': {
    id: 'recurring-project',
    name: 'Prepare recurring projects',
    description: 'Duplicate the right template before recurring work begins.',
    trigger: 'Recurring schedule reached',
    actions: ['Duplicate template', 'Create recurring tasks'],
  },
  'document-review': {
    id: 'document-review',
    name: 'Route document feedback',
    description: 'Turn document annotations into assigned review tasks.',
    trigger: 'Annotation added',
    actions: ['Create task', 'Notify assigned users'],
  },
  'equipment-maintenance': {
    id: 'equipment-maintenance',
    name: 'Schedule equipment maintenance',
    description: 'Create maintenance work before an asset reaches its service date.',
    trigger: 'Reminder due',
    actions: ['Create recurring task', 'Notify users'],
  },
}

const allowed = {
  activities: new Set(activityCatalog.map((item) => item.id)),
  tools: new Set(integrationCatalog.map((item) => item.id)),
  people: new Set(['clients', 'contractors', 'employees', 'suppliers', 'just-me']),
  sizes: new Set(['solo', '2-5', '6-20', '21-50', '50+']),
  processes: new Set(processCatalog.map((item) => item.id)),
  modules: new Set(moduleCatalog.map((item) => item.id)),
  integrations: new Set(integrationCatalog.map((item) => item.id)),
}

const text = (value, maximum) => String(value || '').trim().slice(0, maximum)
const strings = (value, choices) => Array.isArray(value)
  ? [...new Set(value.map((item) => String(item)).filter((item) => choices.has(item)))]
  : []

export function workspaceBuilderCatalog() {
  return {
    modules: moduleCatalog,
    integrations: integrationCatalog,
    activities: activityCatalog,
    processes: processCatalog,
    businessSizes: [
      { id: 'solo', name: 'Just me' },
      { id: '2-5', name: '2–5' },
      { id: '6-20', name: '6–20' },
      { id: '21-50', name: '21–50' },
      { id: '50+', name: '50+' },
    ],
    people: [
      { id: 'clients', name: 'Clients' },
      { id: 'contractors', name: 'Contractors' },
      { id: 'employees', name: 'Employees' },
      { id: 'suppliers', name: 'Suppliers' },
      { id: 'just-me', name: 'Just me' },
    ],
  }
}

export function normalizeBuilderAnswers(input = {}) {
  const rawProcesses = input?.processes && typeof input.processes === 'object'
    ? input.processes
    : {}
  return {
    business: {
      name: text(input?.business?.name, 120),
      industry: text(input?.business?.industry, 120),
      size: allowed.sizes.has(input?.business?.size) ? input.business.size : 'solo',
      country: text(input?.business?.country, 80),
      timezone: text(input?.business?.timezone, 80),
      logoName: text(input?.business?.logoName, 160),
    },
    activities: strings(input.activities, allowed.activities),
    tools: strings(input.tools, allowed.tools),
    people: strings(input.people, allowed.people),
    inviteTeam: Boolean(input.inviteTeam),
    processes: Object.fromEntries(
      [...allowed.processes].map((key) => [key, Boolean(rawProcesses[key])]),
    ),
    uniqueRequirements: text(input.uniqueRequirements, 2_000),
    sampleData: Boolean(input.sampleData),
  }
}

function addAll(target, values) {
  for (const value of values) target.add(value)
}

export function buildWorkspaceRecommendation(rawAnswers = {}) {
  const answers = normalizeBuilderAnswers(rawAnswers)
  const modules = new Set(['dashboard'])
  const automations = new Set()
  const dashboards = new Set(['Today'])
  const templates = new Set()
  const notifications = new Set(['Assigned work', 'Due dates'])
  const reasons = {}
  const addModules = (values, reason) => {
    addAll(modules, values)
    for (const value of values) reasons[value] ||= reason
  }

  const activityProfiles = {
    projects: ['projects', 'tasks', 'calendar', 'templates'],
    clients: ['clients', 'projects', 'client-portal'],
    documents: ['files', 'annotations', 'knowledge-base'],
    quotations: ['clients', 'quotes', 'templates'],
    invoices: ['clients', 'invoices'],
    inspections: ['projects', 'tasks', 'forms', 'files'],
    equipment: ['assets', 'tasks'],
    team: ['tasks', 'calendar', 'notes'],
    meetings: ['calendar', 'tasks'],
    support: ['clients', 'tasks', 'knowledge-base', 'forms'],
    content: ['projects', 'tasks', 'files', 'whiteboard', 'templates'],
    procurement: ['projects', 'assets', 'approvals', 'forms'],
    maintenance: ['assets', 'tasks', 'calendar'],
    crm: ['clients', 'tasks', 'calendar'],
    administration: ['tasks', 'files', 'forms', 'workflows'],
  }
  for (const activity of answers.activities) {
    addModules(activityProfiles[activity] || [], `Recommended for ${activityCatalog.find((item) => item.id === activity)?.name.toLowerCase()}.`)
  }

  const industry = answers.business.industry.toLowerCase()
  if (/creative|design|marketing|media|video|photo/.test(industry)) {
    addModules(['projects', 'clients', 'files', 'annotations', 'whiteboard'], 'Recommended for creative client work.')
    templates.add('Creative project brief')
  } else if (/construction|engineering|trade|maintenance|property/.test(industry)) {
    addModules(['projects', 'tasks', 'assets', 'forms', 'approvals'], 'Recommended for field and asset-based work.')
    templates.add('Site inspection report')
  } else if (/consult|agency|professional|legal|account/.test(industry)) {
    addModules(['projects', 'clients', 'calendar', 'time-tracking', 'quotes', 'invoices'], 'Recommended for professional services.')
    templates.add('Client engagement')
  }

  if (answers.processes.internalApprovals || answers.processes.clientApprovals) {
    addModules(['approvals', 'workflows'], 'You told us approvals are part of your process.')
    automations.add('approval-notification')
    notifications.add('Approval decisions')
  }
  if (answers.processes.clientApprovals) addModules(['client-portal'], 'Clients approve work with you.')
  if (answers.processes.meetings) {
    addModules(['calendar', 'tasks'], 'You regularly schedule meetings.')
    automations.add('meeting-follow-up')
  }
  if (answers.processes.recurringProjects) {
    addModules(['projects', 'tasks', 'templates', 'workflows'], 'You manage recurring work.')
    automations.add('recurring-project')
    templates.add('Recurring project')
  }
  if (answers.processes.quotations) {
    addModules(['clients', 'quotes', 'projects'], 'You create quotations.')
    automations.add('quote-to-project')
  }
  if (answers.processes.documents) {
    addModules(['files', 'annotations'], 'Documents are part of your regular process.')
    automations.add('document-review')
  }
  if (answers.processes.equipment) {
    addModules(['assets', 'tasks', 'calendar'], 'You track equipment.')
    automations.add('equipment-maintenance')
  }
  if (answers.processes.reports) {
    addModules(['forms', 'files', 'templates'], 'You submit repeatable reports.')
    templates.add('Business report')
  }
  if (modules.has('projects')) automations.add('archive-project')
  if (modules.has('invoices')) automations.add('invoice-follow-up')
  if (modules.has('projects')) dashboards.add('Project delivery')
  if (modules.has('invoices') || modules.has('quotes')) dashboards.add('Cash flow')
  if (answers.people.some((person) => ['employees', 'contractors'].includes(person))) dashboards.add('Team workload')
  if (modules.size === 1) addModules(['tasks', 'files'], 'A small, flexible starting point for any business.')
  if (templates.size === 0 && modules.has('projects')) templates.add('Simple project')

  const rolePermissions = answers.people.includes('just-me') || answers.people.length === 0
    ? [{ role: 'Owner', access: 'Full workspace access' }]
    : [
        { role: 'Owner', access: 'Full workspace access' },
        { role: 'Collaborator', access: 'Create and edit assigned work' },
        { role: 'Viewer', access: 'View approved workspace content' },
      ]

  return {
    modules: [...modules],
    integrations: answers.tools,
    automations: [...automations].map((id) => automationCatalog[id]),
    dashboards: [...dashboards],
    permissions: rolePermissions,
    templates: [...templates],
    notifications: [...notifications],
    reasons,
  }
}

export function normalizeAiSuggestions(input) {
  const suggestions = Array.isArray(input) ? input : input?.suggestions
  if (!Array.isArray(suggestions)) return []
  return suggestions.slice(0, 3).map((item, index) => {
    const trigger = text(item?.trigger, 160)
    const steps = Array.isArray(item?.steps)
      ? item.steps.map((step) => text(step, 160)).filter(Boolean).slice(0, 6)
      : []
    const title = text(item?.title || item?.name, 120)
    if (!title || !trigger || steps.length === 0) return null
    return {
      id: `ai-${index + 1}`,
      title,
      description: text(item?.description, 400),
      trigger,
      steps,
      approved: false,
    }
  }).filter(Boolean)
}

export function normalizeGenerationSelection(input = {}, recommendation = {}) {
  const recommendedAutomationIds = new Set(
    (recommendation.automations || []).map((item) => item.id),
  )
  const modules = strings(input.modules, allowed.modules)
  if (!modules.includes('dashboard')) modules.unshift('dashboard')
  return {
    modules,
    integrations: strings(input.integrations, allowed.integrations),
    automationIds: Array.isArray(input.automationIds)
      ? [...new Set(input.automationIds.map(String).filter((id) => recommendedAutomationIds.has(id)))]
      : [],
    aiSuggestionIds: Array.isArray(input.aiSuggestionIds)
      ? [...new Set(input.aiSuggestionIds.map((id) => text(id, 80)).filter(Boolean))]
      : [],
  }
}

export function automationById(id) {
  return automationCatalog[id] || null
}
