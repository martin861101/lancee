import { useMemo, useState, type CSSProperties } from 'react'
import './workflows-page.css'

type WorkflowTemplate = {
  id: string
  title: string
  category: string
  description: string
  steps: string[]
  accent: string
}

const templates: WorkflowTemplate[] = [
  {
    id: 'approval',
    title: 'Client approval',
    category: 'Approvals',
    description: 'Send finished work for review, collect a decision, and notify the owner.',
    steps: ['Work marked ready', 'Client reviews', 'Owner notified'],
    accent: '#8d78ff',
  },
  {
    id: 'notifications',
    title: 'Team notifications',
    category: 'Notifications',
    description: 'Keep the right people informed when a deadline, status, or assignment changes.',
    steps: ['Change detected', 'Audience selected', 'Message delivered'],
    accent: '#43bdf4',
  },
  {
    id: 'intake',
    title: 'New client intake',
    category: 'Business process',
    description: 'Turn a completed enquiry into a client record, project, and welcome checklist.',
    steps: ['Form submitted', 'Client created', 'Project prepared'],
    accent: '#ff8d70',
  },
  {
    id: 'invoice',
    title: 'Invoice follow-up',
    category: 'Finance',
    description: 'Remind clients before and after an invoice due date without losing the personal touch.',
    steps: ['Invoice due', 'Reminder drafted', 'Payment tracked'],
    accent: '#61d58a',
  },
  {
    id: 'handoff',
    title: 'Project hand-off',
    category: 'Delivery',
    description: 'Package final files, request approval, and move the project to completed.',
    steps: ['Files approved', 'Delivery shared', 'Project closed'],
    accent: '#f2bd50',
  },
  {
    id: 'trigger',
    title: 'Trigger-based flow',
    category: 'Triggers',
    description: 'Start a repeatable sequence from a form, webhook, schedule, or project event.',
    steps: ['Trigger received', 'Rules checked', 'Actions started'],
    accent: '#70a7ff',
  },
]

export default function WorkflowsPage({
  onUseTemplate,
}: {
  onUseTemplate: (template: WorkflowTemplate) => void
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
          <p>Start with a familiar business process, then connect and customise it in n8n.</p>
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
            <button type="button" onClick={() => onUseTemplate(template)}>
              Use this workflow <span>↗</span>
            </button>
          </article>
        ))}
      </section>
    </div>
  )
}
