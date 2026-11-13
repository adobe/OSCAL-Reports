#!/usr/bin/env bash
# Concept: Mukesh Kesharwani
# Contact: mukesh.kesharwani@adobe.com

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
python3 - "$REPO_ROOT" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])
deploy_script = (root / "scripts/deploy-to-ec2.sh").read_text()
required_filter = "'config/constants/**'"
if deploy_script.count(required_filter) != 2:
    raise SystemExit("expected config/constants include in both S3 sync filters")

required_files = [
    "classification-levels.json",
    "control-status.json",
    "roles.json",
    "service-models.json",
    "system-status.json",
]
missing = [name for name in required_files if not (root / "config/constants" / name).is_file()]
if missing:
    raise SystemExit("missing tracked frontend config constants: " + ", ".join(missing))

print("S3 deploy filters include all shared frontend constants.")
PY
