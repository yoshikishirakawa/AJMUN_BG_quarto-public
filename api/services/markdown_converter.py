import re
from typing import Dict, List, Optional, Callable, Any

class MarkdownConverterService:
    """
    Google Docs JSON structure to Markdown converter.
    Ported from tools/editor/gdoc_service.py with improvements.
    """
    def __init__(self, image_downloader: Optional[Callable[[str, str, str], Optional[str]]] = None, rules: List[Dict[str, str]] = None):
        """
        Args:
            image_downloader: A callback function (content_uri, doc_id, image_id) -> local_path
                             that downloads the image and returns the relative path to be used in Markdown.
            rules: List of custom replacement rules [{'pattern': 'regex', 'replacement': 'str'}]
        """
        self.footnotes: Dict[str, Any] = {}
        self.used_footnote_ids: List[str] = []
        self.inline_objects: Dict[str, Any] = {}
        self.doc_id: str = ""
        self.image_downloader = image_downloader
        self.rules = rules or []

    def convert(self, document_json: Dict[str, Any]) -> str:
        """
        Converts a Google Docs JSON object into Markdown content.
        """
        self.doc_id = document_json.get('documentId', '')
        content = document_json.get('body', {}).get('content', [])
        self.inline_objects = document_json.get('inlineObjects', {})
        self.footnotes = document_json.get('footnotes', {})
        self.used_footnote_ids = []

        md_lines = []

        for element in content:
            if 'paragraph' in element:
                md_lines.append(self._process_paragraph(element['paragraph']))
            elif 'table' in element:
                md_lines.append(self._process_table(element['table']))
            elif 'sectionBreak' in element:
                # Handle section breaks if necessary (e.g., simplified page break)
                pass

        # Append Footnotes at the bottom
        if self.used_footnote_ids and self.footnotes:
            md_lines.append("\n")
            for i, fid in enumerate(self.used_footnote_ids):
                # Map arbitrary Google Docs Footnote ID to [^N]
                f_content_list = self.footnotes.get(fid, {}).get('content', [])
                f_text = ""
                for el in f_content_list:
                    if 'paragraph' in el:
                        f_text += self._process_paragraph(el['paragraph']) + " "
                
                md_lines.append(f"[^{i+1}]: {f_text.strip()}")

        final_content = '\n\n'.join(filter(None, md_lines))
        
        # Apply custom rules
        return self._apply_custom_rules(final_content)

    def _apply_custom_rules(self, content: str) -> str:
        """Apply user-defined regex replacement rules."""
        if not self.rules:
            return content

        for rule in self.rules:
            pattern = rule.get('pattern')
            replacement = rule.get('replacement', '')
            if pattern:
                try:
                    # Using re.sub for regex replacement
                    # Note: Allows standard python regex
                    content = re.sub(pattern, replacement, content)
                except re.error as e:
                    # Log error or ignore invalid regex to prevent crash
                    print(f"Invalid regex rule '{pattern}': {e}")
                    pass
        return content

    def _process_paragraph(self, p: Dict[str, Any]) -> str:
        style = p.get('paragraphStyle', {}).get('namedStyleType', 'NORMAL_TEXT')
        elements = p.get('elements', [])

        text_content = ""
        for el in elements:
            if 'textRun' in el:
                text_content += self._process_text_run(el['textRun'])
            elif 'inlineObjectElement' in el:
                text_content += self._process_inline_object(el['inlineObjectElement'])
            elif 'footnoteReference' in el:
                fid = el['footnoteReference'].get('footnoteId')
                if fid:
                    if fid not in self.used_footnote_ids:
                        self.used_footnote_ids.append(fid)
                    idx = self.used_footnote_ids.index(fid) + 1
                    text_content += f"[^{idx}]"

        # Handle Lists
        if 'bullet' in p:
            nesting_level = p['bullet'].get('nestingLevel', 0)
            # Use 2 spaces for indentation
            prefix = '  ' * nesting_level + '- '
            return prefix + text_content.strip()

        # Handle Headings
        if style == 'HEADING_1':
            return f"# {text_content.strip()}"
        elif style == 'HEADING_2':
            return f"## {text_content.strip()}"
        elif style == 'HEADING_3':
            return f"### {text_content.strip()}"
        elif style == 'HEADING_4':
            return f"#### {text_content.strip()}"
        elif style == 'HEADING_5':
            return f"##### {text_content.strip()}"
        elif style == 'HEADING_6':
            return f"###### {text_content.strip()}"

        return text_content.strip()

    def _process_text_run(self, text_run: Dict[str, Any]) -> str:
        content = text_run.get('content', '')
        style = text_run.get('textStyle', {})

        # Remove trailing newline from GDoc paragraphs to avoid breaking inline syntax
        if content.endswith('\n'):
            content = content[:-1]

        # Handle formatting
        if style.get('bold'):
            content = f"**{content}**"
        if style.get('italic'):
            content = f"*{content}*"
        if style.get('strikethrough'):
            content = f"~~{content}~~"
        if style.get('underline'):
            # Use HTML for underline as Markdown doesn't support it natively
            content = f"<u>{content}</u>"

        # Handle links
        link = style.get('link', {})
        if link.get('url'):
            content = f"[{content}]({link['url']})"

        # NOTE: We do NOT escape characters here because users may write
        # raw Markdown/LaTeX-like syntax (e.g. \index{...}) directly in Google Docs.
        
        return content

    def _process_inline_object(self, inline_obj_el: Dict[str, Any]) -> str:
        obj_id = inline_obj_el.get('inlineObjectId')
        if not obj_id or obj_id not in self.inline_objects:
            return ""

        embedded_obj = self.inline_objects[obj_id].get('inlineObjectProperties', {}).get('embeddedObject', {})
        image_props = embedded_obj.get('imageProperties', {})
        content_uri = image_props.get('contentUri')

        if content_uri and self.image_downloader:
            # Download image via callback
            # We pass doc_id and obj_id to create a unique filename/path
            saved_path = self.image_downloader(content_uri, self.doc_id, obj_id)
            if saved_path:
                # Use custom \image command for project specific requirement, or standard md
                # Based on gdoc_service.py: return f"\\image{{{saved_path}}}{{width=80%}}"
                return f"\\image{{{saved_path}}}{{width=80%}}"
            
            # Fallback to standard markdown if downloader returns path but maybe different format?
            # Or just return empty if failed.

        return "[IMAGE_NOT_FOUND]"

    def _process_table(self, table: Dict[str, Any]) -> str:
        rows = table.get('tableRows', [])
        if not rows:
            return ""

        md_table = []

        # Process rows
        for i, row in enumerate(rows):
            cells = row.get('tableCells', [])
            row_content = []
            for cell in cells:
                cell_text = ""
                for content_el in cell.get('content', []):
                    if 'paragraph' in content_el:
                        cell_text += self._process_paragraph(content_el['paragraph']) + " "
                row_content.append(cell_text.strip())

            md_table.append("| " + " | ".join(row_content) + " |")

            # Add separator after header (first row)
            if i == 0:
                md_table.append("| " + " | ".join(["---"] * len(cells)) + " |")

        return "\n".join(md_table)
