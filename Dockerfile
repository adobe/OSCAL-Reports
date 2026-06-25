# Multi-stage build for OSCAL SOA/SSP/CCM Generator
# Author: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
# Copyright (c) 2025 Mukesh Kesharwani

FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files (lockfile pins Vite/Rolldown; npm install without it breaks vite.config bundling)
COPY frontend/package.json frontend/package-lock.json ./

# Install frontend dependencies (including dev deps needed for build)
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build frontend
RUN npm run build

# Backend stage
FROM node:20-alpine AS production

WORKDIR /app

# Install dependencies for production
COPY backend/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy backend source
COPY backend/ ./

# Copy built frontend from frontend-builder stage
COPY --from=frontend-builder /app/frontend/dist ./public

# Create config directory structure
RUN mkdir -p /app/config/app

# Copy entrypoint script for volume initialization
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Declare volume for persistent data (config and users)
# Users should mount this to preserve data across container updates
VOLUME ["/data"]

# Build argument for port (defaults to 3020 for Blue, 3019 for Green)
ARG PORT=3020

# Expose port
EXPOSE ${PORT}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT}/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Set environment variables
ENV NODE_ENV=production
ENV PORT=${PORT}

# Use entrypoint script to handle volume initialization
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Start the application (passed to entrypoint)
CMD ["node", "server.js"]

