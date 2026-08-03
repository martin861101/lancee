---
description: Set up a Flue project automatically or create your first agent manually.
title: Getting Started | Flue
image: https://flueframework.com/docs/og4.jpg
---

# Getting Started

Last updated Jul 21, 2026[View as Markdown](https://flueframework.com/docs/guide/getting-started/index.md)

**Flue** is the open agent framework, from the creators of [Astro](https://astro.build/). Use a React-like hooks API to build agents in TypeScript using your favorite LLMs. Run them locally or deploy them anywhere: Node.js, Cloudflare, GitHub Actions, GitHub CI/CD, etc.

## Prerequisites

* **Node.js** â€” `>=22.19.0` minimum required version.
* **LLM** â€” API key(s) to connect to your favorite model provider. Flue is built on Pi, and supports [all Pi providers](https://pi.dev/docs/latest/providers) out of the box. Flueâ€™s [Cloudflare runtime](https://flueframework.com/docs/guide/targets/cloudflare/) provides a built-in `cloudflare/*` AI gateway, no API keys required.

## Automatic Installation

Copy Prompt

â€œRead https://flueframework.com/start.md then help create my first agent...â€

Copy this prompt and paste it into your coding agent. Your agent will guide you through setting up an agent in a new or existing project, and help answer any questions you might have along the way.

Your coding agent will run [flue init](https://flueframework.com/docs/cli/init/) to automatically initialize a new Flue project in the directory of your choice. You can run this command yourself as well, if you prefer.

## Manual Installation

> _The AI-guided prompt above is strongly recommended for most users. Follow the steps below if you prefer to set things up yourself._

In a new directory, install the runtime and the CLI:

```bash
npm install @flue/runtime @flue/cli
```

Then, create a basic `flue.config.ts` file:

```ts
import { defineConfig } from '@flue/runtime/config';

export default defineConfig({
	target: 'node', // or 'cloudflare'
});
```

And finally, create your first `src/agents/assistant.ts`:

```ts
// The `'use agent'` directive marks the Assistant() function below as a Flue agent.
'use agent';
import { useModel } from '@flue/runtime';

// This is your first agent: `Assistant`.
// It's return value is your agent's instructions, which become the agent's "system" instructions.
// Flue Hooks like `useModel()` allow you to customize and modify your agent abilities.
export function Assistant() {
	useModel('anthropic/claude-haiku-4-5');
	return 'You are a helpful assistant. Keep replies short.';
}
```

Congratulations, you just built your first agent! From here you can shape its behavior and add capabilities â€” or keep going and put it behind a real server.

You can use any [Model/Provider](https://flueframework.com/docs/guide/models/) that Pi supports. In the example above, we use Claude Haiku. Whichever you choose, just be sure to provide the required API keys to the agent runtime. Its recommended to use a `.env` file to manage your API keys:

```plaintext
# .env
ANTHROPIC_API_KEY="your-api-key"
```

## Run your agent locally

You can now spin up new agents from your terminal, running on your local machine:

```bash
npx flue run src/agents/assistant.ts --message "Say hello in five words or fewer."
```

Agents are addressable, so you can message with a specific agent by passing an agent ID (`--id`). Agent conversations are persistent â€” the second message remembers the first. See [flue run](https://flueframework.com/docs/cli/run/) for the full set of flags.

```bash
npx flue run src/agents/assistant.ts --id hello-1 --message "What's a good name for a pet crab?"
npx flue run src/agents/assistant.ts --id hello-1 --message "Give me three more."
```

Congratulations! You just ran your first Flue agent. You can use `flue run` to run agents on your local machine, or in CI environments like [GitHub Actions](https://flueframework.com/docs/ecosystem/deploy/github-actions/) and [GitLab CI/CD](https://flueframework.com/docs/ecosystem/deploy/gitlab-ci/).

## Deploy your agent

To host your agent remotely, youâ€™ll need to deploy it. Flue uses [Hono](http://hono.dev/) and [Vite](https://vite.dev/) to power its server framework and build pipeline, respectively. Follow the following steps to build your agent for deployment.

### 1\. Install dependencies

```bash
npm install @flue/vite hono vite
```

### 2\. Configure the project

Create two small config files at the project root:

```ts
import { flue } from '@flue/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [flue()],
});
```

If you are deploying to Cloudflare, then you should also install `@cloudflare/vite-plugin` and add `cloudflare()` after `flue()` in the Vite plugins array. see the [Cloudflare runtime](https://flueframework.com/docs/guide/cloudflare-target/) guide for more.

### 3\. Build your app router

`src/app.ts` is the special file where your Flue app router always lives. Create your [Hono](https://hono.dev/) application instance, mount your agent, and export it so that it gets picked up by your build.

```ts
import { createAgentRouter } from '@flue/runtime/routing';
import { Hono } from 'hono';
import { Assistant } from './agents/assistant.ts';

// 1. Create your Hono application instance.
const app = new Hono();
// 2. Define your agent routes.
app.route('/agents/assistant', createAgentRouter(Assistant));
// 3. Export your application.
export default app;
```

The `createAgentRouter()` helper will define and mount your agent routes: `POST /:id`, `GET /:id`, `POST /:id/abort`, etc. See [Routing](https://flueframework.com/docs/guide/routing/) for a full walkthrough of how routing works in Flue.

### 4\. Start the dev server

As mentioned, Flue leverages Vite to power its dev and build pipeline. To spin up your dev server, run `vite dev`:

```bash
npx vite dev
```

Vite spins up your `app.ts` (by default at `http://localhost:5173`) application and servers your agents at the routes that you defined. Test your setup by sending your agent a message â€” one `POST` per message, `202` on admission:

```bash
curl -X POST http://localhost:5173/agents/assistant/hello-1 \
  -H 'content-type: application/json' \
  -d '{"kind":"user","body":"Tell me a joke."}'
```

The `hello-1` in the URL is the agent ID, the same `--id` you passed to `flue run` above. Read the conversation back with `curl "http://localhost:5173/agents/assistant/hello-1?view=history"`, or use the [Flue Agent SDK](https://flueframework.com/docs/sdk/overview/) and [React hooks](https://flueframework.com/docs/guide/react/) when youâ€™re ready to build real product experiences.

`vite build` will produce a runnable `dist/server.mjs` build output for the `"node"` runtime target, or a deployable Cloudflare Worker when configured with the `"cloudflare"` runtime target.

Congratulations, youâ€™ve completed our quickstart guide! You have created your first Flue agent, run it locally, and successfully built it for production.

## Next steps

* [Agents](https://flueframework.com/docs/guide/building-agents/) â€” configure the model, add capabilities, and understand how conversations persist over time.
* [Tools](https://flueframework.com/docs/guide/tools/), [Skills](https://flueframework.com/docs/guide/skills/), and [Sandboxes](https://flueframework.com/docs/guide/sandboxes/) â€” give your agent real capabilities and a workspace to work in.
* [Routing](https://flueframework.com/docs/guide/routing/) â€” mount additional agents and application routes in `app.ts`.
* [Deploy to Cloudflare](https://flueframework.com/docs/ecosystem/deploy/cloudflare/) or [Node.js](https://flueframework.com/docs/ecosystem/deploy/node/) â€” host your agent for real traffic.
* [Agent SDK](https://flueframework.com/docs/sdk/overview/) and [React](https://flueframework.com/docs/guide/react/) â€” build product experiences on top of a deployed agent.

## Docs Navigation

Current page: [Getting Started](https://flueframework.com/docs/guide/getting-started/)

### Sections

* [Guide](https://flueframework.com/docs/guide/getting-started/)
* [Reference](https://flueframework.com/docs/reference/agent-api/)
* [CLI](https://flueframework.com/docs/cli/overview/)
* [Agent SDK](https://flueframework.com/docs/sdk/overview/)
* [Ecosystem](https://flueframework.com/docs/ecosystem/)

### Introduction

* [Getting Started](https://flueframework.com/docs/guide/getting-started/)
* [Why Flue?](https://flueframework.com/docs/guide/why-flue/)
* [Migration Guide](https://flueframework.com/docs/guide/migration/)
* [Changelog](https://github.com/withastro/flue/blob/main/CHANGELOG.md)

### Guides

* [Project Layout](https://flueframework.com/docs/guide/project-layout/)
* [Agents](https://flueframework.com/docs/guide/building-agents/)
* [Agent Hooks](https://flueframework.com/docs/guide/agent-hooks/)
* [Models](https://flueframework.com/docs/guide/models/)
* [Tools](https://flueframework.com/docs/guide/tools/)
* [MCP](https://flueframework.com/docs/guide/mcp/)
* [Skills](https://flueframework.com/docs/guide/skills/)
* [Subagents](https://flueframework.com/docs/guide/subagents/)
* [Sandboxes](https://flueframework.com/docs/guide/sandboxes/)
* [Routing](https://flueframework.com/docs/guide/routing/)
* [Database](https://flueframework.com/docs/guide/database/)

### Advanced

* [Deploy](https://flueframework.com/docs/guide/deploy/)
* [Workflows](https://flueframework.com/docs/guide/workflows/)
* [Schedules](https://flueframework.com/docs/guide/schedules/)
* [Channels](https://flueframework.com/docs/guide/channels/)
* [Evals](https://flueframework.com/docs/guide/evals/)
* [Observability](https://flueframework.com/docs/guide/observability/)
* [Durability](https://flueframework.com/docs/guide/durability/)

### Frontend

* [React](https://flueframework.com/docs/guide/react/)

### Targets

* [Cloudflare](https://flueframework.com/docs/guide/cloudflare-target/)
* [Node.js](https://flueframework.com/docs/guide/node-target/)
