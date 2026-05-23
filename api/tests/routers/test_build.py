"""
Router tests for build endpoints.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies.auth import require_admin, require_editor_or_admin
from api.routers import build as build_router


@pytest.fixture(autouse=True)
def _clear_active_builds():
    build_router.active_builds.clear()
    yield
    build_router.active_builds.clear()


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(build_router.router, prefix="/api/v1/build")
    app.dependency_overrides[require_admin] = lambda: {"role": "admin"}
    app.dependency_overrides[require_editor_or_admin] = lambda: {"role": "admin"}
    return app


def test_start_build_rejects_unknown_chapters(monkeypatch):
    monkeypatch.setattr(
        build_router.build_runner.project_store,
        "load",
        AsyncMock(return_value={"chapters": [{"id": "ch_001", "localPath": "content/chapter1.qmd", "enabled": True}]}),
    )
    monkeypatch.setattr(build_router.build_runner, "create_build", AsyncMock(return_value="build_123"))
    monkeypatch.setattr(build_router.build_runner, "run_build", AsyncMock())

    client = TestClient(_build_app())

    response = client.post(
        "/api/v1/build/start",
        json={"format": "html", "chapters": ["ch_999"], "clean": False},
    )

    assert response.status_code == 400
    assert "Invalid target structure" in response.json()["detail"]
    assert build_router.build_runner.create_build.await_count == 0


def test_start_build_accepts_known_chapters(monkeypatch):
    monkeypatch.setattr(
        build_router.build_runner.project_store,
        "load",
        AsyncMock(return_value={"chapters": [{"id": "ch_001", "localPath": "content/chapter1.qmd", "enabled": True}]}),
    )
    monkeypatch.setattr(build_router.build_runner, "create_build", AsyncMock(return_value="build_123"))
    monkeypatch.setattr(build_router.build_runner, "run_build", AsyncMock(return_value=None))

    client = TestClient(_build_app())

    response = client.post(
        "/api/v1/build/start",
        json={"format": "html", "chapters": ["ch_001"], "clean": False},
    )

    assert response.status_code == 200
    assert response.json()["id"] == "build_123"
    assert build_router.build_runner.create_build.await_count == 1


def test_start_build_rejects_when_build_is_active(monkeypatch):
    build_router.active_builds["existing"] = build_router.BuildStatus(
        id="existing",
        status="running",
        format="html",
        progress=0.5,
    )
    monkeypatch.setattr(build_router.build_runner, "is_build_running", lambda: False)
    monkeypatch.setattr(build_router.build_runner, "create_build", AsyncMock(return_value="build_123"))

    client = TestClient(_build_app())

    response = client.post("/api/v1/build/start", json={"format": "html", "clean": False})

    assert response.status_code == 409
    assert "already running" in response.json()["detail"]
    assert build_router.build_runner.create_build.await_count == 0
