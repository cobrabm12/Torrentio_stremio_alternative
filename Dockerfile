# syntax=docker/dockerfile:1

# ── Build stage ─────────────────────────────────────────────────────────────
# Compiles TypeScript and builds the native better-sqlite3 binary. Build tools
# are only needed here; the runtime image stays slim.
FROM node:22-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies but keep the already-compiled native modules.
RUN npm prune --omit=dev

# ── Runtime stage ───────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    PORT=7000 \
    HOST=0.0.0.0 \
    DATA_DIR=/app/data
WORKDIR /app

# gosu lets the entrypoint fix volume permissions as root then drop to `node`.
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /app/data && chown -R node:node /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node public ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 7000
VOLUME ["/app/data"]

# Liveness check: the manifest endpoint must respond.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||7000)+'/manifest.json').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
