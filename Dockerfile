ARG PLAYWRIGHT_VERSION=1.61.1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm build
RUN pnpm prune --prod

FROM mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble
WORKDIR /app
ARG CODEX_VERSION=0.145.0
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    LANCEE_BROWSER_RUN_AS_USER=pwuser
RUN apt-get update \
    && apt-get install --yes --no-install-recommends bubblewrap ca-certificates redis-tools util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global "@openai/codex@${CODEX_VERSION}"
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/package.json ./
EXPOSE 5177
CMD ["node", "server/index.mjs"]
