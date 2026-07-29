---
name: lancee-ai
description: Use the AI provider configured in a lancee workspace through device-code authenticated MCP tools. Use when the user asks to connect lancee AI, check its provider status, or complete a prompt with lancee AI.
---

# lancee AI

Use the bundled `lancee-ai` MCP server for AI operations.

## Authentication

1. Call `connect`.
2. If it returns `authorization_required`, show the exact `userCode` and
   `verificationUri` to the user.
3. Ask the user to approve the matching code in lancee.
4. Call `connect` again after approval.

Never request or expose `AI_API_KEY`. The connector receives only a
workspace-scoped `ai:invoke` token.

## Tools

- Call `ai_status` before a completion when provider availability is unclear.
- Call `complete` with the user's prompt and only add `system_prompt` when it
  materially improves the requested result.
- If a tool reports `not_connected`, run the authentication steps above.

Treat completion output as generated content. Do not claim that the configured
provider verified facts unless the prompt and response establish that.
