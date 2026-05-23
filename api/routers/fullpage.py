"""
フルページ画像管理APIルーター
"""

from api.services.public_errors import public_http_error

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from pathlib import Path
import shutil
import uuid

from api.services.fullpage_service import fullpage_service, FullPageImageType, DisplayMode, PlacementType
from api.dependencies.auth import require_editor_or_admin
from api.services.file_safety import FileSafetyError, resolve_project_relative_file, safe_upload_filename


router = APIRouter(prefix="/api/fullpage", tags=["fullpage"], dependencies=[Depends(require_editor_or_admin)])


# Pydanticモデル
class ImageCreateRequest(BaseModel):
    type: str
    title: str
    position: Optional[Dict[str, Any]] = None
    display: Optional[Dict[str, Any]] = None


class ImageUpdateRequest(BaseModel):
    title: Optional[str] = None
    type: Optional[str] = None
    position: Optional[Dict[str, Any]] = None
    display: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = None
    order: Optional[int] = None


class ImageResponse(BaseModel):
    id: str
    type: str
    title: str
    path: str
    position: Dict[str, Any]
    display: Dict[str, Any]
    validation: Dict[str, Any]
    enabled: bool
    order: int
    created_at: str
    updated_at: str


class ImageListResponse(BaseModel):
    images: List[ImageResponse]
    total: int


class ReorderRequest(BaseModel):
    image_ids: List[str]


@router.get("/", response_model=ImageListResponse)
async def get_all_images():
    """全フルページ画像を取得"""
    images = fullpage_service.get_all_images()
    return {
        "images": [ImageResponse(**img.__dict__) for img in images],
        "total": len(images)
    }


@router.get("/{image_id}", response_model=ImageResponse)
async def get_image(image_id: str):
    """特定の画像を取得"""
    image = fullpage_service.get_image(image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    return ImageResponse(**image.__dict__)


@router.get("/type/{image_type}", response_model=ImageListResponse)
async def get_images_by_type(image_type: str):
    """タイプ別に画像を取得"""
    valid_types = [t.value for t in FullPageImageType]
    if image_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {', '.join(valid_types)}")

    images = fullpage_service.get_images_by_type(image_type)
    return {
        "images": [ImageResponse(**img.__dict__) for img in images],
        "total": len(images)
    }


@router.post("/", response_model=ImageResponse)
async def create_image(
    type: str = Form(..., description="画像タイプ: cover_front, cover_back, advertisement, illustration, appendix"),
    title: str = Form(..., description="画像タイトル"),
    placement: str = Form("before_toc", description="配置位置"),
    chapter_id: Optional[str] = Form(None, description="章ID（placementがafter_chapterの場合）"),
    target_chapter_index: Optional[int] = Form(None, description="章間配置: 何章目の後か"),
    page_number: Optional[int] = Form(None, description="絶対配置: ページ番号"),
    offset_pages: Optional[int] = Form(0, description="章後/章間のオフセットページ数"),
    file: UploadFile = File(..., description="画像ファイル (JPG/PNG/PDF)")
):
    """
    新規画像をアップロードして作成
    """
    # タイプ検証
    valid_types = [t.value for t in FullPageImageType]
    if type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {', '.join(valid_types)}")

    # 配置検証
    valid_placements = [p.value for p in PlacementType]
    if placement not in valid_placements:
        raise HTTPException(status_code=400, detail=f"Invalid placement. Must be one of: {', '.join(valid_placements)}")

    # 一時ファイル保存
    try:
        temp_name = safe_upload_filename(
            file.filename,
            prefix=f"temp_{uuid.uuid4().hex}",
            allowed_suffixes={".jpg", ".jpeg", ".png", ".pdf"},
        )
    except FileSafetyError as exc:
        raise public_http_error(
            status_code=400,
            public_detail="Invalid request. Check server logs.",
            exc=exc,
            log_context="ValueError in upload_fullpage_image",
        )
    temp_path = fullpage_service.storage_dir / temp_name
    temp_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 位置設定
        position = {"placement": placement}
        if chapter_id:
            position["chapter_id"] = chapter_id
        if target_chapter_index is not None:
            position["target_chapter_index"] = target_chapter_index
        if page_number is not None:
            position["page_number"] = page_number
        if offset_pages is not None:
            position["offset_pages"] = offset_pages

        # 画像作成
        image = fullpage_service.create_image(
            image_type=type,
            title=title,
            source_path=temp_path,
            position=position
        )

        return ImageResponse(**image.__dict__)

    except Exception as e:
        raise public_http_error(
            status_code=500,
            public_detail="Failed to create image. Check server logs.",
            exc=e,
            log_context="Failed to create image",
        )

    finally:
        # クリーンアップ
        if temp_path.exists():
            temp_path.unlink()


@router.put("/{image_id}", response_model=ImageResponse)
async def update_image(image_id: str, request: ImageUpdateRequest):
    """画像を更新"""
    updates = {k: v for k, v in request.dict().items() if v is not None}

    image = fullpage_service.update_image(image_id, updates)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    return ImageResponse(**image.__dict__)


@router.delete("/{image_id}")
async def delete_image(image_id: str):
    """画像を削除"""
    success = fullpage_service.delete_image(image_id)
    if not success:
        raise HTTPException(status_code=404, detail="Image not found")

    return {"status": "ok", "message": "Image deleted"}


@router.post("/reorder")
async def reorder_images(request: ReorderRequest):
    """画像順序を変更"""
    success = fullpage_service.reorder_images(request.image_ids)
    if not success:
        raise HTTPException(status_code=400, detail="Failed to reorder images")

    return {"status": "ok", "message": "Images reordered"}


@router.get("/{image_id}/preview")
async def preview_image(image_id: str):
    """画像プレビューを取得"""
    image = fullpage_service.get_image(image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    try:
        file_path = resolve_project_relative_file(
            fullpage_service.project_root,
            image.path,
            required_prefix="assets/fullpage",
            allowed_suffixes={".jpg", ".jpeg", ".png", ".pdf"},
            must_exist=True,
        )
    except FileSafetyError as exc:
        raise public_http_error(
            status_code=404,
            public_detail="Image not found or invalid. Check server logs.",
            exc=exc,
            log_context="ValueError in delete_fullpage_image",
        )

    # MIMEタイプを判定
    mime_type = "image/jpeg"
    if file_path.suffix.lower() == ".png":
        mime_type = "image/png"
    elif file_path.suffix.lower() == ".pdf":
        mime_type = "application/pdf"

    return FileResponse(
        path=file_path,
        media_type=mime_type,
        filename=file_path.name
    )


@router.post("/{image_id}/upload")
async def upload_image_file(
    image_id: str,
    file: UploadFile = File(..., description="新しい画像ファイル")
):
    """既存画像のファイルを差し替え"""
    image = fullpage_service.get_image(image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # 一時ファイル保存
    try:
        temp_name = safe_upload_filename(
            file.filename,
            prefix=f"temp_{uuid.uuid4().hex}",
            allowed_suffixes={".jpg", ".jpeg", ".png", ".pdf"},
        )
    except FileSafetyError as exc:
        raise public_http_error(
            status_code=400,
            public_detail="Invalid update request. Check server logs.",
            exc=exc,
            log_context="ValueError in update_fullpage_image",
        )
    temp_path = fullpage_service.storage_dir / temp_name

    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 既存ファイルを削除
        old_path = resolve_project_relative_file(
            fullpage_service.project_root,
            image.path,
            required_prefix="assets/fullpage",
            allowed_suffixes={".jpg", ".jpeg", ".png", ".pdf"},
            must_exist=False,
        )
        if old_path.exists():
            old_path.unlink()

        # 新しいファイル名を生成
        ext = temp_path.suffix.lower()
        file_id = image_id[:8]
        dest_filename = f"{image.type}_{file_id}{ext}"
        dest_path = fullpage_service.storage_dir / dest_filename

        shutil.copy2(temp_path, dest_path)

        # パスを更新
        rel_path = dest_path.relative_to(fullpage_service.project_root)
        fullpage_service.update_image(image_id, {"path": str(rel_path)})

        return {"status": "ok", "message": "File uploaded", "path": str(rel_path)}

    except Exception as e:
        raise public_http_error(
            status_code=500,
            public_detail="Failed to upload file. Check server logs.",
            exc=e,
            log_context="Failed to upload file",
        )

    finally:
        if temp_path.exists():
            temp_path.unlink()


@router.post("/{image_id}/enable")
async def enable_image(image_id: str):
    """画像を有効化"""
    image = fullpage_service.update_image(image_id, {"enabled": True})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    return {"status": "ok", "message": "Image enabled"}


@router.post("/{image_id}/disable")
async def disable_image(image_id: str):
    """画像を無効化"""
    image = fullpage_service.update_image(image_id, {"enabled": False})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    return {"status": "ok", "message": "Image disabled"}


@router.get("/types/list")
async def get_image_types():
    """利用可能な画像タイプ一覧"""
    return {
        "types": [
            {"value": t.value, "label": _get_type_label(t.value)}
            for t in FullPageImageType
        ]
    }


def _get_type_label(type_value: str) -> str:
    """タイプの日本語ラベルを取得"""
    labels = {
        "cover_front": "表紙",
        "cover_back": "裏表紙",
        "advertisement": "広告",
        "illustration": "イラスト",
        "appendix": "附録"
    }
    return labels.get(type_value, type_value)


@router.get("/placements/list")
async def get_placement_types():
    """利用可能な配置タイプ一覧"""
    return {
        "placements": [
            {"value": p.value, "label": _get_placement_label(p.value)}
            for p in PlacementType
        ]
    }


def _get_placement_label(placement_value: str) -> str:
    """配置の日本語ラベルを取得"""
    labels = {
        "absolute": "指定ページ",
        "after_chapter": "章の後",
        "before_toc": "目次前",
        "after_content": "本文後",
        "after_appendices": "付録後",
        "between_chapters": "章間"
    }
    return labels.get(placement_value, placement_value)


@router.get("/chapters/info")
async def get_chapters_info():
    """プロジェクトの章情報を取得"""
    chapters = fullpage_service.get_chapters_info()
    return {
        "chapters": [
            {
                "id": ch.id,
                "index": ch.index,
                "title": ch.title,
                "page_start": ch.page_start,
                "page_end": ch.page_end
            }
            for ch in chapters
        ],
        "total": len(chapters)
    }


@router.get("/insertion-points/list")
async def get_insertion_points():
    """画像挿入ポイントの一覧を取得"""
    points = fullpage_service.get_insertion_points()
    return {
        "points": points,
        "total": len(points)
    }


@router.post("/{image_id}/validate")
async def validate_image(image_id: str):
    """画像を再検証（ファイルを再チェック）"""
    image = fullpage_service.get_image(image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    file_path = fullpage_service.project_root / image.path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found")
    
    # 検証実行
    validation = fullpage_service.validate_image(file_path)
    
    # 結果を保存
    fullpage_service._update_image_validation(image_id, validation)
    
    return {
        "status": "ok",
        "validation": {
            "format": validation.format,
            "width": validation.width,
            "height": validation.height,
            "dpi": validation.dpi,
            "warnings": validation.warnings,
            "errors": validation.errors
        }
    }


@router.post("/migrate")
async def migrate_from_covers():
    """既存のcover設定から移行"""
    success = fullpage_service.migrate_from_covers()
    if success:
        return {"status": "ok", "message": "Migration completed"}
    else:
        return {"status": "skipped", "message": "No migration needed or cover config not found"}
