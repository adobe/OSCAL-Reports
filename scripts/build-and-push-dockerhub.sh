#!/usr/bin/env bash
#
# Build the OSCAL Report Generator Docker image locally and push to Docker Hub.
# Use this when you want to publish from your machine (e.g. Docker Desktop) instead
# of relying on the GitHub Actions "Docker Hub Publish" workflow.
#
# IMPORTANT: Builds for BOTH linux/amd64 and linux/arm64 (multi-platform), matching
# the GitHub workflow. Images built with plain "docker build" on a Mac (arm64) are
# arm64-only; when pulled on an amd64 server they fail or use emulation. This script
# uses buildx so v1.7.x and latest work on both architectures.
#
# Prerequisites: Docker with Buildx (Docker Desktop includes it).
# Push mode: run 'docker login' first; DOCKERHUB_USERNAME must be a Hub user you can push as.
# Local-only (no registry): DOCKERHUB_PUSH=0 — single native platform, --load (no docker login).
#
# Usage: ./scripts/build-and-push-dockerhub.sh [tag]
#   With no argument: tag is v<VERSION> from package.json (e.g. v1.7.12), and 'latest' is also pushed.
#   With argument: use that tag (e.g. v1.7.9 or 1.7.12). Use "v" prefix to also push as latest.
# Env:
#   DOCKERHUB_USERNAME  (default: keekar) — must match the account you 'docker login' with to push.
#   DOCKERHUB_PUSH      (default: 1) — set to 0/false/no to build and load locally only (no push).
#
# Push mode: if ~/.docker/config.json (or $DOCKER_CONFIG/config.json) has no Docker Hub registry key,
# this script adds https://index.docker.io/v1/ under auths (empty object) so the file is valid; you
# must still run docker login to store credentials (this does not invent passwords or tokens).
#
# To point 'latest' at an existing version WITHOUT rebuilding (e.g. after pushing only 1.7.12):
#   docker buildx imagetools create -t keekar/oscal_reports:latest keekar/oscal_reports:1.7.12
#   (Pushes to registry automatically when -t is set; omit -t and use --dry-run to preview only.)
#
# The Docker image includes pass and gnupg; the store is not initialized at build (GPG needs TTY).
# To init pass in a running container (interactive):
#   docker exec -it <container> sh
#   gpg --batch --quick-generate-key "OSCAL Docker" default default 0
#   pass init $(gpg -k --with-colons "OSCAL Docker" | awk -F: '/^pub:/{print $5;exit}')
# Or mount your own .password-store and set PASSWORD_STORE_DIR.
#

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="oscal_reports"
DOCKERHUB_USERNAME="${DOCKERHUB_USERNAME:-keekar}"
# Match GitHub workflow: build for both amd64 (cloud VMs) and arm64 (Apple Silicon, ARM servers)
PLATFORMS="linux/amd64,linux/arm64"

docker_host_linux_platform() {
  case "$(uname -m)" in
    aarch64 | arm64) echo "linux/arm64" ;;
    x86_64 | amd64) echo "linux/amd64" ;;
    *) echo "linux/amd64" ;;
  esac
}

docker_hub_push_wanted() {
  case "$(echo "${DOCKERHUB_PUSH:-1}" | tr '[:upper:]' '[:lower:]')" in
    0 | false | no | off | skip) return 1 ;;
    *) return 0 ;;
  esac
}

# Ensure Docker Hub registry key exists under auths (does not overwrite existing auth).
ensure_docker_hub_config_entry() {
  local d cfg tmp
  d="${DOCKER_CONFIG:-$HOME/.docker}"
  cfg="$d/config.json"
  mkdir -p "$d"

  if [ ! -f "$cfg" ]; then
    printf '%s\n' '{"auths":{"https://index.docker.io/v1/":{}}}' >"$cfg"
    chmod 600 "$cfg" 2>/dev/null || true
    echo "Created $cfg with Docker Hub registry entry (empty). Run: docker login" >&2
    return 0
  fi

  if grep -qF 'https://index.docker.io/v1/' "$cfg" 2>/dev/null; then
    return 0
  fi

  if command -v jq >/dev/null 2>&1; then
    if ! jq -e . "$cfg" >/dev/null 2>&1; then
      echo "Warning: $cfg is not valid JSON; leaving unchanged." >&2
      return 0
    fi
    tmp=$(mktemp "${TMPDIR:-/tmp}/docker-config.XXXXXX") || return 1
    if jq '.auths = ((.auths // {}) + {"https://index.docker.io/v1/": ((.auths // {})["https://index.docker.io/v1/"] // {})})' "$cfg" >"$tmp"; then
      chmod 600 "$tmp" 2>/dev/null || true
      mv "$tmp" "$cfg"
      echo "Added Docker Hub registry entry to $cfg (run docker login if not already logged in)." >&2
    else
      rm -f "$tmp"
      echo "Warning: jq merge failed; leaving $cfg unchanged." >&2
    fi
    return 0
  fi

  if command -v python3 >/dev/null 2>&1; then
    DOCKER_CONFIG_JSON="$cfg" python3 <<'PY'
import json
import os
import sys
from pathlib import Path

p = Path(os.environ["DOCKER_CONFIG_JSON"])
try:
    data = json.loads(p.read_text())
except (json.JSONDecodeError, OSError) as e:
    print("Warning: could not read or parse Docker config; leaving unchanged.", e, file=sys.stderr)
    sys.exit(0)
data.setdefault("auths", {})
data["auths"].setdefault("https://index.docker.io/v1/", {})
p.write_text(json.dumps(data, indent=2) + "\n")
try:
    p.chmod(0o600)
except OSError:
    pass
print("Added Docker Hub registry entry to", p, "(run docker login if not already logged in).", file=sys.stderr)
PY
    return 0
  fi

  echo "Warning: neither jq nor python3 found; cannot merge Docker Hub entry into $cfg. Install jq or add the entry manually." >&2
  return 0
}

warn_if_no_docker_hub_auth() {
  local cfg="${DOCKER_CONFIG:-$HOME/.docker}/config.json"
  if [ ! -f "$cfg" ]; then
    echo "Warning: $cfg not found. Run: docker login" >&2
    return 0
  fi
  if command -v jq >/dev/null 2>&1; then
    if ! jq -e '.auths["https://index.docker.io/v1/"].auth != null and (.auths["https://index.docker.io/v1/"].auth | type == "string") and (.auths["https://index.docker.io/v1/"].auth | length) > 0' "$cfg" >/dev/null 2>&1; then
      echo "Warning: Docker Hub credentials not set in $cfg. Run: docker login" >&2
    fi
    return 0
  fi
  if ! grep -qE 'index\.docker\.io|registry-1\.docker\.io' "$cfg" 2>/dev/null; then
    echo "Warning: No Docker Hub entry found in $cfg. Run: docker login" >&2
  elif ! grep -q '"auth"' "$cfg" 2>/dev/null; then
    echo "Warning: No auth blob found in $cfg. Run: docker login" >&2
  fi
}

print_push_failure_help() {
  local self="${BASH_SOURCE[0]}"
  echo "" >&2
  echo "Build/push failed (often: insufficient_scope / push access denied)." >&2
  echo "  1) Log in as a user that may push this repo:  docker login" >&2
  echo "  2) Create the repository on https://hub.docker.com/repository/create (name: ${IMAGE_NAME})" >&2
  echo "  3) Match your Hub username:  export DOCKERHUB_USERNAME=<your-docker-id>" >&2
  echo "  4) Build locally without pushing:  DOCKERHUB_PUSH=0 ${self} ${1:+"$1"}" >&2
}

# Resolve tag: from argument or from package.json version
get_version() {
  local pkg="${REPO_ROOT}/package.json"
  if [ ! -f "$pkg" ]; then
    echo ""
    return 1
  fi
  grep -E '"version"' "$pkg" | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/'
}

if [ -n "${1:-}" ]; then
  TAG="$1"
else
  VERSION="$(get_version)" || true
  if [ -z "$VERSION" ]; then
    echo "Could not read version from ${REPO_ROOT}/package.json" >&2
    exit 1
  fi
  TAG="v${VERSION}"
fi

FULL_IMAGE="${DOCKERHUB_USERNAME}/${IMAGE_NAME}:${TAG}"

if ! command -v docker &>/dev/null; then
  echo "Docker is not installed or not in PATH. Install Docker Desktop and ensure 'docker' is available." >&2
  exit 1
fi

# Ensure buildx is available (Docker Desktop includes it)
if ! docker buildx version &>/dev/null; then
  echo "Docker Buildx is required for multi-platform build. Install Docker Desktop or enable buildx." >&2
  exit 1
fi

# If build fails with "multiple platforms not supported", create a container driver builder:
#   docker buildx create --name multiarch --use --driver docker-container
cd "$REPO_ROOT"
if [ ! -f "Dockerfile" ]; then
  echo "Dockerfile not found in $REPO_ROOT" >&2
  exit 1
fi

TAGS_ARGS=(--tag "$FULL_IMAGE")
if [[ "$TAG" =~ ^v?[0-9] ]]; then
  LATEST_IMAGE="${DOCKERHUB_USERNAME}/${IMAGE_NAME}:latest"
  TAGS_ARGS+=(--tag "$LATEST_IMAGE")
fi

if docker_hub_push_wanted; then
  ensure_docker_hub_config_entry
  warn_if_no_docker_hub_auth
  echo "Building multi-platform image: ${FULL_IMAGE} (${PLATFORMS}) — will push to Docker Hub"
  if [[ "$TAG" =~ ^v?[0-9] ]]; then
    echo "Will push tags: ${TAG}, latest"
  else
    echo "Will push tag: ${TAG}"
  fi
  if ! docker buildx build \
    --platform "$PLATFORMS" \
    "${TAGS_ARGS[@]}" \
    --push \
    --file Dockerfile \
    .; then
    print_push_failure_help "${1:-}"
    exit 1
  fi
  echo "Done. Image(s) pushed to Docker Hub: ${FULL_IMAGE} (platforms: ${PLATFORMS})"
else
  ONE_PLAT="$(docker_host_linux_platform)"
  echo "DOCKERHUB_PUSH=0: building for this machine only (${ONE_PLAT}), --load (no registry push)"
  if [[ "$TAG" =~ ^v?[0-9] ]]; then
    echo "Will load tags: ${FULL_IMAGE}, ${DOCKERHUB_USERNAME}/${IMAGE_NAME}:latest"
  else
    echo "Will load tag: ${FULL_IMAGE}"
  fi
  if ! docker buildx build \
    --platform "$ONE_PLAT" \
    "${TAGS_ARGS[@]}" \
    --load \
    --file Dockerfile \
    .; then
    echo "Build (--load) failed." >&2
    exit 1
  fi
  echo "Done. Image loaded locally: ${FULL_IMAGE} (platform ${ONE_PLAT}). Run: docker run --rm -p 3020:3020 ${FULL_IMAGE}"
fi
