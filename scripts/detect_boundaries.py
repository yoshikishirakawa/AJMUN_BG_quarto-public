#!/usr/bin/env python3
"""
Detect page boundary paragraphs from existing page mapping.

After Pass 1 of PDF build, this script:
1. Reads the paragraph-to-page mapping from pdf-page-map.json
2. Identifies paragraphs that span page boundaries
3. Generates a boundary paragraph list for the Lua filter

Output: boundary-paragraphs.json with list of paragraph IDs that need chunk splitting
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Set


def detect_boundaries(page_mapping: Dict) -> List[Dict[str, any]]:
    """
    Detect paragraphs that span page boundaries.

    A paragraph is considered a boundary paragraph if:
    - It's the last paragraph on page N
    - The next paragraph is on page N+1

    Returns list of boundary info dicts.
    """
    paragraphs = page_mapping.get("paragraphs", {})
    if not paragraphs:
        return []

    # Group paragraphs by page, preserving order
    pages_to_paras: Dict[int, List[str]] = {}
    for para_id, page_num in sorted(paragraphs.items(), key=lambda x: int(x[0].split('-')[1])):
        if page_num not in pages_to_paras:
            pages_to_paras[page_num] = []
        pages_to_paras[page_num].append(para_id)

    # Sort pages and find boundaries
    sorted_pages = sorted(pages_to_paras.keys())

    boundary_paras: Set[str] = set()
    boundary_info = []

    for i in range(len(sorted_pages) - 1):
        current_page = sorted_pages[i]
        next_page = sorted_pages[i + 1]

        # Only boundary if adjacent pages (skip if there's a gap)
        if next_page != current_page + 1:
            continue

        current_paras = pages_to_paras[current_page]
        next_paras = pages_to_paras[next_page]

        if current_paras and next_paras:
            # Last para on current page and first para on next page
            last_para_current = current_paras[-1]
            first_para_next = next_paras[0]

            boundary_paras.add(last_para_current)
            boundary_paras.add(first_para_next)

            boundary_info.append({
                "pageNumber": next_page,
                "beforeParagraph": last_para_current,
                "afterParagraph": first_para_next,
                "pageBefore": current_page,
                "pageAfter": next_page
            })

    return boundary_info


def main():
    if len(sys.argv) < 2:
        # Default paths
        project_root = Path(__file__).parent.parent
        mapping_path = project_root / "out" / "assets" / "pdf-page-map.json"
        output_path = project_root / "out" / "assets" / "boundary-paragraphs.json"
    else:
        mapping_path = Path(sys.argv[1])
        output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("boundary-paragraphs.json")

    # Load page mapping
    if not mapping_path.exists():
        print(f"Error: Page mapping not found: {mapping_path}", file=sys.stderr)
        sys.exit(1)

    page_mapping = json.loads(mapping_path.read_text(encoding='utf-8'))

    # Detect boundaries
    boundaries = detect_boundaries(page_mapping)

    # Create output with boundary paragraph IDs
    result = {
        "totalPages": page_mapping.get("totalPages", 0),
        "boundaryParagraphs": sorted(set(
            [b["beforeParagraph"] for b in boundaries] +
            [b["afterParagraph"] for b in boundaries]
        )),
        "boundaries": boundaries
    }

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')

    print(f"✓ Boundary detection complete:")
    print(f"  Total pages: {result['totalPages']}")
    print(f"  Boundaries found: {len(boundaries)}")
    print(f"  Boundary paragraphs: {len(result['boundaryParagraphs'])}")
    print(f"  Output: {output_path}")

    # Also write a simple text file for Lua filter to read easily
    txt_path = output_path.with_suffix('.txt')
    txt_content = '\n'.join(result['boundaryParagraphs'])
    txt_path.write_text(txt_content, encoding='utf-8')
    print(f"  Text list: {txt_path}")


if __name__ == "__main__":
    main()
