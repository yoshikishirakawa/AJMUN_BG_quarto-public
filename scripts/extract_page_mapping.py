#!/usr/bin/env python3
"""
Extract PDF page mapping from LaTeX .aux file.
Generates a JSON file mapping paragraph IDs to PDF page numbers.
"""

import re
import json
import sys
from pathlib import Path

def extract_page_mapping(aux_path: Path, output_path: Path) -> dict:
    """
    Extract paragraph ID to page number mapping from .aux file.
    
    The .aux file contains entries like:
    \\newlabel{p-123}{{}{45}{}{...}{}}  (paragraphs)
    \\newlabel{sec-123}{{}{45}{}{...}{}}  (sections)
    where 45 is the page number.
    """
    paragraphs = {}
    sections = {}
    total_pages = 0
    
    if not aux_path.exists():
        print(f"Warning: .aux file not found: {aux_path}", file=sys.stderr)
        return {"totalPages": 0, "paragraphs": {}, "sections": {}}
    
    content = aux_path.read_text(encoding='utf-8', errors='ignore')
    
    # Pattern to match paragraph labels: \newlabel{p-N}{{...}{PAGE}{...}}
    para_pattern = r'\\newlabel\{(p-\d+)\}\{\{[^}]*\}\{(\d+)\}'
    para_matches = re.findall(para_pattern, content)
    
    for para_id, page_str in para_matches:
        try:
            page = int(page_str)
            paragraphs[para_id] = page
            if page > total_pages:
                total_pages = page
        except ValueError:
            continue
    
    # Pattern to match section labels: \newlabel{sec-N}{{...}{PAGE}{...}}
    sec_pattern = r'\\newlabel\{(sec-\d+)\}\{\{[^}]*\}\{(\d+)\}'
    sec_matches = re.findall(sec_pattern, content)
    
    for sec_id, page_str in sec_matches:
        try:
            page = int(page_str)
            sections[sec_id] = page
            if page > total_pages:
                total_pages = page
        except ValueError:
            continue
    
    # Also try alternative pattern for hyperref-style labels
    alt_pattern = r'\\newlabel\{(p-\d+|sec-\d+)\}\{\{\}\{(\d+)\}'
    alt_matches = re.findall(alt_pattern, content)
    
    for label_id, page_str in alt_matches:
        try:
            page = int(page_str)
            if label_id.startswith('p-') and label_id not in paragraphs:
                paragraphs[label_id] = page
            elif label_id.startswith('sec-') and label_id not in sections:
                sections[label_id] = page
            if page > total_pages:
                total_pages = page
        except ValueError:
            continue
    
    result = {
        "totalPages": total_pages,
        "paragraphs": paragraphs,
        "sections": sections
    }
    
    # Write JSON output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding='utf-8')
    
    # Also write JS output for inline loading (file:// compatibility)
    js_output_path = output_path.with_suffix('.js')
    js_content = f"window.pdfPageMapping = {json.dumps(result, ensure_ascii=False)};"
    js_output_path.write_text(js_content, encoding='utf-8')
    
    print(f"✓ Page mapping extracted: {len(paragraphs)} paragraphs, {len(sections)} sections, {total_pages} pages")
    print(f"  JSON: {output_path}")
    print(f"  JS: {js_output_path}")
    
    return result


def main():
    if len(sys.argv) < 2:
        # Default paths
        project_root = Path(__file__).parent.parent
        aux_path = project_root / "index.aux"
        output_path = project_root / "out" / "assets" / "pdf-page-map.json"
    else:
        aux_path = Path(sys.argv[1])
        output_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("pdf-page-map.json")
    
    extract_page_mapping(aux_path, output_path)


if __name__ == "__main__":
    main()
