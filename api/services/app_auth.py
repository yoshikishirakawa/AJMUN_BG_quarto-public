"""
Application authentication service.
"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


MAX_INVITE_LABEL_LENGTH = 80
DEFAULT_INVITE_TOKEN_TTL_DAYS = 30


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_utc_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


class AppAuthService:
    """Lightweight admin + invite-token authentication state."""

    def __init__(self) -> None:
        self.project_root = Path(__file__).parent.parent.parent
        self.config_dir = self.project_root / "config"
        self.auth_file = self.config_dir / "auth.json"

    def get_admin_secret(self) -> Optional[str]:
        secret = os.getenv("ADMIN_SECRET", "").strip()
        return secret or None

    def get_session_secret(self) -> str:
        secret = os.getenv("SESSION_SECRET", "").strip()
        if not secret:
            raise RuntimeError(
                "SESSION_SECRET is not set. Please define a strong random value in your .env file."
            )
        return secret

    def verify_admin_secret(self, secret: str) -> bool:
        admin_secret = self.get_admin_secret()
        if not admin_secret:
            return False
        return secrets.compare_digest(secret or "", admin_secret)

    def get_invite_token_ttl_days(self) -> int:
        raw = os.getenv("INVITE_TOKEN_TTL_DAYS", "").strip()
        if not raw:
            return DEFAULT_INVITE_TOKEN_TTL_DAYS
        try:
            ttl_days = int(raw)
        except ValueError as exc:
            raise ValueError("INVITE_TOKEN_TTL_DAYS must be an integer") from exc
        if ttl_days <= 0:
            raise ValueError("INVITE_TOKEN_TTL_DAYS must be positive")
        return ttl_days

    def issue_invite_token(self, label: Optional[str] = None) -> Dict[str, Any]:
        normalized_label = self._normalize_invite_label(label)
        token = secrets.token_urlsafe(32)
        invite_id = f"invite_{uuid.uuid4().hex[:12]}"
        now = utc_now_iso()
        expires_at = (
            datetime.now(timezone.utc) + timedelta(days=self.get_invite_token_ttl_days())
        ).isoformat().replace("+00:00", "Z")
        invite = {
            "id": invite_id,
            "label": normalized_label,
            "role": "invited_editor",
            "tokenHash": self.hash_token(token),
            "createdAt": now,
            "updatedAt": now,
            "expiresAt": expires_at,
            "revokedAt": None,
            "lastUsedAt": None,
        }
        state = self._load_state()
        state["invites"].append(invite)
        state["updatedAt"] = now
        self._save_state(state)
        return {
            "id": invite_id,
            "label": invite["label"],
            "role": invite["role"],
            "createdAt": now,
            "expiresAt": expires_at,
            "token": token,
        }

    def _normalize_invite_label(self, label: Optional[str]) -> str:
        cleaned = (label or "").strip()
        if not cleaned:
            return "Invited editor"
        if len(cleaned) > MAX_INVITE_LABEL_LENGTH:
            raise ValueError(
                f"Invite label must be {MAX_INVITE_LABEL_LENGTH} characters or fewer"
            )
        return cleaned

    def list_invites(self) -> List[Dict[str, Any]]:
        state = self._load_state()
        invites = []
        for invite in state["invites"]:
            invites.append(self._public_invite(invite))
        return invites

    def revoke_invite(self, invite_id: str) -> bool:
        state = self._load_state()
        now = utc_now_iso()
        for invite in state["invites"]:
            if invite["id"] == invite_id:
                invite["revokedAt"] = now
                invite["updatedAt"] = now
                state["updatedAt"] = now
                self._save_state(state)
                return True
        return False

    def revoke_all_invites(self) -> int:
        state = self._load_state()
        now = utc_now_iso()
        count = 0
        for invite in state["invites"]:
            if invite.get("revokedAt") is None:
                invite["revokedAt"] = now
                invite["updatedAt"] = now
                count += 1
        if count:
            state["updatedAt"] = now
            self._save_state(state)
        return count

    def authenticate_invite(self, token: str) -> Optional[Dict[str, Any]]:
        token_hash = self.hash_token(token)
        state = self._load_state()
        now = utc_now_iso()
        for invite in state["invites"]:
            if invite.get("revokedAt") is not None:
                continue
            if self._is_invite_expired(invite):
                continue
            if secrets.compare_digest(invite["tokenHash"], token_hash):
                invite["lastUsedAt"] = now
                invite["updatedAt"] = now
                state["updatedAt"] = now
                self._save_state(state)
                return self._public_invite(invite)
        return None

    @staticmethod
    def hash_token(token: str) -> str:
        return hashlib.sha256((token or "").encode("utf-8")).hexdigest()

    def _is_invite_expired(self, invite: Dict[str, Any]) -> bool:
        expires_at = parse_utc_iso(invite.get("expiresAt"))
        if expires_at is None:
            return False
        return expires_at <= datetime.now(timezone.utc)

    def _public_invite(self, invite: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "id": invite["id"],
            "label": invite.get("label"),
            "role": invite.get("role", "invited_editor"),
            "createdAt": invite.get("createdAt"),
            "updatedAt": invite.get("updatedAt"),
            "expiresAt": invite.get("expiresAt"),
            "revokedAt": invite.get("revokedAt"),
            "lastUsedAt": invite.get("lastUsedAt"),
            "active": invite.get("revokedAt") is None and not self._is_invite_expired(invite),
        }

    def _default_state(self) -> Dict[str, Any]:
        now = utc_now_iso()
        return {
            "version": 1,
            "invites": [],
            "createdAt": now,
            "updatedAt": now,
        }

    def _load_state(self) -> Dict[str, Any]:
        if not self.auth_file.exists():
            return self._default_state()
        with open(self.auth_file, "r", encoding="utf-8") as f:
            return json.load(f)

    def _save_state(self, state: Dict[str, Any]) -> None:
        self.config_dir.mkdir(parents=True, exist_ok=True)
        tmp_path = self.auth_file.with_suffix(".json.tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False, indent=2)
        try:
            tmp_path.chmod(0o600)
        except OSError:
            pass
        os.replace(tmp_path, self.auth_file)
        try:
            self.auth_file.chmod(0o600)
        except OSError:
            pass
