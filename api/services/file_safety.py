"""
Shared file path and upload-name validation helpers.
"""
from __future__ import annotations

import re
import uuid
from pathlib import Path, PurePosixPath
from typing import Iterable


class FileSafetyError(ValueError):
    """Raised when a user-controlled path or filename is unsafe."""


def _as_posix_relative(value: str) -> PurePosixPath:
    raw = (value or "").strip()
    if not raw:
        raise FileSafetyError("Path is required")
    if "\\" in raw:
        raise FileSafetyError("Backslashes are not allowed in paths")

    path = PurePosixPath(raw)
    if path.is_absolute():
        raise FileSafetyError("Absolute paths are not allowed")
    if any(part in {"", ".", ".."} for part in path.parts):
        raise FileSafetyError("Path traversal is not allowed")
    return path


def resolve_project_relative_file(
    project_root: Path,
    relative_path: str,
    *,
    required_prefix: str | None = None,
    allowed_suffixes: Iterable[str] | None = None,
    must_exist: bool = False,
) -> Path:
    """Resolve a safe project-relative file path."""
    posix_path = _as_posix_relative(relative_path)

    if required_prefix:
        prefix = _as_posix_relative(required_prefix)
        if posix_path.parts[: len(prefix.parts)] != prefix.parts:
            raise FileSafetyError(f"Path must be under {required_prefix}")

    suffixes = {suffix.lower() for suffix in (allowed_suffixes or [])}
    if suffixes and posix_path.suffix.lower() not in suffixes:
        raise FileSafetyError(f"Unsupported file extension: {posix_path.suffix}")

    root = project_root.resolve()
    candidate = (root / Path(*posix_path.parts)).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise FileSafetyError("Path escapes the project root") from exc

    if must_exist and not candidate.exists():
        raise FileSafetyError("File not found")
    return candidate


def resolve_content_markdown_path(project_root: Path, relative_path: str, *, must_exist: bool = False) -> Path:
    return resolve_project_relative_file(
        project_root,
        relative_path,
        required_prefix="content",
        allowed_suffixes={".md", ".qmd"},
        must_exist=must_exist,
    )


def resolve_uploaded_image_path(project_root: Path, filename: str, *, must_exist: bool = False) -> Path:
    safe_name = sanitize_existing_filename(filename)
    return resolve_project_relative_file(
        project_root,
        f"assets/uploads/{safe_name}",
        required_prefix="assets/uploads",
        allowed_suffixes={".jpg", ".jpeg", ".png", ".gif", ".webp"},
        must_exist=must_exist,
    )


def sanitize_existing_filename(filename: str) -> str:
    raw = (filename or "").strip()
    if not raw or "/" in raw or "\\" in raw or ".." in raw:
        raise FileSafetyError("Invalid filename")
    if Path(raw).name != raw:
        raise FileSafetyError("Invalid filename")
    return raw


def safe_upload_filename(original_filename: str | None, *, prefix: str, allowed_suffixes: Iterable[str]) -> str:
    suffixes = {suffix.lower() for suffix in allowed_suffixes}
    original_name = Path((original_filename or "upload").replace("\\", "/")).name
    suffix = Path(original_name).suffix.lower()
    if suffix not in suffixes:
        raise FileSafetyError(f"Unsupported file extension: {suffix}")

    stem = Path(original_name).stem
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._-") or "upload"
    stem = stem[:80]
    safe_prefix = re.sub(r"[^A-Za-z0-9._-]+", "_", prefix).strip("._-") or "file"
    return f"{safe_prefix}_{uuid.uuid4().hex[:12]}_{stem}{suffix}"


def unique_content_path(project_root: Path, title: str, *, suffix: str = ".md") -> str:
    suffix = suffix.lower()
    if suffix not in {".md", ".qmd"}:
        raise FileSafetyError(f"Unsupported file extension: {suffix}")

    stem = re.sub(r"[^\w.-]+", "_", title or "", flags=re.UNICODE).strip("._-")
    if not stem:
        stem = "chapter"
    stem = stem[:80]

    content_dir = project_root / "content"
    content_dir.mkdir(parents=True, exist_ok=True)
    candidate = f"content/{stem}{suffix}"
    counter = 2
    while resolve_content_markdown_path(project_root, candidate).exists():
        candidate = f"content/{stem}_{counter}{suffix}"
        counter += 1
    return candidate
