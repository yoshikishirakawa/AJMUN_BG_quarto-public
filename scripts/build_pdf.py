#!/usr/bin/env python3
"""
PDF生成スクリプト
複数のPDF生成方式をサポート
- LuaLaTeX
- WeasyPrint (HTML→PDF)
- Chrome headless (HTML→PDF)
"""

import os
import sys
import subprocess
import time
import json
import signal
import shutil
import importlib.util
import re
from io import BytesIO
from pathlib import Path
from datetime import datetime
from dataclasses import dataclass
from typing import Optional, List, Dict, Any, Tuple

STANDARD_TOOL_PATHS = [
    "/Library/TeX/texbin",
    "/Applications/quarto/bin",
    "/usr/local/bin",
    "/opt/homebrew/bin",
]

# 設定
CONFIG = {
    'content_dir': Path('content'),
    'out_dir': Path('out'),
    'pdf_dir': Path('out/pdf'),
    'pdf_pc_dir': Path('out/pdf_pc'),
    'pdf_raksul_dir': Path('out/pdf_raksul'),
    'html_dir': Path('out/chapters'),
    'temp_dir': Path('temp'),
    'config_file': Path('config/settings.json'),
    'pdf_build_pc_output_dir': Path('pdf_build/out_pc'),
    'pdf_build_raksul_output_dir': Path('pdf_build/out_raksul'),
    'pdf_build_raksul_source_output_dir': Path('pdf_build/out_raksul_source'),
}
PDF_PROJECT_DIR = Path('pdf_build')
PDF_RENDER_TIMEOUT = int(os.environ.get("PDF_RENDER_TIMEOUT", "1800"))
PDF_TEXMFVAR = Path(os.environ.get("PDF_TEXMFVAR", "/tmp/texmf-var"))
EXACT_PAGE_IMAGE_TYPES = {'cover_front', 'cover_back', 'advertisement'}
PDF_VALIDATION_TOLERANCE = 1.0
PYTHON_EXECUTABLE = sys.executable or "python3"
FITZ_BOOTSTRAP_ENV = "BUILD_PDF_FITZ_BOOTSTRAPPED"
POINTS_PER_MM = 72.0 / 25.4
RAKSUL_PROFILE_NAME = "raksul"
RAKSUL_BODY_FILENAME = "body.pdf"
RAKSUL_COVER_OUTER_FILENAME = "cover_outer.pdf"
RAKSUL_COVER_INNER_FILENAME = "cover_inner.pdf"
RAKSUL_PREFLIGHT_FILENAME = "preflight-report.json"
RAIL_ACTIVE_COLOR = (44 / 255, 80 / 255, 112 / 255)
RAIL_INACTIVE_COLOR = (229 / 255, 229 / 255, 229 / 255)
RAIL_CURSOR_COLOR = (192 / 255, 64 / 255, 32 / 255)
RAIL_DIVIDER_COLOR = (1, 1, 1)
RAIL_TRIANGLE_COLOR = (0 / 255, 151 / 255, 167 / 255)
RAKSUL_PROFILE_PATH = PDF_PROJECT_DIR / "_quarto-raksul.yml"
RAKSUL_BODY_SOURCE_PROFILE_NAME = "raksul-body-source"
RAKSUL_BODY_SOURCE_PROFILE_PATH = PDF_PROJECT_DIR / "_quarto-raksul-body-source.yml"
RAKSUL_LATEX_CONFIG_PATH = Path("meta/latex/raksul-config.tex")
RAKSUL_COVER_OUTER_TEMPLATE = PDF_PROJECT_DIR / "templates" / "cover_outer.tex"
RAKSUL_COVER_INNER_TEMPLATE = PDF_PROJECT_DIR / "templates" / "cover_inner.tex"


def _load_initial_project_metadata() -> Dict[str, str]:
    defaults = {
        "title": "Background Guide",
        "conference_long_name": "Conference",
        "conference_short_name": "Conference",
        "conference_dates_en": "",
    }
    config_path = CONFIG["config_file"]
    if not config_path.exists():
        return defaults
    try:
        settings = json.loads(config_path.read_text(encoding="utf-8"))
    except Exception:
        return defaults

    project = settings.get("project", {}) if isinstance(settings, dict) else {}
    raksul = settings.get("raksul", {}) if isinstance(settings, dict) else {}
    conference = raksul.get("conference", {}) if isinstance(raksul, dict) else {}
    title = str(project.get("title") or defaults["title"])
    return {
        "title": title,
        "conference_long_name": str(conference.get("long_name") or defaults["conference_long_name"]),
        "conference_short_name": str(conference.get("short_name") or defaults["conference_short_name"]),
        "conference_dates_en": str(conference.get("dates_en") or defaults["conference_dates_en"]),
    }


PROJECT_METADATA = _load_initial_project_metadata()
PDF_BOOK_BASENAME = PROJECT_METADATA["title"]
PDF_BOOK_FILENAME = f"{PDF_BOOK_BASENAME}.pdf"
PUBLIC_BOOK_PDF_NAMES = (PDF_BOOK_FILENAME,)
FINAL_OUTPUT_CLEAN_PATTERNS = ("*.pdf", "preflight-report.json")

RAKSUL_DEFAULTS: Dict[str, Any] = {
    "binding": "left",
    "trim_width_mm": 182,
    "trim_height_mm": 257,
    "bleed_mm": 3,
    "safe_margin_mm": 3,
    "body_pages": 232,
    "source_body_pages": 230,
    "paper_width_mm": 188,
    "paper_height_mm": 263,
    "inner_margin_mm": 18,
    "outer_margin_mm": 15,
    "top_margin_mm": 18,
    "bottom_margin_mm": 18,
    "spine_width_mm": 13.0,
    "spine_width_source": "template",
    "body_stock": "マット紙 70kg",
    "cover_stock": "マット紙 180kg",
    "cover_finish": "片面マットPP",
    "conference": {
        "long_name": PROJECT_METADATA["conference_long_name"],
        "short_name": PROJECT_METADATA["conference_short_name"],
        "dates_en": PROJECT_METADATA["conference_dates_en"],
    },
    "body_insert_pages": {
        "enabled": True,
        "front": {
            "enabled": True,
            "title": PROJECT_METADATA["title"],
            "subtitle": "Background Guide",
            "conference_name": PROJECT_METADATA["conference_long_name"],
            "dates_en": PROJECT_METADATA["conference_dates_en"],
        },
        "back": {
            "enabled": True,
            "lines": [
                PROJECT_METADATA["title"],
                PROJECT_METADATA["conference_short_name"],
                PROJECT_METADATA["conference_dates_en"],
            ],
        },
    },
    "cover": {
        "inner_front_path": None,
        "inner_back_path": None,
        "inner_back_lines": [
            PROJECT_METADATA["title"],
            PROJECT_METADATA["conference_short_name"],
            PROJECT_METADATA["conference_dates_en"],
        ],
        "palette": {
            "navy": "#102B44",
        },
    },
}


@dataclass
class RenderedPdfResult:
    success: bool
    pdf_path: Optional[Path] = None
    tex_path: Optional[Path] = None
    aux_path: Optional[Path] = None


def ensure_tool_paths():
    """Prepend common Quarto/TeX install locations to PATH when available."""
    current = os.environ.get("PATH", "")
    parts = current.split(":") if current else []
    for path in reversed(STANDARD_TOOL_PATHS):
        if Path(path).exists() and path not in parts:
            parts.insert(0, path)
    os.environ["PATH"] = ":".join(parts)


ensure_tool_paths()


def _python_can_import_fitz(python_executable: str) -> bool:
    try:
        result = subprocess.run(
            [python_executable, "-c", "import fitz"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except Exception:
        return False
    return result.returncode == 0


def ensure_runtime_has_fitz():
    """Re-exec under a Python that has PyMuPDF available when possible."""
    try:
        import fitz  # noqa: F401
        return
    except Exception:
        pass

    if os.environ.get(FITZ_BOOTSTRAP_ENV) == "1":
        raise RuntimeError(
            f"PyMuPDF (fitz) is required for PDF export validation, but is unavailable in {PYTHON_EXECUTABLE}"
        )

    candidates = []
    for candidate in [
        PYTHON_EXECUTABLE,
        shutil.which("python3"),
        "/Library/Developer/CommandLineTools/usr/bin/python3",
        "/usr/bin/python3",
        "/usr/local/bin/python3",
        "/opt/homebrew/bin/python3",
    ]:
        if candidate and candidate not in candidates:
            candidates.append(candidate)

    for candidate in candidates:
        if not _python_can_import_fitz(candidate):
            continue
        candidate_path = Path(candidate).resolve()
        current_path = Path(PYTHON_EXECUTABLE).resolve()
        if candidate_path == current_path:
            break
        env = os.environ.copy()
        env[FITZ_BOOTSTRAP_ENV] = "1"
        print(f"⚠ fitz 未検出のため Python を切り替えます: {PYTHON_EXECUTABLE} -> {candidate}")
        os.execvpe(candidate, [candidate, *sys.argv], env)

    tried = ", ".join(candidates) if candidates else "(none)"
    raise RuntimeError(f"PyMuPDF (fitz) is required for PDF export validation, but no usable Python was found. Tried: {tried}")

# 対応するエンジンリスト
ENGINES = {
    'lualatex': {
        'name': 'LuaLaTeX',
        # Quartoを叩いてPDFを作るので、コマンド存在チェックはquarto単体で十分
        'command': 'quarto',
        'dependencies': ['quarto', 'lualatex'],
        'supported_formats': ['qmd', 'md'],
    },
    'weasyprint': {
        'name': 'WeasyPrint',
        'command': 'weasyprint',
        'dependencies': ['weasyprint', 'python3'],
        'supported_formats': ['html'],
    },
    'chrome': {
        'name': 'Chrome headless',
        'command': 'google-chrome',
        'dependencies': ['google-chrome', 'chromium'],
        'supported_formats': ['html'],
    },
    'wkhtmltopdf': {
        'name': 'wkhtmltopdf',
        'command': 'wkhtmltopdf',
        'dependencies': ['wkhtmltopdf'],
        'supported_formats': ['html'],
    },
}


def build_pdf_env(extra=None):
    """Return a stable environment for Quarto/LuaLaTeX PDF builds."""
    env = os.environ.copy()
    # Avoid tlmgr network updates during render (speed & offline safety)
    env.setdefault("QUARTO_TLMGR_DISABLE_UPDATE", "1")
    # Keep profile selection deterministic inside scripts.
    env.pop("QUARTO_PROFILE", None)
    # Use a writable, isolated TeX cache. This avoids broken user-level cache
    # states that can trigger `cannot find file ''` in LuaHBTeX/pdf backend.
    env.setdefault("TEXMFVAR", str(PDF_TEXMFVAR))
    Path(env["TEXMFVAR"]).mkdir(parents=True, exist_ok=True)
    if extra:
        env.update(extra)
    return env

def check_command_available(command):
    """コマンドの利用可確認"""
    try:
        result = subprocess.run(
            ['which', command] if os.name != 'nt' else ['where', command],
            capture_output=True,
            text=True
        )
        return result.returncode == 0
    except Exception:
        return False

def check_dependencies():
    """依存関係のチェック"""
    print("依存関係チェック中...")
    
    available_engines = {}
    
    for engine, config in ENGINES.items():
        print(f"  {config['name']}...", end=' ')
        
        # 基本コマンドのチェック
        if not check_command_available(config['command']):
            print("✗ (コマンド未検出)")
            continue
        
        # 依存関係のチェック
        deps_available = all(
            check_command_available(dep) for dep in config['dependencies']
        )
        
        if deps_available:
            print("✓")
            available_engines[engine] = config
        else:
            print(f"✗ (依存関係不足: {', '.join(config['dependencies'])})")
    
    return available_engines

def run_command_with_timeout(cmd, timeout, env=None, cwd=None):
    """Run a command with timeout, killing the process group on timeout."""
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        env=env,
        cwd=cwd,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout)
        return process.returncode, stdout, stderr, False
    except subprocess.TimeoutExpired as e:
        # Kill the entire process group (quarto -> lualatex, etc.)
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except Exception:
            pass
        try:
            stdout, stderr = process.communicate(timeout=10)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except Exception:
                pass
            stdout, stderr = process.communicate()
        # Prefer any captured output from the exception if available
        if e.stdout:
            stdout = e.stdout
        if e.stderr:
            stderr = e.stderr
        return None, stdout or "", stderr or "", True

def ensure_pdf_project_index():
    """
    Ensure pdf_build/index.qmd exists for book builds.

    Historically this was a symlink to the project root index.qmd, but that
    couples the PDF homepage to the HTML homepage and causes ordering/content
    mismatches (e.g. cover/TOC placement). The backend now manages the PDF
    homepage content; this function provides a safe fallback when running the
    script standalone.
    """
    project_root = Path(__file__).parent.parent
    pdf_project = project_root / PDF_PROJECT_DIR
    index_dst = pdf_project / "index.qmd"

    pdf_project.mkdir(parents=True, exist_ok=True)
    desired = (
        "---\n"
        "title: \"\"\n"
        "toc: false\n"
        "---\n\n"
    )
    if index_dst.exists():
        # If a previous setup created a symlink, replace it with a regular file.
        try:
            if index_dst.is_symlink():
                index_dst.unlink()
            elif index_dst.read_text(encoding="utf-8") == desired:
                return
        except OSError:
            return

    try:
        index_dst.write_text(desired, encoding="utf-8")
        print(f"✓ PDF用 index.qmd を作成しました: {index_dst}")
    except Exception as e:
        print(f"✗ index.qmd の作成に失敗しました: {e}")

def ensure_pdf_project_tail():
    """Ensure the PDF-only tail include exists without invoking TeX tail insertion."""
    project_root = Path(__file__).parent.parent
    tail_dir = project_root / PDF_PROJECT_DIR / "content"
    tail_dir.mkdir(parents=True, exist_ok=True)
    tail_dst = tail_dir / "_pdf_tail.tex"
    try:
        tail_dst.write_text(
            "% tail pages are appended in postprocess_tail_fullpage_images\n",
            encoding="utf-8",
        )
        print(f"✓ PDF用 tail を作成しました: {tail_dst}")
    except Exception as e:
        print(f"✗ PDF用 tail ファイルの作成に失敗しました: {e}")


def ensure_pdf_project_runtime_assets():
    """Make root-relative font/asset paths resolvable from the pdf_build project."""
    project_root = Path(__file__).parent.parent
    pdf_project = project_root / PDF_PROJECT_DIR
    for dirname in ("fonts", "assets"):
        source = project_root / dirname
        destination = pdf_project / dirname
        if not source.exists():
            continue
        try:
            if destination.exists() and source.samefile(destination):
                print(f"✓ PDF用 {dirname} は既に参照可能です: {destination}")
                continue
            shutil.copytree(source, destination, dirs_exist_ok=True)
            print(f"✓ PDF用 {dirname} を同期しました: {destination}")
        except Exception as e:
            print(f"⚠ PDF用 {dirname} の同期に失敗しました: {e}")


def refresh_fullpage_latex_config():
    """Regenerate fullpage-config.tex so build-time trimmed assets are reflected."""
    try:
        module_path = Path(__file__).parent.parent / 'api' / 'services' / 'fullpage_service.py'
        spec = importlib.util.spec_from_file_location('amp_fullpage_service', module_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"module load failed: {module_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        fullpage_service = module.fullpage_service
        fullpage_service._generate_latex_config()
        print("✓ fullpage-config.tex を再生成しました")
    except Exception as e:
        print(f"⚠ fullpage-config.tex の再生成に失敗しました: {e}")


def cleanup_intermediate_pdf_artifacts():
    """Remove stale intermediate PDFs so source selection cannot pick old artifacts."""
    candidate_dirs = {
        PDF_PROJECT_DIR,
        PDF_PROJECT_DIR / 'out',
        PDF_PROJECT_DIR / 'out_pc',
        PDF_PROJECT_DIR / 'out_raksul',
        PDF_PROJECT_DIR / 'out_raksul_source',
        PDF_PROJECT_DIR / 'pdf_build' / 'out_pc',
    }
    candidate_names = {
        'index.pdf',
        PDF_BOOK_FILENAME,
        'extracted-body-source.pdf',
        'clean-body-source.pdf',
    }
    for directory in sorted(candidate_dirs):
        for name in candidate_names:
            path = directory / name
            if path.exists():
                try:
                    path.unlink()
                    print(f"  removed stale PDF: {path}")
                except Exception as e:
                    print(f"  ⚠ stale PDF cleanup failed ({path}): {e}")


def cleanup_final_output_dir(directory: Path):
    """Remove previous generated artifacts from a final output directory."""
    directory.mkdir(parents=True, exist_ok=True)
    for pattern in FINAL_OUTPUT_CLEAN_PATTERNS:
        for path in sorted(directory.glob(pattern)):
            if not path.is_file():
                continue
            try:
                path.unlink()
                print(f"  removed stale output: {path}")
            except Exception as e:
                print(f"  ⚠ stale output cleanup failed ({path}): {e}")


def canonicalize_book_tex_path(tex_path: Path) -> Path:
    """Run LuaLaTeX against a deterministic index.tex path to stabilize output naming."""
    canonical_tex = tex_path.with_name('index.tex')
    if tex_path.resolve() == canonical_tex.resolve():
        return tex_path
    shutil.copy2(tex_path, canonical_tex)
    print(f"  canonicalized TeX: {tex_path} -> {canonical_tex}")
    return canonical_tex


def _rect_matches_page(rect, page_rect, tolerance: float = PDF_VALIDATION_TOLERANCE) -> bool:
    return (
        abs(rect.x0 - page_rect.x0) <= tolerance
        and abs(rect.y0 - page_rect.y0) <= tolerance
        and abs(rect.x1 - page_rect.x1) <= tolerance
        and abs(rect.y1 - page_rect.y1) <= tolerance
    )


def pdf_has_valid_rail(pdf_path: Path) -> bool:
    """Return True when the PDF contains a visible rail rectangle on-page."""
    try:
        import fitz
    except Exception:
        return False

    try:
        doc = fitz.open(str(pdf_path))
    except Exception:
        return False

    try:
        page_limit = min(doc.page_count, 24)
        for page_index in range(page_limit):
            page = doc.load_page(page_index)
            page_rect = page.rect
            for drawing in page.get_drawings():
                fill = drawing.get('fill')
                rect = drawing.get('rect')
                if not fill or rect is None:
                    continue
                if (
                    8 <= rect.width <= 20
                    and rect.height >= 3
                    and rect.x0 >= page_rect.x0 - PDF_VALIDATION_TOLERANCE
                    and rect.x1 <= page_rect.x1 + PDF_VALIDATION_TOLERANCE
                    and rect.y0 >= page_rect.y0 - PDF_VALIDATION_TOLERANCE
                    and rect.y1 <= page_rect.y1 + PDF_VALIDATION_TOLERANCE
                ):
                    return True
        return False
    finally:
        doc.close()


def pdf_has_fullpage_tail_images(pdf_path: Path, tail_count: Optional[int] = None) -> bool:
    """Return True when trailing tail pages are exactly one full-page image each."""
    try:
        import fitz
    except Exception:
        return False

    if tail_count is None:
        tail_count = len(get_enabled_tail_images())
    if tail_count <= 0:
        return True

    try:
        doc = fitz.open(str(pdf_path))
    except Exception:
        return False

    try:
        if doc.page_count < tail_count:
            return False
        for page_index in range(doc.page_count - tail_count, doc.page_count):
            page = doc.load_page(page_index)
            images = page.get_images(full=True)
            if len(images) != 1:
                return False
            rects = page.get_image_rects(images[0][0])
            if len(rects) != 1 or not _rect_matches_page(rects[0], page.rect):
                return False
            if page.get_text('text').strip():
                return False
        return True
    finally:
        doc.close()


def resolve_rail_binding(profile: str) -> str:
    if profile == 'pc':
        return 'left'
    if profile == RAKSUL_PROFILE_NAME:
        return str(load_raksul_settings().get('binding') or 'left').strip().lower()
    return 'left'


def rail_is_on_right(profile: str, binding: str, physical_page_number: int) -> bool:
    if profile == 'pc':
        return True
    normalized_binding = str(binding or 'left').strip().lower()
    if profile == RAKSUL_PROFILE_NAME:
        if normalized_binding == 'right':
            return physical_page_number % 2 == 0
        return physical_page_number % 2 == 1
    # Print/PC source book parity.
    if normalized_binding == 'right':
        return physical_page_number % 2 == 0
    return physical_page_number % 2 == 1


def triangle_is_on_right(profile: str, binding: str, physical_page_number: int) -> bool:
    if profile == 'pc':
        return True
    return rail_is_on_right(profile, binding, physical_page_number)


def resolve_rail_band(page, profile: str, rail_on_right: bool, rail_width: float):
    if profile == RAKSUL_PROFILE_NAME:
        media_rect = page.rect
        trimbox = getattr(page, 'trimbox', None)
        if trimbox is None or trimbox.width <= 0 or trimbox.height <= 0:
            trimbox = media_rect
        # X: extend from trim edge into bleed
        if rail_on_right:
            x0 = trimbox.x1 - rail_width
            x1 = media_rect.x1
        else:
            x0 = media_rect.x0
            x1 = trimbox.x0 + rail_width
        # Y: use trim area for chapter segment positioning;
        # bleed extension is handled separately in overlay_navigation_rail.
        return (x0, x1, trimbox.y0, trimbox.y1)

    anchor_rect = resolve_rail_anchor_rect(page, profile)
    if rail_on_right:
        return (
            anchor_rect.x1 - rail_width,
            anchor_rect.x1,
            anchor_rect.y0,
            anchor_rect.y1,
        )
    return (
        anchor_rect.x0,
        anchor_rect.x0 + rail_width,
        anchor_rect.y0,
        anchor_rect.y1,
    )


def resolve_rail_anchor_rect(page, profile: str):
    if profile == RAKSUL_PROFILE_NAME:
        return page.rect

    trimbox = getattr(page, 'trimbox', None)
    if trimbox is not None and trimbox.width > 0 and trimbox.height > 0:
        return trimbox
    mediabox = getattr(page, 'mediabox', None)
    if mediabox is not None and mediabox.width > 0 and mediabox.height > 0:
        return mediabox
    return page.rect


def page_is_exact_fullpage_image(page, tolerance: float = 2.0) -> bool:
    image_refs = page.get_images(full=True)
    if len(image_refs) != 1:
        return False
    if page.get_text("text").strip():
        return False
    if page.get_drawings():
        return False
    rects = page.get_image_rects(image_refs[0][0])
    if len(rects) != 1:
        return False
    rect = rects[0]
    page_rect = page.rect
    if _rect_matches_page(rect, page_rect, tolerance=tolerance):
        return True
    width_ratio = rect.width / page_rect.width if page_rect.width else 0
    height_ratio = rect.height / page_rect.height if page_rect.height else 0
    return width_ratio >= 0.9 and height_ratio >= 0.9


def _colors_close(observed: Any, expected: Tuple[float, float, float], tolerance: float = 0.03) -> bool:
    if observed is None or len(observed) < 3:
        return False
    return all(abs(float(observed[idx]) - expected[idx]) <= tolerance for idx in range(3))


def _rect_touches_page_side(rect, page_rect, side: str, tolerance: float) -> bool:
    if side == 'left':
        return abs(rect.x0 - page_rect.x0) <= tolerance
    return abs(rect.x1 - page_rect.x1) <= tolerance


def _merge_rectangles(rects: List[Any], fitz_module):
    if not rects:
        return None
    merged = fitz_module.Rect(rects[0])
    for rect in rects[1:]:
        merged |= rect
    return merged


def detect_existing_source_rail_bboxes(page) -> Dict[str, Any]:
    try:
        import fitz
    except Exception:
        return {}

    page_rect = page.rect
    edge_tolerance = 1.5
    min_width = mm_to_points(3.5)
    max_width = mm_to_points(6.5)
    min_segment_height = mm_to_points(10.0)
    grouped_rects: Dict[str, List[Any]] = {"left": [], "right": []}

    for drawing in page.get_drawings():
        rect = drawing.get("rect")
        fill = drawing.get("fill")
        if rect is None or fill is None:
            continue
        if not (
            _colors_close(fill, RAIL_ACTIVE_COLOR, tolerance=0.04)
            or _colors_close(fill, RAIL_INACTIVE_COLOR, tolerance=0.04)
        ):
            continue
        if rect.width < min_width or rect.width > max_width:
            continue
        if rect.height < min_segment_height:
            continue
        if _rect_touches_page_side(rect, page_rect, "left", edge_tolerance):
            grouped_rects["left"].append(rect)
        elif _rect_touches_page_side(rect, page_rect, "right", edge_tolerance):
            grouped_rects["right"].append(rect)

    detected: Dict[str, Any] = {}
    min_bbox_height = page_rect.height * 0.4
    for side, rects in grouped_rects.items():
        merged = _merge_rectangles(rects, fitz)
        if merged is None:
            continue
        if len(rects) < 2 and merged.height < min_bbox_height:
            continue
        detected[side] = merged
    return detected


def detect_existing_source_triangle(page) -> Optional[Tuple[str, Any]]:
    page_rect = page.rect
    edge_tolerance = 1.5
    min_size = mm_to_points(10.0)
    max_size = mm_to_points(20.0)
    best_match: Optional[Tuple[str, Any]] = None

    for drawing in page.get_drawings():
        rect = drawing.get("rect")
        fill = drawing.get("fill")
        if rect is None or fill is None:
            continue
        if not _colors_close(fill, RAIL_TRIANGLE_COLOR, tolerance=0.05):
            continue
        if rect.width < min_size or rect.width > max_size:
            continue
        if rect.height < min_size or rect.height > max_size:
            continue
        if rect.y0 > edge_tolerance:
            continue

        side = None
        if _rect_touches_page_side(rect, page_rect, "left", edge_tolerance):
            side = "left"
        elif _rect_touches_page_side(rect, page_rect, "right", edge_tolerance):
            side = "right"
        if side is None:
            continue

        if best_match is None or rect.get_area() > best_match[1].get_area():
            best_match = (side, rect)

    return best_match


def page_should_draw_rail(
    page,
    profile: str,
    physical_page_number: int,
    first_chapter_start: int,
    page_limit: int,
    suppress_pages: Optional[set[int]] = None,
) -> bool:
    if suppress_pages and physical_page_number in suppress_pages:
        return False
    if physical_page_number < first_chapter_start:
        return False
    if physical_page_number > page_limit:
        return False
    if page_is_exact_fullpage_image(page):
        return False
    return True


def overlay_chapter_triangles(
    pdf_path: Path,
    profile: str,
    binding: Optional[str] = None,
    rail_data: Optional[dict] = None,
):
    if not pdf_path.exists():
        return

    try:
        import fitz
    except Exception as e:
        print(f"⚠ 章頭三角形補正をスキップしました (fitz unavailable): {e}")
        return

    rail_data = rail_data or load_rail_chapter_data()
    chapters = rail_data.get('chapters', [])
    if not chapters:
        return

    resolved_binding = str(binding or resolve_rail_binding(profile) or 'left').strip().lower()
    triangle_size = 15 * 72 / 25.4  # 1.5cm
    chapter_start_pages = {int(chapter['start']) for chapter in chapters if int(chapter.get('start', 0)) > 0}

    doc = fitz.open(str(pdf_path))
    try:
        for page_index in range(doc.page_count):
            physical_page = page_index + 1
            if physical_page not in chapter_start_pages:
                continue

            page = doc.load_page(page_index)
            if page_is_exact_fullpage_image(page):
                continue

            page_rect = page.rect
            triangle_on_right = triangle_is_on_right(profile, resolved_binding, physical_page)
            shape = page.new_shape()
            if triangle_on_right:
                shape.draw_polyline([
                    fitz.Point(page_rect.x1, page_rect.y0),
                    fitz.Point(page_rect.x1 - triangle_size, page_rect.y0),
                    fitz.Point(page_rect.x1, page_rect.y0 + triangle_size),
                    fitz.Point(page_rect.x1, page_rect.y0),
                ])
            else:
                shape.draw_polyline([
                    fitz.Point(page_rect.x0, page_rect.y0),
                    fitz.Point(page_rect.x0 + triangle_size, page_rect.y0),
                    fitz.Point(page_rect.x0, page_rect.y0 + triangle_size),
                    fitz.Point(page_rect.x0, page_rect.y0),
                ])
            shape.finish(color=None, fill=RAIL_TRIANGLE_COLOR)
            shape.commit(overlay=True)

        tmp_path = pdf_path.with_suffix('.trianglefix.pdf')
        doc.save(str(tmp_path), garbage=4, deflate=True)
        doc.close()
        tmp_path.replace(pdf_path)
        print(f"✓ 章頭三角形補正: {pdf_path}")
    except Exception as e:
        doc.close()
        print(f"⚠ 章頭三角形補正に失敗しました ({pdf_path}): {e}")

def load_settings():
    """設定ファイルを読み込む"""
    config_path = CONFIG['config_file']
    if not config_path.exists():
        print(f"⚠ 設定ファイルが見つかりません: {config_path}")
        return {}
    
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            settings = json.load(f)
        return settings
    except Exception as e:
        print(f"⚠ 設定ファイルの読み込みに失敗しました: {e}")
        return {}


def mm_to_points(mm: float) -> float:
    return float(mm) * POINTS_PER_MM


def mm_to_pixels(mm: float, dpi: int = 300) -> int:
    return max(1, int(round(float(mm) * dpi / 25.4)))


def escape_latex_text(text: Any) -> str:
    replacements = {
        "\\": "\\textbackslash{}",
        "&": "\\&",
        "%": "\\%",
        "$": "\\$",
        "#": "\\#",
        "_": "\\_",
        "{": "\\{",
        "}": "\\}",
        "~": "\\textasciitilde{}",
        "^": "\\textasciicircum{}",
    }
    return "".join(replacements.get(char, char) for char in str(text if text is not None else ""))


def normalize_hex_color(value: Any, fallback: str = "102B44") -> str:
    raw = str(value or "").strip().lstrip("#")
    if re.fullmatch(r"[0-9A-Fa-f]{6}", raw):
        return raw.upper()
    return fallback


def _deep_merge_dict(defaults: Dict[str, Any], override: Dict[str, Any]) -> Dict[str, Any]:
    merged: Dict[str, Any] = {}
    for key, default_value in defaults.items():
        override_value = override.get(key)
        if isinstance(default_value, dict):
            merged[key] = _deep_merge_dict(default_value, override_value if isinstance(override_value, dict) else {})
        elif override_value is None:
            merged[key] = default_value
        else:
            merged[key] = override_value
    for key, value in override.items():
        if key not in merged:
            merged[key] = value
    return merged


def load_raksul_settings() -> Dict[str, Any]:
    settings = load_settings()
    raksul_settings = settings.get("raksul", {}) if isinstance(settings, dict) else {}
    merged = _deep_merge_dict(RAKSUL_DEFAULTS, raksul_settings if isinstance(raksul_settings, dict) else {})

    numeric_keys = [
        "trim_width_mm",
        "trim_height_mm",
        "bleed_mm",
        "safe_margin_mm",
        "paper_width_mm",
        "paper_height_mm",
        "inner_margin_mm",
        "outer_margin_mm",
        "top_margin_mm",
        "bottom_margin_mm",
    ]
    for key in numeric_keys:
        merged[key] = float(merged[key])

    merged["body_pages"] = int(merged["body_pages"])
    merged["source_body_pages"] = int(merged.get("source_body_pages") or merged["body_pages"])
    if merged.get("spine_width_mm") in ("", None):
        merged["spine_width_mm"] = float(RAKSUL_DEFAULTS["spine_width_mm"])
    else:
        merged["spine_width_mm"] = float(merged["spine_width_mm"])

    spine_width_source = str(merged.get("spine_width_source") or "estimated").strip().lower()
    if spine_width_source not in {"estimated", "template"}:
        spine_width_source = "estimated"
    merged["spine_width_source"] = spine_width_source

    conference = merged.get("conference", {})
    if not isinstance(conference, dict):
        conference = {}
    merged["conference"] = _deep_merge_dict(RAKSUL_DEFAULTS["conference"], conference)

    insert_pages = merged.get("body_insert_pages", {})
    if not isinstance(insert_pages, dict):
        insert_pages = {}
    merged["body_insert_pages"] = _deep_merge_dict(RAKSUL_DEFAULTS["body_insert_pages"], insert_pages)
    merged["body_insert_pages"]["enabled"] = bool(merged["body_insert_pages"].get("enabled", True))
    for position in ("front", "back"):
        section = merged["body_insert_pages"].get(position, {})
        if not isinstance(section, dict):
            section = {}
        merged["body_insert_pages"][position] = section
        merged["body_insert_pages"][position]["enabled"] = bool(section.get("enabled", True))

    cover = merged.get("cover", {})
    if not isinstance(cover, dict):
        cover = {}
    merged["cover"] = _deep_merge_dict(RAKSUL_DEFAULTS["cover"], cover)
    inner_back_lines = merged["cover"].get("inner_back_lines", [])
    if not isinstance(inner_back_lines, list):
        inner_back_lines = list(RAKSUL_DEFAULTS["cover"]["inner_back_lines"])
    merged["cover"]["inner_back_lines"] = [str(line) for line in inner_back_lines if str(line).strip()]
    if not merged["cover"]["inner_back_lines"]:
        merged["cover"]["inner_back_lines"] = list(RAKSUL_DEFAULTS["cover"]["inner_back_lines"])
    palette = merged["cover"].get("palette", {})
    if not isinstance(palette, dict):
        palette = {}
    merged["cover"]["palette"] = _deep_merge_dict(RAKSUL_DEFAULTS["cover"]["palette"], palette)
    merged["cover"]["palette"]["navy"] = normalize_hex_color(merged["cover"]["palette"].get("navy"))

    front_insert = merged["body_insert_pages"]["front"]
    front_insert["title"] = str(front_insert.get("title") or PROJECT_METADATA["title"])
    front_insert["subtitle"] = str(front_insert.get("subtitle") or "Background Guide")
    front_insert["conference_name"] = str(front_insert.get("conference_name") or merged["conference"]["long_name"])
    front_insert["dates_en"] = str(front_insert.get("dates_en") or merged["conference"]["dates_en"])

    back_insert = merged["body_insert_pages"]["back"]
    back_lines = back_insert.get("lines", [])
    if not isinstance(back_lines, list):
        back_lines = list(merged["cover"]["inner_back_lines"])
    back_insert["lines"] = [str(line) for line in back_lines if str(line).strip()]
    if not back_insert["lines"]:
        back_insert["lines"] = list(merged["cover"]["inner_back_lines"])
    return merged


def load_fullpage_images_config() -> Dict[str, Any]:
    config_path = Path("config/fullpage_images.json")
    if not config_path.exists():
        return {}
    try:
        return json.loads(config_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _to_project_relative_path(path: Optional[Path]) -> str:
    if path is None:
        return ""
    try:
        rel = path.resolve().relative_to(Path.cwd().resolve())
        return rel.as_posix()
    except Exception:
        return path.as_posix()


def _resolve_cover_asset_from_settings(cover_type: str) -> Optional[Path]:
    cover_config_path = Path("config/cover_settings.json")
    if not cover_config_path.exists():
        return None
    try:
        config = json.loads(cover_config_path.read_text(encoding="utf-8"))
    except Exception:
        return None
    cover = config.get("covers", {}).get(cover_type, {})
    path = cover.get("path")
    if not cover.get("enabled") or not path:
        return None
    asset_path = Path(path)
    if not asset_path.is_absolute():
        asset_path = Path.cwd() / asset_path
    return asset_path if asset_path.exists() else None


def resolve_raksul_cover_assets(raksul_settings: Dict[str, Any]) -> Dict[str, Optional[Path]]:
    assets: Dict[str, Optional[Path]] = {
        "front_cover": None,
        "back_cover": None,
        "inner_front": None,
        "inner_back": None,
    }

    fullpage_config = load_fullpage_images_config()
    for image in fullpage_config.get("images", []):
        if not image.get("enabled"):
            continue
        image_type = str(image.get("type", "") or "")
        asset_path = Path(str(image.get("path", "") or ""))
        if not asset_path:
            continue
        if not asset_path.is_absolute():
            asset_path = Path.cwd() / asset_path
        if not asset_path.exists():
            continue
        if image_type == "cover_front" and assets["front_cover"] is None:
            assets["front_cover"] = asset_path
        elif image_type == "cover_back" and assets["back_cover"] is None:
            assets["back_cover"] = asset_path

    if assets["front_cover"] is None:
        assets["front_cover"] = _resolve_cover_asset_from_settings("front")
    if assets["back_cover"] is None:
        assets["back_cover"] = _resolve_cover_asset_from_settings("back")

    cover_settings = raksul_settings.get("cover", {})
    for role, key in [("inner_front", "inner_front_path"), ("inner_back", "inner_back_path")]:
        path = cover_settings.get(key)
        if not path:
            continue
        asset_path = Path(path)
        if not asset_path.is_absolute():
            asset_path = Path.cwd() / asset_path
        if asset_path.exists():
            assets[role] = asset_path

    return assets


def resolve_print_final_pdf() -> Optional[Path]:
    preferred_paths = [
        CONFIG["pdf_dir"] / "index.pdf",
        CONFIG["pdf_dir"] / PDF_BOOK_FILENAME,
    ]
    for path in preferred_paths:
        if path.exists():
            return path
    return None


def write_raksul_profile(raksul_settings: Dict[str, Any]) -> Path:
    lines = [
        "# Auto-generated Raksul profile",
        "project:",
        "  output-dir: out_raksul",
        "",
        "format:",
        "  pdf:",
        "    classoption:",
        "    - lj4vfu",
        "    - openany",
        "    - nomag",
        "    - twoside",
        "",
        "    geometry:",
        f"    - paperwidth={raksul_settings['paper_width_mm']}mm",
        f"    - paperheight={raksul_settings['paper_height_mm']}mm",
        f"    - top={raksul_settings['top_margin_mm']}mm",
        f"    - bottom={raksul_settings['bottom_margin_mm']}mm",
        f"    - inner={raksul_settings['inner_margin_mm']}mm",
        f"    - outer={raksul_settings['outer_margin_mm']}mm",
        "",
        "    include-after-body: []",
        "",
        "    header-includes: |",
        "      \\def\\AmpRaksulMode{1}",
    ]
    RAKSUL_PROFILE_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return RAKSUL_PROFILE_PATH


def write_raksul_body_source_profile() -> Path:
    lines = [
        "# Auto-generated Raksul body source profile",
        "project:",
        "  output-dir: out_raksul_source",
        "",
        "format:",
        "  pdf:",
        "    classoption:",
        "    - lj4vfu",
        "    - openany",
        "    - nomag",
        "    - twoside",
        "",
        "    geometry:",
        "    - top=25mm",
        "    - bottom=20mm",
        "    - inner=18mm",
        "    - outer=25mm",
        "    - height=230mm",
        "",
        "    include-after-body: []",
        "",
        "    header-includes: |",
        "      \\def\\AmpRaksulBodySourceMode{1}",
    ]
    RAKSUL_BODY_SOURCE_PROFILE_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return RAKSUL_BODY_SOURCE_PROFILE_PATH


def write_raksul_latex_config(raksul_settings: Dict[str, Any], assets: Dict[str, Optional[Path]]) -> Path:
    spine_width_mm = raksul_settings.get("spine_width_mm") or 0
    panel_paper_width_mm = raksul_settings["trim_width_mm"] + raksul_settings["bleed_mm"]
    cover_paper_width_mm = 2 * raksul_settings["trim_width_mm"] + 2 * raksul_settings["bleed_mm"] + spine_width_mm
    conference = raksul_settings.get("conference", {})
    cover_settings = raksul_settings.get("cover", {})
    inner_back_lines = cover_settings.get("inner_back_lines", [])
    latex_inner_back_text = r"\par ".join(escape_latex_text(line) for line in inner_back_lines)
    navy_hex = normalize_hex_color(cover_settings.get("palette", {}).get("navy"))
    lines = [
        "% Auto-generated Raksul config",
        f"% generated_at: {datetime.now().isoformat()}",
        f"\\newcommand{{\\RaksulTrimWidth}}{{{raksul_settings['trim_width_mm']}mm}}",
        f"\\newcommand{{\\RaksulTrimHeight}}{{{raksul_settings['trim_height_mm']}mm}}",
        f"\\newcommand{{\\RaksulBleed}}{{{raksul_settings['bleed_mm']}mm}}",
        f"\\newcommand{{\\RaksulSafeMargin}}{{{raksul_settings['safe_margin_mm']}mm}}",
        f"\\newcommand{{\\RaksulPaperWidth}}{{{raksul_settings['paper_width_mm']}mm}}",
        f"\\newcommand{{\\RaksulPaperHeight}}{{{raksul_settings['paper_height_mm']}mm}}",
        f"\\newcommand{{\\RaksulSpineWidth}}{{{spine_width_mm}mm}}",
        f"\\newcommand{{\\RaksulPanelPaperWidth}}{{{panel_paper_width_mm}mm}}",
        f"\\newcommand{{\\RaksulCoverPaperWidth}}{{{cover_paper_width_mm}mm}}",
        f"\\def\\RaksulSpineWidthSource{{{escape_latex_text(raksul_settings.get('spine_width_source', 'estimated'))}}}",
        f"\\def\\RaksulConferenceLongName{{{escape_latex_text(conference.get('long_name', ''))}}}",
        f"\\def\\RaksulConferenceShortName{{{escape_latex_text(conference.get('short_name', ''))}}}",
        f"\\def\\RaksulConferenceDatesEn{{{escape_latex_text(conference.get('dates_en', ''))}}}",
        f"\\def\\RaksulInnerFrontTitle{{{escape_latex_text(PROJECT_METADATA['title'])}}}",
        f"\\def\\RaksulInnerFrontSubtitle{{{escape_latex_text('Background Guide')}}}",
        f"\\def\\RaksulSpineTitle{{{escape_latex_text(PROJECT_METADATA['title'])}}}",
        f"\\def\\RaksulSpineFooter{{{escape_latex_text(conference.get('short_name', ''))}}}",
        f"\\def\\RaksulInnerBackText{{{latex_inner_back_text}}}",
        f"\\definecolor{{RaksulNavy}}{{HTML}}{{{navy_hex}}}",
        f"\\def\\RaksulFrontCoverPath{{{_to_project_relative_path(assets.get('front_cover'))}}}",
        f"\\def\\RaksulBackCoverPath{{{_to_project_relative_path(assets.get('back_cover'))}}}",
        f"\\def\\RaksulInnerFrontPath{{{_to_project_relative_path(assets.get('inner_front'))}}}",
        f"\\def\\RaksulInnerBackPath{{{_to_project_relative_path(assets.get('inner_back'))}}}",
    ]
    RAKSUL_LATEX_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    RAKSUL_LATEX_CONFIG_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return RAKSUL_LATEX_CONFIG_PATH


def build_raksul_body_pdf_from_source_pdf(
    source_pdf: Path,
    output_pdf: Path,
    raksul_settings: Dict[str, Any],
) -> None:
    try:
        import fitz
    except Exception as e:
        raise RuntimeError(f"PyMuPDF unavailable for Raksul body conversion: {e}")

    if not source_pdf.exists():
        raise RuntimeError(f"print final PDF not found: {source_pdf}")

    source_doc = fitz.open(str(source_pdf))
    try:
        expected_source_pages = int(raksul_settings.get("source_body_pages") or raksul_settings["body_pages"])
        if source_doc.page_count != expected_source_pages:
            raise RuntimeError(
                f"body source page count mismatch: expected {expected_source_pages}, got {source_doc.page_count}"
            )
        insert_kinds = get_enabled_raksul_body_insert_kinds(raksul_settings)
        expected_output_pages = expected_source_pages + len(insert_kinds)
        if expected_output_pages != int(raksul_settings["body_pages"]):
            raise RuntimeError(
                f"raksul body page configuration mismatch: source {expected_source_pages} + inserts {len(insert_kinds)} != body_pages {raksul_settings['body_pages']}"
            )

        paper_width_pt = mm_to_points(raksul_settings["paper_width_mm"])
        paper_height_pt = mm_to_points(raksul_settings["paper_height_mm"])
        trim_rect = fitz.Rect(
            mm_to_points(raksul_settings["bleed_mm"]),
            mm_to_points(raksul_settings["bleed_mm"]),
            mm_to_points(raksul_settings["bleed_mm"] + raksul_settings["trim_width_mm"]),
            mm_to_points(raksul_settings["bleed_mm"] + raksul_settings["trim_height_mm"]),
        )

        rebuilt = fitz.open()
        try:
            if "front" in insert_kinds:
                front_page = rebuilt.new_page(width=paper_width_pt, height=paper_height_pt)
                _render_raksul_body_insert_page(front_page, raksul_settings, "front")
            for source_index in range(source_doc.page_count):
                page = rebuilt.new_page(width=paper_width_pt, height=paper_height_pt)
                page.show_pdf_page(trim_rect, source_doc, source_index, keep_proportion=True, overlay=True)
            if "back" in insert_kinds:
                back_page = rebuilt.new_page(width=paper_width_pt, height=paper_height_pt)
                _render_raksul_body_insert_page(back_page, raksul_settings, "back")

            output_pdf.parent.mkdir(parents=True, exist_ok=True)
            rebuilt.save(str(output_pdf), garbage=4, deflate=True)
        finally:
            rebuilt.close()
    finally:
        source_doc.close()

    set_pdf_boxes(
        output_pdf,
        raksul_settings["paper_width_mm"],
        raksul_settings["paper_height_mm"],
        raksul_settings["trim_width_mm"],
        raksul_settings["trim_height_mm"],
        raksul_settings["bleed_mm"],
        raksul_settings["bleed_mm"],
    )


def get_raksul_body_source_candidates() -> List[Path]:
    return [
        CONFIG["pdf_dir"] / PDF_BOOK_FILENAME,
        CONFIG["pdf_dir"] / 'index.pdf',
    ]


def extract_raksul_body_source_pdf(
    print_final_pdf: Path,
    output_pdf: Path,
    expected_body_pages: int,
) -> Path:
    try:
        import fitz
    except Exception as e:
        raise RuntimeError(f"PyMuPDF unavailable for Raksul body source extraction: {e}")

    if not print_final_pdf.exists():
        raise RuntimeError(f"print final PDF not found: {print_final_pdf}")

    source_doc = fitz.open(str(print_final_pdf))
    try:
        expected_total_pages = expected_body_pages + 2
        if source_doc.page_count != expected_total_pages:
            raise RuntimeError(
                f"print final PDF page count mismatch: expected {expected_total_pages}, got {source_doc.page_count}"
            )
        if not page_is_exact_fullpage_image(source_doc.load_page(0)):
            raise RuntimeError("print final PDF first page is not an exact full-page image")
        if not page_is_exact_fullpage_image(source_doc.load_page(source_doc.page_count - 1)):
            raise RuntimeError("print final PDF last page is not an exact full-page image")

        output_pdf.parent.mkdir(parents=True, exist_ok=True)
        extracted = fitz.open()
        try:
            extracted.insert_pdf(source_doc, from_page=1, to_page=source_doc.page_count - 2)
            extracted.save(str(output_pdf), garbage=4, deflate=True)
        finally:
            extracted.close()
    finally:
        source_doc.close()

    return output_pdf


def _mask_existing_source_rail(shape, mask_rect) -> None:
    shape.draw_rect(mask_rect)
    shape.finish(color=None, fill=(1, 1, 1))
    shape.commit(overlay=True)


def _mask_existing_source_triangle(shape, mask_rect) -> None:
    shape.draw_rect(mask_rect)
    shape.finish(color=None, fill=(1, 1, 1))
    shape.commit(overlay=True)


def clean_raksul_body_source_pdf(
    source_pdf: Path,
    output_pdf: Path,
    rail_data: dict,
    binding: str,
) -> Path:
    try:
        import fitz
    except Exception as e:
        raise RuntimeError(f"PyMuPDF unavailable for Raksul body source cleanup: {e}")

    output_pdf.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_pdf, output_pdf)

    doc = fitz.open(str(output_pdf))
    try:
        for page_index in range(doc.page_count):
            page = doc.load_page(page_index)
            if page_is_exact_fullpage_image(page):
                continue
            page_rect = page.rect
            detected_rail_bboxes = detect_existing_source_rail_bboxes(page)
            for mask_rect in detected_rail_bboxes.values():
                expanded_rect = fitz.Rect(mask_rect)
                expanded_rect.x0 = max(page_rect.x0, expanded_rect.x0 - 0.5)
                expanded_rect.y0 = max(page_rect.y0, expanded_rect.y0 - 0.5)
                expanded_rect.x1 = min(page_rect.x1, expanded_rect.x1 + 0.5)
                expanded_rect.y1 = min(page_rect.y1, expanded_rect.y1 + 0.5)
                rail_shape = page.new_shape()
                _mask_existing_source_rail(rail_shape, expanded_rect)

            detected_triangle = detect_existing_source_triangle(page)
            if detected_triangle:
                _triangle_side, triangle_rect = detected_triangle
                expanded_rect = fitz.Rect(triangle_rect)
                expanded_rect.x0 = max(page_rect.x0, expanded_rect.x0 - 1.5)
                expanded_rect.y0 = max(page_rect.y0, expanded_rect.y0 - 1.5)
                expanded_rect.x1 = min(page_rect.x1, expanded_rect.x1 + 1.5)
                expanded_rect.y1 = min(page_rect.y1, expanded_rect.y1 + 1.5)
                triangle_shape = page.new_shape()
                _mask_existing_source_triangle(triangle_shape, expanded_rect)

        tmp_path = output_pdf.with_suffix('.clean.tmp.pdf')
        doc.save(str(tmp_path), garbage=4, deflate=True)
        doc.close()
        tmp_path.replace(output_pdf)
    finally:
        try:
            doc.close()
        except Exception:
            pass

    return output_pdf


def rebase_rail_data_for_extracted_body(rail_data: dict, removed_front_pages: int = 1) -> dict:
    offset = max(0, int(removed_front_pages))
    if offset == 0:
        return rail_data

    rebased = {
        "total_pages": max(0, int(rail_data.get("total_pages") or 0) - offset),
        "chapters": [],
    }
    for chapter in rail_data.get("chapters", []):
        start = max(1, int(chapter.get("start", 0)) - offset)
        end = max(0, int(chapter.get("end", 0)) - offset)
        if end < start:
            continue
        rebased["chapters"].append({
            "index": int(chapter.get("index", 0)),
            "start": start,
            "end": end,
            "count": int(chapter.get("count", 0)),
        })
    return rebased


def offset_rail_data_pages(rail_data: dict, offset_pages: int = 0) -> dict:
    offset = int(offset_pages)
    if offset == 0:
        return rail_data

    shifted = {
        "total_pages": max(0, int(rail_data.get("total_pages") or 0) + offset),
        "chapters": [],
    }
    for chapter in rail_data.get("chapters", []):
        shifted["chapters"].append({
            "index": int(chapter.get("index", 0)),
            "start": max(1, int(chapter.get("start", 0)) + offset),
            "end": max(0, int(chapter.get("end", 0)) + offset),
            "count": int(chapter.get("count", 0)),
        })
    return shifted


def build_raksul_body_source_pdf(env: Dict[str, Any], raksul_settings: Dict[str, Any]) -> Tuple[Path, dict]:
    rail_data = load_rail_chapter_data(PDF_PROJECT_DIR)
    expected_body_pages = int(raksul_settings.get("source_body_pages") or raksul_settings["body_pages"])
    source_pdf = next((path for path in get_raksul_body_source_candidates() if path.exists()), None)
    if source_pdf is None:
        raise RuntimeError("Raksul body source PDF not found")
    extracted_source_path = CONFIG["pdf_build_raksul_source_output_dir"] / 'extracted-body-source.pdf'
    extract_raksul_body_source_pdf(source_pdf, extracted_source_path, expected_body_pages)
    clean_source_path = CONFIG["pdf_build_raksul_source_output_dir"] / 'clean-body-source.pdf'
    binding = str(raksul_settings.get("binding") or 'left').strip().lower()
    clean_raksul_body_source_pdf(extracted_source_path, clean_source_path, rail_data, binding)
    return clean_source_path, rebase_rail_data_for_extracted_body(rail_data, removed_front_pages=1)


def set_pdf_boxes(
    pdf_path: Path,
    paper_width_mm: float,
    paper_height_mm: float,
    trim_width_mm: float,
    trim_height_mm: float,
    trim_offset_x_mm: float,
    trim_offset_y_mm: float,
) -> None:
    try:
        import fitz
    except Exception as e:
        raise RuntimeError(f"PyMuPDF unavailable for page box update: {e}")

    doc = fitz.open(str(pdf_path))
    paper_rect = fitz.Rect(0, 0, mm_to_points(paper_width_mm), mm_to_points(paper_height_mm))
    trim_rect = fitz.Rect(
        mm_to_points(trim_offset_x_mm),
        mm_to_points(trim_offset_y_mm),
        mm_to_points(trim_offset_x_mm + trim_width_mm),
        mm_to_points(trim_offset_y_mm + trim_height_mm),
    )
    try:
        for page in doc:
            page.set_mediabox(paper_rect)
            if hasattr(page, "set_bleedbox"):
                page.set_bleedbox(paper_rect)
            if hasattr(page, "set_trimbox"):
                page.set_trimbox(trim_rect)
        tmp_path = pdf_path.with_suffix(".boxes.pdf")
        doc.save(str(tmp_path), garbage=4, deflate=True)
        doc.close()
        tmp_path.replace(pdf_path)
    finally:
        try:
            doc.close()
        except Exception:
            pass


def _load_cover_font(font_path: Path, size_px: int):
    from PIL import ImageFont

    try:
        return ImageFont.truetype(str(font_path), size_px)
    except Exception:
        return ImageFont.load_default()


def _fit_cover_image(path: Path, width_px: int, height_px: int):
    from PIL import Image, ImageOps

    with Image.open(path) as image:
        return ImageOps.fit(
            image.convert("RGB"),
            (width_px, height_px),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.5),
        )


def _draw_centered_multiline(draw, center_xy, text: str, font, fill, spacing: int = 8):
    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=spacing, align="center")
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    origin = (center_xy[0] - text_width / 2, center_xy[1] - text_height / 2)
    draw.multiline_text(origin, text, font=font, fill=fill, spacing=spacing, align="center")


def _draw_bottom_center_text(draw, center_x: float, bottom_y: float, text: str, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    draw.text((center_x - text_width / 2, bottom_y - text_height), text, font=font, fill=fill)


def get_enabled_raksul_body_insert_kinds(raksul_settings: Dict[str, Any]) -> List[str]:
    body_insert_pages = raksul_settings.get("body_insert_pages", {})
    if not isinstance(body_insert_pages, dict) or not body_insert_pages.get("enabled", True):
        return []

    enabled_kinds: List[str] = []
    for kind in ("front", "back"):
        section = body_insert_pages.get(kind, {})
        if isinstance(section, dict) and section.get("enabled", True):
            enabled_kinds.append(kind)
    return enabled_kinds


def _render_raksul_body_insert_page(page, raksul_settings: Dict[str, Any], kind: str) -> None:
    from PIL import Image, ImageDraw

    project_root = Path(__file__).parent.parent
    dpi = 300
    paper_width_px = mm_to_pixels(raksul_settings["paper_width_mm"], dpi)
    paper_height_px = mm_to_pixels(raksul_settings["paper_height_mm"], dpi)
    trim_offset_px = mm_to_pixels(raksul_settings["bleed_mm"], dpi)
    safe_offset_px = trim_offset_px + mm_to_pixels(raksul_settings["safe_margin_mm"], dpi)
    navy = "#" + normalize_hex_color(raksul_settings.get("cover", {}).get("palette", {}).get("navy"))
    canvas = Image.new("RGB", (paper_width_px, paper_height_px), color=navy)
    draw = ImageDraw.Draw(canvas)

    title_font = _load_cover_font(project_root / "assets" / "fonts" / "BIZUDPMincho-Bold.ttf", 92)
    subtitle_font = _load_cover_font(project_root / "assets" / "fonts" / "BIZUDPGothic-Regular.ttf", 44)
    conference_font = _load_cover_font(project_root / "assets" / "fonts" / "BIZUDPGothic-Regular.ttf", 38)
    credit_font = _load_cover_font(project_root / "assets" / "fonts" / "BIZUDPGothic-Regular.ttf", 34)

    insert_pages = raksul_settings.get("body_insert_pages", {})
    if kind == "front":
        front = insert_pages.get("front", {})
        lines = [
            str(front.get("title") or ""),
            str(front.get("subtitle") or ""),
            str(front.get("conference_name") or ""),
            str(front.get("dates_en") or ""),
        ]
        text = "\n".join(line for line in lines if line.strip())
        text_image = Image.new("RGBA", (paper_width_px, paper_height_px), (0, 0, 0, 0))
        text_draw = ImageDraw.Draw(text_image)
        title = str(front.get("title") or "")
        subtitle = str(front.get("subtitle") or "")
        conference_name = str(front.get("conference_name") or "")
        dates_en = str(front.get("dates_en") or "")
        segments = [
            (title, title_font, "white", 18),
            (subtitle, subtitle_font, "white", 14),
            (conference_name, conference_font, "white", 10),
            (dates_en, conference_font, "white", 0),
        ]
        heights = []
        max_width = 0
        for text_value, font, _fill, spacing_after in segments:
            bbox = text_draw.textbbox((0, 0), text_value, font=font)
            width = bbox[2] - bbox[0]
            height = bbox[3] - bbox[1]
            heights.append((text_value, font, spacing_after, width, height))
            max_width = max(max_width, width)
        total_height = sum(item[4] + item[2] for item in heights)
        start_y = (paper_height_px - total_height) / 2
        current_y = start_y
        for text_value, font, spacing_after, width, height in heights:
            draw.text(((paper_width_px - width) / 2, current_y), text_value, font=font, fill="white")
            current_y += height + spacing_after
    else:
        back = insert_pages.get("back", {})
        lines = [str(line) for line in back.get("lines", []) if str(line).strip()]
        bottom_block = "\n".join(lines)
        bbox = draw.multiline_textbbox((0, 0), bottom_block, font=credit_font, spacing=14, align="left")
        block_height = bbox[3] - bbox[1]
        block_x = safe_offset_px + mm_to_pixels(12, dpi)
        block_y = paper_height_px - block_height - safe_offset_px - mm_to_pixels(6, dpi)
        draw.multiline_text((block_x, block_y), bottom_block, font=credit_font, fill="white", spacing=14, align="left")

    image_bytes = BytesIO()
    canvas.save(image_bytes, format="PNG")
    page.insert_image(page.rect, stream=image_bytes.getvalue(), keep_proportion=False)


def render_raksul_cover_pdf(
    output_pdf_path: Path,
    raksul_settings: Dict[str, Any],
    assets: Dict[str, Optional[Path]],
    side: str,
) -> bool:
    try:
        import fitz
        from PIL import Image, ImageDraw
    except Exception as e:
        print(f"✗ 製本用表紙描画失敗: Pillow or fitz unavailable ({e})")
        return False

    project_root = Path(__file__).parent.parent
    navy = "#" + normalize_hex_color(raksul_settings.get("cover", {}).get("palette", {}).get("navy"))
    dpi = 300
    paper_width_px = mm_to_pixels(
        2 * raksul_settings["trim_width_mm"] + 2 * raksul_settings["bleed_mm"] + float(raksul_settings["spine_width_mm"]),
        dpi,
    )
    paper_height_px = mm_to_pixels(raksul_settings["paper_height_mm"], dpi)
    panel_width_px = mm_to_pixels(raksul_settings["trim_width_mm"] + raksul_settings["bleed_mm"], dpi)
    spine_width_px = mm_to_pixels(raksul_settings["spine_width_mm"], dpi)
    canvas = Image.new("RGB", (paper_width_px, paper_height_px), color=navy)
    draw = ImageDraw.Draw(canvas)

    mincho_regular = _load_cover_font(project_root / "assets" / "fonts" / "BIZUDPMincho-Regular.ttf", 72)
    mincho_bold_large = _load_cover_font(project_root / "assets" / "fonts" / "BIZUDPMincho-Bold.ttf", 110)
    mincho_bold_spine = _load_cover_font(project_root / "assets" / "fonts" / "BIZUDPMincho-Bold.ttf", max(34, int(spine_width_px * 0.55)))
    gothic_regular = _load_cover_font(project_root / "assets" / "fonts" / "BIZUDPGothic-Regular.ttf", 56)
    gothic_small = _load_cover_font(project_root / "assets" / "fonts" / "BIZUDPGothic-Regular.ttf", 44)
    gothic_spine = _load_cover_font(project_root / "assets" / "fonts" / "BIZUDPGothic-Regular.ttf", max(16, int(spine_width_px * 0.18)))

    if side == "outer":
        back_cover = assets.get("back_cover")
        front_cover = assets.get("front_cover")
        if back_cover is None or front_cover is None:
            return False
        canvas.paste(_fit_cover_image(back_cover, panel_width_px, paper_height_px), (0, 0))
        canvas.paste(
            _fit_cover_image(front_cover, panel_width_px, paper_height_px),
            (panel_width_px + spine_width_px, 0),
        )
        draw.rectangle(
            [(panel_width_px, 0), (panel_width_px + spine_width_px, paper_height_px)],
            fill=navy,
        )
    else:
        # Keep cover_inner intentionally blank: navy stock only, no text or marks.
        pass

    image_bytes = BytesIO()
    canvas.save(image_bytes, format="PNG")
    image_stream = image_bytes.getvalue()
    pdf = fitz.open()
    page = pdf.new_page(
        width=mm_to_points(2 * raksul_settings["trim_width_mm"] + 2 * raksul_settings["bleed_mm"] + float(raksul_settings["spine_width_mm"])),
        height=mm_to_points(raksul_settings["paper_height_mm"]),
    )
    page.insert_image(page.rect, stream=image_stream, keep_proportion=False)
    output_pdf_path.parent.mkdir(parents=True, exist_ok=True)
    pdf.save(str(output_pdf_path), garbage=4, deflate=True)
    pdf.close()
    return True


def _parse_xref_ref(raw_value: str) -> Optional[int]:
    if not raw_value:
        return None
    match = re.match(r"(\d+)\s+\d+\s+R", raw_value)
    return int(match.group(1)) if match else None


def _parse_first_xref_from_array(raw_value: str) -> Optional[int]:
    if not raw_value:
        return None
    match = re.search(r"(\d+)\s+\d+\s+R", raw_value)
    return int(match.group(1)) if match else None


def collect_font_embedding_issues(pdf_path: Path) -> List[str]:
    try:
        import fitz
    except Exception:
        return ["fitz unavailable"]

    doc = fitz.open(str(pdf_path))
    issues: List[str] = []
    seen_xrefs = set()
    try:
        for page in doc:
            for font in page.get_fonts(full=True):
                font_xref = font[0]
                if not isinstance(font_xref, int) or font_xref <= 0 or font_xref in seen_xrefs:
                    continue
                seen_xrefs.add(font_xref)
                name = font[3] if len(font) > 3 else f"xref:{font_xref}"
                descriptor = doc.xref_get_key(font_xref, "FontDescriptor")
                descriptor_xref = _parse_xref_ref(descriptor[1]) if descriptor and len(descriptor) > 1 else None
                if not descriptor_xref:
                    descendants = doc.xref_get_key(font_xref, "DescendantFonts")
                    descendant_xref = _parse_first_xref_from_array(descendants[1]) if descendants and len(descendants) > 1 else None
                    if descendant_xref:
                        descendant_descriptor = doc.xref_get_key(descendant_xref, "FontDescriptor")
                        descriptor_xref = _parse_xref_ref(descendant_descriptor[1]) if descendant_descriptor and len(descendant_descriptor) > 1 else None
                embedded = False
                if descriptor_xref:
                    for key in ("FontFile", "FontFile2", "FontFile3"):
                        descriptor_key = doc.xref_get_key(descriptor_xref, key)
                        if descriptor_key and descriptor_key[0] != "null":
                            embedded = True
                            break
                if not embedded:
                    issues.append(str(name))
        return issues
    finally:
        doc.close()


def collect_small_text_warnings(pdf_path: Path, min_size_pt: float = 6.0) -> List[str]:
    try:
        import fitz
    except Exception:
        return []

    doc = fitz.open(str(pdf_path))
    warnings: List[str] = []
    try:
        for page_index, page in enumerate(doc, start=1):
            blocks = page.get_text("dict").get("blocks", [])
            for block in blocks:
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        size = span.get("size", 0)
                        text = (span.get("text", "") or "").strip()
                        if size and size < min_size_pt and text:
                            warnings.append(f"page {page_index}: text below 6pt ({size:.2f}pt) -> {text[:40]}")
                            if len(warnings) >= 20:
                                return warnings
        return warnings
    finally:
        doc.close()


def collect_raksul_body_insert_page_issues(pdf_path: Path, expected_page_count: int) -> List[str]:
    try:
        import fitz
    except Exception as e:
        return [f"failed to inspect insert pages: {e}"]

    issues: List[str] = []
    doc = fitz.open(str(pdf_path))
    try:
        if doc.page_count != expected_page_count:
            return issues
        first_page = doc.load_page(0)
        last_page = doc.load_page(doc.page_count - 1)
        if not page_is_exact_fullpage_image(first_page):
            issues.append("front insert page is not an exact full-page image page")
        if not page_is_exact_fullpage_image(last_page):
            issues.append("back insert page is not an exact full-page image page")
    finally:
        doc.close()
    return issues


def collect_thin_line_warnings(pdf_path: Path, min_width_pt: float = 0.3) -> List[str]:
    try:
        import fitz
    except Exception:
        return []

    doc = fitz.open(str(pdf_path))
    warnings: List[str] = []
    try:
        for page_index, page in enumerate(doc, start=1):
            for drawing in page.get_drawings():
                width = drawing.get("width")
                if width is not None and width < min_width_pt:
                    warnings.append(f"page {page_index}: line width below 0.3pt ({width:.2f}pt)")
                    if len(warnings) >= 20:
                        return warnings
        return warnings
    finally:
        doc.close()


def inspect_raster_asset(path: Path, role: str, target_width_mm: float, target_height_mm: float) -> Dict[str, Any]:
    report = {
        "role": role,
        "path": _to_project_relative_path(path),
        "target_width_mm": target_width_mm,
        "target_height_mm": target_height_mm,
        "errors": [],
        "warnings": [],
    }
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        report["warnings"].append("PDF asset skipped for DPI / color-space inspection")
        return report

    try:
        from PIL import Image
    except Exception as e:
        report["errors"].append(f"Pillow unavailable: {e}")
        return report

    try:
        with Image.open(path) as image:
            width_px, height_px = image.size
            width_in = target_width_mm / 25.4
            height_in = target_height_mm / 25.4
            dpi_x = width_px / width_in if width_in else 0
            dpi_y = height_px / height_in if height_in else 0
            effective_dpi = min(dpi_x, dpi_y)
            report["pixel_size"] = {"width": width_px, "height": height_px}
            report["effective_dpi"] = round(effective_dpi, 2)
            report["color_mode"] = image.mode
            if effective_dpi < 350:
                report["warnings"].append(f"effective DPI below 350ppi ({effective_dpi:.2f})")
            if image.mode != "CMYK":
                report["warnings"].append(f"asset color mode is {image.mode}; CMYK recommended")
    except Exception as e:
        report["errors"].append(f"failed to inspect raster asset: {e}")
    return report


def collect_pdf_box_issues(
    pdf_path: Path,
    expected_pages: Optional[int],
    paper_width_mm: float,
    paper_height_mm: float,
    trim_width_mm: float,
    trim_height_mm: float,
    trim_offset_x_mm: float,
    trim_offset_y_mm: float,
) -> List[str]:
    try:
        import fitz
    except Exception as e:
        return [f"fitz unavailable: {e}"]

    tolerance = mm_to_points(0.5)
    doc = fitz.open(str(pdf_path))
    issues: List[str] = []
    try:
        if expected_pages is not None and doc.page_count != expected_pages:
            issues.append(f"page count mismatch: expected {expected_pages}, got {doc.page_count}")

        expected_paper_width = mm_to_points(paper_width_mm)
        expected_paper_height = mm_to_points(paper_height_mm)
        expected_trim = (
            mm_to_points(trim_offset_x_mm),
            mm_to_points(trim_offset_y_mm),
            mm_to_points(trim_offset_x_mm + trim_width_mm),
            mm_to_points(trim_offset_y_mm + trim_height_mm),
        )

        for page_index, page in enumerate(doc, start=1):
            rect = page.rect
            if abs(rect.width - expected_paper_width) > tolerance or abs(rect.height - expected_paper_height) > tolerance:
                issues.append(
                    f"page {page_index}: MediaBox mismatch ({rect.width / POINTS_PER_MM:.2f} x {rect.height / POINTS_PER_MM:.2f} mm)"
                )
                break
            trimbox = page.trimbox
            if trimbox is None:
                issues.append(f"page {page_index}: TrimBox missing")
                break
            actual_trim = (trimbox.x0, trimbox.y0, trimbox.x1, trimbox.y1)
            if any(abs(actual_trim[idx] - expected_trim[idx]) > tolerance for idx in range(4)):
                issues.append(
                    f"page {page_index}: TrimBox mismatch ({trimbox.x0 / POINTS_PER_MM:.2f},{trimbox.y0 / POINTS_PER_MM:.2f},{trimbox.x1 / POINTS_PER_MM:.2f},{trimbox.y1 / POINTS_PER_MM:.2f} mm)"
                )
                break
        return issues
    finally:
        doc.close()


def build_raksul_preflight_report(
    raksul_settings: Dict[str, Any],
    body_pdf: Path,
    cover_outer_pdf: Path,
    cover_inner_pdf: Path,
    assets: Dict[str, Optional[Path]],
) -> Dict[str, Any]:
    report: Dict[str, Any] = {
        "generated_at": datetime.now().isoformat(),
        "success": True,
        "final_ready": False,
        "settings": raksul_settings,
        "outputs": {
            "body": str(body_pdf),
            "cover_outer": str(cover_outer_pdf),
            "cover_inner": str(cover_inner_pdf),
        },
        "errors": [],
        "warnings": [],
        "checks": {},
        "assets": [],
    }
    final_ready = True

    for label, pdf_path, expected_pages, paper_width_mm, paper_height_mm, trim_width_mm, trim_height_mm, offset_x_mm, offset_y_mm in [
        (
            "body",
            body_pdf,
            raksul_settings["body_pages"],
            raksul_settings["paper_width_mm"],
            raksul_settings["paper_height_mm"],
            raksul_settings["trim_width_mm"],
            raksul_settings["trim_height_mm"],
            raksul_settings["bleed_mm"],
            raksul_settings["bleed_mm"],
        ),
        (
            "cover_outer",
            cover_outer_pdf,
            1,
            2 * raksul_settings["trim_width_mm"] + 2 * raksul_settings["bleed_mm"] + float(raksul_settings.get("spine_width_mm") or 0),
            raksul_settings["paper_height_mm"],
            2 * raksul_settings["trim_width_mm"] + float(raksul_settings.get("spine_width_mm") or 0),
            raksul_settings["trim_height_mm"],
            raksul_settings["bleed_mm"],
            raksul_settings["bleed_mm"],
        ),
        (
            "cover_inner",
            cover_inner_pdf,
            1,
            2 * raksul_settings["trim_width_mm"] + 2 * raksul_settings["bleed_mm"] + float(raksul_settings.get("spine_width_mm") or 0),
            raksul_settings["paper_height_mm"],
            2 * raksul_settings["trim_width_mm"] + float(raksul_settings.get("spine_width_mm") or 0),
            raksul_settings["trim_height_mm"],
            raksul_settings["bleed_mm"],
            raksul_settings["bleed_mm"],
        ),
    ]:
        pdf_errors: List[str] = []
        pdf_warnings: List[str] = []
        if not pdf_path.exists():
            pdf_errors.append("output missing")
        else:
            box_issues = collect_pdf_box_issues(
                pdf_path,
                expected_pages,
                paper_width_mm,
                paper_height_mm,
                trim_width_mm,
                trim_height_mm,
                offset_x_mm,
                offset_y_mm,
            )
            pdf_errors.extend(box_issues)
            if label == "body":
                pdf_errors.extend(collect_raksul_body_insert_page_issues(pdf_path, expected_pages))
            font_issues = collect_font_embedding_issues(pdf_path)
            if font_issues:
                pdf_errors.append(f"fonts not embedded: {', '.join(font_issues[:10])}")
            try:
                import fitz
                doc = fitz.open(str(pdf_path))
                try:
                    if doc.is_encrypted or doc.needs_pass:
                        pdf_errors.append("encrypted PDF")
                finally:
                    doc.close()
            except Exception as e:
                pdf_errors.append(f"failed to inspect encryption state: {e}")

            pdf_warnings.extend(collect_small_text_warnings(pdf_path))
            pdf_warnings.extend(collect_thin_line_warnings(pdf_path))

        report["checks"][label] = {
            "errors": pdf_errors,
            "warnings": pdf_warnings,
        }
        report["errors"].extend([f"{label}: {issue}" for issue in pdf_errors])
        report["warnings"].extend([f"{label}: {issue}" for issue in pdf_warnings])

    panel_width_mm = raksul_settings["trim_width_mm"] + raksul_settings["bleed_mm"]
    for role, path in assets.items():
        if path is None:
            if role in {"front_cover", "back_cover"}:
                report["errors"].append(f"asset missing: {role}")
                report["assets"].append({"role": role, "path": "", "errors": ["missing required asset"], "warnings": []})
            continue
        asset_report = inspect_raster_asset(path, role, panel_width_mm, raksul_settings["paper_height_mm"])
        report["assets"].append(asset_report)
        report["errors"].extend([f"{role}: {issue}" for issue in asset_report["errors"]])
        report["warnings"].extend([f"{role}: {issue}" for issue in asset_report["warnings"]])

    spine_width_source = raksul_settings.get("spine_width_source", "estimated")
    report["checks"]["spine_width"] = {
        "spine_width_mm": raksul_settings.get("spine_width_mm"),
        "source": spine_width_source,
        "warnings": [],
    }
    if spine_width_source != "template":
        warning = f"spine width is using an {spine_width_source} value; replace with the order template width before final submission"
        report["checks"]["spine_width"]["warnings"].append(warning)
        report["warnings"].append(f"spine_width: {warning}")
        final_ready = False

    report["success"] = len(report["errors"]) == 0
    report["final_ready"] = report["success"] and final_ready
    return report


def write_raksul_preflight_report(report: Dict[str, Any]) -> Path:
    report_path = CONFIG["pdf_raksul_dir"] / RAKSUL_PREFLIGHT_FILENAME
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    return report_path

def generate_footer_config():
    """フッター設定ファイル (meta/latex/footer-config.tex) を生成"""
    settings = load_settings()
    
    # 設定からフッター文字を取得（デフォルト値付き）
    footer_text_print = settings.get('pdf', {}).get('footer_text', '© 2025 AJMUN - 印刷版')
    footer_text_pc = settings.get('pdf', {}).get('footer_text_pc', footer_text_print)
    
    # PC版フッター文字が設定されていない場合は印刷版と同じにする
    if not footer_text_pc or footer_text_pc == footer_text_print:
        footer_text_pc = settings.get('pdf', {}).get('footer_text', '© 2025 AJMUN - PC版')
    
    # LaTeX用にエスケープ
    def escape_latex(text):
        # LaTeXの特殊文字をエスケープ（置換順序を調整）
        # 先に{と}をエスケープしてから\を処理
        text = text.replace('{', '\\{').replace('}', '\\}')
        text = text.replace('\\', '\\textbackslash{}')
        text = text.replace('&', '\\&').replace('%', '\\%').replace('$', '\\$')
        text = text.replace('#', '\\#').replace('_', '\\_')
        text = text.replace('~', '\\textasciitilde{}').replace('^', '\\textasciicircum{}')
        return text
    
    footer_text_print_escaped = escape_latex(footer_text_print)
    footer_text_pc_escaped = escape_latex(footer_text_pc)
    
    # meta/latexディレクトリを作成
    meta_latex_dir = Path('meta/latex')
    meta_latex_dir.mkdir(parents=True, exist_ok=True)
    
    # footer-config.texを生成
    footer_config_path = meta_latex_dir / 'footer-config.tex'
    try:
        with open(footer_config_path, 'w', encoding='utf-8') as f:
            f.write(f"\\renewcommand{{\\footertextprint}}{{{footer_text_print_escaped}}}\n")
            f.write(f"\\renewcommand{{\\footertextpc}}{{{footer_text_pc_escaped}}}\n")
        print(f"✓ フッター設定ファイルを生成しました: {footer_config_path}")
        print(f"  印刷版: {footer_text_print}")
        print(f"  PC版: {footer_text_pc}")
        return True
    except Exception as e:
        print(f"✗ フッター設定ファイルの生成に失敗しました: {e}")
        return False

def get_content_files():
    """コンテンツファイル一覧取得"""
    files = []
    
    # QMDファイル
    qmd_files = list(CONFIG['content_dir'].glob('*.qmd'))
    files.extend(qmd_files)
    
    # MDファイル
    md_files = list(CONFIG['content_dir'].glob('*.md'))
    files.extend(md_files)
    
    return sorted(files, key=lambda x: x.name)

def generate_pdf_with_lualatex(file_path, output_path):
    """LuaLaTeXでPDF生成"""
    print(f"LuaLaTeXでPDF生成: {file_path}")
    
    cmd = [
        'quarto', 'render', str(file_path),
        '--to', 'pdf',
        # Quartoは --output にパスを取れないため、出力ディレクトリを指定してファイル名はデフォルトに任せる
        '--output-dir', str(output_path.parent),
    ]
    
    try:
        rc, stdout, stderr, timed_out = run_command_with_timeout(
            cmd,
            timeout=300,  # 5分タイムアウト
        )
        if timed_out:
            print("✗ タイムアウト")
            return False
        if rc == 0:
            print(f"✓ PDF生成完了: {output_path}")
            return True
        else:
            print(f"✗ エラー: {stderr}")
            return False
            
    except Exception as e:
        print(f"✗ 例外: {e}")
        return False

def render_pdf_profile(out_dir: Path, profile: Optional[str] = None, label: str = "default") -> bool:
    """PDF生成を実行し、生成されたPDFを指定ディレクトリにコピー"""
    import shutil

    ensure_pdf_project_index()
    ensure_pdf_project_tail()
    ensure_pdf_project_runtime_assets()
    refresh_fullpage_latex_config()
    cleanup_intermediate_pdf_artifacts()

    # Pass 1 では rail-computed を使わず純粋にマーカー収集する。
    # 前回の壊れた計算ファイルが残っていると Pass 1 で読み込まれて失敗するため、
    # 先に削除しておく。
    for stale_path in sorted(PDF_PROJECT_DIR.glob('*-rail-computed.tex')):
        try:
            stale_path.unlink()
            print(f"  removed stale rail data: {stale_path.name}")
        except Exception as e:
            print(f"  ⚠ stale rail data cleanup failed ({stale_path.name}): {e}")

    # === Footer Config Generation ===
    print("\n=== フッター設定生成 ===")
    generate_footer_config()
    
    project_target = str(PDF_PROJECT_DIR)
    out_dir.mkdir(parents=True, exist_ok=True)
    
    # Quartoのbookプロジェクトは--output-dirを無視してプロジェクト内のoutに出力するため、
    # まずプロジェクト内で生成してからコピーする
    cmd = [
        'quarto', 'render',
        project_target,
        '--to', 'pdf',
    ]
    if profile:
        cmd.extend(['--profile', profile])

    print(f"LuaLaTeXでPDF生成（{label}）: {' '.join(cmd)}")
    env = build_pdf_env()
    try:
        rc, stdout, stderr, timed_out = run_command_with_timeout(
            cmd,
            timeout=PDF_RENDER_TIMEOUT,  # book全体なので長めに取る
            env=env,
        )
        if timed_out:
            print(f"✗ タイムアウト（{label}）")
            return False
        if rc == 0:
            # PDFファイルをプロジェクトのout/から指定ディレクトリにコピー
            pdf_project_out = PDF_PROJECT_DIR / 'out'
            pdf_files = list(pdf_project_out.glob('*.pdf'))
            if pdf_files:
                for pdf_file in pdf_files:
                    dest_path = out_dir / pdf_file.name
                    shutil.copy2(pdf_file, dest_path)
                    print(f"  コピー: {pdf_file} -> {dest_path}")
            print(f"✓ PDF生成完了（{label}） -> {out_dir}")
            return True
        else:
            print(f"✗ エラー（{label}）: {stderr}")
            # デバッグ用にstdoutも表示
            if stdout:
                print(f"  stdout: {stdout[:500]}")
            return False
    except Exception as e:
        print(f"✗ 例外（{label}）: {e}")
        return False


def render_book_to_latex(project_target: str, profile: str, label: str, env: dict) -> bool:
    """Render the Quarto book project with the PDF target so PDF metadata is preserved."""
    cmd = ['quarto', 'render', project_target, '--to', 'pdf', '--profile', profile]
    print(f"QuartoでPDF生成（{label}）: {' '.join(cmd)}")
    try:
        rc, stdout, stderr, timed_out = run_command_with_timeout(
            cmd,
            timeout=PDF_RENDER_TIMEOUT,
            env=env,
        )
        if timed_out:
            print(f"✗ {label} タイムアウト")
            return False
        if rc != 0:
            print(f"✗ {label} エラー: {stderr[:500]}")
            if stdout:
                print(f"  stdout: {stdout[:500]}")
            return False
        print(f"✓ {label} 完了")
        return True
    except Exception as e:
        print(f"✗ {label} 例外: {e}")
        return False


def find_book_tex_file(profile: str = 'print') -> Optional[Path]:
    if profile == 'pc':
        possible_paths = [
            PDF_PROJECT_DIR / 'out_pc' / '平和への課題：補遺.tex',
            PDF_PROJECT_DIR / 'out_pc' / 'index.tex',
            PDF_PROJECT_DIR / 'out_pc' / 'book-latex' / '平和への課題：補遺.tex',
            PDF_PROJECT_DIR / 'out_pc' / 'book-latex' / 'index.tex',
            PDF_PROJECT_DIR / 'pdf_build' / 'out_pc' / '平和への課題：補遺.tex',
            PDF_PROJECT_DIR / 'pdf_build' / 'out_pc' / 'index.tex',
            PDF_PROJECT_DIR / 'pdf_build' / 'out_pc' / 'book-latex' / '平和への課題：補遺.tex',
            PDF_PROJECT_DIR / 'pdf_build' / 'out_pc' / 'book-latex' / 'index.tex',
            PDF_PROJECT_DIR / '平和への課題：補遺.tex',
            PDF_PROJECT_DIR / 'index.tex',
        ]
    elif profile == RAKSUL_PROFILE_NAME:
        possible_paths = [
            PDF_PROJECT_DIR / 'out_raksul' / '平和への課題：補遺.tex',
            PDF_PROJECT_DIR / 'out_raksul' / 'index.tex',
            PDF_PROJECT_DIR / 'out_raksul' / 'book-latex' / '平和への課題：補遺.tex',
            PDF_PROJECT_DIR / 'out_raksul' / 'book-latex' / 'index.tex',
            PDF_PROJECT_DIR / 'index.tex',
            PDF_PROJECT_DIR / '平和への課題：補遺.tex',
        ]
    elif profile == RAKSUL_BODY_SOURCE_PROFILE_NAME:
        possible_paths = [
            PDF_PROJECT_DIR / 'out_raksul_source' / '平和への課題：補遺.tex',
            PDF_PROJECT_DIR / 'out_raksul_source' / 'index.tex',
            PDF_PROJECT_DIR / 'out_raksul_source' / 'book-latex' / '平和への課題：補遺.tex',
            PDF_PROJECT_DIR / 'out_raksul_source' / 'book-latex' / 'index.tex',
            PDF_PROJECT_DIR / 'index.tex',
            PDF_PROJECT_DIR / '平和への課題：補遺.tex',
        ]
    else:
        possible_paths = [
            PDF_PROJECT_DIR / 'index.tex',
            PDF_PROJECT_DIR / '平和への課題：補遺.tex',
            PDF_PROJECT_DIR / 'out' / '平和への課題：補遺.tex',
            PDF_PROJECT_DIR / 'out' / 'index.tex',
            PDF_PROJECT_DIR / 'out' / 'book-latex' / '平和への課題：補遺.tex',
            PDF_PROJECT_DIR / 'out' / 'book-latex' / 'index.tex',
            PDF_PROJECT_DIR / 'out_pc' / '平和への課題：補遺.tex',
            PDF_PROJECT_DIR / 'out_pc' / 'index.tex',
            PDF_PROJECT_DIR / 'out_pc' / 'book-latex' / '平和への課題：補遺.tex',
            PDF_PROJECT_DIR / 'out_pc' / 'book-latex' / 'index.tex',
        ]
    for path in possible_paths:
        if path.exists():
            return path
    for path in sorted(PDF_PROJECT_DIR.glob('**/*.tex')):
        if path.name in {'index.tex', '平和への課題：補遺.tex'}:
            return path
    return None


def get_profile_pdf_dirs(profile: str) -> List[Path]:
    if profile == 'pc':
        return [
            PDF_PROJECT_DIR / 'out_pc',
            PDF_PROJECT_DIR / 'pdf_build' / 'out_pc',
        ]
    if profile == RAKSUL_PROFILE_NAME:
        return [
            PDF_PROJECT_DIR / 'out_raksul',
            PDF_PROJECT_DIR / 'pdf_build' / 'out_raksul',
        ]
    if profile == RAKSUL_BODY_SOURCE_PROFILE_NAME:
        return [
            PDF_PROJECT_DIR / 'out_raksul_source',
            PDF_PROJECT_DIR / 'pdf_build' / 'out_raksul_source',
        ]
    return [
        PDF_PROJECT_DIR / 'out',
        PDF_PROJECT_DIR,
    ]


def get_enabled_tail_images(
    placements: Optional[List[str]] = None,
    exclude_types: Optional[List[str]] = None,
) -> List[dict]:
    config_path = Path('config/fullpage_images.json')
    if not config_path.exists():
        return []
    try:
        config = json.loads(config_path.read_text(encoding='utf-8'))
    except Exception:
        return []

    placement_order = {'after_content': 0, 'after_appendices': 1}
    placement_filter = set(placements) if placements else set(placement_order.keys())
    excluded_types = set(exclude_types or [])
    tail_images = [
        img for img in config.get('images', [])
        if img.get('enabled')
        and img.get('position', {}).get('placement') in placement_order
        and img.get('position', {}).get('placement') in placement_filter
        and str(img.get('type', '') or '') not in excluded_types
    ]
    tail_images.sort(key=lambda img: (placement_order[img['position']['placement']], img.get('order', 0)))
    return tail_images


def get_enabled_front_images() -> List[dict]:
    config_path = Path('config/fullpage_images.json')
    if not config_path.exists():
        return []
    try:
        config = json.loads(config_path.read_text(encoding='utf-8'))
    except Exception:
        return []

    front_images = [
        img for img in config.get('images', [])
        if img.get('enabled')
        and img.get('position', {}).get('placement') == 'before_toc'
        and str(img.get('type', '') or '') == 'cover_front'
    ]
    front_images.sort(key=lambda img: img.get('order', 0))
    return front_images


def pdf_has_navigation_rail(pdf_path: Path) -> bool:
    """Backward-compatible alias for rail validation."""
    return pdf_has_valid_rail(pdf_path)


def load_rail_chapter_data(base_dir: Optional[Path] = None) -> dict:
    base_dir = base_dir or PDF_PROJECT_DIR
    computed_path = base_dir / 'index-rail-computed.tex'
    data = {'total_pages': 0, 'chapters': []}
    if not computed_path.exists():
        raildata_candidates = [
            base_dir / 'index.raildata',
            base_dir / f'{PDF_BOOK_FILENAME.removesuffix(".pdf")}.raildata',
        ]
        raildata_candidates.extend(sorted(base_dir.glob('*.raildata')))
        for raildata_path in raildata_candidates:
            if not raildata_path.exists():
                continue
            try:
                from scripts.parse_raildata import parse_raildata, compute_chapter_ranges

                parsed = parse_raildata(raildata_path)
                chapters = compute_chapter_ranges(parsed)
                return {
                    'total_pages': parsed.get('total_pages', 0),
                    'chapters': chapters,
                }
            except Exception:
                continue
        return data

    text = computed_path.read_text(encoding='utf-8')
    total_match = re.search(r'\\def\\RailTotalPages\{(\d+)\}', text)
    if total_match:
        data['total_pages'] = int(total_match.group(1))

    chapter_count_match = re.search(r'\\def\\RailChapterCount\{(\d+)\}', text)
    chapter_count = int(chapter_count_match.group(1)) if chapter_count_match else 0

    for idx in range(1, chapter_count + 1):
        start_match = re.search(rf'\\expandafter\\def\\csname RailChapter{idx}Start\\endcsname\{{(\d+)\}}', text)
        end_match = re.search(rf'\\expandafter\\def\\csname RailChapter{idx}End\\endcsname\{{(\d+)\}}', text)
        count_match = re.search(rf'\\expandafter\\def\\csname RailChapter{idx}Count\\endcsname\{{(\d+)\}}', text)
        if not start_match or not end_match or not count_match:
            continue
        data['chapters'].append({
            'index': idx,
            'start': int(start_match.group(1)),
            'end': int(end_match.group(1)),
            'count': int(count_match.group(1)),
        })
    return data


def overlay_navigation_rail(
    pdf_path: Path,
    profile: str,
    binding: Optional[str] = None,
    rail_data: Optional[dict] = None,
    suppress_pages: Optional[set[int]] = None,
):
    """Repair visible navigation rails at export time when LaTeX shipout positioning is unstable."""
    rail_data = rail_data or load_rail_chapter_data()
    chapters = rail_data.get('chapters', [])
    if not chapters or not pdf_path.exists():
        return

    try:
        import fitz
    except Exception as e:
        print(f"⚠ レール補正をスキップしました (fitz unavailable): {e}")
        return

    active_color = RAIL_ACTIVE_COLOR
    inactive_color = RAIL_INACTIVE_COLOR
    cursor_color = RAIL_CURSOR_COLOR
    divider_color = RAIL_DIVIDER_COLOR
    rail_width = 5 * 72 / 25.4  # 5mm
    divider_width = 0.8
    cursor_width = 3.0
    tail_count = len(get_enabled_tail_images())
    resolved_binding = str(binding or resolve_rail_binding(profile) or 'left').strip().lower()

    doc = fitz.open(str(pdf_path))
    try:
        total_pages = rail_data.get('total_pages') or doc.page_count
        first_chapter_start = chapters[0]['start']
        content_pages = max(1, total_pages - first_chapter_start + 1)
        chapter_segments = []
        accumulated = 0.0
        for idx, chapter in enumerate(chapters, start=1):
            ratio = max(0.0, min(1.0, chapter['count'] / content_pages))
            start_ratio = accumulated
            end_ratio = 1.0 if idx == len(chapters) else max(0.0, min(1.0, accumulated + ratio))
            chapter_segments.append((chapter, start_ratio, end_ratio))
            accumulated = end_ratio

        page_limit = max(int(chapter.get('end', 0)) for chapter in chapters)
        if tail_count > 0 and pdf_has_fullpage_tail_images(pdf_path, tail_count):
            page_limit = max(0, doc.page_count - tail_count)
        for page_index in range(doc.page_count):
            physical_page = page_index + 1

            page = doc.load_page(page_index)
            if not page_should_draw_rail(page, profile, physical_page, first_chapter_start, page_limit, suppress_pages=suppress_pages):
                continue

            rail_on_right = rail_is_on_right(profile, resolved_binding, physical_page)
            x0, x1, y_anchor0, y_anchor1 = resolve_rail_band(page, profile, rail_on_right, rail_width)
            anchor_height = y_anchor1 - y_anchor0

            active_index = None
            active_segment = None
            for chapter in chapters:
                if chapter['start'] <= physical_page <= chapter['end']:
                    active_index = chapter['index']
                    break

            shape = page.new_shape()

            # For raksul: fill top/bottom bleed areas with first/last chapter colors
            if profile == RAKSUL_PROFILE_NAME:
                media_rect = page.rect
                first_chapter_color = active_color if chapters[0]['index'] == active_index else inactive_color
                last_chapter_color = active_color if chapters[-1]['index'] == active_index else inactive_color
                # Top bleed extension
                if media_rect.y0 < y_anchor0:
                    shape.draw_rect(fitz.Rect(x0, media_rect.y0, x1, y_anchor0))
                    shape.finish(color=None, fill=first_chapter_color)
                # Bottom bleed extension
                if media_rect.y1 > y_anchor1:
                    shape.draw_rect(fitz.Rect(x0, y_anchor1, x1, media_rect.y1))
                    shape.finish(color=None, fill=last_chapter_color)

            for idx, (chapter, start_ratio, end_ratio) in enumerate(chapter_segments, start=1):
                y0 = y_anchor0 + anchor_height * start_ratio
                y1 = y_anchor0 + anchor_height * end_ratio
                shape.draw_rect(fitz.Rect(x0, y0, x1, y1))
                shape.finish(
                    color=None,
                    fill=active_color if chapter['index'] == active_index else inactive_color,
                )
                if idx > 1:
                    shape.draw_line(fitz.Point(x0, y0), fitz.Point(x1, y0))
                    shape.finish(color=divider_color, width=divider_width)
                if chapter['index'] == active_index:
                    active_segment = (chapter, start_ratio)

            if active_segment is not None:
                chapter, start_ratio = active_segment
                if chapter['count'] > 0:
                    chapter_height_ratio = max(0.0, min(1.0, chapter['count'] / content_pages))
                    cursor_ratio = max(
                        0.0,
                        min(
                            1.0,
                            start_ratio + ((physical_page - chapter['start']) / chapter['count']) * chapter_height_ratio,
                        ),
                    )
                else:
                    cursor_ratio = start_ratio
                cursor_y = y_anchor0 + anchor_height * cursor_ratio
                shape.draw_line(fitz.Point(x0, cursor_y), fitz.Point(x1, cursor_y))
                shape.finish(color=cursor_color, width=cursor_width)
            shape.commit(overlay=True)

        tmp_path = pdf_path.with_suffix('.railfix.pdf')
        doc.save(str(tmp_path), garbage=4, deflate=True)
        doc.close()
        tmp_path.replace(pdf_path)
        print(f"✓ レール補正: {pdf_path}")
    except Exception as e:
        doc.close()
        print(f"⚠ レール補正に失敗しました ({pdf_path}): {e}")


def find_generated_book_pdf(profile: str) -> Optional[Path]:
    candidates: List[Path] = []
    preferred_names = (PDF_BOOK_FILENAME, 'index.pdf')
    tail_count = len(get_enabled_tail_images())
    for directory in get_profile_pdf_dirs(profile):
        for name in preferred_names:
            path = directory / name
            if path.exists():
                candidates.append(path)
    if not candidates:
        return None
    valid_candidates = [
        path for path in candidates
        if pdf_has_valid_rail(path) and pdf_has_fullpage_tail_images(path, tail_count)
    ]
    ranked = valid_candidates or candidates
    return max(
        ranked,
        key=lambda path: (
            1 if pdf_has_valid_rail(path) else 0,
            1 if pdf_has_fullpage_tail_images(path, tail_count) else 0,
            path.stat().st_mtime,
            1 if path.name == PDF_BOOK_FILENAME else 0,
        ),
    )


def export_book_pdf_variants(source_pdf: Path, dest_dir: Path, label: str, profile: str, binding: Optional[str] = None):
    cleanup_final_output_dir(dest_dir)
    tail_count = len(get_enabled_tail_images())
    front_count = len(get_enabled_front_images())
    for dest_name in PUBLIC_BOOK_PDF_NAMES:
        dest_path = dest_dir / dest_name
        shutil.copy2(source_pdf, dest_path)
        print(f"  コピー: {source_pdf} -> {dest_path}")
        postprocess_boundary_fullpage_images(dest_path)
        overlay_navigation_rail(dest_path, profile, binding=binding)
        if not pdf_has_valid_rail(dest_path):
            raise RuntimeError(f"Rail validation failed: {dest_path}")
        if front_count > 0:
            try:
                import fitz
            except Exception:
                raise RuntimeError("Front cover validation failed: PyMuPDF unavailable")
            doc = fitz.open(str(dest_path))
            try:
                if doc.page_count < front_count or not all(
                    page_is_exact_fullpage_image(doc.load_page(idx))
                    for idx in range(front_count)
                ):
                    raise RuntimeError(f"Front cover validation failed: {dest_path}")
            finally:
                doc.close()
        if not pdf_has_fullpage_tail_images(dest_path, tail_count):
            raise RuntimeError(f"Tail image validation failed: {dest_path}")
    print(f"✓ {label}PDF完了 -> {dest_dir}")


def run_lualatex_on_book_tex(
    tex_path: Path,
    env: dict,
    label: str,
    pdf_dest_dir: Optional[Path] = None,
    aux_dest_path: Optional[Path] = None,
    runs: int = 2,
) -> RenderedPdfResult:
    """Run lualatex directly on an already-generated book TeX file."""
    canonical_tex_path = canonicalize_book_tex_path(tex_path)
    print(f"LuaLaTeX実行（{label}）: {canonical_tex_path}")
    try:
        result = None
        for run_index in range(max(1, runs)):
            result = subprocess.run(
                ['lualatex', '--interaction=nonstopmode', str(canonical_tex_path.name)],
                capture_output=True,
                text=True,
                timeout=600,
                cwd=str(canonical_tex_path.parent),
                env=env,
            )
            if result.returncode != 0:
                break
            if runs > 1:
                print(f"  LuaLaTeX pass {run_index + 1}/{runs} 完了")
    except subprocess.TimeoutExpired:
        print(f"✗ {label} タイムアウト")
        return RenderedPdfResult(success=False, tex_path=canonical_tex_path)
    except Exception as e:
        print(f"✗ {label} 例外: {e}")
        return RenderedPdfResult(success=False, tex_path=canonical_tex_path)

    if result is None:
        print(f"✗ {label} エラー: LuaLaTeXが実行されませんでした")
        return RenderedPdfResult(success=False, tex_path=canonical_tex_path)

    aux_source = canonical_tex_path.parent / (canonical_tex_path.stem + '.aux')
    if aux_dest_path and aux_source.exists():
        if aux_source.resolve() != aux_dest_path.resolve():
            shutil.copy2(aux_source, aux_dest_path)
            print(f"  コピー .aux: {aux_source} -> {aux_dest_path}")

    pdf_source = canonical_tex_path.parent / (canonical_tex_path.stem + '.pdf')
    pdf_dest_path = None
    if pdf_dest_dir:
        pdf_dest_dir.mkdir(parents=True, exist_ok=True)
        if pdf_source.exists():
            pdf_dest_path = pdf_dest_dir / 'index.pdf'
            if pdf_source.resolve() != pdf_dest_path.resolve():
                shutil.copy2(pdf_source, pdf_dest_path)
                print(f"  コピー PDF: {pdf_source} -> {pdf_dest_path}")

    resolved_pdf_path = None
    if pdf_dest_path and pdf_dest_path.exists():
        resolved_pdf_path = pdf_dest_path
    elif pdf_source.exists():
        resolved_pdf_path = pdf_source

    if result.returncode == 0:
        print(f"✓ {label} 完了")
        return RenderedPdfResult(
            success=True,
            pdf_path=resolved_pdf_path,
            tex_path=canonical_tex_path,
            aux_path=aux_source if aux_source.exists() else None,
        )

    if pdf_dest_dir and pdf_source.exists():
        print(f"✓ {label} 完了 (with warnings)")
        return RenderedPdfResult(
            success=True,
            pdf_path=resolved_pdf_path,
            tex_path=canonical_tex_path,
            aux_path=aux_source if aux_source.exists() else None,
        )

    print(f"✗ {label} エラー: {result.stderr[:500]}")
    return RenderedPdfResult(
        success=False,
        pdf_path=resolved_pdf_path,
        tex_path=canonical_tex_path,
        aux_path=aux_source if aux_source.exists() else None,
    )


def run_lualatex_template(
    tex_path: Path,
    env: dict,
    label: str,
    output_pdf_path: Path,
    runs: int = 1,
) -> RenderedPdfResult:
    print(f"LuaLaTeX実行（{label}）: {tex_path}")
    project_root = Path(__file__).parent.parent
    try:
        tex_arg = tex_path.resolve().relative_to(project_root.resolve())
    except Exception:
        tex_arg = tex_path
    output_dir_arg = str(tex_path.parent)
    try:
        result = None
        for run_index in range(max(1, runs)):
            result = subprocess.run(
                [
                    "lualatex",
                    "--interaction=nonstopmode",
                    f"--output-directory={output_dir_arg}",
                    str(tex_arg),
                ],
                capture_output=True,
                text=True,
                timeout=300,
                cwd=str(project_root),
                env=env,
            )
            if result.returncode != 0:
                break
            if runs > 1:
                print(f"  LuaLaTeX pass {run_index + 1}/{runs} 完了")
    except subprocess.TimeoutExpired:
        print(f"✗ {label} タイムアウト")
        return RenderedPdfResult(success=False, tex_path=tex_path)
    except Exception as e:
        print(f"✗ {label} 例外: {e}")
        return RenderedPdfResult(success=False, tex_path=tex_path)

    pdf_source = tex_path.with_suffix(".pdf")
    aux_source = tex_path.with_suffix(".aux")
    if result is not None and result.returncode == 0 and pdf_source.exists():
        output_pdf_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(pdf_source, output_pdf_path)
        print(f"  コピー PDF: {pdf_source} -> {output_pdf_path}")
        print(f"✓ {label} 完了")
        return RenderedPdfResult(success=True, pdf_path=output_pdf_path, tex_path=tex_path, aux_path=aux_source if aux_source.exists() else None)

    if result is not None:
        print(f"✗ {label} エラー: {result.stderr[:500]}")
    return RenderedPdfResult(success=False, pdf_path=output_pdf_path if output_pdf_path.exists() else None, tex_path=tex_path, aux_path=aux_source if aux_source.exists() else None)


def _write_failed_raksul_report(settings: Dict[str, Any], error_message: str, assets: Optional[Dict[str, Optional[Path]]] = None) -> Path:
    report = {
        "generated_at": datetime.now().isoformat(),
        "success": False,
        "final_ready": False,
        "settings": settings,
        "outputs": {},
        "errors": [error_message],
        "warnings": [],
        "checks": {},
        "assets": [],
    }
    if assets:
        report["assets"] = [
            {"role": role, "path": _to_project_relative_path(path) if path else "", "errors": [], "warnings": []}
            for role, path in assets.items()
        ]
    return write_raksul_preflight_report(report)


def align_raksul_page_counts_to_print_pdf(raksul_settings: Dict[str, Any]) -> Dict[str, Any]:
    """Align Raksul page-count settings with the just-built print PDF."""
    try:
        import fitz
    except Exception as e:
        print(f"⚠ 製本用ページ数自動調整をスキップしました (fitz unavailable): {e}")
        return raksul_settings

    source_pdf = next((path for path in get_raksul_body_source_candidates() if path.exists()), None)
    if source_pdf is None:
        return raksul_settings

    try:
        doc = fitz.open(str(source_pdf))
    except Exception as e:
        print(f"⚠ 製本用ページ数自動調整をスキップしました: {e}")
        return raksul_settings

    try:
        # Raksul body extraction removes the outer front cover and the final
        # back cover from the public print PDF. Other tail pages, such as ads,
        # remain part of the body source.
        source_body_pages = max(0, doc.page_count - 2)
    finally:
        doc.close()

    if source_body_pages <= 0:
        return raksul_settings

    insert_count = len(get_enabled_raksul_body_insert_kinds(raksul_settings))
    body_pages = source_body_pages + insert_count
    if (
        int(raksul_settings.get("source_body_pages") or 0) != source_body_pages
        or int(raksul_settings.get("body_pages") or 0) != body_pages
    ):
        print(
            "✓ 製本用ページ数を印刷版PDFに合わせて調整: "
            f"source_body_pages={source_body_pages}, body_pages={body_pages}"
        )
        raksul_settings["source_body_pages"] = source_body_pages
        raksul_settings["body_pages"] = body_pages

    return raksul_settings


def generate_raksul_outputs(env: Dict[str, Any]) -> bool:
    print("\n=== 製本用本文生成 ===")
    cleanup_final_output_dir(CONFIG["pdf_raksul_dir"])
    raksul_settings = load_raksul_settings()
    raksul_settings = align_raksul_page_counts_to_print_pdf(raksul_settings)
    assets = resolve_raksul_cover_assets(raksul_settings)
    missing_cover_assets = [role for role in ("front_cover", "back_cover") if assets.get(role) is None]
    if missing_cover_assets:
        report_path = _write_failed_raksul_report(
            raksul_settings,
            f"required cover assets are missing: {', '.join(missing_cover_assets)}",
            assets,
        )
        print(f"✗ 製本用表紙生成失敗 ({report_path})")
        return False
    body_output_path = CONFIG["pdf_raksul_dir"] / RAKSUL_BODY_FILENAME
    try:
        body_source_pdf, body_rail_data = build_raksul_body_source_pdf(env, raksul_settings)
        build_raksul_body_pdf_from_source_pdf(body_source_pdf, body_output_path, raksul_settings)
    except Exception as e:
        report_path = _write_failed_raksul_report(raksul_settings, f"failed to generate Raksul body PDF: {e}", assets)
        print(f"✗ 製本用本文生成失敗 ({report_path})")
        return False
    insert_kinds = get_enabled_raksul_body_insert_kinds(raksul_settings)
    front_insert_count = 1 if "front" in insert_kinds else 0
    output_rail_data = offset_rail_data_pages(body_rail_data, offset_pages=front_insert_count)
    suppressed_pages: set[int] = set()
    if "front" in insert_kinds:
        suppressed_pages.add(1)
    if "back" in insert_kinds:
        suppressed_pages.add(int(raksul_settings["body_pages"]))
    overlay_navigation_rail(
        body_output_path,
        RAKSUL_PROFILE_NAME,
        binding=raksul_settings.get("binding"),
        rail_data=output_rail_data,
        suppress_pages=suppressed_pages,
    )
    # Note: chapter triangles are intentionally NOT drawn for raksul body PDF
    print(f"✓ 製本用本文PDF完了 -> {body_output_path}")

    print("\n=== 製本用表紙生成 ===")
    cover_outer_output = CONFIG["pdf_raksul_dir"] / RAKSUL_COVER_OUTER_FILENAME
    cover_inner_output = CONFIG["pdf_raksul_dir"] / RAKSUL_COVER_INNER_FILENAME
    cover_outer_result = render_raksul_cover_pdf(
        cover_outer_output,
        raksul_settings,
        assets,
        "outer",
    )
    cover_inner_result = render_raksul_cover_pdf(
        cover_inner_output,
        raksul_settings,
        assets,
        "inner",
    )

    cover_paper_width_mm = (
        2 * raksul_settings["trim_width_mm"]
        + 2 * raksul_settings["bleed_mm"]
        + float(raksul_settings["spine_width_mm"])
    )
    cover_trim_width_mm = 2 * raksul_settings["trim_width_mm"] + float(raksul_settings["spine_width_mm"])

    if not cover_outer_result or not cover_outer_output.exists():
        report_path = _write_failed_raksul_report(raksul_settings, "failed to generate cover_outer.pdf", assets)
        print(f"✗ 製本用表紙生成失敗 ({report_path})")
        return False
    if not cover_inner_result or not cover_inner_output.exists():
        report_path = _write_failed_raksul_report(raksul_settings, "failed to generate cover_inner.pdf", assets)
        print(f"✗ 製本用表紙生成失敗 ({report_path})")
        return False

    set_pdf_boxes(
        cover_outer_output,
        cover_paper_width_mm,
        raksul_settings["paper_height_mm"],
        cover_trim_width_mm,
        raksul_settings["trim_height_mm"],
        raksul_settings["bleed_mm"],
        raksul_settings["bleed_mm"],
    )
    set_pdf_boxes(
        cover_inner_output,
        cover_paper_width_mm,
        raksul_settings["paper_height_mm"],
        cover_trim_width_mm,
        raksul_settings["trim_height_mm"],
        raksul_settings["bleed_mm"],
        raksul_settings["bleed_mm"],
    )

    print("\n=== 製本用入稿プリフライト ===")
    report = build_raksul_preflight_report(
        raksul_settings,
        body_output_path,
        cover_outer_output,
        cover_inner_output,
        assets,
    )
    report_path = write_raksul_preflight_report(report)
    if report["success"]:
        print(f"✓ 製本用入稿成果物完了 -> {CONFIG['pdf_raksul_dir']}")
        print(f"  preflight: {report_path}")
        return True

    print(f"✗ 製本用入稿プリフライト失敗: {report_path}")
    for issue in report["errors"][:10]:
        print(f"  - {issue}")
    return False


def _resolve_fullpage_asset(image: dict) -> Path:
    source_path = Path(str(image.get('path', '')))
    if not source_path.is_absolute():
        source_path = Path.cwd() / source_path
    if str(image.get('type', '') or '') in EXACT_PAGE_IMAGE_TYPES:
        return source_path
    trimmed_path = Path.cwd() / 'pdf_build' / 'fullpage_prepared' / f"{image.get('id', 'fullpage')}_trimmed{source_path.suffix.lower()}"
    if trimmed_path.exists():
        return trimmed_path
    return source_path


def _insert_exact_fullpage_image_page(doc, image: dict, width: float, height: float):
    try:
        import fitz
    except Exception as e:
        raise RuntimeError(f"PyMuPDF unavailable for fullpage image insertion: {e}")

    page = doc.new_page(width=width, height=height)
    asset_path = _resolve_fullpage_asset(image)
    if asset_path.suffix.lower() == '.pdf':
        src = fitz.open(str(asset_path))
        try:
            page.show_pdf_page(page.rect, src, 0)
        finally:
            src.close()
    else:
        pix = fitz.Pixmap(str(asset_path))
        try:
            page.insert_image(page.rect, pixmap=pix, keep_proportion=False)
        finally:
            pix = None
    return page


def postprocess_boundary_fullpage_images(
    pdf_path: Path,
    front_images: Optional[List[dict]] = None,
    tail_images: Optional[List[dict]] = None,
):
    """Ensure required cover/ad/back full-page assets exist as exact edge-to-edge pages."""
    try:
        import fitz
    except Exception as e:
        print(f"⚠ フルページ画像補正をスキップしました (fitz unavailable): {e}")
        return

    front_images = front_images if front_images is not None else get_enabled_front_images()
    tail_images = tail_images if tail_images is not None else get_enabled_tail_images()
    if not front_images and not tail_images:
        return

    doc = fitz.open(str(pdf_path))
    try:
        front_count = len(front_images)
        tail_count = len(tail_images)
        existing_front = 0
        while existing_front < front_count and existing_front < doc.page_count:
            if not page_is_exact_fullpage_image(doc.load_page(existing_front)):
                break
            existing_front += 1

        existing_tail = 0
        while existing_tail < tail_count and existing_tail < max(0, doc.page_count - existing_front):
            page_index = doc.page_count - existing_tail - 1
            if not page_is_exact_fullpage_image(doc.load_page(page_index)):
                break
            existing_tail += 1

        body_start = existing_front
        body_end = doc.page_count - existing_tail
        reference_rect = doc.load_page(0).rect if doc.page_count else fitz.Rect(0, 0, mm_to_points(210), mm_to_points(297))

        rebuilt = fitz.open()
        rebuilt.set_metadata(doc.metadata)
        for image in front_images:
            _insert_exact_fullpage_image_page(rebuilt, image, reference_rect.width, reference_rect.height)
        for page_index in range(body_start, body_end):
            rebuilt.insert_pdf(doc, from_page=page_index, to_page=page_index)
        for image in tail_images:
            _insert_exact_fullpage_image_page(rebuilt, image, reference_rect.width, reference_rect.height)

        tmp_path = pdf_path.with_suffix('.fullpages.tmp.pdf')
        rebuilt.save(str(tmp_path), garbage=4, deflate=True)
        rebuilt.close()
        doc.close()
        tmp_path.replace(pdf_path)
        print(f"✓ フルページ画像補正: {pdf_path}")
    except Exception as e:
        doc.close()
        print(f"⚠ フルページ画像補正に失敗しました ({pdf_path}): {e}")
        return


def postprocess_tail_fullpage_images(pdf_path: Path, tail_images: Optional[List[dict]] = None):
    """Ensure trailing tail-image pages are exact full-page image pages."""
    try:
        import fitz
    except Exception as e:
        print(f"⚠ tail画像補正をスキップしました (fitz unavailable): {e}")
        return

    tail_images = tail_images if tail_images is not None else get_enabled_tail_images()
    if not tail_images:
        return

    doc = fitz.open(str(pdf_path))
    try:
        has_existing_tail_pages = pdf_has_fullpage_tail_images(pdf_path, len(tail_images))
        target_start = doc.page_count - len(tail_images) if has_existing_tail_pages and doc.page_count >= len(tail_images) else doc.page_count
        rebuilt = fitz.open()
        rebuilt.set_metadata(doc.metadata)
        for page_index in range(target_start):
            rebuilt.insert_pdf(doc, from_page=page_index, to_page=page_index)

        if target_start == doc.page_count and doc.page_count > 0:
            reference_rect = doc.load_page(doc.page_count - 1).rect
        else:
            reference_rect = doc.load_page(target_start).rect

        for image in tail_images:
            page = rebuilt.new_page(width=reference_rect.width, height=reference_rect.height)
            asset_path = _resolve_fullpage_asset(image)
            if asset_path.suffix.lower() == '.pdf':
                src = fitz.open(str(asset_path))
                try:
                    page.show_pdf_page(page.rect, src, 0)
                finally:
                    src.close()
            else:
                pix = fitz.Pixmap(str(asset_path))
                try:
                    page.insert_image(page.rect, pixmap=pix, keep_proportion=False)
                finally:
                    pix = None
        tmp_path = pdf_path.with_suffix('.tmp.pdf')
        rebuilt.save(str(tmp_path), garbage=4, deflate=True)
        rebuilt.close()
        doc.close()
        tmp_path.replace(pdf_path)
        print(f"✓ tail画像補正: {pdf_path}")
    except Exception as e:
        doc.close()
        print(f"⚠ tail画像補正に失敗しました ({pdf_path}): {e}")
        return


def generate_book_pdf_with_lualatex():
    """本全体を一括でLuaLaTeXレンダリング（pdf_buildプロジェクトを使用）
    
    生成フロー:
    1. Pass 1: Quarto render (章・節のページ情報を収集)
    2. Parse:  parse_raildata.py で .raildata を解析し、rail-computed.tex を生成
    3. Pass 2: LuaLaTeX 再実行 (ナビゲーションバーを描画)
    4. 印刷版PDFを out/pdf/ にコピー
    5. PC版PDFを生成して out/pdf_pc/ にコピー
    """
    import shutil
    ensure_runtime_has_fitz()

    ensure_pdf_project_index()
    ensure_pdf_project_tail()
    ensure_pdf_project_runtime_assets()
    refresh_fullpage_latex_config()
    cleanup_intermediate_pdf_artifacts()
    
    # === Footer Config Generation ===
    print("\n=== フッター設定生成 ===")
    generate_footer_config()
    
    # === Pass 1: Initial render (collects rail data) ===
    print("=== Pass 1: 情報収集ビルド ===")
    
    # Quartoのbookプロジェクトは--output-dirを無視してプロジェクト内のoutに出力する
    project_target = str(PDF_PROJECT_DIR)
    env = build_pdf_env()

    if not render_book_to_latex(project_target, 'print', '印刷版 Pass 1', env):
        return False
    print_build_result: Optional[RenderedPdfResult] = None
    tex_path = find_book_tex_file('print')
    if not tex_path:
        print("✗ Pass 1 エラー: TeX ファイルが見つかりません")
        return False
    print_build_result = run_lualatex_on_book_tex(
        tex_path,
        env,
        '印刷版 Pass 1 LuaLaTeX',
        pdf_dest_dir=PDF_PROJECT_DIR / 'out',
        aux_dest_path=PDF_PROJECT_DIR / 'index.aux',
    )
    if not print_build_result.success:
        return False
    
    # === PDF用索引再生成 (ページ番号表示) ===
    print("\n=== PDF用索引再生成 ===")
    project_root = Path(__file__).parent.parent
    aux_path = PDF_PROJECT_DIR / 'index.aux'
    if aux_path.exists():
        pdf_index_script = Path(__file__).parent / 'build_pdf_index.py'
        if pdf_index_script.exists():
            try:
                result = subprocess.run(
                    [PYTHON_EXECUTABLE, str(pdf_index_script)],
                    capture_output=True, text=True, timeout=60
                )
                if result.returncode == 0:
                    print(result.stdout)
                    print("✓ PDF用索引再生成完了")
                else:
                    print(f"⚠ PDF索引再生成エラー: {result.stderr}")
            except Exception as e:
                print(f"⚠ PDF索引再生成失敗: {e}")
        else:
            print(f"⚠ build_pdf_index.py が見つかりません: {pdf_index_script}")
    else:
        print(f"⚠ .auxファイルが見つかりません: {aux_path}")
        print("  (索引のページ番号なしで続行)")
    
    # === Pass 1.5: 索引QMD変更を反映してQuarto再レンダー ===
    print("\n=== Pass 1.5: 索引再レンダー ===")
    if not render_book_to_latex(project_target, 'print', 'Pass 1.5 LaTeX再生成', env):
        print("⚠ Pass 1.5 警告: LaTeX再生成に失敗しました")
    else:
        tex_path = find_book_tex_file('print')
        if tex_path:
            pass15_result = run_lualatex_on_book_tex(
                tex_path,
                env,
                'Pass 1.5 LuaLaTeX',
                pdf_dest_dir=PDF_PROJECT_DIR / 'out',
                aux_dest_path=PDF_PROJECT_DIR / 'index.aux',
            )
            if not pass15_result.success:
                print("⚠ Pass 1.5 警告: LuaLaTeX再実行に失敗しました")
            else:
                print_build_result = pass15_result
        else:
            print("⚠ Pass 1.5 警告: TeX ファイルが見つかりません")
    
    # === Parse raildata and generate computed macros ===
    print("\n=== Rail Data 解析 ===")
    # The raildata file is named after the LaTeX jobname, which may be the
    # book title (e.g. 平和への課題：補遺.raildata) rather than index.raildata.
    # Search for the file with TOTALPAGE data to find the correct one.
    raildata_path = PDF_PROJECT_DIR / 'index.raildata'
    for candidate in sorted(PDF_PROJECT_DIR.glob('*.raildata')):
        if candidate.name == 'navigation.raildata':
            continue  # Skip Lua filter output
        try:
            content = candidate.read_text(encoding='utf-8')
            if 'TOTALPAGE:' in content:
                raildata_path = candidate
                break
        except Exception:
            continue
    print(f"  raildata: {raildata_path}")
    computed_path = PDF_PROJECT_DIR / 'index-rail-computed.tex'
    
    if raildata_path.exists():
        parse_script = Path(__file__).parent / 'parse_raildata.py'
        try:
            result = subprocess.run(
                [PYTHON_EXECUTABLE, str(parse_script), str(raildata_path), str(computed_path)],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                print(result.stdout)
            else:
                print(f"⚠ parse_raildata.py エラー: {result.stderr}")
        except Exception as e:
            print(f"⚠ parse_raildata.py 実行失敗: {e}")
    else:
        print(f"⚠ raildata ファイルが見つかりません: {raildata_path}")
        print("  (ナビゲーションバーなしで続行)")
    
    # === Pass 2: Re-run LuaLaTeX with computed data ===
    if computed_path.exists():
        print("\n=== Pass 2: ナビゲーションバー描画ビルド ===")
        
        tex_path = find_book_tex_file('print')
        if tex_path:
            print(f"  TeX file found: {tex_path}")
            pass2_result = run_lualatex_on_book_tex(
                tex_path,
                env,
                'Pass 2',
                pdf_dest_dir=PDF_PROJECT_DIR / 'out',
                aux_dest_path=PDF_PROJECT_DIR / 'index.aux',
            )
            if pass2_result.success:
                print_build_result = pass2_result
        else:
            print("⚠ TeX ファイルが見つかりません（ナビゲーションバーなしで続行）")
    
    # === Copy print version to out/pdf/ ===
    print("\n=== 印刷版PDFコピー ===")
    print_source_pdf = print_build_result.pdf_path if print_build_result and print_build_result.pdf_path else None
    if print_source_pdf is None:
        print_source_pdf = find_generated_book_pdf('print')
    if print_source_pdf:
        export_book_pdf_variants(print_source_pdf, CONFIG['pdf_dir'], '印刷版', 'print', binding='left')
    else:
        print("✗ PDF生成失敗: ファイルが見つかりません")
        return False
    
    # === Extract page mapping for HTML ===
    print("\n=== ページマッピング抽出 ===")
    project_root = Path(__file__).parent.parent
    aux_path = PDF_PROJECT_DIR / 'index.aux'
    page_map_output = project_root / 'out' / 'assets' / 'pdf-page-map.json'

    if aux_path.exists():
        try:
            extract_script = Path(__file__).parent / 'extract_page_mapping.py'
            result = subprocess.run(
                [PYTHON_EXECUTABLE, str(extract_script), str(aux_path), str(page_map_output)],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                print(result.stdout.strip())
            else:
                print(f"⚠ ページマッピング抽出エラー: {result.stderr}")
        except Exception as e:
            print(f"⚠ ページマッピング抽出失敗: {e}")
    else:
        print(f"⚠ .aux ファイルが見つかりません: {aux_path}")

    # === Pass 1.75: Detect page boundaries ===
    print("\n=== 境界検出 ===")
    detect_script = Path(__file__).parent / 'detect_boundaries.py'
    if page_map_output.exists() and detect_script.exists():
        try:
            result = subprocess.run(
                [PYTHON_EXECUTABLE, str(detect_script), str(page_map_output)],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                print(result.stdout.strip())
                print("✓ 境界検出完了")
            else:
                print(f"⚠ 境界検出エラー: {result.stderr}")
        except Exception as e:
            print(f"⚠ 境界検出失敗: {e}")
    else:
        print("  境界検出スキップ (ファイル未検出)")

    # === Pass 1.9: Re-build with chunk markers (if boundaries detected) ===
    boundary_list_path = project_root / 'out' / 'assets' / 'boundary-paragraphs.txt'
    if boundary_list_path.exists():
        print("\n=== Pass 1.9: チャンクマーカー付きビルド ===")
        print("  境界段落にチャンクマーカーを挿入して再ビルド")

        # Set environment variable for Lua filter
        env_with_boundary = build_pdf_env({
            "BOUNDARY_PARAGRAPHS_TXT": str(boundary_list_path)
        })

        # Re-run Quarto with boundary marker filter
        cmd_boundary = ['quarto', 'render', project_target, '--to', 'pdf', '--profile', 'print']
        try:
            rc, stdout, stderr, timed_out = run_command_with_timeout(
                cmd_boundary,
                timeout=PDF_RENDER_TIMEOUT,
                env=env_with_boundary,
            )
            if timed_out:
                print("⚠ Pass 1.9 タイムアウト")
            elif rc == 0:
                print("✓ Pass 1.9 完了")
                # Re-run lualatex to update PDF with chunk markers
                tex_path = None
                possible_paths = [
                    PDF_PROJECT_DIR / '平和への課題：補遺.tex',
                    PDF_PROJECT_DIR / 'out' / '平和への課題：補遺.tex',
                    PDF_PROJECT_DIR / 'out' / 'index.tex',
                    PDF_PROJECT_DIR / 'index.tex',
                ]
                for p in possible_paths:
                    if p.exists():
                        tex_path = p
                        break
                if tex_path:
                    print(f"  TeX file found: {tex_path}")
                    output_dir = PDF_PROJECT_DIR / 'out'
                    try:
                        result = subprocess.run(
                            ['lualatex', '--interaction=nonstopmode', str(tex_path.name)],
                            capture_output=True, text=True, timeout=600,
                            cwd=str(tex_path.parent), env=env_with_boundary
                        )
                        # Update PDF and aux files
                        aux_source = tex_path.parent / (tex_path.stem + '.aux')
                        aux_dest = PDF_PROJECT_DIR / 'index.aux'
                        if aux_source.exists():
                            import shutil
                            shutil.copy2(aux_source, aux_dest)
                        pdf_source = tex_path.parent / (tex_path.stem + '.pdf')
                        if pdf_source.exists():
                            shutil.copy2(pdf_source, output_dir / pdf_source.name)
                        print("✓ Pass 1.9 LuaLaTeX完了")
                    except Exception as e:
                        print(f"⚠ Pass 1.9 LuaLaTeX例外: {e}")
            else:
                print(f"⚠ Pass 1.9 エラー: {stderr[:300]}")
        except Exception as e:
            print(f"⚠ Pass 1.9 例外: {e}")

    # === Pass 2.5: Extract fine-grained boundaries ===
    print("\n=== 細かい境界抽出 ===")
    boundaries_path = PDF_PROJECT_DIR / 'index.boundaries'
    fine_boundary_script = Path(__file__).parent / 'extract_fine_boundaries.py'
    enhanced_map_output = project_root / 'out' / 'assets' / 'pdf-page-map-enhanced.json'

    if boundaries_path.exists() and fine_boundary_script.exists():
        try:
            result = subprocess.run(
                [PYTHON_EXECUTABLE, str(fine_boundary_script), str(boundaries_path), str(page_map_output), str(enhanced_map_output)],
                capture_output=True, text=True, timeout=30
            )
            if result.returncode == 0:
                print(result.stdout.strip())
            else:
                print(f"⚠ 細かい境界抽出エラー: {result.stderr}")
        except Exception as e:
            print(f"⚠ 細かい境界抽出失敗: {e}")
    else:
        print(f"  細かい境界抽出スキップ (boundaries: {boundaries_path.exists()}, script: {fine_boundary_script.exists()})")
    
    # === PC Version ===
    print("\n=== PC版（片面）生成 ===")
    
    # PC版をビルド (--profile pc で _quarto-pc.yml を使用)
    pc_output_dir = get_profile_pdf_dirs('pc')[0]
    pc_build_success = False
    pc_build_result: Optional[RenderedPdfResult] = None
    if render_book_to_latex(project_target, 'pc', 'PC版 Pass 1', env):
        pc_tex_path = find_book_tex_file('pc')
        if pc_tex_path:
            pc_build_result = run_lualatex_on_book_tex(
                pc_tex_path,
                env,
                'PC版 Pass 2',
                pdf_dest_dir=pc_output_dir,
            )
            if pc_build_result.success:
                pc_source_pdf = pc_build_result.pdf_path
                if pc_source_pdf is None:
                    pc_source_pdf = find_generated_book_pdf('pc')
                if pc_source_pdf:
                    export_book_pdf_variants(pc_source_pdf, CONFIG['pdf_pc_dir'], 'PC版', 'pc', binding='left')
                    pc_build_success = True
                else:
                    print("✗ PC版PDFが見つかりません")
            else:
                print("✗ PC版 Pass 2 に失敗しました")
        else:
            print("✗ PC版 TeX ファイルが見つかりません")

    if not pc_build_success:
        fallback_pc_source = find_generated_book_pdf('pc')
        if fallback_pc_source:
            print("\n⚠ PC版は最新のレール付きPDFを使ってフォールバック出力します")
            export_book_pdf_variants(fallback_pc_source, CONFIG['pdf_pc_dir'], 'PC版', 'pc', binding='left')
            pc_build_success = True
    
    # PC版が失敗しても印刷版は成功しているのでTrueを返すが、ログに残す
    if not pc_build_success:
        print("\n⚠ 警告: PC版PDFの生成に失敗しました（印刷版は正常に生成されています）")

    print("\n=== 製本用入稿成果物生成 ===")
    if not generate_raksul_outputs(env):
        print("\n✗ 製本用入稿成果物の生成に失敗しました")
        return False

    print("\n=== PDF中間生成物クリーンアップ ===")
    cleanup_intermediate_pdf_artifacts()

    return True

def generate_pdf_with_weasyprint(html_path, output_path):
    """WeasyPrintでPDF生成"""
    print(f"WeasyPrintでPDF生成: {html_path}")
    
    cmd = [
        'weasyprint',
        str(html_path),
        str(output_path),
        '--encoding', 'utf-8',
        '--css', 'src/css/print.css',
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=180
        )
        
        if result.returncode == 0:
            print(f"✓ PDF生成完了: {output_path}")
            return True
        else:
            print(f"✗ エラー: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"✗ WeasyPrint失敗: {e}")
        return False

def generate_pdf_with_chrome(html_path, output_path):
    """Chrome headlessでPDF生成"""
    print(f"ChromeでPDF生成: {html_path}")
    
    # Chrome/Chromiumコマンド検出
    chrome_cmd = None
    for cmd in ['google-chrome', 'chromium-browser', 'chromium']:
        if check_command_available(cmd):
            chrome_cmd = cmd
            break
    
    if not chrome_cmd:
        print("✗ Chrome/Chromium未検出")
        return False
    
    cmd = [
        chrome_cmd,
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--print-to-pdf=' + str(output_path),
        'file://' + str(html_path.resolve())
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=180
        )
        
        if result.returncode == 0 and output_path.exists():
            print(f"✓ PDF生成完了: {output_path}")
            return True
        else:
            print(f"✗ エラー: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"✗ Chrome変換失敗: {e}")
        return False

def generate_pdf_with_wkhtmltopdf(html_path, output_path):
    """wkhtmltopdfでPDF生成"""
    print(f"wkhtmltopdfでPDF生成: {html_path}")
    
    cmd = [
        'wkhtmltopdf',
        '--encoding', 'utf-8',
        '--page-size', 'A4',
        '--margin-top', '2in',
        '--margin-right', '2in',
        '--margin-bottom', '2in',
        '--margin-left', '2in',
        str(html_path),
        str(output_path)
    ]
    
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=180
        )
        
        if result.returncode == 0:
            print(f"✓ PDF生成完了: {output_path}")
            return True
        else:
            print(f"✗ エラー: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"✗ wkhtmltopdf失敗: {e}")
        return False

def create_merged_pdf():
    """統合PDF生成"""
    print("統合PDF生成準備中...")
    
    # 出力ディレクトリ準備
    CONFIG['pdf_dir'].mkdir(parents=True, exist_ok=True)
    
    # 章の順序設定
    chapter_order = [
        'index', '00_front', '01_ch01', '02_ch02', '03_ch03',
        '20_col01', '21_col02', '04_ch04', '05_ch05', '06_ch06',
        '07_ch07', '22_col03', '90_afterword',
        '95_references', '96_index'
    ]
    
    # PDFファイル収集
    pdf_files = []
    for chapter in chapter_order:
        pdf_path = CONFIG['pdf_dir'] / f"{chapter}.pdf"
        if pdf_path.exists():
            pdf_files.append(pdf_path)
    
    if not pdf_files:
        print("✗ PDFファイルが見つかりません")
        return False
    
    # PDF統合（PDFtk等を使用）
    if check_command_available('pdftk'):
        merged_path = CONFIG['out_dir'] / "merged.pdf"
        cmd = ['pdftk'] + [str(f) for f in pdf_files] + ['cat output', str(merged_path)]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                print(f"✓ 統合PDF生成完了: {merged_path}")
                return True
        except Exception as e:
            print(f"✗ 統合失敗: {e}")
    
    elif check_command_available('pdfunite'):
        merged_path = CONFIG['out_dir'] / "merged.pdf"
        cmd = ['pdfunite'] + [str(f) for f in pdf_files] + [str(merged_path)]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode == 0:
                print(f"✓ 統合PDF生成完了: {merged_path}")
                return True
        except Exception as e:
            print(f"✗ 統合失敗: {e}")
    
    else:
        print("✗ PDF統合ツール未検出 (pdfuniteまたはpdftkが必要)")
    
    return False

def generate_statistics():
    """生成統計"""
    stats = {
        'generated_at': datetime.now().isoformat(),
        'engines_used': [],
        'files_processed': 0,
        'success_count': 0,
        'failure_count': 0,
    }
    
    pdf_files = list(CONFIG['pdf_dir'].glob('*.pdf'))
    stats['files_processed'] = len(pdf_files)
    stats['success_count'] = stats['files_processed']  # 簡略化
    
    stats_path = CONFIG['pdf_dir'] / 'generation_stats.json'
    with open(stats_path, 'w', encoding='utf-8') as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)
    
    print(f"統計情報保存: {stats_path}")
    return stats

def main():
    """メイン処理"""
    print("=== PDF生成システム ===")
    
    # 引数解析
    engine_preference = None
    if len(sys.argv) > 1:
        engine_preference = sys.argv[1]
    
    # 出力ディレクトリ準備
    CONFIG['pdf_dir'].mkdir(parents=True, exist_ok=True)
    
    # 依存関係チェック
    available_engines = check_dependencies()
    
    if not available_engines:
        print("✗ 利用可能なPDF生成エンジンがありません")
        sys.exit(1)
    
    print(f"利用可能エンジン: {', '.join(available_engines.keys())}")
    
    # エンジン選択
    if engine_preference:
        if engine_preference in available_engines:
            engines_to_use = [engine_preference]
            print(f"指定エンジン使用: {engine_preference}")
        else:
            print(f"✗ 指定エンジン '{engine_preference}' は利用不可")
            print(f"利用可能: {', '.join(available_engines.keys())}")
            sys.exit(1)
    else:
        # 優先順位でエンジンを選択
        priority = ['lualatex', 'weasyprint', 'chrome', 'wkhtmltopdf']
        engines_to_use = [e for e in priority if e in available_engines]
        
        if not engines_to_use:
            engines_to_use = list(available_engines.keys())[:1]
    
    print(f"使用エンジン: {', '.join(engines_to_use)}")
    
    # コンテンツファイル取得
    content_files = get_content_files()
    if not content_files:
        print("✗ コンテンツファイルが見つかりません")
        sys.exit(1)
    
    print(f"処理対象ファイル数: {len(content_files)}")
    
    # PDF生成処理
    total_success = 0
    total_failure = 0

    # LuaLaTeXが使える場合は本全体を一括ビルドし、重複ビルドを避ける
    if 'lualatex' in engines_to_use:
        success = generate_book_pdf_with_lualatex()
        if success:
            total_success = 1
            total_failure = 0
            # 章別マージ処理は不要なのでスキップ
            print("\n統合PDF生成はスキップ（単一PDFが出力されるため）")
            stats = generate_statistics()
            print(f"成功: {total_success}")
            print(f"失敗: {total_failure}")
            sys.exit(0)
        else:
            total_success = 0
            total_failure = len(content_files)
            print(f"\n✗ LuaLaTeXの全体ビルドに失敗しました")
            sys.exit(1)
    
    for file_path in content_files:
        success = False
        
        # 拡張子に応じた処理
        if file_path.suffix.lower() in ['.qmd', '.md'] and 'lualatex' in engines_to_use:
            output_path = CONFIG['pdf_dir'] / f"{file_path.stem}.pdf"
            success = generate_pdf_with_lualatex(file_path, output_path)
            
        elif file_path.suffix.lower() == '.html':
            html_path = CONFIG['html_dir'] / f"{file_path.stem}.html"
            if not html_path.exists():
                print(f"⚠ HTMLファイル未検出: {html_path}")
                total_failure += 1
                continue
            
            output_path = CONFIG['pdf_dir'] / f"{file_path.stem}.pdf"
            
            # 利用可能エンジンで試行
            for engine in engines_to_use:
                if engine == 'weasyprint':
                    success = generate_pdf_with_weasyprint(html_path, output_path)
                elif engine == 'chrome':
                    success = generate_pdf_with_chrome(html_path, output_path)
                elif engine == 'wkhtmltopdf':
                    success = generate_pdf_with_wkhtmltopdf(html_path, output_path)
                
                if success:
                    break
        
        if success:
            total_success += 1
        else:
            total_failure += 1
    
    # 統合PDF生成試行
    if total_success > 0:
        print("\n統合PDF生成中...")
        create_merged_pdf()
    
    # 統計生成
    print("\n生成統計:")
    generate_statistics()
    
    print(f"成功: {total_success}")
    print(f"失敗: {total_failure}")
    
    if total_failure > 0:
        print(f"\n✗ {total_failure}件のPDF生成に失敗しました")
        sys.exit(1)
    else:
        print(f"\n✓ すべてのPDF生成に成功しました")
        sys.exit(0)

def help_message():
    """ヘルプメッセージ"""
    print("PDF生成スクリプト")
    print("使用方法:")
    print("  python3 build_pdf.py [engine]")
    print("")
    print("エンジン指定:")
    for engine, config in ENGINES.items():
        print(f"  {engine}: {config['name']}")
    print("")
    print("例:")
    print("  python3 build_pdf.py lualatex")
    print("  python3 build_pdf.py weasyprint")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] in ['--help', '-h']:
        help_message()
    else:
        main()
