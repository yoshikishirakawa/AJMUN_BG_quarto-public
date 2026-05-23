#!/usr/bin/env python3
"""
Post-process LaTeX file to convert index hyperref links to pageref format.
This script transforms:
  \hyperref[idx-xxx]{章節参照}
to:
  \hyperlink{idx-xxx}{p.\pageref*{idx-xxx}}

Only in the index section (between \chapter{索引} and \end{multicols}).
"""

import re
import sys
from pathlib import Path

def process_index_links(tex_content: str) -> str:
    """Process hyperref links in index section to use pageref."""
    
    # Find index section boundaries
    index_start_pattern = r'\\chapter\{索引\}'
    multicols_end_pattern = r'\\end\{multicols\}'
    
    # Split content at index chapter
    parts = re.split(f'({index_start_pattern})', tex_content, maxsplit=1)
    if len(parts) != 3:
        print("Warning: Index chapter not found", file=sys.stderr)
        return tex_content
    
    before_index = parts[0]
    index_marker = parts[1]
    after_index_start = parts[2]
    
    # Find end of index section (end{multicols})
    end_match = re.search(multicols_end_pattern, after_index_start)
    if not end_match:
        print("Warning: end{multicols} not found after index", file=sys.stderr)
        return tex_content
    
    index_content = after_index_start[:end_match.end()]
    after_index = after_index_start[end_match.end():]
    
    # Transform hyperref links in index content
    # Pattern: \hyperref[idx-...]{...}
    def replace_hyperref(match):
        anchor = match.group(1)
        # Only process idx- anchors (index anchors)
        if anchor.startswith('idx-'):
            return f'\\hyperlink{{{anchor}}}{{p.\\pageref*{{{anchor}}}}}'
        return match.group(0)  # Keep original for non-index links
    
    hyperref_pattern = r'\\hyperref\[([^\]]+)\]\{[^}]+\}'
    transformed_index = re.sub(hyperref_pattern, replace_hyperref, index_content)
    
    # Count replacements
    original_count = len(re.findall(hyperref_pattern, index_content))
    new_count = len(re.findall(r'\\pageref\*\{idx-', transformed_index))
    
    print(f"Index post-processing: {new_count} hyperref -> pageref conversions", file=sys.stderr)
    
    return before_index + index_marker + transformed_index + after_index


def main():
    if len(sys.argv) < 2:
        print("Usage: python postprocess_index.py <file.tex>", file=sys.stderr)
        sys.exit(1)
    
    tex_path = Path(sys.argv[1])
    if not tex_path.exists():
        print(f"Error: File not found: {tex_path}", file=sys.stderr)
        sys.exit(1)
    
    content = tex_path.read_text(encoding='utf-8')
    processed = process_index_links(content)
    tex_path.write_text(processed, encoding='utf-8')
    print(f"Processed: {tex_path}")


if __name__ == "__main__":
    main()
