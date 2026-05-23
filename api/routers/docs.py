"""
Google Docs API Router
"""

from api.services.public_errors import public_http_error
import re
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from typing import List, Optional, Any
import datetime
import os
import logging

from api.dependencies.auth import require_editor_or_admin
from api.services.file_safety import FileSafetyError, resolve_content_markdown_path, unique_content_path
from api.services.docs_fetcher import DocsFetcherService
from api.services.project_store import ProjectStore
from api.services.chapter_ids import next_chapter_id
from api.services.upload_validation import MAX_MARKDOWN_UPLOAD_BYTES, read_text_upload_limited

router = APIRouter(dependencies=[Depends(require_editor_or_admin)])
docs_service = DocsFetcherService()
project_store = ProjectStore()
logger = logging.getLogger(__name__)


def is_google_integration_enabled() -> bool:
    value = os.getenv("GOOGLE_INTEGRATION_ENABLED", "auto").strip().lower()
    return value not in {"0", "false", "off", "no", "disabled"}


def ensure_google_integration_enabled() -> None:
    if not is_google_integration_enabled():
        raise HTTPException(status_code=503, detail="Google integration is disabled")


def slugify_filename(name: str) -> str:
    stem = re.sub(r"[^\w\-]+", "_", name, flags=re.UNICODE).strip("_")
    return stem or "imported_document"


def normalize_markdown_content(content: str) -> str:
    return content.replace("\r\n", "\n").replace("\r", "\n")


def _bad_path(exc: FileSafetyError):
    raise public_http_error(status_code=400, public_detail="Invalid request. Check server logs.", exc=exc, log_context="ValueError in docs_router")

class DocInfo(BaseModel):
    """Google Doc information."""
    id: str
    name: str
    mimeType: Optional[str] = None
    modifiedTime: Optional[str] = None
    webViewLink: Optional[str] = None
    thumbnailLink: Optional[str] = None
    owners: Optional[List[Any]] = None

class DocsListResponse(BaseModel):
    files: List[DocInfo]
    next_page_token: Optional[str] = None

class ImportRequest(BaseModel):
    doc_id: str
    title: Optional[str] = None

class ImportResult(BaseModel):
    status: str
    message: str
    chapter: Optional[dict] = None

class SyncResult(BaseModel):
    status: str
    message: str
    doc_id: str
    updated_at: str


@router.post("/import-markdown", response_model=ImportResult)
async def import_markdown(
    file: UploadFile = File(...),
    title: Optional[str] = Form(default=None),
):
    """
    Import a Markdown file without transforming body content beyond line-ending normalization.
    """
    filename = file.filename or "imported.md"
    suffix = Path(filename).suffix.lower()
    if suffix not in {".md", ".markdown", ".qmd"}:
        raise HTTPException(status_code=400, detail="Markdown file is required")

    try:
        text = await read_text_upload_limited(
            file,
            max_bytes=MAX_MARKDOWN_UPLOAD_BYTES,
            too_large_message="Markdown file is too large",
            decode_error_message="Markdown file must be UTF-8 encoded",
        )
    except FileSafetyError as exc:
        status_code = 413 if "too large" in str(exc).lower() else 400
        raise public_http_error(status_code=status_code, public_detail="File upload error. Check server logs.", exc=exc, log_context="FileSafetyError in docs_router")

    normalized_content = normalize_markdown_content(text)
    project_data = await project_store.load()
    current_chapters = project_data.get("chapters", [])
    chapter_id = next_chapter_id(current_chapters)

    base_title = title or Path(filename).stem
    try:
        rel_path = unique_content_path(project_store.project_root, base_title, suffix=".md")
        target_path = resolve_content_markdown_path(project_store.project_root, rel_path)
    except FileSafetyError as exc:
        _bad_path(exc)

    with open(target_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(normalized_content)

    chapter_data = {
        "id": chapter_id,
        "title": base_title,
        "googleDocId": None,
        "localPath": rel_path,
        "order": len(current_chapters),
        "lastSync": None,
        "enabled": True,
        "type": "document",
        "images": [],
        "isAppendix": False,
    }
    await project_store.add_chapter(chapter_data)

    return ImportResult(
        status="success",
        message=f"Successfully imported '{base_title}'",
        chapter=chapter_data,
    )

@router.get("/list", response_model=DocsListResponse)
async def list_docs(
    q: Optional[str] = None,
    folder_id: Optional[str] = None,
    page_token: Optional[str] = None,
    owned_only: bool = False,
):
    """
    List Google Docs accessible to user.
    
    Args:
        q: Search query string
        folder_id: Optional folder ID to filter by
        page_token: Pagination token
        owned_only: If true, only return docs owned by the user
    """
    try:
        ensure_google_integration_enabled()
        if owned_only:
            # Get user email from auth service
            from api.services.google_auth import GoogleAuthService
            auth_service = GoogleAuthService()
            status = await auth_service.get_status()
            
            if not status.get("authenticated") or not status.get("email"):
                raise HTTPException(
                    status_code=401,
                    detail="Not authenticated or email not available"
                )
            
            user_email = status["email"]
            result = await docs_service.list_owned_docs(
                user_email=user_email,
                query=q,
                page_size=50,
                page_token=page_token,
            )
        else:
            result = await docs_service.list_docs(
                query=q,
                folder_id=folder_id,
                page_token=page_token,
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise public_http_error(status_code=500, public_detail="Operation failed. Check server logs.", exc=e, log_context="Exception in docs_router")

@router.get("/{doc_id}")
async def get_doc(doc_id: str):
    """
    Get a specific Google Doc's content (Markdown converted).
    For previewing before import.
    """
    try:
        ensure_google_integration_enabled()
        result = await docs_service.fetch_and_convert(doc_id)
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise public_http_error(status_code=500, public_detail="Operation failed. Check server logs.", exc=e, log_context="Exception in docs_router")

@router.post("/import", response_model=ImportResult)
async def import_doc(request: ImportRequest):
    """
    Import a Google Doc:
    1. Fetch and convert content
    2. Save as local Markdown file
    3. Add to project configuration
    """
    try:
        ensure_google_integration_enabled()
        # 1. Fetch & Convert
        converted = await docs_service.fetch_and_convert(request.doc_id)
        
        # Use provided title or fallback to Doc title
        title = request.title or converted["title"]
        
        # 2. Save File
        rel_path = unique_content_path(project_store.project_root, title, suffix=".md")
        file_path = resolve_content_markdown_path(project_store.project_root, rel_path)
        file_path.write_text(converted["content"], encoding="utf-8")
        
        # Calculate new order
        project_data = await project_store.load()
        current_chapters = project_data.get("chapters", [])
        new_order = len(current_chapters)
        
        # 3. Add to Project
        chapter_id = next_chapter_id(current_chapters)
        chapter_data = {
            "id": chapter_id,
            "title": title,
            "googleDocId": request.doc_id,
            "localPath": rel_path,
            "order": new_order,
            "lastSync": datetime.datetime.utcnow().isoformat() + "Z",
            "enabled": True
        }
        
        await project_store.add_chapter(chapter_data)
        
        return ImportResult(
            status="success",
            message=f"Successfully imported '{title}'",
            chapter=chapter_data
        )
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise public_http_error(status_code=500, public_detail="Operation failed. Check server logs.", exc=e, log_context="Exception in docs_router")

@router.post("/sync/all", response_model=List[SyncResult])
async def sync_all_docs():
    """
    Sync all chapters that have a Google Doc ID.
    """
    from api.services.activity_log import ActivityLogService
    log_service = ActivityLogService()
    
    try:
        ensure_google_integration_enabled()
        project_data = await project_store.load()
        results = []
        synced_count = 0
        
        chapters = project_data.get("chapters", [])
        
        # Filter chapters with doc ID
        target_chapters = [ch for ch in chapters if ch.get("googleDocId") and ch.get("enabled", True)]
        
        for ch in target_chapters:
            doc_id = ch["googleDocId"]
            try:
                # Reuse logic roughly, but cleaner to extract if strict DRY needed. 
                # For now, repeating fetch/convert logic is safer than refactoring widely.
                
                # Fetch
                converted = await docs_service.fetch_and_convert(doc_id)
                
                # Write
                full_path = resolve_content_markdown_path(project_store.project_root, ch["localPath"])
                full_path.parent.mkdir(parents=True, exist_ok=True)
                
                import aiofiles
                async with aiofiles.open(full_path, "w", encoding="utf-8") as f:
                    await f.write(converted["content"])
                
                # Update timestamp on object (not saved yet)
                ch["lastSync"] = datetime.datetime.utcnow().isoformat() + "Z"
                
                results.append(SyncResult(
                    status="success",
                    message=f"Synced '{ch['title']}'",
                    doc_id=doc_id,
                    updated_at=ch["lastSync"]
                ))
                synced_count += 1
                
            except Exception as e:
                logger.exception("Failed to sync Google Doc chapter %s", ch.get("id"))
                results.append(SyncResult(
                    status="failed",
                    message=f"Failed to sync '{ch['title']}'. Check server logs.",
                    doc_id=doc_id,
                    updated_at="",
                ))
        
        # Save project data once
        await project_store.save(project_data)
        await project_store.update_sync_time()
        
        # Log activity
        await log_service.log("sync", f"Synced {synced_count} chapters from Google Docs")
        
        return results

    except HTTPException:
        raise
    except Exception as e:
        raise public_http_error(status_code=500, public_detail="Operation failed. Check server logs.", exc=e, log_context="Exception in docs_router")


@router.post("/sync/{doc_id}", response_model=SyncResult)
async def sync_doc(doc_id: str):
    """
    Sync an existing chapter with Google Doc content.
    """
    try:
        ensure_google_integration_enabled()
        # 1. Find the chapter by doc_id
        project_data = await project_store.load()
        target_chapter = None
        for ch in project_data.get("chapters", []):
            if ch.get("googleDocId") == doc_id:
                target_chapter = ch
                break
        
        if not target_chapter:
            raise HTTPException(status_code=404, detail="Chapter not found for this Doc ID")
            
        try:
            full_path = resolve_content_markdown_path(project_store.project_root, target_chapter["localPath"])
        except FileSafetyError as exc:
            _bad_path(exc)
        
        # 2. Fetch & Convert
        converted = await docs_service.fetch_and_convert(doc_id)
        
        # 3. Overwrite File
        # Ensure dir exists (though it should)
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Use aiofiles to write directly to the existing path
        import aiofiles
        async with aiofiles.open(full_path, "w", encoding="utf-8") as f:
            await f.write(converted["content"])
            
        # 4. Update lastSync timestamp
        # Ideally we should implement a specific update method in ProjectStore
        target_chapter["lastSync"] = datetime.datetime.utcnow().isoformat() + "Z"
        await project_store.save(project_data) # Saves and syncs to _quarto.yml
        
        return SyncResult(
            status="success",
            message=f"Successfully synced chapter '{target_chapter['title']}'",
            doc_id=doc_id,
            updated_at=target_chapter["lastSync"]
        )
    except HTTPException:
        raise
    except Exception as e:
        raise public_http_error(status_code=500, public_detail="Operation failed. Check server logs.", exc=e, log_context="Exception in docs_router")
