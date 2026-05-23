"""
Unit tests for Build Runner Service
"""
import pytest
import asyncio
import sys
import shutil
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime
from api.services.build_runner import BuildRunner


@pytest.fixture
def temp_project_dir(tmp_path):
    """Create a temporary project directory."""
    project_dir = tmp_path / "test_project"
    project_dir.mkdir()
    (project_dir / "out").mkdir()
    return project_dir


@pytest.fixture
def build_runner(temp_project_dir, monkeypatch):
    """Create a BuildRunner instance with a temporary project directory."""
    runner = BuildRunner()
    monkeypatch.setattr(runner, 'project_root', temp_project_dir)
    monkeypatch.setattr(runner, 'out_dir', temp_project_dir / "out")
    monkeypatch.setattr(runner, 'pdf_dir', temp_project_dir / "out" / "pdf")
    monkeypatch.setattr(runner, 'pdf_pc_dir', temp_project_dir / "out" / "pdf_pc")
    monkeypatch.setattr(runner, 'pdf_raksul_dir', temp_project_dir / "out" / "pdf_raksul")
    monkeypatch.setattr(runner, 'pdf_build_dir', temp_project_dir / "pdf_build")
    runner.pdf_dir.mkdir(parents=True, exist_ok=True)
    runner.pdf_pc_dir.mkdir(parents=True, exist_ok=True)
    runner.pdf_raksul_dir.mkdir(parents=True, exist_ok=True)
    runner.pdf_build_dir.mkdir(parents=True, exist_ok=True)

    # Mock the ProjectStore
    mock_store = AsyncMock()
    runner.project_store = mock_store

    return runner


@pytest.fixture
def sample_project_data():
    """Sample project data for testing."""
    return {
        "metadata": {"name": "Test Project"},
        "chapters": [
            {
                "id": "ch_001",
                "title": "Chapter 1",
                "localPath": "content/chapter1.qmd",
                "enabled": True
            },
            {
                "id": "ch_002",
                "title": "Chapter 2",
                "localPath": "content/chapter2.qmd",
                "enabled": True
            }
        ],
        "style": {},
        "buildOptions": {}
    }


@pytest.mark.asyncio
async def test_create_build(build_runner):
    """Test creating a new build job."""
    build_id = await build_runner.create_build(format="html")

    assert build_id in build_runner.build_logs
    assert build_id in build_runner.build_configs
    assert len(build_id) == 8  # UUID prefix
    assert build_runner.build_logs[build_id] == []
    assert build_runner.build_configs[build_id]["format"] == "html"


@pytest.mark.asyncio
async def test_create_build_with_clean(build_runner):
    """Test creating a build with clean option."""
    # Create some output files
    out_dir = build_runner.out_dir
    (out_dir / "test.html").write_text("test content")

    build_id = await build_runner.create_build(format="html", clean=True)

    # Check that outputs were cleaned
    assert not (out_dir / "test.html").exists()


@pytest.mark.asyncio
async def test_create_build_stores_config(build_runner):
    """Test that create_build stores configuration correctly."""
    build_id = await build_runner.create_build(
        format="pdf",
        chapters=["ch_001", "ch_002"],
        clean=False
    )

    config = build_runner.build_configs[build_id]
    assert config["format"] == "pdf"
    assert config["chapters"] == ["ch_001", "ch_002"]
    assert config["clean"] is False


@pytest.mark.asyncio
async def test_log(build_runner):
    """Test logging functionality."""
    build_id = await build_runner.create_build(format="html")

    build_runner._log(build_id, "Test log message")

    assert len(build_runner.build_logs[build_id]) == 1
    assert "Test log message" in build_runner.build_logs[build_id][0]
    assert "[" in build_runner.build_logs[build_id][0]  # Timestamp present


@pytest.mark.asyncio
async def test_stream_log(build_runner):
    """Test streaming build logs."""
    build_id = await build_runner.create_build(format="html")

    build_runner._log(build_id, "Message 1")
    build_runner._log(build_id, "Message 2")

    log_lines = []
    async for line in build_runner.stream_log(build_id):
        log_lines.append(line)

    assert len(log_lines) == 2
    assert "Message 1" in log_lines[0]
    assert "Message 2" in log_lines[1]


@pytest.mark.asyncio
async def test_cancel_build(build_runner):
    """Test canceling a build."""
    build_id = await build_runner.create_build(format="html")

    # Mock a process
    mock_process = AsyncMock()
    mock_process.returncode = None
    mock_process.wait = AsyncMock()
    build_runner.active_builds[build_id] = mock_process

    await build_runner.cancel(build_id)

    assert build_id not in build_runner.active_builds
    mock_process.terminate.assert_called_once()


@pytest.mark.asyncio
async def test_cancel_nonexistent_build(build_runner):
    """Test canceling a build that doesn't exist (should not crash)."""
    # Should not raise an error
    await build_runner.cancel("nonexistent_id")


@pytest.mark.asyncio
async def test_list_outputs_empty(build_runner):
    """Test listing outputs when none exist."""
    outputs = await build_runner.list_outputs()

    assert outputs == []


@pytest.mark.asyncio
async def test_list_outputs_with_files(build_runner):
    """Test listing output files."""
    out_dir = build_runner.out_dir

    # Create test output files
    (out_dir / "index.html").write_text("<html></html>")
    (out_dir / "test2.pdf").write_bytes(b"%PDF-1.4")
    content_dir = out_dir / "content"
    content_dir.mkdir(exist_ok=True)
    (content_dir / "chapter1.html").write_text("<html></html>")

    outputs = await build_runner.list_outputs()

    assert len(outputs) == 3

    output_paths = [o["path"] for o in outputs]
    assert "index.html" in output_paths
    assert any("test2.pdf" in p for p in output_paths)
    assert "content/chapter1.html" in output_paths

    # Check HTML type
    html_outputs = [o for o in outputs if o["type"] == "html"]
    assert len(html_outputs) == 2
    assert len([o for o in html_outputs if o.get("htmlType") == "landing"]) == 1
    assert len([o for o in html_outputs if o.get("htmlType") == "chapter"]) == 1

    # Check PDF type
    pdf_outputs = [o for o in outputs if o["type"] == "pdf"]
    assert len(pdf_outputs) == 1
    assert pdf_outputs[0]["pdfType"] == "root"


@pytest.mark.asyncio
async def test_list_outputs_includes_metadata(build_runner):
    """Test that output listing includes file metadata."""
    out_dir = build_runner.out_dir
    test_file = out_dir / "index.html"
    test_file.write_text("<html></html>")

    outputs = await build_runner.list_outputs()

    assert len(outputs) == 1
    assert outputs[0]["name"] == "index.html"
    assert outputs[0]["type"] == "html"
    assert outputs[0]["size"] > 0
    assert "modified" in outputs[0]
    assert "path" in outputs[0]
    assert outputs[0]["htmlType"] == "landing"


@pytest.mark.asyncio
async def test_list_outputs_includes_raksul_pdf(build_runner):
    """Test that Raksul output files are surfaced as PDF artifacts."""
    raksul_pdf = build_runner.pdf_raksul_dir / "body.pdf"
    raksul_pdf.write_bytes(b"%PDF-1.4")

    outputs = await build_runner.list_outputs()

    raksul_entries = [output for output in outputs if output.get("pdfType") == "raksul"]
    assert len(raksul_entries) == 1
    assert raksul_entries[0]["path"] == "pdf_raksul/body.pdf"
    assert raksul_entries[0]["label"] == "ラクスル入稿"


@pytest.mark.asyncio
async def test_clean_outputs(build_runner):
    """Test cleaning output directory."""
    out_dir = build_runner.out_dir

    # Create test files
    (out_dir / "test1.html").write_text("content")
    (out_dir / "test2.pdf").write_bytes(b"pdf content")
    (build_runner.pdf_raksul_dir / "body.pdf").write_bytes(b"pdf content")

    await build_runner.clean_outputs()

    # Directory should still exist but be empty
    assert out_dir.exists()
    assert not (out_dir / "test1.html").exists()
    assert not (out_dir / "test2.pdf").exists()
    assert not (build_runner.pdf_raksul_dir / "body.pdf").exists()


@pytest.mark.asyncio
async def test_clean_outputs_when_dir_not_exists(build_runner):
    """Test cleaning when output directory doesn't exist."""
    # Remove output directory
    shutil.rmtree(build_runner.out_dir)

    # Should not raise an error
    await build_runner.clean_outputs()

    # Directory should be recreated
    assert build_runner.out_dir.exists()


def test_safe_delete_rejects_broad_system_dirs(build_runner, tmp_path):
    """Test deletion guard rejects broad system and project roots."""
    assert build_runner._is_safe_delete_dir(Path("/tmp")) is False
    assert build_runner._is_safe_delete_dir(Path("/tmp/..")) is False
    assert build_runner._is_safe_delete_dir(Path("/var")) is False
    assert build_runner._is_safe_delete_dir(Path.home()) is False
    assert build_runner._is_safe_delete_dir(build_runner.project_root) is False

    scoped_tmp = Path("/tmp/ajmun-bg-editor/texmf-var")
    assert build_runner._is_safe_delete_dir(scoped_tmp) is True
    assert build_runner._is_safe_delete_dir(build_runner.project_root / "out") is True


@pytest.mark.asyncio
async def test_clean_outputs_rejects_tmp_texmfvar(build_runner, monkeypatch):
    """Test clean refuses a misconfigured PDF_TEXMFVAR=/tmp target."""
    monkeypatch.setattr(build_runner, "pdf_texmfvar", Path("/tmp"))

    with pytest.raises(RuntimeError, match="Refusing to delete unsafe directory"):
        await build_runner.clean_outputs()


@pytest.mark.asyncio
async def test_run_command_timeout_terminates_process(build_runner, monkeypatch):
    """Test timed-out build commands terminate and clear active process state."""
    build_id = await build_runner.create_build(format="html")
    monkeypatch.setattr(build_runner, "_command_timeout_seconds", lambda: 0.01)

    mock_process = AsyncMock()
    mock_process.returncode = None
    mock_process.terminate = MagicMock()
    mock_process.kill = MagicMock()
    mock_process.wait = AsyncMock(return_value=0)
    mock_process.stdout = AsyncMock()

    async def slow_readline():
        await asyncio.sleep(1)
        return b""

    mock_process.stdout.readline = slow_readline

    with patch("asyncio.create_subprocess_exec", return_value=mock_process):
        with pytest.raises(RuntimeError, match="timed out"):
            await build_runner._run_command(build_id, ["quarto", "render"])

    mock_process.terminate.assert_called_once()
    assert build_id not in build_runner.active_builds


@pytest.mark.asyncio
async def test_run_build_success_mock(build_runner, sample_project_data):
    """Test running a build with mocked subprocess."""
    build_id = await build_runner.create_build(format="html")

    # Mock project store
    build_runner.project_store.load = AsyncMock(return_value=sample_project_data)
    build_runner.project_store.save = AsyncMock()
    build_runner.project_store.update_build_status = AsyncMock()

    # Mock subprocess
    status_updates = []

    def status_callback(update):
        status_updates.append(update)

    # Mock the create_subprocess_exec to return a successful process
    mock_process = AsyncMock()
    mock_process.wait = AsyncMock(return_value=0)
    mock_process.returncode = 0
    mock_process.stdout = AsyncMock()

    # Mock readline to return empty (simulating immediate completion)
    async def mock_readline():
        return b""

    mock_process.stdout.readline = mock_readline

    with patch("asyncio.create_subprocess_exec", return_value=mock_process):
        with patch("api.services.build_runner.ActivityLogService") as MockActivityLog:
            mock_activity = AsyncMock()
            MockActivityLog.return_value = mock_activity

            await build_runner.run_build(build_id, status_callback)

    # Verify status updates
    assert len(status_updates) > 0
    final_status = status_updates[-1]
    assert final_status["status"] == "completed"
    assert final_status["progress"] == 1.0

    # Verify build status was updated
    build_runner.project_store.update_build_status.assert_called_with("success")

    # Verify activity was logged
    mock_activity.log.assert_called()


@pytest.mark.asyncio
async def test_run_build_with_chapters(build_runner, sample_project_data):
    """Test running a build with specific chapters."""
    build_id = await build_runner.create_build(
        format="html",
        chapters=["ch_001"]
    )

    build_runner.project_store.load = AsyncMock(return_value=sample_project_data)
    build_runner.project_store.save = AsyncMock()

    status_updates = []

    def status_callback(update):
        status_updates.append(update)

    mock_process = AsyncMock()
    mock_process.wait = AsyncMock(return_value=0)
    mock_process.returncode = 0
    mock_process.stdout = AsyncMock()

    async def mock_readline():
        return b""

    mock_process.stdout.readline = mock_readline

    with patch("asyncio.create_subprocess_exec") as mock_exec:
        mock_exec.return_value = mock_process

        with patch("api.services.build_runner.ActivityLogService") as MockActivityLog:
            MockActivityLog.return_value = AsyncMock()
            await build_runner.run_build(build_id, status_callback)

    # Verify that the command included the specific chapter path
    call_args = mock_exec.call_args
    cmd = list(call_args[0])

    assert "content/chapter1.qmd" in cmd


@pytest.mark.asyncio
async def test_stream_log_for_nonexistent_build(build_runner):
    """Test streaming logs for a nonexistent build."""
    log_lines = []
    async for line in build_runner.stream_log("nonexistent"):
        log_lines.append(line)

    assert log_lines == []


@pytest.mark.asyncio
async def test_build_config_cleanup_after_run(build_runner, sample_project_data):
    """Test that build config is cleaned up after build completion."""
    build_id = await build_runner.create_build(format="html")

    build_runner.project_store.load = AsyncMock(return_value=sample_project_data)
    build_runner.project_store.save = AsyncMock()

    mock_process = AsyncMock()
    mock_process.wait = AsyncMock(return_value=0)
    mock_process.returncode = 0
    mock_process.stdout = AsyncMock()

    async def mock_readline():
        return b""

    mock_process.stdout.readline = mock_readline

    with patch("asyncio.create_subprocess_exec", return_value=mock_process):
        with patch("api.services.build_runner.ActivityLogService") as MockActivityLog:
            MockActivityLog.return_value = AsyncMock()
            await build_runner.run_build(build_id, lambda x: None)

    # Config should be cleaned up
    assert build_id not in build_runner.build_configs


@pytest.mark.asyncio
async def test_pdf_build_uses_runner_python(build_runner, tmp_path):
    """PDF build should use the runner interpreter instead of a bare python3 lookup."""
    build_id = await build_runner.create_build(format="pdf")
    build_runner.pdf_dir = tmp_path / "out" / "pdf"
    build_runner.pdf_pc_dir = tmp_path / "out" / "pdf_pc"
    build_runner.pdf_raksul_dir = tmp_path / "out" / "pdf_raksul"
    build_runner.pdf_dir.mkdir(parents=True, exist_ok=True)
    build_runner.pdf_pc_dir.mkdir(parents=True, exist_ok=True)
    build_runner.pdf_raksul_dir.mkdir(parents=True, exist_ok=True)

    script_dir = build_runner.project_root / "scripts"
    script_dir.mkdir(parents=True, exist_ok=True)
    (script_dir / "build_pdf.py").write_text("print('ok')\n", encoding="utf-8")

    mock_process = AsyncMock()
    mock_process.wait = AsyncMock(return_value=0)
    mock_process.returncode = 0
    mock_process.stdout = AsyncMock()

    async def mock_readline():
        return b""

    mock_process.stdout.readline = mock_readline

    with patch("api.services.cover_service.cover_service.write_latex_config", return_value=Path("meta/latex/cover-config.tex")), \
         patch("api.services.fullpage_service.fullpage_service._generate_latex_config"), \
         patch("asyncio.create_subprocess_exec", return_value=mock_process) as mock_exec:
        await build_runner._run_pdf_build_via_script(build_id, lambda _: None)


@pytest.mark.asyncio
async def test_post_render_scripts_fail_on_nonzero_exit(build_runner, tmp_path):
    """Post-render helper failures should abort the build instead of being treated as success."""
    script_dir = build_runner.project_root / "scripts"
    script_dir.mkdir(parents=True, exist_ok=True)
    (script_dir / "build_nav_data.py").write_text("print('nav')\n", encoding="utf-8")

    with patch.object(build_runner, "_run_command", AsyncMock(return_value=1)) as mock_run:
        with pytest.raises(RuntimeError, match="Navigation data failed with exit code 1"):
            await build_runner._run_post_render_parallel("build-1")

    mock_run.assert_awaited_once()


@pytest.mark.asyncio
async def test_post_render_scripts_succeed_on_zero_exit(build_runner, tmp_path):
    """Post-render helper success should still complete normally."""
    script_dir = build_runner.project_root / "scripts"
    script_dir.mkdir(parents=True, exist_ok=True)
    (script_dir / "build_nav_data.py").write_text("print('nav')\n", encoding="utf-8")

    with patch.object(build_runner, "_run_command", AsyncMock(return_value=0)) as mock_run:
        await build_runner._run_post_render_parallel("build-1")

    mock_run.assert_awaited_once()


@pytest.mark.asyncio
async def test_html_build_restores_pdf_backup_on_failure(build_runner):
    build_id = await build_runner.create_build(format="html")
    original_pdf = build_runner.pdf_dir / "book.pdf"
    original_pdf.write_bytes(b"original-pdf")

    async def failing_run_command(_build_id, _cmd):
        original_pdf.unlink()
        return 1

    with patch.object(build_runner, "_run_command", AsyncMock(side_effect=failing_run_command)):
        with pytest.raises(RuntimeError, match="HTML build failed"):
            await build_runner._run_html_build_safe(build_id, lambda _: None)

    assert original_pdf.read_bytes() == b"original-pdf"
