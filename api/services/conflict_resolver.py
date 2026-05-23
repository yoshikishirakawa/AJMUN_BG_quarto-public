"""
Conflict resolution service for Google Docs synchronization.
"""
import logging
from datetime import datetime
from pathlib import Path

from api.models.sync_state import ConflictResolution, SyncStatus
from api.services.sync_store import SyncStore
from api.services.change_detector import ChangeDetector
from api.services.docs_fetcher import DocsFetcherService

logger = logging.getLogger(__name__)


class ConflictResolver:
    """Service for resolving sync conflicts."""
    
    def __init__(self):
        self.sync_store = SyncStore()
        self.change_detector = ChangeDetector()
        self.docs_fetcher = DocsFetcherService()
        self.project_root = Path(__file__).parent.parent.parent
    
    async def resolve(
        self,
        chapter_id: str,
        resolution: str,
        merge_strategy: dict = None
    ) -> dict:
        """
        Resolve a conflict for a chapter.
        
        Args:
            chapter_id: Chapter identifier
            resolution: Resolution type ("keep_google", "keep_local", "merge")
            merge_strategy: Optional merge strategy details
        
        Returns:
            Resolution result
        """
        # Get current state
        chapter_state = await self.sync_store.get_chapter_state(chapter_id)
        
        if not chapter_state:
            raise ValueError(f"Chapter {chapter_id} not found")
        
        if chapter_state.syncStatus != SyncStatus.conflict:
            raise ValueError(f"Chapter {chapter_id} is not in conflict state")
        
        # Resolve based on resolution type
        if resolution == "keep_google":
            result = await self._resolve_keep_google(chapter_id)
        elif resolution == "keep_local":
            result = await self._resolve_keep_local(chapter_id)
        elif resolution == "merge":
            result = await self._resolve_merge(chapter_id, merge_strategy)
        else:
            raise ValueError(f"Unknown resolution type: {resolution}")
        
        # Record resolution
        resolution_info = ConflictResolution(
            resolvedAt=datetime.utcnow(),
            resolution=resolution,
            conflictType="both_modified"
        )
        
        await self.sync_store.update_chapter(
            chapter_id,
            syncStatus=SyncStatus.synced,
            lastConflictResolution=resolution_info.model_dump(mode='json')
        )
        
        return result
    
    async def _resolve_keep_google(self, chapter_id: str) -> dict:
        """
        Keep Google Docs version and overwrite local.
        
        Args:
            chapter_id: Chapter identifier
        
        Returns:
            Resolution result
        """
        # Fetch Google Doc
        chapter_state = await self.sync_store.get_chapter_state(chapter_id)
        doc_json = await self.docs_fetcher.fetch_doc_json(chapter_state.googleDocId)
        current_revision_id = doc_json.get("revisionId")
        
        # Convert to markdown
        result = await self.docs_fetcher.fetch_and_convert(chapter_state.googleDocId)
        
        # Save to local file
        await self.docs_fetcher.save_markdown(result["content"], chapter_id)
        
        # Update hashes
        await self.change_detector.update_hashes(
            chapter_id,
            google_revision_id=current_revision_id
        )
        
        return {
            "action": "kept_google",
            "lines_overwritten": result.get("content", "").count("\n"),
            "google_doc_id": chapter_state.googleDocId
        }
    
    async def _resolve_keep_local(self, chapter_id: str) -> dict:
        """
        Keep local version and mark as synced.
        
        Args:
            chapter_id: Chapter identifier
        
        Returns:
            Resolution result
        """
        # Get current Google Doc revision to update state
        chapter_state = await self.sync_store.get_chapter_state(chapter_id)
        doc_json = await self.docs_fetcher.fetch_doc_json(chapter_state.googleDocId)
        current_revision_id = doc_json.get("revisionId")
        
        # Compute local hash (unchanged)
        local_hash = await self.change_detector.compute_local_hash(chapter_id)
        
        # Update state to indicate we're accepting Google revision but keeping local content
        await self.sync_store.update_chapter(
            chapter_id,
            googleRevisionId=current_revision_id,
            localContentHash=local_hash
        )
        
        return {
            "action": "kept_local",
            "local_file": chapter_id,
            "google_doc_id": chapter_state.googleDocId
        }
    
    async def _resolve_merge(
        self,
        chapter_id: str,
        merge_strategy: dict = None
    ) -> dict:
        """
        Manual merge - requires user intervention.
        
        Args:
            chapter_id: Chapter identifier
            merge_strategy: Merge strategy details (e.g., which sections to keep)
        
        Returns:
            Resolution result with merge instructions
        """
        # For now, manual merge requires user to resolve in editor
        # We'll fetch both versions and provide them
        
        chapter_state = await self.sync_store.get_chapter_state(chapter_id)
        
        # Fetch Google version
        google_result = await self.docs_fetcher.fetch_and_convert(chapter_state.googleDocId)
        
        # Get local version
        content_dir = self.project_root / "content"
        local_path = content_dir / chapter_id
        
        local_content = ""
        if local_path.exists():
            with open(local_path, "r", encoding="utf-8") as f:
                local_content = f.read()
        
        return {
            "action": "manual_merge_required",
            "google_version": google_result["content"],
            "local_version": local_content,
            "merge_strategy": merge_strategy,
            "instruction": "Please merge the versions manually in the editor"
        }
    
    async def get_conflict_info(self, chapter_id: str) -> dict:
        """
        Get information about a conflict for UI display.
        
        Args:
            chapter_id: Chapter identifier
        
        Returns:
            Conflict information
        """
        chapter_state = await self.sync_store.get_chapter_state(chapter_id)
        
        if not chapter_state:
            raise ValueError(f"Chapter {chapter_id} not found")
        
        if chapter_state.syncStatus != SyncStatus.conflict:
            raise ValueError(f"Chapter {chapter_id} is not in conflict state")
        
        # Fetch Google version
        doc_json = await self.docs_fetcher.fetch_doc_json(chapter_state.googleDocId)
        google_result = await self.docs_fetcher.fetch_and_convert(chapter_state.googleDocId)
        
        # Get local version
        content_dir = self.project_root / "content"
        local_path = content_dir / chapter_id
        
        local_content = ""
        if local_path.exists():
            with open(local_path, "r", encoding="utf-8") as f:
                local_content = f.read()
        
        # Get local hash
        local_hash = await self.change_detector.compute_local_hash(chapter_id)
        
        return {
            "chapterId": chapter_id,
            "googleDocId": chapter_state.googleDocId,
            "googleDocTitle": chapter_state.googleDocTitle,
            "googleRevisionId": doc_json.get("revisionId"),
            "googleContent": google_result["content"],
            "localContent": local_content,
            "localHash": local_hash,
            "lastSyncedAt": chapter_state.lastSyncedAt.isoformat() if chapter_state.lastSyncedAt else None,
            "lastConflictResolution": chapter_state.lastConflictResolution
        }
