from __future__ import annotations


def next_chapter_id(chapters: list[dict]) -> str:
    existing_ids = [
        int(ch["id"].replace("ch_", ""))
        for ch in chapters
        if ch.get("id", "").startswith("ch_")
        and ch["id"].replace("ch_", "").isdigit()
    ]
    return f"ch_{(max(existing_ids) + 1) if existing_ids else 1:03d}"
