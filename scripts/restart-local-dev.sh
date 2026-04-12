#!/usr/bin/env bash
# Local dev: restore users.json from backup (default), stop backend/frontend (3020, 3021),
# clear caches, start backend + frontend via npm run dev.
# Single script for restore + restart; for local laptop only. Not for Docker/EC2.
#
# Usage (from repo root):
#   ./scripts/restart-local-dev.sh
#   ./scripts/restart-local-dev.sh --no-restore   # skip users.json restore
#
# Override backup directory:
#   BACKUP_DIR=/path/to/backup ./scripts/restart-local-dev.sh

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

RESTORE_USERS=true
for arg in "$@"; do
  if [[ "$arg" == "--no-restore" ]]; then
    RESTORE_USERS=false
  fi
done

kill_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids=$(lsof -ti:"$port" 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null || true
      echo "Stopped process(es) on port $port (PIDs: $pids)"
    else
      echo "Nothing listening on port $port"
    fi
  else
    echo "lsof not found; stop dev manually (Ctrl+C) if something runs on $port" >&2
  fi
}

if [[ "$RESTORE_USERS" == true ]]; then
  BACKUP_DIR="${BACKUP_DIR:-/Users/mkesharw/Library/CloudStorage/OneDrive-Adobe/OSCAL-Config-Backup}"
  USERS_BACKUP="${BACKUP_DIR}/users.json"

  if [ -f "$REPO_ROOT/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.env"
    set +a
  fi
  USERS_PATH="${USERS_PATH:-$REPO_ROOT/../OSCAL_Reports_data/users.json}"

  echo "=== Restoring users from backup (default) ==="
  if [ ! -f "$USERS_BACKUP" ]; then
    echo "Error: Backup not found at $USERS_BACKUP"
    echo "Set BACKUP_DIR or use --no-restore to start without restoring users."
    exit 1
  fi
  mkdir -p "$(dirname "$USERS_PATH")"
  cp "$USERS_BACKUP" "$USERS_PATH"
  echo "  Restored to $USERS_PATH ($(wc -l < "$USERS_PATH" | tr -d ' ') lines)"
  echo ""
else
  echo "=== Skipping users restore (--no-restore) ==="
  echo ""
fi

echo "=== Stopping backend (3020) and frontend (3021) ==="
kill_port 3020
kill_port 3021

echo ""
echo "=== Clearing frontend caches ==="
if [[ -d frontend/node_modules/.vite ]]; then
  rm -rf frontend/node_modules/.vite
  echo "Removed frontend/node_modules/.vite"
else
  echo "No frontend/node_modules/.vite"
fi
rm -rf frontend/node_modules/.cache \
       frontend/dist \
       frontend/.vite 2>/dev/null || true
echo "Cleared .cache / dist / .vite (if present)."

echo ""
echo "=== Optional: clear npm cache (can slow next install) ==="
# Uncomment next line to wipe npm cache as well:
# npm cache clean --force && echo "npm cache cleaned"

echo ""
echo "=== Starting backend + frontend ==="
echo "Backend: http://localhost:3020  |  Frontend: http://localhost:3021"
echo "Press Ctrl+C to stop both."
echo "Tip: hard refresh (Cmd+Shift+R) after UI changes."
npm run dev
