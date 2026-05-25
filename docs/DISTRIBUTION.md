# Distribution Guide

This project is distributed as a working editor and a bundled sample project.
It is not a generic blank template. The public repository should contain only
the supported product surface and reviewed representative outputs.

## 日本語概要

このリポジトリは、空のテンプレートではなく、AJMUN Background Guide のサンプル
プロジェクトを含む編集・公開用ワークスペースとして配布されます。公開 repo に
含めるのは、実行に必要な product surface と、権利確認済みの代表出力だけです。

## Included In The Public Tree

- FastAPI backend code under `api/`
- React frontend code under `ui-next/`
- Quarto inputs, Lua filters, metadata, scripts, and runtime assets needed to
  build the guide
- Docker and compose files for development, production-like, and PDF-capable
  workflows
- public documentation, license files, and release checks
- the bundled sample project: `.bgproject.json`, `_quarto.yml`, `content/`,
  `config/settings.json`, `config/fullpage_images.json`, and representative
  assets
- reviewed representative outputs under `sample-outputs/`
- the static read-only editor demo under `sample-outputs/editor/`

日本語での公開対象:

- `api/` の FastAPI backend
- `ui-next/` の React frontend
- Quarto build に必要な content、filters、meta、scripts、runtime assets
- Docker/compose 設定
- 公開向け文書、license、release check
- bundled sample project と reviewed representative outputs

## Excluded From The Public Tree

- `.env`, `.env.*` except the checked-in examples, and `.credentials/`
- `config/auth.json`
- local credential filenames such as `credentials.json`,
  `service_account.json`, `authorized_user.json`, `client_secret.json`, and
  `token.json`
- generated work areas such as `out/`, `pdf_build/`, `content/build/`,
  `PUBLISH_REPO_DIR/`, `.cache/`, `.quarto/`, and dependency directories
- machine-local editor settings, private planning notes, audit work files, and
  private-only helper utilities

日本語での除外対象:

- `.env`、`.credentials/`、`config/auth.json`、OAuth secret、token files
- `out/`、`pdf_build/`、cache、dependency directories などの生成物
- ローカル editor 設定、内部計画メモ、監査作業ファイル、公開不要な補助ファイル

The include and exclude rules are recorded in `public_manifest.txt` and
`exclude_manifest.txt`. Use `bash scripts/create_public_import.sh` to generate
the clean public tree.

## Output Model

Active builds write to `out/`:

- `out/index.html`: HTML landing page
- `out/content/*.html`: chapter pages
- `out/*.pdf`: generated PDF files

Representative distribution outputs are stored separately:

- `sample-outputs/html/index.html`
- `sample-outputs/html/content/*.html`
- `sample-outputs/html/site_libs/`, `sample-outputs/html/src/`,
  `sample-outputs/html/fonts/`, and `sample-outputs/html/assets/`
- `sample-outputs/pdf/*.pdf`
- `sample-outputs/editor/`: a static demo built from public fixture data

Only curated representative outputs should remain in `sample-outputs/`.
The editor demo permits temporary browser-local text input only; it does not
save, build, authenticate, upload files, or contact Google Docs.

## Licensing Boundary

Application code is licensed by the root `LICENSE`. Bundled manuscript text,
images, fonts, screenshots, sample PDFs, and sample HTML output follow the
terms documented in `CONTENT_LICENSE.md`, `THIRD_PARTY_NOTICES.md`, and
`docs/ASSET_RIGHTS_MANIFEST.md`.

Do not broaden reuse rights for content or sample outputs without updating the
content license and asset manifest.

## Recommended Flow

1. Copy `.env.prod.example` to `.env.prod`.
2. Set long random `ADMIN_SECRET` and `SESSION_SECRET` values.
3. Set `ALLOWED_ORIGINS` and `ALLOWED_REDIRECT_URIS` to the exact public HTTPS
   origins and callback URLs.
4. Run the production-like compose with `docker compose -f docker-compose.prod.yml --env-file .env.prod up --build`.
5. Build and smoke-test HTML/PDF outputs.
6. Sync reviewed representative outputs with `python3 scripts/sync_output_runtime_assets.py --sync-sample-outputs`.
7. Build the static editor demo with `npm --prefix ui-next run build:public-demo`.
8. Run `bash scripts/release_check.sh`.
9. Generate the clean public tree with `bash scripts/create_public_import.sh`.
10. Run the release checks and redacted secret scan again in the clean tree.
11. Publish only after tests, release checks, secret scans, and human rights
review are complete.

User-facing guidance starts in `docs/GETTING_STARTED.md`,
`docs/EDITOR_USAGE.md`, `docs/PUBLISHING_WORKFLOW.md`,
`docs/PUBLIC_REPOSITORY_BOUNDARY.md`, and `docs/DEPLOYMENT.md`.

日本語手順としては、まず sample output を再生成・同期し、private tree と clean
tree の両方で release check と secret scan を通します。その後、内容・画像・PDF
出力の権利確認を人間が完了してから公開します。

## Runtime Modes

Development compose binds API and UI ports to loopback and requires login by
default. The demo compose override intentionally enables auth bypass for local
host-led demonstrations only.

The production-like compose serves the API behind the bundled Nginx UI
container. Public deployments should place that UI service behind an external
TLS terminator and should not publish API port `8000` directly.

## Known Compatibility Note

Some compatibility endpoints still use mixed API prefixes. New public endpoints
should use `/api/v1/*`; existing endpoints should not be renamed in a public
release without a migration plan.
