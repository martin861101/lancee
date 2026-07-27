> Historical code sketch. Its in-memory storage, lifecycle hooks, endpoints, and proxy guidance are not the current contract. Use [`PLAN.md`](PLAN.md) as the authoritative source.

To build a robust registration and discovery (reg/disc) system, you should treat your services as dynamic entities that announce their own existence. This ensures your orchestrator is always up-to-date without manual configuration.
### 1. The Registry/Orchestrator Service
Create a lightweight FastAPI service that acts as the single source of truth. It does not need a complex database; a simple in-memory structure or Redis store is sufficient.
```python
# registry_service.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import time

app = FastAPI()
services = {} # Schema: { "service_name": {"endpoint": "...", "last_seen": 0} }

class ServiceRegistration(BaseModel):
    name: str
    endpoint: str

@app.post("/register")
async def register(reg: ServiceRegistration):
    services[reg.name] = {"endpoint": reg.endpoint, "last_seen": time.time()}
    return {"status": "registered"}

@app.post("/heartbeat/{name}")
async def heartbeat(name: str):
    if name not in services:
        raise HTTPException(status_code=404, detail="Service not found")
    services[name]["last_seen"] = time.time()
    return {"status": "ok"}

@app.get("/discovery")
async def get_services():
    # Filter out services that haven't sent a heartbeat in > 60s
    now = time.time()
    return {k: v for k, v in services.items() if now - v["last_seen"] < 60}

```
### 2. The Worker-Side Pattern (Self-Registration)
Each of your MCP workers should be responsible for its own lifecycle. Use the lifespan hook in FastAPI (or a simple background task) to register on startup and send heartbeats periodically.
```python
# worker_template/mcp_server.py
import asyncio
import httpx
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("MyWorkerService")

async def register_with_orchestrator():
    async with httpx.AsyncClient() as client:
        # Register on startup
        await client.post("http://orchestrator:8000/register", 
                          json={"name": "MyWorkerService", "endpoint": "http://worker:8080"})
        
        # Periodic heartbeat loop
        while True:
            await client.post("http://orchestrator:8000/heartbeat/MyWorkerService")
            await asyncio.sleep(30)

# Integrate the heartbeat into your server startup
@mcp.on_startup()
async def startup():
    asyncio.create_task(register_with_orchestrator())

@mcp.tool()
def example_task():
    return "Task done."

if __name__ == "__main__":
    mcp.run()

```
### 3. Key Design Principles
 * **Decoupled Lifecycle:** The registry does not need to know how to start your workers. It only needs to know how to reach them. If a worker dies, it stops sending heartbeats, and the registry automatically drops it from the GET /discovery list.
 * **The Proxy Pattern:** To simplify security, your **Orchestrator** should act as a proxy. When an agent requests to run a tool, it calls the Orchestrator, which validates the **Bearer Token** once, then forwards the request to the specific worker endpoint.
 * **Schema Discovery:** When an agent queries the /discovery endpoint, it receives the worker's URL. The agent then performs one direct call to http://worker-url/list_tools to get the latest tool definitions. This keeps your Registry service incredibly lightweight, as it doesn't need to parse or store the tool schemas themselves.
