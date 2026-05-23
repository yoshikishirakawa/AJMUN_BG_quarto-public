# Publication Runbook

This runbook describes how to prepare a public repository or public release
artifact from the private AJMUN BG Editor workspace.

## 日本語概要

この文書は、private workspace から公開 repo または公開 release artifact を
作るための手順です。このプロジェクトでは、原則として履歴ごと公開するのでは
なく、`public_manifest.txt` と `exclude_manifest.txt` に従って clean import を
作成します。

## Strategy

Use a clean import for public publication unless a history-aware secret scan
confirms that the full private history is safe to expose. A clean import is the
preferred path for this project because the private workspace may contain OAuth
state, generated outputs, local editor settings, internal notes, and sample
content that has not been reviewed for public distribution.

The public tree is built from `public_manifest.txt` and guarded by
`exclude_manifest.txt`. It should contain the supported editor, build pipeline,
public documentation, license files, and reviewed representative outputs. It
should not contain credentials, generated work areas, private planning notes,
or private-only helper utilities.

日本語での方針:

- private repo は作業場として扱います。
- public repo は clean import された配布物として扱います。
- 公開対象は supported editor、build pipeline、public docs、license、
  reviewed sample outputs に限定します。
- 認証情報、生成物、ローカル状態、内部メモ、公開不要な補助ファイルは含めません。

## Secret Scanning

Run a redacted scanner before publication. Do not paste detected values into
issues, pull requests, release notes, or chat summaries. Classify each finding
as rotated, false positive, removed, or private-local only.

Never publish `.env`, `.credentials/`, `config/auth.json`, Google OAuth client
secrets, `credentials.json`, `service_account.json`, `authorized_user.json`,
`client_secret.json`, or token files.

If a real credential has ever been exposed in public history, revoke or rotate
it. A clean import avoids publishing the old history, but it does not make an
already-exposed credential safe again.

日本語での注意点:

- secret scan の結果を issue、PR、release note、chat に値として貼らないで
  ください。
- 検出値は rotated、false positive、removed、private-local only などに分類
  します。
- 一度外部公開された credential は、ファイルを消すだけでなく revoke または
  rotate してください。

## Content And Asset Review

Review `CONTENT_LICENSE.md`, `docs/ASSET_RIGHTS_MANIFEST.md`, `content/`,
`assets/`, and `sample-outputs/` before publication. Confirm that manuscript
text, images, fonts, screenshots, PDFs, and HTML samples may be redistributed
under the documented terms.

Google Docs links may appear in the sample content only when they have been
explicitly reviewed and marked as acceptable in the rights documentation.

## Build And Test Verification

Run the normal release checks in the private workspace:

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

Record any failure before fixing it so the publication blocker remains
traceable.

## Docker Verification

Validate development, production-like, and PDF-capable compose files. The
production example intentionally leaves required secrets empty, so rendering
`docker-compose.prod.yml` with `.env.prod.example` should fail on missing
production secrets. A real `.env.prod` must provide strong secrets, exact HTTPS
origins, exact OAuth redirect URIs, secure cookies, and a repository-external
Google credentials directory.

## Representative Outputs

Regenerate representative HTML/PDF outputs only from reviewed sample content.
After reader runtime changes, run:

```bash
npm run build:reader-ui
python3 scripts/sync_output_runtime_assets.py --sync-sample-outputs
```

Confirm that `assets/reader-ui.js`, `sample-outputs/html/assets/reader-ui.js`,
and `sample-outputs/html/content/assets/reader-ui.js` are synchronized.

## Clean Import Procedure

Create the public tree:

```bash
bash scripts/create_public_import.sh
```

The default destination is `/private/tmp/ajmun-bg-public-clean`. In that tree:

```bash
git add .
bash scripts/release_check.sh
PYTHONPATH=. pytest -q
npm ci
npm run build:reader-ui
npm --prefix ui-next ci
npm --prefix ui-next run lint
npm --prefix ui-next run test:run
npm --prefix ui-next run build
gitleaks detect --source . --redact --no-git
```

Inspect the clean tree before publishing. Confirm that credentials, generated
work areas, private notes, and local machine state are absent.

日本語手順:

1. `bash scripts/create_public_import.sh` で clean tree を作成します。
2. clean tree 内で `git add .` して tracked file として検査できる状態にします。
3. release check、pytest、frontend checks、reader build、redacted gitleaks scan を
   実行します。
4. credential、生成物、private note、local machine state が含まれていないことを
   確認します。
5. public push と tag push は、最終確認後にだけ実行します。

## GitHub Repository Settings

Before publishing, confirm:

- repository visibility and default branch
- branch protection for `main`
- required checks for backend tests, frontend lint/test/build, release checks,
  and secret scanning
- least-privilege GitHub Actions permissions
- Pages or deployment settings expose only reviewed sample outputs

## Tagging And Rollback

Tag only after tests, release checks, redacted secret scans, Docker validation,
and content/license review are complete. Attach only reviewed artifacts.

If a secret, private link, or unapproved asset is published, immediately remove
or disable the public artifact, rotate or revoke affected credentials, and
republish from a newly verified clean import.
