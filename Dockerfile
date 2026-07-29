FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN pnpm prune --prod

FROM node:22-bookworm-slim
WORKDIR /app
ARG CODEX_VERSION=0.145.0
RUN apt-get update \
    && apt-get install --yes --no-install-recommends bubblewrap ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global "@openai/codex@${CODEX_VERSION}"
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./
EXPOSE 5177
CMD ["node", "server/index.mjs"]
