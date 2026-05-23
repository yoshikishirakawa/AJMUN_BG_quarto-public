# Improvement Plan

Audit snapshot: 2026-05-16  
Repository: `yoshikishirakawa/AJMUN_BG_quarto-3`  
Branch: `audit/repository-hardening-and-improvements`

## 1. Goals

- Make the repository easier for a third party to inspect, set up, test, and publish through a clean import.
- Preserve the existing working behavior while reducing publication, security, and maintenance risk.
- Keep this PR low risk: documentation, repository hygiene, README navigation, and public-boundary updates.
- Make unresolved risks explicit and actionable.
- Avoid destructive changes, broad rewrites, or changes that require production data/credential migration.

## 2. Non-goals

- Do not make the private repository public directly.
- Do not rewrite the FastAPI, React, Quarto, or Docker architecture.
- Do not implement desktop/Tauri packaging in this PR.
- Do not change Google OAuth scopes, auth model, or credential storage semantics without separate review.
- Do not rotate, delete, or modify real credentials or user data.
- Do not update dependencies blindly without local and CI compatibility verification.
- Do not commit generated build artifacts beyond already-reviewed representative samples.
- Do not patch the large `scripts/release_check.sh` file through a connector-only partial-edit workflow; handle that as a separate local patch.

## 3. Immediate Fixes

| ID | Task | Target | Status | Verification |
|---|---|---|---|---|
| IF-01 | Add repository audit report | `docs/AUDIT_REPORT.md` | Done in this PR | Review document and CI. |
| IF-02 | Add improvement plan | `docs/IMPROVEMENT_PLAN.md` | Done in this PR | Review document and roadmap. |
| IF-03 | Add public release checklist | `docs/PUBLIC_RELEASE_CHECKLIST.md` | Done in this PR | Use checklist before clean import. |
| IF-04 | Add PR body for manual fallback | `docs/PR_DESCRIPTION.md` | Done in this PR | Compare with opened PR body. |
| IF-05 | Include new audit docs in public manifest | `public_manifest.txt` | Done in this PR | Run clean-import and inspect resulting tree. |
| IF-06 | Add README navigation to new docs | `README.md` | Done in this PR | Inspect README rendered view. |
| IF-07 | Ignore common local cache/tooling files | `.gitignore` | Done in this PR | Confirm no cache files are staged. |
| IF-08 | Require new docs in release check | `scripts/release_check.sh` | Deferred | Patch locally in a separate follow-up and run `bash scripts/release_check.sh`. |

## 4. Short-term Improvements

### ST-01: Run full local verification in a clean checkout

Execute:

```bash
cp .env.example .env
# set ADMIN_SECRET and SESSION_SECRET
PYTHONPATH=. pytest -q
npm ci
npm run build:reader-ui
npm --prefix ui-next ci
npm --prefix ui-next run lint
npm --prefix ui-next run test:run
npm --prefix ui-next run build
bash scripts/release_check.sh
docker compose config
```

For PDF-related changes:

```bash
bash scripts/check_pdf_env.sh --render-html-smoke
bash scripts/check_pdf_env.sh --render-pdf-smoke
```

Acceptance criteria:

- All commands pass or failures are documented with environment-specific causes.
- No generated caches, `out/`, `.env`, credential files, or local state are staged.

### ST-02: Add Python dependency locking (Resolved)

Implemented:
- `requirements.lock` regenerated under Python 3.11 with pip-tools.
- Upgraded transitive dependency `starlette` to `1.0.1` to resolve vulnerability `PYSEC-2026-161` found by `pip-audit`.

Acceptance criteria:
- CI installs Python dependencies from a reviewed lock/constraints artifact. (Pass)
- `pip-audit` runs against the same resolved environment. (Pass - No known vulnerabilities found)
- Docker builds do not silently resolve a materially different dependency graph. (Pass)

### ST-03: Add sanitized API error policy (Resolved)

Implemented:
- Integrated `public_http_error()` utility inside `docs.py::sync_all_docs()` and `build.py::open_in_finder()`.
- Fixed core routing precedence issue in `docs.py` where `/sync/all` was overridden by `/sync/{doc_id}`.
- Added a robust test suite covering edge-cases (Google Docs sync failure, open-in-finder CalledProcessError failure, Google token refresh failure) asserting no leakage of local paths, credential filenames, or stack traces in `api/tests/test_public_error_sanitization.py`.

Acceptance criteria:
- Authenticated API responses do not expose token paths, credential paths, home directories, stack traces, or local filesystem internals unless a route explicitly documents that behavior. (Pass)
- Tests cover representative failure cases. (Pass)

### ST-04: Split PR CI from Pages deployment

Add a dedicated PR workflow such as `.github/workflows/ci.yml` that runs verification without deploying Pages artifacts.

Acceptance criteria:

- Pull requests show clear quality gates.
- Pages deployment remains limited to `main` or manual dispatch.
- Validation steps remain deduplicated enough to avoid excessive CI time.

### ST-05: Extend release checks for audit documents

Add required-file checks for:

- `docs/AUDIT_REPORT.md`
- `docs/IMPROVEMENT_PLAN.md`
- `docs/PUBLIC_RELEASE_CHECKLIST.md`
- `docs/PR_DESCRIPTION.md` if the repository keeps PR-body fallbacks in-tree

Acceptance criteria:

- `bash scripts/release_check.sh` fails if the new release-readiness documents are missing.
- The patch is made from a local checkout to avoid accidental truncation of the large release-check script.

## 5. Medium-term Improvements

### MT-01: Build log retention and memory control

- Cap in-memory log lines per build.
- Persist full logs to a scoped ignored directory if needed.
- Add retention cleanup by age/count.
- Ensure cancellation removes process references and does not leak log state.

### MT-02: Streaming hash implementation

- Replace full-file `read_bytes()` hashing in build cache with chunked hashing.
- Add tests with large dummy files.

### MT-03: UI state hardening

- Add explicit banners for demo/auth-bypass mode.
- Improve disabled-state messaging for raw config editor and Google integration.
- Show last build status, command, duration, output path, and failure reason.
- Expand accessibility and keyboard navigation coverage.

### MT-04: Clean-import verification automation

- Add a CI job or script mode that creates a temporary clean import and verifies that release checks pass inside it.
- Add checks for forbidden private paths and common secret filenames.

### MT-05: Structured API contract

- Treat OpenAPI output as a reviewed artifact for frontend/backend coupling.
- Consider generated TypeScript API clients after the endpoint surface stabilizes.

## 6. Long-term Improvements

### LT-01: Clearer domain boundaries

Separate the system conceptually and, where useful, physically into:

- editor/project state,
- Google Docs import,
- Quarto/Pandoc transformation,
- PDF rendering,
- artifact publication,
- sample-output packaging.

### LT-02: Desktop packaging threat model

Before Tauri/Electron distribution:

- Define local file access boundaries.
- Define IPC command allowlists.
- Disable or gate raw config editing.
- Review embedded server exposure and loopback binding.
- Add updater/signing/release artifact provenance checks.

### LT-03: Multi-user/public deployment model

If the app is used beyond controlled local/editor deployments:

- Replace process-local rate limiting with reverse-proxy or distributed limiting.
- Add persistent audit logs with retention.
- Define roles beyond admin/invited editor if needed.
- Add backup/restore guidance for project state and credentials.

## 7. Security Hardening Plan

### Current controls to preserve

- Keep `.env`, `.credentials/`, `config/auth.json`, OAuth client secrets, token files, PEM/key files, generated outputs, and local editor state ignored.
- Keep auth bypass disabled by default and forbidden in production.
- Keep production secrets empty in `.env.prod.example`.
- Keep production CORS and redirect URIs explicit and HTTPS-only.
- Keep API docs disabled unless intentionally exposed.
- Keep SVG upload disallowed.
- Keep Google OAuth token response models status-only.
- Keep BuildRunner deletion guards and command timeouts.
- Keep gitleaks and dependency audits in CI.

### New security tasks

1. Add Python dependency lock workflow.
2. Add sanitized error tests.
3. Add clean-import forbidden-file checks.
4. Add sample-output metadata/link review to release checklist.
5. Add reverse-proxy rate limiting guidance for any public deployment.
6. Periodically run a secret scan against both private history and clean-import output.

## 8. Testing Plan

### Backend

- Runtime config validation tests.
- Auth login/session/invite tests.
- OAuth state and redirect URI validation tests.
- Upload validation tests for size, MIME mismatch, magic-byte mismatch, SVG rejection, and decompression bombs.
- File-safety tests for path traversal, absolute paths, unsafe deletes, and output serving.
- BuildRunner timeout/cancellation/log-retention tests.

### Frontend

- Auth store and callback tests.
- Settings and project-editing component tests.
- Build workflow tests with mocked API failures.
- Accessibility smoke tests for dialogs and editor panels.
- Playwright happy path for login, project load, edit, build request, output listing.

### Release/publication

- `scripts/release_check.sh`.
- clean-import generation and diff review.
- sample-output dependency integrity check.
- secret scan of clean-import tree.
- dependency audits for root npm, UI npm, and Python.

## 9. Documentation Plan

### Keep current docs authoritative

- `README.md`: project overview and primary entry point.
- `docs/setup_guide.md`: setup and development modes.
- `docs/DISTRIBUTION.md`: public/private boundary.
- `docs/RELEASE_RUNBOOK.md`: release process.
- `docs/PUBLICATION_RUNBOOK.md`: clean import procedure.
- `SECURITY.md`: security policy and reporting.
- `CONTRIBUTING.md`: contributor workflow.

### Add or expand later

- `docs/DEPENDENCY_LOCKING.md`
- `docs/ERROR_HANDLING_POLICY.md`
- `docs/CI_STATUS_POLICY.md`
- GitHub issue templates
- GitHub pull request template
- Desktop packaging threat model if Tauri/Electron work begins

## 10. Release Readiness Checklist

Before public release:

- [ ] PR CI passes.
- [ ] Maintainer local clean checkout passes all relevant checks.
- [ ] `bash scripts/release_check.sh` passes.
- [ ] Dependency audits are reviewed.
- [ ] gitleaks or equivalent secret scan is reviewed.
- [ ] Clean import is generated from manifest.
- [ ] Clean import tree is manually inspected.
- [ ] No private notes, credentials, generated workspaces, local state, or unreviewed artifacts are included.
- [ ] Representative outputs are intentionally public.
- [ ] Content, image, PDF, and font rights are reviewed.
- [ ] PDF metadata and embedded links are reviewed.
- [ ] `.env.prod.example` remains non-runnable without explicit secrets.
- [ ] Demo/auth-bypass mode remains clearly local-only.
- [ ] Release tag and artifact provenance are documented.

## 11. Suggested Issues

### Issue 1: Add Python dependency locking

**Title:** Add reproducible Python dependency locking for API and Docker builds  
**Labels:** `security`, `dependencies`, `ci`  
**Acceptance criteria:** CI and Docker install from a reviewed lock/constraints file; `pip-audit` uses the same resolved graph.

### Issue 2: Sanitize API error responses

**Title:** Introduce sanitized API error responses and path/secret leakage tests  
**Labels:** `security`, `backend`, `tests`  
**Acceptance criteria:** Public API errors do not expose local paths, credential filenames, stack traces, or token details; internal logs retain actionable diagnostics.

### Issue 3: Split CI and Pages workflows

**Title:** Add PR-focused CI workflow separate from Pages deployment  
**Labels:** `ci`, `maintenance`  
**Acceptance criteria:** PRs run verification without Pages deployment coupling; `main` deployment remains gated on successful checks.

### Issue 4: Add clean-import smoke verification

**Title:** Automate clean-import generation and forbidden-file checks  
**Labels:** `release`, `security`  
**Acceptance criteria:** Script or CI job builds a temporary public tree and asserts no forbidden files/patterns are present.

### Issue 5: Cap build logs and stream cache hashing

**Title:** Reduce BuildRunner memory pressure for long builds and large files  
**Labels:** `performance`, `backend`  
**Acceptance criteria:** Build logs are capped or persisted with retention; file hashes are computed in chunks; stress tests cover large files.

### Issue 6: Improve UI status and accessibility coverage

**Title:** Improve editor build/auth/config states and accessibility tests  
**Labels:** `frontend`, `ux`, `accessibility`  
**Acceptance criteria:** Disabled/error/loading/completed states are explicit; keyboard and accessibility smoke tests are added.
