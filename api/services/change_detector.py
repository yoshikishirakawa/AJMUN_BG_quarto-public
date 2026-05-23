"""
Change detection service for Google Docs synchronization.
"""
import hashlib
from pathlib import Path
from typing import Optional, Tuple

from api.models.sync_state import ChapterSyncState, SyncStatus
from api.services.sync_store import SyncStore


class ChangeDetector:
    """Service for detecting changes between Google Docs and local files."""
    
    def __init__(self):
        self.project_root = Path(__file__).parent.parent.parent
        self.content_dir = self.project_root / "content"
        self.sync_store = SyncStore()
    
    async def compute_local_hash(self, chapter_id: str) -> Optional[str]:
        """
        Compute SHA256 hash of a local chapter file.
        
        Args:
            chapter_id: Chapter identifier (e.g., "01_ch01.md")
        
        Returns:
            SHA256 hash string or None if file doesn't exist
        """
        file_path = self.content_dir / chapter_id
        
        if not file_path.exists():
            return None
        
        try:
            with open(file_path, "rb") as f:
                content = f.read()
                return f"sha256:{hashlib.sha256(content).hexdigest()}"
        except Exception as e:
            print(f"Failed to compute hash for {chapter_id}: {e}")
            return None
    
    async def detect_changes(
        self,
        chapter_id: str,
        current_google_revision_id: Optional[str] = None
    ) -> Tuple[SyncStatus, bool, bool]:
        """
        Detect changes for a chapter by comparing Google Docs revision and local hash.
        
        Args:
            chapter_id: Chapter identifier
            current_google_revision_id: Current revision ID from Google Docs
        
        Returns:
            Tuple of (sync_status, google_changed, local_changed)
        """
        # Load current sync state
        chapter_state = await self.sync_store.get_chapter_state(chapter_id)
        
        if not chapter_state or chapter_state.syncStatus == SyncStatus.unlinked:
            # Chapter not linked
            return SyncStatus.unlinked, False, False
        
        # Check if Google Docs changed
        google_changed = False
        if current_google_revision_id:
            google_changed = (
                chapter_state.googleRevisionId != current_google_revision_id
            )
        else:
            # No current revision ID provided, assume no change
            google_changed = False
        
        # Check if local file changed
        local_changed = False
        current_local_hash = await self.compute_local_hash(chapter_id)
        
        if current_local_hash:
            local_changed = (
                chapter_state.localContentHash != current_local_hash
            )
        else:
            # Local file doesn't exist, consider it as changed
            local_changed = True
        
        # Determine sync status
        if google_changed and local_changed:
            sync_status = SyncStatus.conflict
        elif google_changed and not local_changed:
            sync_status = SyncStatus.google_modified
        elif not google_changed and local_changed:
            sync_status = SyncStatus.local_modified
        else:
            sync_status = SyncStatus.synced
        
        return sync_status, google_changed, local_changed
    
    async def update_hashes(
        self,
        chapter_id: str,
        google_revision_id: Optional[str] = None,
        force_local_hash: Optional[str] = None
    ):
        """
        Update the hash values in sync state after a sync operation.
        
        Args:
            chapter_id: Chapter identifier
            google_revision_id: Current Google Docs revision ID
            force_local_hash: Optional hash to use instead of computing
        """
        if not force_local_hash:
            force_local_hash = await self.compute_local_hash(chapter_id)
        
        updates = {}
        if google_revision_id:
            updates["googleRevisionId"] = google_revision_id
        if force_local_hash:
            updates["localContentHash"] = force_local_hash
        
        await self.sync_store.update_chapter(chapter_id, **updates)
