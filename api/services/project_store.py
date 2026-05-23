"""
Project Store Service
"""
import json
import aiofiles
import os
import shutil
from pathlib import Path
from datetime import date, datetime, timezone
from typing import Optional, List, Dict, Any
from ruamel.yaml import YAML
from enum import Enum

from api.services.file_safety import resolve_content_markdown_path


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_date_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def json_default(value: Any) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return value.isoformat()
    raise TypeError(f"Object of type {value.__class__.__name__} is not JSON serializable")


class ChapterType(str, Enum):
    DOCUMENT = "document"
    IMAGE_GROUP = "image_group"
    FULLPAGE_IMAGE = "fullpage_image"

class ProjectStore:
    """Service for storing and loading project configuration."""
    
    def __init__(self):
        self.project_root = Path(__file__).parent.parent.parent
        self.config_path = self.project_root / ".bgproject.json"
        self.quarto_yml = self.project_root / "_quarto.yml"
        
        self.yaml = YAML()
        self.yaml.preserve_quotes = True
    
    async def load(self) -> dict:
        """
        Load project configuration.
        """
        if not self.config_path.exists():
            return await self._init_from_quarto()
        
        async with aiofiles.open(self.config_path, "r", encoding="utf-8") as f:
            content = await f.read()
            project = json.loads(content)

        return await self._refresh_from_quarto_if_needed(project)
    
    async def save(self, project: dict):
        """
        Save project configuration and sync to _quarto.yml.
        """
        for chapter in project.get("chapters", []):
            if chapter.get("localPath"):
                resolve_content_markdown_path(self.project_root, chapter["localPath"])

        project["updatedAt"] = utc_now_iso()
        
        # Atomic write: save to .tmp first, then rename
        tmp_path = self.config_path.with_suffix(".json.tmp")
        async with aiofiles.open(tmp_path, "w", encoding="utf-8") as f:
            await f.write(json.dumps(project, indent=2, ensure_ascii=False, default=json_default))
            await f.flush()
            
        os.replace(tmp_path, self.config_path)

        # Check for Image Groups and regenerate their .qmd files
        await self._regenerate_image_groups(project)
            
        # Sync to _quarto.yml
        await self._sync_to_quarto(project)

    async def sync_quarto_yml(self, chapters: List[Dict]):
        """
        Sync chapter ordering to _quarto.yml using provided chapter list.
        """
        project = await self.load()
        project["chapters"] = chapters
        await self._sync_to_quarto(project)

    async def _regenerate_image_groups(self, project: dict):
        """
        Regenerate .qmd files for all chapters of type 'image_group' or 'fullpage_image'.
        """
        for chapter in project.get("chapters", []):
            ch_type = chapter.get("type")
            images = chapter.get("images", [])

            if ch_type == ChapterType.IMAGE_GROUP:
                content = self._generate_image_qmd_content(images)
            elif ch_type == ChapterType.FULLPAGE_IMAGE:
                content = self._generate_fullpage_qmd_content(images)
            else:
                continue

            file_path = resolve_content_markdown_path(self.project_root, chapter["localPath"])
            # Ensure directory exists
            file_path.parent.mkdir(parents=True, exist_ok=True)
            async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
                await f.write(content)

    def _generate_image_qmd_content(self, images: List[Dict[str, str]]) -> str:
        """
        Generate Markdown content for an image group.
        """
        if not images:
            return "---\nformat: html\n---\n\n(No images)\n"
        
        lines = ["---", "format: html", "---", ""]
        
        for i, img in enumerate(images):
            path = img.get("path", "")
            # Ensure path starts with / if relative to project root, or handle standard markdown pathing
            if not path.startswith("/"):
                path = "/" + path
                
            # Use standard markdown image syntax
            lines.append(f"![]({path}){{width=100%}}")
            
            # Add clearpage between images for PDF (except the last one? or always?)
            # Usually better to have clearpage to ensure 1 image per page if intended.
            if i < len(images) - 1:
                lines.append("\\clearpage")
                lines.append("")
                
        return "\n".join(lines)

    def _generate_fullpage_qmd_content(self, images: List[Dict[str, Any]]) -> str:
        """
        Generate Markdown content for a full-page image chapter.
        Creates .fullpage-image formatted images with proper attributes.
        """
        if not images:
            return "---\nformat:\n  html: default\n  pdf: default\n---\n\n(No images)\n"

        lines = ["---", "format:", "  html: default", "  pdf: default", "---", ""]

        for img in images:
            path = img.get("path", "")
            width = img.get("width", "a4")
            fit = img.get("fit", "stretch")
            position = img.get("position", "center")

            # Build attributes string
            attrs = [".fullpage-image"]
            attrs.append(f'width="{width}"')
            attrs.append(f'fit="{fit}"')
            attrs.append(f'position="{position}"')

            lines.append(f"![]({path}){{{' '.join(attrs)}}}")
            lines.append("")  # Blank line between images

        return "\n".join(lines)

    def _read_quarto_config_sync(self) -> Dict:
        """Synchronously read _quarto.yml using ruamel.yaml"""
        if not self.quarto_yml.exists():
            return {}
        with open(self.quarto_yml, 'r', encoding='utf-8') as f:
            return self.yaml.load(f) or {}

    def _ensure_toc_file(self):
        toc_path = self.project_root / "content" / "_toc.qmd"
        toc_path.parent.mkdir(parents=True, exist_ok=True)
        toc_content = (
            "---\n"
            "toc: false\n"
            "---\n\n"
            "# 目次 {.unnumbered}\n\n"
            "```{=latex}\n"
            "\\tableofcontents\n"
            "\\clearpage\n"
            "```\n"
        )
        with open(toc_path, "w", encoding="utf-8") as f:
            f.write(toc_content)

    def _write_pdf_homepage(self, content: str):
        """
        Ensure pdf_build/index.qmd is a regular file (not a symlink) and write content.

        We keep a dedicated PDF homepage so the HTML homepage (root index.qmd) can differ.
        """
        pdf_index_path = self.project_root / "pdf_build" / "index.qmd"
        pdf_index_path.parent.mkdir(parents=True, exist_ok=True)
        # If a previous setup created a symlink (e.g. to ../index.qmd), replace it.
        try:
            if pdf_index_path.is_symlink():
                pdf_index_path.unlink()
        except OSError:
            # If unlink fails, fall back to writing; worst case the caller will notice.
            pass
        with open(pdf_index_path, "w", encoding="utf-8") as f:
            f.write(content)

    def _ensure_pdf_tail_files(self):
        tail_dir = self.project_root / "pdf_build" / "content"
        tail_dir.mkdir(parents=True, exist_ok=True)
        tail_path = tail_dir / "_pdf_tail.tex"
        tail_content = "\\InsertTailFullPageImages\n"
        with open(tail_path, "w", encoding="utf-8") as f:
            f.write(tail_content)

    async def _init_from_quarto(self) -> dict:
        """
        Initialize .bgproject.json from _quarto.yml
        """
        # Note: calling sync IO in async method, but file is small.
        quarto_config = self._read_quarto_config_sync()
        
        book = quarto_config.get('book', {})
        metadata = {
            "name": book.get('title', 'Untitled Project'),
            "author": book.get('author', ''),
            "date": normalize_date_value(book.get('date', datetime.now().strftime('%Y-%m-%d'))),
            "description": ""
        }
        
        chapters = []
        # Handle simple list of strings in chapters
        q_chapters = book.get('chapters', [])
        q_appendices = book.get('appendices', [])

        # Combine chapters and appendices for the editor
        # Track chapter order index across both
        for idx, ch_path in enumerate(q_chapters + q_appendices):
            if isinstance(ch_path, str):
                chapters.append({
                    "id": f"ch_{idx:03d}",
                    "title": self._guess_title(ch_path),
                    "googleDocId": None,
                    "localPath": ch_path,
                    "order": idx,
                    "lastSync": None,
                    "enabled": True,
                    "type": "document", # Default to document
                    "images": [], # Empty for document
                    "isAppendix": idx >= len(q_chapters)  # Track if this is from appendices
                })
        
        default_data = {
            "version": "1.0",
            "metadata": metadata,
            "chapters": chapters,
            "style": {
                "primaryColor": "#1a73e8",
                "typography": {
                    "fontSize": 16,
                    "lineHeight": 1.6,
                    "letterSpacing": 0.05,
                    "headingScale": 1.2,
                    "fontFamilyMincho": "BIZ UDPMincho",
                    "fontFamilyGothic": "BIZ UDPGothic"
                },
                "layout": {
                    "paperSize": "a4",
                    "columns": 1,
                    "sidebar": True,
                    "margins": {"top": 30, "bottom": 25, "left": 25, "right": 25}
                },
                "paragraph": {
                    "indent": True,
                    "indentSize": 1,
                    "spacing": 0.8,
                    "justify": True
                },
                "visuals": {
                    "blockquoteStyle": "left-border",
                    "linkColor": "#1a73e8",
                    "codeBlockTheme": "github"
                },
                "pdf": {
                    "documentclass": "scrreprt",
                    "classoption": [],
                    "geometry": ["top=30mm", "left=25mm", "height=230mm"],
                    "mainfont": "Harano Aji Mincho",
                    "sansfont": "Harano Aji Gothic"
                },
                "html": {
                    "toc": True,
                    "numberSections": True,
                    "codeFold": True,
                    "theme": "cosmo"
                }
            },
            "buildOptions": {
                "cleanBuild": False,
                "syncBeforeBuild": False,
                "generateSingleHtml": False
            },
            "conversionRules": [],
            "lastBuildStatus": None, # success, failure
            "lastBuildTime": None,
            "lastSyncTime": None,
            "createdAt": utc_now_iso(),
            "updatedAt": utc_now_iso()
        }
        
        await self.save(default_data)
        return default_data

    async def _refresh_from_quarto_if_needed(self, project: dict) -> dict:
        """
        If _quarto.yml is newer than .bgproject.json, merge its structure back into
        the project store so builds reflect the latest raw config edits.
        """
        if not self.quarto_yml.exists() or not self.config_path.exists():
            return project

        try:
            if self.quarto_yml.stat().st_mtime <= self.config_path.stat().st_mtime:
                return project
        except OSError:
            return project

        merged = self._merge_project_with_quarto(project, self._read_quarto_config_sync())
        if merged != project:
            await self.save(merged)
            return merged
        return project

    def _merge_project_with_quarto(self, project: Dict[str, Any], quarto_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Merge chapter order/metadata from _quarto.yml into an existing project while
        preserving chapter-specific metadata for matching local paths.
        """
        book = quarto_config.get('book', {})
        q_chapters = book.get('chapters', [])
        q_appendices = book.get('appendices', [])
        chapter_paths = []
        for path in q_chapters + q_appendices:
            if not isinstance(path, str):
                continue
            name = Path(path).name.lower()
            if name in {"index.qmd", "index.md", "_toc.qmd"}:
                continue
            chapter_paths.append((path, path in q_appendices))

        existing_chapters = project.get("chapters", [])
        existing_by_path = {ch.get("localPath"): ch for ch in existing_chapters if ch.get("localPath")}
        existing_ids = {ch.get("id") for ch in existing_chapters if ch.get("id")}
        next_index = len(existing_ids)

        merged_chapters: List[Dict[str, Any]] = []
        order_ids: List[str] = []
        for order, (path, is_appendix) in enumerate(chapter_paths):
            existing = existing_by_path.get(path)
            if existing:
                chapter = dict(existing)
            else:
                while f"ch_{next_index:03d}" in existing_ids:
                    next_index += 1
                chapter_id = f"ch_{next_index:03d}"
                existing_ids.add(chapter_id)
                next_index += 1
                chapter = {
                    "id": chapter_id,
                    "title": self._guess_title(path),
                    "googleDocId": None,
                    "localPath": path,
                    "lastSync": None,
                    "enabled": True,
                    "type": ChapterType.DOCUMENT.value,
                    "images": [],
                }

            chapter["localPath"] = path
            chapter["order"] = order
            chapter["isAppendix"] = is_appendix
            merged_chapters.append(chapter)
            order_ids.append(chapter["id"])

        merged_project = dict(project)
        merged_project["metadata"] = {
            **project.get("metadata", {}),
            "name": book.get("title", project.get("metadata", {}).get("name", "Untitled Project")),
            "author": book.get("author", project.get("metadata", {}).get("author", "")),
            "date": book.get("date", project.get("metadata", {}).get("date")),
        }
        merged_project["chapters"] = merged_chapters

        requested_order = project.get("chapterOrder") or []
        if requested_order or "chapterOrder" in merged_project:
            valid_ids = set(order_ids)
            normalized_order: List[str] = []
            seen_ids = set()
            toc_seen = False
            for entry in requested_order:
                if entry == "__toc__":
                    if not toc_seen:
                        normalized_order.append(entry)
                        toc_seen = True
                    continue
                if entry in valid_ids and entry not in seen_ids:
                    normalized_order.append(entry)
                    seen_ids.add(entry)

            for chapter_id in order_ids:
                if chapter_id not in seen_ids:
                    normalized_order.append(chapter_id)

            merged_project["chapterOrder"] = normalized_order

        return merged_project

    async def _sync_to_quarto(self, project_data: Dict):
        """
        Sync relevant fields (chapters, metadata) to _quarto.yml using ruamel.yaml
        """
        # Read existing config to preserve comments
        quarto_config = self._read_quarto_config_sync()
        
        if 'book' not in quarto_config:
            quarto_config['book'] = {}
            
        # Sync Metadata
        quarto_config['book']['title'] = project_data['metadata'].get('name')
        quarto_config['book']['author'] = project_data['metadata'].get('author')
        quarto_config['book']['date'] = project_data['metadata'].get('date')
        
        # Sync Chapters (Only enabled ones)
        # Separate chapters and appendices based on isAppendix flag or filename pattern
        sorted_chapters = sorted(project_data['chapters'], key=lambda x: x.get('order', 0))
        chapter_order = project_data.get("chapterOrder") or []
        virtual_toc_id = "__toc__"
        toc_local_path = "content/_toc.qmd"

        def is_appendix(ch: Dict) -> bool:
            """Check if a chapter is an appendix based on explicit flag only."""
            return bool(ch.get('isAppendix'))

        enabled_chapters = [ch for ch in sorted_chapters if ch.get('enabled', True)]

        id_map = {ch['id']: ch for ch in enabled_chapters}
        seen_ids = set()
        ordered_entries: List[Any] = []

        if chapter_order:
            for entry in chapter_order:
                if entry == virtual_toc_id:
                    ordered_entries.append({"_virtual": virtual_toc_id})
                    continue
                if entry in id_map:
                    ordered_entries.append(id_map[entry])
                    seen_ids.add(entry)

            # Append missing chapters preserving current order
            for ch in enabled_chapters:
                if ch['id'] not in seen_ids:
                    ordered_entries.append(ch)
        else:
            ordered_entries = list(enabled_chapters)

        appendix_flags = []
        for entry in ordered_entries:
            if isinstance(entry, dict) and entry.get("_virtual") == virtual_toc_id:
                appendix_flags.append(False)
            else:
                appendix_flags.append(is_appendix(entry))
        seen_appendix = False
        appendices_are_trailing = True
        for flag in appendix_flags:
            if flag:
                seen_appendix = True
                continue
            if seen_appendix and not flag:
                appendices_are_trailing = False
                break

        if appendices_are_trailing:
            chapters_list = []
            appendices_list = []
            for entry in ordered_entries:
                # Virtual TOC is a sidebar/UI concept; do not materialize it in the HTML project.
                if isinstance(entry, dict) and entry.get("_virtual") == virtual_toc_id:
                    continue
                if isinstance(entry, dict) and entry.get("type") == ChapterType.FULLPAGE_IMAGE:
                    continue
                elif is_appendix(entry):
                    appendices_list.append(entry['localPath'])
                else:
                    chapters_list.append(entry['localPath'])
        else:
            # Mixed ordering: keep everything in chapters to honor custom order
            chapters_list = []
            appendices_list = []
            for entry in ordered_entries:
                if isinstance(entry, dict) and entry.get("_virtual") == virtual_toc_id:
                    continue
                if isinstance(entry, dict) and entry.get("type") == ChapterType.FULLPAGE_IMAGE:
                    continue
                else:
                    chapters_list.append(entry['localPath'])

        # Quarto book requires a homepage (index.*). Keep it as a system file outside the editor's chapter list.
        # Without this, `quarto render --to html` fails with "Book contents must include a home page".
        if (self.project_root / "index.qmd").exists():
            chapters_list = ["index.qmd"] + [p for p in chapters_list if Path(p).name.lower() not in {"index.qmd", "index.md"}]

        quarto_config['book']['chapters'] = chapters_list
        if appendices_list:
            quarto_config['book']['appendices'] = appendices_list
        elif 'appendices' in quarto_config['book']:
            quarto_config['book'].pop('appendices', None)
        
        # Sync Style (Format)
        if 'format' not in quarto_config:
            quarto_config['format'] = {}
            
        style = project_data.get('style', {})
        
        # HTML Settings
        html_style = style.get('html', {})
        if 'html' not in quarto_config['format']:
            quarto_config['format']['html'] = {}
            
        quarto_config['format']['html']['theme'] = html_style.get('theme', 'cosmo')
        quarto_config['format']['html']['toc'] = html_style.get('toc', True)
        quarto_config['format']['html']['number-sections'] = html_style.get('numberSections', True)
        quarto_config['format']['html']['code-fold'] = html_style.get('codeFold', True)
        
        # PDF Settings
        pdf_style = style.get('pdf', {})
        if 'pdf' not in quarto_config['format']:
            quarto_config['format']['pdf'] = {}
            
        quarto_config['format']['pdf']['documentclass'] = pdf_style.get('documentclass', 'scrreprt')
        quarto_config['format']['pdf']['classoption'] = pdf_style.get('classoption', [])
        quarto_config['format']['pdf']['geometry'] = pdf_style.get('geometry', ["top=30mm", "left=20mm", "height=230mm"])
        quarto_config['format']['pdf']['mainfont'] = pdf_style.get('mainfont', "Harano Aji Mincho")
        quarto_config['format']['pdf']['sansfont'] = pdf_style.get('sansfont', "Harano Aji Gothic")
        
        # Write back synchronously
        with open(self.quarto_yml, 'w', encoding='utf-8') as f:
            self.yaml.dump(quarto_config, f)

        # Also sync chapters/appendices to pdf_build/_quarto.yml (PDF-only project)
        pdf_quarto_path = self.project_root / "pdf_build" / "_quarto.yml"
        pdf_quarto_config: Dict[str, Any] = {}
        if pdf_quarto_path.exists():
            with open(pdf_quarto_path, 'r', encoding='utf-8') as f:
                pdf_quarto_config = self.yaml.load(f) or {}

        if 'book' not in pdf_quarto_config:
            pdf_quarto_config['book'] = {}
        if 'format' not in pdf_quarto_config:
            pdf_quarto_config['format'] = {}
        if 'pdf' not in pdf_quarto_config['format']:
            pdf_quarto_config['format']['pdf'] = {}

        # We control TOC placement via a virtual TOC chapter (content/_toc.qmd),
        # so disable Quarto's automatic TOC insertion for the PDF project.
        pdf_quarto_config['format']['pdf']['toc'] = False
        pdf_quarto_config['format']['pdf']['toc-depth'] = 3

        # Build PDF chapter order to match the sidebar UI behavior:
        # leading full-page image chapters -> TOC -> remaining chapters.
        enabled_sorted = [ch for ch in sorted(project_data['chapters'], key=lambda x: x.get('order', 0)) if ch.get('enabled', True)]
        toc_present_in_order = any(isinstance(e, dict) and e.get("_virtual") == virtual_toc_id for e in ordered_entries)

        pdf_order_entries: List[Any]
        if toc_present_in_order:
            pdf_order_entries = ordered_entries
        else:
            # Default placement: after leading fullpage_image chapters (same as UI default).
            leading_fullpage = 0
            for ch in enabled_sorted:
                if ch.get("type") == ChapterType.FULLPAGE_IMAGE:
                    leading_fullpage += 1
                else:
                    break
            pdf_order_entries = []
            for idx, ch in enumerate(enabled_sorted):
                if idx == leading_fullpage:
                    pdf_order_entries.append({"_virtual": virtual_toc_id})
                pdf_order_entries.append(ch)
            if leading_fullpage >= len(enabled_sorted):
                pdf_order_entries.append({"_virtual": virtual_toc_id})

        # Ensure TOC file exists (it contains \tableofcontents for PDF).
        self._ensure_toc_file()

        # PDF homepage (index.qmd) is always minimal.
        # Full-page images (cover, ads, back cover) are handled entirely by
        # fullpage-config.tex via \InsertFullPageImagesAt{before_toc/...}.
        # Tail images are emitted from a PDF-only TeX include inserted after the
        # body so they stay out of \AtEndDocument and out of the book chapter
        # structure.
        self._write_pdf_homepage("---\ntitle: \"\"\ntoc: false\n---\n\n")
        self._ensure_pdf_tail_files()

        pdf_chapters: List[str] = ["index.qmd"]
        for entry in pdf_order_entries:
            if isinstance(entry, dict) and entry.get("_virtual") == virtual_toc_id:
                pdf_chapters.append(toc_local_path)
                continue
            if not isinstance(entry, dict):
                continue
            local_path = entry.get("localPath")
            if not local_path:
                continue
            # Skip fullpage image chapters - they are inserted by fullpage-config.tex
            # at the correct positions (before_toc, after_content, after_appendices).
            if entry.get("type") == ChapterType.FULLPAGE_IMAGE:
                continue
            # Never include the HTML homepage in the PDF project.
            if Path(local_path).name.lower() in {"index.qmd", "index.md"}:
                continue
            pdf_chapters.append(local_path)

        pdf_quarto_config['book']['chapters'] = pdf_chapters
        pdf_quarto_config['format']['pdf']['include-after-body'] = ['content/_pdf_tail.tex']
        if appendices_list:
            pdf_quarto_config['book']['appendices'] = [ch for ch in appendices_list if Path(ch).name.lower() not in {"index.qmd", "index.md"}]
        elif 'appendices' in pdf_quarto_config['book']:
            pdf_quarto_config['book'].pop('appendices', None)

        # Write PDF project config (create if missing).
        pdf_quarto_path.parent.mkdir(parents=True, exist_ok=True)
        with open(pdf_quarto_path, 'w', encoding='utf-8') as f:
            self.yaml.dump(pdf_quarto_config, f)

    def _guess_title(self, filepath: str) -> str:
        name = os.path.splitext(os.path.basename(filepath))[0]
        return name.replace('_', ' ').replace('-', ' ').title()

    async def add_chapter(self, chapter_data: Dict):
        project = await self.load()
        project['chapters'].append(chapter_data)
        await self.save(project)

    async def update_metadata(self, metadata: Dict):
        project = await self.load()
        project['metadata'].update(metadata)
        await self.save(project)

    async def update_chapters_order(self, ordered_ids: List[str]):
        """
        Update chapter order based on list of IDs
        """
        project = await self.load()
        
        id_map = {ch['id']: ch for ch in project['chapters']}
        new_list = []
        
        for idx, cid in enumerate(ordered_ids):
            if cid in id_map:
                ch = id_map[cid]
                ch['order'] = idx
                new_list.append(ch)
                
        # Append missing
        for ch in project['chapters']:
            if ch['id'] not in ordered_ids:
                 new_list.append(ch)
        
        project['chapters'] = new_list
        await self.save(project)

    async def get_chapter_content(self, chapter_id: str) -> Optional[str]:
        """
        Read content of a chapter by ID.
        """
        project = await self.load()
        chapter = next((ch for ch in project['chapters'] if ch['id'] == chapter_id), None)
        
        if not chapter:
            return None
            
        file_path = resolve_content_markdown_path(self.project_root, chapter['localPath'])
        if not file_path.exists():
            return ""
            
        async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
            return await f.read()

    async def update_chapter_content(self, chapter_id: str, content: str) -> bool:
        """
        Update content of a chapter by ID.
        """
        project = await self.load()
        chapter = next((ch for ch in project['chapters'] if ch['id'] == chapter_id), None)
        
        if not chapter:
            return False
            
        file_path = resolve_content_markdown_path(self.project_root, chapter['localPath'])
        
        # Ensure directory exists
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
            await f.write(content)
            
        # Update lastSync (optional, maybe we should track lastModified separately)
        # For now, we don't change metadata, just content.
        
        return True

    async def update_conversion_rules(self, rules: List[Dict[str, str]]):
        """
        Update custom conversion rules.
        Each rule should have 'pattern' and 'replacement'.
        """
        project = await self.load()
        project['conversionRules'] = rules
        project['updatedAt'] = utc_now_iso()
        await self.save(project)

    async def update_build_status(self, status: str):
        """
        Update last build status and time.
        status: 'success' | 'failure'
        """
        project = await self.load()
        project['lastBuildStatus'] = status
        project['lastBuildTime'] = utc_now_iso()
        await self.save(project)

    async def update_sync_time(self):
        """
        Update last global sync time.
        """
        project = await self.load()
        project['lastSyncTime'] = utc_now_iso()
        await self.save(project)

    async def get_stats(self) -> Dict:
        """
        Calculate project statistics: total words, words per chapter.
        """
        project = await self.load()
        chapters = project.get('chapters', [])
        
        total_words = 0
        chapter_stats = []
        
        for ch in chapters:
            content = await self.get_chapter_content(ch['id'])
            # Use character count for Japanese support
            # stripping whitespace for slightly better accuracy, or just raw length
            words = len(content.replace(" ", "").replace("\n", "")) if content else 0
            
            # If we want detailed stats, we could use a better counter, 
            # but this is fast and sufficient for a dashboard.
            
            total_words += words
            chapter_stats.append({
                "id": ch['id'],
                "title": ch['title'],
                "chars": words, # Rename key or keep as 'words' for compat but it means chars now
                "words": words 
            })
            
        return {
            "total_words": total_words,
            "chapters": chapter_stats
        }


    async def get_raw_config(self) -> str:
        """
        Read the raw content of _quarto.yml
        """
        if not self.quarto_yml.exists():
            return ""
        
        async with aiofiles.open(self.quarto_yml, "r", encoding="utf-8") as f:
            return await f.read()

    async def update_raw_config(self, content: str):
        """
        Update _quarto.yml with raw content.
        WARNING: This overrides the file and might desync api-managed fields.
        """
        yaml = YAML(typ="safe")
        try:
            parsed = yaml.load(content) if content.strip() else {}
        except Exception as exc:
            raise ValueError("Invalid YAML in _quarto.yml") from exc

        if not isinstance(parsed, dict):
            raise ValueError("_quarto.yml must be a YAML mapping")

        backup_path = self.quarto_yml.with_suffix(".yml.bak")
        had_original = self.quarto_yml.exists()
        if had_original:
            shutil.copy2(self.quarto_yml, backup_path)

        try:
            async with aiofiles.open(self.quarto_yml, "w", encoding="utf-8") as f:
                await f.write(content)
        except Exception:
            if had_original and backup_path.exists():
                shutil.copy2(backup_path, self.quarto_yml)
            raise
            
        # Optional: Try to sync back to project.json? 
        # For now, we treat this as "Advanced" mode where user takes responsibility.
