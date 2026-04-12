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
# Prerequisites: Docker with Buildx (Docker Desktop includes it); run 'docker login' before first use.
# Usage: ./scripts/build-and-push-dockerhub.sh [tag]
#   With no argument: tag is v<VERSION> from package.json (e.g. v1.7.11), and 'latest' is also pushed.
#   With argument: use that tag (e.g. v1.7.9 or 1.7.11). Use "v" prefix to also push as latest.
# Env: DOCKERHUB_USERNAME (default: keekar)
#
# To point 'latest' at an existing version WITHOUT rebuilding (e.g. after pushing only 1.7.11):
#   docker buildx imagetools create -t keekar/oscal_reports:latest keekar/oscal_reports:1.7.11
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

# Resolve tag: from argument or from package.json version
get_version() {
  local pkg="${REPO_ROOT}/package.json"
  if [ ! -f "$pkg" ]; then
    echo ""; return 1
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

# Build and push multi-platform image (cannot load multi-arch into local docker, so push only)
echo "Building multi-platform image: ${FULL_IMAGE} (${PLATFORMS})"
TAGS_ARGS=(--tag "$FULL_IMAGE")

# When tag is a version (v1.7.11 or 1.7.11), also tag as latest so "docker pull ...:latest" gets this version
if [[ "$TAG" =~ ^v?[0-9] ]]; then
  LATEST_IMAGE="${DOCKERHUB_USERNAME}/${IMAGE_NAME}:latest"
  TAGS_ARGS+=(--tag "$LATEST_IMAGE")
  echo "Will push tags: ${TAG}, latest"
else
  echo "Will push tag: ${TAG}"
fi

if ! docker buildx build \
  --platform "$PLATFORMS" \
  "${TAGS_ARGS[@]}" \
  --push \
  --file Dockerfile \
  . ; then
  echo "Build/push failed. If you have not logged in, run: docker login" >&2
  exit 1
fi

echo "Done. Image(s) pushed to Docker Hub: ${FULL_IMAGE} (platforms: ${PLATFORMS})"
