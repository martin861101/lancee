import { createBaseboxMcpClient } from '../server/basebox-mcp.mjs'

const token =
  process.env.BASEBOX_MCP_ACCESS_KEY ||
  process.env.MCP_ACCESS_KEY ||
  process.env.BASEBOX_BEARER_KEY

if (!token) {
  throw new Error('Set BASEBOX_MCP_ACCESS_KEY in .env before running the live Basebox verifier.')
}

const client = createBaseboxMcpClient({
  mcpUrl: process.env.BASEBOX_MCP_URL,
  token,
})
const catalog = await client.listTools()
console.log(`Basebox live MCP verified: ${catalog.tools.length} tool${catalog.tools.length === 1 ? '' : 's'} discovered.`)
for (const tool of catalog.tools.slice(0, 20)) console.log(`- ${tool.name}`)
if (catalog.tools.length > 20) console.log(`- …and ${catalog.tools.length - 20} more`)
