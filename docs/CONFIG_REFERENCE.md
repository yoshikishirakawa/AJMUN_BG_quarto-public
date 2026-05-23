# Configuration Reference

## 日本語概要

この文書は、AJMUN BG Editor の主要な環境変数とプロジェクトファイルの役割を
まとめたものです。本番相当の環境では、secret、origin、OAuth callback URL、
Google credentials directory を明示的に設定し、auth bypass と API docs は
無効にしてください。

## Runtime Environment

- `APP_ENV`: `development` or `production`. Production enables fail-fast runtime
  validation.
- `ADMIN_SECRET`: admin login secret. Production rejects empty, short, or
  placeholder values.
- `SESSION_SECRET`: cookie session signing secret. Production rejects empty,
  short, or placeholder values.
- `SESSION_COOKIE_SECURE`: set secure session cookies. This must be `true` in
  production.
- `ALLOWED_ORIGINS`: comma-separated backend origins.
- `ALLOWED_REDIRECT_URIS`: comma-separated Google OAuth callback URLs allowed to
  complete the OAuth flow.
- `GOOGLE_INTEGRATION_ENABLED`: `auto`, `true`, or `false`.
- `GOOGLE_CREDENTIALS_DIR`: directory for Google OAuth `client_secret.json` and
  `token.json`. Production requires this path to be outside the repository.
- `ENABLE_OPEN_IN_FINDER`: enables local file-manager integration. It defaults
  to `false`.
- `ENABLE_RAW_CONFIG_EDITOR`: enables admin raw `_quarto.yml` read/write API and
  UI. Keep it `false` in production unless raw Quarto maintenance is
  intentional.
- `EXPOSE_API_DOCS`: enables `/docs`, `/redoc`, and `/openapi.json`. Use this
  for development only.
- `AUTH_BYPASS_ENABLED`: skips admin/invite login and grants admin-equivalent
  access. It defaults to `false` in sample compose and env files.
- `VITE_AUTH_BYPASS_ENABLED`: frontend build-time flag for auth-bypass-aware UI
  messaging.

Production deployments should terminate TLS in front of the bundled Nginx
service, set exact HTTPS origins and redirect URIs, keep API docs disabled, and
store Google credentials outside the repository.

日本語での重要項目:

- `ADMIN_SECRET` と `SESSION_SECRET` は強いランダム値にしてください。
- `AUTH_BYPASS_ENABLED` は公開環境では無効にしてください。
- `GOOGLE_CREDENTIALS_DIR` は repository 外を指定してください。
- `EXPOSE_API_DOCS` は開発用途に限って有効化してください。
- `ENABLE_RAW_CONFIG_EDITOR` は、本番相当では原則として無効にしてください。

## Project Files

- `.bgproject.json`: project state and chapter metadata.
- `_quarto.yml`: Quarto configuration used for builds.
- `config/settings.json`: settings used by current and compatibility build
  paths.
- `config/auth.json`: hashed invite tokens and auth metadata. This file is local
  state and must not be published.

## Output Policy

- `out/index.html`: active HTML landing page.
- `out/content/*.html`: active chapter HTML pages.
- `out/*.pdf`: active PDF outputs.
- `sample-outputs/`: reviewed representative outputs kept for distribution.
- `out/` and `pdf_build/`: local/generated output and intermediate work areas.
- `/outputs/*` and `/assets/*`: authenticated backend routes in distributed
  deployments.
- `/api/v1/system/status`: reports Quarto, LuaLaTeX, and `latexmk`
  availability for the running API process.

## Public Support Boundary

The supported public product surface is `api/`, `ui-next/`, Quarto build inputs,
Docker configuration, release scripts, and public documentation. Private-only
helpers, generated state, local credentials, and internal planning notes are not
part of the public release boundary.

日本語では、公開対象は実行・編集・ビルド・配布に必要なファイルに限定します。
local credential、生成状態、内部メモ、公開不要な補助ファイルは含めません。
