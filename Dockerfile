# Multi-stage build for OSCAL SOA/SSP/CCM Generator
# Author: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
# Copyright (c) 2025 Mukesh Kesharwani

FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

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
RUN npm install --production --no-audit --no-fund

# Copy backend source
COPY backend/ ./

# Copy built frontend from frontend-builder stage
COPY --from=frontend-builder /app/frontend/dist ./public

# Create config directory structure
RUN mkdir -p /app/config/app

# Build argument for build timestamp (used for password generation)
ARG BUILD_TIMESTAMP=""

# Generate credentials file with timestamp-based passwords
# Format: username#DDMMYYHH (DD=day, MM=month, YY=year, HH=hour in UTC)
# Use Node.js to parse BUILD_TIMESTAMP for cross-platform compatibility
# IMPORTANT: Uses UTC time to ensure consistency across all timezones
RUN BUILD_DATE_RAW="${BUILD_TIMESTAMP:-$(date -Iseconds)}" && \
    BUILD_DATE=$(node -e "let d=new Date('$BUILD_DATE_RAW'); if(isNaN(d.getTime())){d=new Date();} console.log(String(d.getUTCDate()).padStart(2,'0'))") && \
    BUILD_MONTH=$(node -e "let d=new Date('$BUILD_DATE_RAW'); if(isNaN(d.getTime())){d=new Date();} console.log(String(d.getUTCMonth()+1).padStart(2,'0'))") && \
    BUILD_YEAR=$(node -e "let d=new Date('$BUILD_DATE_RAW'); if(isNaN(d.getTime())){d=new Date();} console.log(String(d.getUTCFullYear()).slice(-2))") && \
    BUILD_HOUR=$(node -e "let d=new Date('$BUILD_DATE_RAW'); if(isNaN(d.getTime())){d=new Date();} console.log(String(d.getUTCHours()).padStart(2,'0'))") && \
    ADMIN_PASSWORD="admin#${BUILD_DATE}${BUILD_MONTH}${BUILD_YEAR}${BUILD_HOUR}" && \
    USER_PASSWORD="user#${BUILD_DATE}${BUILD_MONTH}${BUILD_YEAR}${BUILD_HOUR}" && \
    ASSESSOR_PASSWORD="assessor#${BUILD_DATE}${BUILD_MONTH}${BUILD_YEAR}${BUILD_HOUR}" && \
    echo "================================================================================" > credentials.txt && \
    echo "OSCAL Report Generator - Default Credentials" >> credentials.txt && \
    echo "================================================================================" >> credentials.txt && \
    echo "" >> credentials.txt && \
    echo "IMPORTANT: These are the default credentials generated during build." >> credentials.txt && \
    echo "Please change them immediately after first login for security purposes." >> credentials.txt && \
    echo "" >> credentials.txt && \
    echo "Password Format: username#DDMMYYHH" >> credentials.txt && \
    echo "(DD=Day, MM=Month, YY=Year, HH=Hour of build time)" >> credentials.txt && \
    echo "" >> credentials.txt && \
    echo "Build Timestamp: ${BUILD_DATE_RAW}" >> credentials.txt && \
    echo "" >> credentials.txt && \
    echo "Platform Admin Credentials:" >> credentials.txt && \
    echo "  Username: admin" >> credentials.txt && \
    echo "  Password: ${ADMIN_PASSWORD}" >> credentials.txt && \
    echo "" >> credentials.txt && \
    echo "Standard User Credentials:" >> credentials.txt && \
    echo "  Username: user" >> credentials.txt && \
    echo "  Password: ${USER_PASSWORD}" >> credentials.txt && \
    echo "" >> credentials.txt && \
    echo "Assessor Credentials:" >> credentials.txt && \
    echo "  Username: assessor" >> credentials.txt && \
    echo "  Password: ${ASSESSOR_PASSWORD}" >> credentials.txt && \
    echo "" >> credentials.txt && \
    echo "================================================================================" >> credentials.txt && \
    echo "This file is generated during the build process." >> credentials.txt && \
    echo "Keep this file secure and do not commit it to version control." >> credentials.txt && \
    echo "Delete this file after changing the default credentials." >> credentials.txt && \
    echo "================================================================================" >> credentials.txt

# Build argument for port (defaults to 3020 for V2)
ARG PORT=3020

# Expose port
EXPOSE ${PORT}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:${PORT}/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Set environment variables
ENV NODE_ENV=production
ENV PORT=${PORT}

# Start the application
CMD ["node", "server.js"]

