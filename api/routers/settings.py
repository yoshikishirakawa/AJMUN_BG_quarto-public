"""
Settings Router

プロジェクト設定のAPIエンドポイント
"""

from api.services.public_errors import public_http_error
from fastapi import APIRouter, HTTPException, Body, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Union
from pathlib import Path

from api.dependencies.auth import require_admin
from api.services.settings_service import SettingsService


router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(require_admin)])


# Pydanticモデル
class ProjectInfo(BaseModel):
    title: str
    author: str
    date: str


class PDFMargins(BaseModel):
    top: str
    left: str
    height: str


class PDFFonts(BaseModel):
    main: str
    sans: str


class PDFSettings(BaseModel):
    pageSize: str
    fontSize: int
    margins: PDFMargins
    fonts: PDFFonts


class Colors(BaseModel):
    link: Optional[str] = None
    titleblue: Optional[str] = None
    headerblue: Optional[str] = None
    lawheaderbg: Optional[str] = None
    lawheadertext: Optional[str] = None
    lawbodybg: Optional[str] = None
    lawborder: Optional[str] = None
    blockquotebg: Optional[str] = None
    railactive: Optional[str] = None
    railinactive: Optional[str] = None
    railcursor: Optional[str] = None
    hlyellow: Optional[str] = None
    hlgreen: Optional[str] = None
    hlred: Optional[str] = None
    hlblue: Optional[str] = None
    hlpurple: Optional[str] = None
    linkblue: Optional[str] = None


class ColorsData(BaseModel):
    preset: Optional[str] = None
    custom: Optional[Dict[str, str]] = None


class HTMLSettings(BaseModel):
    theme: str
    toc: bool
    numberSections: bool
    sidebarWidth: int
    marginWidth: int


class Chapter(BaseModel):
    file: str
    title: Optional[str] = None
    part: Optional[str] = None


class ChapterUpdate(BaseModel):
    chapters: List[Chapter]


# 新規モデル
class TypographySettings(BaseModel):
    lineSpacing: Optional[float] = None
    paragraphSpacing: Optional[float] = None
    indentFirstLine: Optional[bool] = None
    indentSize: Optional[float] = None
    justify: Optional[bool] = None


class LayoutSettings(BaseModel):
    columns: Optional[int] = None
    page_number_style: Optional[str] = None
    page_number_position: Optional[str] = None
    page_number_start: Optional[int] = None
    show_page_number_first: Optional[bool] = None
    header_style: Optional[str] = None


class TOCSettings(BaseModel):
    maxLevel: Optional[int] = None
    dotLeader: Optional[bool] = None
    includeChapters: Optional[bool] = None
    includeSections: Optional[bool] = None
    includeSubsections: Optional[bool] = None


class RuleSettings(BaseModel):
    showPageBorder: Optional[bool] = None
    showChapterDivider: Optional[bool] = None
    chapterDividerStyle: Optional[str] = None
    tableVerticalLines: Optional[bool] = None


class ImageSettings(BaseModel):
    defaultAlign: Optional[str] = None
    captionStyle: Optional[str] = None
    captionPosition: Optional[str] = None
    margin: Optional[float] = None


class FootnoteSettings(BaseModel):
    markStyle: Optional[str] = None
    placement: Optional[str] = None
    fontScale: Optional[float] = None


class QuoteSettings(BaseModel):
    style: Optional[str] = None
    indent: Optional[float] = None
    borderStyle: Optional[str] = None
    background: Optional[bool] = None


class CodeBlockSettings(BaseModel):
    theme: Optional[str] = None
    fontFamily: Optional[str] = None
    background: Optional[bool] = None
    border: Optional[bool] = None


# Heading level settings
class ChapterHeadingSettings(BaseModel):
    fontSize: Optional[float] = None
    fontFamily: Optional[str] = None  # 'mincho' or 'gothic'
    alignment: Optional[str] = None  # 'left', 'center', 'right'
    color: Optional[str] = None  # hex color or 'titleblue', 'black'
    bold: Optional[bool] = None
    spacingBefore: Optional[float] = None
    spacingAfter: Optional[float] = None


class SectionHeadingSettings(BaseModel):
    fontSize: Optional[float] = None
    fontFamily: Optional[str] = None
    alignment: Optional[str] = None
    color: Optional[str] = None
    bold: Optional[bool] = None
    leftBorderStyle: Optional[str] = None  # 'none', 'single', 'double', 'thick'
    leftBorderWidth: Optional[float] = None  # pt
    spacingBefore: Optional[float] = None
    spacingAfter: Optional[float] = None


class SubsectionHeadingSettings(BaseModel):
    fontSize: Optional[float] = None
    fontFamily: Optional[str] = None
    alignment: Optional[str] = None
    color: Optional[str] = None
    bold: Optional[bool] = None
    leftBorderStyle: Optional[str] = None
    leftBorderWidth: Optional[float] = None
    spacingBefore: Optional[float] = None
    spacingAfter: Optional[float] = None


class SubsubsectionHeadingSettings(BaseModel):
    fontSize: Optional[float] = None
    fontFamily: Optional[str] = None
    alignment: Optional[str] = None
    color: Optional[str] = None
    bold: Optional[bool] = None
    leftBorderStyle: Optional[str] = None
    leftBorderWidth: Optional[float] = None
    spacingBefore: Optional[float] = None
    spacingAfter: Optional[float] = None


class HeadingSettings(BaseModel):
    chapter: Optional[ChapterHeadingSettings] = None
    section: Optional[SectionHeadingSettings] = None
    subsection: Optional[SubsectionHeadingSettings] = None
    subsubsection: Optional[SubsubsectionHeadingSettings] = None
    baseFontSize: Optional[float] = None  # 本文基本フォントサイズ


def get_settings_service() -> SettingsService:
    """SettingsServiceのインスタンスを取得"""
    return SettingsService(project_root=".")


@router.get("/")
async def get_all_settings():
    """全設定を取得"""
    service = get_settings_service()
    return service.load_settings()


@router.put("/")
async def update_all_settings(settings: Dict[str, Any] = Body(...)):
    """全設定を更新"""
    service = get_settings_service()
    service.save_settings(settings)
    service.sync_to_quarto_yml()
    return {"status": "ok", "settings": settings}


@router.get("/project")
async def get_project_info():
    """プロジェクト基本情報を取得"""
    service = get_settings_service()
    settings = service.load_settings()
    return settings.get("project", {})


@router.put("/project")
async def update_project_info(info: ProjectInfo):
    """プロジェクト基本情報を更新"""
    service = get_settings_service()
    settings = service.update_project_info(
        title=info.title,
        author=info.author,
        date=info.date
    )
    service.sync_to_quarto_yml()
    return {"status": "ok", "project": settings.get("project", {})}


@router.get("/pdf")
async def get_pdf_settings():
    """PDF設定を取得"""
    service = get_settings_service()
    settings = service.load_settings()
    return settings.get("pdf", {})


@router.put("/pdf")
async def update_pdf_settings(settings: PDFSettings):
    """PDF基本設定を更新"""
    service = get_settings_service()
    service.update_pdf_settings(
        page_size=settings.pageSize,
        font_size=settings.fontSize,
        margins=settings.margins.dict(),
        fonts=settings.fonts.dict()
    )
    service.sync_to_quarto_yml()
    return {"status": "ok", "pdf": settings.dict()}


@router.put("/pdf/typography")
async def update_typography_settings(settings: TypographySettings):
    """組版設定を更新"""
    service = get_settings_service()
    result = service.update_typography(
        line_spacing=settings.lineSpacing,
        paragraph_spacing=settings.paragraphSpacing,
        indent_first_line=settings.indentFirstLine,
        indent_size=settings.indentSize,
        justify=settings.justify
    )
    service.sync_to_quarto_yml()
    return {"status": "ok", "typography": result.get("pdf", {}).get("typography", {})}


@router.put("/pdf/layout")
async def update_layout_settings(settings: LayoutSettings):
    """レイアウト設定を更新"""
    service = get_settings_service()
    result = service.update_layout_settings(
        columns=settings.columns,
        page_number_style=settings.page_number_style,
        page_number_position=settings.page_number_position,
        page_number_start=settings.page_number_start,
        show_page_number_first=settings.show_page_number_first,
        header_style=settings.header_style
    )
    service.sync_to_quarto_yml()
    return {"status": "ok", "layout": result.get("pdf", {}).get("layout", {})}


@router.put("/pdf/toc")
async def update_toc_settings(settings: TOCSettings):
    """目次設定を更新"""
    service = get_settings_service()
    result = service.update_toc_settings(
        max_level=settings.maxLevel,
        dot_leader=settings.dotLeader,
        include_chapters=settings.includeChapters,
        include_sections=settings.includeSections,
        include_subsections=settings.includeSubsections
    )
    service.sync_to_quarto_yml()
    return {"status": "ok", "toc": result.get("pdf", {}).get("toc", {})}


@router.put("/pdf/rules")
async def update_rule_settings(settings: RuleSettings):
    """罫線設定を更新"""
    service = get_settings_service()
    result = service.update_rule_settings(
        show_page_border=settings.showPageBorder,
        show_chapter_divider=settings.showChapterDivider,
        chapter_divider_style=settings.chapterDividerStyle,
        table_vertical_lines=settings.tableVerticalLines
    )
    service.sync_to_quarto_yml()
    return {"status": "ok", "rules": result.get("pdf", {}).get("rules", {})}


@router.put("/pdf/images")
async def update_image_settings(settings: ImageSettings):
    """画像設定を更新"""
    service = get_settings_service()
    result = service.update_image_settings(
        default_align=settings.defaultAlign,
        caption_style=settings.captionStyle,
        caption_position=settings.captionPosition,
        margin=settings.margin
    )
    service.sync_to_quarto_yml()
    return {"status": "ok", "images": result.get("pdf", {}).get("images", {})}


@router.put("/pdf/footnotes")
async def update_footnote_settings(settings: FootnoteSettings):
    """脚注設定を更新"""
    service = get_settings_service()
    result = service.update_footnote_settings(
        mark_style=settings.markStyle,
        placement=settings.placement,
        font_scale=settings.fontScale
    )
    service.sync_to_quarto_yml()
    return {"status": "ok", "footnotes": result.get("pdf", {}).get("footnotes", {})}


@router.put("/pdf/quotes")
async def update_quote_settings(settings: QuoteSettings):
    """引用設定を更新"""
    service = get_settings_service()
    result = service.update_quote_settings(
        style=settings.style,
        indent=settings.indent,
        border_style=settings.borderStyle,
        background=settings.background
    )
    service.sync_to_quarto_yml()
    return {"status": "ok", "quotes": result.get("pdf", {}).get("quotes", {})}


@router.put("/pdf/codeblocks")
async def update_code_block_settings(settings: CodeBlockSettings):
    """コードブロック設定を更新"""
    service = get_settings_service()
    result = service.update_code_block_settings(
        theme=settings.theme,
        font_family=settings.fontFamily,
        background=settings.background,
        border=settings.border
    )
    service.sync_to_quarto_yml()
    return {"status": "ok", "codeBlocks": result.get("pdf", {}).get("codeBlocks", {})}


class FooterTextUpdate(BaseModel):
    footer_text: str


@router.get("/pdf/footer")
async def get_footer_text():
    """フッター文字を取得"""
    service = get_settings_service()
    settings = service.load_settings()
    return {"footer_text": settings.get("pdf", {}).get("footer_text", "")}


@router.put("/pdf/footer")
async def update_footer_text(data: FooterTextUpdate):
    """フッター文字を更新"""
    service = get_settings_service()
    result = service.update_footer_text(footer_text=data.footer_text)
    service.sync_to_quarto_yml()
    return {"status": "ok", "footer_text": data.footer_text}


@router.get("/html")
async def get_html_settings():
    """HTML設定を取得"""
    service = get_settings_service()
    settings = service.load_settings()
    return settings.get("html", {})


@router.put("/html")
async def update_html_settings(settings: HTMLSettings):
    """HTML設定を更新"""
    service = get_settings_service()
    service.update_html_settings(
        theme=settings.theme,
        toc=settings.toc,
        number_sections=settings.numberSections,
        sidebar_width=settings.sidebarWidth,
        margin_width=settings.marginWidth
    )
    return {"status": "ok", "html": settings.dict()}


@router.get("/colors")
async def get_colors():
    """色設定を取得（プリセット含む）"""
    service = get_settings_service()
    settings = service.load_settings()
    return settings.get("pdf", {}).get("colors", {})


@router.put("/colors")
async def update_colors(data: ColorsData):
    """色設定を更新"""
    service = get_settings_service()

    colors_data = {}
    if data.preset is not None:
        colors_data["preset"] = data.preset
    if data.custom is not None:
        colors_data["custom"] = data.custom

    service.update_colors(colors_data)
    service.sync_to_quarto_yml()
    return {"status": "ok", "colors": colors_data}


@router.get("/chapters")
async def get_chapters():
    """章構成を取得"""
    service = get_settings_service()
    settings = service.load_settings()
    return settings.get("chapters", [])


@router.put("/chapters")
async def update_chapters(data: ChapterUpdate):
    """章構成を更新"""
    service = get_settings_service()
    chapter_dicts = [ch.dict() for ch in data.chapters]
    service.update_chapters(chapter_dicts)
    service.sync_to_quarto_yml()
    return {"status": "ok", "chapters": data.chapters}


@router.post("/sync")
async def sync_to_quarto():
    """設定を_quarto.ymlに同期"""
    service = get_settings_service()
    service.sync_to_quarto_yml()
    return {"status": "ok"}


@router.put("/pdf/headings")
async def update_heading_settings(settings: HeadingSettings):
    """見出しスタイル設定を更新"""
    service = get_settings_service()

    # 各レベルの設定を個別に処理
    if settings.chapter is not None:
        service.update_chapter_heading(
            font_size=settings.chapter.fontSize,
            font_family=settings.chapter.fontFamily,
            alignment=settings.chapter.alignment,
            color=settings.chapter.color,
            bold=settings.chapter.bold,
            spacing_before=settings.chapter.spacingBefore,
            spacing_after=settings.chapter.spacingAfter
        )

    if settings.section is not None:
        service.update_section_heading(
            font_size=settings.section.fontSize,
            font_family=settings.section.fontFamily,
            alignment=settings.section.alignment,
            color=settings.section.color,
            bold=settings.section.bold,
            left_border_style=settings.section.leftBorderStyle,
            left_border_width=settings.section.leftBorderWidth,
            spacing_before=settings.section.spacingBefore,
            spacing_after=settings.section.spacingAfter
        )

    if settings.subsection is not None:
        service.update_subsection_heading(
            font_size=settings.subsection.fontSize,
            font_family=settings.subsection.fontFamily,
            alignment=settings.subsection.alignment,
            color=settings.subsection.color,
            bold=settings.subsection.bold,
            left_border_style=settings.subsection.leftBorderStyle,
            left_border_width=settings.subsection.leftBorderWidth,
            spacing_before=settings.subsection.spacingBefore,
            spacing_after=settings.subsection.spacingAfter
        )

    if settings.subsubsection is not None:
        service.update_subsubsection_heading(
            font_size=settings.subsubsection.fontSize,
            font_family=settings.subsubsection.fontFamily,
            alignment=settings.subsubsection.alignment,
            color=settings.subsubsection.color,
            bold=settings.subsubsection.bold,
            left_border_style=settings.subsubsection.leftBorderStyle,
            left_border_width=settings.subsubsection.leftBorderWidth,
            spacing_before=settings.subsubsection.spacingBefore,
            spacing_after=settings.subsubsection.spacingAfter
        )

    if settings.baseFontSize is not None:
        service.update_base_font_size(settings.baseFontSize)

    service.sync_to_quarto_yml()
    return {"status": "ok", "headings": settings.dict()}


# ==============================
# 表紙・裏表紙設定エンドポイント
# ==============================
from api.services.cover_service import cover_service


class CoverConfigModel(BaseModel):
    enabled: bool
    fileId: Optional[str] = None
    fileName: Optional[str] = None
    mimeType: Optional[str] = None
    path: Optional[str] = None
    position: str = "before_toc"
    pageNumber: Optional[int] = None


class CoverUpdateRequest(BaseModel):
    cover_type: str  # "front" or "back"
    enabled: bool
    file_path: Optional[str] = None


@router.get("/covers")
async def get_cover_settings():
    """表紙・裏表紙設定を取得"""
    settings = cover_service.load_settings()
    return {
        "version": settings.get("version"),
        "covers": settings.get("covers"),
        "metadata": settings.get("metadata")
    }


@router.get("/covers/{cover_type}")
async def get_cover_status(cover_type: str):
    """特定の表紙（front/back）の状態を取得"""
    if cover_type not in ["front", "back"]:
        raise HTTPException(status_code=400, detail="Invalid cover type. Use 'front' or 'back'")

    status = cover_service.get_cover_status(cover_type)
    return status


@router.put("/covers/{cover_type}")
async def update_cover_config(cover_type: str, config: CoverConfigModel):
    """表紙・裏表紙設定を更新"""
    if cover_type not in ["front", "back"]:
        raise HTTPException(status_code=400, detail="Invalid cover type. Use 'front' or 'back'")

    try:
        cover = cover_service.update_cover(
            cover_type=cover_type,
            enabled=config.enabled,
            file_path=config.path,
            user_id="api_user"
        )
        return {
            "status": "ok",
            "cover": cover,
            "message": f"{cover_type} cover updated successfully"
        }
    except Exception as e:
        raise public_http_error(
            status_code=500,
            public_detail="Failed to update cover. Check server logs.",
            exc=e,
            log_context="Failed to update cover",
        )


@router.post("/covers/{cover_type}/regenerate")
async def regenerate_cover_config(cover_type: str):
    """LaTeX設定を再生成"""
    if cover_type not in ["front", "back"]:
        raise HTTPException(status_code=400, detail="Invalid cover type. Use 'front' or 'back'")

    try:
        config_path = cover_service.write_latex_config()
        return {
            "status": "ok",
            "message": "LaTeX config regenerated",
            "config_path": str(config_path)
        }
    except Exception as e:
        raise public_http_error(
            status_code=500,
            public_detail="Failed to regenerate config. Check server logs.",
            exc=e,
            log_context="Failed to regenerate config",
        )


@router.get("/covers/history")
async def get_cover_history(limit: int = 10):
    """表紙設定の変更履歴を取得"""
    settings = cover_service.load_settings()
    history = settings.get("history", [])
    return {
        "history": history[:limit],
        "total": len(history)
    }
