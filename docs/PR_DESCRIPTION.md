## Summary

This PR adds a repository-wide audit report, improvement plan, public release checklist, and selected low-risk hardening changes.

## Changes

- Added `docs/AUDIT_REPORT.md`
- Added `docs/IMPROVEMENT_PLAN.md`
- Added `docs/PUBLIC_RELEASE_CHECKLIST.md`
- Added `docs/PR_DESCRIPTION.md` for manual PR-body fallback/reference
- Improved README navigation for audit/release-readiness documents
- Added the new audit documents to `public_manifest.txt`
- Expanded `.gitignore` for common local Python/test/tooling caches
- Documented follow-up work to extend `scripts/release_check.sh` for the new audit documents

## Verified

| Command | Result | Notes |
|---|---:|---|
| `git ls-remote https://github.com/yoshikishirakawa/AJMUN_BG_quarto-3.git HEAD` | Failed | Local execution container could not resolve `github.com`; repository access was performed through the GitHub connector. |
| GitHub connector repository lookup | Passed | Confirmed repository, `main` branch, private visibility, and write permissions. |
| Static inspection of representative repository files | Passed | Inspected README, manifests, env examples, workflows, API services/routers, upload validation, build runner, project router, tests, and release script references. |
| `PYTHONPATH=. pytest -q` | Not run | Requires local clone and dependency installation. Expected to run in CI. |
| `npm run build:reader-ui` | Not run | Requires local clone and npm install. Expected to run in CI. |
| `npm --prefix ui-next run lint` | Not run | Requires local clone and npm install. Expected to run in CI. |
| `npm --prefix ui-next run test:run` | Not run | Requires local clone and npm install. Expected to run in CI. |
| `npm --prefix ui-next run build` | Not run | Requires local clone and npm install. Expected to run in CI. |
| `bash scripts/release_check.sh` | Not run | Requires local clone and sample-output tree. Expected to run in CI or locally by a maintainer. |

## Key Findings

- Critical: No confirmed Critical issue found from static inspection.
- High: Local execution could not be completed in this audit environment; Python dependency locking remains weaker than npm locking; clean import must remain mandatory for public publication.
- Medium: Some API exceptions should be sanitized; build logs/cache should be bounded/streamed; login rate limiting is process-local; PR CI should be separated from Pages deployment; `scripts/release_check.sh` should be extended to require the new audit documents.
- Low: Additional ignore patterns and audit-document navigation were needed.
- Future: Improve UI state/accessibility coverage, formalize API contract, and create a desktop packaging threat model before any Tauri/Electron release.

## Out of Scope

The following items were identified but not implemented in this PR because they require broader design decisions or safer local patching:

- Python dependency locking workflow selection (`uv`, pip-tools, constraints, or another approach)
- Sanitized API error policy and endpoint-by-endpoint behavior changes
- CI workflow restructuring
- Build log retention and chunked cache hashing
- Auth/rate-limit architecture changes
- Extending the large `scripts/release_check.sh` file through a connector-only partial-edit workflow
- Desktop/Tauri packaging
- Public repository publication or history rewrite
- Dependency upgrades

## Security Notes

No secret values are included in this PR. If any potential secret exposure is detected in future review, describe it by type and location only, without exposing the value.

This PR does not make the private repository public. The recommended publication path remains a clean import controlled by `public_manifest.txt` and `exclude_manifest.txt`.

## Follow-up Work

- Run all CI and local verification commands in a clean checkout.
- Add reproducible Python dependency locking.
- Add sanitized API error response tests.
- Extend `scripts/release_check.sh` to require the new audit documents.
- Split PR CI from Pages deployment if the current workflow coupling becomes operationally confusing.
- Automate clean-import verification and forbidden-file checks.
- Add build-log retention and chunked hashing.
