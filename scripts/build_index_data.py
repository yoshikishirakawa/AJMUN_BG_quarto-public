#!/usr/bin/env python3
"""Aggregate per-chapter index markers and generate the HTML index page."""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html import escape as html_escape
from pathlib import Path
from typing import Dict, Iterable, List, Tuple, Optional

import os
import sys
import warnings

warnings.filterwarnings("ignore", category=DeprecationWarning, module=r"pykakasi.*")

try:
    from pykakasi import kakasi  # type: ignore
except ImportError:  # pragma: no cover - optional dependency
    kakasi = None

if kakasi is not None:
    KAKASI_ENGINE = kakasi()
else:  # pragma: no cover - optional dependency
    KAKASI_ENGINE = None
_WARNED_KAKASI = False

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BUILD_INDEX_DIR = PROJECT_ROOT / "build" / "index"
OUTPUT_DIR = PROJECT_ROOT / "out"
ASSETS_DIR = OUTPUT_DIR / "assets"
ASSET_JSON = ASSETS_DIR / "index-data.json"
GENERATED_SNIPPET = PROJECT_ROOT / "meta" / "index" / "generated-index.qmd"
INDEX_PAGE_DIR = Path("content")
ERROR_DIR = PROJECT_ROOT / "error"
MISSING_READING_PATH = ERROR_DIR / "missing-readings.json"

GOJUON_ROWS: List[Tuple[str, str]] = [
    ("ア段", "あいうえおぁぃぅぇぉ"),
    ("カ段", "かきくけこがぎぐげご"),
    ("サ段", "さしすせそざじずぜぞ"),
    ("タ段", "たちつてとだぢづでど"),
    ("ナ段", "なにぬねの"),
    ("ハ段", "はひふへほばびぶべぼぱぴぷぺぽ"),
    ("マ段", "まみむめも"),
    ("ヤ段", "やゆよゃゅょ"),
    ("ラ段", "らりるれろ"),
    ("ワ段", "わゐゑをん"),
]
ALNUM_BUCKET = "アルファベット・数字"


@dataclass
class Location:
    label: str
    href_root: str
    href_local: Optional[str]
    order: Tuple[int, ...] = field(default_factory=tuple)


@dataclass
class TermEntry:
    term: str
    reading: str
    sort_hint: str
    _locations: Dict[str, Location] = field(default_factory=dict)

    def add_location(self, location: Location) -> None:
        key = location.href_root
        if key not in self._locations:
            self._locations[key] = location

    @property
    def sort_key(self) -> Tuple[str, str]:
        return self.sort_hint, self.term

    @property
    def locations(self) -> List[Location]:
        return sorted(self._locations.values(), key=lambda loc: (loc.order, loc.label, loc.href_root))


def to_hiragana(text: str) -> str:
    result = []
    for ch in text:
        code = ord(ch)
        if 0x30A1 <= code <= 0x30F6:
            result.append(chr(code - 0x60))
        else:
            result.append(ch)
    return "".join(result)


def contains_kanji(text: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in text)


def infer_reading(term: str) -> str:
    global _WARNED_KAKASI
    if not term:
        return ""
    if KAKASI_ENGINE is None:
        if not _WARNED_KAKASI and contains_kanji(term):
            sys.stderr.write(
                "[build_index_data] Install 'pykakasi' (pip install pykakasi) "
                "to enable automatic readings for kanji-only terms.\n"
            )
            _WARNED_KAKASI = True
        return ""
    reading_parts = []
    converted = KAKASI_ENGINE.convert(term)
    for chunk in converted:
        hira = chunk.get("hira") or chunk.get("kana") or chunk.get("orig", "")
        reading_parts.append(hira)
    reading = "".join(reading_parts)
    return reading.strip()


def normalize_reading(reading_raw: str | None, term: str) -> str:
    if reading_raw:
        return str(reading_raw)
    inferred = infer_reading(term)
    return inferred or ""


def source_to_output_rel(source: str) -> str:
    path = Path(source)
    if path.is_absolute():
        try:
            path = path.relative_to(PROJECT_ROOT)
        except ValueError:
            path = Path(path.name)
    if not path.suffix:
        path = path.with_suffix(".qmd")
    if path.suffix.lower() in {".md", ".qmd"}:
        path = path.with_suffix(".html")
    return path.as_posix()


def append_anchor(path: Optional[str], anchor: Optional[str]) -> Optional[str]:
    if not path and not anchor:
        return None
    if not path:
        return f"#{anchor}" if anchor else None
    if not anchor:
        return path
    return f"{path}#{anchor}"


def gather_entries() -> List[dict]:
    if not BUILD_INDEX_DIR.exists():
        return []
    entries: List[dict] = []

    def source_from_json_name(json_path: Path) -> str | None:
        stem = json_path.stem
        import re
        match = re.match(r"^(\d{2})-ch(\d{2})$", stem)
        if match:
            return f"content/{match.group(1)}_ch{match.group(2)}.md"
        known = {
            "00-front": "content/00_front.md",
            "90-afterword": "content/90_afterword.md",
            "95-references": "content/95_references.qmd",
            "96-index": "content/96_index.qmd",
        }
        return known.get(stem)

    for json_path in sorted(BUILD_INDEX_DIR.glob("*.json")):
        data = json.loads(json_path.read_text(encoding="utf-8"))
        source = source_from_json_name(json_path) or data.get("source")
        if not source:
            continue
        for entry in data.get("entries", []):
            entry["source"] = source
            entries.append(entry)
    return entries


def build_location(entry: dict) -> Location:
    output_rel = source_to_output_rel(entry["source"])
    anchor = entry.get("anchor")
    href_root = append_anchor(output_rel, anchor) or ""
    local_rel = relative_href(output_rel)
    href_local = append_anchor(local_rel, anchor)
    numbers = entry.get("section_numbers") or []
    order = tuple(int(n) for n in numbers if isinstance(n, int))
    label = entry.get("section_label") or entry.get("heading") or "本文"
    return Location(label=label, href_root=href_root, href_local=href_local, order=order)


def relative_href(target: str) -> str:
    target_path = Path(target)
    base = INDEX_PAGE_DIR
    try:
        rel = Path(os.path.relpath(target_path, base))
    except ValueError:
        rel = target_path
    href = rel.as_posix()
    if not href:
        return target_path.name
    return href


def collect_terms(entries: List[dict]) -> Tuple[Dict[str, Dict[str, TermEntry]], Dict[str, Dict[str, TermEntry]], List[dict]]:
    categories: Dict[str, Dict[str, TermEntry]] = defaultdict(dict)
    kana: Dict[str, Dict[str, TermEntry]] = defaultdict(dict)
    missing_readings: Dict[str, dict] = {}
    for entry in entries:
        term = str(entry["term"])
        reading = normalize_reading(entry.get("reading"), term)
        sort_hint = to_hiragana(reading or term).casefold()
        loc = build_location(entry)
        cat_list = entry.get("categories") or []
        key = f"{term}@@{reading}"
        has_explicit = entry.get("reading_source") == "explicit"
        if cat_list:
            for category in cat_list:
                bucket = categories.setdefault(category, {})
                term_entry = bucket.setdefault(
                    key,
                    TermEntry(term=term, reading=reading, sort_hint=sort_hint),
                )
                term_entry.add_location(loc)
        else:
            bucket_name = determine_bucket(reading or term)
            bucket = kana.setdefault(bucket_name, {})
            term_entry = bucket.setdefault(
                key,
                TermEntry(term=term, reading=reading, sort_hint=sort_hint),
            )
            term_entry.add_location(loc)
        if not has_explicit:
            missing = missing_readings.setdefault(
                key,
                {
                    "term": term,
                    "inferred_reading": reading or "",
                    "locations": [],
                },
            )
            missing["locations"].append(
                {
                    "file": entry["source"],
                    "section": loc.label,
                    "href": loc.href_root,
                    "anchor": entry.get("anchor"),
                }
            )
    return categories, kana, list(missing_readings.values())


def determine_bucket(text: str) -> str:
    stripped = text.strip()
    if not stripped:
        return ALNUM_BUCKET
    first = stripped[0]
    first_hira = to_hiragana(first)
    for bucket, chars in GOJUON_ROWS:
        if first_hira in chars:
            return bucket
    if first.isdigit() or ("a" <= first.lower() <= "z"):
        return ALNUM_BUCKET
    return ALNUM_BUCKET


def render_index_markdown(categories: Dict[str, Dict[str, TermEntry]], kana: Dict[str, Dict[str, TermEntry]]) -> str:
    lines: List[str] = []
    lines.append("::: {.aj-index}")
    bucket_order = [row[0] for row in GOJUON_ROWS] + [ALNUM_BUCKET]
    blocks_written = 0

    def append_block(title: str, term_entries: List[TermEntry]) -> None:
        nonlocal blocks_written
        if not term_entries:
            return
        blocks_written += 1
        lines.append("")
        lines.append("::: {.aj-index__block}")
        lines.append(f"## {escape_md(title)}")
        lines.append("")
        for term_entry in term_entries:
            locations = render_location_links(term_entry.locations)
            lines.append(
                "- <span class=\"aj-index__entry\">"
                f"<span class=\"aj-index__term\">{html_escape(term_entry.term)}</span>"
                "<span class=\"aj-index__dots\">…</span>"
                f"<span class=\"aj-index__locations\">{locations}</span>"
                "</span>"
            )
        lines.append(":::")

    for category in sorted(categories.keys(), key=lambda c: c.casefold()):
        term_entries = sorted(categories[category].values(), key=lambda t: t.sort_key)
        append_block(category, term_entries)

    for bucket in bucket_order:
        term_entries = kana.get(bucket)
        if not term_entries:
            continue
        append_block(bucket, sorted(term_entries.values(), key=lambda t: t.sort_key))

    if blocks_written == 0:
        lines.append("")
        lines.append("_索引用語はまだ登録されていません。_")

    lines.append(":::")
    return "\n".join(lines) + "\n"


def escape_md(text: str) -> str:
    replacements = {
        "*": "\\*",
        "_": "\\_",
        "[": "\\[",
        "]": "\\]",
    }
    return "".join(replacements.get(ch, ch) for ch in text)


def render_location_links(locations: List[Location]) -> str:
    parts = []
    for loc in locations:
        root_href = loc.href_root
        local_href = loc.href_local
        attrs = []
        if root_href:
            attrs.append(f'href="{html_escape(root_href)}"')
            attrs.append(f'data-aj-index-root-href="{html_escape(root_href)}"')
        else:
            attrs.append('href="#"')
        if local_href:
            attrs.append(f'data-aj-index-local-href="{html_escape(local_href)}"')
        parts.append(
            f'<span class="aj-index__loc"><a {" ".join(attrs)}>'
            f"{html_escape(loc.label)}</a></span>"
        )
    return "".join(parts)


def serialize_term_entries(mapping: Dict[str, Dict[str, TermEntry]], ordered_keys: Iterable[str] | None = None) -> List[dict]:
    records: List[dict] = []
    keys = list(ordered_keys) if ordered_keys is not None else sorted(mapping.keys(), key=lambda c: c.casefold())
    for key in keys:
        bucket = mapping.get(key)
        if not bucket:
            continue
        terms = [
            {
                "term": term.term,
                "reading": term.reading,
                "locations": [
                    {
                        "label": loc.label,
                        "href": loc.href_root,
                        "href_root": loc.href_root,
                        "href_local": loc.href_local,
                        "order": list(loc.order),
                    }
                    for loc in term.locations
                ],
            }
            for term in sorted(bucket.values(), key=lambda t: t.sort_key)
        ]
        if terms:
            records.append({"name": key, "terms": terms})
    return records


def save_outputs(html_text: str, categories: Dict[str, Dict[str, TermEntry]], kana: Dict[str, Dict[str, TermEntry]]) -> None:
    GENERATED_SNIPPET.parent.mkdir(parents=True, exist_ok=True)
    GENERATED_SNIPPET.write_text(html_text, encoding="utf-8")
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    kana_order = [row[0] for row in GOJUON_ROWS] + [ALNUM_BUCKET]
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "categories": serialize_term_entries(categories),
        "kana": serialize_term_entries(kana, ordered_keys=kana_order),
    }
    ASSET_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def save_missing_readings(records: List[dict]) -> None:
    ERROR_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(records),
        "entries": records,
    }
    MISSING_READING_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    entries = gather_entries()
    categories, kana, missing = collect_terms(entries)
    index_text = render_index_markdown(categories, kana)
    save_outputs(index_text, categories, kana)
    save_missing_readings(missing)


if __name__ == "__main__":
    main()
