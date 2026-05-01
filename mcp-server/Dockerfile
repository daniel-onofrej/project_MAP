FROM node:20.19-alpine3.21 AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
# Install ALL deps (including devDeps) so esbuild is available for the build step
RUN npm ci

COPY . .
RUN npm run build

# ── Production image ─────────────────────────────────────────────────────────
FROM node:20.19-alpine3.21
# curl is required for the HEALTHCHECK below
RUN apk add --no-cache libc6-compat curl
WORKDIR /app

# Create a non-root user before copying any files
RUN addgroup --system --gid 1001 mcpgroup && \
    adduser  --system --uid 1001 mcpuser

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy built dist from builder stage
COPY --from=builder /app/dist ./dist

# Transfer ownership after build so the non-root user can read all artefacts
RUN chown -R mcpuser:mcpgroup /app

USER mcpuser

EXPOSE 3100
ENV NODE_ENV=production

# K8s liveness / readiness probes hit /health.
# Docker Compose uses this HEALTHCHECK directly.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3100/health || exit 1

CMD ["node", "dist/index.js"]
