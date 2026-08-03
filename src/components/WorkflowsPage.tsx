import { useMemo, useState, type CSSProperties } from 'react'
import './workflows-page.css'

export type WorkflowTemplate = {
  id: string
  title: string
  category: string
  description: string
  steps: string[]
  accent: string
  tools: string[]
  model: string
}

const templates: WorkflowTemplate[] = [
  {
    id: 'workspace-health',
    title: 'Workspace health check',
    category: 'Reporting',
    description: 'Summarise current projects, clients, invoices, and draft invoices from live workspace data.',
    steps: ['Run requested', 'Workspace data counted', 'Result logged'],
    accent: '#8d78ff',
    tools: ['workspace.summary'],
    model: 'Core · workspace summary',
  },
  {
    id: 'project-list',
    title: 'Project review',
    category: 'Reporting',
    description: 'Load the workspace project list for a repeatable status or deadline review.',
    steps: ['Run requested', 'Projects loaded', 'Result logged'],
    accent: '#43bdf4',
    tools: ['projects.list'],
    model: 'Core · project reporting',
  },
  {
    id: 'client-list',
    title: 'Client directory review',
    category: 'Reporting',
    description: 'Read the current client directory through the workspace-scoped Core runner.',
    steps: ['Run requested', 'Clients loaded', 'Result logged'],
    accent: '#ff8d70',
    tools: ['clients.list'],
    model: 'Core · client reporting',
  },
  {
    id: 'invoice-review',
    title: 'Invoice review',
    category: 'Finance',
    description: 'Load live invoice records for a repeatable finance review without changing payment data.',
    steps: ['Run requested', 'Invoices loaded', 'Result logged'],
    accent: '#61d58a',
    tools: ['invoices.list'],
    model: 'Core · invoice reporting',
  },
  {
    id: 'project-status',
    title: 'Project status update',
    category: 'Projects',
    description: 'Move a named project to a supported status after you provide the project and target state.',
    steps: ['Project selected', 'Permission checked', 'Status updated'],
    accent: '#f2bd50',
    tools: ['projects.list', 'projects.update_status'],
    model: 'Core · approved project mutation',
  },
  {
    id: 'draft-invoice',
    title: 'Draft project invoice',
    category: 'Finance',
    description: 'Create or load the durable draft invoice for a named project through an approved Core action.',
    steps: ['Project selected', 'Permission checked', 'Draft prepared'],
    accent: '#70a7ff',
    tools: ['projects.list', 'projects.create_draft_invoice'],
    model: 'Core · approved invoice draft',
  },
]

export default function WorkflowsPage({
  onUseTemplate,
  busyTemplateId,
}: {
  onUseTemplate: (template: WorkflowTemplate) => Promise<void>
  busyTemplateId: string | null
}) {
  const [category, setCategory] = useState('All')
  const categories = ['All', ...new Set(templates.map((template) => template.category))]
  const visible = useMemo(
    () => templates.filter((template) => category === 'All' || template.category === category),
    [category],
  )

  return (
    <div className="page workflows-page">
      <header className="workflows-header">
        <div>
          <span className="micro-label">Ready-to-use recipes</span>
          <h1>Everyday <em>workflows</em></h1>
          <p>Each recipe creates an active Core automation backed by live workspace data and persisted run logs.</p>
        </div>
        <div className="workflows-header__path" aria-label="Workflow process">
          <span>Trigger</span><i>→</i><span>Review</span><i>→</i><span>Action</span>
        </div>
      </header>

      <nav className="workflow-filters" aria-label="Workflow categories">
        {categories.map((item) => (
          <button
            type="button"
            className={category === item ? 'is-active' : ''}
            key={item}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </nav>

      <section className="workflow-template-grid">
        {visible.map((template) => (
          <article key={template.id} style={{ '--workflow-accent': template.accent } as CSSProperties}>
            <span className="workflow-template__category">{template.category}</span>
            <h2>{template.title}</h2>
            <p>{template.description}</p>
            <ol>
              {template.steps.map((step, index) => (
                <li key={step}><i>{index + 1}</i><span>{step}</span></li>
              ))}
            </ol>
            <button
              type="button"
              disabled={busyTemplateId !== null}
              onClick={() => void onUseTemplate(template)}
            >
              {busyTemplateId === template.id ? 'Creating…' : 'Use this workflow'} <span>↗</span>
            </button>
          </article>
        ))}
      </section>
    </div>
  )
}
