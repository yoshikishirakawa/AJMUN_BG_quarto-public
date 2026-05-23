"""
Router tests for authentication endpoints.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.sessions import SessionMiddleware

from api.dependencies.auth import require_admin, require_editor_or_admin
from api.routers import auth as auth_router


def _build_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key="test-session-secret")
    app.include_router(auth_router.router, prefix="/api/v1/auth")
    app.dependency_overrides[require_admin] = lambda: {"role": "admin"}
    app.dependency_overrides[require_editor_or_admin] = lambda: {"role": "admin"}
    return app


def test_google_login_rejects_invalid_redirect_uri(monkeypatch):
    monkeypatch.setattr(auth_router, "ensure_google_integration_enabled", lambda: None)

    def raise_value_error(_redirect_uri: str, state: str | None = None):
        raise ValueError("redirect_uri 'http://evil.example/auth/callback' is not in allowed list")

    monkeypatch.setattr(auth_router.auth_service, "get_auth_url", raise_value_error)

    client = TestClient(_build_app())

    response = client.get(
        "/api/v1/auth/google/login",
        params={"redirect_uri": "http://evil.example/auth/callback"},
    )

    assert response.status_code == 400
    assert "Invalid authentication request" in response.json()["detail"]


def test_google_login_stores_oauth_state(monkeypatch):
    monkeypatch.setattr(auth_router, "ensure_google_integration_enabled", lambda: None)
    monkeypatch.setattr(auth_router.secrets, "token_urlsafe", lambda _size: "state-123")

    def fake_get_auth_url(redirect_uri: str, state: str | None = None):
        assert redirect_uri == "http://localhost:5173/auth/callback"
        assert state == "state-123"
        return f"https://accounts.example/auth?state={state}"

    monkeypatch.setattr(auth_router.auth_service, "get_auth_url", fake_get_auth_url)

    client = TestClient(_build_app())

    response = client.get(
        "/api/v1/auth/google/login",
        params={"redirect_uri": "http://localhost:5173/auth/callback"},
    )

    assert response.status_code == 200
    assert response.json() == {"auth_url": "https://accounts.example/auth?state=state-123"}


def test_create_invite_rejects_overlong_label(monkeypatch):
    def raise_value_error(_label: str):
        raise ValueError("Invite label must be 80 characters or fewer")

    monkeypatch.setattr(auth_router.app_auth_service, "issue_invite_token", raise_value_error)

    client = TestClient(_build_app())

    response = client.post("/api/v1/auth/invites", json={"label": "x" * 81})

    assert response.status_code == 400
    assert "Invalid request. Check server logs." in response.json()["detail"]


def test_upload_google_credentials_rejects_incomplete_config(monkeypatch):
    monkeypatch.setattr(auth_router, "ensure_google_integration_enabled", lambda: None)

    client = TestClient(_build_app())

    response = client.post(
        "/api/v1/auth/google/credentials",
        files={
            "file": (
                "client_secret.json",
                '{"web": {"client_id": "client-id"}}',
                "application/json",
            )
        },
    )

    assert response.status_code == 400
    assert "Invalid authentication request" in response.json()["detail"]


def test_google_refresh_uses_stored_token(monkeypatch):
    monkeypatch.setattr(auth_router, "ensure_google_integration_enabled", lambda: None)

    async def fake_refresh():
        return {
            "access_token": "new-access-token",
            "refresh_token": "stored-refresh-token",
            "expires_in": 3600,
            "token_type": "Bearer",
        }

    monkeypatch.setattr(auth_router.auth_service, "refresh_token", fake_refresh)

    client = TestClient(_build_app())

    response = client.post("/api/v1/auth/google/refresh")

    assert response.status_code == 200
    assert response.json() == {"status": "refreshed", "authenticated": True}
    assert "access_token" not in response.json()
    assert "refresh_token" not in response.json()


def test_google_exchange_does_not_return_tokens(monkeypatch):
    monkeypatch.setattr(auth_router, "ensure_google_integration_enabled", lambda: None)
    monkeypatch.setattr(auth_router.secrets, "token_urlsafe", lambda _size: "state-123")

    def fake_get_auth_url(redirect_uri: str, state: str | None = None):
        return f"https://accounts.example/auth?state={state}"

    async def fake_exchange(code: str, redirect_uri: str):
        return {
            "access_token": "access-token",
            "refresh_token": "refresh-token",
            "expires_in": 3600,
            "token_type": "Bearer",
        }

    monkeypatch.setattr(auth_router.auth_service, "get_auth_url", fake_get_auth_url)
    monkeypatch.setattr(auth_router.auth_service, "exchange_code", fake_exchange)

    client = TestClient(_build_app())
    login_response = client.get(
        "/api/v1/auth/google/login",
        params={"redirect_uri": "http://localhost:5173/auth/callback"},
    )
    assert login_response.status_code == 200

    response = client.post(
        "/api/v1/auth/google/token",
        json={
            "code": "code-123",
            "redirect_uri": "http://localhost:5173/auth/callback",
            "state": "state-123",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"status": "connected", "authenticated": True}
    assert "access_token" not in response.json()
    assert "refresh_token" not in response.json()


def test_google_exchange_rejects_missing_or_invalid_state(monkeypatch):
    monkeypatch.setattr(auth_router, "ensure_google_integration_enabled", lambda: None)
    monkeypatch.setattr(auth_router.secrets, "token_urlsafe", lambda _size: "state-123")
    monkeypatch.setattr(
        auth_router.auth_service,
        "get_auth_url",
        lambda redirect_uri, state=None: f"https://accounts.example/auth?state={state}",
    )

    client = TestClient(_build_app())
    login_response = client.get(
        "/api/v1/auth/google/login",
        params={"redirect_uri": "http://localhost:5173/auth/callback"},
    )
    assert login_response.status_code == 200

    missing_response = client.post(
        "/api/v1/auth/google/token",
        json={"code": "code-123", "redirect_uri": "http://localhost:5173/auth/callback"},
    )
    assert missing_response.status_code == 400

    invalid_response = client.post(
        "/api/v1/auth/google/token",
        json={
            "code": "code-123",
            "redirect_uri": "http://localhost:5173/auth/callback",
            "state": "wrong-state",
        },
    )
    assert invalid_response.status_code == 400


def test_google_exchange_consumes_state_once(monkeypatch):
    monkeypatch.setattr(auth_router, "ensure_google_integration_enabled", lambda: None)
    monkeypatch.setattr(auth_router.secrets, "token_urlsafe", lambda _size: "state-123")
    monkeypatch.setattr(
        auth_router.auth_service,
        "get_auth_url",
        lambda redirect_uri, state=None: f"https://accounts.example/auth?state={state}",
    )

    async def fake_exchange(code: str, redirect_uri: str):
        return {}

    monkeypatch.setattr(auth_router.auth_service, "exchange_code", fake_exchange)

    client = TestClient(_build_app())
    assert client.get(
        "/api/v1/auth/google/login",
        params={"redirect_uri": "http://localhost:5173/auth/callback"},
    ).status_code == 200

    payload = {
        "code": "code-123",
        "redirect_uri": "http://localhost:5173/auth/callback",
        "state": "state-123",
    }
    assert client.post("/api/v1/auth/google/token", json=payload).status_code == 200
    assert client.post("/api/v1/auth/google/token", json=payload).status_code == 400


def test_admin_login_rate_limit(monkeypatch):
    monkeypatch.setenv("AUTH_BYPASS_ENABLED", "false")
    monkeypatch.setattr(auth_router.app_auth_service, "get_admin_secret", lambda: "secret")
    monkeypatch.setattr(auth_router.app_auth_service, "verify_admin_secret", lambda _secret: False)
    auth_router.login_rate_limiter.failures.clear()

    client = TestClient(_build_app())

    for _ in range(5):
        response = client.post("/api/v1/auth/admin/login", json={"secret": "wrong"})
        assert response.status_code == 401

    response = client.post("/api/v1/auth/admin/login", json={"secret": "wrong"})
    assert response.status_code == 429


def test_admin_login_success_resets_rate_limit(monkeypatch):
    monkeypatch.setenv("AUTH_BYPASS_ENABLED", "false")
    monkeypatch.setattr(auth_router.app_auth_service, "get_admin_secret", lambda: "secret")
    attempts = iter([False, True, False])
    monkeypatch.setattr(auth_router.app_auth_service, "verify_admin_secret", lambda _secret: next(attempts))
    auth_router.login_rate_limiter.failures.clear()

    client = TestClient(_build_app())

    assert client.post("/api/v1/auth/admin/login", json={"secret": "wrong"}).status_code == 401
    assert client.post("/api/v1/auth/admin/login", json={"secret": "secret"}).status_code == 200
    assert client.post("/api/v1/auth/admin/login", json={"secret": "wrong"}).status_code == 401


def test_upload_google_credentials_rejects_oversize(monkeypatch):
    monkeypatch.setattr(auth_router, "ensure_google_integration_enabled", lambda: None)

    client = TestClient(_build_app())

    response = client.post(
        "/api/v1/auth/google/credentials",
        files={
            "file": (
                "client_secret.json",
                b"{" + b'"x":' + b'"y"' * (1024 * 1024),
                "application/json",
            )
        },
    )

    assert response.status_code == 413
