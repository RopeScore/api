FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /src
COPY package.json .
COPY pnpm-*.yaml .

FROM base AS runtime_deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS dev_deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM dev_deps AS builder
COPY . .
RUN pnpm run codegen
RUN pnpm run build

FROM base AS runner
WORKDIR /app
ARG SENTRY_DSN
COPY --from=runtime_deps /src/node_modules /app/node_modules
COPY --from=builder /src/dist /app/dist
CMD ["node", "dist/index.js"]
