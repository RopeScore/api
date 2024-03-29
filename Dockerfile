FROM node:20-alpine as base

FROM base as runtime_deps
WORKDIR /src
COPY package.json .
COPY package-lock.json .
RUN npm ci --production

FROM runtime_deps as dev_deps
RUN npm ci

FROM dev_deps as builder
COPY . .
RUN npm run codegen
RUN npm run build

FROM base as runner
WORKDIR /app
ARG SENTRY_DSN
COPY --from=runtime_deps /src/node_modules /app/node_modules
COPY --from=builder /src/dist /app/dist
CMD ["node", "dist/index.js"]
