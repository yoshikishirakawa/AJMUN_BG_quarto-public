#!/usr/bin/env python3
"""
Fix empty src attributes in HTML files for PWA compatibility.

This script replaces empty src="" attributes in img tags with a transparent
SVG data URI to prevent workbox from trying to fetch invalid resources.
"""

import re
import sys
from pathlib import Path

# Transparent 1x1 SVG as data URI
PLACEHOLDER_SRC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"

def fix_empty_src_in_file(html_path: Path) -> int:
    """
    Fix empty src attributes in a single HTML file.
    
    Args:
        html_path: Path to the HTML file
        
    Returns:
        Number of replacements made
    """
    try:
        content = html_path.read_text(encoding='utf-8')
        original_content = content
        
        # Pattern to match <img src="" ...> with optional data-asset attribute
        # This handles various attribute orders and whitespace
        pattern = r'(<img\s+[^>]*?)src=""(\s+[^>]*?>)'
        
        # Replace empty src with placeholder
        content = re.sub(
            pattern,
            rf'\1src="{PLACEHOLDER_SRC}"\2',
            content,
            flags=re.IGNORECASE | re.DOTALL
        )
        
        # Count replacements
        replacements = len(re.findall(pattern, original_content, flags=re.IGNORECASE | re.DOTALL))
        
        if replacements > 0:
            html_path.write_text(content, encoding='utf-8')
            print(f"  ✓ {html_path.relative_to(html_path.parents[1])}: {replacements} replacement(s)")
        
        return replacements
        
    except Exception as e:
        print(f"  ✗ Error processing {html_path}: {e}", file=sys.stderr)
        return 0

def main():
    """Main entry point."""
    # Get the project root (parent of scripts directory)
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    out_dir = project_root / 'out'
    
    if not out_dir.exists():
        print(f"Error: Output directory not found: {out_dir}", file=sys.stderr)
        sys.exit(1)
    
    print("Fixing empty src attributes in HTML files...")
    
    # Find all HTML files in out directory
    html_files = list(out_dir.rglob('*.html'))
    
    if not html_files:
        print("Warning: No HTML files found in out directory")
        return
    
    total_replacements = 0
    files_modified = 0
    
    for html_file in sorted(html_files):
        replacements = fix_empty_src_in_file(html_file)
        if replacements > 0:
            total_replacements += replacements
            files_modified += 1
    
    print(f"\nSummary:")
    print(f"  Files scanned: {len(html_files)}")
    print(f"  Files modified: {files_modified}")
    print(f"  Total replacements: {total_replacements}")
    
    if total_replacements > 0:
        print("\n✓ Empty src attributes fixed successfully")
    else:
        print("\n✓ No empty src attributes found")

if __name__ == '__main__':
    main()
