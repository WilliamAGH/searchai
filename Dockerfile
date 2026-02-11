# Multi-stage build for optimized production image
# Using AWS ECR Public mirror to avoid Docker Hub rate limits
# Stage 1: Dependencies
FROM public.ecr.aws/docker/library/node:22.17.0-alpine AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install ALL dependencies (including dev) for build
# Use npm ci for reproducible builds from package-lock.json
# --ignore-scripts skips postinstall scripts (ast-grep binary download, playwright install, prek hooks)
# which aren't needed for vite build and may fail on Alpine ARM64
RUN npm ci --ignore-scripts

# Stage 2: Builder
FROM public.ecr.aws/docker/library/node:22.17.0-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy configuration files first (better layer caching)
COPY package.json ./
COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY config/tailwind.config.js ./config/
COPY config/postcss.config.cjs ./config/
COPY config/tsconfig.app.json config/tsconfig.node.json ./config/
COPY index.html ./

# Copy source code and styles
COPY src/ ./src/
COPY convex/ ./convex/
COPY public/ ./public/

# Set build-time environment variables for Vite
# Note: VITE_CONVEX_URL must be provided as a build argument
ARG VITE_CONVEX_URL
ARG NODE_ENV=production

# Make build args available as environment variables for Vite
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
ENV NODE_ENV=$NODE_ENV

# Validate required build args
RUN test -n "$VITE_CONVEX_URL" || (echo "ERROR: VITE_CONVEX_URL is required at build time" && exit 1)

# Build the application
RUN npm run build

# Stage 3: Production runtime
FROM public.ecr.aws/docker/library/node:22.17.0-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache wget

# Copy built application only
COPY --from=builder /app/dist ./dist
COPY scripts/server.mjs ./server.mjs
COPY scripts/lib/ ./lib/

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
ENV CONVEX_SITE_URL=""
CMD ["node", "server.mjs"]
