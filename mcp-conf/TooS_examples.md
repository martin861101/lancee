> Future-service ideation, not an implementation priority list. Complete the platform phases and security gates in [`PLAN.md`](PLAN.md) before onboarding privileged services.

To move beyond simple server management, you are essentially building a **Distributed Capability Grid**. By wrapping tools like Playwright and various APIs in MCP, you are creating a "Tool-as-a-Service" layer that any agent or app can query dynamically.
### The Architecture: "Tool-as-a-Service"
Instead of installing Playwright inside every script, you create a **Playwright-MCP-Server**. Your orchestrator then tells your agents: *"You have a 'browser' capability available at this endpoint."*
Here is a blueprint for the next 10 services to build, focusing on **Automation & Integration** rather than just server maintenance.
### 10 MCP-Ready Automation Services

| Category | Service Name | Core Capability |
| :--- | :--- | :--- |
| **Web Automation** | Browser-Worker | Run Playwright scripts (scraping, form fills, visual testing). |
| **Data Sync** | Supabase-MCP | Query/mutate your Postgres database via natural language. |
| **Code Ops** | GitHub-MCP | PR management, issue triaging, and automated repo searching. |
| **Media API** | Plex-MCP | Query library, trigger scans, or manage playback state. |
| **Notification** | Ntfy-MCP | Universal push notifications for all agents/scripts. |
| **Cloud/Infra** | AWS-MCP | Invoke Lambdas, query S3 buckets, or manage cloud resources. |
| **Search/RAG** | Knowledge-MCP | Search personal research docs or Notion workspaces. |
| **K8s/Docker** | Lens-MCP | Full cluster visibility; ask "Why is this pod failing?" |
| **AI/LLM** | Model-Gateway | Route requests to different LLM providers (OpenAI, Anthropic, Ollama). |
| **Networking** | Firewall-MCP | Dynamically update whitelist/blacklist rules for services. |

### Why this changes your workflow
When you build these as MCP services, your main application doesn't have to "know" how to use Playwright. It only needs to know how to call the Browser-Worker tool.
 1. **Dynamic ID Resolution:** Because your Registry handles discovery, you don't hardcode IPs. You ask the registry for browser-worker and it returns the valid, authenticated endpoint.
 2. **Bearer-Token Security:** Your central Orchestrator (running Traefik or a FastAPI middleware) intercepts the request, validates the **Bearer Token**, and injects necessary headers before forwarding to the worker.
 3. **Agentic "Tool-Binding":** If you use LangGraph, you can write a factory function that iterates through your /discovery endpoint and registers all discovered tools as available to the agent at runtime.
### Example: "Browser-Worker" Implementation Pattern
This is how you wrap a heavy-duty tool like Playwright so it can be called as an API.
```python
# worker/browser_mcp.py
from mcp.server.fastmcp import FastMCP
from playwright.async_api import async_playwright
mcp = FastMCP("BrowserWorker")
@mcp.tool()
async def take_screenshot(url: str, selector: str = "body") -> str:
    """Takes a screenshot of a specific element on a webpage."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto(url)
        path = f"screenshot_{hash(url)}.png"
        await page.locator(selector).screenshot(path=path)
        await browser.close()
    return f"Screenshot saved to {path}"
if __name__ == "__main__":
    mcp.run(transport='sse')
```
### Strategic Integration Next Steps
 1. **Standardize your "Service Discovery" client:** Write a small library that your main apps (web or agent) use to query the /discovery endpoint so you don't repeat the fetch logic.
 2. **Build a "Tool Tester" Dashboard:** Create a simple React UI that queries your Registry, lists all tools for every service, and lets you "Try it out" by inputting arguments directly in the browser—this acts as your development sandbox.
 3. **Implement list_tools proxying:** Ensure your Registry can fetch the tool schemas from the workers and cache them, so agents don't have to hit every single worker during the startup discovery phase.
