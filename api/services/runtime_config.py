from __future__ import annotations

import os


TRUE_VALUES = {"1", "true", "yes", "on"}
MIN_PRODUCTION_SECRET_LENGTH = 32
PLACEHOLDER_SECRET_MARKERS = (
    "change-me",
    "changeme",
    "replace-me",
    "replace_me",
    "example",
    "secret",
    "password",
)


def get_bool_env(name: str, default: str = "false") -> bool:
    value = os.getenv(name, default).strip().lower()
    return value in TRUE_VALUES


def get_csv_env(name: str) -> list[str]:
    raw = os.getenv(name, "").strip()
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


def is_production_env() -> bool:
    return os.getenv("APP_ENV", "development").strip().lower() in {"production", "prod"}


def _is_localhost_url(value: str) -> bool:
    lowered = value.strip().lower()
    return lowered.startswith("http://localhost") or lowered.startswith("http://127.0.0.1")


def _validate_production_secret(name: str, errors: list[str]) -> None:
    value = os.getenv(name, "").strip()
    lowered = value.lower()
    if not value:
        errors.append(f"{name} is required in production")
        return
    if len(value) < MIN_PRODUCTION_SECRET_LENGTH:
        errors.append(f"{name} must be at least {MIN_PRODUCTION_SECRET_LENGTH} characters in production")
    if any(marker in lowered for marker in PLACEHOLDER_SECRET_MARKERS):
        errors.append(f"{name} must not use a placeholder value in production")


def assert_safe_runtime_config() -> None:
    if not is_production_env():
        return

    errors: list[str] = []

    if get_bool_env("AUTH_BYPASS_ENABLED", "false"):
        errors.append("AUTH_BYPASS_ENABLED must be false in production")

    _validate_production_secret("SESSION_SECRET", errors)
    _validate_production_secret("ADMIN_SECRET", errors)

    if not get_bool_env("SESSION_COOKIE_SECURE", "true"):
        errors.append("SESSION_COOKIE_SECURE must be true in production")

    allowed_origins = get_csv_env("ALLOWED_ORIGINS")
    if not allowed_origins:
        errors.append("ALLOWED_ORIGINS is required in production")

    for origin in allowed_origins:
        if origin == "*":
            errors.append("ALLOWED_ORIGINS must not contain '*' in production")
        if _is_localhost_url(origin):
            errors.append("ALLOWED_ORIGINS must not contain localhost origins in production")
        if not origin.startswith("https://"):
            errors.append(f"ALLOWED_ORIGINS must use https in production: {origin}")

    redirect_uris = get_csv_env("ALLOWED_REDIRECT_URIS")
    if not redirect_uris:
        errors.append("ALLOWED_REDIRECT_URIS is required in production")

    for uri in redirect_uris:
        if _is_localhost_url(uri):
            errors.append("ALLOWED_REDIRECT_URIS must not contain localhost URIs in production")
        if not uri.startswith("https://"):
            errors.append(f"ALLOWED_REDIRECT_URIS must use https in production: {uri}")

    if errors:
        raise RuntimeError("Unsafe production configuration: " + "; ".join(errors))
