# AJMUN BG Editor

AJMUN BG Editor is the software used to prepare background guides for the 37th
All Japan Model United Nations Conference (AJMUN), Supplement to Agenda for Peace. It imports chapters drafted in Google Docs as Markdown
files with project-specific commands, then builds HTML via Quarto and typesets
PDF via LaTeX from one project tree.

The automatic Google Docs import workflow is still incomplete.

## 概要

本リポジトリは第37回 全日本模擬国連大会 平和への課題：補遺 議場における、背景解説書の作成に使用したソフトウェアです。
Google document上で執筆された各章を専用コマンド付きのMarkdownファイルとして取り込み、Quartoによるhtml化・Latexによるpdfの組版を行います。
Google Documentからの自動の取り込み機能は未完成です。

## Architecture

- Frontend: React, Tailwind CSS, and shadcn/ui in `ui-next/`
- Backend: FastAPI in `api/`
- Publishing pipeline: Quarto, Pandoc, Lua filters, and the root `content/`,
  `filters/`, `meta/`, and `src/` directories

The default workflow is a controlled editing session. Editors sign in with an
admin secret or invite token. The demo bypass mode is only for local
host-operated demonstrations and must not be used for a public deployment.

## Quick Start

```bash
cp .env.example .env
# Set ADMIN_SECRET and SESSION_SECRET in .env
docker compose up --build
```

Open `http://localhost:5173`.

The default compose file requires login. For an intentional local demo that
skips login, run the demo override:

```bash
docker compose -f docker-compose.yml -f docker-compose.demo.yml up --build
```

日本語での最短手順は次のとおりです。

1. `.env.example` を `.env` にコピーします。
2. `.env` に `ADMIN_SECRET` と `SESSION_SECRET` を設定します。
3. `docker compose up --build` を実行します。
4. ブラウザで `http://localhost:5173` を開きます。

通常の compose はログインを要求します。ログインを省略するデモ用構成は、公開
環境ではなくローカル実演のためだけに使用してください。

## Local Development

```bash
cd ui-next
npm install
cd ..
pip install -e 'api[dev]'
cp .env.example .env
```

Set `ADMIN_SECRET` and `SESSION_SECRET` before starting the app. Start the
frontend and backend with `./start-dev.sh`, or run the services manually.

Run tests and frontend checks from the repository root:

```bash
PYTHONPATH=. pytest -q
npm run build:reader-ui
npm --prefix ui-next run lint
npm --prefix ui-next run test:run
npm --prefix ui-next run build
```

## Production-Like Compose

Create a production environment file from the example, then fill every required
value before starting the stack:

```bash
cp .env.prod.example .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod up --build
```

Production-like deployments should place the bundled Nginx UI container behind
an external TLS-terminating reverse proxy. Keep the API container on Docker's
internal network unless you intentionally add a separate local-only override.

Use these defaults for any controlled deployment:

- `APP_ENV=production`
- strong random `ADMIN_SECRET` and `SESSION_SECRET` values
- `AUTH_BYPASS_ENABLED=false`
- `ENABLE_RAW_CONFIG_EDITOR=false`
- `SESSION_COOKIE_SECURE=true`
- exact HTTPS values in `ALLOWED_ORIGINS`
- exact OAuth callback URLs in `ALLOWED_REDIRECT_URIS`
- a repository-external `GOOGLE_CREDENTIALS_DIR`

Google OAuth access and refresh tokens are stored server-side. Token exchange
and refresh endpoints return status only.

## PDF Rendering

The standard Docker workflow is lightweight and does not include a full TeX
environment. For PDF rendering inside Docker, use:

```bash
docker compose -f docker-compose.yml -f docker-compose.pdf.yml up --build
```

For host-local PDF rendering, install Quarto, `lualatex`, and `latexmk`, then
run:

```bash
bash scripts/check_pdf_env.sh --render-pdf-smoke
```

## Outputs

The active build output is written under `out/`.

- `out/index.html` is the HTML entrypoint.
- `out/content/*.html` contains chapter pages.
- `out/*.pdf` contains generated PDF files.

Reviewed representative outputs for distribution live under `sample-outputs/`.
They are examples of the packaged result, not the active build workspace.

## Public Repository Boundary

The private working repository may contain local state, generated files, and
draft-only material. The public repository should be created from a clean
import using:

```bash
bash scripts/create_public_import.sh
```

The import is controlled by `public_manifest.txt` and `exclude_manifest.txt`.
The supported public surface is the FastAPI backend, the React frontend, the
Quarto build inputs, Docker configuration, release scripts, public
documentation, license files, and reviewed representative outputs.

The clean import intentionally excludes credentials, generated work areas,
machine-local editor settings, private planning notes, and private-only helper
utilities.

日本語で言えば、private repository は作業場、public repository は公開用に
整理された配布物です。公開時は履歴ごと公開するのではなく、manifest に従って
clean import を作成し、認証情報・生成物・ローカル状態・内部メモを含めない
状態で検証します。

## Security

Never commit `.env`, `.credentials/`, `config/auth.json`, Google OAuth client
secrets, `credentials.json`, `service_account.json`, `authorized_user.json`,
`client_secret.json`, or token files.

If a credential has been committed or published, rotate or revoke it. Deleting
the file in a later commit is not enough for a repository that has public
history.

See `SECURITY.md` for reporting and deployment guidance.

## Licensing

Application code is licensed under the root `LICENSE`. Bundled manuscript text,
images, representative HTML/PDF outputs, and other content are governed by
`CONTENT_LICENSE.md`. Bundled BIZ font files are distributed under the SIL Open
Font License 1.1; see `licenses/OFL-1.1-BIZ-FONTS.txt` and
`THIRD_PARTY_NOTICES.md`.

## Documentation

Start with these documents:

- `docs/setup_guide.md`: local setup and common runtime modes
- `docs/DISTRIBUTION.md`: public distribution boundary
- `docs/RELEASE_RUNBOOK.md`: release checklist
- `docs/PUBLICATION_RUNBOOK.md`: clean-import publication procedure
- `docs/AUDIT_REPORT.md`: current repository audit report
- `docs/IMPROVEMENT_PLAN.md`: prioritized follow-up tasks
- `docs/PUBLIC_RELEASE_CHECKLIST.md`: manual public-release checklist
- `SECURITY.md`: security policy and reporting
- `CONTRIBUTING.md`: contribution checks and public-boundary expectations

Reference documents:

- `docs/CONFIG_REFERENCE.md`
- `docs/AUTH_MODEL.md`
- `docs/API_EXPOSURE_AUDIT.md`
- `docs/GOOGLE_DOCS_MARKDOWN_PROFILE.md`
- `docs/SETUP_PDF.md`
- `docs/KNOWN_LIMITATIONS.md`
- `docs/TROUBLESHOOTING.md`
- `docs/PR_DESCRIPTION.md`

日本語で読む場合も、まず `docs/setup_guide.md`、`docs/DISTRIBUTION.md`、
`docs/RELEASE_RUNBOOK.md`、`docs/PUBLICATION_RUNBOOK.md`、
`docs/AUDIT_REPORT.md`、`docs/IMPROVEMENT_PLAN.md`、
`docs/PUBLIC_RELEASE_CHECKLIST.md` を確認してください。これらには公開境界、
セットアップ、リリース前確認、clean import 手順、監査結果、改善計画の日本語
または英語による実務的な確認事項を記載しています。

## Release Checks

Run these before tagging or publishing:

```bash
bash scripts/release_check.sh
PYTHONPATH=. pytest -q
npm run build:reader-ui
npm --prefix ui-next ci
npm --prefix ui-next run lint
npm --prefix ui-next run test:run
npm --prefix ui-next run build
bash scripts/check_pdf_env.sh --render-html-smoke
bash scripts/check_pdf_env.sh --render-pdf-smoke
python3 scripts/sync_output_runtime_assets.py --sync-sample-outputs
```

Before public release, also complete the human review items: redacted secret
scans, dependency audits, content and asset rights review, PDF metadata review,
Google Docs link review, clean-import verification, and the final release tag.
