# Hermes Agent integration

lancee can use an exposed Hermes Agent API server as its AI provider. Hermes is
called only from the Express backend; its API key is never included in the
browser bundle or returned by an API response.

## Configuration

Add these values to the server `.env` file:

```dotenv
HERMES_API_URL=http://127.0.0.1:8642
HERMESW_API_KEY=replace-with-the-api-server-key
```

`HERMESW_API_KEY` is intentionally the environment name used by this
deployment. If `HERMES_API_URL` is present and `AI_PROVIDER` is empty, lancee
selects `hermes` automatically. It can also be explicit:

```dotenv
AI_PROVIDER=hermes
AI_MODEL=hermes-agent
```

`AI_MODEL` is optional for Hermes and defaults to `hermes-agent`. A URL ending
in the server root, `/v1`, or `/v1/chat/completions` is accepted and normalized
to the OpenAI-compatible chat-completions endpoint.

## Request boundary

- Requests use `Authorization: Bearer <HERMESW_API_KEY>`.
- Prompts use the OpenAI-compatible `messages` request shape.
- Server timeouts, output-token bounds, and temperature use the existing
  `AI_TIMEOUT_MS`, `AI_MAX_TOKENS`, and `AI_TEMPERATURE` settings.
- Provider failures are translated to the existing bounded lancee AI errors.
- Conversation history remains workspace scoped in the lancee database.

The configured provider can be checked through the existing authenticated AI
status endpoint. Run `npm run verify:ai` to verify endpoint normalization,
authorization, request formatting, and response parsing without calling a real
Hermes server.

Official Hermes API server reference:
<https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server/>
