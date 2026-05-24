#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Remove legacy per-instance OS patch cron (root crontab / cron.d) after migrating
# to SSM Patch Manager. Idempotent; safe to run multiple times.
#
# Usage:
#   sudo ./scripts/remove-legacy-os-patch-cron.sh
#   ./scripts/remove-legacy-os-patch-cron.sh --dry-run

set -euo pipefail

DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=1
fi

removed_any=0

# Legacy root crontab lines (manual yum/dnf patch schedules)
if crontab -l >/dev/null 2>&1; then
  if crontab -l 2>/dev/null | grep -qE 'oscal-yum-update|oscal-os-patch|yum update -y|dnf upgrade -y'; then
    remaining="$(crontab -l 2>/dev/null | grep -vE 'oscal-yum-update|oscal-os-patch|/usr/local/sbin/oscal-os-patch-run\.sh' || true)"
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] Would update root crontab (remove legacy OS patch lines)"
    elif [[ -n "$remaining" ]]; then
      printf '%s\n' "$remaining" | crontab -
    else
      crontab -r 2>/dev/null || true
    fi
    echo "Removed legacy OS patch entries from root crontab"
    removed_any=1
  fi
fi

for f in /etc/cron.d/oscal-os-patch /etc/cron.d/oscal-os-patch-blue /etc/cron.d/oscal-os-patch-green; do
  if [[ -f "$f" ]]; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "[dry-run] Would remove $f"
    else
      rm -f "$f"
    fi
    echo "Removed $f"
    removed_any=1
  fi
done

if [[ "$removed_any" -eq 0 ]]; then
  echo "No legacy OS patch cron entries found (already clean)."
else
  echo "Legacy OS patch cron cleanup complete. Patching is managed by SSM Patch Manager."
fi
