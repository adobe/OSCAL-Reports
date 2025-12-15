#!/bin/bash

echo "🚀 Keekar's OSCAL SOA/SSP/CCM Generator - Setup Script"
echo "======================================================="
echo ""

# Check if npm install/build steps should be skipped
SKIP_NPM_INSTALL=${SKIP_NPM_INSTALL:-0}
SKIP_FRONTEND_BUILD=${SKIP_FRONTEND_BUILD:-0}

# Install dependencies and build frontend (unless skipped)
if [ "$SKIP_NPM_INSTALL" != "1" ]; then
    # Check if Node.js is installed
    if ! command -v node &> /dev/null
    then
        echo "❌ Node.js is not installed. Please install Node.js 20+ from https://nodejs.org/"
        exit 1
    fi

    echo "✅ Node.js version: $(node --version)"
    echo ""

    # Install root dependencies
    echo "📦 Installing root dependencies..."
    npm install

    # Install backend dependencies
    echo "📦 Installing backend dependencies..."
    cd backend
    npm install
    cd ..

    # Install frontend dependencies
    echo "📦 Installing frontend dependencies..."
    cd frontend
    npm install
    cd ..
else
    echo "⏭️  Skipping npm install steps (SKIP_NPM_INSTALL=1)"
fi

# Build frontend (unless skipped)
if [ "$SKIP_FRONTEND_BUILD" != "1" ]; then
    # Build frontend
    echo "🔨 Building frontend..."
    cd frontend
    npm run build
    cd ..

    # Copy built files to backend
    echo "📋 Copying built files to backend..."
    cp -r frontend/dist backend/public
else
    echo "⏭️  Skipping frontend build steps (SKIP_FRONTEND_BUILD=1)"
fi

# Copy configuration files from config/ directory to their needed locations
echo "📋 Copying configuration files from config/ directory..."
if [ -d "config" ]; then
    # Copy app configs (for backward compatibility, code now uses config/app/ directly)
    if [ -f "config/app/config.json" ]; then
        mkdir -p backend
        cp config/app/config.json backend/config.json 2>/dev/null || true
        echo "  ✅ Copied config/app/config.json to backend/config.json"
    fi
    if [ -f "config/app/users.json" ]; then
        mkdir -p backend/auth
        cp config/app/users.json backend/auth/users.json 2>/dev/null || true
        echo "  ✅ Copied config/app/users.json to backend/auth/users.json"
    fi
    
    # Copy build configs to root for build/setup processes
    if [ -f "config/build/docker-compose.yml" ]; then
        cp config/build/docker-compose.yml docker-compose.yml 2>/dev/null || true
        echo "  ✅ Copied config/build/docker-compose.yml to docker-compose.yml"
    fi
    if [ -f "config/build/truenas-app.yaml" ]; then
        cp config/build/truenas-app.yaml truenas-app.yaml 2>/dev/null || true
        echo "  ✅ Copied config/build/truenas-app.yaml to truenas-app.yaml"
    fi
    if [ -f "config/build/Dockerfile" ]; then
        cp config/build/Dockerfile Dockerfile 2>/dev/null || true
        echo "  ✅ Copied config/build/Dockerfile to Dockerfile"
    fi
else
    echo "  ⚠️  config/ directory not found, skipping config file copy"
fi

# Generate credentials file with timestamp-based password
echo "🔐 Generating credentials file..."
CREDENTIALS_FILE="credentials.txt"

# Generate password in format: username#$DDMMYYHH
# DD = day (2 digits), MM = month (2 digits), YY = last 2 digits of year, HH = hour (2 digits)
BUILD_DATE=$(date +%d)      # DD
BUILD_MONTH=$(date +%m)      # MM
BUILD_YEAR=$(date +%y)       # YY (last 2 digits)
BUILD_HOUR=$(date +%H)       # HH (24-hour format)
ADMIN_PASSWORD="admin#${BUILD_DATE}${BUILD_MONTH}${BUILD_YEAR}${BUILD_HOUR}"
USER_PASSWORD="user#${BUILD_DATE}${BUILD_MONTH}${BUILD_YEAR}${BUILD_HOUR}"
ASSESSOR_PASSWORD="assessor#${BUILD_DATE}${BUILD_MONTH}${BUILD_YEAR}${BUILD_HOUR}"

cat > "$CREDENTIALS_FILE" << EOF
================================================================================
OSCAL Report Generator - Default Credentials
================================================================================

IMPORTANT: These are the default credentials generated during setup.
Please change them immediately after first login for security purposes.

Password Format: username#DDMMYYHH
(DD=Day, MM=Month, YY=Year, HH=Hour of build time)

Platform Admin Credentials:
  Username: admin
  Password: ${ADMIN_PASSWORD}

Standard User Credentials:
  Username: user
  Password: ${USER_PASSWORD}

Assessor Credentials:
  Username: assessor
  Password: ${ASSESSOR_PASSWORD}

Build Timestamp: $(date '+%Y-%m-%d %H:%M:%S')

================================================================================
This file is generated during the build process.
Keep this file secure and do not commit it to version control.
Delete this file after changing the default credentials.
================================================================================
EOF
echo "✅ Credentials file generated: $CREDENTIALS_FILE"
echo "   Admin password: ${ADMIN_PASSWORD}"

# Mistral 7B Setup (Optional but recommended)
echo ""
echo "🤖 Step 5: Setting up Mistral 7B for AI-powered suggestions..."
echo "   (This step is optional - you can skip by setting SKIP_MISTRAL_SETUP=1)"

SKIP_MISTRAL_SETUP=${SKIP_MISTRAL_SETUP:-0}

if [ "$SKIP_MISTRAL_SETUP" != "1" ]; then
    # Check if Ollama is installed
    if command -v ollama &> /dev/null; then
        echo "  ✅ Ollama is already installed"
        
        # Check if Ollama service is running
        if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
            echo "  ✅ Ollama service is running"
            
            # Check if Mistral 7B model is installed
            if ollama list | grep -q "mistral:7b\|mistral"; then
                echo "  ✅ Mistral 7B model is already installed"
            else
                echo "  📥 Pulling Mistral 7B model (this may take a few minutes)..."
                ollama pull mistral:7b || {
                    echo "  ⚠️  Warning: Failed to pull Mistral 7B model"
                    echo "     You can manually run: ollama pull mistral:7b"
                }
            fi
            
            # Enable Mistral in config.json
            if [ -f "config/app/config.json" ]; then
                echo "  ⚙️  Configuring Mistral in config.json..."
                # Use Node.js or Python to update JSON (more reliable than sed)
                if command -v node &> /dev/null; then
                    node << 'EOF' > /dev/null 2>&1
const fs = require('fs');
const configPath = 'config/app/config.json';
try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.mistralConfig) {
        config.mistralConfig = {};
    }
    config.mistralConfig.enabled = true;
    config.mistralConfig.provider = 'ollama';
    config.mistralConfig.ollamaUrl = 'http://localhost:11434';
    config.mistralConfig.model = 'mistral:7b';
    config.mistralConfig.timeout = 30000;
    config.mistralConfig.maxRetries = 2;
    config.mistralConfig.fallbackToPatternMatching = true;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('✅ Mistral configuration updated');
} catch (error) {
    console.error('⚠️  Could not update Mistral config:', error.message);
}
EOF
                    if [ $? -eq 0 ]; then
                        echo "  ✅ Mistral enabled in config.json"
                    else
                        echo "  ⚠️  Could not automatically update config.json"
                        echo "     Please manually enable Mistral in config/app/config.json"
                    fi
                elif command -v python3 &> /dev/null; then
                    python3 << 'EOF' > /dev/null 2>&1
import json
import sys
try:
    with open('config/app/config.json', 'r') as f:
        config = json.load(f)
    if 'mistralConfig' not in config:
        config['mistralConfig'] = {}
    config['mistralConfig']['enabled'] = True
    config['mistralConfig']['provider'] = 'ollama'
    config['mistralConfig']['ollamaUrl'] = 'http://localhost:11434'
    config['mistralConfig']['model'] = 'mistral:7b'
    config['mistralConfig']['timeout'] = 30000
    config['mistralConfig']['maxRetries'] = 2
    config['mistralConfig']['fallbackToPatternMatching'] = True
    with open('config/app/config.json', 'w') as f:
        json.dump(config, f, indent=2)
    print('✅ Mistral configuration updated')
except Exception as e:
    print(f'⚠️  Could not update Mistral config: {e}', file=sys.stderr)
    sys.exit(1)
EOF
                    if [ $? -eq 0 ]; then
                        echo "  ✅ Mistral enabled in config.json"
                    else
                        echo "  ⚠️  Could not automatically update config.json"
                        echo "     Please manually enable Mistral in config/app/config.json"
                    fi
                else
                    echo "  ⚠️  Node.js or Python3 not found - cannot auto-configure Mistral"
                    echo "     Please manually enable Mistral in config/app/config.json"
                fi
            else
                echo "  ⚠️  config/app/config.json not found - skipping Mistral configuration"
            fi
        else
            echo "  ⚠️  Ollama service is not running"
            echo "     Start it with: ollama serve"
            echo "     Or run in background: nohup ollama serve > /dev/null 2>&1 &"
        fi
    else
        echo "  ℹ️  Ollama is not installed"
        echo "     To install Ollama:"
        echo "       macOS: brew install ollama"
        echo "       Linux: curl -fsSL https://ollama.ai/install.sh | sh"
        echo "       Or use Docker: docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama"
        echo ""
        echo "     After installing, run this script again or manually:"
        echo "       1. Start Ollama: ollama serve"
        echo "       2. Pull model: ollama pull mistral:7b"
        echo "       3. Enable in config/app/config.json"
    fi
else
    echo "  ⏭️  Skipping Mistral setup (SKIP_MISTRAL_SETUP=1)"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the application in development mode:"
echo "  npm run dev"
echo ""
echo "To start the production server:"
echo "  cd backend && node server.js"
echo ""
echo "Then open your browser to http://localhost:3021"
echo ""

