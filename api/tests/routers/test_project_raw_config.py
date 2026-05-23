from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies.auth import require_admin, require_editor_or_admin
from api.routers import project as project_router
from api.services.project_store import ProjectStore


def _build_client(tmp_path, monkeypatch) -> TestClient:
    store = ProjectStore()
    monkeypatch.setattr(store, "project_root", tmp_path)
    monkeypatch.setattr(store, "config_path", tmp_path / ".bgproject.json")
    monkeypatch.setattr(store, "quarto_yml", tmp_path / "_quarto.yml")
    (tmp_path / "_quarto.yml").write_text("project:\n  type: book\n", encoding="utf-8")
    monkeypatch.setattr(project_router, "project_store", store)

    app = FastAPI()
    app.include_router(project_router.router, prefix="/api/v1/project")
    app.dependency_overrides[require_admin] = lambda: {"role": "admin"}
    app.dependency_overrides[require_editor_or_admin] = lambda: {"role": "admin"}
    return TestClient(app)


def test_raw_config_editor_disabled_by_default(tmp_path, monkeypatch):
    monkeypatch.delenv("ENABLE_RAW_CONFIG_EDITOR", raising=False)
    client = _build_client(tmp_path, monkeypatch)

    response = client.get("/api/v1/project/config/raw")

    assert response.status_code == 403
    assert "disabled" in response.json()["detail"]


def test_raw_config_editor_can_be_enabled(tmp_path, monkeypatch):
    monkeypatch.setenv("ENABLE_RAW_CONFIG_EDITOR", "true")
    client = _build_client(tmp_path, monkeypatch)

    response = client.get("/api/v1/project/config/raw")

    assert response.status_code == 200
    assert "project:" in response.json()["content"]


def test_raw_config_update_rejects_invalid_yaml_and_preserves_file(tmp_path, monkeypatch):
    monkeypatch.setenv("ENABLE_RAW_CONFIG_EDITOR", "true")
    client = _build_client(tmp_path, monkeypatch)

    response = client.put("/api/v1/project/config/raw", json={"content": "project: ["})

    assert response.status_code == 400
    assert (tmp_path / "_quarto.yml").read_text(encoding="utf-8") == "project:\n  type: book\n"
