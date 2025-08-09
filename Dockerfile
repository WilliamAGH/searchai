# Multi-stage build for optimized production image
# Stage 1: Dependencies
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies with npm ci for faster, reliable, reproducible builds
RUN npm ci --only=production && \
    # Create a separate node_modules for dev dependencies
    cp -R node_modules prod_node_modules && \
    npm ci

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time environment variables for Vite
# Note: These are placeholders and should be overridden at build time
ARG VITE_CONVEX_URL=""
ARG NODE_ENV=production

# Build the application
RUN npm run build

# Stage 3: Production runtime
FROM node:22-alpine AS runtime
WORKDIR /app

# Install serve for static file serving
RUN npm install -g serve

# Copy production dependencies
COPY --from=deps /app/prod_node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist

# Copy necessary configuration files
COPY package.json ./

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the app directory
RUN chown -R nodejs:nodejs /app

USER nodejs

# Expose port 3000 (or whatever port you prefer for serving)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})"

# Serve the built application
CMD ["serve", "-s", "dist", "-l", "3000"]