# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY tsconfig*.json ./
COPY prisma ./prisma
COPY src ./src

RUN npm run db:generate
RUN npm run build

# Prune dev dependencies — but preserve the generated Prisma client
# (npm ci --omit=dev wipes node_modules/.prisma which was created by db:generate)
RUN cp -r node_modules/.prisma .prisma-backup
RUN npm ci --omit=dev --ignore-scripts
RUN cp -r .prisma-backup node_modules/.prisma && rm -rf .prisma-backup

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy only what we need from the builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./

# Prisma needs the schema to run migrations
ENV NODE_ENV=production

EXPOSE 3000

USER appuser

# Run database migrations then start the server
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/server.js"]
