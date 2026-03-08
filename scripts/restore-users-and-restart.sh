#!/bin/bash
# Restore users.json from OneDrive backup, then restart backend, frontend, and clear cache.
# For local laptop development only. Not for Docker/EC2.
#
# Usage (from repo root):
#   ./scripts/restore-users-and-restart.sh
#
# Override backup directory:
#   BACKUP_DIR=/path/to/backup ./scripts/restore-users-and-restart.sh

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/Users/mkesharw/Library/CloudStorage/OneDrive-Adobe/OSCAL-Config-Backup}"
USERS_BACKUP="${BACKUP_DIR}/users.json"

# Load USERS_PATH from .env in repo root (local dev)
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "$REPO_ROOT/.env"
  set +a
fi
USERS_PATH="${USERS_PATH:-$REPO_ROOT/../OSCAL_Reports_data/users.json}"

echo "Restoring users from backup..."
if [ ! -f "$USERS_BACKUP" ]; then
  echo "Error: Backup not found at $USERS_BACKUP"
  exit 1
fi
mkdir -p "$(dirname "$USERS_PATH")"
cp "$USERS_BACKUP" "$USERS_PATH"
echo "  Restored to $USERS_PATH ($(wc -l < "$USERS_PATH") lines)"

echo "Stopping backend and frontend..."
pkill -f "nodemon server.js" 2>/dev/null || true
pkill -f "node.*backend/server.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
sleep 2
echo "  Stopped."

echo "Clearing frontend cache..."
rm -rf "$REPO_ROOT/frontend/node_modules/.cache" \
       "$REPO_ROOT/frontend/dist" \
       "$REPO_ROOT/frontend/.vite" 2>/dev/null || true
echo "  Cache cleared."

echo "Starting backend..."
(cd "$REPO_ROOT/backend" && npm run dev) &
BACKEND_PID=$!
sleep 3

echo "Starting frontend..."
(cd "$REPO_ROOT/frontend" && npm run dev) &
FRONTEND_PID=$!

echo "Done. Backend PID $BACKEND_PID, Frontend PID $FRONTEND_PID"
echo "Do a hard refresh (Cmd+Shift+R) in the browser to clear browser cache."
