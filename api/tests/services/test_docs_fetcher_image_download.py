from __future__ import annotations

from pathlib import Path

import httpx
import pytest

from api.services.docs_fetcher import DocsFetcherService, MAX_IMPORTED_IMAGE_BYTES


def make_service(tmp_path: Path) -> DocsFetcherService:
    service = DocsFetcherService.__new__(DocsFetcherService)
    service.project_root = tmp_path
    service.assets_dir = tmp_path / "assets" / "imported"
    return service


def test_validate_google_image_uri_rejects_http_and_unknown_host(tmp_path):
    service = make_service(tmp_path)

    with pytest.raises(ValueError):
        service._validate_google_image_uri("http://lh3.googleusercontent.com/a.png")

    with pytest.raises(ValueError):
        service._validate_google_image_uri("https://evil.example/a.png")


def test_download_image_sync_accepts_googleusercontent_png(monkeypatch, tmp_path):
    service = make_service(tmp_path)
    real_client = httpx.Client

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "image/png"}, content=b"\x89PNG\r\n\x1a\nx")

    monkeypatch.setattr(httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))

    rel_path = service.download_image_sync("https://lh3.googleusercontent.com/a.png", "doc-1", "../image")

    assert rel_path == "assets/imported/doc-1/image.png"
    assert (tmp_path / rel_path).read_bytes() == b"\x89PNG\r\n\x1a\nx"


def test_download_image_sync_sanitizes_doc_id_and_image_id(monkeypatch, tmp_path):
    service = make_service(tmp_path)
    real_client = httpx.Client

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "image/png"}, content=b"\x89PNG\r\n\x1a\nx")

    monkeypatch.setattr(httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))

    rel_path = service.download_image_sync("https://lh3.googleusercontent.com/a.png", "../doc", "../image")

    assert rel_path == "assets/imported/doc/image.png"
    assert (tmp_path / rel_path).exists()


def test_download_image_sync_rejects_unsupported_content_type(monkeypatch, tmp_path):
    service = make_service(tmp_path)
    real_client = httpx.Client

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, headers={"content-type": "text/html"}, content=b"<html></html>")

    monkeypatch.setattr(httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))

    assert service.download_image_sync("https://lh3.googleusercontent.com/a.png", "doc-1", "image") is None


def test_download_image_sync_rejects_oversize(monkeypatch, tmp_path):
    service = make_service(tmp_path)
    real_client = httpx.Client

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            headers={"content-type": "image/png"},
            content=b"x" * (MAX_IMPORTED_IMAGE_BYTES + 1),
        )

    monkeypatch.setattr(httpx, "Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))

    assert service.download_image_sync("https://lh3.googleusercontent.com/a.png", "doc-1", "image") is None
