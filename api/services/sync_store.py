"""
Sync state storage service.
"""
import json
from pathlib import Path
from typing import Optional

from api.models.sync_state import SyncState, ChapterSyncState


class SyncStore:
    """Service for managing sync state persistence."""
    
    def __init__(self):
        self.project_root = Path(__file__).parent.parent.parent
        self.sync_state_file = self.project_root / ".sync_state.json"
    
    async def load(self) -> SyncState:
        """
        Load sync state from file.
        
        Returns:
            SyncState object (empty if file doesn't exist)
        """
        if not self.sync_state_file.exists():
            return SyncState()
        
        try:
            with open(self.sync_state_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return SyncState(**data)
        except Exception as e:
            # If file is corrupted, return empty state
            print(f"Failed to load sync state: {e}")
            return SyncState()
    
    async def save(self, state: SyncState):
        """
        Save sync state to file.
        
        Args:
            state: SyncState object to save
        """
        try:
            with open(self.sync_state_file, "w", encoding="utf-8") as f:
                json.dump(state.model_dump(mode='json'), f, indent=2, ensure_ascii=False)
        except Exception as e:
            raise RuntimeError(f"Failed to save sync state: {e}")
    
    async def get_chapter_state(self, chapter_id: str) -> Optional[ChapterSyncState]:
        """
        Get sync state for a specific chapter.
        
        Args:
            chapter_id: Chapter identifier (e.g., "01_ch01.md")
        
        Returns:
            ChapterSyncState or None if not found
        """
        state = await self.load()
        return state.get_chapter_state(chapter_id)
    
    async def update_chapter(self, chapter_id: str, **kwargs):
        """
        Update specific fields of a chapter's sync state.
        
        Args:
            chapter_id: Chapter identifier
            **kwargs: Fields to update
        """
        state = await self.load()
        state.update_chapter(chapter_id, **kwargs)
        await self.save(state)
    
    async def set_chapter_state(self, chapter_id: str, chapter_state: ChapterSyncState):
        """
        Set the entire sync state for a chapter.
        
        Args:
            chapter_id: Chapter identifier
            chapter_state: Complete ChapterSyncState object
        """
        state = await self.load()
        state.set_chapter_state(chapter_id, chapter_state)
        await self.save(state)
    
    async def delete_chapter(self, chapter_id: str):
        """
        Remove a chapter from sync state.
        
        Args:
            chapter_id: Chapter identifier
        """
        state = await self.load()
        if chapter_id in state.chapters:
            del state.chapters[chapter_id]
            state.lastUpdated = None
            await self.save(state)
