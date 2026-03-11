#!/usr/bin/env bash
# Stop local backend/frontend (ports 3020, 3021), clear caches, restart dev servers.
# Run from repo root: ./scripts/restart-local-dev.sh

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

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

echo "=== Stopping backend (3020) and frontend (3021) ==="
kill_port 3020
kill_port 3021

echo ""
echo "=== Clearing Vite cache (frontend) ==="
if [[ -d frontend/node_modules/.vite ]]; then
  rm -rf frontend/node_modules/.vite
  echo "Removed frontend/node_modules/.vite"
else
  echo "No frontend/node_modules/.vite"
fi

echo ""
echo "=== Optional: clear npm cache (can slow next install) ==="
# Uncomment next line to wipe npm cache as well:
# npm cache clean --force && echo "npm cache cleaned"

echo ""
echo "=== Starting backend + frontend ==="
echo "Backend: http://localhost:3020  |  Frontend: http://localhost:3021"
echo "Press Ctrl+C to stop both."
npm run dev
