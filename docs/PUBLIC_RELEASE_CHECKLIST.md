# Public Release Checklist

Use this checklist before publishing a clean public import of AJMUN BG Editor. Do not publish the private repository history directly.

## Repository Hygiene

- [ ] Public release is produced from a clean import, not by making the private working repository public.
- [ ] `public_manifest.txt` includes every intended public file and directory.
- [ ] `exclude_manifest.txt` excludes private-only, generated, local, and credential-related paths.
- [ ] No private planning notes, scratch documents, temporary files, local editor state, or generated workspaces are present in the clean import.
- [ ] `git status --short` is clean before tagging or pushing the public release.
- [ ] No build artifacts outside reviewed representative outputs are staged.
- [ ] No `.DS_Store`, cache directories, virtualenvs, `node_modules`, or test-output directories are staged.
- [ ] Repository description, topics, and visibility are intentional.

## Documentation

- [ ] `README.md` accurately describes purpose, stack, setup, execution, tests, outputs, security notes, and license boundaries.
- [ ] `docs/setup_guide.md` is current.
- [ ] `docs/DISTRIBUTION.md` describes public/private boundaries.
- [ ] `docs/RELEASE_RUNBOOK.md` describes release steps.
- [ ] `docs/PUBLICATION_RUNBOOK.md` describes clean import steps.
- [ ] `docs/AUDIT_REPORT.md` reflects the current release candidate.
- [ ] `docs/IMPROVEMENT_PLAN.md` lists unresolved risks and next tasks.
- [ ] `docs/PUBLIC_RELEASE_CHECKLIST.md` is completed for the release candidate.
- [ ] `SECURITY.md` has reporting and deployment guidance.
- [ ] `CONTRIBUTING.md` gives the required checks for contributors.
- [ ] Known limitations and troubleshooting docs are current.

## Security

- [ ] `.env` is absent.
- [ ] `.credentials/` is absent.
- [ ] `config/auth.json` is absent.
- [ ] `credentials.json`, `service_account.json`, `authorized_user.json`, `client_secret.json`, and `token.json` are absent.
- [ ] PEM/key/certificate files are absent unless intentionally public and documented.
- [ ] No API keys, OAuth tokens, cookies, passwords, private URLs, private Google Docs IDs, or internal endpoints are present.
- [ ] Secret scan has been run against the clean import.
- [ ] If any credential was ever exposed outside the clean import, it has been revoked or rotated.
- [ ] Production auth bypass is disabled.
- [ ] Demo auth-bypass mode remains local-only and clearly documented.
- [ ] API docs are disabled by default.
- [ ] CORS origins are explicit and not wildcarded for production.
- [ ] OAuth redirect URIs are explicit and HTTPS-only for production.
- [ ] Google credential directory is repository-external in production.
- [ ] Upload paths reject path traversal and unsupported executable/script formats.
- [ ] SVG upload remains disallowed unless a separate sanitizer/threat model is added.

## Dependencies

- [ ] Root `package-lock.json` is present and matches `package.json`.
- [ ] `ui-next/package-lock.json` is present and matches `ui-next/package.json`.
- [ ] `api/requirements.lock` is generated under Python 3.11 using pip-tools, and `pip-audit` runs successfully against it.
- [ ] `npm audit --audit-level=moderate` has been reviewed for the root package.
- [ ] `npm --prefix ui-next audit --audit-level=moderate` has been reviewed.
- [ ] `pip-audit` has been reviewed.
- [ ] Docker builds use deterministic package installation where feasible.
- [ ] No dependency major upgrade is included without compatibility review.

## Build and Test

- [ ] `PYTHONPATH=. pytest -q` passes.
- [ ] `npm ci` passes at repository root.
- [ ] `npm run build:reader-ui` passes.
- [ ] `npm --prefix ui-next ci` passes.
- [ ] `npm --prefix ui-next run lint` passes.
- [ ] `npm --prefix ui-next run test:run` passes.
- [ ] `npm --prefix ui-next run build` passes.
- [ ] `bash scripts/release_check.sh` passes.
- [ ] `docker compose config` passes.
- [ ] Production compose validation behaves as expected with `.env.prod.example` requiring missing secrets.
- [ ] For PDF releases, `bash scripts/check_pdf_env.sh --render-html-smoke` passes.
- [ ] For PDF releases, `bash scripts/check_pdf_env.sh --render-pdf-smoke` passes in an environment with TeX/Quarto installed.
- [ ] `docker compose build api` passes.
- [ ] `docker compose -f docker-compose.yml -f docker-compose.pdf.yml build api` passes.
- [ ] `PYTHONPATH=. pytest -q api/tests/test_public_error_sanitization.py` passes.
- [ ] API responses do not expose credential filenames, local paths, or stack traces.
- [ ] Clean-import tree has been generated and checked independently.

## CI/CD

- [ ] GitHub Actions pass on the final commit.
- [ ] Secret scanning workflow passes or findings are triaged privately.
- [ ] Dependency audit steps pass or accepted exceptions are documented.
- [ ] Pages deployment, if enabled, publishes only reviewed representative samples.
- [ ] Workflow permissions are least-privilege for each workflow.
- [ ] PR checks are clearly visible before merge.

## Licensing

- [ ] Root `LICENSE` covers application code.
- [ ] `CONTENT_LICENSE.md` covers manuscript text, images, sample outputs, and other content.
- [ ] `THIRD_PARTY_NOTICES.md` is current.
- [ ] Font licenses are included and referenced.
- [ ] Asset rights are reviewed in `docs/ASSET_RIGHTS_MANIFEST.md`.
- [ ] Sample PDFs/HTML outputs are distributable under the documented content terms.

## Examples

- [ ] `sample-outputs/index.html` exists.
- [ ] Representative HTML outputs are current and intentional.
- [ ] Representative PDF outputs are current and intentional.
- [ ] Sample outputs do not include private links, local absolute paths, unpublished notes, or credentials.
- [ ] Sample output metadata has been reviewed.
- [ ] Runtime assets in sample outputs are synchronized with source assets.

## Configuration

- [ ] `.env.example` contains only placeholder/empty secret values.
- [ ] `.env.prod.example` contains only placeholder/empty secret values and is not runnable as-is.
- [ ] `ADMIN_SECRET` and `SESSION_SECRET` are required for actual operation.
- [ ] `SESSION_COOKIE_SECURE=true` is used for production-like deployment.
- [ ] `ALLOWED_ORIGINS` and `ALLOWED_REDIRECT_URIS` are exact values in production.
- [ ] `ENABLE_RAW_CONFIG_EDITOR=false` in production-like settings.
- [ ] `AUTH_BYPASS_ENABLED=false` in production-like settings.
- [ ] Google integration can be disabled or configured intentionally.

## Release Artifacts

- [ ] Clean import has been generated.
- [ ] Clean import has been inspected manually.
- [ ] Release notes summarize changes, known limitations, and verification status.
- [ ] Release tag is created only after checks pass.
- [ ] Docker images or binaries, if published, have provenance and build instructions.
- [ ] Desktop artifacts, if ever added, are threat-modeled, signed, and separately reviewed.

## Final Manual Review

- [ ] Read the rendered README from the public import.
- [ ] Browse the clean import tree in GitHub UI before public announcement.
- [ ] Open representative sample HTML in a browser.
- [ ] Open representative PDF and inspect metadata.
- [ ] Confirm no private/confidential conference information is unintentionally exposed.
- [ ] Confirm no non-public Google Docs or Drive URLs are embedded.
- [ ] Confirm no generated or local-only files are included.
- [ ] Confirm unresolved findings in `docs/AUDIT_REPORT.md` and `docs/IMPROVEMENT_PLAN.md` are acceptable for release.
