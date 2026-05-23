"""
Quarto Build Runner Service
Delegates to build_pdf.py for full PDF generation matching CLI output

Features:
- Parallel post-processing scripts
- Build cache for unchanged files
- Preserves PDF files during HTML build
- Parallel HTML processing where possible
"""
import asyncio
import uuid
import os
import sys
import shutil
import hashlib
import json
import time
import contextlib
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Callable, AsyncIterator, Dict
from concurrent.futures import ThreadPoolExecutor

from api.services.project_store import ProjectStore
from api.services.activity_log import ActivityLogService


class BuildCache:
    """Cache system for skipping unchanged files."""

    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.cache_file = cache_dir / ".build_cache.json"
        self.cache: Dict[str, Dict] = {}
        self._load_cache()

    def _load_cache(self):
        if self.cache_file.exists():
            try:
                self.cache = json.loads(self.cache_file.read_text())
            except (json.JSONDecodeError, IOError):
                self.cache = {}

    def _save_cache(self):
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.cache_file.write_text(json.dumps(self.cache, indent=2))

    def _get_file_hash(self, file_path: Path) -> str:
        if not file_path.exists():
            return ""
        content = file_path.read_bytes()
        return hashlib.sha256(content).hexdigest()

    def is_file_unchanged(self, file_path: Path) -> bool:
        current_hash = self._get_file_hash(file_path)
        last_hash = self.cache.get("files", {}).get(str(file_path), "")
        return current_hash == last_hash

    def mark_file_processed(self, file_path: Path):
        self.cache.setdefault("files", {})[str(file_path)] = self._get_file_hash(file_path)
        self._save_cache()

    def should_skip_render(self, source_file: Path, output_file: Path) -> bool:
        return output_file.exists() and self.is_file_unchanged(source_file)

    def invalidate_dependents(self, changed_file: Path):
        self.cache.get("files", {}).pop(str(changed_file), None)
        self._save_cache()


class BuildRunner:
    """Service for running Quarto builds with optimizations."""

    def __init__(self):
        self.project_root = Path(__file__).parent.parent.parent
        self.python_executable = sys.executable or "python3"
        self.out_dir = self.project_root / "out"
        self.pdf_dir = self.project_root / "out" / "pdf"
        self.pdf_pc_dir = self.project_root / "out" / "pdf_pc"
        self.pdf_raksul_dir = self.project_root / "out" / "pdf_raksul"
        self.pdf_build_dir = self.project_root / "pdf_build"
        texmfvar = Path(os.environ.get("PDF_TEXMFVAR", "/tmp/ajmun-bg-editor/texmf-var"))
        self.pdf_texmfvar = texmfvar if texmfvar.is_absolute() else self.project_root / texmfvar
        self.cache_dir = self.project_root / ".cache"
        self.cache = BuildCache(self.cache_dir)
        self.active_builds: Dict[str, asyncio.subprocess.Process] = {}
        self.build_logs: Dict[str, List[str]] = {}
        self.build_configs: Dict[str, dict] = {}
        self._build_lock = asyncio.Lock()
        self.project_store = ProjectStore()
        self.executor = ThreadPoolExecutor(max_workers=4)

    def _command_timeout_seconds(self) -> float:
        raw_timeout = os.environ.get("BUILD_COMMAND_TIMEOUT_SECONDS", "1800")
        try:
            timeout = float(raw_timeout)
        except ValueError:
            timeout = 1800.0
        return max(timeout, 1.0)

    def is_build_running(self) -> bool:
        return self._build_lock.locked()

    async def create_build(
        self,
        format: str,
        chapters: Optional[List[str]] = None,
        clean: bool = False,
    ) -> str:
        build_id = str(uuid.uuid4())[:8]
        self.build_logs[build_id] = []

        self.build_configs[build_id] = {
            "format": format,
            "chapters": chapters,
            "clean": clean
        }

        if clean:
            await self.clean_outputs()
            # Clear cache on clean build
            self.cache.cache = {}
            self.cache._save_cache()

        return build_id

    def resolve_target_chapter_paths(self, project: dict, target_chapters: List[str]) -> List[str]:
        chapter_lookup: Dict[str, dict] = {}
        for chapter in project.get("chapters", []):
            chapter_id = str(chapter.get("id", "")).strip()
            if chapter_id:
                chapter_lookup[chapter_id] = chapter

        normalized_targets = [str(chapter_id).strip() for chapter_id in target_chapters if str(chapter_id).strip()]
        missing_chapters: List[str] = []
        disabled_chapters: List[str] = []
        paths_to_build: List[str] = []

        for chapter_id in normalized_targets:
            chapter = chapter_lookup.get(chapter_id)
            if not chapter:
                missing_chapters.append(chapter_id)
                continue

            if not chapter.get("enabled", True):
                disabled_chapters.append(chapter_id)
                continue

            local_path = str(chapter.get("localPath", "")).strip()
            if not local_path:
                raise ValueError(f"Chapter '{chapter_id}' is missing a localPath")

            paths_to_build.append(local_path)

        if missing_chapters:
            raise ValueError(f"Unknown chapter ids: {', '.join(missing_chapters)}")

        if disabled_chapters:
            raise ValueError(f"Disabled chapters cannot be built: {', '.join(disabled_chapters)}")

        if not paths_to_build:
            raise ValueError("No renderable chapters selected")

        return paths_to_build

    async def run_build(
        self,
        build_id: str,
        status_callback: Callable[[dict], None],
    ):
        if self._build_lock.locked():
            message = "Build already running"
            status_callback({"status": "failed", "progress": 1.0, "error": message})
            self._log(build_id, message)
            if build_id in self.build_configs:
                del self.build_configs[build_id]
            return

        async with self._build_lock:
            await self._run_build_locked(build_id, status_callback)

    async def _run_build_locked(
        self,
        build_id: str,
        status_callback: Callable[[dict], None],
    ):
        config = self.build_configs.get(build_id, {})
        target_chapters = config.get("chapters")
        target_format = config.get("format") or "all"

        start_time = time.time()

        try:
            status_callback({"status": "running", "progress": 0.05, "current_step": "Syncing project configuration..."})
            self._log(build_id, "Syncing project configuration...")
            project = await self.project_store.load()
            await self.project_store.save(project)

            # Partial build
            if target_chapters and len(target_chapters) > 0:
                self._log(build_id, f"Partial build requested: {target_chapters}")
                await self._run_simple_build(build_id, target_format, target_chapters, project, status_callback)
                return

            # Full build with parallelization
            build_pdf = target_format in ["pdf", "all"]
            build_html = target_format in ["html", "all"]

            if build_pdf:
                await self._run_pdf_build_via_script(build_id, status_callback)

            if build_html:
                # Preserve PDF files during HTML build
                await self._run_html_build_safe(build_id, status_callback)

            elapsed = time.time() - start_time
            self._log(build_id, f"Build completed in {elapsed:.1f}s")

            status_callback({
                "status": "completed",
                "progress": 1.0,
                "current_step": "Build complete!",
            })
            await self.project_store.update_build_status("success")
            await ActivityLogService().log("build", "Build completed successfully")

        except Exception as e:
            status_callback({
                "status": "failed",
                "progress": 1.0,
                "error": str(e),
            })
            self._log(build_id, f"Build error: {e}")
            import traceback
            traceback.print_exc()
            await self.project_store.update_build_status("failure")
            await ActivityLogService().log("build", f"Build failed: {e}")

        finally:
            if build_id in self.active_builds:
                del self.active_builds[build_id]
            if build_id in self.build_configs:
                del self.build_configs[build_id]

    async def _run_simple_build(
        self,
        build_id: str,
        target_format: str,
        target_chapters: List[str],
        project: dict,
        status_callback: Callable[[dict], None],
    ):
        status_callback({"progress": 0.1, "current_step": "Starting partial build..."})

        cmd = ["quarto", "render"]
        paths_to_build = self.resolve_target_chapter_paths(project, target_chapters)
        cmd.extend(paths_to_build)

        if target_format in ["html", "pdf"]:
            cmd.extend(["--to", target_format])

        self._log(build_id, f"Executing: {' '.join(cmd)}")
        rc = await self._run_command(build_id, cmd)
        if rc != 0:
            raise RuntimeError(f"Build command failed (exit code {rc}): {' '.join(cmd)}")

        if target_format in ["html", "all"]:
            await self._run_post_render_parallel(build_id)

        status_callback({"progress": 1.0, "current_step": "Partial build complete!"})

    async def _run_pdf_build_via_script(
        self,
        build_id: str,
        status_callback: Callable[[dict], None],
    ):
        status_callback({"progress": 0.05, "current_step": "Generating cover configuration..."})
        self._log(build_id, "=== Generating Cover Configuration ===")

        # 表紙設定をLaTeXテンプレートに反映（既存カバー設定）
        try:
            from api.services.cover_service import cover_service
            config_path = cover_service.write_latex_config()
            self._log(build_id, f"Cover config written to: {config_path}")
        except Exception as e:
            self._log(build_id, f"Warning: Failed to generate cover config: {e}")

        # フルページ画像設定をLaTeXテンプレートに反映（新機能）
        status_callback({"progress": 0.06, "current_step": "Generating fullpage image configuration..."})
        self._log(build_id, "=== Generating FullPage Image Configuration ===")
        try:
            from api.services.fullpage_service import fullpage_service
            fullpage_service._generate_latex_config()
            self._log(build_id, f"FullPage config written to: {fullpage_service.latex_config_path}")
        except Exception as e:
            self._log(build_id, f"Warning: Failed to generate fullpage config: {e}")

        status_callback({"progress": 0.1, "current_step": "Starting PDF build..."})
        self._log(build_id, "=== Running PDF Build via CLI Script ===")

        build_script = self.project_root / "scripts" / "build_pdf.py"

        if not build_script.exists():
            raise FileNotFoundError(f"Build script not found: {build_script}")

        self._log(build_id, f"Calling: {build_script}")
        self._log(build_id, f"Using Python: {self.python_executable}")

        env = os.environ.copy()
        env.setdefault("QUARTO_TLMGR_DISABLE_UPDATE", "1")

        progress_map = {
            "Pass 1": 0.2,
            "PDF用索引": 0.4,
            "Pass 1.5": 0.5,
            "Rail Data": 0.6,
            "Pass 2": 0.7,
            "印刷版PDF": 0.8,
            "PC版": 0.9,
            "ラクスル本文": 0.92,
            "ラクスル表紙": 0.95,
            "ラクスル入稿": 0.98,
        }

        def handle_progress(decoded: str) -> None:
            for keyword, progress in progress_map.items():
                if keyword in decoded:
                    status_callback({"progress": progress, "current_step": decoded})
                    break

        rc = await self._run_command(
            build_id,
            [self.python_executable, str(build_script)],
            env=env,
            output_callback=handle_progress,
        )
        if rc != 0:
            raise RuntimeError(f"PDF build failed with exit code {rc}")

        # Mark PDF files as processed in cache
        for pdf_file in self.pdf_dir.glob("*.pdf"):
            self.cache.mark_file_processed(pdf_file)
        for pdf_file in self.pdf_pc_dir.glob("*.pdf"):
            self.cache.mark_file_processed(pdf_file)
        for pdf_file in self.pdf_raksul_dir.glob("*.pdf"):
            self.cache.mark_file_processed(pdf_file)

        self._log(build_id, "PDF build completed successfully")
        status_callback({"progress": 0.85, "current_step": "PDF build complete"})

    async def _run_html_build_safe(
        self,
        build_id: str,
        status_callback: Callable[[dict], None],
    ):
        """Run HTML build while preserving PDF files."""
        status_callback({"progress": 0.85, "current_step": "Building HTML..."})
        self._log(build_id, "=== HTML Build ===")

        # Save PDF files temporarily
        pdf_backup_dir = self.cache_dir / "pdf_backup"
        pdf_backup_dir.mkdir(parents=True, exist_ok=True)

        # Back up PDF files
        backup_targets = {
            self.pdf_dir: pdf_backup_dir / "pdf",
            self.pdf_pc_dir: pdf_backup_dir / "pdf_pc",
            self.pdf_raksul_dir: pdf_backup_dir / "pdf_raksul",
        }
        for target_dir in backup_targets.values():
            target_dir.mkdir(parents=True, exist_ok=True)

        for source_pdf_dir, backup_target_dir in backup_targets.items():
            if source_pdf_dir.exists():
                for pdf_file in source_pdf_dir.glob("*.pdf"):
                    backup_path = backup_target_dir / pdf_file.name
                    shutil.copy2(pdf_file, backup_path)
                    self._log(build_id, f"Backed up: {source_pdf_dir.name}/{pdf_file.name}")

        try:
            # Run HTML build
            cmd = ["quarto", "render", "--to", "html"]
            rc = await self._run_command(build_id, cmd)
            if rc != 0:
                raise RuntimeError(f"HTML build failed (exit code {rc})")
        finally:
            # Restore PDF files even if the HTML build fails.
            for dest_pdf_dir, backup_source_dir in [
                (self.pdf_dir, pdf_backup_dir / "pdf"),
                (self.pdf_pc_dir, pdf_backup_dir / "pdf_pc"),
                (self.pdf_raksul_dir, pdf_backup_dir / "pdf_raksul"),
            ]:
                if not backup_source_dir.exists():
                    continue
                dest_pdf_dir.mkdir(parents=True, exist_ok=True)
                for pdf_file in backup_source_dir.glob("*.pdf"):
                    dest_path = dest_pdf_dir / pdf_file.name
                    shutil.copy2(pdf_file, dest_path)
                    self._log(build_id, f"Restored: {dest_pdf_dir.name}/{pdf_file.name}")

        # Run post-render scripts in parallel
        status_callback({"progress": 0.95, "current_step": "Running post-render scripts..."})
        await self._run_post_render_parallel(build_id)

    async def _run_post_render_parallel(self, build_id: str):
        """Run post-render scripts in parallel for improved performance."""
        scripts = [
            ("scripts/build_nav_data.py", "Navigation data"),
            ("scripts/build_index_data.py", "Index data"),
        ]

        async def run_script(script_path: Path, name: str):
            if script_path.exists():
                self._log(build_id, f"Running {name}...")
                start = time.time()
                rc = await self._run_command(build_id, [self.python_executable, str(script_path)])
                if rc != 0:
                    raise RuntimeError(f"{name} failed with exit code {rc}")
                elapsed = time.time() - start
                self._log(build_id, f"✓ {name} completed in {elapsed:.1f}s")

        # Run scripts concurrently
        tasks = []
        for script, name in scripts:
            script_path = self.project_root / script
            if script_path.exists():
                tasks.append(run_script(script_path, name))

        if tasks:
            await asyncio.gather(*tasks)

    async def _run_command(
        self,
        build_id: str,
        cmd: List[str],
        env: Optional[dict] = None,
        output_callback: Optional[Callable[[str], None]] = None,
    ) -> int:
        """Run a command and stream output."""
        self._log(build_id, f"Executing: {' '.join(cmd)}")

        process_env = dict(env) if env else None
        timeout = self._command_timeout_seconds()

        process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(self.project_root),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=process_env,
        )

        self.active_builds[build_id] = process
        started_at = time.monotonic()
        try:
            while True:
                remaining = timeout - (time.monotonic() - started_at)
                if remaining <= 0:
                    raise asyncio.TimeoutError
                line = await asyncio.wait_for(process.stdout.readline(), timeout=remaining)
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").strip()
                self._log(build_id, decoded)
                if output_callback:
                    output_callback(decoded)

            remaining = timeout - (time.monotonic() - started_at)
            if remaining <= 0:
                raise asyncio.TimeoutError
            await asyncio.wait_for(process.wait(), timeout=remaining)
            return process.returncode
        except asyncio.TimeoutError as exc:
            await self._terminate_process(process)
            self._log(build_id, f"Command timed out after {timeout:.0f}s: {' '.join(cmd)}")
            raise RuntimeError(f"Build command timed out after {timeout:.0f}s") from exc
        finally:
            if self.active_builds.get(build_id) is process:
                del self.active_builds[build_id]

    async def _terminate_process(self, process: asyncio.subprocess.Process) -> None:
        if process.returncode is not None:
            return
        with contextlib.suppress(ProcessLookupError):
            result = process.terminate()
            if asyncio.iscoroutine(result):
                await result
        try:
            await asyncio.wait_for(process.wait(), timeout=5)
            return
        except asyncio.TimeoutError:
            pass
        if process.returncode is None:
            with contextlib.suppress(ProcessLookupError):
                result = process.kill()
                if asyncio.iscoroutine(result):
                    await result
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(process.wait(), timeout=5)

    async def stream_log(self, build_id: str) -> AsyncIterator[str]:
        if build_id not in self.build_logs:
            return

        last_index = 0
        while True:
            if build_id not in self.build_logs:
                break

            logs = self.build_logs.get(build_id, [])

            while last_index < len(logs):
                yield logs[last_index]
                last_index += 1

            if build_id not in self.active_builds:
                logs = self.build_logs.get(build_id, [])
                while last_index < len(logs):
                    yield logs[last_index]
                    last_index += 1
                break

            await asyncio.sleep(0.5)

    def _log(self, build_id: str, message: str):
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_line = f"[{timestamp}] {message}"

        if build_id in self.build_logs:
            self.build_logs[build_id].append(log_line)

        print(log_line)

    async def cancel(self, build_id: str):
        if build_id in self.active_builds:
            process = self.active_builds[build_id]
            await self._terminate_process(process)

            if build_id in self.active_builds:
                del self.active_builds[build_id]
            self._log(build_id, "Build cancelled by user")

    async def list_outputs(self) -> List[dict]:
        outputs = []

        search_dirs = [
            (self.out_dir, "", None),
            (self.pdf_dir, "pdf/", "print"),
            (self.pdf_pc_dir, "pdf_pc/", "pc"),
            (self.pdf_raksul_dir, "pdf_raksul/", "raksul"),
        ]

        for base_dir, prefix, pdf_type in search_dirs:
            if not base_dir.exists():
                continue

            for ext, type_name in [("html", "html"), ("pdf", "pdf")]:
                for file_path in base_dir.glob(f"*.{ext}"):
                    if file_path.name.startswith("."):
                        continue
                    
                    output_entry = {
                        "type": type_name,
                        "path": str(prefix + file_path.name),
                        "name": file_path.name,
                        "size": file_path.stat().st_size,
                        "modified": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                    }
                    
                    if type_name == "html":
                        if prefix == "" and file_path.name == "index.html":
                            output_entry["htmlType"] = "landing"
                            output_entry["label"] = "Landing HTML"
                        else:
                            output_entry["htmlType"] = "other"
                            output_entry["label"] = "HTML"
                    elif type_name == "pdf":
                        output_entry["pdfType"] = pdf_type or "root"
                        if output_entry["pdfType"] == "root":
                            output_entry["label"] = "標準PDF"
                        elif output_entry["pdfType"] == "print":
                            output_entry["label"] = "印刷版"
                        elif output_entry["pdfType"] == "pc":
                            output_entry["label"] = "PC版"
                        elif output_entry["pdfType"] == "raksul":
                            output_entry["label"] = "ラクスル入稿"
                    
                    outputs.append(output_entry)

        content_dir = self.out_dir / "content"
        if content_dir.exists():
            for file_path in content_dir.glob("*.html"):
                if file_path.name.startswith("."):
                    continue

                rel_path = file_path.relative_to(self.out_dir)
                outputs.append({
                    "type": "html",
                    "path": rel_path.as_posix(),
                    "name": file_path.name,
                    "size": file_path.stat().st_size,
                    "modified": datetime.fromtimestamp(file_path.stat().st_mtime).isoformat(),
                    "htmlType": "chapter",
                    "label": "章HTML",
                })

        return outputs

    def get_output_dir(self) -> Path:
        return self.out_dir

    def _is_safe_delete_dir(self, path: Path) -> bool:
        resolved = path.resolve()
        project_root = self.project_root.resolve()

        forbidden = {
            Path("/").resolve(),
            project_root,
            Path.home().resolve(),
            Path("/home").resolve(),
            Path("/Users").resolve(),
            Path("/var").resolve(),
            Path("/tmp").resolve(),
        }
        if resolved in forbidden:
            return False

        try:
            resolved.relative_to(project_root)
            return True
        except ValueError:
            pass

        allowed_tmp_root = Path("/tmp/ajmun-bg-editor").resolve()
        try:
            resolved.relative_to(allowed_tmp_root)
            return True
        except ValueError:
            return False

    async def clean_outputs(self):
        for dir_path in [self.out_dir, self.pdf_dir, self.pdf_pc_dir, self.pdf_raksul_dir]:
            if dir_path.exists():
                if not self._is_safe_delete_dir(dir_path):
                    raise RuntimeError(f"Refusing to delete unsafe directory: {dir_path}")
                shutil.rmtree(dir_path)

        for dir_path in [self.pdf_build_dir / "out", self.pdf_build_dir / "out_pc", self.pdf_build_dir / "out_raksul", self.pdf_texmfvar]:
            if dir_path.exists():
                if not self._is_safe_delete_dir(dir_path):
                    raise RuntimeError(f"Refusing to delete unsafe directory: {dir_path}")
                shutil.rmtree(dir_path)

        for pattern in [
            "*.aux",
            "*.toc",
            "*.idx",
            "*.ind",
            "*.ilg",
            "*.tex",
            "*.raildata",
            "*.boundaries",
            "*-rail-computed.tex",
        ]:
            for file_path in self.pdf_build_dir.glob(pattern):
                if file_path.is_file():
                    file_path.unlink()

        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.pdf_dir.mkdir(parents=True, exist_ok=True)
        self.pdf_pc_dir.mkdir(parents=True, exist_ok=True)
        self.pdf_raksul_dir.mkdir(parents=True, exist_ok=True)
