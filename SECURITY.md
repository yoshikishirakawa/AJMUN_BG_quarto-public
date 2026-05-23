# Security Policy

## 日本語概要

この文書は、AJMUN BG Editor の公開配布における security policy です。公開対象は
backend、frontend、Quarto build pipeline、Docker 設定、release scripts、公開文書、
reviewed representative outputs に限定されます。credential、生成物、ローカル状態、
内部メモは clean import に含めません。

## Supported Surface

Security reports should focus on the public distribution surface: the FastAPI
backend, the React frontend, the Quarto build pipeline, Docker configuration,
release scripts, public documentation, and reviewed representative outputs.

Generated artifacts, credentials, local machine state, private planning notes,
and private-only helper utilities are not part of the public support boundary
and must not be included in the clean public import.

## Reporting

Report suspected vulnerabilities privately through the repository owner's
preferred GitHub security contact. Do not open public issues containing secrets,
tokens, credential values, private Google Docs links, or exploit details that
would put deployments at risk.

日本語での報告方針:

脆弱性や secret 漏えいの疑いは、公開 issue ではなく private な連絡経路で報告して
ください。secret、token、credential value、private Google Docs link、悪用手順を
公開の場に貼らないでください。

## Secret Handling

Never commit `.env`, `.credentials/`, `config/auth.json`, Google OAuth client
secrets, `credentials.json`, `service_account.json`, `authorized_user.json`,
`client_secret.json`, or token files.

If a credential has been committed or published, revoke or rotate it. Removing
the file from a later commit is not sufficient for a repository with public
history.

日本語での secret handling:

`.env`、`.credentials/`、`config/auth.json`、OAuth client secret、token file は
commit しないでください。公開履歴に出た credential は、削除だけでは不十分です。
revoke または rotate してください。

## Deployment Defaults

Production-like deployments must keep auth bypass disabled, use strong random
admin and session secrets, restrict origins and redirect URIs to exact HTTPS
values, keep API docs disabled unless intentionally exposed, and store Google
credentials outside the repository.
