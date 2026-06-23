FROM node:20-trixie-slim
ARG APP_VERSION=0.1.0

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates curl openssh-client python3 && \
    rm -rf /var/lib/apt/lists/*

# Official OpenShell install path uses uv tool install.
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"
RUN uv tool install -U openshell

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY deployment-worker/src ./deployment-worker/src
COPY deployment-worker/package.json ./deployment-worker/package.json

ENV NODE_ENV=production
ENV APP_VERSION=${APP_VERSION}
ENV DEPLOYMENT_WORKER_PORT=3200
EXPOSE 3200

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3200/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "deployment-worker/src/index.js"]
