from __future__ import annotations

import pytest
from io import BytesIO
from fastapi import UploadFile
from PIL import Image

from api.services.file_safety import FileSafetyError
from api.services.upload_validation import (
    MAX_IMAGE_UPLOAD_BYTES,
    detect_image_suffix,
    read_upload_file_limited,
    validate_image_upload,
)


def make_upload(name: str, content_type: str) -> UploadFile:
    return UploadFile(filename=name, file=BytesIO(), headers={"content-type": content_type})


def image_bytes(fmt: str) -> bytes:
    buffer = BytesIO()
    image = Image.new("RGB", (2, 2), color=(32, 64, 96))
    save_format = "JPEG" if fmt == "jpg" else fmt.upper()
    image.save(buffer, format=save_format)
    return buffer.getvalue()


def test_detect_image_suffixes():
    assert detect_image_suffix(b"\x89PNG\r\n\x1a\nx") == ".png"
    assert detect_image_suffix(b"\xff\xd8\xffx") == ".jpg"
    assert detect_image_suffix(b"GIF89ax") == ".gif"
    assert detect_image_suffix(b"RIFFxxxxWEBPx") == ".webp"
    assert detect_image_suffix(b"<html>") is None


@pytest.mark.parametrize(
    ("name", "content_type", "data"),
    [
        ("a.png", "image/png", image_bytes("png")),
        ("a.jpg", "image/jpeg", image_bytes("jpg")),
        ("a.jpeg", "image/jpeg", image_bytes("jpg")),
        ("a.gif", "image/gif", image_bytes("gif")),
        ("a.webp", "image/webp", image_bytes("webp")),
    ],
)
def test_validate_image_upload_accepts_supported_images(name, content_type, data):
    assert validate_image_upload(make_upload(name, content_type), data)


@pytest.mark.parametrize(
    ("name", "content_type", "data"),
    [
        ("a.svg", "image/svg+xml", b"<svg></svg>"),
        ("a.png", "text/html", b"\x89PNG\r\n\x1a\nx"),
        ("a.png", "image/png", b"<html></html>"),
        ("a.png", "image/png", b"\xff\xd8\xffx"),
        ("a.png", "image/png", b"\x89PNG\r\n\x1a\nnot really a png"),
    ],
)
def test_validate_image_upload_rejects_unsafe_images(name, content_type, data):
    with pytest.raises(FileSafetyError):
        validate_image_upload(make_upload(name, content_type), data)


@pytest.mark.asyncio
async def test_read_upload_file_limited_rejects_oversize():
    upload = UploadFile(
        filename="a.png",
        file=BytesIO(),
        headers={"content-type": "image/png"},
    )

    async def read(size):
        return b"x" * (MAX_IMAGE_UPLOAD_BYTES + 1)

    upload.read = read

    with pytest.raises(FileSafetyError, match="too large"):
        await read_upload_file_limited(upload)
