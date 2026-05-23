
"""
Activity Log Service
"""
import json
import aiofiles
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any

class ActivityLogService:
    def __init__(self):
        self.project_root = Path(__file__).parent.parent.parent
        self.log_path = self.project_root / ".bgactivity.json"

    async def log(self, type: str, message: str):
        """
        Log an activity.
        type: 'edit', 'sync', 'build', 'system'
        """
        entry = {
            "id": datetime.utcnow().timestamp(),
            "type": type,
            "msg": message,
            "time": datetime.utcnow().isoformat() + "Z"
        }
        
        logs = await self._load()
        logs.insert(0, entry) # Prepend
        
        # Keep last 50
        logs = logs[:50]
        
        await self._save(logs)

    async def get_recent(self) -> List[Dict[str, Any]]:
        """Get recent logs."""
        return await self._load()

    async def _load(self) -> List[Dict[str, Any]]:
        if not self.log_path.exists():
            return []
        
        try:
            async with aiofiles.open(self.log_path, "r", encoding="utf-8") as f:
                content = await f.read()
                if not content:
                    return []
                return json.loads(content)
        except:
            return []

    async def _save(self, logs: List[Dict[str, Any]]):
        async with aiofiles.open(self.log_path, "w", encoding="utf-8") as f:
            await f.write(json.dumps(logs, indent=2, ensure_ascii=False))
