# syntax=docker/dockerfile:1

# ---- deps: install node_modules, compiling better-sqlite3's native addon ----
FROM node:22-slim AS deps
WORKDIR /app
# python3/make/g++ are the node-gyp fallback path in case prebuild-install
# can't find a prebuilt binary for this platform/arch/Node ABI. All three
# stages share the same node:22-slim base image, so whatever native binary
# gets built here (build/Release/better_sqlite3.node) is ABI-compatible
# with the runner stage below.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
# node:22-slim bundles an older npm that chokes on this project's
# lockfile (npm ci reports optional esbuild platform packages as
# "Missing from lock file" even though they're present) — upgrade npm
# first to match the version the lockfile was generated with.
RUN npm install -g npm@11
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compile the Next.js standalone server ----
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- runner: minimal production image ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js standalone output traces node_modules statically (via @vercel/nft)
# and can miss native addons that are resolved dynamically at runtime, like
# better-sqlite3's build/Release/*.node lookup (via the `bindings` package).
# Copy the fully-built better-sqlite3 package explicitly so the compiled
# binary from the deps stage is guaranteed to be present, regardless of
# what the tracer picked up.
COPY --from=deps /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=deps /app/node_modules/bindings ./node_modules/bindings
COPY --from=deps /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# node:22-slim ships a built-in non-root `node` user (uid/gid 1000). /data
# is a bind mount from the host (./data:/data); on Docker Desktop for
# Mac/Windows the file-sharing layer maps host permissions loosely so any
# container uid can write to it. On native Linux hosts, chown the host
# ./data directory to uid 1000 if you hit permission errors.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3000
VOLUME /data

CMD ["node", "server.js"]
