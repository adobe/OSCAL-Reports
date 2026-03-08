#!/usr/bin/env bash
# Resolve common merge conflicts when merging main into Development.
# Run this when "git merge adobe/main" or "git merge personal/main" stops with conflicts.
#
# Usage: from repo root, after merge stops with conflicts:
#   bash scripts/resolve-merge-conflicts.sh
#   git add -A && git status   # review, then git commit
#
# Resolutions:
#   - backend/package-lock.json: keep ours, then regenerate with npm install
#   - frontend/package-lock.json: remove from index (we don't track it per .gitignore)
#   - scripts/activate-users-green-via-ssh.sh, scripts/alb-import-existing-listeners.sh:
#     remove (we use scripts/debug/ versions only; these paths are retired in .gitignore)

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! git rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
  echo "Not in a merge. Run this after 'git merge adobe/main' (or personal/main) stops with conflicts." >&2
  exit 1
fi

echo "Resolving merge conflicts..."

# backend/package-lock.json: keep our version, then regenerate
if git ls-files -u -- backend/package-lock.json | grep -q .; then
  git checkout --ours -- backend/package-lock.json
  (cd backend && npm install --package-lock-only 2>/dev/null || npm install)
  git add backend/package-lock.json
  echo "  resolved backend/package-lock.json"
fi

# frontend/package-lock.json: we don't track it per .gitignore; keep it deleted
if git ls-files -u -- frontend/package-lock.json 2>/dev/null | grep -q .; then
  git rm -f frontend/package-lock.json 2>/dev/null || true
  echo "  resolved frontend/package-lock.json (kept untracked per .gitignore)"
fi

# Retired script paths: we use scripts/debug/ only; remove scripts/ copies
for f in scripts/activate-users-green-via-ssh.sh scripts/alb-import-existing-listeners.sh; do
  if git ls-files -u -- "$f" 2>/dev/null | grep -q . || [ -f "$f" ]; then
    git rm -f "$f" 2>/dev/null || rm -f "$f"
    git add "$f" 2>/dev/null || true
    echo "  removed $f (use scripts/debug/ version)"
  fi
done

echo "Done. Run: git add -A && git status && git commit"
exit 0
