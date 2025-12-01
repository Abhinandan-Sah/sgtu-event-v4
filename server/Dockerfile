# Multi-stage Dockerfile for SGTU Event Management Server
# Production-ready with security, optimization, and monitoring

# Stage 1: Dependencies
FROM node:20-alpine AS dependencies

# Install security updates
RUN apk update && apk upgrade --no-cache

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only with npm ci for reproducible builds
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force && \
    rm -rf /root/.npm

# Stage 2: Build
FROM node:20-alpine AS build

# Install security updates
RUN apk update && apk upgrade --no-cache

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Remove development and unnecessary files
RUN rm -rf tests/ *.md .env.example .git/ .github/ \
    docker-compose*.yml Dockerfile .dockerignore

# Stage 3: Production
FROM node:20-alpine AS production

# Metadata labels
LABEL maintainer="SGTU Event Management Team" \
      version="1.0.0" \
      description="SGTU Event Management API Server - Production Ready" \
      org.opencontainers.image.source="https://github.com/Abhinandan-Sah/sgtu-event"

# Install security updates and required system packages
RUN apk update && \
    apk upgrade --no-cache && \
    apk add --no-cache \
    dumb-init \
    curl \
    tini && \
    rm -rf /var/cache/apk/*

# Create non-root user for security (principle of least privilege)
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    mkdir -p /home/nodejs && \
    chown -R nodejs:nodejs /home/nodejs

# Set working directory
WORKDIR /app

# Copy production dependencies from dependencies stage
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code from build stage
COPY --from=build --chown=nodejs:nodejs /app/src ./src
COPY --from=build --chown=nodejs:nodejs /app/package*.json ./

# Create necessary directories with proper permissions
RUN mkdir -p uploads logs && \
    chown -R nodejs:nodejs uploads logs && \
    chmod 755 uploads logs

# Security: Remove unnecessary files and set permissions
RUN find /app -type f -name "*.md" -delete && \
    find /app -type d -exec chmod 755 {} \; && \
    find /app -type f -exec chmod 644 {} \;

# Switch to non-root user
USER nodejs

# Expose port (documentation only - actual port from environment)
EXPOSE 5000

# Environment variables (production defaults)
ENV NODE_ENV=production \
    PORT=5000 \
    NODE_OPTIONS="--max-old-space-size=512" \
    TZ=Asia/Kolkata

# Health check with improved reliability
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:5000/health || exit 1

# Use tini as init system for proper signal handling and zombie reaping
ENTRYPOINT ["/sbin/tini", "--"]

# Start application with production optimizations
CMD ["node", "--enable-source-maps", "--max-http-header-size=16384", "src/index.js"]
