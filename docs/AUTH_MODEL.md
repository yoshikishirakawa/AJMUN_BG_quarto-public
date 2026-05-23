# Authentication Model

## 日本語概要

AJMUN BG Editor には admin と invited editor の 2 種類の role があります。
通常は admin secret または invite token によってログインします。demo auth
bypass はローカル実演用であり、公開環境では使用しません。

## Roles

The application has two roles:

- `admin`
- `invited_editor`

Admins can edit project settings, manage Google credentials, manage invite
tokens, run builds, and edit content. Invited editors can edit project content
and import Markdown, but they cannot access admin-only settings or build
actions.

日本語での権限:

- `admin`: settings、build、Google credentials、invite token、content editing を
  管理できます。
- `invited_editor`: project content editing と Markdown import ができます。
  build や admin settings にはアクセスできません。

## Admin Login

Admins sign in with `ADMIN_SECRET` from `.env`. A successful login creates a
cookie session.

Production deployments must use a strong random `ADMIN_SECRET`, a strong random
`SESSION_SECRET`, secure session cookies, exact HTTPS origins, and a
repository-external Google OAuth credential directory.

## Invite Tokens

Invite tokens are created by admins. Tokens are stored as hashes in
`config/auth.json`; the raw token is shown only once at creation time.

Admins can list, revoke, revoke all, and reissue invite tokens.

## Demo Auth Bypass

The demo auth-bypass mode skips admin and invite login and grants
admin-equivalent access. It is reserved for intentional local host-led demos.

Set `AUTH_BYPASS_ENABLED=false` before relying on admin-secret or invite-token
access control. Production runtime validation rejects enabled auth bypass.

日本語での注意点:

demo auth bypass はログインを省略し、admin 相当のアクセスを付与します。これは
ローカル実演のためだけの機能です。公開環境や管理された配布環境では必ず無効に
してください。

## Google OAuth Credentials

Local development stores OAuth files under `.credentials/` by default. Set
`GOOGLE_CREDENTIALS_DIR` to move `client_secret.json` and `token.json`.

In production, `GOOGLE_CREDENTIALS_DIR` is required and must point outside the
repository. OAuth files are written with owner-only permissions where the
platform permits it.

OAuth token exchange and refresh endpoints return only status responses to the
frontend. Access and refresh tokens remain in the backend credentials store.

## Raw Configuration Editor

Raw `_quarto.yml` editing is gated by `ENABLE_RAW_CONFIG_EDITOR`. Keep it
disabled in production unless raw Quarto editing is an intentional admin-only
maintenance operation. When disabled, the raw config API returns 403 and the UI
save action is unavailable.
