from fastapi.testclient import TestClient
from api.main import app
import pytest
from unittest.mock import patch

client = TestClient(app)

SENSITIVE_FRAGMENTS = [
    "client_secret.json",
    "token.json",
    "credentials.json",
    "service_account.json",
    "authorized_user.json",
    "/Users/",
    "/home/",
    "\\Users\\",
    "Traceback",
]

def assert_no_sensitive_fragments(text: str) -> None:
    for fragment in SENSITIVE_FRAGMENTS:
        assert fragment not in text

def test_public_error_sanitization_google_login(monkeypatch):
    monkeypatch.setenv("GOOGLE_INTEGRATION_ENABLED", "true")
    monkeypatch.setenv("ADMIN_SECRET", "test-secret")

    # Force bypass auth so we can get into the endpoint
    import api.dependencies.auth as auth_deps
    monkeypatch.setattr(auth_deps, "is_auth_bypass_enabled", lambda: True)

    # We must patch get_optional_session since it reads the session.
    # Actually wait, bypassing auth via `AUTH_BYPASS_ENABLED=true` skips the session check
    # in `require_admin`. Let's also patch it in `api.routers.auth` just in case.
    from api.routers.auth import is_auth_bypass_enabled
    monkeypatch.setattr("api.routers.auth.is_auth_bypass_enabled", lambda: True)

    from api.routers.auth import auth_service

    with patch.object(auth_service, 'get_auth_url') as mock_get_auth_url:
        mock_get_auth_url.side_effect = Exception("Mock error showing local path /home/user/.credentials/client_secret.json")

        # TestClient automatically passes session if we have SessionMiddleware
        # Let's bypass Depends completely for the test
        app.dependency_overrides[auth_deps.require_admin] = lambda: {"role": "admin"}

        response = client.get(
            "/api/v1/auth/google/login?redirect_uri=http://localhost:5173/auth/callback"
        )

        assert response.status_code == 500
        assert_no_sensitive_fragments(response.text)

        data = response.json()
        assert data["detail"] == "Authentication failed. Check server logs."


def test_public_error_sanitization_google_login_value_error(monkeypatch):
    monkeypatch.setenv("GOOGLE_INTEGRATION_ENABLED", "true")
    monkeypatch.setenv("ADMIN_SECRET", "test-secret")
    import api.dependencies.auth as auth_deps
    from api.routers.auth import auth_service

    app.dependency_overrides[auth_deps.require_admin] = lambda: {"role": "admin"}

    with patch.object(auth_service, 'get_auth_url') as mock_get_auth_url:
        mock_get_auth_url.side_effect = ValueError("Invalid client_secret.json configuration")

        response = client.get(
            "/api/v1/auth/google/login?redirect_uri=http://localhost:5173/auth/callback"
        )

        assert response.status_code == 400
        assert_no_sensitive_fragments(response.text)

        data = response.json()
        assert data["detail"] == "Invalid authentication request. Check server logs."


def test_public_error_sanitization_google_docs_sync_all_failure(monkeypatch):
    monkeypatch.setenv("GOOGLE_INTEGRATION_ENABLED", "true")
    
    import api.dependencies.auth as auth_deps
    from api.routers.docs import docs_service, project_store
    
    app.dependency_overrides[auth_deps.require_editor_or_admin] = lambda: {"role": "editor"}
    
    # Mock project store load to return a chapter with googleDocId
    async def mock_load():
        return {
            "chapters": [
                {
                    "id": "ch_001",
                    "title": "Mock Chapter",
                    "googleDocId": "mock-doc-id",
                    "localPath": "content/mock.md",
                    "enabled": True,
                }
            ]
        }
    async def mock_save(data):
        return None
    async def mock_update_sync_time():
        return None
    monkeypatch.setattr(project_store, "load", mock_load)
    monkeypatch.setattr(project_store, "save", mock_save)
    monkeypatch.setattr(project_store, "update_sync_time", mock_update_sync_time)
    
    with patch.object(docs_service, 'fetch_and_convert') as mock_fetch:
        mock_fetch.side_effect = Exception("Failed at /home/user/.credentials/credentials.json")
        
        response = client.post("/api/v1/docs/sync/all")
        
        assert response.status_code == 200
        assert_no_sensitive_fragments(response.text)
        
        data = response.json()
        assert len(data) == 1
        assert data[0]["status"] == "failed"
        assert "Check server logs." in data[0]["message"]


def test_public_error_sanitization_open_in_finder_failure(monkeypatch):
    monkeypatch.setenv("ENABLE_OPEN_IN_FINDER", "true")
    
    import api.dependencies.auth as auth_deps
    from api.routers.build import build_runner
    import subprocess
    
    app.dependency_overrides[auth_deps.require_admin] = lambda: {"role": "admin"}
    
    # Mock build runner get_output_dir and file existence
    from pathlib import Path
    monkeypatch.setattr(build_runner, "get_output_dir", lambda: Path("/tmp"))
    monkeypatch.setattr("api.routers.build.resolve_project_relative_file", lambda *args, **kwargs: Path("/tmp/test.pdf"))
    
    with patch("subprocess.run") as mock_run:
        # Mock CalledProcessError containing personal path
        mock_run.side_effect = subprocess.CalledProcessError(
            returncode=1,
            cmd="open -R /Users/test/out/test.pdf",
            stderr=b"Command failed at /Users/test/out/test.pdf"
        )
        
        response = client.post("/api/v1/build/open-in-finder", json={"path": "test.pdf"})
        
        assert response.status_code == 500
        assert_no_sensitive_fragments(response.text)
        
        data = response.json()
        assert "Failed to open output file. Check server logs." in data["detail"]


def test_public_error_sanitization_google_token_refresh_failure(monkeypatch):
    monkeypatch.setenv("GOOGLE_INTEGRATION_ENABLED", "true")
    
    import api.dependencies.auth as auth_deps
    from api.routers.auth import auth_service
    
    app.dependency_overrides[auth_deps.require_admin] = lambda: {"role": "admin"}
    
    with patch.object(auth_service, 'refresh_token') as mock_refresh:
        mock_refresh.side_effect = Exception("Cannot read /Users/test/.credentials/authorized_user.json")
        
        response = client.post("/api/v1/auth/google/refresh")
        
        assert response.status_code == 400
        assert_no_sensitive_fragments(response.text)
        
        data = response.json()
        assert "Invalid authentication request. Check server logs." in data["detail"]

