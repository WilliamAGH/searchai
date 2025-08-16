# Multi-stage build for optimized production image
# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install ALL dependencies (including dev) for build
RUN npm ci

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy configuration files first (better layer caching)
COPY package.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY tailwind.config.js ./
COPY postcss.config.cjs ./
COPY index.html ./

# Copy source code and styles
COPY src/ ./src/
COPY convex/ ./convex/
COPY public/ ./public/

# Set build-time environment variables for Vite
# VITE_CONVEX_URL can be provided as a build argument, or falls back to dev deployment
ARG VITE_CONVEX_URL
ARG NODE_ENV=production

# Require explicit VITE_CONVEX_URL; avoid baking dev endpoints into prod images
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV NODE_ENV=$NODE_ENV

# Log and validate we have a URL
RUN echo "Building with VITE_CONVEX_URL=${VITE_CONVEX_URL}" && \
    test -n "${VITE_CONVEX_URL}" || (echo "ERROR: VITE_CONVEX_URL is not set" && exit 1)

# Build the application
RUN npm run build

# Stage 3: Production runtime
FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache wget

# Copy built application only
COPY --from=builder /app/dist ./dist
COPY server.mjs ./server.mjs

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Expose port 3000
EXPOSE 3000

# Health check using wget (Alpine-friendly)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# Serve the built application with API proxy
ENV NODE_ENV=production
ENV CONVEX_SITE_URL=""
CMD ["node", "server.mjs"]
