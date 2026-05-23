"""
Security defaults and validation tests for authentication services.
"""

from __future__ import annotations

from pathlib import Path
from datetime import datetime, timedelta, timezone
import json
from unittest.mock import MagicMock, patch

import pytest
from google.oauth2.credentials import Credentials
from unittest.mock import AsyncMock

from api.dependencies.auth import is_auth_bypass_enabled
from api.services.app_auth import AppAuthService
from api.services.google_auth import GoogleAuthService


def test_auth_bypass_is_disabled_by_default(monkeypatch):
    monkeypatch.delenv("AUTH_BYPASS_ENABLED", raising=False)

    assert is_auth_bypass_enabled() is False


def test_session_secret_is_required(monkeypatch):
    monkeypatch.delenv("SESSION_SECRET", raising=False)

    service = AppAuthService()

    with pytest.raises(RuntimeError, match="SESSION_SECRET is not set"):
        service.get_session_secret()


def test_issue_invite_token_rejects_overlong_label():
    service = AppAuthService()

    with pytest.raises(ValueError, match="Invite label must be"):
        service.issue_invite_token("x" * 81)


def test_invite_token_has_expiry_and_auth_state_is_private(tmp_path, monkeypatch):
    service = AppAuthService()
    monkeypatch.setattr(service, "config_dir", tmp_path)
    monkeypatch.setattr(service, "auth_file", tmp_path / "auth.json")
    monkeypatch.setenv("INVITE_TOKEN_TTL_DAYS", "1")

    invite = service.issue_invite_token("Editor")
    listed = service.list_invites()[0]

    assert invite["expiresAt"]
    assert listed["expiresAt"] == invite["expiresAt"]
    assert listed["active"] is True
    assert oct(service.auth_file.stat().st_mode & 0o777) == "0o600"


def test_expired_invite_token_is_rejected(tmp_path, monkeypatch):
    service = AppAuthService()
    monkeypatch.setattr(service, "config_dir", tmp_path)
    monkeypatch.setattr(service, "auth_file", tmp_path / "auth.json")
    issued = service.issue_invite_token("Editor")
    state = service._load_state()
    state["invites"][0]["expiresAt"] = (
        datetime.now(timezone.utc) - timedelta(days=1)
    ).isoformat().replace("+00:00", "Z")
    service._save_state(state)

    assert service.authenticate_invite(issued["token"]) is None
    assert service.list_invites()[0]["active"] is False


def test_google_auth_requires_allowlist(monkeypatch):
    monkeypatch.delenv("ALLOWED_REDIRECT_URIS", raising=False)

    service = GoogleAuthService()

    with pytest.raises(ValueError, match="ALLOWED_REDIRECT_URIS is not configured"):
        service.get_auth_url("http://localhost:5173/auth/callback")


@pytest.mark.asyncio
@pytest.mark.parametrize("method_name", ["get_auth_url", "exchange_code"])
async def test_google_auth_rejects_unlisted_redirect_uri(monkeypatch, method_name):
    monkeypatch.setenv("ALLOWED_REDIRECT_URIS", "http://localhost:5173/auth/callback")

    service = GoogleAuthService()

    with pytest.raises(ValueError, match="not in allowed list"):
        if method_name == "get_auth_url":
            service.get_auth_url("http://evil.example/auth/callback")
        else:
            await service.exchange_code("test-code", "http://evil.example/auth/callback")


def test_google_auth_allows_listed_redirect_uri(monkeypatch, tmp_path):
    monkeypatch.setenv("ALLOWED_REDIRECT_URIS", "http://localhost:5173/auth/callback")

    service = GoogleAuthService()
    service.client_secrets_file = tmp_path / "client_secret.json"
    service.client_secrets_file.write_text("{}", encoding="utf-8")

    mock_flow = MagicMock()
    mock_flow.authorization_url.return_value = ("https://auth.example", None)

    with patch("api.services.google_auth.Flow.from_client_secrets_file", return_value=mock_flow) as mock_from:
        auth_url = service.get_auth_url("http://localhost:5173/auth/callback", state="state-123")

    assert auth_url == "https://auth.example"
    mock_from.assert_called_once()
    mock_flow.authorization_url.assert_called_once_with(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state="state-123",
    )


def test_save_client_secrets_rejects_incomplete_config(tmp_path):
    service = GoogleAuthService()
    service.client_secrets_file = tmp_path / "client_secret.json"

    with pytest.raises(ValueError, match="missing required fields"):
        service.save_client_secrets({"web": {"client_id": "client-id"}})


@pytest.mark.asyncio
async def test_google_auth_refresh_token_uses_stored_refresh_token(monkeypatch, tmp_path):
    monkeypatch.setenv("ALLOWED_REDIRECT_URIS", "http://localhost:5173/auth/callback")

    service = GoogleAuthService()
    service.client_secrets_file = tmp_path / "client_secret.json"
    service.token_file = tmp_path / "token.json"
    service.client_secrets_file.write_text(
        json.dumps(
            {
                "web": {
                    "client_id": "client-id",
                    "client_secret": "client-secret",
                    "token_uri": "https://oauth2.googleapis.com/token",
                }
            }
        ),
        encoding="utf-8",
    )
    service.user_info = {"email": "stale@example.com"}
    service.credentials = Credentials(
        token="old-access-token",
        refresh_token="stored-refresh-token",
        token_uri="https://oauth2.googleapis.com/token",
        client_id="client-id",
        client_secret="client-secret",
        scopes=[],
    )

    async def refresh_user_info():
        service.user_info = {"email": "fresh@example.com"}

    monkeypatch.setattr(service, "_fetch_user_info", refresh_user_info)

    def fake_refresh(self, request):
        self.token = "new-access-token"
        self.expiry = datetime.utcnow() + timedelta(hours=1)

    monkeypatch.setattr(Credentials, "refresh", fake_refresh, raising=False)

    token_info = await service.refresh_token()

    assert token_info["access_token"] == "new-access-token"
    assert token_info["refresh_token"] == "stored-refresh-token"
    assert service.user_info == {"email": "fresh@example.com"}
