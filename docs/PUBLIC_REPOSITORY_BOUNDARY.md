# Public Repository Boundary

## Repository Roles

private source repository は制作と検証の作業場所です。public distribution repository は公開可能な surface だけを clean import した配布物です。

## Included

- `api/` と `ui-next/` の公開可能な source
- Quarto/PDF build input と安全な scripts
- 公開向け文書、license、third-party notice
- `sample-outputs/html/`、`sample-outputs/pdf/`、`sample-outputs/editor/`

## Excluded

- secret、OAuth credential、token、local auth state
- private planning note と debug-only artifact
- `out/`、`pdf_build/`、cache、dependency directory
- review 済み sample 以外の一時生成物

## Clean Import Review

```bash
bash scripts/release_check.sh
bash scripts/create_public_import.sh /private/tmp/ajmun-bg-public-clean
cd /private/tmp/ajmun-bg-public-clean
bash scripts/release_check.sh
```

公開候補では secret scan を redacted 出力で実行し、sample content と assets の再配布条件を確認します。公開 demo は静的 fixture だけを読み取り、保存や backend mutation を提供しません。
