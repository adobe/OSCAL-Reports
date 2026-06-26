#!/bin/sh
# Copyright 2025 Adobe. All rights reserved.
# Copyright (c) 2025 Mukesh Kesharwani
#
# Licensed under the MIT License. See LICENSE file for details.

set -e

echo "=================================="
echo "OSCAL Report Generator - Starting"
echo "=================================="

# Volume mount point for persistent data
DATA_DIR="/data"

# Application directories
APP_DIR="/app"
CONFIG_APP_DIR="$APP_DIR/config/app"

# Default source files (bundled in Docker image; canonical location config/app)
DEFAULT_CONFIG="$APP_DIR/config/app/config.json"
DEFAULT_USERS="$APP_DIR/config/app/users.json.example"

# Target files in persistent volume
VOLUME_CONFIG="$DATA_DIR/config.json"
VOLUME_USERS="$DATA_DIR/users.json"

# Ensure data directory exists
if [ ! -d "$DATA_DIR" ]; then
    echo "⚠️  WARNING: $DATA_DIR does not exist!"
    echo "   Creating directory... (volume may not be properly mounted)"
    mkdir -p "$DATA_DIR"
fi

# Check if data directory is writable
if [ ! -w "$DATA_DIR" ]; then
    echo "❌ ERROR: $DATA_DIR is not writable!"
    echo "   Please check volume mount permissions."
    exit 1
fi

echo "✅ Data directory: $DATA_DIR (writable)"

# Bootstrap _cfgenc master key and session secret (persisted on volume; pass vault not required)
FIELD_SECRET_FILE="$DATA_DIR/.field-secret"
# Stable Docker bootstrap key (decrypts bundled Generic_OIDC _cfgenc — not the OAuth secret itself)
DOCKER_BOOTSTRAP_FIELD_SECRET="$(cd "$APP_DIR" && node -e "import('./utils/dockerBootstrapSecrets.js').then(m=>console.log(m.getDockerBootstrapFieldSecret()))")"

if [ -z "${OSCAL_CONFIG_FIELD_SECRET:-}" ]; then
  if [ -f "$FIELD_SECRET_FILE" ]; then
    OSCAL_CONFIG_FIELD_SECRET=$(cat "$FIELD_SECRET_FILE")
    export OSCAL_CONFIG_FIELD_SECRET
  else
    echo "$DOCKER_BOOTSTRAP_FIELD_SECRET" > "$FIELD_SECRET_FILE"
    chmod 600 "$FIELD_SECRET_FILE"
    OSCAL_CONFIG_FIELD_SECRET="$DOCKER_BOOTSTRAP_FIELD_SECRET"
    export OSCAL_CONFIG_FIELD_SECRET
    echo "🔐 Initialized Docker OSCAL_CONFIG_FIELD_SECRET in $FIELD_SECRET_FILE"
  fi
fi

SESSION_SECRET_FILE="$DATA_DIR/.session-secret"
if [ -z "${SESSION_SECRET:-}" ]; then
  if [ -f "$SESSION_SECRET_FILE" ]; then
    SESSION_SECRET=$(cat "$SESSION_SECRET_FILE")
    export SESSION_SECRET
  else
    node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))" > "$SESSION_SECRET_FILE"
    chmod 600 "$SESSION_SECRET_FILE"
    SESSION_SECRET=$(cat "$SESSION_SECRET_FILE")
    export SESSION_SECRET
    echo "🔐 Generated SESSION_SECRET in $SESSION_SECRET_FILE"
  fi
fi

export OSCAL_PASS_DISABLED=1

# Initialize config.json if it doesn't exist
if [ ! -f "$VOLUME_CONFIG" ]; then
    echo "📝 Initializing config.json from defaults..."
    if [ -f "$DEFAULT_CONFIG" ]; then
        cp "$DEFAULT_CONFIG" "$VOLUME_CONFIG"
        chmod 600 "$VOLUME_CONFIG"
        echo "   ✅ Created $VOLUME_CONFIG"
    else
        echo "   ⚠️  WARNING: Default config.json not found at $DEFAULT_CONFIG"
        echo "   Application will create it on first run."
    fi
else
    echo "✅ Using existing config.json from volume"
    # Display last modified time
    CONFIG_MTIME=$(stat -c '%y' "$VOLUME_CONFIG" 2>/dev/null || stat -f '%Sm' "$VOLUME_CONFIG" 2>/dev/null || echo "unknown")
    echo "   Last modified: $CONFIG_MTIME"
fi

# Initialize users.json if it doesn't exist
if [ ! -f "$VOLUME_USERS" ]; then
    echo "📝 Initializing users.json from defaults..."
    if [ -f "$DEFAULT_USERS" ]; then
        cp "$DEFAULT_USERS" "$VOLUME_USERS"
        chmod 600 "$VOLUME_USERS"
        echo "   ✅ Created $VOLUME_USERS"
    else
        echo "   ℹ️  Default users.json not found at $DEFAULT_USERS"
        echo "   Application will create default users on first run."
    fi
else
    echo "✅ Using existing users.json from volume"
    # Display user count
    USER_COUNT=$(grep -o '"id"' "$VOLUME_USERS" 2>/dev/null | wc -l || echo "0")
    echo "   Found $USER_COUNT user(s) in database"
fi

# Ensure config/app directory exists for the application
if [ ! -d "$CONFIG_APP_DIR" ]; then
    echo "📁 Creating config directory: $CONFIG_APP_DIR"
    mkdir -p "$CONFIG_APP_DIR"
fi

# Create symbolic links from app config directory to volume
# This allows the application to continue using its original paths
echo "🔗 Setting up symbolic links..."

if [ -L "$CONFIG_APP_DIR/config.json" ] || [ -f "$CONFIG_APP_DIR/config.json" ]; then
    rm -f "$CONFIG_APP_DIR/config.json"
fi

if [ -L "$CONFIG_APP_DIR/users.json" ] || [ -f "$CONFIG_APP_DIR/users.json" ]; then
    rm -f "$CONFIG_APP_DIR/users.json"
fi

ln -s "$VOLUME_CONFIG" "$CONFIG_APP_DIR/config.json"
ln -s "$VOLUME_USERS" "$CONFIG_APP_DIR/users.json"

echo "   ✅ $CONFIG_APP_DIR/config.json -> $VOLUME_CONFIG"
echo "   ✅ $CONFIG_APP_DIR/users.json -> $VOLUME_USERS"

# Set environment variables for application to use volume paths
export CONFIG_PATH="$VOLUME_CONFIG"
export USERS_PATH="$VOLUME_USERS"
export DATA_VOLUME_PATH="$DATA_DIR"

# Migrate any plaintext secrets to _cfgenc before app start
if [ -f "$VOLUME_CONFIG" ] && command -v node >/dev/null 2>&1; then
  node "$APP_DIR/scripts/migrate-config-to-cfgenc.mjs" 2>/dev/null || \
    echo "ℹ️  Config secret migration skipped or not needed"
  DOCKER_BUNDLED_CONFIG="$DEFAULT_CONFIG" \
  DOCKER_FIELD_SECRET_FILE="$FIELD_SECRET_FILE" \
  CONFIG_PATH="$VOLUME_CONFIG" \
  node "$APP_DIR/scripts/repair-docker-generic-oidc-cfgenc.mjs" 2>/dev/null || \
    echo "ℹ️  Generic OIDC Docker repair skipped or not needed"
fi

echo ""
echo "=================================="
echo "Configuration Summary:"
echo "=================================="
echo "Data Volume: $DATA_DIR"
echo "Config File: $VOLUME_CONFIG"
echo "Users File:  $VOLUME_USERS"
echo "App Links:   $CONFIG_APP_DIR/"
echo "=================================="
echo ""

# Display volume usage information
if command -v df >/dev/null 2>&1; then
    echo "📊 Volume Usage:"
    df -h "$DATA_DIR" 2>/dev/null || echo "   (Unable to determine disk usage)"
    echo ""
fi

# Verify symbolic links are working
if [ ! -L "$CONFIG_APP_DIR/config.json" ]; then
    echo "❌ ERROR: Failed to create symbolic link for config.json"
    exit 1
fi

if [ ! -L "$CONFIG_APP_DIR/users.json" ]; then
    echo "❌ ERROR: Failed to create symbolic link for users.json"
    exit 1
fi

echo "✅ Entrypoint configuration complete!"
echo "🚀 Starting OSCAL Report Generator..."
echo ""

# Execute the main application command
# Pass all arguments to the command (allows override of CMD)
exec "$@"
