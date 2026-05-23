# Release Runbook

This runbook is the final checklist for a tag-ready release. It assumes the
project is being released as a bundled sample-project distribution.

## 日本語概要

この文書は、tag-ready な release を作るための最終確認リストです。対象は、現在の
AJMUN Background Guide を bundled sample project として含む初回配布です。

## Release Goal

The release should package the supported editor and publishing workflow:
`api/`, `ui-next/`, Quarto build inputs, Docker configuration, public
documentation, release scripts, license files, and reviewed representative
outputs.

The release should not include credentials, generated work areas, local machine
state, private planning notes, or private-only helper utilities.

日本語での release 目標:

- editor、backend、frontend、Quarto build、Docker 設定、公開文書、license、
  representative outputs を一貫した状態で配布します。
- credentials、生成物、ローカル状態、内部メモ、公開不要な補助ファイルは
  配布対象に含めません。

## Required Files

- `.bgproject.json`
- `_quarto.yml`
- `content/`
- `config/settings.json`
- `config/fullpage_images.json`
- `sample-outputs/html/`
- `sample-outputs/pdf/`
- public documentation under `docs/`
- `CONTENT_LICENSE.md`
- `docs/ASSET_RIGHTS_MANIFEST.md`
- `public_manifest.txt`
- `exclude_manifest.txt`
- `scripts/create_public_import.sh`

## Environment Preparation

1. Copy `.env.example` to `.env`.
2. Set `ADMIN_SECRET` and `SESSION_SECRET`.
3. Leave Google integration unset or `auto` unless credentials are intentionally
   configured.
4. Keep `EXPOSE_API_DOCS=false` unless local API documentation is needed.
5. For production-like compose, copy `.env.prod.example` to `.env.prod` and set
   strong secrets, exact HTTPS origins, exact OAuth redirect URIs, and a
   repository-external Google credentials directory.

## Freeze Procedure

1. Build the reader runtime bundle:
   `npm run build:reader-ui`
2. Build the frontend:
   `npm --prefix ui-next run build`
3. Run HTML smoke render:
   `bash scripts/check_pdf_env.sh --render-html-smoke`
4. Run PDF smoke render:
   `bash scripts/check_pdf_env.sh --render-pdf-smoke`
5. Refresh representative outputs:
   `python3 scripts/sync_output_runtime_assets.py --sync-sample-outputs`
6. Run release checks:
   `bash scripts/release_check.sh`
7. Validate compose configuration:
   `docker compose config`
8. Confirm the production example fails for missing required secrets:
   `docker compose -f docker-compose.prod.yml --env-file .env.prod.example config`
9. Validate the PDF compose override:
   `docker compose -f docker-compose.yml -f docker-compose.pdf.yml config`
10. Run dependency and secret checks:
   `npm audit --audit-level=moderate`,
   `npm --prefix ui-next audit --audit-level=moderate`,
   `pip-audit api --cache-dir /tmp/pip-audit-cache`, and a redacted gitleaks
   scan.
11. Create the clean public tree:
   `bash scripts/create_public_import.sh`
12. Repeat release checks, tests, frontend checks, and redacted secret scanning
   in the clean tree.

日本語での freeze 手順:

1. reader runtime、frontend、HTML smoke、PDF smoke を通します。
2. `sample-outputs/` を同期します。
3. private tree で release check、dependency audit、secret scan を実行します。
4. clean import を作成します。
5. clean tree でも release check、tests、frontend checks、secret scan を実行します。
6. human review が必要な content、asset、PDF metadata、Google Docs links を確認します。

## Representative Output Policy

`sample-outputs/` contains reviewed examples of the packaged result:

- `sample-outputs/html/index.html`
- `sample-outputs/html/content/*.html`
- `sample-outputs/html/site_libs/`
- `sample-outputs/html/src/`
- `sample-outputs/html/fonts/`
- `sample-outputs/html/assets/`
- `sample-outputs/pdf/*.pdf`

The active build output under `out/` remains disposable and is not part of the
release package.

## Acceptance Checks

- Backend starts from `.env.example`-derived configuration.
- Admin login works.
- Invited editor login works.
- Invited editors cannot access admin-only settings or build actions.
- Google integration can remain unconfigured without breaking local editing or
  builds.
- API docs remain disabled unless `EXPOSE_API_DOCS=true` is set explicitly.
- HTML and PDF smoke renders succeed.
- Production-like compose serves through the UI/Nginx service and does not
  publish API port `8000` by default.

## Pre-Tag Checklist

- No secrets or credential files are tracked.
- Public docs describe the same boundary enforced by the clean-import manifests.
- `sample-outputs/` contains only reviewed representative outputs.
- `bash scripts/release_check.sh` passes.
- HTML and PDF smoke checks pass.
- Content, assets, and sample outputs have been reviewed by a human.
- Generated PDF metadata has been refreshed for the release.
- Google Docs links have been reviewed for public exposure.
- The clean import has been checked before any public push.
- No public repository push or tag push happens without explicit confirmation.

日本語での pre-tag 確認:

- secret や credential file が tracked file に含まれていないこと。
- public docs と clean-import manifests が同じ公開境界を説明していること。
- `sample-outputs/` が reviewed representative outputs だけを含むこと。
- release check、HTML/PDF smoke、secret scan、human rights review が完了して
  いること。
- public push と tag push は明示確認後にだけ実行すること。
