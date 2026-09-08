# CarbonPass AI production image.
#
# Three stages so the runtime layer carries neither the toolchain nor the dev
# dependencies: deps installs from the lockfile, builder compiles, runner ships
# only Next's standalone output plus the seed data the app needs at runtime.

# ---------------------------------------------------------------- deps
FROM node:22-alpine AS deps
WORKDIR /app
# Copied on their own so the install layer is cached until the lockfile moves.
COPY package.json package-lock.json ./
RUN npm ci

# -------------------------------------------------------------- builder
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --------------------------------------------------------------- runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    CARBONPASS_DATA_DIR=/app/.data

# Run as a non-root user. The app writes workspace state, so that directory is
# created and owned up front rather than left to fail at the first request.
RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nextjs -G nodejs \
 && mkdir -p /app/.data \
 && chown -R nextjs:nodejs /app

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# The demo dataset is read at runtime to seed a fresh workspace.
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

USER nextjs
EXPOSE 3000

# Hits a real page rather than a synthetic endpoint: this proves the engine can
# compute a declaration, not merely that a process is listening.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
