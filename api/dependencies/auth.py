"""
Authentication dependencies.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException, Request, status
import os


PUBLIC_AUTH_SESSION: Dict[str, Any] = {
    "role": "admin",
    "label": "Public editing mode",
    "auth_bypass": True,
}


def is_auth_bypass_enabled() -> bool:
    value = os.getenv("AUTH_BYPASS_ENABLED", "false").strip().lower()
    return value in {"1", "true", "yes", "on"}


def get_optional_session(request: Request) -> Optional[Dict[str, Any]]:
    if is_auth_bypass_enabled():
        return dict(PUBLIC_AUTH_SESSION)
    return request.session.get("auth")


def get_session(request: Request) -> Dict[str, Any]:
    session = get_optional_session(request)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return session


def require_editor_or_admin(request: Request) -> Dict[str, Any]:
    session = get_session(request)
    role = session.get("role")
    if role not in {"admin", "invited_editor"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Editor or admin access required",
        )
    return session


def require_admin(request: Request) -> Dict[str, Any]:
    session = get_session(request)
    if session.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return session
