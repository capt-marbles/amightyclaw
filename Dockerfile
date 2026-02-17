FROM node:22-slim AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/gateway/package.json packages/gateway/
COPY packages/providers/package.json packages/providers/
COPY packages/memory/package.json packages/memory/
COPY packages/agent/package.json packages/agent/
COPY packages/scheduler/package.json packages/scheduler/
COPY packages/soul/package.json packages/soul/
COPY packages/cli/package.json packages/cli/tsup.config.ts packages/cli/
COPY ui/webchat/package.json ui/webchat/

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:22-slim
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=builder /app .

ENV NODE_ENV=production
EXPOSE 3333

ENTRYPOINT ["node", "packages/cli/dist/cli.js"]
CMD ["start"]
