"""
Quarto Build Router
"""

from api.services.public_errors import public_http_error
import asyncio
import os
import platform
import subprocess
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from enum import Enum

from api.dependencies.auth import require_admin, require_editor_or_admin
from api.services.build_runner import BuildRunner
from api.services.file_safety import FileSafetyError, resolve_project_relative_file

router = APIRouter(dependencies=[Depends(require_editor_or_admin)])
build_runner = BuildRunner()


class BuildFormat(str, Enum):
    HTML = "html"
    PDF = "pdf"
    ALL = "all"


class BuildRequest(BaseModel):
    """Build request."""
    format: BuildFormat = BuildFormat.ALL
    chapters: Optional[List[str]] = None  # None = all chapters
    clean: bool = False


class BuildStatus(BaseModel):
    """Build status."""
    id: str
    status: Literal["pending", "running", "completed", "failed"]
    format: str
    progress: float  # 0.0 - 1.0
    current_step: Optional[str] = None
    error: Optional[str] = None
    output_files: List[str] = Field(default_factory=list)
    logs: List[str] = Field(default_factory=list)


class BuildResult(BaseModel):
    """Build result."""
    success: bool
    format: str
    output_files: List[str]
    duration_seconds: float
    log: str


class OpenInFinderRequest(BaseModel):
    """Request to open file in Finder/Explorer."""
    path: str  # Relative path from output dir (e.g., "pdf/file.pdf" or "file.pdf")


# Store active builds
active_builds: dict[str, BuildStatus] = {}


@router.post("/start", dependencies=[Depends(require_admin)])
async def start_build(
    request: BuildRequest,
    background_tasks: BackgroundTasks,
) -> BuildStatus:
    """
    Start a new build.
    """
    if build_runner.is_build_running() or any(
        build.status in {"pending", "running"} for build in active_builds.values()
    ):
        raise HTTPException(status_code=409, detail="Build already running")

    if request.chapters is not None:
        if not request.chapters:
            raise HTTPException(status_code=400, detail="At least one chapter is required for partial build")

        project = await build_runner.project_store.load()
        try:
            build_runner.resolve_target_chapter_paths(project, request.chapters)
        except ValueError as exc:
            raise public_http_error(
                status_code=400,
                public_detail="Invalid target structure. Check server logs.",
                exc=exc,
                log_context="ValueError in start_build (resolve_target_chapter_paths)",
            )

    build_id = await build_runner.create_build(
        format=request.format.value,
        chapters=request.chapters,
        clean=request.clean,
    )
    
    status = BuildStatus(
        id=build_id,
        status="pending",
        format=request.format.value,
        progress=0.0,
        current_step="Initializing...",
    )
    active_builds[build_id] = status
    
    # Start build in background
    background_tasks.add_task(
        build_runner.run_build,
        build_id,
        lambda s: update_build_status(build_id, s),
    )
    
    return status


def update_build_status(build_id: str, update: dict):
    """Update build status callback."""
    if build_id in active_builds:
        for key, value in update.items():
            setattr(active_builds[build_id], key, value)


@router.get("/status/{build_id}")
async def get_build_status(build_id: str) -> BuildStatus:
    """
    Get the status of a build.
    """
    if build_id not in active_builds:
        raise HTTPException(status_code=404, detail="Build not found")
    
    build = active_builds[build_id]
    build.logs = build_runner.build_logs.get(build_id, [])
    return build
@router.get("/status")
async def get_latest_build_status() -> BuildStatus:
    """
    Get the status of the most recent active build.
    """
    if not active_builds:
        raise HTTPException(status_code=404, detail="No active builds")
    
    # Return the most recently added build
    latest_build = list(active_builds.values())[-1]
    
    # Attach logs
    latest_build.logs = build_runner.build_logs.get(latest_build.id, [])
    
    return latest_build


@router.get("/log/{build_id}")
async def stream_build_log(build_id: str):
    """
    Stream build log in real-time.
    """
    async def generate():
        async for line in build_runner.stream_log(build_id):
            yield f"data: {line}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
    )


@router.post("/cancel/{build_id}", dependencies=[Depends(require_admin)])
async def cancel_build(build_id: str) -> dict:
    """
    Cancel a running build.
    """
    try:
        await build_runner.cancel(build_id)
        if build_id in active_builds:
            active_builds[build_id].status = "failed"
            active_builds[build_id].error = "Cancelled by user"
        return {"status": "cancelled"}
    except Exception as e:
        raise public_http_error(
            status_code=500,
            public_detail="Build operation failed. Check server logs.",
            exc=e,
            log_context="Exception in abort_build",
        )


@router.get("/outputs")
async def list_outputs() -> dict:
    """
    List available output files.
    """
    outputs = await build_runner.list_outputs()
    return {"outputs": outputs}


@router.delete("/outputs", dependencies=[Depends(require_admin)])
async def clean_outputs() -> dict:
    """
    Clean all output files.
    """
    await build_runner.clean_outputs()
    return {"status": "cleaned"}


@router.post("/open-in-finder", dependencies=[Depends(require_admin)])
async def open_in_finder(request: OpenInFinderRequest) -> dict:
    """
    Open a file in Finder (macOS) or Explorer (Windows).

    The path is relative to the output directory (e.g., "pdf/file.pdf" or "file.html").
    """
    if os.getenv("ENABLE_OPEN_IN_FINDER", "false").strip().lower() in {"0", "false", "off", "no"}:
        raise HTTPException(status_code=403, detail="Open in Finder is disabled")

    # Get the output directory from build runner
    output_dir = build_runner.get_output_dir()
    if not output_dir:
        raise HTTPException(status_code=500, detail="Output directory not configured")

    try:
        file_path = resolve_project_relative_file(
            output_dir,
            request.path,
            allowed_suffixes={".html", ".pdf"},
            must_exist=True,
        )
    except FileSafetyError as exc:
        raise public_http_error(
            status_code=404,
            public_detail="Build output not found. Check server logs.",
            exc=exc,
            log_context="FileSafetyError in open_output_in_finder",
        )

    try:
        system = platform.system()
        if system == "Darwin":  # macOS
            subprocess.run(["open", "-R", str(file_path)], check=True)
        elif system == "Windows":
            subprocess.run(["explorer", "/select,", str(file_path)], check=True)
        elif system == "Linux":
            # For Linux, open the parent directory in file manager
            subprocess.run(["xdg-open", str(file_path.parent)], check=True)
        else:
            raise public_http_error(
                status_code=400,
                public_detail="Unsupported platform for opening output files.",
                log_context=f"Unsupported platform in open_in_finder: {system}",
            )

        return {"status": "opened", "file": request.path}
    except subprocess.CalledProcessError as e:
        raise public_http_error(
            status_code=500,
            public_detail="Failed to open output file. Check server logs.",
            exc=e,
            log_context="open_in_finder subprocess failed",
        )
    except Exception as e:
        raise public_http_error(
            status_code=500,
            public_detail="Failed to open output file. Check server logs.",
            exc=e,
            log_context="open_in_finder failed",
        )
