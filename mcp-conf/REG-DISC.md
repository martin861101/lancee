> Historical design note. Some endpoints and responsibilities here conflict with the current design. Use [`PLAN.md`](PLAN.md) as the authoritative source.

To build a robust registration and discovery (reg/disc) system for your homelab, you should treat it as a **Dynamic Service Catalog**. Because you are using MCP, you have an advantage: **MCP servers are self-describing.** You don't need a complex database to define what a tool does because the server provides its own JSON schema at runtime.
### 1. The Registry Schema (The "Source of Truth")
You don't need a heavy database. A simple **KV Store** (like Redis) or a **JSON config file** managed via GitOps is sufficient. Your registry should store the "Metadata" required to reach and authenticate with the service.
**Registry Entry Example (registry.json):**
```json
{
  "services": {
    "backup-worker": {
      "name": "System Backup Service",
      "endpoint": "http://backup-worker.internal.local:8080/sse",
      "auth_type": "bearer",
      "status": "healthy",
      "last_heartbeat": "2026-07-15T02:40:00Z"
    }
  }
}

```
### 2. The Discovery Logic
Discovery should happen in two phases to ensure efficiency:
 * **Registration Phase (Push):** When a worker container starts, it sends a POST /register to your Registry service.
   * *Payload:* {"service_name": "...", "endpoint": "...", "health_check_url": "..."}
 * **Discovery Phase (Pull):** When an AI Agent or App needs a tool, it queries the Registry.
   * *Logic:* 1.  Client: GET /discover
     2.  Registry: Returns the list of endpoints.
     3.  Client: Connects to the endpoint and calls list_tools() (native MCP command).
   * *Benefit:* This ensures the agent always gets the *latest* tool definitions directly from the source, rather than stale definitions cached in the registry.
### 3. Health & Heartbeat (The "Bouncer")
Do not rely on a registry to *ping* everything; it creates a bottleneck.
 * **Heartbeat Pattern:** Each worker is responsible for its own uptime. It sends a POST /heartbeat every 30 seconds.
 * **Auto-Expiry:** If the Registry hasn't received a heartbeat in 60 seconds, it marks the service as unhealthy or removes it. This is how you handle crashes or network partitions without manual intervention.
### 4. Implementation Logic Flow
To implement this, build a small **Orchestrator Service** (FastAPI) that handles these three tasks:
 1. **Registration API:** Receives startup data from containers.
 2. **Heartbeat API:** Updates a "Last Seen" timestamp in Redis.
 3. **Proxy/Discovery API:** * Aggregates the current list of healthy services.
   * Acts as a reverse proxy (using httpx or aiohttp) that injects the Authorization: Bearer <token> header before forwarding the request to the target container.
### Why this is perfect for your needs:
 * **Decoupled:** If the Registry goes down, your existing connections remain active.
 * **AI-Native:** Because the Registry returns the endpoint, an AI Agent can use that endpoint to call list_tools, allowing the agent to "learn" the new tool dynamically without you redeploying the agent code.
 * **Infrastructure-Agnostic:** Whether you run these as Docker containers, bare-metal Python scripts, or even a cloud-based server, the registry doesn't care—it only cares about the endpoint and the heartbeat.
