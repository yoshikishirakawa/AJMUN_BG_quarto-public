"""
Application and Google OAuth authentication router.
"""

from api.services.public_errors import public_http_error
import json
import os
import secrets
import time
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel

from api.dependencies.auth import get_optional_session, is_auth_bypass_enabled, require_admin, require_editor_or_admin
from api.services.app_auth import AppAuthService
from api.services.google_auth import GoogleAuthService
from api.services.file_safety import FileSafetyError
from api.services.upload_validation import (
    MAX_GOOGLE_CREDENTIALS_UPLOAD_BYTES,
    read_text_upload_limited,
)

router = APIRouter()
auth_service = GoogleAuthService()
app_auth_service = AppAuthService()


class LoginRateLimiter:
    def __init__(self) -> None:
        self.failures: dict[str, list[float]] = {}

    def check(self, key: str, *, limit: int, window_seconds: int) -> None:
        now = time.monotonic()
        recent = [ts for ts in self.failures.get(key, []) if now - ts < window_seconds]
        self.failures[key] = recent
        if len(recent) >= limit:
            raise HTTPException(status_code=429, detail="Too many failed login attempts")

    def record_failure(self, key: str, *, window_seconds: int) -> None:
        now = time.monotonic()
        recent = [ts for ts in self.failures.get(key, []) if now - ts < window_seconds]
        recent.append(now)
        self.failures[key] = recent

    def reset(self, key: str) -> None:
        self.failures.pop(key, None)


login_rate_limiter = LoginRateLimiter()


def login_rate_limit_key(request: Request, scope: str) -> str:
    host = request.client.host if request.client else "unknown"
    return f"{scope}:{host}"


def is_google_integration_enabled() -> bool:
    value = os.getenv("GOOGLE_INTEGRATION_ENABLED", "auto").strip().lower()
    return value not in {"0", "false", "off", "no", "disabled"}


def ensure_google_integration_enabled() -> None:
    if not is_google_integration_enabled():
        raise HTTPException(status_code=503, detail="Google integration is disabled")


class SessionStatus(BaseModel):
    authenticated: bool
    role: Optional[str] = None
    invite_id: Optional[str] = None
    label: Optional[str] = None
    auth_bypass: bool = False


class AdminLoginRequest(BaseModel):
    secret: str


class InviteCreateRequest(BaseModel):
    label: Optional[str] = None


class InviteLoginRequest(BaseModel):
    token: str


class InviteInfo(BaseModel):
    id: str
    label: Optional[str] = None
    role: str
    createdAt: str
    updatedAt: Optional[str] = None
    revokedAt: Optional[str] = None
    lastUsedAt: Optional[str] = None
    expiresAt: Optional[str] = None
    active: bool


class InviteCreateResponse(BaseModel):
    id: str
    label: Optional[str] = None
    role: str
    createdAt: str
    expiresAt: Optional[str] = None
    token: str


class GoogleAuthStatus(BaseModel):
    enabled: bool
    authenticated: bool
    configured: bool = False
    email: Optional[str] = None
    name: Optional[str] = None
    picture: Optional[str] = None


class TokenRequest(BaseModel):
    code: str
    redirect_uri: str
    state: Optional[str] = None


class GoogleTokenStatusResponse(BaseModel):
    status: str
    authenticated: bool


@router.get("/session", response_model=SessionStatus)
async def get_session_status(request: Request) -> SessionStatus:
    session = get_optional_session(request)
    if not session:
        return SessionStatus(authenticated=False)
    return SessionStatus(
        authenticated=True,
        role=session.get("role"),
        invite_id=session.get("invite_id"),
        label=session.get("label"),
        auth_bypass=bool(session.get("auth_bypass")),
    )


@router.post("/admin/login", response_model=SessionStatus)
async def admin_login(request: Request, payload: AdminLoginRequest) -> SessionStatus:
    if is_auth_bypass_enabled():
        return SessionStatus(authenticated=True, role="admin", label="Public editing mode", auth_bypass=True)
    if not app_auth_service.get_admin_secret():
        raise HTTPException(status_code=503, detail="ADMIN_SECRET is not configured")
    rate_key = login_rate_limit_key(request, "admin")
    login_rate_limiter.check(rate_key, limit=5, window_seconds=15 * 60)
    if not app_auth_service.verify_admin_secret(payload.secret):
        login_rate_limiter.record_failure(rate_key, window_seconds=15 * 60)
        raise HTTPException(status_code=401, detail="Invalid admin secret")
    login_rate_limiter.reset(rate_key)
    request.session.clear()
    request.session["auth"] = {
        "role": "admin",
        "label": "Administrator",
    }
    return SessionStatus(authenticated=True, role="admin", label="Administrator")


@router.post("/invite-login", response_model=SessionStatus)
async def invite_login(request: Request, payload: InviteLoginRequest) -> SessionStatus:
    if is_auth_bypass_enabled():
        return SessionStatus(authenticated=True, role="admin", label="Public editing mode", auth_bypass=True)
    rate_key = login_rate_limit_key(request, "invite")
    login_rate_limiter.check(rate_key, limit=10, window_seconds=15 * 60)
    invite = app_auth_service.authenticate_invite(payload.token)
    if not invite:
        login_rate_limiter.record_failure(rate_key, window_seconds=15 * 60)
        raise HTTPException(status_code=401, detail="Invalid invite token")
    login_rate_limiter.reset(rate_key)
    request.session.clear()
    request.session["auth"] = {
        "role": "invited_editor",
        "invite_id": invite["id"],
        "label": invite.get("label"),
    }
    return SessionStatus(
        authenticated=True,
        role="invited_editor",
        invite_id=invite["id"],
        label=invite.get("label"),
    )


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    if is_auth_bypass_enabled():
        return {"status": "auth_bypass_enabled"}
    return {"status": "logged_out"}


@router.get("/invites", response_model=list[InviteInfo], dependencies=[Depends(require_admin)])
async def list_invites():
    invites = app_auth_service.list_invites()
    return [InviteInfo(**invite) for invite in invites]


@router.post("/invites", response_model=InviteCreateResponse, dependencies=[Depends(require_admin)])
async def create_invite(payload: InviteCreateRequest):
    try:
        invite = app_auth_service.issue_invite_token(payload.label)
        return InviteCreateResponse(**invite)
    except ValueError as exc:
        raise public_http_error(status_code=400, public_detail="Invalid request. Check server logs.", exc=exc, log_context="ValueError in auth_router")


@router.post("/invites/{invite_id}/revoke", dependencies=[Depends(require_admin)])
async def revoke_invite(invite_id: str):
    if not app_auth_service.revoke_invite(invite_id):
        raise HTTPException(status_code=404, detail="Invite not found")
    return {"status": "revoked", "invite_id": invite_id}


@router.post("/invites/revoke-all", dependencies=[Depends(require_admin)])
async def revoke_all_invites():
    count = app_auth_service.revoke_all_invites()
    return {"status": "revoked_all", "count": count}


@router.get("/google/status", response_model=GoogleAuthStatus, dependencies=[Depends(require_editor_or_admin)])
async def get_google_auth_status() -> GoogleAuthStatus:
    enabled = is_google_integration_enabled()
    status = await auth_service.get_status()
    return GoogleAuthStatus(enabled=enabled, **status)


@router.get("/google/login", dependencies=[Depends(require_admin)])
async def login_to_google(request: Request, redirect_uri: str = Query(...)):
    ensure_google_integration_enabled()
    try:
        state = secrets.token_urlsafe(32)
        request.session["google_oauth_state"] = state
        auth_url = auth_service.get_auth_url(redirect_uri, state=state)
        return {"auth_url": auth_url}
    except FileNotFoundError as e:
        raise public_http_error(status_code=500, public_detail="Authentication failed. Check server logs.", exc=e, log_context="Exception in auth_router")
    except ValueError as e:
        raise public_http_error(status_code=400, public_detail="Invalid authentication request. Check server logs.", exc=e, log_context="Exception in auth_router")
    except Exception as e:
        raise public_http_error(status_code=500, public_detail="Authentication failed. Check server logs.", exc=e, log_context="Authentication exception")


@router.post("/google/token", response_model=GoogleTokenStatusResponse, dependencies=[Depends(require_admin)])
async def exchange_google_token(request: Request, payload: TokenRequest) -> GoogleTokenStatusResponse:
    ensure_google_integration_enabled()
    expected_state = request.session.get("google_oauth_state")
    if not payload.state or not expected_state or not secrets.compare_digest(payload.state, expected_state):
        raise HTTPException(status_code=400, detail="Invalid Google OAuth state")
    request.session.pop("google_oauth_state", None)
    try:
        await auth_service.exchange_code(
            code=payload.code,
            redirect_uri=payload.redirect_uri,
        )
        return GoogleTokenStatusResponse(status="connected", authenticated=True)
    except ValueError as e:
        raise public_http_error(status_code=400, public_detail="Invalid authentication request. Check server logs.", exc=e, log_context="Exception in auth_router")
    except Exception as e:
        raise public_http_error(status_code=400, public_detail="Invalid authentication request. Check server logs.", exc=e, log_context="Exception in auth_router")


@router.post("/google/refresh", response_model=GoogleTokenStatusResponse, dependencies=[Depends(require_admin)])
async def refresh_google_token() -> GoogleTokenStatusResponse:
    ensure_google_integration_enabled()
    try:
        await auth_service.refresh_token()
        return GoogleTokenStatusResponse(status="refreshed", authenticated=True)
    except FileNotFoundError as e:
        raise public_http_error(status_code=500, public_detail="Authentication failed. Check server logs.", exc=e, log_context="Exception in auth_router")
    except Exception as e:
        raise public_http_error(status_code=400, public_detail="Invalid authentication request. Check server logs.", exc=e, log_context="Exception in auth_router")


@router.post("/google/logout", dependencies=[Depends(require_admin)])
async def logout_from_google():
    ensure_google_integration_enabled()
    await auth_service.logout()
    return {"status": "logged_out"}


@router.post("/google/credentials", dependencies=[Depends(require_admin)])
async def upload_google_credentials(file: UploadFile = File(...)):
    ensure_google_integration_enabled()
    try:
        content = await read_text_upload_limited(
            file,
            max_bytes=MAX_GOOGLE_CREDENTIALS_UPLOAD_BYTES,
            too_large_message="Google credentials file is too large",
            decode_error_message="Google credentials file must be UTF-8 encoded",
        )
        json_content = json.loads(content)
        auth_service.save_client_secrets(json_content)
        return {"status": "success", "message": "Credentials saved successfully"}
    except FileSafetyError as exc:
        status_code = 413 if "too large" in str(exc).lower() else 400
        raise public_http_error(status_code=status_code, public_detail="File upload error. Check server logs.", exc=exc, log_context="FileSafetyError in upload")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")
    except ValueError as e:
        raise public_http_error(status_code=400, public_detail="Invalid authentication request. Check server logs.", exc=e, log_context="Exception in auth_router")
    except Exception as e:
        raise public_http_error(status_code=500, public_detail="Authentication failed. Check server logs.", exc=e, log_context="Exception in auth_router")
