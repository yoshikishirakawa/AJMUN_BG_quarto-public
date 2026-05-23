"""
Project Management Router
"""

from api.services.public_errors import public_http_error
import logging
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from pydantic import BaseModel, Field, ValidationError, field_validator
from typing import List, Optional, Dict
from datetime import datetime
import os
import json
import re
from pathlib import Path

from api.dependencies.auth import require_admin, require_editor_or_admin
from api.services.project_store import ProjectStore, ChapterType
from api.services.file_safety import (
    FileSafetyError,
    resolve_content_markdown_path,
    resolve_uploaded_image_path,
    safe_upload_filename,
    unique_content_path,
)
from api.services.chapter_ids import next_chapter_id
from api.services.upload_validation import (
    ALLOWED_IMAGE_SUFFIXES,
    MAX_IMAGE_UPLOAD_BYTES,
    read_upload_file_limited,
    validate_image_upload,
)

logger = logging.getLogger(__name__)

SAFE_IMAGE_PATH_RE = re.compile(
    r"^/?assets/(uploads|imported)/[A-Za-z0-9._/-]+\.(jpg|jpeg|png|gif|webp)$",
    re.IGNORECASE,
)
SAFE_WIDTH_RE = re.compile(r"^(a[345]|100%|[1-9][0-9]?%|[0-9]+(\.[0-9]+)?(mm|cm|in|px))$")

router = APIRouter(dependencies=[Depends(require_editor_or_admin)])
project_store = ProjectStore()


def is_raw_config_editor_enabled() -> bool:
    value = os.getenv("ENABLE_RAW_CONFIG_EDITOR", "false").strip().lower()
    return value in {"1", "true", "yes", "on"}


def require_raw_config_editor_enabled() -> None:
    if not is_raw_config_editor_enabled():
        raise HTTPException(status_code=403, detail="Raw Quarto config editor is disabled")


class ImageItem(BaseModel):
    """Image item."""
    path: str
    caption: Optional[str] = None
    width: Optional[str] = "a4"           # a4, a3, a5, 100%, or custom
    fit: Optional[str] = "stretch"        # stretch, contain
    position: Optional[str] = "center"    # center, top, bottom

    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        value = (value or "").strip()
        if not SAFE_IMAGE_PATH_RE.fullmatch(value) or ".." in value or "\\" in value:
            raise ValueError("Invalid image path")
        return value

    @field_validator("width")
    @classmethod
    def validate_width(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        value = value.strip()
        if not SAFE_WIDTH_RE.fullmatch(value):
            raise ValueError("Invalid image width")
        return value

    @field_validator("fit")
    @classmethod
    def validate_fit(cls, value: Optional[str]) -> Optional[str]:
        if value not in {"stretch", "contain", "cover"}:
            raise ValueError("Invalid image fit")
        return value

    @field_validator("position")
    @classmethod
    def validate_position(cls, value: Optional[str]) -> Optional[str]:
        if value not in {"center", "top", "bottom"}:
            raise ValueError("Invalid image position")
        return value

class ChapterInfo(BaseModel):
    """Chapter information."""
    id: str
    title: str
    google_doc_id: Optional[str] = Field(default=None, alias="googleDocId")
    local_path: str = Field(alias="localPath")
    order: int
    last_sync: Optional[datetime] = Field(default=None, alias="lastSync")
    enabled: bool = True
    type: str = Field(default=ChapterType.DOCUMENT.value)
    images: List[ImageItem] = Field(default_factory=list)
    is_appendix: bool = Field(default=False, alias="isAppendix")

    class Config:
        populate_by_name = True


class ProjectMetadata(BaseModel):
    """Project metadata."""
    name: str
    author: str
    date: Optional[str] = None
    description: Optional[str] = None


class PdfStyle(BaseModel):
    documentclass: str = "scrreprt"
    classoption: List[str] = []
    geometry: List[str] = ["top=30mm", "left=20mm", "height=230mm"]
    mainfont: Optional[str] = "Harano Aji Mincho"
    sansfont: Optional[str] = "Harano Aji Gothic"

    class Config:
        populate_by_name = True


class HtmlStyle(BaseModel):
    toc: bool = True
    number_sections: bool = Field(default=True, alias="numberSections")
    code_fold: bool = Field(default=True, alias="codeFold")
    theme: str = "cosmo"

    class Config:
        populate_by_name = True


class ProjectStyle(BaseModel):
    """Project style settings."""
    # Global/legacy
    primary_color: str = Field(default="#1a73e8", alias="primaryColor")
    font_family: Optional[str] = Field(default=None, alias="fontFamily")
    
    # New specific sections
    pdf: PdfStyle = Field(default_factory=PdfStyle)
    html: HtmlStyle = Field(default_factory=HtmlStyle)
    
    custom_css: Optional[str] = Field(default=None, alias="customCss")

    class Config:
        populate_by_name = True


class Project(BaseModel):
    """Full project configuration."""
    metadata: ProjectMetadata
    chapters: List[ChapterInfo]
    chapter_order: Optional[List[str]] = Field(default=None, alias="chapterOrder")
    style: ProjectStyle
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")

    class Config:
        populate_by_name = True


class ChapterOrderUpdate(BaseModel):
    """Chapter order update request."""
    chapter_ids: Optional[List[str]] = None
    order: Optional[List[str]] = None
    chapter_order: Optional[List[str]] = Field(default=None, alias="chapterOrder")

    class Config:
        populate_by_name = True


class ChapterCreate(BaseModel):
    """Chapter creation request."""
    id: Optional[str] = None
    title: str
    google_doc_id: Optional[str] = Field(default=None, alias="googleDocId")
    local_path: Optional[str] = Field(default=None, alias="localPath")
    order: Optional[int] = None
    last_sync: Optional[datetime] = Field(default=None, alias="lastSync")
    enabled: bool = True
    type: str = Field(default=ChapterType.DOCUMENT.value)
    images: List[ImageItem] = Field(default_factory=list)
    is_appendix: bool = Field(default=False, alias="isAppendix")

    class Config:
        populate_by_name = True


class ChapterUpdate(BaseModel):
    """Partial chapter update request."""
    title: Optional[str] = None
    google_doc_id: Optional[str] = Field(default=None, alias="googleDocId")
    local_path: Optional[str] = Field(default=None, alias="localPath")
    order: Optional[int] = None
    last_sync: Optional[datetime] = Field(default=None, alias="lastSync")
    enabled: Optional[bool] = None
    type: Optional[str] = None
    images: Optional[List[ImageItem]] = None
    is_appendix: Optional[bool] = Field(default=None, alias="isAppendix")

    class Config:
        populate_by_name = True


def _raise_bad_path(exc: FileSafetyError):
    raise public_http_error(status_code=400, public_detail="Invalid request. Check server logs.", exc=exc, log_context="ValueError in project_router")


def _next_chapter_id(chapters: list[dict]) -> str:
    return next_chapter_id(chapters)


@router.get("/")
async def get_project() -> Project:
    """
    Get the current project configuration.
    """
    try:
        project = await project_store.load()
        return Project(**project)
    except FileNotFoundError:
        logger.warning("Project configuration file not found")
        raise HTTPException(status_code=404, detail="Project not found")
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in project configuration: {e}")
        raise HTTPException(status_code=500, detail="Project configuration is corrupted")
    except ValidationError as e:
        logger.error(f"Project configuration validation failed: {e}")
        raise public_http_error(status_code=422, public_detail="Invalid project structure. Check server logs.", exc=e, log_context="ValueError in update_project_structure")
    except Exception as e:
        logger.exception(f"Unexpected error loading project")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/")
async def create_project(project: Project) -> Project:
    """
    Create a new project configuration.
    """
    try:
        await project_store.save(project.model_dump(by_alias=True))
        return project
    except PermissionError as e:
        logger.error(f"Permission denied creating project: {e}")
        raise HTTPException(status_code=403, detail="Permission denied creating project")
    except OSError as e:
        logger.error(f"File system error creating project: {e}")
        raise HTTPException(status_code=500, detail="Failed to create project file")
    except Exception as e:
        logger.exception(f"Unexpected error creating project")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/")
async def update_project(project: Project) -> Project:
    """
    Update the project configuration.
    """
    try:
        project_data = project.model_dump(by_alias=True)
        project_data["updatedAt"] = datetime.now().isoformat() + "Z"
        await project_store.save(project_data)
        return project
    except PermissionError as e:
        logger.error(f"Permission denied updating project: {e}")
        raise HTTPException(status_code=403, detail="Permission denied updating project")
    except OSError as e:
        logger.error(f"File system error updating project: {e}")
        raise HTTPException(status_code=500, detail="Failed to update project file")
    except Exception as e:
        logger.exception(f"Unexpected error updating project")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/metadata")
async def get_metadata() -> ProjectMetadata:
    """
    Get project metadata.
    """
    project = await project_store.load()
    return ProjectMetadata(**project["metadata"])


@router.put("/metadata")
async def update_metadata(metadata: ProjectMetadata) -> ProjectMetadata:
    """
    Update project metadata.
    """
    project = await project_store.load()
    project["metadata"] = metadata.model_dump()
    project["updatedAt"] = datetime.now().isoformat() + "Z"
    await project_store.save(project)
    return metadata


@router.get("/chapters")
async def get_chapters() -> List[ChapterInfo]:
    """
    Get all chapters.
    """
    project = await project_store.load()
    return [ChapterInfo(**ch) for ch in project["chapters"]]


@router.post("/chapters")
async def add_chapter(chapter: ChapterCreate) -> ChapterInfo:
    """
    Add a new chapter.
    """
    project = await project_store.load()
    chapter_id = chapter.id or _next_chapter_id(project["chapters"])
    if any(ch.get("id") == chapter_id for ch in project["chapters"]):
        raise HTTPException(status_code=400, detail="Chapter ID already exists")

    try:
        local_path = chapter.local_path or unique_content_path(project_store.project_root, chapter.title)
        resolve_content_markdown_path(project_store.project_root, local_path)
    except FileSafetyError as exc:
        _raise_bad_path(exc)

    chapter_data = chapter.model_dump(by_alias=True, exclude_none=True)
    chapter_data.update({
        "id": chapter_id,
        "localPath": local_path,
        "order": chapter.order if chapter.order is not None else len(project["chapters"]),
        "lastSync": chapter.last_sync,
        "images": [img.model_dump() for img in chapter.images],
        "enabled": chapter.enabled,
        "type": chapter.type,
        "isAppendix": chapter.is_appendix,
    })

    project["chapters"].append(chapter_data)
    project["updatedAt"] = datetime.now().isoformat() + "Z"
    await project_store.save(project)
    return ChapterInfo(**chapter_data)


@router.get("/chapters/{chapter_id}")
async def get_chapter(chapter_id: str) -> ChapterInfo:
    """
    Get a single chapter.
    """
    project = await project_store.load()
    for ch in project["chapters"]:
        if ch["id"] == chapter_id:
            return ChapterInfo(**ch)
    raise HTTPException(status_code=404, detail="Chapter not found")


@router.put("/chapters/order")
async def update_chapter_order(update: ChapterOrderUpdate) -> List[ChapterInfo]:
    """
    Update chapter order.
    """
    project = await project_store.load()
    raw_order = update.chapter_order or update.order or update.chapter_ids
    if not raw_order:
        raise HTTPException(status_code=400, detail="chapter_ids is required")

    chapter_ids = [chapter_id for chapter_id in raw_order if chapter_id != "__toc__"]
    if not chapter_ids:
        raise HTTPException(status_code=400, detail="chapter_ids is required")

    chapter_map = {ch["id"]: ch for ch in project["chapters"]}
    unknown_ids = [chapter_id for chapter_id in chapter_ids if chapter_id not in chapter_map]
    if unknown_ids:
        raise HTTPException(status_code=400, detail=f"Unknown chapter IDs: {', '.join(unknown_ids)}")

    reordered = []
    seen = set()
    for i, chapter_id in enumerate(chapter_ids):
        if chapter_id in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate chapter ID: {chapter_id}")
        seen.add(chapter_id)
        chapter = chapter_map[chapter_id]
        chapter["order"] = i
        reordered.append(chapter)

    for chapter in project["chapters"]:
        if chapter["id"] not in seen:
            chapter["order"] = len(reordered)
            reordered.append(chapter)

    project["chapters"] = reordered
    if update.chapter_order or "__toc__" in raw_order:
        project["chapterOrder"] = raw_order
    elif "chapterOrder" in project:
        project["chapterOrder"] = [chapter["id"] for chapter in reordered]
    await project_store.save(project)

    # Also update _quarto.yml
    await project_store.sync_quarto_yml(reordered)

    return [ChapterInfo(**ch) for ch in reordered]


@router.put("/chapters/{chapter_id}")
async def update_chapter(chapter_id: str, chapter: ChapterUpdate) -> ChapterInfo:
    """
    Update a chapter.
    """
    project = await project_store.load()
    for i, ch in enumerate(project["chapters"]):
        if ch["id"] == chapter_id:
            updates = chapter.model_dump(by_alias=True, exclude_unset=True)
            if "localPath" in updates:
                try:
                    resolve_content_markdown_path(project_store.project_root, updates["localPath"])
                except FileSafetyError as exc:
                    _raise_bad_path(exc)
            if "images" in updates and updates["images"] is not None:
                updates["images"] = [img.model_dump() if isinstance(img, ImageItem) else img for img in chapter.images or []]
            project["chapters"][i] = {**ch, **updates, "id": chapter_id}
            project["updatedAt"] = datetime.now().isoformat() + "Z"
            await project_store.save(project)
            return ChapterInfo(**project["chapters"][i])
    raise HTTPException(status_code=404, detail="Chapter not found")


@router.delete("/chapters/{chapter_id}")
async def delete_chapter(chapter_id: str) -> dict:
    """
    Delete a chapter.
    """
    project = await project_store.load()
    
    # Check if we need to remove the local file
    chapter_to_delete = next((ch for ch in project["chapters"] if ch["id"] == chapter_id), None)
    if chapter_to_delete:
        # If it's an image group, we might want to clean up the generated .qmd file
        # But for safety, maybe we just leave it or rename it?
        # For now, let's just remove from the list. 
        pass

    project["chapters"] = [
        ch for ch in project["chapters"] if ch["id"] != chapter_id
    ]
    await project_store.save(project)
    return {"status": "deleted", "chapter_id": chapter_id}


class ImageGroupCreate(BaseModel):
    title: str


@router.post("/chapters/image-group")
async def create_image_group(data: ImageGroupCreate) -> ChapterInfo:
    """
    Create a new Image Group chapter.
    """
    project = await project_store.load()
    
    # Generate ID
    existing_ids = [int(ch["id"].replace("ch_", "")) for ch in project["chapters"] if ch["id"].startswith("ch_") and ch["id"].replace("ch_", "").isdigit()]
    next_id_num = max(existing_ids) + 1 if existing_ids else 1
    chapter_id = f"ch_{next_id_num:03d}"
    
    # Define local path
    # Using content/img_{id}.qmd
    local_path = f"content/img_{chapter_id}.qmd"
    
    new_chapter = {
        "id": chapter_id,
        "title": data.title,
        "googleDocId": None,
        "localPath": local_path,
        "order": len(project["chapters"]),
        "lastSync": None,
        "enabled": True,
        "type": ChapterType.IMAGE_GROUP.value,
        "images": []
    }
    
    project["chapters"].append(new_chapter)
    await project_store.save(project) # This triggers _regenerate_image_groups creating the file
    
    return ChapterInfo(**new_chapter)


class FullpageImageCreate(BaseModel):
    title: str


@router.post("/chapters/fullpage-image")
async def create_fullpage_image_chapter(data: FullpageImageCreate) -> ChapterInfo:
    """
    Create a new Full-Page Image chapter.
    """
    project = await project_store.load()

    # Generate ID (same pattern as image_group)
    existing_ids = [int(ch["id"].replace("ch_", "")) for ch in project["chapters"] if ch["id"].startswith("ch_") and ch["id"].replace("ch_", "").isdigit()]
    next_id_num = max(existing_ids) + 1 if existing_ids else 1
    chapter_id = f"ch_{next_id_num:03d}"

    # Define local path - using fullpage_ prefix for clarity
    local_path = f"content/fullpage_{chapter_id}.qmd"

    new_chapter = {
        "id": chapter_id,
        "title": data.title,
        "googleDocId": None,
        "localPath": local_path,
        "order": len(project["chapters"]),
        "lastSync": None,
        "enabled": True,
        "type": ChapterType.FULLPAGE_IMAGE.value,
        "images": []
    }

    project["chapters"].append(new_chapter)
    await project_store.save(project)  # Triggers _regenerate_image_groups creating the file

    return ChapterInfo(**new_chapter)


@router.post("/chapters/{chapter_id}/images")
async def upload_chapter_image(
    chapter_id: str,
    file: UploadFile = File(...),
    width: Optional[str] = "a4",
    fit: Optional[str] = "stretch",
    position: Optional[str] = "center",
) -> ImageItem:
    """
    Upload an image to a chapter (Image Group).
    """
    project = await project_store.load()
    chapter = next((ch for ch in project["chapters"] if ch["id"] == chapter_id), None)
    
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
        
    # Allow uploads for any chapter type (for inline images in text chapters)
    # if chapter.get("type") != ChapterType.IMAGE_GROUP.value:
    #      raise HTTPException(status_code=400, detail="Chapter is not an Image Group")
         
    upload_dir = project_store.project_root / "assets" / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    try:
        filename = safe_upload_filename(
            file.filename,
            prefix=chapter_id,
            allowed_suffixes=ALLOWED_IMAGE_SUFFIXES,
        )
        file_path = resolve_uploaded_image_path(project_store.project_root, filename)
    except FileSafetyError as exc:
        _raise_bad_path(exc)
    try:
        image_data = await read_upload_file_limited(file)
        validate_image_upload(file, image_data)
    except FileSafetyError as exc:
        if "too large" in str(exc).lower():
            raise public_http_error(status_code=413, public_detail="File too large. Check server logs.", exc=exc, log_context="FileSafetyError (too large) in project_router")
        _raise_bad_path(exc)
    
    with open(file_path, "wb") as buffer:
        buffer.write(image_data)
        
    # Relative path for usage in qmd (with leading slash for absolute path from web root)
    relative_path = f"/assets/uploads/{filename}"

    new_image = {
        "path": relative_path,
        "caption": None,
        "width": width,
        "fit": fit,
        "position": position
    }
    
    if "images" not in chapter:
        chapter["images"] = []
        
    chapter["images"].append(new_image)
    
    await project_store.save(project) # Triggers generation
    
    return ImageItem(**new_image)


@router.put("/chapters/{chapter_id}/images")
async def update_chapter_images(chapter_id: str, images: List[ImageItem]) -> List[ImageItem]:
    """
    Update image list for a chapter (Reorder/Delete).
    """
    project = await project_store.load()
    chapter = next((ch for ch in project["chapters"] if ch["id"] == chapter_id), None)
    
    if not chapter:
        raise HTTPException(status_code=404, detail="Chapter not found")
        
    chapter["images"] = [img.model_dump() for img in images]
    
    await project_store.save(project)
    
    return images


@router.get("/style")
async def get_style() -> ProjectStyle:
    """
    Get project style settings.
    """
    project = await project_store.load()
    return ProjectStyle(**project.get("style", {}))


@router.put("/style")
async def update_style(style: ProjectStyle) -> ProjectStyle:
    """
    Update project style settings.
    """
    project = await project_store.load()
    project["style"] = style.model_dump(by_alias=True)
    project["updatedAt"] = datetime.now().isoformat() + "Z"
    await project_store.save(project)
    return style


class ChapterContent(BaseModel):
    """Chapter content update."""
    content: str


@router.get("/chapters/{chapter_id}/content")
async def get_chapter_content(chapter_id: str) -> dict:
    """
    Get markdown content of a chapter.
    """
    content = await project_store.get_chapter_content(chapter_id)
    if content is None:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return {"content": content}


@router.get("/stats")
async def get_project_stats():
    """
    Get project statistics.
    """
    return await project_store.get_stats()


@router.put("/chapters/{chapter_id}/content")
async def update_chapter_content(chapter_id: str, update: ChapterContent) -> dict:
    """
    Update markdown content of a chapter.
    """
    success = await project_store.update_chapter_content(chapter_id, update.content)
    if not success:
        raise HTTPException(status_code=404, detail="Chapter not found")
    return {"status": "updated"}


class ConversionRule(BaseModel):
    """Custom conversion rule."""
    pattern: str
    replacement: str


class ConversionRulesUpdate(BaseModel):
    """Conversion rules update request."""
    rules: List[ConversionRule]


@router.get("/rules")
async def get_rules() -> List[ConversionRule]:
    """
    Get current conversion rules.
    """
    project = await project_store.load()
    rules = project.get("conversionRules", [])
    return [ConversionRule(**r) for r in rules]


@router.put("/rules")
async def update_rules(update: ConversionRulesUpdate) -> List[ConversionRule]:
    """
    Update conversion rules.
    """
    try:
        rules_data = [r.model_dump() for r in update.rules]
        await project_store.update_conversion_rules(rules_data)
        return update.rules
    except PermissionError as e:
        logger.error(f"Permission denied updating conversion rules: {e}")
        raise HTTPException(status_code=403, detail="Permission denied updating rules")
    except OSError as e:
        logger.error(f"File system error updating conversion rules: {e}")
        raise HTTPException(status_code=500, detail="Failed to update rules")
    except Exception as e:
        logger.exception(f"Unexpected error updating conversion rules")
        raise HTTPException(status_code=500, detail="Internal server error")


class ConfigUpdate(BaseModel):
    content: str


@router.get("/config/raw", dependencies=[Depends(require_admin)])
async def get_raw_config() -> dict:
    """
    Get raw _quarto.yml content.
    """
    require_raw_config_editor_enabled()
    try:
        content = await project_store.get_raw_config()
        return {"content": content}
    except FileNotFoundError:
        logger.warning("Quarto config file not found")
        raise HTTPException(status_code=404, detail="Quarto config not found")
    except PermissionError as e:
        logger.error(f"Permission denied reading config: {e}")
        raise HTTPException(status_code=403, detail="Permission denied reading config")
    except Exception as e:
        logger.exception(f"Unexpected error reading config")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/config/raw", dependencies=[Depends(require_admin)])
async def update_raw_config(update: ConfigUpdate) -> dict:
    """
    Update raw _quarto.yml content.
    """
    require_raw_config_editor_enabled()
    try:
        await project_store.update_raw_config(update.content)
        return {"status": "updated"}
    except ValueError as e:
        raise public_http_error(status_code=400, public_detail="Invalid request. Check server logs.", exc=e, log_context="Exception in project_router")
    except PermissionError as e:
        logger.error(f"Permission denied updating config: {e}")
        raise HTTPException(status_code=403, detail="Permission denied updating config")
    except OSError as e:
        logger.error(f"File system error updating config: {e}")
        raise HTTPException(status_code=500, detail="Failed to update config")
    except Exception as e:
        logger.exception(f"Unexpected error updating config")
        raise HTTPException(status_code=500, detail="Internal server error")


class ImageInfo(BaseModel):
    """Image information."""
    filename: str
    path: str
    size: int
    created_at: str = Field(alias="createdAt")
    url: str
    used_in_chapters: List[str] = Field(default_factory=list, alias="usedInChapters")

    class Config:
        populate_by_name = True


@router.get("/images")
async def get_all_images() -> List[ImageInfo]:
    """
    Get all uploaded images with metadata.
    """
    upload_dir = project_store.project_root / "assets" / "uploads"

    if not upload_dir.exists():
        return []

    # Load project to find which chapters use each image
    project = await project_store.load()
    chapter_image_map: Dict[str, List[str]] = {}

    for ch in project.get("chapters", []):
        chapter_id = ch.get("id", "")
        # Check images array
        for img in ch.get("images", []):
            img_path = img.get("path", "")
            filename = img_path.split("/")[-1] if img_path else ""
            if filename:
                if filename not in chapter_image_map:
                    chapter_image_map[filename] = []
                chapter_image_map[filename].append(chapter_id)

        # Also check content for image references
        try:
            content = await project_store.get_chapter_content(chapter_id)
            if content:
                # Find image references in markdown
                for img_path in re.findall(r'!\[.*?\]\((/assets/uploads/[^)]+)\)', content):
                    filename = img_path.split("/")[-1]
                    if filename not in chapter_image_map:
                        chapter_image_map[filename] = []
                    if chapter_id not in chapter_image_map[filename]:
                        chapter_image_map[filename].append(chapter_id)
        except Exception as e:
            print(f"Error checking content for {chapter_id}: {e}")
            pass

    images = []
    for file_path in upload_dir.iterdir():
        if file_path.is_file():
            stat = file_path.stat()
            filename = file_path.name
            created_at = datetime.fromtimestamp(stat.st_ctime).isoformat()
            size = stat.st_size

            # Check which chapters use this image
            used_in = chapter_image_map.get(filename, [])

            images.append(ImageInfo(
                filename=filename,
                path=f"/assets/uploads/{filename}",
                size=size,
                created_at=created_at,
                url=f"/assets/uploads/{filename}",
                used_in_chapters=used_in
            ))

    # Sort by created_at descending
    images.sort(key=lambda x: x.created_at, reverse=True)
    return images


@router.delete("/images/{filename}")
async def delete_image(filename: str) -> dict:
    """
    Delete an uploaded image.
    """
    try:
        file_path = resolve_uploaded_image_path(project_store.project_root, filename, must_exist=True)
    except FileSafetyError as exc:
        _raise_bad_path(exc)

    # Remove from project chapters' image lists
    project = await project_store.load()
    modified = False

    for ch in project.get("chapters", []):
        images = ch.get("images", [])
        original_count = len(images)
        ch["images"] = [img for img in images if img.get("path", "").split("/")[-1] != filename]
        if len(ch["images"]) != original_count:
            modified = True

    if modified:
        await project_store.save(project)

    # Delete the file
    file_path.unlink()

    return {"status": "deleted", "filename": filename}


@router.put("/images/{filename}")
async def replace_image(filename: str, file: UploadFile = File(...)) -> ImageInfo:
    """
    Replace an existing image with a new one.
    """
    try:
        file_path = resolve_uploaded_image_path(project_store.project_root, filename, must_exist=True)
    except FileSafetyError as exc:
        _raise_bad_path(exc)

    if file_path.suffix.lower() not in ALLOWED_IMAGE_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported image type")

    try:
        image_data = await read_upload_file_limited(file)
        validate_image_upload(file, image_data, expected_suffix=file_path.suffix.lower())
    except FileSafetyError as exc:
        if "too large" in str(exc).lower():
            raise public_http_error(status_code=413, public_detail="File too large. Check server logs.", exc=exc, log_context="FileSafetyError (too large) in project_router")
        _raise_bad_path(exc)

    # Replace the file
    with open(file_path, "wb") as buffer:
        buffer.write(image_data)

    stat = file_path.stat()
    created_at = datetime.fromtimestamp(stat.st_ctime).isoformat()

    # Find which chapters use this image
    project = await project_store.load()
    used_in = []
    for ch in project.get("chapters", []):
        chapter_id = ch.get("id", "")
        for img in ch.get("images", []):
            if img.get("path", "").split("/")[-1] == filename:
                used_in.append(chapter_id)

    return ImageInfo(
        filename=filename,
        path=f"/assets/uploads/{filename}",
        size=stat.st_size,
        created_at=created_at,
        url=f"/assets/uploads/{filename}",
        used_in_chapters=used_in
    )
