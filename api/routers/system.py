"""
System API Router
Handles system status checks and diagnostics.
"""

from api.services.public_errors import public_http_error
import logging
import shutil
import os
from typing import Optional
from pathlib import Path
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.routers import auth, docs, build, project, system
from api.dependencies.auth import require_admin, require_editor_or_admin
from api.services.activity_log import ActivityLogService

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(require_editor_or_admin)])
log_service = ActivityLogService()

class SystemStatus(BaseModel):
    quarto_installed: bool
    tex_installed: bool
    latexmk_installed: bool
    pdf_toolchain_ready: bool
    quarto_path: Optional[str]
    tex_path: Optional[str]
    lualatex_path: Optional[str]
    latexmk_path: Optional[str]
    version: str

@router.get("/status", response_model=SystemStatus)
async def get_system_status():
    """
    Check if required system dependencies are installed.
    """
    # Standard paths to check for binaries
    # Windows paths often vary, but we can try common ones or rely on PATH
    if os.name == 'nt':
        common_paths = [
            r"C:\Program Files\Quarto\bin",
            r"C:\Program Files\RStudio\bin\quarto\bin",
            r"C:\Program Files\MiKTeX\miktex\bin\x64",
            r"C:\texlive\2023\bin\windows", 
        ]
    else:
        common_paths = [
            "/usr/local/bin",
            "/opt/homebrew/bin",
            "/Library/TeX/texbin",
            "/usr/bin",
            "/bin",
            str(Path.home() / "bin"),
            str(Path.home() / ".local/bin")
        ]

    current_path = os.environ.get("PATH", "")
    # Ensure we don't duplicate too much but order matters. Prepend common paths.
    search_path = os.pathsep.join(common_paths + [current_path])

    # Single-stage detection: use shutil.which() with extended PATH
    # Removed subprocess fallback to simplify behavior and avoid hiding installation issues
    quarto_path = shutil.which("quarto", path=search_path)
    lualatex_path = shutil.which("lualatex", path=search_path)
    latexmk_path = shutil.which("latexmk", path=search_path)
    tex_path = lualatex_path

    # Log results for debugging
    if quarto_path:
        logger.debug(f"Quarto found at: {quarto_path}")
    else:
        logger.info("Quarto not found in PATH")

    if tex_path:
        logger.debug(f"TeX found at: {tex_path}")
    else:
        logger.info("LuaLaTeX not found in PATH")
    if not latexmk_path:
        logger.info("latexmk not found in PATH")

    pdf_toolchain_ready = bool(quarto_path and lualatex_path and latexmk_path)

    return SystemStatus(
        quarto_installed=bool(quarto_path),
        tex_installed=bool(lualatex_path),
        latexmk_installed=bool(latexmk_path),
        pdf_toolchain_ready=pdf_toolchain_ready,
        quarto_path=quarto_path,
        tex_path=tex_path,
        lualatex_path=lualatex_path,
        latexmk_path=latexmk_path,
        version="1.0.0"
    )

@router.post("/install/quarto", dependencies=[Depends(require_admin)])
async def install_quarto():
    """
    Placeholder for Quarto installation.
    """
    return {"status": "error", "message": "Automatic installation not yet supported. Please install Quarto manually from https://quarto.org/"}

@router.post("/install/tex", dependencies=[Depends(require_admin)])
async def install_tex():
    """
    Placeholder for TeX installation.
    """
    return {"status": "error", "message": "Automatic installation not yet supported. Please install a TeX distribution manually (e.g., TinyTeX)."}


@router.get("/stats")
async def get_system_stats():
    """
    Get system statistics (disk usage of assets).
    """
    project_root = Path(__file__).parent.parent.parent
    assets_dir = project_root / "assets"
    
    total_size = 0
    file_count = 0
    
    if assets_dir.exists():
        for p in assets_dir.rglob("*"):
            if p.is_file():
                total_size += p.stat().st_size
                file_count += 1
                
    # Convert to MB
    size_mb = round(total_size / (1024 * 1024), 2)
    
    return {
        "assets_size_mb": size_mb,
        "assets_count": file_count
    }


@router.get("/activity")
async def get_activity_log():
    """
    Get recent activity log.
    """
    return await log_service.get_recent()
