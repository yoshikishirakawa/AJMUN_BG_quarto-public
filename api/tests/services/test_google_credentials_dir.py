from __future__ import annotations

import pytest

from api.services.google_auth import GoogleAuthService


def test_development_uses_repo_credentials_by_default(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("GOOGLE_CREDENTIALS_DIR", raising=False)

    service = GoogleAuthService()

    assert service.credentials_path == service.project_root / ".credentials"


def test_development_uses_custom_credentials_dir(monkeypatch, tmp_path):
    custom = tmp_path / "creds"
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.setenv("GOOGLE_CREDENTIALS_DIR", str(custom))

    service = GoogleAuthService()

    assert service.credentials_path == custom.resolve()
    assert service.credentials_path.exists()


def test_production_requires_credentials_dir(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("GOOGLE_CREDENTIALS_DIR", raising=False)

    with pytest.raises(RuntimeError, match="GOOGLE_CREDENTIALS_DIR is required"):
        GoogleAuthService()


def test_production_rejects_repo_relative_credentials_dir(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("GOOGLE_CREDENTIALS_DIR", ".credentials")

    with pytest.raises(RuntimeError, match="outside the repository"):
        GoogleAuthService()


def test_production_allows_repo_external_credentials_dir(monkeypatch, tmp_path):
    custom = tmp_path / "creds"
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("GOOGLE_CREDENTIALS_DIR", str(custom))

    service = GoogleAuthService()

    assert service.credentials_path == custom.resolve()
