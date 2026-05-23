# Troubleshooting

## 日本語概要

この文書は、セットアップや release check で起こりやすい問題の切り分け用です。
公開環境で auth bypass を有効にする、credential を repository 内に置く、生成物を
public tree に含める、といった運用は避けてください。

## Login Is Required In Local Development

The default compose configuration keeps public editing disabled. Use the admin
secret from `.env`, or run the demo override only for an intentional local
host-led demo.

日本語: 通常の compose ではログインが必要です。`.env` の admin secret を使うか、
ローカル実演時だけ demo override を使ってください。

## Production Compose Refuses To Start

`docker-compose.prod.yml` requires explicit production values for secrets,
origins, redirect URIs, and Google credential location. Empty placeholders in
`.env.prod.example` are intentional and should fail validation.

## Google Features Are Unavailable

Leave `GOOGLE_INTEGRATION_ENABLED=auto` for automatic detection, or set it to
`false` to disable Google functionality. Confirm that `GOOGLE_CREDENTIALS_DIR`
points outside the repository in production-like deployments.

## PDF Smoke Check Fails

Confirm that Quarto, `lualatex`, and `latexmk` are available on `PATH`, or use
the PDF Docker override.

## Release Check Fails On Public Boundary

Run `bash scripts/create_public_import.sh`, inspect the generated clean tree,
and verify that credentials, generated outputs, private planning notes, local
machine state, and private-only helper utilities are absent.

日本語: `bash scripts/create_public_import.sh` で clean tree を作成し、credential、
生成物、内部メモ、local machine state、公開不要な補助ファイルが入っていないことを
確認してください。
