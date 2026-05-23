#!/usr/bin/env python3
"""
Normalize footnote identifiers so that each chapter/file gets a unique prefix.

This allows authors to keep using simple numeric markers like [^1] within a file
while eliminating duplicate note reference warnings during Quarto builds.
"""

from __future__ import annotations

import re
from pathlib import Path


FOOTNOTE_DEF_RE = re.compile(r"^\[\^(\d+)\]:(.*)$", re.MULTILINE)
FOOTNOTE_REF_RE = re.compile(r"\[\^(\d+)\]")


def slugify(name: str) -> str:
    """Convert a filename stem into a stable slug for footnote prefixes."""
    return (
        name.replace(" ", "_")
        .replace("-", "_")
        .replace(".", "_")
        .replace("__", "_")
    )


def normalize_file(path: Path) -> bool:
    """Rewrite numeric footnote ids in the given file with a prefixed variant."""
    original = path.read_text()
    matches = list(FOOTNOTE_DEF_RE.finditer(original))
    if not matches:
        return False

    slug = slugify(path.stem)
    mapping = {m.group(1): f"{slug}-{m.group(1)}" for m in matches}

    def replace_def(match: re.Match[str]) -> str:
        number, rest = match.group(1), match.group(2)
        return f"[^{mapping[number]}]:{rest}"

    updated = FOOTNOTE_DEF_RE.sub(replace_def, original)

    def replace_ref(match: re.Match[str]) -> str:
        number = match.group(1)
        # Skip already-normalized refs (they include a dash)
        if "-" in number:
            return match.group(0)
        replacement = mapping.get(number)
        return f"[^{replacement}]" if replacement else match.group(0)

    updated = FOOTNOTE_REF_RE.sub(replace_ref, updated)

    if updated != original:
        path.write_text(updated)
        return True
    return False


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    targets = list(root.glob("content/**/*.md")) + list(root.glob("content/**/*.qmd"))
    targets.append(root / "index.qmd")

    changed = sum(normalize_file(path) for path in targets if path.exists())

    if changed:
        print(f"Normalized footnotes in {changed} file(s).")
    else:
        print("No footnote updates required.")


if __name__ == "__main__":
    main()
