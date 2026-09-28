# CarbonPass AI production image.
#
# Three stages so the runtime layer carries neither the toolchain nor the dev
# dependencies: deps installs from the lockfile, builder compiles, runner ships
# only Next's standalone output plus the demo files the app reads at runtime.
#
# Storage: set DATABASE_URL to use Postgres. Without it the app runs on an
# embedded Postgres (PGlite) under /app/.data - mount a volume there or the
# data goes when the container does.

# ---------------------------------------------------------------- deps
FROM node:26-alpine AS deps
WORKDIR /app
# Copied on their own so the install layer is cached until the lockfile moves.
COPY package.json package-lock.json ./
RUN npm ci

# -------------------------------------------------------------- builder
FROM node:26-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Guarantees the directory the runner copies exists even when it holds no
# tracked files. Git does not track empty directories, so a clean clone can
# otherwise omit it and fail the runner's COPY.
RUN mkdir -p public && npm run build

# --------------------------------------------------------------- runner
FROM node:26-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    CARBONPASS_DATA_DIR=/app/.data

# Run as a non-root user. The embedded database writes under /app/.data, so
# that directory is created and owned up front rather than left to fail at the
# first request.
RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nextjs -G nodejs \
 && mkdir -p /app/.data \
 && chown -R nextjs:nodejs /app

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# The demo files are read at runtime when someone opens the demo workspace.
COPY --from=builder --chown=nextjs:nodejs /app/data/demo ./data/demo

USER nextjs
EXPOSE 3000

# /api/health answers only when the database is reachable and migrated and the
# engine computes a declaration - not merely when a process is listening.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
