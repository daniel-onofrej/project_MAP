# ── Stage 1: Install dependencies ───────────────────────────────────────────
FROM node:20.19-alpine3.21 AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ── Stage 2: Build the Next.js app ──────────────────────────────────────────
FROM node:20.19-alpine3.21 AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
ARG APP_VERSION=0.1.0

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP_VERSION=${APP_VERSION}
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}

# Dummy DATABASE_URL satisfies the db/index.ts import at build time.
# The real value is injected at runtime via docker-compose / K8s Secret.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build

RUN npm run build

# ── Stage 3: Production runtime ─────────────────────────────────────────────
FROM node:20.19-alpine3.21 AS runner
# curl is required for the HEALTHCHECK below
RUN apk add --no-cache libc6-compat curl
WORKDIR /app
ARG APP_VERSION=0.1.0

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP_VERSION=${APP_VERSION}
ENV NEXT_PUBLIC_APP_VERSION=${APP_VERSION}

# Merge into a single RUN to reduce layers
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy standalone output (requires next.config: output: 'standalone')
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# K8s liveness / readiness probes hit /api/health.
# Docker Compose uses this HEALTHCHECK directly.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
