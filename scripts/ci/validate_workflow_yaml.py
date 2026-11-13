#!/usr/bin/env python3
"""
Validate GitHub Actions workflow YAML syntax (Adobe PreProd gate).

Concept: Mukesh Kesharwani
Contact: mukesh.kesharwani@adobe.com
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    import yaml
except ImportError as exc:  # pragma: no cover - CI installs PyYAML before invoke
    print(f"PyYAML required: {exc}", file=sys.stderr)
    sys.exit(2)


def validate_files(paths: list[Path]) -> int:
    failed = False
    for path in paths:
        try:
            yaml.safe_load(path.read_text(encoding="utf-8"))
            print(f"OK {path}")
        except Exception as exc:
            print(f"Invalid YAML: {path}: {exc}", file=sys.stderr)
            failed = True
    return 1 if failed else 0


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    workflows = sorted((repo_root / ".github" / "workflows").glob("*.yml"))
    if not workflows:
        print("No workflow files found", file=sys.stderr)
        sys.exit(1)
    sys.exit(validate_files(workflows))


if __name__ == "__main__":
    main()
