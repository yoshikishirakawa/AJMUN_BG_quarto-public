from __future__ import annotations

import pytest

from api.services.runtime_config import assert_safe_runtime_config, is_production_env


def test_development_allows_bypass(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("AUTH_BYPASS_ENABLED", "true")

    assert is_production_env() is False
    assert_safe_runtime_config()


def _set_valid_production_env(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AUTH_BYPASS_ENABLED", "false")
    monkeypatch.setenv("SESSION_SECRET", "s" * 40)
    monkeypatch.setenv("ADMIN_SECRET", "a" * 40)
    monkeypatch.setenv("SESSION_COOKIE_SECURE", "true")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://example.com")
    monkeypatch.setenv("ALLOWED_REDIRECT_URIS", "https://example.com/auth/callback")


def test_production_valid_config_passes(monkeypatch):
    _set_valid_production_env(monkeypatch)

    assert_safe_runtime_config()


@pytest.mark.parametrize(
    ("name", "value", "match"),
    [
        ("AUTH_BYPASS_ENABLED", "true", "AUTH_BYPASS_ENABLED"),
        ("SESSION_SECRET", "", "SESSION_SECRET"),
        ("ADMIN_SECRET", "", "ADMIN_SECRET"),
        ("SESSION_SECRET", "change-me-session-secret-value-12345", "placeholder"),
        ("ADMIN_SECRET", "short-admin-secret", "at least"),
        ("SESSION_COOKIE_SECURE", "false", "SESSION_COOKIE_SECURE"),
        ("ALLOWED_ORIGINS", "http://localhost:5173", "localhost origins"),
        ("ALLOWED_ORIGINS", "http://example.com", "must use https"),
        ("ALLOWED_ORIGINS", "*", "must not contain"),
        ("ALLOWED_REDIRECT_URIS", "http://localhost:5173/auth/callback", "localhost URIs"),
        ("ALLOWED_REDIRECT_URIS", "http://example.com/auth/callback", "must use https"),
    ],
)
def test_production_rejects_unsafe_values(monkeypatch, name, value, match):
    _set_valid_production_env(monkeypatch)
    monkeypatch.setenv(name, value)

    with pytest.raises(RuntimeError, match=match):
        assert_safe_runtime_config()
