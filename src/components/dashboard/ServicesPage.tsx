import { useState } from 'react'
import type { McpConnection, McpInvocationResult, McpService } from '../../lib/api'

type Props = {
  connection: McpConnection | null
  services: McpService[]
  onSync: () => Promise<void>
  onInvoke: (service: McpService, toolId: string, args: Record<string, unknown>) => Promise<McpInvocationResult>
  onToast: (message: string) => void
}

function safeTestTool(service: McpService) {
  return service.tools.find((tool) => ['connections_list', 'search_workflows'].includes(tool.id)) ||
    service.tools.find((tool) => !Array.isArray(tool.inputSchema?.required) || tool.inputSchema.required.length === 0)
}

export default function ServicesPage({ connection, services, onSync, onInvoke, onToast }: Props) {
  const [busy, setBusy] = useState('')
  const [result, setResult] = useState<McpInvocationResult | null>(null)

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key)
    try { await action() } catch (error) { onToast(error instanceof Error ? error.message : 'Service action failed.') } finally { setBusy('') }
  }

  return (
    <div className="page">
      <PageHeader title="Services" eyebrow="Connected tools" description="Inspect the local Lancee tools that Core automations and your workspace can use." />
      <section className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-heading">
          <div><span className="micro-label">Built into Lancee</span><h2>{connection?.connected ? 'Local MCP is active' : 'Local MCP is unavailable'}</h2></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="button button--secondary button--small" onClick={() => void run('sync', onSync)} disabled={busy !== ''}>Refresh tools</button>
          </div>
        </div>
        <p className="panel-copy">The MCP protocol route and tool runtime ship with this application. Browser sessions receive schemas and results, while workspace identity and provider credentials stay server-side.</p>
      </section>
      <section className="automation-grid">
        {services.map((service) => (
          <article className={`automation-card${service.active ? '' : ' is-muted'}`} key={service.id}>
            <div className="automation-card__top"><span className="automation-avatar automation-avatar--violet">{service.category.slice(0, 1)}</span><span className={`status-pill status-pill--${service.status === 'live' ? 'active' : 'paused'}`}>{service.status}</span></div>
            <div className="automation-card__body"><h3>{service.name}</h3><p>{service.description}</p><div className="tool-stack">{service.tools.map((tool) => <span key={tool.id}>{tool.name}</span>)}</div></div>
            <div className="automation-card__footer">
              <span className="status-pill status-pill--active">Built in</span>
              {service.active && safeTestTool(service) && <button className="button button--dark button--small" disabled={busy !== ''} onClick={() => void run(`${service.id}:invoke`, async () => {
                const tool = safeTestTool(service)
                if (!tool) return
                setResult(await onInvoke(service, tool.id, {}))
              })}>Test tool</button>}
            </div>
          </article>
        ))}
        {services.length === 0 && <div className="panel"><h2>Local MCP unavailable</h2><p className="panel-copy">Restart the Lancee application and check the server logs; no external MCP gateway is required.</p></div>}
      </section>
      {result && <section className="panel service-invocation-result" style={{ marginTop: 20 }}><div className="panel-heading"><h2>Latest invocation</h2><button className="text-button" onClick={() => setResult(null)}>Dismiss</button></div><p>{result.message} · {result.duration}ms</p>{result.data !== undefined && <pre>{JSON.stringify(result.data, null, 2)}</pre>}</section>}
    </div>
  )
}

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="page-header"><div><span className="micro-label">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></header>
}
