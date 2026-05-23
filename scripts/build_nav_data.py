#!/usr/bin/env python3
"""Generate navigation data for custom TOC tabs.

This script parses the rendered HTML files created by Quarto in the
project's output directory and extracts heading information so that the
frontend can build consistent navigation views (per-page, per-chapter,
and whole-book) without relying on the automatically generated sidebar
markup.

The result is written to ``out/assets/nav-data.json`` and includes, for
each rendered page, a tree of headings (H1–H4). The JSON file is then
consumed on the client to render the left panel tabs.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, List, Optional


try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover - dependency guard
    sys.stderr.write(
        "[build_nav_data] Missing dependency 'PyYAML'. Install it via\n"
        "    python3 -m pip install --user pyyaml\n"
    )
    sys.exit(1)

try:
    from bs4 import BeautifulSoup  # type: ignore
except ImportError:  # pragma: no cover - dependency guard
    sys.stderr.write(
        "[build_nav_data] Missing dependency 'beautifulsoup4'. Install it via\n"
        "    python3 -m pip install --user beautifulsoup4\n"
    )
    sys.exit(1)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "out"
CONFIG_PATH = PROJECT_ROOT / "_quarto.yml"
NAV_DATA_PATH = OUTPUT_DIR / "assets" / "nav-data.json"
NAV_DATA_JS_PATH = OUTPUT_DIR / "assets" / "nav-data.js"


@dataclass
class Heading:
    level: int
    title: str
    anchor: Optional[str]


@dataclass
class PageNav:
    source: str
    output: str
    title: str
    headings: List[dict]


LEADING_NUMBER_RE = re.compile(r"^\s*(?:\d+(?:\.\d+)*|[０-９]+(?:．[０-９]+)*)\s*")


def normalize_nav_title(text: str) -> str:
    """Remove Quarto-generated section numbers from visible nav labels."""
    normalized = re.sub(r"\s+", " ", text or "").strip()
    if not normalized:
        return normalized
    previous = None
    while previous != normalized:
        previous = normalized
        normalized = LEADING_NUMBER_RE.sub("", normalized).strip()
    return normalized


def load_quarto_config() -> dict:
    if not CONFIG_PATH.exists():
        raise FileNotFoundError(f"Quarto config not found: {CONFIG_PATH}")
    with CONFIG_PATH.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def iter_declared_pages(config: dict) -> Iterable[str]:
    book_cfg = config.get("book", {}) or {}
    chapters = book_cfg.get("chapters", []) or []
    appendices = book_cfg.get("appendices", []) or []
    for entry in list(chapters) + list(appendices):
        if isinstance(entry, str):
            yield entry.strip()


def source_to_output_rel(source: str) -> str:
    path = Path(source)
    if not path.suffix:
        path = path.with_suffix(".qmd")
    if path.suffix.lower() in {".md", ".qmd"}:
        path = path.with_suffix(".html")
    return path.as_posix()


def resolve_output_rel(source: str) -> Optional[str]:
    expected_rel = source_to_output_rel(source)
    expected_name = Path(expected_rel).name

    candidates = [
        OUTPUT_DIR / expected_rel,
        OUTPUT_DIR / expected_name,
        OUTPUT_DIR / "content" / expected_name,
    ]

    seen = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        if candidate.exists():
            return candidate.relative_to(OUTPUT_DIR).as_posix()

    return None


def extract_headings(html_path: Path) -> List[Heading]:
    text = html_path.read_text(encoding="utf-8")
    soup = BeautifulSoup(text, "html.parser")
    main = soup.select_one("main#quarto-document-content")
    if main is None:
        return []

    headings: List[Heading] = []
    for element in main.find_all(["h1", "h2", "h3", "h4"]):
        if element.find_parent(id="reader-header") is not None:
            continue
        if element.find_parent(class_="index-hero") is not None:
            continue

        level = int(element.name[1])

        anchor = element.get("data-anchor-id") or element.get("id")
        classes = element.get("class") or []
        if "doc-title" in classes:
            continue

        # Skip headings that Quarto injects for its default ToC wrappers
        if anchor == "toc-title":
            continue

        # For the document title (typically <h1 class="title">) no anchor is
        # emitted. Treat it as pointing to the top of the page.
        if anchor is None and "title" not in classes:
            # Non-anchored headings (rare) are not linkable, skip them.
            continue

        title_text = normalize_nav_title(element.get_text(strip=True))
        headings.append(Heading(level=level, title=title_text, anchor=anchor))
    return headings


def build_tree(headings: List[Heading]) -> List[dict]:
    tree: List[dict] = []
    stack: List[dict] = []

    for heading in headings:
        node = {
            "title": heading.title,
            "level": heading.level,
            "anchor": heading.anchor,
            "children": [],
        }

        while stack and stack[-1]["level"] >= heading.level:
            stack.pop()

        if stack:
            stack[-1]["children"].append(node)
        else:
            tree.append(node)

        stack.append(node)

    return tree


def extract_page_title(html_path: Path) -> str:
    text = html_path.read_text(encoding="utf-8")
    soup = BeautifulSoup(text, "html.parser")
    heading = soup.select_one("main#quarto-document-content h1.title")
    if heading:
        return normalize_nav_title(heading.get_text(strip=True))
    title = soup.find("title")
    if title:
        return normalize_nav_title(title.get_text(strip=True).split("–")[0])
    return html_path.stem


def collect_pages(config: dict) -> List[PageNav]:
    declared_sources = list(dict.fromkeys(iter_declared_pages(config)))
    pages: List[PageNav] = []

    for source in declared_sources:
        output_rel = resolve_output_rel(source)
        html_path = OUTPUT_DIR / output_rel if output_rel else None
        if html_path is None or not html_path.exists():
            sys.stderr.write(
                f"[build_nav_data] Warning: output file not found for declared page {source}\n"
            )
            continue

        headings = extract_headings(html_path)
        page = PageNav(
            source=source,
            output=output_rel,
            title=extract_page_title(html_path),
            headings=build_tree(headings),
        )
        pages.append(page)

    # Include any additional HTML content files that were not declared but
    # live under out/content/*.html so that the navigation remains complete.
    content_dir = OUTPUT_DIR / "content"
    if content_dir.exists():
        for html_path in sorted(content_dir.glob("*.html")):
            output_rel = html_path.relative_to(OUTPUT_DIR).as_posix()
            if any(page.output == output_rel for page in pages):
                continue
            headings = extract_headings(html_path)
            pages.append(
                PageNav(
                    source=output_rel,
                    output=output_rel,
                    title=extract_page_title(html_path),
                    headings=build_tree(headings),
                )
            )

    return pages


def serialize_nav(pages: Iterable[PageNav]) -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "pages": [
            {
                "source": page.source,
                "output": page.output,
                "title": page.title,
                "headings": page.headings,
            }
            for page in pages
        ],
    }


def ensure_output_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def main() -> int:
    if not OUTPUT_DIR.exists():
        sys.stderr.write(
            f"[build_nav_data] Output directory not found: {OUTPUT_DIR}\n"
        )
        return 0

    html_outputs = list(OUTPUT_DIR.glob("*.html"))
    content_dir = OUTPUT_DIR / "content"
    if content_dir.exists():
        html_outputs.extend(content_dir.glob("*.html"))

    if not html_outputs:
        print("[build_nav_data] No HTML outputs found; skipping nav-data refresh")
        return 0

    config = load_quarto_config()
    pages = collect_pages(config)

    data = serialize_nav(pages)
    ensure_output_dir(NAV_DATA_PATH)
    json_text = json.dumps(data, ensure_ascii=False, indent=2)
    NAV_DATA_PATH.write_text(json_text, encoding="utf-8")

    ensure_output_dir(NAV_DATA_JS_PATH)
    NAV_DATA_JS_PATH.write_text(
        "window.__NAV_DATA__ = " + json_text + ";\n",
        encoding="utf-8",
    )
    print(
        f"[build_nav_data] Generated navigation for {len(pages)} page(s) -> "
        f"{NAV_DATA_PATH} (json) and {NAV_DATA_JS_PATH} (js)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
