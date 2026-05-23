"""
Google Docs Fetcher Service
"""
import aiofiles
import os
import httpx
import logging
import re
from pathlib import Path
from typing import Optional, List, Dict, Any
from urllib.parse import urlparse

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from api.services.google_auth import GoogleAuthService
from api.services.file_safety import resolve_content_markdown_path
from api.services.markdown_converter import MarkdownConverterService

logger = logging.getLogger(__name__)

MAX_IMPORTED_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_IMPORTED_IMAGE_TYPES = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
}
ALLOWED_GOOGLE_IMAGE_HOST_SUFFIXES = (
    "googleusercontent.com",
    ".googleusercontent.com",
)
DRIVE_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def escape_drive_query_literal(value: str) -> str:
    return (value or "").replace("\\", "\\\\").replace("'", "\\'")


def validate_drive_id(value: str) -> str:
    if not DRIVE_ID_RE.fullmatch(value or ""):
        raise ValueError("Invalid Google Drive id")
    return value

class DocsFetcherService:
    """Service for fetching Google Docs content."""
    
    def __init__(self):
        self.auth_service = GoogleAuthService()
        self.project_root = Path(__file__).parent.parent.parent
        self.content_dir = self.project_root / "content"
        self.assets_dir = self.project_root / "assets" / "imported"
        # Import here to avoid circular dependency if any (though likely safe)
        from api.services.project_store import ProjectStore
        self.project_store = ProjectStore()
    
    def _get_docs_service(self):
        """Get authenticated Google Docs API service."""
        credentials = self.auth_service.get_credentials()
        if not credentials:
            raise RuntimeError("Not authenticated. Please login first.")
        return build("docs", "v1", credentials=credentials)
    
    def _get_drive_service(self):
        """Get authenticated Google Drive API service."""
        credentials = self.auth_service.get_credentials()
        if not credentials:
            raise RuntimeError("Not authenticated. Please login first.")
        return build("drive", "v3", credentials=credentials)
    
    async def list_docs(
        self,
        query: Optional[str] = None,
        folder_id: Optional[str] = None,
        page_token: Optional[str] = None,
        page_size: int = 50,
    ) -> dict:
        """
        List Google Docs accessible to the user.
        """
        service = self._get_drive_service()
        
        # Build query
        query_parts = ["mimeType='application/vnd.google-apps.document' and trashed=false"]
        if folder_id:
            query_parts.append(f"'{validate_drive_id(folder_id)}' in parents")
        if query:
            query_parts.append(f"name contains '{escape_drive_query_literal(query)}'")
            
        q_str = " and ".join(query_parts)
        
        try:
            results = service.files().list(
                q=q_str,
                pageSize=page_size,
                pageToken=page_token,
                fields="nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, owners, thumbnailLink)",
                orderBy="modifiedTime desc",
            ).execute()
            
            return {
                "files": results.get("files", []),
                "next_page_token": results.get("nextPageToken"),
            }
        except HttpError as e:
            logger.error(f"Failed to list documents: {e}")
            raise RuntimeError(f"Failed to list documents: {e}")
    
    async def fetch_doc_json(self, doc_id: str) -> dict:
        """
        Fetch a Google Doc's content as JSON.
        """
        service = self._get_docs_service()
        try:
            document = service.documents().get(documentId=doc_id).execute()
            return document
        except HttpError as e:
            logger.error(f"Failed to fetch document: {e}")
            raise RuntimeError(f"Failed to fetch document: {e}")

    def download_image_sync(self, uri: str, doc_id: str, image_id: str) -> Optional[str]:
        """
        Synchronously download image for MarkdownConverter callback.
        """
        try:
            self._validate_google_image_uri(uri)
            doc_assets_dir = self.assets_dir / self._safe_image_id(doc_id)
            doc_assets_dir.mkdir(parents=True, exist_ok=True)

            with httpx.Client(timeout=10.0, follow_redirects=False) as client:
                with client.stream("GET", uri) as response:
                    if response.status_code != 200:
                        return None

                    content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                    ext = ALLOWED_IMPORTED_IMAGE_TYPES.get(content_type)
                    if not ext:
                        raise ValueError(f"Unsupported image content type: {content_type}")

                    chunks: list[bytes] = []
                    total = 0
                    for chunk in response.iter_bytes():
                        total += len(chunk)
                        if total > MAX_IMPORTED_IMAGE_BYTES:
                            raise ValueError("Imported image is too large")
                        chunks.append(chunk)

            filename = f"{self._safe_image_id(image_id)}.{ext}"
            filepath = doc_assets_dir / filename

            with open(filepath, "wb") as f:
                f.write(b"".join(chunks))

            rel_path = filepath.relative_to(self.project_root)
            return str(rel_path)
        except Exception as e:
            logger.error(f"Failed to download image {uri}: {e}")
            return None

    def _validate_google_image_uri(self, uri: str) -> None:
        parsed = urlparse(uri)
        if parsed.scheme != "https":
            raise ValueError("Only https image URLs are allowed")
        host = parsed.hostname or ""
        if not any(host == suffix or host.endswith(suffix) for suffix in ALLOWED_GOOGLE_IMAGE_HOST_SUFFIXES):
            raise ValueError("Image URL host is not allowed")

    def _safe_image_id(self, image_id: str) -> str:
        safe = re.sub(r"[^A-Za-z0-9._-]+", "_", image_id or "image").strip("._-")
        return safe[:80] or "image"

    async def fetch_and_convert(self, doc_id: str) -> Dict[str, Any]:
        """
        Fetch Doc JSON and convert to Markdown including image downloads.
        """
        doc_json = await self.fetch_doc_json(doc_id)
        
        # Load conversion rules
        project_data = await self.project_store.load()
        rules = project_data.get('conversionRules', [])

        # Instantiate converter with the download callback and rules
        converter = MarkdownConverterService(
            image_downloader=self.download_image_sync,
            rules=rules
        )
        markdown_content = converter.convert(doc_json)
        title = doc_json.get('title', 'Untitled')
        
        return {
            "title": title,
            "content": markdown_content,
            "doc_id": doc_id
        }
    
    async def save_markdown(self, content: str, filename: str) -> str:
        """
        Save content to the content directory.
        """
        safe_name = Path(filename or "document").name or "document"

        # Ensure .md extension
        if not safe_name.endswith(".md"):
            safe_name = f"{safe_name}.md"

        file_path = resolve_content_markdown_path(
            self.project_root,
            f"content/{safe_name}",
        )
        file_path.parent.mkdir(parents=True, exist_ok=True)
        
        async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
            await f.write(content)
        
        return str(file_path)
    
    async def list_owned_docs(
        self,
        user_email: str,
        query: Optional[str] = None,
        page_size: int = 50,
        page_token: Optional[str] = None,
    ):
        """
        List only docs owned by the user.
        
        Args:
            user_email: User's email address
            query: Optional search query
            page_size: Number of results per page
            page_token: Pagination token
        
        Returns:
            Dictionary with files list and next_page_token
        """
        service = self._get_drive_service()
        
        # Build query to filter by owner
        query_parts = [
            f"'{escape_drive_query_literal(user_email)}' in owners",
            "mimeType='application/vnd.google-apps.document'",
            "trashed=false"
        ]
        
        if query:
            query_parts.append(f"name contains '{escape_drive_query_literal(query)}'")
        
        q_str = " and ".join(query_parts)
        
        try:
            results = service.files().list(
                q=q_str,
                pageSize=page_size,
                pageToken=page_token,
                fields="nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink, owners, thumbnailLink)",
                orderBy="modifiedTime desc",
            ).execute()
            
            return {
                "files": results.get("files", []),
                "next_page_token": results.get("nextPageToken"),
            }
        except HttpError as e:
            logger.error(f"Failed to list owned documents: {e}")
            raise RuntimeError(f"Failed to list owned documents: {e}")
