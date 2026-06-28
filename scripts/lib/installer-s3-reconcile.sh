#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Reconcile installer package.json files after aws s3 sync.
# aws s3 sync can skip same-size package.json even when S3 content changed (e.g. 1.7.18 → 1.7.19);
# the manifest is always re-copied, so use it to detect drift and force-fetch version-critical files.

[ -n "${_INSTALLER_S3_RECONCILE_LOADED:-}" ] && return 0
_INSTALLER_S3_RECONCILE_LOADED=1

# Usage: reconcile_installer_package_versions BUCKET REGION APP_DIR [INSTALLER_PREFIX]
# Returns 0; logs to stdout/stderr. Exits 1 only when manifest exists and reconcile fetch fails.
reconcile_installer_package_versions() {
  local bucket="$1"
  local region="$2"
  local app="$3"
  local prefix="${4:-installer}"
  local mf manifest_ver disk_ver rel s3_uri dest

  mf="${app}/.installer-build.json"
  [ -f "$mf" ] || return 0
  command -v jq >/dev/null 2>&1 || return 0

  manifest_ver=$(jq -r '.package_version // empty' "$mf" 2>/dev/null)
  [ -n "$manifest_ver" ] || return 0
  [ -f "${app}/package.json" ] || return 0
  disk_ver=$(jq -r '.version // empty' "${app}/package.json" 2>/dev/null)
  [ -n "$disk_ver" ] || return 0
  [ "$manifest_ver" = "$disk_ver" ] && return 0

  echo "installer version reconcile: manifest=${manifest_ver} disk=${disk_ver}; forcing package.json fetch from s3://${bucket}/${prefix}/" >&2
  export AWS_DEFAULT_REGION="$region"
  for rel in package.json frontend/package.json backend/package.json; do
    s3_uri="s3://${bucket}/${prefix}/${rel}"
    dest="${app}/${rel}"
    if aws s3api head-object --bucket "$bucket" --key "${prefix}/${rel}" --region "$region" >/dev/null 2>&1; then
      aws s3 cp "$s3_uri" "$dest" --region "$region" || {
        echo "installer version reconcile failed: could not copy ${s3_uri}" >&2
        return 1
      }
    fi
  done
  disk_ver=$(jq -r '.version // empty' "${app}/package.json" 2>/dev/null)
  if [ "$manifest_ver" != "$disk_ver" ]; then
    echo "installer version reconcile failed: root package.json still ${disk_ver} after fetch (expected ${manifest_ver})" >&2
    return 1
  fi
  echo "installer version reconcile OK: package.json now ${disk_ver}" >&2
  return 0
}
