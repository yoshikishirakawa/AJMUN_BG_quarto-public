# Known Limitations

## 日本語概要

この文書は、公開時点で意図的に残している制約をまとめたものです。これらは公開前
blocker ではありませんが、今後の改善対象です。

## API Compatibility

Some compatibility endpoints still use mixed API prefixes. New public endpoints
should use `/api/v1/*`. Existing endpoints should not be renamed in a public
release without a compatibility migration.

日本語: 一部の互換 endpoint には mixed API prefix が残っています。新規 public
endpoint は `/api/v1/*` に寄せ、既存 endpoint の rename は migration plan なしに
行わないでください。

## Google Integration

Google Docs integration is optional and depends on deployment-provided OAuth
configuration. The application must remain usable for local editing and builds
when Google integration is disabled or unconfigured.

## PDF Environment

The default Docker workflow is intentionally lightweight and does not include a
full TeX environment. Use the PDF Docker override or a host TeX installation
for PDF rendering.

## Public Import

The public repository is expected to be produced from a clean import. Private
history, credentials, generated work areas, local machine state, internal
notes, and private-only helper utilities are intentionally excluded.

日本語: public repository は clean import から作成する前提です。private history、
credentials、生成作業領域、local machine state、内部メモ、公開不要な補助ファイルは
意図的に除外します。

## Static Public Demo

The public editor demo is an interface preview, not a hosted editing service.
It loads short static fixture files and allows temporary in-browser Markdown
input for preview purposes only. Save, build, authentication, Google Docs
integration, uploads, and persistent settings are disabled.

日本語: 公開エディタ体験版は静的な画面確認用です。本文入力は preview 確認の
ため一時的に可能ですが、保存、build、認証、Google Docs 連携、upload、
永続的な設定変更は利用できません。
