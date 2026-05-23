# Contributing

## 日本語概要

変更を送る前に、対象範囲に応じた test、build、release check を実行してください。
公開配布に関わる変更では、credential、生成物、ローカル設定、内部メモ、公開不要な
補助ファイルを public surface に追加しないでください。

## Development Checks

Run the relevant checks before opening a change:

```bash
PYTHONPATH=. pytest -q
npm run build:reader-ui
npm --prefix ui-next run lint
npm --prefix ui-next run test:run
npm --prefix ui-next run build
bash scripts/release_check.sh
```

For Quarto or PDF changes, also run:

```bash
bash scripts/check_pdf_env.sh --render-html-smoke
bash scripts/check_pdf_env.sh --render-pdf-smoke
```

## Public Boundary

Changes intended for public release should stay within the supported
distribution surface: `api/`, `ui-next/`, Quarto build inputs, Docker files,
public documentation, release scripts, licenses, and reviewed representative
outputs.

Do not add local credentials, generated work areas, machine-local settings,
private planning notes, or private-only helper utilities to the public surface.

## Content And Assets

Application code and bundled content use different license boundaries. Before
adding manuscript text, images, fonts, screenshots, PDFs, or HTML samples,
update `CONTENT_LICENSE.md` or `docs/ASSET_RIGHTS_MANIFEST.md` when the rights
status changes.

日本語での content/asset 方針:

application code と bundled content は license boundary が異なります。本文、画像、
font、screenshot、PDF、HTML sample を追加・変更するときは、必要に応じて
`CONTENT_LICENSE.md` と `docs/ASSET_RIGHTS_MANIFEST.md` を更新してください。
