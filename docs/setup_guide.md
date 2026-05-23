# Setup Guide

This guide covers the common local and production-like setup paths for AJMUN BG
Editor.

## 日本語概要

この文書は、AJMUN BG Editor をローカルで動かす方法と、公開に近い構成で
起動する方法をまとめたものです。通常の開発構成ではログインが必要です。
ログインを省略する demo override は、ローカル実演用に限って使用してください。

## Quick Start

```bash
cp .env.example .env
# Set ADMIN_SECRET and SESSION_SECRET in .env
docker compose up --build
```

Open `http://localhost:5173`.

日本語手順:

1. `.env.example` を `.env` にコピーします。
2. `.env` に `ADMIN_SECRET` と `SESSION_SECRET` を設定します。
3. `docker compose up --build` を実行します。
4. `http://localhost:5173` を開きます。

The default compose file requires login. Use the demo compose override only for
an intentional local host-led session where login should be skipped:

```bash
docker compose -f docker-compose.yml -f docker-compose.demo.yml up --build
```

## Production-Like Compose

1. Copy `.env.prod.example` to `.env.prod`.
2. Set long random `ADMIN_SECRET` and `SESSION_SECRET` values.
3. Set `ALLOWED_ORIGINS` to the public HTTPS origin.
4. Set `ALLOWED_REDIRECT_URIS` to the exact public OAuth callback URL.
5. Set `GOOGLE_CREDENTIALS_DIR` to a directory outside the repository.
6. Run `docker compose -f docker-compose.prod.yml --env-file .env.prod up --build`.
7. Serve the bundled UI/Nginx container through an external TLS terminator.

The production-like compose keeps the API on Docker's internal network. Do not
publish API port `8000` directly unless you intentionally add a separate
local-only override.

日本語での注意点:

- `.env.prod.example` はそのまま起動できる設定ではありません。
- 本番相当の起動には、強い secret、正確な HTTPS origin、正確な OAuth callback
  URL、repo 外の Google credentials directory が必要です。
- API は UI/Nginx コンテナの背後に置く想定です。API port `8000` を直接公開
  しないでください。

## Local Development

Install frontend dependencies:

```bash
cd ui-next
npm install
cd ..
```

Install backend dependencies:

```bash
pip install -e 'api[dev]'
```

Ensure Quarto is available on `PATH`. For PDF work, also install `lualatex` and
`latexmk`.

Run tests from the repository root:

```bash
PYTHONPATH=. pytest -q
```

Set `EXPOSE_API_DOCS=true` only when local API documentation is needed.

## PDF-Capable Docker

The standard Docker workflow is lightweight and does not include a full TeX
environment. For PDF generation inside Docker, run:

```bash
docker compose -f docker-compose.yml -f docker-compose.pdf.yml up --build
```

For host-local PDF generation, install a TeX distribution that provides
`lualatex` and `latexmk`, then run:

```bash
bash scripts/check_pdf_env.sh --render-pdf-smoke
```

## Login Model

The default sample settings require login. Admins sign in with the
`ADMIN_SECRET` value from `.env`. Editors sign in with invite tokens generated
from Settings > Access.

The demo compose override skips login and grants admin-equivalent access. Use it
only for local demonstrations.

## Optional Google Integration

Leave `GOOGLE_INTEGRATION_ENABLED=auto` to enable Google features only when
credentials are present. Set it to `false` to disable Google functionality
entirely.

Every deployment using Google OAuth must list its callback URL in
`ALLOWED_REDIRECT_URIS`.

## Bundled Sample Project

The initial distribution includes the current AJMUN background guide project as
a bundled sample workspace. `.bgproject.json`, `_quarto.yml`, `content/`, and
the reviewed representative outputs in `sample-outputs/` are part of that
sample.

Active builds still write to `out/`; `sample-outputs/` is read-only reference
material for the packaged sample.

## Public Surface

The supported public surface is the FastAPI backend, the React frontend, the
Quarto build pipeline, Docker configuration, release scripts, public
documentation, license files, and reviewed representative outputs.

The clean public import excludes credentials, generated outputs, machine-local
settings, private planning notes, and private-only helper utilities.

日本語では、公開対象は「実行・編集・ビルド・配布に必要なもの」に限定します。
認証情報、生成済み作業領域、ローカル設定、内部メモ、公開不要な補助ファイルは
clean import に含めません。
