# Repository Audit Report

Audit snapshot: 2026-05-16  
Repository: `yoshikishirakawa/AJMUN_BG_quarto-3`  
Base branch / commit inspected: `main` / `6ea85abd980b47c3434974ed75b695ce13148f61`  
Working branch: `audit/repository-hardening-and-improvements`

## Follow-up status after PR #28

Resolved:
- `api/requirements.lock` introduced.
- PR-focused CI workflow added.
- Pages deployment separated from PR verification.
- `release_check.sh` now requires audit/readiness documents.
- `api/services/public_errors.py` introduced.
- Initial sensitive-fragment tests added.

Remaining blockers before public clean import:
- Docker API images require `COPY api/ /app/api/` before editable install.
- Lockfile should be regenerated under Python 3.11.
- `docs.py::sync_all_docs()` and `build.py::open_in_finder()` need final response sanitization.
- `scripts/create_public_import.sh` should align its final forbidden-path check with `exclude_manifest.txt`.
- Full verification must be performed in the private tree and the generated clean-import tree.

## 1. Executive Summary

This audit reviewed AJMUN BG Editor as a pre-publication and pre-clean-import hardening pass. The repository combines a FastAPI backend, a Vite/React editor UI, a Quarto/Pandoc/LaTeX publishing pipeline, Google Docs/OAuth integration, Docker runtime profiles, representative sample outputs, and release/publication tooling.

No confirmed Critical vulnerability was identified from the static inspection performed through the GitHub connector. The strongest remaining risks are operational and release-process risks: Python dependency resolution is not locked as strictly as npm dependency resolution, local commands could not be executed in this audit environment, some API exceptions should be sanitized further, and public release must continue to use the clean-import path rather than publishing the private repository history directly.

This PR intentionally applies only low-risk changes: new audit/release-readiness documents, public-manifest inclusion for those documents, README navigation updates, and `.gitignore` hygiene for common local tooling caches. Large behavior changes are documented as follow-up work.

Important limitation: `scripts/release_check.sh` was inspected but not modified in this PR. The script is large and high-impact, and this connector-only environment does not provide a safe partial patch mechanism. Updating that script to require these new audit documents remains a follow-up task.

## 2. Repository Overview

### Purpose

AJMUN BG Editor is a document-engineering system for producing background guides for the 37th All Japan Model United Nations Conference. It imports chapters drafted in Google Docs as Markdown with project-specific commands, builds HTML via Quarto, and typesets PDF via LaTeX/Pandoc from a single project tree.

### Main components

- `api/`: FastAPI backend, authentication, Google Docs/OAuth integration, build control, project/config management, upload handling, and output serving.
- `ui-next/`: Vite + React + TypeScript frontend with editor/settings/auth/project workflows.
- `content/`, `filters/`, `meta/`, `src/`, `_templates/`: Quarto/Pandoc/LaTeX/source assets used by the publishing pipeline.
- `scripts/`: release checks, public import tooling, PDF/HTML helpers, asset sync, and build utilities.
- `docker/` and `docker-compose*.yml`: development, production-like, PDF-enabled, and demo runtime configurations.
- `sample-outputs/`: reviewed representative HTML/PDF outputs for public inspection.
- `docs/`: setup, distribution, release, publication, configuration, API exposure, troubleshooting, audit, and public-release documentation.

### Technology stack

- Backend: Python 3.11+, FastAPI, Pydantic v2, Uvicorn, Google API clients, Pillow, aiofiles, httpx.
- Frontend: React 19, TypeScript, Vite, Tailwind CSS, Radix/shadcn-style primitives, Vitest, Playwright.
- Publishing: Quarto, Pandoc, Lua filters, LaTeX/LuaLaTeX/latexmk, Python post-processing scripts.
- DevOps: Docker Compose, GitHub Actions, npm lockfiles, gitleaks, npm audit, pip-audit in CI.

## 3. Verified Commands

The GitHub connector allowed repository inspection and write operations. The local execution container used for this audit could not resolve `github.com`, so local clone/install/build/test execution was not possible. Existing CI should be treated as the verification source of truth for this PR.

| Command | Result | Notes |
|---|---:|---|
| `git ls-remote https://github.com/yoshikishirakawa/AJMUN_BG_quarto-3.git HEAD` | Failed | Local execution container could not resolve `github.com`; repository access was performed through the GitHub connector. |
| GitHub connector repository lookup | Passed | Confirmed repository, default branch `main`, private visibility, and admin/push permissions. |
| Static inspection of README, manifests, env examples, workflows, API files, auth services, upload validation, build runner, project router, tests, Docker/workflow references | Passed | Inspected representative source and configuration files through GitHub file APIs. |
| `PYTHONPATH=. pytest -q` | Not run | Requires local clone and dependency installation; expected to run in CI. |
| `npm run build:reader-ui` | Not run | Requires local clone and npm install; expected to run in CI. |
| `npm --prefix ui-next run lint` | Not run | Requires local clone and npm install; expected to run in CI. |
| `npm --prefix ui-next run test:run` | Not run | Requires local clone and npm install; expected to run in CI. |
| `npm --prefix ui-next run build` | Not run | Requires local clone and npm install; expected to run in CI. |
| `bash scripts/release_check.sh` | Not run | Requires local clone and sample-output tree; expected to run in CI or locally by a maintainer. |
| `docker compose config` | Not run | Requires local clone and Docker; expected to run in CI or locally by a maintainer. |

## 4. Key Findings

| ID | Severity | Target | Finding | PR action |
|---|---|---|---|---|
| C-01 | Critical | Repository-wide | No confirmed Critical issue from static inspection. | No code fix required. |
| H-01 | High | Verification workflow | This audit session could not execute local install/build/test commands because the runtime cannot clone the private repository. | Documented; CI remains required source of truth. |
| H-02 | High | Python dependencies | Python dependencies are version-ranged in `api/pyproject.toml`; no Python lockfile equivalent to npm lockfiles was observed. | Documented for follow-up. |
| H-03 | High | Publication process | Clean import must remain mandatory; do not publish private history directly. | New audit docs added to public manifest. |
| M-01 | Medium | API error handling | Some authenticated/admin endpoints may still propagate raw exception strings. | Documented for targeted follow-up. |
| M-02 | Medium | Build logs/cache | In-memory build logs and full-file hashing can grow with long builds or large inputs. | Documented for follow-up. |
| M-03 | Medium | Auth rate limiting | Login rate limiting is process-local only. | Documented for follow-up. |
| M-04 | Medium | CI/CD | PR verification and Pages deployment are coupled in the current workflow layout. | Documented for follow-up. |
| M-05 | Medium | Release checks | `scripts/release_check.sh` should be extended to require the new audit documents. | Not changed in this PR; follow-up. |
| L-01 | Low | `.gitignore` | Common Python/tooling caches were not fully listed. | Fixed in this PR. |
| L-02 | Low | Docs navigation | New audit documents were absent from README and public manifest because they did not yet exist. | Fixed in this PR. |
| F-01 | Future | UI/UX | Editor UX can be improved with more explicit disabled-state messaging and accessibility coverage. | Documented. |
| F-02 | Future | Architecture | Long-term separation of editor state, publication pipeline, and deployment profiles would reduce coupling. | Documented. |

## 5. Critical Findings

### C-01: No confirmed Critical issue in the inspected snapshot

- **Severity:** Critical
- **Target:** Repository-wide
- **Problem:** Static inspection did not identify a confirmed issue that requires immediate blocking remediation before a reviewable hardening PR can be opened.
- **Impact:** None confirmed.
- **Recommended fix:** Continue to rely on CI, secret scanning, clean-import validation, dependency audits, and manual review before publication.
- **Handled in this PR:** No direct code fix.
- **Verification method:** Review CI, gitleaks results, clean-import diff, dependency audits, and final release checklist before publishing.

## 6. High Priority Findings

### H-01: Full local execution was not possible in this audit environment

- **Severity:** High
- **Target:** Verification process
- **Problem:** The local execution container could not resolve GitHub DNS and therefore could not clone or execute repository commands locally.
- **Impact:** The audit can document static findings and make low-risk repository changes, but it cannot honestly claim that install/build/test/lint commands passed in this session.
- **Recommended fix:** Treat GitHub Actions and a maintainer local run as required verification gates before merge.
- **Handled in this PR:** Documented in this report and PR description.
- **Verification method:** Run the PR checks and locally execute the commands listed in `README.md` and `CONTRIBUTING.md`.

### H-02: Python dependency locking is weaker than npm dependency locking

- **Severity:** High
- **Target:** `api/pyproject.toml`, dependency management, CI
- **Problem:** Python dependencies are expressed as lower-bound ranges. npm dependencies have lockfiles, but no Python lock artifact was observed during this connector-based audit.
- **Impact:** Reproducibility and vulnerability triage can vary over time as transitive Python dependencies change.
- **Recommended fix:** Adopt a reviewed Python lock workflow such as `uv.lock`, `requirements.lock`, or pip-tools output. Use the lock in CI and Docker builds after compatibility review.
- **Handled in this PR:** Not implemented; this can affect Docker/CI behavior and should be separately reviewed.
- **Verification method:** Rebuild from the lock in CI, run `pip-audit` against the resolved environment, and confirm Docker images use the same resolution.

### H-03: Clean import must remain mandatory for public release

- **Severity:** High
- **Target:** `public_manifest.txt`, `exclude_manifest.txt`, private repository contents
- **Problem:** The private repository contains working-state, archive, and private-only material that should not be released by publishing history directly.
- **Impact:** Public release from full history could expose draft-only material, generated artifacts, local state, or context not intended for distribution.
- **Recommended fix:** Continue using `scripts/create_public_import.sh` and require final review of included files before publishing. Do not make the private repository public directly.
- **Handled in this PR:** New audit documents are added to the public manifest; broader release boundary remains documented rather than changed.
- **Verification method:** Run the clean import script, inspect resulting tree, run release checks inside the import, and review `git status` before first public push.

## 7. Medium Priority Findings

### M-01: Some authenticated exception messages may expose internal paths or implementation details

- **Severity:** Medium
- **Target:** API routers and Google OAuth/build endpoints
- **Problem:** Some endpoints return `str(e)` from lower-level exceptions. This can reveal local paths, dependency state, or implementation details to authenticated users.
- **Impact:** Exposure is limited by authentication, but it is still undesirable for a public-supportable tool.
- **Recommended fix:** Introduce sanitized public error messages with structured internal logging. Keep detailed paths in logs, not API responses, except when explicitly needed for local admin diagnosis.
- **Handled in this PR:** Not implemented; it requires endpoint-by-endpoint behavior review.
- **Verification method:** Add tests that assert public error details do not include credential paths, home directories, raw token filenames, or stack traces.

### M-02: Build logs and cache behavior can grow under large inputs

- **Severity:** Medium
- **Target:** `api/services/build_runner.py`
- **Problem:** Build logs are retained in memory per build ID, and cache hashing reads entire file contents into memory.
- **Impact:** Long-running builds or large files can increase memory pressure.
- **Recommended fix:** Cap in-memory logs, persist build logs to scoped files if needed, stream hashes in chunks, and add retention cleanup.
- **Handled in this PR:** Not implemented; behavior change should be tested.
- **Verification method:** Add stress tests using large dummy files and long simulated command output.

### M-03: Login rate limiting is process-local only

- **Severity:** Medium
- **Target:** `api/routers/auth.py`
- **Problem:** Failed login attempts are tracked in memory by client host and reset on process restart.
- **Impact:** It reduces accidental brute-force attempts in local/small deployments but is not sufficient behind multiple workers, restarts, or proxies without trusted client IP handling.
- **Recommended fix:** Document supported deployment assumptions; for public deployments add reverse-proxy rate limiting or persistent/distributed rate limiting.
- **Handled in this PR:** Documented only.
- **Verification method:** Add deployment docs and tests for expected 429 behavior under single-process mode.

### M-04: PR verification and Pages deployment are coupled

- **Severity:** Medium
- **Target:** `.github/workflows/pages.yml`
- **Problem:** A strong verification job exists, but it is located in a Pages workflow that also deploys representative samples from `main`.
- **Impact:** Quality checks are present, but a separate PR-focused CI workflow would make review status easier to reason about.
- **Recommended fix:** Add a dedicated `ci.yml` for PR verification and keep Pages deployment focused on publishing samples after successful validation.
- **Handled in this PR:** Not implemented to avoid duplicating CI load without local verification.
- **Verification method:** Confirm PR status checks include Python tests, root bundle build, UI lint/test/build, release checks, dependency audits, and compose validation.

### M-05: Release check should require the new audit documents

- **Severity:** Medium
- **Target:** `scripts/release_check.sh`
- **Problem:** The new audit documents are not yet required by `scripts/release_check.sh`.
- **Impact:** A future release could accidentally omit the audit/reporting documents from a clean import without the release script catching it.
- **Recommended fix:** Add `check_required_file` entries for `docs/AUDIT_REPORT.md`, `docs/IMPROVEMENT_PLAN.md`, `docs/PUBLIC_RELEASE_CHECKLIST.md`, and optionally `docs/PR_DESCRIPTION.md`.
- **Handled in this PR:** Not implemented. The script is large and high-impact, and this connector-only environment does not provide a safe partial patch workflow.
- **Verification method:** After the follow-up change, run `bash scripts/release_check.sh` locally and in CI.

## 8. Low Priority Findings

### L-01: `.gitignore` did not list several common local caches

- **Severity:** Low
- **Target:** `.gitignore`
- **Problem:** Common Python/test/type-checker/cache paths such as `.pytest_cache/`, `.ruff_cache/`, `.mypy_cache/`, `.pyre/`, `.coverage`, `htmlcov/`, and virtualenv names were not explicitly ignored.
- **Impact:** Low risk of accidental local noise in future changes.
- **Recommended fix:** Add common tool cache ignores.
- **Handled in this PR:** Yes.
- **Verification method:** Inspect `.gitignore` and ensure no generated cache files are staged.

### L-02: Audit documents were absent from docs navigation and public manifest

- **Severity:** Low
- **Target:** `README.md`, `public_manifest.txt`
- **Problem:** The user-requested audit artifacts did not yet exist and therefore were not part of README navigation or public import manifests.
- **Impact:** Future maintainers would not know where to find audit status or public release readiness requirements.
- **Recommended fix:** Add the documents and include them in README and public manifest.
- **Handled in this PR:** Yes.
- **Verification method:** Inspect README and run the clean-import process.

## 9. Security Review

### Positive controls observed

- Default and production-like configuration distinguish regular authenticated operation from local demo bypass.
- Production configuration validation rejects unsafe deployment values.
- Session cookies can be forced secure in production.
- CORS origins are explicit and validated for production.
- API docs are disabled unless intentionally exposed.
- Google OAuth state is generated, persisted in session, and verified before token exchange.
- OAuth token endpoint responses do not expose access/refresh tokens through router response models.
- Google credentials can be stored outside the repository in production.
- Uploads are bounded by byte size, extension, MIME type, magic bytes, and actual image decoding.
- SVG upload is not accepted in the inspected upload validation path.
- Path traversal is mitigated for output serving and uploaded image operations.
- Build cleanup refuses unsafe roots and allows only project-scoped paths or `/tmp/ajmun-bg-editor`.
- GitHub Actions include gitleaks, npm audit, and pip-audit.

### Security concerns and follow-up tasks

- Add a Python dependency lock workflow to make dependency audits reproducible.
- Add a sanitized error-response policy and tests for secrets/path leakage.
- Consider reverse-proxy or persistent rate limiting if the app is exposed beyond controlled local/editor use.
- Review all private-only files before clean import; do not publish private repository history.
- Keep Google credential directories repository-external in any production-like deployment.
- Confirm sample output metadata and embedded links do not expose private document IDs, local paths, or authoring-only URLs.

No secret values were printed or copied into this report.

## 10. Architecture Review

The repository is organized around a practical but broad integration boundary: editor UI, API, document import, build orchestration, Quarto/Pandoc/LaTeX rendering, and release packaging. The current structure is understandable, but the domain boundaries are still partly operational rather than strictly layered.

Strengths:

- Backend service modules separate auth, runtime config, upload validation, project store, and build runner concerns.
- The public import manifests create a clear operational boundary between private working tree and public release surface.
- Docker profiles make development, PDF rendering, production-like, and demo workflows explicit.
- Tests exist for several hardening-sensitive components, including auth, file safety, runtime configuration, build validation, upload validation, and public readiness.

Weaknesses:

- Build orchestration still has broad filesystem and subprocess responsibility inside one service.
- Build-log persistence, artifact retention, queueing, and cancellation semantics remain mixed with command execution.
- A formal API contract/schema lifecycle is not yet a first-class release artifact.
- Private/public boundaries depend on manifests and human discipline rather than an always-on policy test for every file category.

## 11. UI / UX Review

The UI is a React/Vite editor for a specialized publication workflow. This audit session did not run the UI, so the assessment is based on static repository inspection and existing test/configuration evidence.

Observed strengths:

- Frontend has dedicated lint/test/build scripts.
- Auth callback and store tests exist.
- Playwright configuration and at least one settings E2E spec exist.
- README distinguishes normal authenticated mode from local demo bypass.

Potential improvements:

- Make disabled raw-config editor states explicit in the UI.
- Add clearer build history, including last command, duration, output location, and failure class.
- Improve empty/loading/failed/completed states for Google OAuth, project loading, build execution, and sample output sync.
- Expand keyboard navigation and accessibility checks for editor/settings dialogs.
- Treat demo mode as visually unmistakable.

## 12. Performance Review

Potential bottlenecks:

- Large file hashes in `BuildCache` currently read full contents at once.
- Build logs are retained in memory for active/completed build IDs until removed.
- Quarto/PDF rendering is necessarily expensive and environment-dependent.
- Sample-output synchronization and representative asset checks can become expensive as bundled outputs grow.

Recommended improvements:

- Stream hashes in chunks.
- Cap build logs or store them in scoped files with retention.
- Add timeout and cancellation tests around subprocess handling.
- Add representative large-input smoke tests for upload, project config, build log streaming, and image listing.

## 13. Testing and CI Review

Observed positives:

- Python tests, UI lint/test/build, root reader UI bundle build, release checks, Docker Compose validation, npm audit, pip-audit, and gitleaks are represented in GitHub Actions.
- Tests appear to cover several security-sensitive areas: runtime config, upload validation, file safety, auth, build validation, Google credential directories, and public readiness.

Gaps:

- This audit session could not execute the commands locally.
- Python dependency resolution is not locked in the same way as npm dependencies.
- Dedicated PR CI could be separated from Pages deployment.
- Security tests should assert that sanitized API errors do not leak sensitive paths or token filenames.
- Release checks should be extended to require these audit documents.

## 14. Documentation Review

Strong existing documentation:

- `README.md`
- `SECURITY.md`
- `CONTRIBUTING.md`
- `docs/setup_guide.md`
- `docs/DISTRIBUTION.md`
- `docs/RELEASE_RUNBOOK.md`
- `docs/PUBLICATION_RUNBOOK.md`
- `docs/CONFIG_REFERENCE.md`
- `docs/AUTH_MODEL.md`
- `docs/API_EXPOSURE_AUDIT.md`
- `docs/KNOWN_LIMITATIONS.md`
- `docs/TROUBLESHOOTING.md`

Documents added by this PR:

- `docs/AUDIT_REPORT.md`
- `docs/IMPROVEMENT_PLAN.md`
- `docs/PUBLIC_RELEASE_CHECKLIST.md`
- `docs/PR_DESCRIPTION.md`

Recommended future documents:

- `docs/DEPENDENCY_LOCKING.md`
- `docs/ERROR_HANDLING_POLICY.md`
- `docs/CI_STATUS_POLICY.md`
- GitHub issue templates after the public support model is fixed.

## 15. Public Release Readiness

Current readiness: **not ready to publish by simply making the private repository public**; **plausibly ready for a clean-import review workflow after CI passes and final human checks are completed**.

Blocking release requirements:

- Run and pass CI on this PR.
- Run the full local release checks in a clean checkout.
- Generate the clean import and inspect the resulting file tree.
- Confirm no private notes, credentials, local state, private Google Docs IDs, credential filenames containing values, or unreviewed generated artifacts are included.
- Review content/image/font/PDF rights and metadata.
- Confirm production settings are non-runnable without explicit secrets.
- Confirm sample outputs are intentionally distributable.

## 16. Recommended Roadmap

### Immediate

- Merge low-risk audit docs and hygiene changes after CI passes.
- Run local install/build/test/lint/release commands in a clean checkout.
- Confirm clean-import output against `public_manifest.txt` and `exclude_manifest.txt`.
- Add the new audit docs to `scripts/release_check.sh` in a separate safe patch.

### Short term

- Add Python dependency locking.
- Add sanitized error handling policy and tests.
- Split PR CI from Pages deployment.
- Add a final clean-import smoke test in CI if feasible.

### Medium term

- Cap/persist build logs and stream file hashing.
- Add accessibility and keyboard-navigation tests for the UI.
- Add issue/PR templates once public support expectations are fixed.
- Add a formal release artifact provenance note.

### Long term

- Consider separating document import, editor state, build orchestration, and artifact publication into clearer service boundaries.
- Consider desktop packaging only after the API/file-access threat model is separately reviewed.
- Consider a typed API contract and frontend client generation if external contributors grow.

## 17. Appendix

### Inspected representative files

- `README.md`
- `public_manifest.txt`
- `.env.example`
- `.env.prod.example`
- `.gitignore`
- `.github/workflows/pages.yml`
- `.github/workflows/security.yml`
- `package.json`
- `ui-next/package.json`
- `api/pyproject.toml`
- `api/main.py`
- `api/routers/auth.py`
- `api/routers/project.py`
- `api/services/app_auth.py`
- `api/services/google_auth.py`
- `api/services/runtime_config.py`
- `api/services/upload_validation.py`
- `api/services/build_runner.py`
- `scripts/release_check.sh`
- representative tests discovered under `api/tests/`, `tests/`, and `ui-next/`

### Non-goals of this PR

- No framework migration.
- No DB/storage schema migration.
- No authentication redesign.
- No desktop packaging implementation.
- No destructive cleanup of repository history or private files.
- No dependency major-version upgrades.
- No large UI redesign.
