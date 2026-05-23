import os
import json
from bs4 import BeautifulSoup
import re

# Configuration
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '../out')
CONTENT_DIR = os.path.join(OUTPUT_DIR, 'content')
ASSETS_DIR = os.path.join(OUTPUT_DIR, 'assets')
INDEX_OUTPUT_PATH = os.path.join(ASSETS_DIR, 'search-index.json')

def clean_text(text):
    """Removes extra whitespace."""
    return re.sub(r'\s+', ' ', text).strip()

def build_search_index():
    print("Building search index...")

    if not os.path.exists(CONTENT_DIR):
        print(f"Content directory not found: {CONTENT_DIR}")
        return

    pages = []

    # 1. Index Main Page (index.html)
    index_html_path = os.path.join(OUTPUT_DIR, 'index.html')
    if os.path.exists(index_html_path):
        try:
            with open(index_html_path, 'r', encoding='utf-8') as f:
                soup = BeautifulSoup(f, 'html.parser')
                main_content = soup.select_one('main')
                if main_content:
                    text = clean_text(main_content.get_text())
                    title = soup.title.string if soup.title else "Home"
                    pages.append({
                        "url": "index.html",
                        "title": title,
                        "content": text,
                        "chapter": "Front"
                    })
        except Exception as e:
            print(f"Error processing index.html: {e}")

    # 2. Index Content Pages
    for filename in sorted(os.listdir(CONTENT_DIR)):
        if not filename.endswith('.html'):
            continue

        filepath = os.path.join(CONTENT_DIR, filename)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                soup = BeautifulSoup(f, 'html.parser')

                # Extract main content
                main_content = soup.select_one('main')
                if not main_content:
                    continue

                # Remove non-content elements
                for trash in main_content.select('script, style, nav, .header-ui'):
                    trash.decompose()

                text = clean_text(main_content.get_text())

                # Determine title
                title = filename
                h1 = soup.select_one('h1')
                if h1:
                    title = clean_text(h1.get_text())
                elif soup.title:
                    title = soup.title.string

                # Determine Chapter (rudimentary based on filename)
                chapter = "Chapter"
                if "ch" in filename:
                    chapter = f"Chapter {filename.split('_')[0]}"
                elif "col" in filename:
                    chapter = "Column"

                pages.append({
                    "url": f"content/{filename}",
                    "title": title,
                    "content": text,
                    "chapter": chapter
                })

        except Exception as e:
            print(f"Error processing {filename}: {e}")

    # Ensure assets dir exists
    if not os.path.exists(ASSETS_DIR):
        os.makedirs(ASSETS_DIR, exist_ok=True)

    # Write JSON
    with open(INDEX_OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump({"pages": pages}, f, ensure_ascii=False, indent=None) # Compact JSON

    print(f"Search index built: {len(pages)} pages indexed to {INDEX_OUTPUT_PATH}")

if __name__ == "__main__":
    build_search_index()
