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

# Catalogue preset manifest (imported from src/catalogues/sampleCatalogues.js via ../../../config/...)
COPY config/catalogues/sample-catalogues.json ../config/catalogues/sample-catalogues.json

# Shared constants (imported from src/constants/*.js via ../../../config/constants/*.json)
COPY config/constants/ ../config/constants/

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

# Shared constants + catalogue manifest (backend/utils/constants.js and
# sampleCatalogues.js resolve these via path.resolve(__dirname, '../../config/...'),
# which lands at /config/... once backend/ is flattened into /app)
COPY config/constants/ /config/constants/
COPY config/catalogues/ /config/catalogues/

# Copy built frontend from frontend-builder stage
COPY --from=frontend-builder /app/frontend/dist ./public

# Bundled config with Generic OIDC _cfgenc (Docker bootstrap field key; OAuth secret not plaintext)
COPY config/app/config.json.example /tmp/config.json.example
RUN node scripts/prepare-docker-bundled-config.mjs /tmp/config.json.example /app/config/app/config.json \
  && rm -f /tmp/config.json.example

# Optional default users (volume init copies when missing)
COPY config/app/users.json.example /app/config/app/users.json.example

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
ENV OSCAL_DOCKER_IMAGE=1
ENV OSCAL_PASS_DISABLED=1

# Use entrypoint script to handle volume initialization
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Start the application (passed to entrypoint)
CMD ["node", "server.js"]

