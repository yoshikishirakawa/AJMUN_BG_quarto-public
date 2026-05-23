"""
AJMUN BG Editor - FastAPI Backend
"""
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.sessions import SessionMiddleware

from api.dependencies.auth import require_editor_or_admin
from api.routers import auth, docs, build, project, system, bibliography, sync, settings, covers, fullpage
from api.services.app_auth import AppAuthService
from api.services.runtime_config import assert_safe_runtime_config

load_dotenv()
assert_safe_runtime_config()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    print("AJMUN BG Editor API starting...")
    
    # Ensure required directories exist
    project_root = Path(__file__).parent.parent
    (project_root / "content").mkdir(exist_ok=True)
    (project_root / "out").mkdir(exist_ok=True)
    
    yield
    
    # Shutdown
    print("AJMUN BG Editor API shutting down...")


def should_expose_api_docs() -> bool:
    value = os.getenv("EXPOSE_API_DOCS", "false").strip().lower()
    return value in {"1", "true", "yes", "on"}


def get_bool_env(name: str, default: str = "false") -> bool:
    value = os.getenv(name, default).strip().lower()
    return value in {"1", "true", "yes", "on"}


def resolve_safe_file(base_dir: Path, file_path: str) -> Path:
    candidate = (base_dir / file_path).resolve()
    base_resolved = base_dir.resolve()
    try:
        candidate.relative_to(base_resolved)
    except ValueError:
        raise HTTPException(status_code=404, detail="File not found")
    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return candidate


app = FastAPI(
    title="AJMUN BG Editor API",
    description="Backend API for AJMUN Background Guide Editor",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if should_expose_api_docs() else None,
    redoc_url="/redoc" if should_expose_api_docs() else None,
    openapi_url="/openapi.json" if should_expose_api_docs() else None,
)

app_auth_service = AppAuthService()


def get_allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "")
    if raw.strip():
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]


app.add_middleware(
    SessionMiddleware,
    secret_key=app_auth_service.get_session_secret(),
    same_site="lax",
    https_only=get_bool_env("SESSION_COOKIE_SECURE", "true"),
    session_cookie="ajmun_session",
)

# CORS configuration for Electron/Web frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers with v1 versioning
app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(docs.router, prefix="/api/v1/docs", tags=["Google Docs"])
app.include_router(build.router, prefix="/api/v1/build", tags=["Build"])
app.include_router(project.router, prefix="/api/v1/project", tags=["Project"])
app.include_router(system.router, prefix="/api/v1/system", tags=["System"])
app.include_router(bibliography.router, prefix="/api/v1/bibliography", tags=["Bibliography"])
app.include_router(sync.router, tags=["Sync"])
app.include_router(settings.router, tags=["Settings"])
app.include_router(covers.router, tags=["Covers"])
app.include_router(fullpage.router, tags=["FullPage"])

project_root = Path(__file__).parent.parent


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "AJMUN BG Editor API",
        "version": "1.0.0",
    }


@app.get("/api/health")
async def health():
    """Detailed health check."""
    return {
        "status": "healthy",
    }


@app.get("/outputs/{file_path:path}")
async def get_output_file(file_path: str, _session=Depends(require_editor_or_admin)):
    output_dir = project_root / "out"
    target = resolve_safe_file(output_dir, file_path)
    return FileResponse(target)


@app.get("/assets/{file_path:path}")
async def get_asset_file(file_path: str, _session=Depends(require_editor_or_admin)):
    assets_dir = project_root / "assets"
    target = resolve_safe_file(assets_dir, file_path)
    return FileResponse(target)
