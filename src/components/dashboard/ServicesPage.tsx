import { useState } from 'react'
import type { McpConnection, McpInvocationResult, McpService } from '../../lib/api'

type Props = {
  connection: McpConnection | null
  services: McpService[]
  onRequestAccess: () => Promise<void>
  onSync: () => Promise<void>
  onToggle: (service: McpService) => Promise<void>
  onInvoke: (service: McpService, toolId: string, args: Record<string, unknown>) => Promise<McpInvocationResult>
  onToast: (message: string) => void
}

function safeTestTool(service: McpService) {
  return service.tools.find((tool) => ['connections_list', 'search_workflows'].includes(tool.id)) ||
    service.tools.find((tool) => !Array.isArray(tool.inputSchema?.required) || tool.inputSchema.required.length === 0)
}

export default function ServicesPage({ connection, services, onRequestAccess, onSync, onToggle, onInvoke, onToast }: Props) {
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState<McpInvocationResult | null>(null)

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    try { await action() } catch (error) { onToast(error instanceof Error ? error.message : 'Service action failed.') } finally { setBusy('') }
  }

  return (
    <div className="page">
      <PageHeader title="Services" eyebrow="Connected tools" description="Manage the approved MCP services that Core automations and your workspace can use." />
      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-heading">
          <div><span className="micro-label">Server-side access</span><h2>{connection?.connected ? 'MCP access approved' : 'MCP access is not active'}</h2></div>
          <div style={{ display: 'flex', gap: 8 }}>
            {!connection?.connected && <button className="button button--primary button--small" onClick={() => void run('access', onRequestAccess)}>Request access</button>}
            <button className="button button--secondary button--small" onClick={() => void run('sync', onSync)} disabled={busy !== ''}>Sync services</button>
          </div>
        </div>
        <p className="panel-copy">Credentials remain in the application backend. Browser sessions receive service state and tool results, never bearer credentials.</p>
      </section>
      <section className="automation-grid">
        {services.map((service) => (
          <article className={`automation-card${service.active ? '' : ' is-muted'}`} key={service.id}>
            <div className="automation-card__top"><span className="automation-avatar automation-avatar--violet">{service.category.slice(0, 1)}</span><span className={`status-pill status-pill--${service.status === 'live' ? 'active' : 'paused'}`}>{service.status}</span></div>
            <div className="automation-card__body"><h3>{service.name}</h3><p>{service.description}</p><div className="tool-stack">{service.tools.map((tool) => <span key={tool.id}>{tool.name}</span>)}</div></div>
            <div className="automation-card__footer">
              <button className="button button--secondary button--small" disabled={service.id === 'lancee' || !connection?.connected || service.status !== 'live' || busy !== ''} onClick={() => void run(service.id, async () => { await onToggle(service); onToast(`${service.name} ${service.active ? 'paused' : 'activated'}.`) })}>{service.id === 'lancee' ? 'Built in' : service.active ? 'Pause' : 'Activate'}</button>
              {service.active && safeTestTool(service) && <button className="button button--dark button--small" disabled={busy !== ''} onClick={() => void run(`${service.id}:invoke`, async () => {
                const tool = safeTestTool(service)
                if (!tool) return
                setResult(await onInvoke(service, tool.id, {}))
              })}>Test tool</button>}
            </div>
          </article>
        ))}
        {services.length === 0 && <div className="panel"><h2>No live services</h2><p className="panel-copy">Request MCP access or configure the server-side MCP gateway to discover Playwright, web search, research, and utility services.</p></div>}
      </section>
      {result && <section className="panel service-invocation-result" style={{ marginTop: 20 }}><div className="panel-heading"><h2>Latest invocation</h2><button className="text-button" onClick={() => setResult(null)}>Dismiss</button></div><p>{result.message} · {result.duration}ms</p>{result.data !== undefined && <pre>{JSON.stringify(result.data, null, 2)}</pre>}</section>}
    </div>
  )
}

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="page-header"><div><span className="micro-label">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></header>
}
