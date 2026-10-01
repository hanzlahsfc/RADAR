# syntax=docker/dockerfile:1

# ---- Base: Node 22 LTS + pnpm via corepack ----
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ---- Build (TypeScript -> dist) ----
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY tests/fixtures ./tests/fixtures
RUN pnpm build

# ---- Production dependencies only ----
FROM base AS prod-deps
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

# ---- Shared runtime image ----
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
EXPOSE 3000

# ---- Bot target: pnpm start:bot ----
FROM runtime AS bot
CMD ["node", "dist/src/entrypoints/bot.js"]

# ---- Worker target: pnpm start:worker ----
FROM runtime AS worker
CMD ["node", "dist/src/entrypoints/worker.js"]
