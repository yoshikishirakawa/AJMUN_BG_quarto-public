import re
from pathlib import Path

def main():
    # Project root is parent of scripts dir
    project_root = Path(__file__).parent.parent
    content_dir = project_root / "content"
    
    print(f"Scanning directory: {content_dir}")

    # Targets: .md and .qmd
    files = list(content_dir.glob("*.md")) + list(content_dir.glob("*.qmd"))
    
    # Pattern:
    # ^(\s*(?:[-*+]|\d+\.)\s+.*?)(\s{2,})$
    # Group 1: List marker and content
    # Group 2: Trailing 2+ spaces
    # We only match lines that start with a list marker.
    pattern = re.compile(r'^(\s*(?:[-*+]|\d+\.)\s+.*?)(\s{2,})$')

    count = 0
    for file_path in files:
        try:
            original_text = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            print(f"Skipping binary or non-utf8 file: {file_path.name}")
            continue
            
        lines = original_text.splitlines(keepends=True)
        new_lines = []
        modified = False
        
        for line in lines:
            # Strip trailing newline for regex match
            line_content = line.rstrip('\n\r')
            newline_char = line[len(line_content):]
            
            match = pattern.match(line_content)
            if match:
                # Found list item with trailing spaces
                # Reconstruct without trailing spaces
                cleaned = match.group(1) + newline_char
                new_lines.append(cleaned)
                modified = True
            else:
                new_lines.append(line)
                
        if modified:
            file_path.write_text("".join(new_lines), encoding="utf-8")
            print(f"Cleaned: {file_path.name}")
            count += 1
            
    print(f"Processing complete. Total files cleaned: {count}")

if __name__ == "__main__":
    main()
