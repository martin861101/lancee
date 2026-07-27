# ADR 0002: Use MCP Streamable HTTP

Status: accepted

Workers expose stateless MCP Streamable HTTP at `/mcp`. Legacy HTTP+SSE and custom `/call` or `/list_tools` REST interfaces are not supported. Clients use official MCP SDK operations.
