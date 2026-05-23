from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fastapi import UploadFile
from PIL import Image, ImageFile, UnidentifiedImageError

from api.services.file_safety import FileSafetyError


MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_MARKDOWN_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_GOOGLE_CREDENTIALS_UPLOAD_BYTES = 1 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
ALLOWED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
ALLOWED_IMAGE_MIME_BY_SUFFIX = {
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".png": {"image/png"},
    ".gif": {"image/gif"},
    ".webp": {"image/webp"},
}


def detect_image_suffix(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return ".webp"
    return None


async def read_upload_file_limited(file: UploadFile, *, max_bytes: int = MAX_IMAGE_UPLOAD_BYTES) -> bytes:
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise FileSafetyError("Image file is too large")
    return data


async def read_text_upload_limited(
    file: UploadFile,
    *,
    max_bytes: int,
    too_large_message: str,
    decode_error_message: str,
) -> str:
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise FileSafetyError(too_large_message)
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise FileSafetyError(decode_error_message) from exc


def validate_image_upload(file: UploadFile, data: bytes, *, expected_suffix: str | None = None) -> str:
    original_suffix = Path(file.filename or "").suffix.lower()
    if original_suffix not in ALLOWED_IMAGE_SUFFIXES:
        raise FileSafetyError("File must be a png, jpeg, gif, or webp image")

    if expected_suffix and original_suffix != expected_suffix.lower():
        raise FileSafetyError("Uploaded file extension does not match the target image")

    content_type = (file.content_type or "").split(";", 1)[0].strip().lower()
    allowed_mimes = ALLOWED_IMAGE_MIME_BY_SUFFIX.get(original_suffix, set())
    if content_type not in allowed_mimes:
        raise FileSafetyError("File must be a png, jpeg, gif, or webp image")

    detected_suffix = detect_image_suffix(data)
    if detected_suffix is None:
        raise FileSafetyError("Uploaded file does not match its image type")

    if original_suffix in {".jpg", ".jpeg"}:
        if detected_suffix != ".jpg":
            raise FileSafetyError("Uploaded file does not match its image type")
    elif detected_suffix != original_suffix:
        raise FileSafetyError("Uploaded file does not match its image type")

    validate_image_decodes(data)
    return original_suffix


def validate_image_decodes(data: bytes) -> None:
    Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
    ImageFile.LOAD_TRUNCATED_IMAGES = False

    try:
        with Image.open(BytesIO(data)) as image:
            width, height = image.size
            if width <= 0 or height <= 0:
                raise FileSafetyError("Uploaded image has invalid dimensions")
            if width * height > MAX_IMAGE_PIXELS:
                raise FileSafetyError("Uploaded image dimensions are too large")
            image.verify()
    except FileSafetyError:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise FileSafetyError("Uploaded file is not a decodable image") from exc
