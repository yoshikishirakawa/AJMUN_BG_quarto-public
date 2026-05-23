"""
表紙・裏表紙管理APIルーター
ファイルアップロードと管理機能を提供
"""

from api.services.public_errors import public_http_error

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
from pathlib import Path
import shutil
import uuid

from api.services.cover_service import cover_service
from api.services.cover_validator import cover_validator, cover_upload_manager
from api.dependencies.auth import require_admin
from api.services.file_safety import FileSafetyError, resolve_project_relative_file, safe_upload_filename


router = APIRouter(prefix="/api/covers", tags=["covers"], dependencies=[Depends(require_admin)])


# Pydanticモデル
class CoverUploadResponse(BaseModel):
    success: bool
    fileId: Optional[str] = None
    fileName: Optional[str] = None
    path: Optional[str] = None
    mimeType: Optional[str] = None
    dimensions: Optional[dict] = None
    warnings: List[str] = []
    errors: List[str] = []


class CoverConfigResponse(BaseModel):
    version: str
    covers: dict
    metadata: dict


class CoverStatusResponse(BaseModel):
    enabled: bool
    exists: bool
    path: Optional[str]
    fileName: Optional[str]
    updatedAt: Optional[str]


@router.get("/", response_model=CoverConfigResponse)
async def get_cover_settings():
    """表紙・裏表紙設定を取得"""
    settings = cover_service.load_settings()
    return {
        "version": settings.get("version", "1.0.0"),
        "covers": settings.get("covers", {}),
        "metadata": settings.get("metadata", {})
    }


@router.get("/{cover_type}", response_model=CoverStatusResponse)
async def get_cover_status(cover_type: str):
    """特定の表紙（front/back）の状態を取得"""
    if cover_type not in ["front", "back"]:
        raise HTTPException(status_code=400, detail="Invalid cover type. Use 'front' or 'back'")

    status = cover_service.get_cover_status(cover_type)
    return status


@router.post("/upload", response_model=CoverUploadResponse)
async def upload_cover(
    cover_type: str = Form(..., description="表紙タイプ: front または back"),
    position: str = Form("before_toc", description="挿入位置: before_toc または after_content"),
    file: UploadFile = File(..., description="アップロードする画像ファイル (JPG/PNG)")
):
    """
    表紙画像をアップロード

    - **cover_type**: "front"（表紙）または "back"（裏表紙）
    - **position**: 挿入位置（デフォルト: before_toc）
    - **file**: JPGまたはPNG形式の画像ファイル（最大10MB）
    """
    # パラメータ検証
    if cover_type not in ["front", "back"]:
        raise HTTPException(status_code=400, detail="Invalid cover_type. Use 'front' or 'back'")

    if position not in ["before_toc", "after_content"]:
        raise HTTPException(status_code=400, detail="Invalid position. Use 'before_toc' or 'after_content'")

    # 一時ファイル保存
    try:
        temp_name = safe_upload_filename(
            file.filename,
            prefix=f"temp_{uuid.uuid4().hex}",
            allowed_suffixes={".jpg", ".jpeg", ".png"},
        )
    except FileSafetyError as exc:
        raise public_http_error(status_code=400, public_detail="Invalid request. Check server logs.", exc=exc, log_context="ValueError in covers_router")
    temp_path = cover_upload_manager.temp_dir / temp_name

    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # ファイル検証と保存
        result = cover_upload_manager.save_upload(
            temp_path=temp_path,
            cover_type=cover_type,
            original_filename=temp_name
        )

        if not result["success"]:
            return CoverUploadResponse(
                success=False,
                errors=result.get("errors", []),
                warnings=result.get("warnings", [])
            )

        # 設定を更新
        cover_service.update_cover(
            cover_type=cover_type,
            enabled=True,
            file_path=result["path"],
            user_id="api_upload"
        )

        return CoverUploadResponse(
            success=True,
            fileId=result["fileId"],
            fileName=result["fileName"],
            path=result["path"],
            mimeType=result["mimeType"],
            dimensions=result.get("dimensions"),
            warnings=result.get("warnings", [])
        )

    except Exception as e:
        raise public_http_error(status_code=500, public_detail="Upload failed. Check server logs.", exc=e, log_context="Failed to upload cover")

    finally:
        # クリーンアップ
        if temp_path.exists():
            temp_path.unlink()


@router.put("/{cover_type}/enable")
async def enable_cover(cover_type: str):
    """表紙を有効化"""
    if cover_type not in ["front", "back"]:
        raise HTTPException(status_code=400, detail="Invalid cover type")

    settings = cover_service.load_settings()
    cover = settings.get("covers", {}).get(cover_type, {})

    if not cover.get("path"):
        raise HTTPException(status_code=400, detail=f"No cover file set for {cover_type}")

    cover_service.update_cover(
        cover_type=cover_type,
        enabled=True,
        user_id="api_user"
    )

    return {"status": "ok", "message": f"{cover_type} cover enabled"}


@router.put("/{cover_type}/disable")
async def disable_cover(cover_type: str):
    """表紙を無効化"""
    if cover_type not in ["front", "back"]:
        raise HTTPException(status_code=400, detail="Invalid cover type")

    cover_service.update_cover(
        cover_type=cover_type,
        enabled=False,
        user_id="api_user"
    )

    return {"status": "ok", "message": f"{cover_type} cover disabled"}


@router.delete("/{cover_type}")
async def delete_cover(cover_type: str):
    """表紙設定を削除（ファイルは削除せず無効化のみ）"""
    if cover_type not in ["front", "back"]:
        raise HTTPException(status_code=400, detail="Invalid cover type")

    settings = cover_service.load_settings()
    covers = settings.get("covers", {})
    cover = covers.get(cover_type, {})

    # 無効化して履歴に記録
    cover["enabled"] = False
    cover["updatedAt"] = None
    cover["updatedBy"] = "api_delete"

    covers[cover_type] = cover
    settings["covers"] = covers

    # 履歴に追加
    history_entry = {
        "timestamp": __import__('datetime').datetime.now().isoformat(),
        "action": "delete",
        "coverType": cover_type,
        "userId": "api_user",
        "fileId": cover.get("fileId"),
        "previousFileId": None
    }
    settings["history"].insert(0, history_entry)

    cover_service.save_settings(settings)
    cover_service.write_latex_config()

    return {"status": "ok", "message": f"{cover_type} cover deleted"}


@router.get("/{cover_type}/preview")
async def preview_cover(cover_type: str):
    """表紙プレビュー画像を取得"""
    if cover_type not in ["front", "back"]:
        raise HTTPException(status_code=400, detail="Invalid cover type")

    status = cover_service.get_cover_status(cover_type)

    if not status.get("exists") or not status.get("path"):
        raise HTTPException(status_code=404, detail=f"No cover image found for {cover_type}")

    try:
        file_path = resolve_project_relative_file(
            cover_service.project_root,
            status["path"],
            required_prefix="assets/covers",
            allowed_suffixes={".jpg", ".jpeg", ".png"},
            must_exist=True,
        )
    except FileSafetyError as exc:
        raise public_http_error(status_code=404, public_detail="Resource not found. Check server logs.", exc=exc, log_context="ValueError in covers_router")

    return FileResponse(
        path=file_path,
        media_type="image/jpeg",
        filename=file_path.name
    )


@router.get("/{cover_type}/validate")
async def validate_cover(cover_type: str):
    """表紙ファイルを検証"""
    if cover_type not in ["front", "back"]:
        raise HTTPException(status_code=400, detail="Invalid cover type")

    status = cover_service.get_cover_status(cover_type)

    if not status.get("exists") or not status.get("path"):
        return {
            "valid": False,
            "errors": ["No cover file set"],
            "warnings": []
        }

    try:
        file_path = resolve_project_relative_file(
            cover_service.project_root,
            status["path"],
            required_prefix="assets/covers",
            allowed_suffixes={".jpg", ".jpeg", ".png"},
            must_exist=True,
        )
    except FileSafetyError as exc:
        raise public_http_error(status_code=404, public_detail="Resource not found. Check server logs.", exc=exc, log_context="ValueError in covers_router")
    result = cover_validator.validate(file_path)

    return {
        "valid": result.valid,
        "errors": result.errors,
        "warnings": result.warnings,
        "metadata": {
            "mime_type": result.metadata.mime_type if result.metadata else None,
            "size": result.metadata.size if result.metadata else None,
            "width": result.metadata.width if result.metadata else None,
            "height": result.metadata.height if result.metadata else None,
            "dpi": result.metadata.dpi if result.metadata else None,
            "checksum": result.metadata.checksum if result.metadata else None
        } if result.metadata else None
    }


@router.post("/regenerate")
async def regenerate_config():
    """LaTeX設定ファイルを再生成"""
    try:
        config_path = cover_service.write_latex_config()
        return {
            "status": "ok",
            "message": "LaTeX config regenerated",
            "config_path": str(config_path)
        }
    except Exception as e:
        raise public_http_error(status_code=500, public_detail="Failed to regenerate config. Check server logs.", exc=e, log_context="Failed to regenerate cover config")


@router.get("/history/list")
async def get_cover_history(limit: int = 20):
    """表紙設定の変更履歴を取得"""
    settings = cover_service.load_settings()
    history = settings.get("history", [])
    return {
        "history": history[:limit],
        "total": len(history)
    }
