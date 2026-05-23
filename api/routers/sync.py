"""
Deprecated sync API router.
"""

from api.services.public_errors import public_http_error
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from api.dependencies.auth import require_editor_or_admin

router = APIRouter(prefix="/api/v1/sync", tags=["sync"], dependencies=[Depends(require_editor_or_admin)])


def gone_response() -> JSONResponse:
    return JSONResponse(
        status_code=410,
        content={
            "status": "gone",
            "detail": "The sync feature has been removed. Use host-led editing or /api/v1/docs/import-markdown instead.",
        },
    )


@router.get("/status")
async def sync_status():
    return gone_response()


@router.post("/all")
async def sync_all():
    return gone_response()


@router.post("/link")
async def link_chapter():
    return gone_response()


@router.post("/unlink")
async def unlink_chapter():
    return gone_response()


@router.post("/chapter/{chapter_id}")
async def sync_chapter(chapter_id: str):
    return gone_response()


@router.post("/resolve-conflict")
async def resolve_conflict():
    return gone_response()
