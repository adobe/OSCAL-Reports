#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com
#
# Boots a built OSCAL Report Generator image and confirms it actually serves
# traffic, instead of trusting that `docker build` succeeding means the app
# runs. Written after v1.8.00 shipped a production image that crash-looped on
# every start (ENOENT on config/constants/roles.json, copied into the discarded
# frontend-builder stage but never into the production stage) — `docker build`
# and `docker push` both succeeded, and nothing caught it before it reached
# nas.keekar.au. This script must pass before an image is trusted for release.
#
# Usage: ./scripts/docker-smoke-test.sh <image-ref> [container-port] [host-port]
#   image-ref:      required, e.g. keekar/oscal_reports:1.8.01
#   container-port: default 3020, matching the Dockerfile's own `ARG PORT=3020`
#                    default — pass the actual value if the image was built
#                    with --build-arg PORT=<other> (e.g. 3019 for Green)
#   host-port:      default 13020
#
# Exits non-zero (with container logs printed) if the container never becomes
# healthy, or if the shared-constants/catalogue config isn't present at the
# absolute paths backend/utils/constants.js and sampleCatalogues.js expect.

set -u

IMAGE="${1:?Usage: $0 <image-ref> [container-port] [host-port]}"
CONTAINER_PORT="${2:-3020}"
HOST_PORT="${3:-13020}"
CONTAINER_NAME="oscal-smoke-test-$$"
MAX_ATTEMPTS=20
SLEEP_SECONDS=1

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "❌ $1" >&2
  echo "--- container logs ---" >&2
  docker logs "$CONTAINER_NAME" 2>&1 | tail -n 80 >&2 || true
  exit 1
}

echo "Starting $IMAGE as $CONTAINER_NAME (host port $HOST_PORT -> container port $CONTAINER_PORT)..."
if ! docker run -d --name "$CONTAINER_NAME" -p "${HOST_PORT}:${CONTAINER_PORT}" -e "PORT=${CONTAINER_PORT}" "$IMAGE" >/dev/null; then
  echo "❌ docker run failed to start a container from $IMAGE" >&2
  exit 1
fi

echo "Waiting for /health (up to ${MAX_ATTEMPTS}s)..."
healthy=0
for _ in $(seq 1 "$MAX_ATTEMPTS"); do
  if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    fail "Container exited before becoming healthy (crash-loop) — see logs below"
  fi
  if curl -sf -m 2 "http://localhost:${HOST_PORT}/health" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep "$SLEEP_SECONDS"
done

if [ "$healthy" -ne 1 ]; then
  fail "/health never returned 200 within ${MAX_ATTEMPTS}s"
fi
echo "✅ /health responded"

echo "Checking shared config landed in the production image..."
if ! docker exec "$CONTAINER_NAME" sh -c '[ -s /config/constants/roles.json ] && [ -s /config/catalogues/sample-catalogues.json ]'; then
  fail "Missing /config/constants/roles.json or /config/catalogues/sample-catalogues.json in the running container — the Dockerfile production stage regressed the config copy"
fi
echo "✅ /config/constants and /config/catalogues present"

echo "✅ Docker smoke test passed for $IMAGE"
