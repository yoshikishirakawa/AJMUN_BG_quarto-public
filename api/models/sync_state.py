"""
Sync state models for Google Docs synchronization.
"""
from datetime import datetime
from typing import Dict, Optional, Any
from pydantic import BaseModel, Field
from enum import Enum


class SyncDirection(str, Enum):
    """Synchronization direction."""
    google_to_local = "google_to_local"
    local_to_google = "local_to_google"
    bidirectional = "bidirectional"


class SyncStatus(str, Enum):
    """Synchronization status."""
    synced = "synced"
    google_modified = "google_modified"
    local_modified = "local_modified"
    conflict = "conflict"
    unlinked = "unlinked"
    error = "error"


class ConflictResolution(BaseModel):
    """Conflict resolution information."""
    resolvedAt: datetime
    resolution: str  # "keep_google", "keep_local", "merge"
    conflictType: str  # "both_modified"


class ChapterSyncState(BaseModel):
    """Synchronization state for a single chapter."""
    googleDocId: Optional[str] = None
    googleDocTitle: Optional[str] = None
    lastSyncedAt: Optional[datetime] = None
    googleRevisionId: Optional[str] = None
    localContentHash: Optional[str] = None
    syncDirection: SyncDirection = SyncDirection.google_to_local
    syncStatus: SyncStatus = SyncStatus.unlinked
    lastConflictResolution: Optional[ConflictResolution] = None


class SyncState(BaseModel):
    """Overall synchronization state for the project."""
    version: str = "1.0"
    lastUpdated: Optional[datetime] = None
    chapters: Dict[str, ChapterSyncState] = Field(default_factory=dict)
    
    def get_chapter_state(self, chapter_id: str) -> Optional[ChapterSyncState]:
        """Get sync state for a specific chapter."""
        return self.chapters.get(chapter_id)
    
    def set_chapter_state(self, chapter_id: str, state: ChapterSyncState):
        """Set sync state for a specific chapter."""
        self.chapters[chapter_id] = state
        self.lastUpdated = datetime.utcnow()
    
    def update_chapter(self, chapter_id: str, **kwargs):
        """Update specific fields of a chapter's sync state."""
        if chapter_id not in self.chapters:
            self.chapters[chapter_id] = ChapterSyncState()
        
        state = self.chapters[chapter_id]
        for key, value in kwargs.items():
            if hasattr(state, key):
                setattr(state, key, value)
        
        self.lastUpdated = datetime.utcnow()


class SyncResponse(BaseModel):
    """Response for sync operations."""
    status: str  # "pulled", "pushed", "skipped", "error"
    chapterId: str
    googleDocId: Optional[str] = None
    changes: Optional[Dict[str, Any]] = None
    syncedAt: datetime = Field(default_factory=datetime.utcnow)


class DocsListResponse(BaseModel):
    """Response for docs list."""
    files: list
    next_page_token: Optional[str] = None


class ConflictResolutionRequest(BaseModel):
    """Request for conflict resolution."""
    chapterId: str
    resolution: str  # "keep_google", "keep_local", "merge"
    mergeStrategy: Optional[Dict[str, Any]] = None


class LinkRequest(BaseModel):
    """Request for linking chapter to Google Doc."""
    chapterId: str
    googleDocId: str
    googleDocTitle: str
