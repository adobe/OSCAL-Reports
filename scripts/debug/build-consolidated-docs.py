#!/usr/bin/env python3
"""
Build consolidated docs under docs/ from existing sources.
Run from repo root: python3 scripts/debug/build-consolidated-docs.py
"""
from __future__ import annotations

import re
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent.parent / "docs"


def github_slug(title: str) -> str:
    s = title.lower().strip()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-")


def heading_level(line: str) -> int | None:
    m = re.match(r"^(#+)\s", line)
    return len(m.group(1)) if m else None


def bump_markdown_headings(text: str, delta: int = 1) -> str:
    """Increase # depth for headings only (skip fenced ``` blocks)."""
    out: list[str] = []
    in_fence = False
    for line in text.splitlines(True):
        stripped = line.strip()
        if stripped.startswith("```"):
            in_fence = not in_fence
            out.append(line)
            continue
        if not in_fence:
            lvl = heading_level(line)
            if lvl is not None and lvl + delta <= 6:
                rest = line[lvl:]
                out.append("#" * (lvl + delta) + rest)
            else:
                out.append(line)
        else:
            out.append(line)
    return "".join(out)


def split_h1_rest(text: str) -> tuple[str, str]:
    lines = text.splitlines(True)
    if not lines:
        return "Section", ""
    first = lines[0].rstrip("\n")
    if first.startswith("# "):
        return first[2:].strip(), "".join(lines[1:])
    return "Section", text


def rewrite_internal_links(body: str, slug_by_file: dict[str, str]) -> str:
    """Turn ](OTHER.md) and ](docs/OTHER.md) into same-document section links."""
    if not slug_by_file:
        return body
    # Longest match first so names do not partially collide
    esc = "|".join(re.escape(k) for k in sorted(slug_by_file, key=len, reverse=True))

    def repl(m: re.Match[str]) -> str:
        target = m.group(1)
        if target in slug_by_file:
            return f"](#{slug_by_file[target]})"
        return m.group(0)

    return re.sub(rf"\]\((?:docs/)?({esc})(?:#[^)]+)?\)", repl, body)


def merge_bundle(
    out_name: str,
    main_title: str,
    intro: str,
    filenames: list[str],
) -> None:
    slug_by_file: dict[str, str] = {}
    bodies: dict[str, tuple[str, str]] = {}
    for fn in filenames:
        raw = (DOCS / fn).read_text(encoding="utf-8")
        h1, rest = split_h1_rest(raw)
        slug_by_file[fn] = github_slug(h1)
        bodies[fn] = (h1, rest)

    chunks: list[str] = []
    chunks.append(f"# {main_title}\n\n{intro}\n\n---\n\n## Table of contents\n\n")
    for fn in filenames:
        h1, _ = bodies[fn]
        chunks.append(f"- [{h1}](#{slug_by_file[fn]})\n")
    chunks.append("\n---\n\n")

    for fn in filenames:
        h1, rest = bodies[fn]
        rest = rewrite_internal_links(rest, slug_by_file)
        bumped = bump_markdown_headings(rest, 1)
        sid = slug_by_file[fn]
        chunks.append(f'<a id="{sid}"></a>\n\n## {h1}\n\n{bumped.strip()}\n\n---\n\n')

    (DOCS / out_name).write_text("".join(chunks), encoding="utf-8")
    print("Wrote", DOCS / out_name, "from", len(filenames), "sources")


def postprocess_ai_integration() -> None:
    """Point Bedrock / removed-file references at AWS_OPERATIONS.md."""
    path = DOCS / "AI_INTEGRATION.md"
    text = path.read_text(encoding="utf-8")
    bed = "amazon-bedrock-integration-step-by-step-aws-setup"
    arch = "ai-integration-architecture-security-design"
    text = text.replace("`docs/AWS_BEDROCK_SETUP.md`", f"`AWS_OPERATIONS.md` (section _Amazon Bedrock Integration_)")
    text = text.replace("docs/AWS_BEDROCK_SETUP.md", f"AWS_OPERATIONS.md#{bed}")
    text = text.replace("AWS_BEDROCK_SETUP.md", f"AWS_OPERATIONS.md#{bed}")
    text = text.replace("(AI_ARCHITECTURE_SECURITY.md)", f"(#{arch})")
    text = text.replace("(AI_MODELS_AND_CONFIG.md)", "(#ai-models-and-configuration)")
    path.write_text(text, encoding="utf-8")


def main() -> None:
    # One-time migration: sources were merged and removed from docs/. Edit *_INTEGRATION / *_OPERATIONS / GIT_AND_RELEASE directly.
    if not (DOCS / "VERSION_AND_RELEASE.md").exists():
        print("Skipping: source split docs not present (already consolidated).")
        return
    merge_bundle(
        "GIT_AND_RELEASE.md",
        "Git, repositories, and releases",
        "**Consolidated guide:** version bumping and release workflow, branching strategy, "
        "Adobe + personal dual remotes, GitHub account switching, and the PR submission checklist.",
        [
            "VERSION_AND_RELEASE.md",
            "BRANCHING_STRATEGY.md",
            "DUAL_REPO_SETUP.md",
            "GITHUB_ACCOUNT_GUIDE.md",
            "PR_SUBMISSION_CHECKLIST.md",
        ],
    )
    merge_bundle(
        "AI_INTEGRATION.md",
        "AI integration: architecture, security, and configuration",
        "**Consolidated guide:** security and architecture for AI features, plus supported models "
        "(Mistral, Gemma), Bedrock/Mistral configuration, token limits, and troubleshooting.",
        [
            "AI_ARCHITECTURE_SECURITY.md",
            "AI_MODELS_AND_CONFIG.md",
        ],
    )
    merge_bundle(
        "AWS_OPERATIONS.md",
        "AWS: Terraform, EC2 hosting, Bedrock, Image Factory, and costs",
        "**Consolidated guide:** Terraform layout for OSCAL on AWS, Image Factory AMIs, "
        "Bedrock IAM and setup, EC2 Blue/Green hosting practices, and cost estimates.",
        [
            "AWS_TERRAFORM.md",
            "IMAGE_FACTORY.md",
            "AWS_BEDROCK_SETUP.md",
            "EC2_WEB_HOSTING_BEST_PRACTICES.md",
            "AWS_COST_ESTIMATE.md",
        ],
    )
    postprocess_ai_integration()


if __name__ == "__main__":
    main()
