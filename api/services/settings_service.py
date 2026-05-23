"""
Settings Service

プロジェクト設定の読み書きとYAML統合を管理するサービス
"""
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import yaml


class SettingsService:
    """設定管理サービス"""

    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.config_dir = self.project_root / "config"
        self.settings_file = self.config_dir / "settings.json"
        self.quarto_file = self.project_root / "_quarto.yml"

    def load_settings(self) -> Dict[str, Any]:
        """設定ファイルを読み込む"""
        if not self.settings_file.exists():
            return self._get_default_settings()

        with open(self.settings_file, "r", encoding="utf-8") as f:
            return json.load(f)

    def save_settings(self, settings: Dict[str, Any]) -> None:
        """設定を保存する"""
        self.config_dir.mkdir(exist_ok=True)

        with open(self.settings_file, "w", encoding="utf-8") as f:
            json.dump(settings, f, ensure_ascii=False, indent=2)

    def update_project_info(self, title: str = None, author: str = None, date: str = None) -> Dict[str, Any]:
        """プロジェクト基本情報を更新"""
        settings = self.load_settings()

        if title is not None:
            settings["project"]["title"] = title
        if author is not None:
            settings["project"]["author"] = author
        if date is not None:
            settings["project"]["date"] = date

        self.save_settings(settings)
        return settings

    def update_pdf_settings(
        self,
        page_size: str = None,
        font_size: int = None,
        margins: Dict[str, str] = None,
        fonts: Dict[str, str] = None
    ) -> Dict[str, Any]:
        """PDF設定を更新"""
        settings = self.load_settings()

        if page_size is not None:
            settings["pdf"]["pageSize"] = page_size
        if font_size is not None:
            settings["pdf"]["fontSize"] = font_size
        if margins is not None:
            settings["pdf"]["margins"].update(margins)
        if fonts is not None:
            settings["pdf"]["fonts"].update(fonts)

        self.save_settings(settings)
        return settings

    def update_colors(self, colors_data: Dict[str, Any]) -> Dict[str, Any]:
        """色設定を更新"""
        settings = self.load_settings()

        # プリセットの更新
        if "preset" in colors_data:
            settings["pdf"]["colors"]["preset"] = colors_data["preset"]
            # プリセットを選択した場合、custom色をプリセットの色で上書き
            preset_name = colors_data["preset"]
            if preset_name in settings["pdf"]["colors"]["presets"]:
                preset = settings["pdf"]["colors"]["presets"][preset_name]
                settings["pdf"]["colors"]["custom"] = preset.get("colors", preset).copy()
            elif preset_name == "custom" and "custom" in colors_data:
                # カスタムモードでカスタム色が提供された場合
                settings["pdf"]["colors"]["custom"].update(colors_data["custom"])

        # カスタム色の更新
        if "custom" in colors_data:
            settings["pdf"]["colors"]["custom"].update(colors_data["custom"])

        self.save_settings(settings)
        return settings

    def update_html_settings(
        self,
        theme: str = None,
        toc: bool = None,
        number_sections: bool = None,
        sidebar_width: int = None,
        margin_width: int = None
    ) -> Dict[str, Any]:
        """HTML設定を更新"""
        settings = self.load_settings()

        if theme is not None:
            settings["html"]["theme"] = theme
        if toc is not None:
            settings["html"]["toc"] = toc
        if number_sections is not None:
            settings["html"]["numberSections"] = number_sections
        if sidebar_width is not None:
            settings["html"]["sidebarWidth"] = sidebar_width
        if margin_width is not None:
            settings["html"]["marginWidth"] = margin_width

        self.save_settings(settings)
        return settings

    def update_chapters(self, chapters: List[Dict[str, Any]]) -> Dict[str, Any]:
        """章構成を更新"""
        settings = self.load_settings()
        settings["chapters"] = chapters
        self.save_settings(settings)
        return settings

    def update_typography_settings(
        self,
        line_spacing: float = None,
        paragraph_spacing: float = None,
        indent_first_line: bool = None,
        indent_size: float = None,
        justify: bool = None
    ) -> Dict[str, Any]:
        """組版設定を更新"""
        settings = self.load_settings()

        if "typography" not in settings["pdf"]:
            settings["pdf"]["typography"] = {}

        if line_spacing is not None:
            settings["pdf"]["typography"]["lineSpacing"] = line_spacing
        if paragraph_spacing is not None:
            settings["pdf"]["typography"]["paragraphSpacing"] = paragraph_spacing
        if indent_first_line is not None:
            settings["pdf"]["typography"]["indentFirstLine"] = indent_first_line
        if indent_size is not None:
            settings["pdf"]["typography"]["indentSize"] = indent_size
        if justify is not None:
            settings["pdf"]["typography"]["justify"] = justify

        self.save_settings(settings)
        return settings

    def update_layout_settings(
        self,
        columns: int = None,
        page_number_style: str = None,
        page_number_position: str = None,
        page_number_start: int = None,
        show_page_number_first: bool = None,
        header_style: str = None
    ) -> Dict[str, Any]:
        """レイアウト設定を更新"""
        settings = self.load_settings()

        if "layout" not in settings["pdf"]:
            settings["pdf"]["layout"] = {}

        if columns is not None:
            settings["pdf"]["layout"]["columns"] = columns
        if page_number_style is not None:
            settings["pdf"]["layout"]["page_number_style"] = page_number_style
        if page_number_position is not None:
            settings["pdf"]["layout"]["page_number_position"] = page_number_position
        if page_number_start is not None:
            settings["pdf"]["layout"]["page_number_start"] = page_number_start
        if show_page_number_first is not None:
            settings["pdf"]["layout"]["show_page_number_first"] = show_page_number_first
        if header_style is not None:
            settings["pdf"]["layout"]["header_style"] = header_style

        self.save_settings(settings)
        return settings

    def update_toc_settings(
        self,
            max_level: int = None,
            dot_leader: bool = None,
            include_chapters: bool = None,
            include_sections: bool = None,
            include_subsections: bool = None
    ) -> Dict[str, Any]:
        """目次設定を更新"""
        settings = self.load_settings()

        if "toc" not in settings["pdf"]:
            settings["pdf"]["toc"] = {}

        if max_level is not None:
            settings["pdf"]["toc"]["maxLevel"] = max_level
        if dot_leader is not None:
            settings["pdf"]["toc"]["dotLeader"] = dot_leader
        if include_chapters is not None:
            settings["pdf"]["toc"]["includeChapters"] = include_chapters
        if include_sections is not None:
            settings["pdf"]["toc"]["includeSections"] = include_sections
        if include_subsections is not None:
            settings["pdf"]["toc"]["includeSubsections"] = include_subsections

        self.save_settings(settings)
        return settings

    def update_rule_settings(
        self,
        show_page_border: bool = None,
        show_chapter_divider: bool = None,
        chapter_divider_style: str = None,
        table_vertical_lines: bool = None
    ) -> Dict[str, Any]:
        """罫線設定を更新"""
        settings = self.load_settings()

        if "rules" not in settings["pdf"]:
            settings["pdf"]["rules"] = {}

        if show_page_border is not None:
            settings["pdf"]["rules"]["showPageBorder"] = show_page_border
        if show_chapter_divider is not None:
            settings["pdf"]["rules"]["showChapterDivider"] = show_chapter_divider
        if chapter_divider_style is not None:
            settings["pdf"]["rules"]["chapterDividerStyle"] = chapter_divider_style
        if table_vertical_lines is not None:
            settings["pdf"]["rules"]["tableVerticalLines"] = table_vertical_lines

        self.save_settings(settings)
        return settings

    def update_image_settings(
        self,
        default_align: str = None,
        caption_style: str = None,
        caption_position: str = None,
        margin: float = None
    ) -> Dict[str, Any]:
        """画像設定を更新"""
        settings = self.load_settings()

        if "images" not in settings["pdf"]:
            settings["pdf"]["images"] = {}

        if default_align is not None:
            settings["pdf"]["images"]["defaultAlign"] = default_align
        if caption_style is not None:
            settings["pdf"]["images"]["captionStyle"] = caption_style
        if caption_position is not None:
            settings["pdf"]["images"]["captionPosition"] = caption_position
        if margin is not None:
            settings["pdf"]["images"]["margin"] = margin

        self.save_settings(settings)
        return settings

    def update_footnote_settings(
        self,
        mark_style: str = None,
        placement: str = None,
        font_scale: float = None
    ) -> Dict[str, Any]:
        """脚注設定を更新"""
        settings = self.load_settings()

        if "footnotes" not in settings["pdf"]:
            settings["pdf"]["footnotes"] = {}

        if mark_style is not None:
            settings["pdf"]["footnotes"]["markStyle"] = mark_style
        if placement is not None:
            settings["pdf"]["footnotes"]["placement"] = placement
        if font_scale is not None:
            settings["pdf"]["footnotes"]["fontScale"] = font_scale

        self.save_settings(settings)
        return settings

    def update_quote_settings(
        self,
        style: str = None,
        indent: float = None,
        border_style: str = None,
        background: bool = None
    ) -> Dict[str, Any]:
        """引用設定を更新"""
        settings = self.load_settings()

        if "quotes" not in settings["pdf"]:
            settings["pdf"]["quotes"] = {}

        if style is not None:
            settings["pdf"]["quotes"]["style"] = style
        if indent is not None:
            settings["pdf"]["quotes"]["indent"] = indent
        if border_style is not None:
            settings["pdf"]["quotes"]["borderStyle"] = border_style
        if background is not None:
            settings["pdf"]["quotes"]["background"] = background

        self.save_settings(settings)
        return settings

    def update_code_block_settings(
        self,
        theme: str = None,
        font_family: str = None,
        background: bool = None,
        border: bool = None
    ) -> Dict[str, Any]:
        """コードブロック設定を更新"""
        settings = self.load_settings()

        if "codeBlocks" not in settings["pdf"]:
            settings["pdf"]["codeBlocks"] = {}

        if theme is not None:
            settings["pdf"]["codeBlocks"]["theme"] = theme
        if font_family is not None:
            settings["pdf"]["codeBlocks"]["fontFamily"] = font_family
        if background is not None:
            settings["pdf"]["codeBlocks"]["background"] = background
        if border is not None:
            settings["pdf"]["codeBlocks"]["border"] = border

        self.save_settings(settings)
        return settings

    # Heading settings methods
    def update_base_font_size(self, font_size: float = None) -> Dict[str, Any]:
        """本文基本フォントサイズを更新"""
        settings = self.load_settings()

        if "headings" not in settings["pdf"]:
            settings["pdf"]["headings"] = {}

        if font_size is not None:
            settings["pdf"]["headings"]["baseFontSize"] = font_size

        self.save_settings(settings)
        return settings

    def update_chapter_heading(
        self,
        font_size: float = None,
        font_family: str = None,
        alignment: str = None,
        color: str = None,
        bold: bool = None,
        spacing_before: float = None,
        spacing_after: float = None
    ) -> Dict[str, Any]:
        """章見出し設定を更新"""
        settings = self.load_settings()

        if "headings" not in settings["pdf"]:
            settings["pdf"]["headings"] = {}
        if "chapter" not in settings["pdf"]["headings"]:
            settings["pdf"]["headings"]["chapter"] = {}

        if font_size is not None:
            settings["pdf"]["headings"]["chapter"]["fontSize"] = font_size
        if font_family is not None:
            settings["pdf"]["headings"]["chapter"]["fontFamily"] = font_family
        if alignment is not None:
            settings["pdf"]["headings"]["chapter"]["alignment"] = alignment
        if color is not None:
            settings["pdf"]["headings"]["chapter"]["color"] = color
        if bold is not None:
            settings["pdf"]["headings"]["chapter"]["bold"] = bold
        if spacing_before is not None:
            settings["pdf"]["headings"]["chapter"]["spacingBefore"] = spacing_before
        if spacing_after is not None:
            settings["pdf"]["headings"]["chapter"]["spacingAfter"] = spacing_after

        self.save_settings(settings)
        return settings

    def update_section_heading(
        self,
        font_size: float = None,
        font_family: str = None,
        alignment: str = None,
        color: str = None,
        bold: bool = None,
        left_border_style: str = None,
        left_border_width: float = None,
        spacing_before: float = None,
        spacing_after: float = None
    ) -> Dict[str, Any]:
        """節見出し設定を更新"""
        settings = self.load_settings()

        if "headings" not in settings["pdf"]:
            settings["pdf"]["headings"] = {}
        if "section" not in settings["pdf"]["headings"]:
            settings["pdf"]["headings"]["section"] = {}

        if font_size is not None:
            settings["pdf"]["headings"]["section"]["fontSize"] = font_size
        if font_family is not None:
            settings["pdf"]["headings"]["section"]["fontFamily"] = font_family
        if alignment is not None:
            settings["pdf"]["headings"]["section"]["alignment"] = alignment
        if color is not None:
            settings["pdf"]["headings"]["section"]["color"] = color
        if bold is not None:
            settings["pdf"]["headings"]["section"]["bold"] = bold
        if left_border_style is not None:
            settings["pdf"]["headings"]["section"]["leftBorderStyle"] = left_border_style
        if left_border_width is not None:
            settings["pdf"]["headings"]["section"]["leftBorderWidth"] = left_border_width
        if spacing_before is not None:
            settings["pdf"]["headings"]["section"]["spacingBefore"] = spacing_before
        if spacing_after is not None:
            settings["pdf"]["headings"]["section"]["spacingAfter"] = spacing_after

        self.save_settings(settings)
        return settings

    def update_subsection_heading(
        self,
        font_size: float = None,
        font_family: str = None,
        alignment: str = None,
        color: str = None,
        bold: bool = None,
        left_border_style: str = None,
        left_border_width: float = None,
        spacing_before: float = None,
        spacing_after: float = None
    ) -> Dict[str, Any]:
        """項見出し設定を更新"""
        settings = self.load_settings()

        if "headings" not in settings["pdf"]:
            settings["pdf"]["headings"] = {}
        if "subsection" not in settings["pdf"]["headings"]:
            settings["pdf"]["headings"]["subsection"] = {}

        if font_size is not None:
            settings["pdf"]["headings"]["subsection"]["fontSize"] = font_size
        if font_family is not None:
            settings["pdf"]["headings"]["subsection"]["fontFamily"] = font_family
        if alignment is not None:
            settings["pdf"]["headings"]["subsection"]["alignment"] = alignment
        if color is not None:
            settings["pdf"]["headings"]["subsection"]["color"] = color
        if bold is not None:
            settings["pdf"]["headings"]["subsection"]["bold"] = bold
        if left_border_style is not None:
            settings["pdf"]["headings"]["subsection"]["leftBorderStyle"] = left_border_style
        if left_border_width is not None:
            settings["pdf"]["headings"]["subsection"]["leftBorderWidth"] = left_border_width
        if spacing_before is not None:
            settings["pdf"]["headings"]["subsection"]["spacingBefore"] = spacing_before
        if spacing_after is not None:
            settings["pdf"]["headings"]["subsection"]["spacingAfter"] = spacing_after

        self.save_settings(settings)
        return settings

    def update_subsubsection_heading(
        self,
        font_size: float = None,
        font_family: str = None,
        alignment: str = None,
        color: str = None,
        bold: bool = None,
        left_border_style: str = None,
        left_border_width: float = None,
        spacing_before: float = None,
        spacing_after: float = None
    ) -> Dict[str, Any]:
        """小項見出し設定を更新"""
        settings = self.load_settings()

        if "headings" not in settings["pdf"]:
            settings["pdf"]["headings"] = {}
        if "subsubsection" not in settings["pdf"]["headings"]:
            settings["pdf"]["headings"]["subsubsection"] = {}

        if font_size is not None:
            settings["pdf"]["headings"]["subsubsection"]["fontSize"] = font_size
        if font_family is not None:
            settings["pdf"]["headings"]["subsubsection"]["fontFamily"] = font_family
        if alignment is not None:
            settings["pdf"]["headings"]["subsubsection"]["alignment"] = alignment
        if color is not None:
            settings["pdf"]["headings"]["subsubsection"]["color"] = color
        if bold is not None:
            settings["pdf"]["headings"]["subsubsection"]["bold"] = bold
        if left_border_style is not None:
            settings["pdf"]["headings"]["subsubsection"]["leftBorderStyle"] = left_border_style
        if left_border_width is not None:
            settings["pdf"]["headings"]["subsubsection"]["leftBorderWidth"] = left_border_width
        if spacing_before is not None:
            settings["pdf"]["headings"]["subsubsection"]["spacingBefore"] = spacing_before
        if spacing_after is not None:
            settings["pdf"]["headings"]["subsubsection"]["spacingAfter"] = spacing_after

        self.save_settings(settings)
        return settings

    def sync_to_quarto_yml(self) -> None:
        """設定を_quarto.ymlに反映する"""
        settings = self.load_settings()

        if not self.quarto_file.exists():
            return

        with open(self.quarto_file, "r", encoding="utf-8") as f:
            quarto_config = yaml.safe_load(f)

        # プロジェクト情報を更新
        if "book" in quarto_config:
            quarto_config["book"]["title"] = settings["project"]["title"]
            quarto_config["book"]["author"] = settings["project"]["author"]
            quarto_config["book"]["date"] = settings["project"]["date"]

        # チャプター構成を更新
        if "chapters" in settings and settings["chapters"]:
            if "book" in quarto_config:
                # メインチャプターと付録を分ける
                main_chapters = []
                appendices = []

                for ch in settings["chapters"]:
                    if ch.get("part") == "appendices":
                        appendices.append(ch["file"])
                    else:
                        main_chapters.append(ch["file"])

                quarto_config["book"]["chapters"] = main_chapters
                if appendices:
                    quarto_config["book"]["appendices"] = appendices

        # PDF設定を更新
        if "format" in quarto_config and "pdf" in quarto_config["format"]:
            pdf_config = quarto_config["format"]["pdf"]

            # 余白
            if "geometry" in pdf_config:
                margins = settings["pdf"]["margins"]
                pdf_config["geometry"] = [
                    f"top={margins['top']}",
                    f"left={margins['left']}",
                    f"height={margins['height']}"
                ]

            # フォントサイズ（headings.baseFontSizeがあれば優先）
            base_font_size = settings["pdf"].get("headings", {}).get("baseFontSize")
            if base_font_size:
                pdf_config["fontsize"] = f"{base_font_size}pt"
            else:
                pdf_config["fontsize"] = f"{settings['pdf']['fontSize']}pt"

            # フォント
            pdf_config["mainfont"] = settings["pdf"]["fonts"]["main"]
            pdf_config["sansfont"] = settings["pdf"]["fonts"]["sans"]

        # HTML設定を更新
        if "format" in quarto_config and "html" in quarto_config["format"]:
            html_config = quarto_config["format"]["html"]
            html_config["theme"] = settings["html"]["theme"]
            html_config["toc"] = settings["html"]["toc"]
            html_config["number-sections"] = settings["html"]["numberSections"]
            if "grid" in html_config:
                html_config["grid"]["sidebar-width"] = f"{settings['html']['sidebarWidth']}px"
                html_config["grid"]["margin-width"] = f"{settings['html']['marginWidth']}px"

        # 色設定はpdf-style.texを生成する必要がある
        self._update_pdf_style_tex(settings)

        # 見出しスタイルもpdf-style.texに反映
        self._update_heading_styles(settings)

        # YAMLを保存
        with open(self.quarto_file, "w", encoding="utf-8") as f:
            yaml.dump(quarto_config, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

    def _update_pdf_style_tex(self, settings: Dict[str, Any]) -> None:
        """pdf-style.texの色設定を更新"""
        pdf_style_file = self.project_root / "meta" / "latex" / "pdf-style.tex"

        if not pdf_style_file.exists():
            return

        colors = settings["pdf"]["colors"]["custom"]

        # 色定義を生成（HTMLの#を除外）
        def clean_color(value: str) -> str:
            if isinstance(value, str) and value.startswith("#"):
                return value[1:]
            return value

        # 色定義セクションを生成
        color_definitions = f"""% === Color Definitions (Auto-generated from settings) ===
\\definecolor{{linkblue}}{{HTML}}{{{clean_color(colors.get('linkblue', '1a73e8'))}}}
\\definecolor{{titleblue}}{{HTML}}{{{clean_color(colors.get('titleblue', '0d47a1'))}}}
\\definecolor{{headerblue}}{{HTML}}{{{clean_color(colors.get('headerblue', '0097a7'))}}}
\\definecolor{{lawheaderbg}}{{HTML}}{{{clean_color(colors.get('lawheaderbg', '3d5a80'))}}}
\\definecolor{{lawheadertext}}{{HTML}}{{{clean_color(colors.get('lawheadertext', 'ffffff'))}}}
\\definecolor{{lawbodybg}}{{HTML}}{{{clean_color(colors.get('lawbodybg', 'e8f0f8'))}}}
\\definecolor{{lawborder}}{{HTML}}{{{clean_color(colors.get('lawborder', 'b8c8d8'))}}}
\\definecolor{{blockquotebg}}{{HTML}}{{{clean_color(colors.get('blockquotebg', 'f0f8ff'))}}}
\\definecolor{{railactive}}{{HTML}}{{{clean_color(colors.get('railactive', '2C5070'))}}}
\\definecolor{{railinactive}}{{HTML}}{{{clean_color(colors.get('railinactive', 'E5E5E5'))}}}
\\definecolor{{railcursor}}{{HTML}}{{{clean_color(colors.get('railcursor', 'C04020'))}}}
\\definecolor{{hlyellow}}{{HTML}}{{{clean_color(colors.get('hlyellow', 'A66B00'))}}}
\\definecolor{{hlgreen}}{{HTML}}{{{clean_color(colors.get('hlgreen', 'd9ead3'))}}}
\\definecolor{{hlred}}{{HTML}}{{{clean_color(colors.get('hlred', 'fce8e6'))}}}
\\definecolor{{hlblue}}{{HTML}}{{{clean_color(colors.get('hlblue', 'e8f0fe'))}}}
\\definecolor{{hlpurple}}{{HTML}}{{{clean_color(colors.get('hlpurple', 'f3e8fd'))}}}
"""

        # 現在のファイルを読み込んで色定義部分を置換
        with open(pdf_style_file, "r", encoding="utf-8") as f:
            content = f.read()

        # 色定義セクションを置換
        import re
        # 複数のパターンを試す
        patterns = [
            r'% === Color Definitions.*?\\definecolor\{hlpurple\}.*?\n',
            r'% === Color Definitions \(matching reference PDF design\).*?\\definecolor\{hlpurple\}.*?\n',
            r'% === Color Definitions.*?\n',
        ]

        new_content = content
        for pattern in patterns:
            match = re.search(pattern, content, re.DOTALL)
            if match:
                new_content = content[:match.start()] + color_definitions.strip() + "\n" + content[match.end():]
                break
        else:
            # マッチしない場合、色定義セクションをファイルの先頭に挿入
            if "% === Color Definitions" not in content:
                new_content = color_definitions + "\n" + content

        with open(pdf_style_file, "w", encoding="utf-8") as f:
            f.write(new_content)

    def _update_heading_styles(self, settings: Dict[str, Any]) -> None:
        """pdf-style.texの見出しスタイルを更新"""
        pdf_style_file = self.project_root / "meta" / "latex" / "pdf-style.tex"

        if not pdf_style_file.exists():
            return

        headings = settings["pdf"].get("headings", {})

        # デフォルト値
        chapter = headings.get("chapter", {})
        section = headings.get("section", {})
        subsection = headings.get("subsection", {})
        subsubsection = headings.get("subsubsection", {})

        # ヘルパー関数: 値を取得、デフォルト値を返す
        def get_val(d, key, default):
            return d.get(key) if d.get(key) is not None else default

        # 設定値の取得
        # Chapter
        ch_fs = get_val(chapter, 'fontSize', 16.0)
        ch_ff = get_val(chapter, 'fontFamily', 'mincho')
        ch_align = get_val(chapter, 'alignment', 'center')
        ch_color = get_val(chapter, 'color', 'titleblue')
        ch_bold = get_val(chapter, 'bold', True)
        ch_spacing_before = get_val(chapter, 'spacingBefore', 0)
        ch_spacing_after = get_val(chapter, 'spacingAfter', 20)

        # Section
        sec_fs = get_val(section, 'fontSize', 14.0)
        sec_ff = get_val(section, 'fontFamily', 'mincho')
        sec_align = get_val(section, 'alignment', 'left')
        sec_color = get_val(section, 'color', 'titleblue')
        sec_bold = get_val(section, 'bold', True)
        sec_border_style = get_val(section, 'leftBorderStyle', 'thick')
        sec_border_width = get_val(section, 'leftBorderWidth', 2.0)
        sec_spacing_before = get_val(section, 'spacingBefore', 12)
        sec_spacing_after = get_val(section, 'spacingAfter', 6)

        # Subsection
        sub_fs = get_val(subsection, 'fontSize', 12.0)
        sub_ff = get_val(subsection, 'fontFamily', 'mincho')
        sub_align = get_val(subsection, 'alignment', 'left')
        sub_color = get_val(subsection, 'color', 'black')
        sub_bold = get_val(subsection, 'bold', True)
        sub_border_style = get_val(subsection, 'leftBorderStyle', 'none')
        sub_border_width = get_val(subsection, 'leftBorderWidth', 1.0)
        sub_spacing_before = get_val(subsection, 'spacingBefore', 10)
        sub_spacing_after = get_val(subsection, 'spacingAfter', 5)

        # Subsubsection
        subsub_fs = get_val(subsubsection, 'fontSize', 10.5)
        subsub_ff = get_val(subsubsection, 'fontFamily', 'gothic')
        subsub_align = get_val(subsubsection, 'alignment', 'left')
        subsub_color = get_val(subsubsection, 'color', 'gray')
        subsub_bold = get_val(subsubsection, 'bold', True)
        subsub_border_style = get_val(subsubsection, 'leftBorderStyle', 'double')
        subsub_border_width = get_val(subsubsection, 'leftBorderWidth', 1.0)
        subsub_spacing_before = get_val(subsubsection, 'spacingBefore', 8)
        subsub_spacing_after = get_val(subsubsection, 'spacingAfter', 4)

        # LaTeXコマンド定義（バックスラッシュを含む）
        backslash = '\\'
        sffamily = backslash + 'sffamily'
        rmfamily = backslash + 'rmfamily'
        bfseries = backslash + 'bfseries'
        normalfont = backslash + 'normalfont'
        selectfont = backslash + 'selectfont'
        fontsize = backslash + 'fontsize'
        chaptername = backslash + 'chaptertitlename'
        color_cmd = backslash + 'color'
        rule = backslash + 'rule'
        hspace = backslash + 'hspace'
        baselineskip = backslash + 'baselineskip'
        titleformat = backslash + 'titleformat'
        titlespacing = backslash + 'titlespacing*'

        # ヘルパー関数
        def get_font_cmd(ff):
            return sffamily if ff == 'gothic' else rmfamily

        def get_color_str(color):
            if color == 'black':
                return color_cmd + '{black}'
            elif color == 'gray':
                return color_cmd + '{gray}'
            else:
                return color_cmd + '{' + color + '}'

        def get_border_code(style, width, color):
            if style == 'none' or not style:
                return ''
            width_val = width if width else 1.0
            color_val = color if color != 'gray' and color != 'black' else 'black'
            c = color_cmd + '{' + color_val + '}'
            if style == 'double':
                return '{' + c + rule + '{' + str(width_val) + 'pt}{0.5pt}' + hspace + '{1pt}' + rule + '{' + str(width_val) + 'pt}{0.5pt}} '
            else:
                return '{' + c + rule + '{' + str(width_val) + 'pt}{' + baselineskip + '}} '

        # 全ての設定値を事前計算
        ch_ff_cmd = get_font_cmd(ch_ff)
        ch_color_str = get_color_str(ch_color)
        ch_bold_str = bfseries if ch_bold else ''
        ch_fs_str = str(ch_fs) + 'pt'
        ch_ls_str = f'{ch_fs * 1.2:.1f}pt'

        sec_ff_cmd = get_font_cmd(sec_ff)
        sec_color_str = get_color_str(sec_color)
        sec_bold_str = bfseries if sec_bold else ''
        sec_fs_str = str(sec_fs) + 'pt'
        sec_ls_str = f'{sec_fs * 1.2:.1f}pt'
        sec_border_str = get_border_code(sec_border_style, sec_border_width, sec_color)

        sub_ff_cmd = get_font_cmd(sub_ff)
        sub_color_str = get_color_str(sub_color)
        sub_bold_str = bfseries if sub_bold else ''
        sub_fs_str = str(sub_fs) + 'pt'
        sub_ls_str = f'{sub_fs * 1.2:.1f}pt'
        sub_border_str = get_border_code(sub_border_style, sub_border_width, sub_color)

        subsub_ff_cmd = get_font_cmd(subsub_ff)
        subsub_color_str = get_color_str(subsub_color)
        subsub_bold_str = bfseries if subsub_bold else ''
        subsub_fs_str = str(subsub_fs) + 'pt'
        subsub_ls_str = f'{subsub_fs * 1.2:.1f}pt'
        subsub_border_str = get_border_code(subsub_border_style, subsub_border_width, subsub_color)

        # 見出しスタイル定義を生成（文字列結合でf-stringを回避）
        heading_styles = (
            '% === Heading Styles (Auto-generated from settings) ===\n'
            '% Chapter Style\n'
            + titleformat + '{' + backslash + 'chapter}[display]\n'
            '  {' + normalfont + fontsize + '{' + ch_fs_str + '}{' + ch_ls_str + '}' + selectfont + ch_ff_cmd + ch_bold_str + ' ' + ch_color_str + '}}\n'
            '  {' + chaptername + ' ' + backslash + 'thechapter}' + str(ch_spacing_after) + 'pt}}}{' + fontsize + '{' + ch_fs_str + '}{' + ch_ls_str + '}' + selectfont + ch_ff_cmd + ch_bold_str + ' ' + ch_color_str + '}}\n'
            + titlespacing + '{' + backslash + 'chapter}{0pt}{' + str(ch_spacing_before) + 'pt}{' + str(ch_spacing_after) + 'pt}\n'
            '\n'
            '% Section Style\n'
            + titleformat + '{' + backslash + 'section}\n'
            '  {' + normalfont + fontsize + '{' + sec_fs_str + '}{' + sec_ls_str + '}' + selectfont + sec_ff_cmd + sec_bold_str + ' ' + sec_color_str + '}}\n'
            '  {' + backslash + 'thesection}{1em}{' + sec_border_str + '}}\n'
            + titlespacing + '{' + backslash + 'section}{0pt}{' + str(sec_spacing_before) + 'pt plus 4pt minus 2pt}{' + str(sec_spacing_after) + 'pt plus 2pt minus 2pt}\n'
            '\n'
            '% Subsection Style\n'
            + titleformat + '{' + backslash + 'subsection}\n'
            '  {' + normalfont + fontsize + '{' + sub_fs_str + '}{' + sub_ls_str + '}' + selectfont + sub_ff_cmd + sub_bold_str + ' ' + sub_color_str + '}}\n'
            '  {' + backslash + 'thesubsection}{1em}{' + sub_border_str + '}}\n'
            + titlespacing + '{' + backslash + 'subsection}{0pt}{' + str(sub_spacing_before) + 'pt plus 3pt minus 1pt}{' + str(sub_spacing_after) + 'pt plus 2pt minus 1pt}\n'
            '\n'
            '% Subsubsection Style\n'
            + titleformat + '{' + backslash + 'subsubsection}\n'
            '  {' + normalfont + fontsize + '{' + subsub_fs_str + '}{' + subsub_ls_str + '}' + selectfont + subsub_ff_cmd + subsub_bold_str + ' ' + subsub_color_str + '}}\n'
            '  {' + backslash + 'thesubsubsection}{1em}{' + subsub_border_str + '}}\n'
            + titlespacing + '{' + backslash + 'subsubsection}{0pt}{' + str(subsub_spacing_before) + 'pt plus 2pt minus 1pt}{' + str(subsub_spacing_after) + 'pt plus 1pt minus 1pt}\n'
        )

        # 現在のファイルを読み込んで見出しスタイルセクションを置換
        with open(pdf_style_file, "r", encoding="utf-8") as f:
            content = f.read()

        import re

        # 見出しスタイルセクションを置換
        patterns = [
            r'% === Heading Styles.*?\\titlespacing\*\\{\\subsubsection\}.*?\n',
            r'% === 3\. Heading Styles.*?\\titlespacing\*\\{\\subsubsection\}.*?\n',
            r'% === 3\. Heading Styles.*?\\titlespacing\*\\{\\subsubsection\}.*?\n',
        ]

        new_content = content
        replaced = False
        for pattern in patterns:
            match = re.search(pattern, content, re.DOTALL)
            if match:
                new_content = content[:match.start()] + heading_styles.strip() + "\n" + content[match.end():]
                replaced = True
                break

        if not replaced and "% === Heading Styles" not in content:
            # 色定義セクションの後に挿入
            color_match = re.search(r'% === Color Definitions.*?\n', content, re.DOTALL)
            if color_match:
                insert_pos = color_match.end()
                new_content = content[:insert_pos] + "\n" + heading_styles.strip() + "\n" + content[insert_pos:]

        with open(pdf_style_file, "w", encoding="utf-8") as f:
            f.write(new_content)

    def _get_default_settings(self) -> Dict[str, Any]:
        """デフォルト設定を取得"""
        return {
            "version": "1.0",
            "project": {
                "title": "平和への課題：補遺",
                "author": "AJMUN 37th",
                "date": "2025-11-20"
            },
            "pdf": {
                "pageSize": "a4",
                "fontSize": 11,
                "margins": {
                    "top": "30mm",
                    "left": "25mm",
                    "height": "230mm"
                },
                "fonts": {
                    "main": "Harano Aji Mincho",
                    "sans": "Harano Aji Gothic"
                },
                "colors": {
                    "preset": "default",
                    "presets": {
                        "default": {
                            "name": "デフォルト（青）",
                            "colors": {
                                "titleblue": "#0d47a1",
                                "headerblue": "#0097a7",
                                "linkblue": "#1a73e8",
                                "lawheaderbg": "#3d5a80",
                                "lawheadertext": "#ffffff",
                                "lawbodybg": "#e8f0f8",
                                "lawborder": "#b8c8d8",
                                "railactive": "#2C5070",
                                "railinactive": "#E5E5E5",
                                "railcursor": "#C04020",
                                "hlyellow": "#A66B00",
                                "hlgreen": "#d9ead3",
                                "hlred": "#fce8e6",
                                "hlblue": "#e8f0fe",
                                "hlpurple": "#f3e8fd",
                                "blockquotebg": "#f0f8ff",
                            }
                        },
                        "blue": {
                            "name": "ブルー",
                            "colors": {
                                "titleblue": "#1565c0",
                                "headerblue": "#1976d2",
                                "linkblue": "#2196f3",
                                "lawheaderbg": "#0d47a1",
                                "lawheadertext": "#ffffff",
                                "lawbodybg": "#e3f2fd",
                                "lawborder": "#90caf9",
                                "railactive": "#1565c0",
                                "railinactive": "#e3f2fd",
                                "railcursor": "#ff6f00",
                                "hlyellow": "#A66B00",
                                "hlgreen": "#c8e6c9",
                                "hlred": "#ffcdd2",
                                "hlblue": "#bbdefb",
                                "hlpurple": "#e1bee7",
                                "blockquotebg": "#e3f2fd",
                            }
                        },
                        "green": {
                            "name": "グリーン",
                            "colors": {
                                "titleblue": "#2e7d32",
                                "headerblue": "#388e3c",
                                "linkblue": "#4caf50",
                                "lawheaderbg": "#1b5e20",
                                "lawheadertext": "#ffffff",
                                "lawbodybg": "#e8f5e9",
                                "lawborder": "#a5d6a7",
                                "railactive": "#2e7d32",
                                "railinactive": "#e8f5e9",
                                "railcursor": "#ff6f00",
                                "hlyellow": "#A66B00",
                                "hlgreen": "#c8e6c9",
                                "hlred": "#ffcdd2",
                                "hlblue": "#bbdefb",
                                "hlpurple": "#e1bee7",
                                "blockquotebg": "#e8f5e9",
                            }
                        },
                        "warm": {
                            "name": "ウォーム",
                            "colors": {
                                "titleblue": "#bf360c",
                                "headerblue": "#e65100",
                                "linkblue": "#ff6f00",
                                "lawheaderbg": "#bf360c",
                                "lawheadertext": "#ffffff",
                                "lawbodybg": "#fbe9e7",
                                "lawborder": "#ffcc80",
                                "railactive": "#bf360c",
                                "railinactive": "#fbe9e7",
                                "railcursor": "#1a237e",
                                "hlyellow": "#A66B00",
                                "hlgreen": "#c8e6c9",
                                "hlred": "#ffcdd2",
                                "hlblue": "#bbdefb",
                                "hlpurple": "#e1bee7",
                                "blockquotebg": "#fbe9e7",
                            }
                        }
                    },
                    "custom": {
                        "titleblue": "#0d47a1",
                        "headerblue": "#0097a7",
                        "linkblue": "#1a73e8",
                        "lawheaderbg": "#3d5a80",
                        "lawheadertext": "#ffffff",
                        "lawbodybg": "#e8f0f8",
                        "lawborder": "#b8c8d8",
                        "railactive": "#2C5070",
                        "railinactive": "#E5E5E5",
                        "railcursor": "#C04020",
                        "hlyellow": "#A66B00",
                        "hlgreen": "#d9ead3",
                        "hlred": "#fce8e6",
                        "hlblue": "#e8f0fe",
                        "hlpurple": "#f3e8fd",
                        "blockquotebg": "#f0f8ff",
                    }
                },
                "typography": {
                    "lineSpacing": 1.6,
                    "paragraphSpacing": 0.0,
                    "indentFirstLine": True,
                    "indentSize": 1.0,
                    "justify": True
                },
                "layout": {
                    "columns": 1,
                    "page_number_style": "number",
                    "page_number_position": "bottom-center",
                    "page_number_start": 1,
                    "show_page_number_first": False,
                    "header_style": "chapter-title"
                },
                "toc": {
                    "maxLevel": 3,
                    "dotLeader": True,
                    "includeChapters": True,
                    "includeSections": True,
                    "includeSubsections": True
                },
                "rules": {
                    "showPageBorder": False,
                    "showChapterDivider": False,
                    "chapterDividerStyle": "line",
                    "tableVerticalLines": False
                },
                "images": {
                    "defaultAlign": "center",
                    "captionStyle": "below",
                    "captionPosition": "center",
                    "margin": 12.0
                },
                "footnotes": {
                    "markStyle": "asterisk",
                    "placement": "bottom",
                    "fontScale": 0.9
                },
                "quotes": {
                    "style": "left-border",
                    "indent": 1.0,
                    "borderStyle": "solid",
                    "background": True
                },
                "codeBlocks": {
                    "theme": "github",
                    "fontFamily": "monospace",
                    "background": True,
                    "border": True
                },
                # 見出しスタイル設定（ユーザー指定のデフォルト値）
                "headings": {
                    "baseFontSize": 10.5,  # 本文基本フォントサイズ
                    "chapter": {
                        "fontSize": 16.0,
                        "fontFamily": "mincho",  # mincho or gothic
                        "alignment": "center",   # left, center, right
                        "color": "titleblue",    # titleblue, black, gray, or hex
                        "bold": True,
                        "spacingBefore": 0,
                        "spacingAfter": 20
                    },
                    "section": {
                        "fontSize": 14.0,
                        "fontFamily": "mincho",
                        "alignment": "left",
                        "color": "titleblue",
                        "bold": True,
                        "leftBorderStyle": "thick",  # none, single, thick, double
                        "leftBorderWidth": 2.0,
                        "spacingBefore": 12,
                        "spacingAfter": 6
                    },
                    "subsection": {
                        "fontSize": 12.0,
                        "fontFamily": "mincho",
                        "alignment": "left",
                        "color": "black",
                        "bold": True,
                        "leftBorderStyle": "none",
                        "leftBorderWidth": 1.0,
                        "spacingBefore": 10,
                        "spacingAfter": 5
                    },
                    "subsubsection": {
                        "fontSize": 10.5,
                        "fontFamily": "gothic",
                        "alignment": "left",
                        "color": "gray",
                        "bold": True,
                        "leftBorderStyle": "double",
                        "leftBorderWidth": 1.0,
                        "spacingBefore": 8,
                        "spacingAfter": 4
                    }
                },
                "footer_text": ""
            },
            "html": {
                "theme": "cosmo",
                "toc": True,
                "numberSections": True,
                "sidebarWidth": 280,
                "marginWidth": 300
            },
            "raksul": {
                "binding": "left",
                "trim_width_mm": 182,
                "trim_height_mm": 257,
                "bleed_mm": 3,
                "safe_margin_mm": 3,
                "body_pages": 232,
                "source_body_pages": 230,
                "paper_width_mm": 188,
                "paper_height_mm": 263,
                "inner_margin_mm": 18,
                "outer_margin_mm": 15,
                "top_margin_mm": 18,
                "bottom_margin_mm": 18,
                "spine_width_mm": 13.0,
                "spine_width_source": "template",
                "body_stock": "マット紙 70kg",
                "cover_stock": "マット紙 180kg",
                "cover_finish": "片面マットPP",
                "conference": {
                    "long_name": "37th All Japan Model United Nations",
                    "short_name": "AJMUN 37th",
                    "dates_en": "Dec 27-30, 2025"
                },
                "body_insert_pages": {
                    "enabled": True,
                    "front": {
                        "enabled": True,
                        "title": "平和への課題：補遺",
                        "subtitle": "Background Guide",
                        "conference_name": "37th All Japan Model United Nations",
                        "dates_en": "Dec 27-30, 2025"
                    },
                    "back": {
                        "enabled": True,
                        "lines": [
                            "平和への課題：補遺",
                            "AJMUN 37th",
                            "Dec 27-30, 2025"
                        ]
                    }
                },
                "cover": {
                    "inner_front_path": None,
                    "inner_back_path": None,
                    "inner_back_lines": [
                        "平和への課題：補遺",
                        "AJMUN 37th",
                        "Dec 27-30, 2025"
                    ],
                    "palette": {
                        "navy": "#102B44"
                    }
                }
            },
            "chapters": []
        }

    def update_footer_text(self, footer_text: str = None) -> Dict[str, Any]:
        """フッター文字を更新"""
        settings = self.load_settings()

        if footer_text is not None:
            # Noneではなく空文字列を設定
            settings["pdf"]["footer_text"] = footer_text if footer_text else ""

        self.save_settings(settings)
        return settings
