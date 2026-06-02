# Single-stage: Bun runs .ts natively, so there is no build/transpile step.
FROM oven/bun:1.3.10-slim

WORKDIR /app

# Install dependencies first so this layer caches across source edits.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY server.ts ./

# oven/bun ships a non-root "bun" user (uid/gid 1000); run as it.
USER bun

EXPOSE 8080

CMD ["bun", "run", "server.ts"]
