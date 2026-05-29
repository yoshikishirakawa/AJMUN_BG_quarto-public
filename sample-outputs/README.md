# Sample Outputs

This directory stores the curated representative deliverables that ship with the initial bundled sample project.

## Included here
- `html/index.html`: representative landing page
- `html/content/*.html`: representative chapter HTML set
- `html/assets/`: assets required by the representative HTML set
- `pdf/*.pdf`: representative PDF outputs
- `editor/`: static read-only editor demo built from public fixture data

## Not included here
- transient build products from `out/`
- TeX intermediate files
- local debugging artifacts
- any persisted editor change, credentials, or external-service configuration

Refresh this directory from `out/` during the release freeze process described in `docs/RELEASE_RUNBOOK.md`.
Build the public editor demo with `npm --prefix ui-next run build:public-demo`. The demo permits temporary Markdown input for preview only; it cannot save, build, authenticate, connect to Google Docs, or mutate the included image fixtures.
