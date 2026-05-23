#!/usr/bin/env python3
"""
parse_raildata.py
=================
Pass 1のLaTeXコンパイルで生成される .raildata ファイルを解析し、
Pass 2で使用する rail-computed.tex を生成する。

入力形式 (.raildata):
    CHAPTER:<page>:<type>
    SECTION:<page>
    HIDE:<page>
    TOTALPAGE:<page>

出力形式 (rail-computed.tex):
    LaTeXマクロ定義
"""

import sys
import re
from pathlib import Path
from typing import List, Tuple, Dict


def parse_raildata(filepath: Path) -> Dict:
    """
    .raildataファイルを解析してデータ構造を返す。

    マーカーの種類:
    - 型付きマーカー (Luaフィルタ由来): CHAPTER:<page>:<type>:<index>
      type は chapter / special / hide / references / index
    - 生マーカー (LaTeX \\pretocmd{\\chapter} フック由来): CHAPTER:<page>
    - SECTION:<page>[:<chapter_index>]
    - HIDE:<page>
    - TOTALPAGE:<page>

    型付きマーカーを優先し、同一ページの生マーカーは無視する。
    """
    data = {
        'total_pages': 0,
        'chapters': [],      # [(page, type), ...]
        'sections': [],      # [page, ...]
        'hide_pages': set(), # {page, ...}
    }

    if not filepath.exists():
        print(f"警告: {filepath} が見つかりません", file=sys.stderr)
        return data

    # Collect typed and raw markers separately
    typed_chapters: List[Tuple[int, str]] = []   # (page, type) from Lua filter
    raw_chapter_pages: List[int] = []             # page from LaTeX hook

    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue

            if line.startswith('CHAPTER:'):
                parts = line.split(':')
                page = int(parts[1])

                if len(parts) >= 3 and parts[2].isalpha():
                    # Typed marker: CHAPTER:<page>:<type>[:<index>]
                    chap_type = parts[2]
                    typed_chapters.append((page, chap_type))
                else:
                    # Raw marker: CHAPTER:<page>
                    raw_chapter_pages.append(page)

            elif line.startswith('SECTION:'):
                parts = line.split(':')
                if len(parts) >= 2:
                    page = int(parts[1])
                    data['sections'].append(page)

            elif line.startswith('HIDE:'):
                parts = line.split(':')
                if len(parts) >= 2:
                    page = int(parts[1])
                    data['hide_pages'].add(page)

            elif line.startswith('TOTALPAGE:'):
                parts = line.split(':')
                if len(parts) >= 2:
                    data['total_pages'] = int(parts[1])

    # --- Merge typed + raw markers, deduplicating by page ---
    typed_pages = set(p for p, _ in typed_chapters)
    merged: Dict[int, str] = {}

    # Typed markers take priority
    for page, chap_type in typed_chapters:
        if page not in merged:
            merged[page] = chap_type

    # Raw markers: only add if no typed marker exists on the same page
    for page in raw_chapter_pages:
        if page not in merged:
            merged[page] = 'raw'

    # Sort by page and deduplicate
    sorted_chapters = sorted(merged.items(), key=lambda x: x[0])

    print(f"DEBUG: Found {len(sorted_chapters)} unique chapter markers:")
    for page, ctype in sorted_chapters:
        print(f"  page {page}: {ctype}")

    # --- Assign types to remaining 'raw' markers ---
    # Raw markers lack type info. Infer types from _quarto.yml chapter list.
    # Each chapter in _quarto.yml generates one \chapter command, so the
    # positional order of sorted_chapters matches the _quarto.yml order.
    raw_count = sum(1 for _, t in sorted_chapters if t == 'raw')
    if raw_count > 0:
        expected_types = _load_chapter_types_from_quarto(filepath.parent)
        if expected_types:
            print(f"DEBUG: Expected chapter types from _quarto.yml: {expected_types}")
            resolved: List[Tuple[int, str]] = []
            for i, (page, ctype) in enumerate(sorted_chapters):
                if ctype != 'raw':
                    # Keep typed marker as-is
                    resolved.append((page, ctype))
                elif i < len(expected_types):
                    resolved.append((page, expected_types[i]))
                else:
                    resolved.append((page, 'special'))
            sorted_chapters = resolved
        else:
            sorted_chapters = [(p, t if t != 'raw' else 'special') for p, t in sorted_chapters]
    else:
        sorted_chapters = list(sorted_chapters)

    data['chapters'] = sorted_chapters

    # TOTALPAGE が欠落/過小でも、収集済みマーカーの最大ページを下限にする。
    # これにより partial build 後の rail-computed が負の章長を持つことを防ぐ。
    marker_pages: List[int] = []
    marker_pages.extend([p for p, _ in sorted_chapters])
    marker_pages.extend(data['sections'])
    marker_pages.extend(list(data['hide_pages']))
    if marker_pages:
        inferred_total = max(marker_pages)
        if data['total_pages'] < inferred_total:
            print(
                f"DEBUG: Adjust total_pages {data['total_pages']} -> {inferred_total} "
                "(from marker max)"
            )
            data['total_pages'] = inferred_total

    return data


def _classify_filename(filename: str) -> str:
    """Classify a chapter filename into rail type (same logic as Lua filter)."""
    base = Path(filename).name.lower()

    hide_files = {
        "index.qmd", "00_front.md", "90_afterword.md",
        "99_advertisement.qmd",
    }
    if base in hide_files:
        return "hide"

    if base.startswith("95_references"):
        return "references"
    if base.startswith("96_index"):
        return "index"
    if re.match(r'^\d\d_ch\d\d', base):
        return "chapter"

    # TOC, fullpage images, etc.
    return "special"


def _load_chapter_types_from_quarto(project_dir: Path) -> List[str]:
    """Read _quarto.yml from project_dir and return ordered list of chapter types.

    Only returns types for chapters that generate \\chapter commands
    (i.e. the ones listed under book.chapters in _quarto.yml).
    """
    quarto_path = project_dir / '_quarto.yml'
    if not quarto_path.exists():
        return []

    try:
        with open(quarto_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Simple line-by-line parsing to extract chapters list
        # (avoids requiring a YAML library)
        in_chapters = False
        chapters: List[str] = []
        for line in content.split('\n'):
            stripped = line.strip()
            if stripped == 'chapters:':
                in_chapters = True
                continue
            if in_chapters:
                if stripped.startswith('- '):
                    chapters.append(stripped[2:].strip())
                elif stripped and not stripped.startswith('#'):
                    break  # End of chapters list

        return [_classify_filename(ch) for ch in chapters]
    except Exception as e:
        print(f"⚠ _quarto.yml 読み込みエラー: {e}", file=sys.stderr)
        return []



def compute_chapter_ranges(data: Dict) -> List[Dict]:
    """
    各チャプターのページ範囲を計算
    """
    chapters = []
    visible_chapters = [(p, t) for p, t in data['chapters'] if t in ('chapter', 'references', 'index')]
    
    for i, (start_page, chap_type) in enumerate(visible_chapters):
        # 次のチャプターの開始ページ、またはドキュメント終端
        if i + 1 < len(visible_chapters):
            end_page = visible_chapters[i + 1][0] - 1
        else:
            end_page = data['total_pages']

        # 不整合データでも負の範囲を作らない
        if end_page < start_page:
            end_page = start_page

        page_count = end_page - start_page + 1
        
        chapters.append({
            'index': i + 1,
            'start': start_page,
            'end': end_page,
            'count': page_count,
            'type': chap_type,
        })
    
    return chapters


def compute_section_info(data: Dict, chapters: List[Dict]) -> List[Dict]:
    """
    各セクションの情報を計算（どの章に属するか含む）
    """
    sections = []
    
    for page in sorted(data['sections']):
        # このセクションが属する章を探す
        chapter_idx = 0
        for chap in chapters:
            if chap['start'] <= page <= chap['end']:
                chapter_idx = chap['index']
                break
        
        sections.append({
            'page': page,
            'chapter': chapter_idx,
        })
    
    return sections


def generate_tex(data: Dict, chapters: List[Dict], sections: List[Dict], output_path: Path):
    """
    LaTeXマクロ定義ファイルを生成
    """
    lines = [
        "% rail-computed.tex",
        "% Generated by parse_raildata.py - DO NOT EDIT MANUALLY",
        "% Navigation Rail System computed values",
        "",
        f"\\def\\RailTotalPages{{{data['total_pages']}}}",
        f"\\def\\RailChapterCount{{{len(chapters)}}}",
        "",
        "% Chapter definitions: \\RailChapter<N>{start}{end}{pagecount}{type}",
    ]
    
    for chap in chapters:
        lines.append(
            f"\\expandafter\\def\\csname RailChapter{chap['index']}Start\\endcsname{{{chap['start']}}}"
        )
        lines.append(
            f"\\expandafter\\def\\csname RailChapter{chap['index']}End\\endcsname{{{chap['end']}}}"
        )
        lines.append(
            f"\\expandafter\\def\\csname RailChapter{chap['index']}Count\\endcsname{{{chap['count']}}}"
        )
        lines.append(
            f"\\expandafter\\def\\csname RailChapter{chap['index']}Type\\endcsname{{{chap['type']}}}"
        )
    
    lines.append("")
    lines.append(f"\\def\\RailSectionCount{{{len(sections)}}}")
    lines.append("% Section definitions: page, belonging chapter")
    
    for i, sec in enumerate(sections, 1):
        lines.append(
            f"\\expandafter\\def\\csname RailSection{i}Page\\endcsname{{{sec['page']}}}"
        )
        lines.append(
            f"\\expandafter\\def\\csname RailSection{i}Chapter\\endcsname{{{sec['chapter']}}}"
        )
    
    # 非表示ページ範囲（簡易的に最初と最後のHIDEページを記録）
    hide_pages = sorted(data['hide_pages'])
    if hide_pages:
        lines.append("")
        lines.append(f"\\def\\RailHideStart{{{min(hide_pages)}}}")
        lines.append(f"\\def\\RailHideEnd{{{max(hide_pages)}}}")
    else:
        lines.append("")
        lines.append("\\def\\RailHideStart{0}")
        lines.append("\\def\\RailHideEnd{0}")
    
    lines.append("")
    lines.append("% End of rail-computed.tex")
    
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    
    print(f"✓ Generated: {output_path}")
    print(f"  Total pages: {data['total_pages']}")
    print(f"  Chapters: {len(chapters)}")
    print(f"  Sections: {len(sections)}")


def main():
    if len(sys.argv) < 3:
        print("Usage: parse_raildata.py <input.raildata> <output.tex>")
        sys.exit(1)
    
    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    
    print(f"Parsing: {input_path}")
    data = parse_raildata(input_path)
    
    if data['total_pages'] == 0:
        print("警告: 総ページ数が0です。Pass 1が正常に完了していない可能性があります。", file=sys.stderr)
    
    chapters = compute_chapter_ranges(data)
    sections = compute_section_info(data, chapters)
    
    generate_tex(data, chapters, sections, output_path)


if __name__ == "__main__":
    main()
