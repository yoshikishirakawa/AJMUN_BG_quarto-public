#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import shutil
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:  # pragma: no cover - optional dependency for base env compatibility
    BeautifulSoup = None


PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = PROJECT_ROOT / "out"
OUT_ASSETS_DIR = OUT_DIR / "assets"
CONTENT_ASSETS_DIR = OUT_DIR / "content" / "assets"
OUT_FONTS_DIR = OUT_DIR / "fonts"
PROJECT_FONTS_DIR = PROJECT_ROOT / "fonts"
SAMPLE_OUTPUTS_DIR = PROJECT_ROOT / "sample-outputs"
SAMPLE_HTML_DIR = SAMPLE_OUTPUTS_DIR / "html"
SAMPLE_PDF_DIR = SAMPLE_OUTPUTS_DIR / "pdf"
SAMPLE_LANDING_PATH = SAMPLE_OUTPUTS_DIR / "index.html"
SAMPLE_NOJEKYLL_PATH = SAMPLE_OUTPUTS_DIR / ".nojekyll"
RUNTIME_ASSETS = ["reader-ui.js", "pdf-page-indicator.js"]
ROOT_STATIC_FILES = ["robots.txt", "sitemap.xml"]
SAMPLE_HTML_PATHS = [
    "index.html",
    "content",
    "site_libs",
    "src/css",
    "assets",
    "fonts",
    "robots.txt",
    "sitemap.xml",
    "sw.js",
]
PUBLIC_ARTIFACT_NOISE = [
    "api",
    "sample-outputs",
    "templates",
    "PUBLISH_REPO_DIR",
    "ui-next",
    "src/js",
]
SAMPLE_LANDING_HTML = """<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AJMUN BG Editor Samples</title>
  <style>
    :root { color-scheme: light; --ink: #152b3c; --sub: #526475; --line: #dce3e8; --accent: #163e59; --paper: #ffffff; --wash: #f2f5f7; }
    * { box-sizing: border-box; }
    body { margin: 0; color: var(--ink); background: var(--wash); font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", sans-serif; line-height: 1.7; }
    header, main, footer { width: min(100% - 40px, 920px); margin: 0 auto; }
    header { padding: 64px 0 36px; }
    .label { margin: 0 0 12px; color: var(--sub); font-size: .85rem; letter-spacing: .1em; text-transform: uppercase; }
    h1 { margin: 0 0 14px; font-size: clamp(2rem, 5vw, 3rem); line-height: 1.2; }
    h2 { font-size: 1.2rem; margin-top: 0; }
    p { margin: 0 0 14px; color: var(--sub); }
    .cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
    .card, .notice { background: var(--paper); border: 1px solid var(--line); border-radius: 12px; padding: 22px; }
    .card a { display: inline-block; margin-top: 14px; color: var(--accent); font-weight: 600; text-decoration: none; }
    .card a:hover { text-decoration: underline; }
    .notice { margin-bottom: 42px; }
    footer { color: var(--sub); border-top: 1px solid var(--line); padding: 22px 0 48px; font-size: .9rem; }
    @media (max-width: 720px) { header { padding-top: 40px; } .cards { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <p class="label">AJMUN BG Editor</p>
    <h1>公開サンプル</h1>
    <p>背景解説書の生成結果と、編集画面の読み取り専用体験版を確認できます。</p>
  </header>
  <main>
    <section class="cards" aria-label="公開サンプル一覧">
      <article class="card">
        <h2>HTML 版</h2>
        <p>章構成と閲覧用 UI を含む背景解説書の代表出力です。</p>
        <a href="./html/index.html">HTML を開く</a>
      </article>
      <article class="card">
        <h2>PDF 版</h2>
        <p>組版済みのレビュー対象 PDF サンプルです。</p>
        <a href="./pdf/平和への課題：補遺.pdf">PDF を開く</a>
      </article>
      <article class="card">
        <h2>エディタ体験版</h2>
        <p>編集画面と Markdown preview を静的データで確認できます。</p>
        <a href="./editor/index.html">体験版を開く</a>
      </article>
    </section>
    <section class="notice">
      <h2>体験版の制限</h2>
      <p>公開デモでは保存、ビルド、認証、Google Docs 連携、ファイルアップロードを利用できません。本文の入力は一時的に試せますが、再読み込みすると初期状態に戻ります。</p>
    </section>
  </main>
  <footer>公開対象として確認済みのサンプル出力だけを掲載しています。</footer>
</body>
</html>
"""


def _display_path(path: Path) -> Path:
    try:
        return path.relative_to(PROJECT_ROOT)
    except ValueError:
        return path


def _sanitize_with_regex(html_text: str) -> str:
    updated = re.sub(
        r"<span\b[^>]*class=(['\"])[^'\"]*pdf-para-marker[^'\"]*\1[^>]*>\s*</span>",
        "",
        html_text,
        flags=re.IGNORECASE,
    )
    updated = re.sub(
        r"<div\b(?=[^>]*class\s*=\s*(['\"])[^'\"]*auto-id-(?:para|bq)[^'\"]*\1)[^>]*>(.*?)</div>",
        r"\2",
        updated,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return updated


def sanitize_landing_index_html(index_path: Path) -> bool:
    if not index_path.exists():
        return False

    original = index_path.read_text(encoding="utf-8")
    if "auto-id-para" not in original and "pdf-para-marker" not in original:
        return False

    if BeautifulSoup is not None:
        soup = BeautifulSoup(original, "html.parser")
        marker_nodes = soup.select("span.pdf-para-marker")
        wrapper_nodes = soup.select("div.auto-id-para")

        if not marker_nodes and not wrapper_nodes:
            return False

        for node in marker_nodes:
            node.decompose()

        for node in wrapper_nodes:
            node.unwrap()

        updated = str(soup)
    else:
        updated = _sanitize_with_regex(original)

    if updated == original:
        return False

    index_path.write_text(updated, encoding="utf-8")
    print(
        "[sync_output_runtime_assets] sanitized landing markers: "
        f"{_display_path(index_path)}"
    )
    return True


def copy_file(source: Path, destination: Path) -> bool:
    if not source.exists():
        print(f"[sync_output_runtime_assets] missing: {_display_path(source)}")
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    print(
        "[sync_output_runtime_assets] copied: "
        f"{_display_path(source)} -> {_display_path(destination)}"
    )
    return True


def copy_directory(source: Path, destination: Path) -> bool:
    if not source.exists():
        print(f"[sync_output_runtime_assets] missing: {_display_path(source)}")
        return False
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(source, destination)
    print(
        "[sync_output_runtime_assets] copied: "
        f"{_display_path(source)} -> {_display_path(destination)}"
    )
    return True


def remove_public_artifact_noise(root: Path) -> int:
    removed = 0
    for rel_path in PUBLIC_ARTIFACT_NOISE:
        target = root / rel_path
        if target.is_dir():
            shutil.rmtree(target)
            removed += 1
            print(
                "[sync_output_runtime_assets] removed public artifact noise: "
                f"{_display_path(target)}"
            )
        elif target.exists():
            target.unlink()
            removed += 1
            print(
                "[sync_output_runtime_assets] removed public artifact noise: "
                f"{_display_path(target)}"
            )
    return removed


def sync_runtime_assets() -> int:
    if not OUT_ASSETS_DIR.exists():
        print("[sync_output_runtime_assets] skipped: out/assets does not exist")
        return 0

    remove_public_artifact_noise(OUT_DIR)
    CONTENT_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    copied = 0
    for name in RUNTIME_ASSETS:
        copied += int(copy_file(OUT_ASSETS_DIR / name, CONTENT_ASSETS_DIR / name))

    for name in ROOT_STATIC_FILES:
        copied += int(copy_file(PROJECT_ROOT / name, OUT_DIR / name))

    out_pdf_dir = OUT_DIR / "pdf"
    if not any(out_pdf_dir.glob("*.pdf")) and SAMPLE_PDF_DIR.exists():
        sample_pdfs = sorted(SAMPLE_PDF_DIR.glob("*.pdf"))
        if sample_pdfs:
            out_pdf_dir.mkdir(parents=True, exist_ok=True)
            for pdf_path in sample_pdfs:
                copied += int(copy_file(pdf_path, out_pdf_dir / pdf_path.name))

    font_source_dir = OUT_ASSETS_DIR / "fonts"
    if not font_source_dir.exists():
        font_source_dir = PROJECT_FONTS_DIR
    if copy_directory(font_source_dir, OUT_FONTS_DIR):
        copied += 1

    print(f"[sync_output_runtime_assets] done: {copied} item(s)")
    return copied


def sync_sample_outputs() -> int:
    copied = 0
    SAMPLE_HTML_DIR.parent.mkdir(parents=True, exist_ok=True)

    required_html_sources = [
        OUT_DIR / "index.html",
        OUT_DIR / "content",
        OUT_DIR / "site_libs",
        OUT_DIR / "src" / "css",
        OUT_DIR / "assets",
        OUT_DIR / "sw.js",
    ]
    missing_html_sources = [path for path in required_html_sources if not path.exists()]
    html_sources_ready = len(missing_html_sources) == 0

    if html_sources_ready:
        remove_public_artifact_noise(OUT_DIR)
        if SAMPLE_HTML_DIR.exists():
            shutil.rmtree(SAMPLE_HTML_DIR)
        SAMPLE_HTML_DIR.mkdir(parents=True, exist_ok=True)

        for name in SAMPLE_HTML_PATHS:
            source = OUT_DIR / name
            destination = SAMPLE_HTML_DIR / name
            if source.is_dir():
                copied += int(copy_directory(source, destination))
            else:
                copied += int(copy_file(source, destination))

        sanitize_landing_index_html(SAMPLE_HTML_DIR / "index.html")
    else:
        SAMPLE_HTML_DIR.mkdir(parents=True, exist_ok=True)
        missing_labels = ", ".join(str(_display_path(path)) for path in missing_html_sources)
        print(
            "[sync_output_runtime_assets] missing required HTML outputs "
            f"({missing_labels}); kept existing sample-outputs/html"
        )

    pdf_sources = sorted((OUT_DIR / "pdf").glob("*.pdf"))
    if not pdf_sources:
        pdf_sources = sorted(OUT_DIR.glob("*.pdf"))
    if pdf_sources:
        if SAMPLE_PDF_DIR.exists():
            shutil.rmtree(SAMPLE_PDF_DIR)
        SAMPLE_PDF_DIR.mkdir(parents=True, exist_ok=True)
        for pdf_path in pdf_sources:
            copied += int(copy_file(pdf_path, SAMPLE_PDF_DIR / pdf_path.name))
    else:
        SAMPLE_PDF_DIR.mkdir(parents=True, exist_ok=True)
        print("[sync_output_runtime_assets] missing: out/*.pdf (kept existing sample-outputs/pdf)")

    SAMPLE_LANDING_PATH.write_text(SAMPLE_LANDING_HTML, encoding="utf-8")
    SAMPLE_NOJEKYLL_PATH.write_text("", encoding="utf-8")
    print(
        "[sync_output_runtime_assets] wrote: "
        f"{_display_path(SAMPLE_LANDING_PATH)}"
    )
    print(
        "[sync_output_runtime_assets] wrote: "
        f"{_display_path(SAMPLE_NOJEKYLL_PATH)}"
    )
    return copied


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync runtime assets and representative sample outputs.")
    parser.add_argument(
        "--sync-sample-outputs",
        action="store_true",
        help="Copy representative HTML/PDF outputs from out/ to sample-outputs/ for packaging and GitHub Pages.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    sync_runtime_assets()
    if args.sync_sample_outputs:
        copied = sync_sample_outputs()
        print(f"[sync_output_runtime_assets] sample outputs synced: {copied} item(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
