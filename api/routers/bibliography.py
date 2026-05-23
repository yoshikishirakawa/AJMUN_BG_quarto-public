from api.services.public_errors import public_http_error
import os
import yaml
import subprocess
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from api.dependencies.auth import require_editor_or_admin
from api.services.file_safety import FileSafetyError, resolve_project_relative_file

router = APIRouter(dependencies=[Depends(require_editor_or_admin)])

PROJECT_ROOT = Path(__file__).parent.parent.parent
META_BIB_DIR = PROJECT_ROOT / "meta" / "bib"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"


def resolve_bib_file(filename: str) -> Path:
    try:
        return resolve_project_relative_file(
            PROJECT_ROOT,
            f"meta/bib/{filename}",
            required_prefix="meta/bib",
            allowed_suffixes={".yml", ".yaml"},
            must_exist=False,
        )
    except FileSafetyError as exc:
        raise public_http_error(status_code=400, public_detail="Invalid request. Check server logs.", exc=exc, log_context="ValueError in bibliography_router")

class BibEntry(BaseModel):
    id: str
    type: str
    title: Optional[str] = None
    author: Optional[str] = None
    year: Optional[Any] = None
    # Add other common fields as optional to allow flexibility
    journal: Optional[str] = None
    publisher: Optional[str] = None
    url: Optional[str] = None
    note: Optional[str] = None
    
    class Config:
        extra = "allow" # Allow dynamic fields

class BibSection(BaseModel):
    references: List[Dict[str, Any]]

class BibFileContent(BaseModel):
    sections: List[BibSection]
    chapter_name: Optional[str] = None # For display

@router.get("/files")
async def list_bib_files():
    """List all bibliography YAML files."""
    if not META_BIB_DIR.exists():
        return []
    
    files = sorted(list(META_BIB_DIR.glob("*.yml")))
    return [{"name": f.name, "path": str(f)} for f in files]

@router.get("/{filename}")
async def get_bib_file(filename: str):
    """Get content of a specific bibliography YAML file."""
    file_path = resolve_bib_file(filename)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = yaml.safe_load(f)
        return content
    except Exception as e:
        raise public_http_error(status_code=500, public_detail="Failed to read file. Check server logs.", exc=e, log_context="Failed to read bib file")

@router.post("/{filename}")
async def update_bib_file(filename: str, content: Dict[str, Any], background_tasks: BackgroundTasks):
    """Update a bibliography YAML file and trigger merge."""
    file_path = resolve_bib_file(filename)
    
    try:
        # Validate that it acts like valid YAML data structure
        # (Using safe_dump to write back)
        with open(file_path, "w", encoding="utf-8") as f:
            yaml.safe_dump(content, f, allow_unicode=True, sort_keys=False)
        
        # Trigger background merge
        background_tasks.add_task(run_merge_script)
        
        return {"status": "success", "message": "File updated and merge triggered"}
    except Exception as e:
        raise public_http_error(status_code=500, public_detail="Failed to write file. Check server logs.", exc=e, log_context="Failed to write bib file")

def run_merge_script():
    """Run the merge_bib.py script."""
    script_path = SCRIPTS_DIR / "merge_bib.py"
    try:
        # We need to set SAVE_BIB_MERGE env var to actually save the file
        env = os.environ.copy()
        env["SAVE_BIB_MERGE"] = "true"
        
        result = subprocess.run(
            ["python3", str(script_path), str(META_BIB_DIR)],
            capture_output=True,
            text=True,
            env=env
        )
        if result.returncode != 0:
            print(f"Merge script failed: {result.stderr}")
        else:
            print(f"Merge script success: {result.stdout}")
    except Exception as e:
        print(f"Failed to run merge script: {str(e)}")

@router.get("/merged/content")
async def get_merged_bib():
    """Get the merged BibTeX content (for autocomplete)."""
    merged_path = META_BIB_DIR / "merged.bib"
    if not merged_path.exists():
         # If doesn't exist, try running merge first
        run_merge_script()
        
    if not merged_path.exists():
        return {"content": ""}

    try:
        with open(merged_path, "r", encoding="utf-8") as f:
            return {"content": f.read()}
    except Exception as e:
         raise public_http_error(status_code=500, public_detail="Failed to read merged file. Check server logs.", exc=e, log_context="Failed to read merged bib file")
