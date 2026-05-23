from __future__ import annotations

from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies.auth import require_editor_or_admin
from api.routers import docs as docs_router


def _build_client(tmp_path, monkeypatch) -> TestClient:
    store = SimpleNamespace(
        project_root=tmp_path,
        load=AsyncMock(return_value={"chapters": []}),
        add_chapter=AsyncMock(),
    )
    (tmp_path / "content").mkdir()
    monkeypatch.setattr(docs_router, "project_store", store)

    app = FastAPI()
    app.include_router(docs_router.router, prefix="/api/v1/docs")
    app.dependency_overrides[require_editor_or_admin] = lambda: {"role": "admin"}
    return TestClient(app)


def test_import_markdown_rejects_oversize(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)

    response = client.post(
        "/api/v1/docs/import-markdown",
        files={"file": ("huge.md", BytesIO(b"x" * (2 * 1024 * 1024 + 1)), "text/markdown")},
    )

    assert response.status_code == 413
    assert "File upload error. Check server logs." in response.json()["detail"]


def test_import_markdown_rejects_non_utf8(tmp_path, monkeypatch):
    client = _build_client(tmp_path, monkeypatch)

    response = client.post(
        "/api/v1/docs/import-markdown",
        files={"file": ("chapter.md", BytesIO("本文".encode("utf-16")), "text/markdown")},
    )

    assert response.status_code == 400
    assert "File upload error" in response.json()["detail"]
