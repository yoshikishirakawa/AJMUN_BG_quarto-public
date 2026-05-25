# AJMUN BG Editor

AJMUN BG Editor は、第37回全日本模擬国連大会の背景解説書を作成するために整備した編集・組版環境です。章ごとの Markdown 原稿から、Quarto による HTML 版と LaTeX による PDF 版を生成します。

この公開リポジトリには、公開可能なコード、設定、ドキュメント、レビュー済みの代表出力を収録しています。認証情報、ローカル状態、作業中の内部メモ、生成途中の作業領域は含めません。

## 公開サンプル

GitHub Pages で `sample-outputs/` の次の成果物を公開します。

- 背景解説書の HTML 版: `sample-outputs/html/`
- 背景解説書の PDF 版: `sample-outputs/pdf/`
- エディタ体験版: `sample-outputs/editor/`

エディタ体験版は静的な読み取り専用デモです。Markdown 入力と preview の変化は一時的に確認できますが、保存、ビルド、認証、Google Docs 連携、ファイルアップロードは利用できず、再読み込みで初期状態に戻ります。

## ローカルで動かす

通常のエディタと API は Docker Compose で起動できます。

```bash
cp .env.example .env
# .env に ADMIN_SECRET と SESSION_SECRET を設定
docker compose up --build
```

ブラウザで `http://localhost:5173` を開きます。ログインを省略する `docker-compose.demo.yml` はローカル実演専用であり、公開デモの配信方法ではありません。

依存関係、開発起動、出力先は [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) を参照してください。

## 基本的な制作フロー

1. `content/` の Markdown 原稿と project 設定を編集します。
2. Quarto で HTML を生成します。
3. LaTeX build path で PDF を生成します。
4. レビュー済み成果物だけを `sample-outputs/` に同期します。
5. clean import を生成し、公開対象を再検証します。

詳細は [docs/EDITOR_USAGE.md](docs/EDITOR_USAGE.md) と [docs/PUBLISHING_WORKFLOW.md](docs/PUBLISHING_WORKFLOW.md) を参照してください。

## Google Docs 連携と制限

Google Docs 連携は任意の OAuth 設定に依存し、自動取り込み workflow は完成済みの一般機能として扱っていません。連携を設定しなくてもローカル編集と build は利用できます。公開エディタ体験版では外部連携を一切実行しません。

既知の制限は [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) に記載しています。

## 公開リポジトリに含まれないもの

private working repository と public distribution repository は別の境界です。公開 tree は `public_manifest.txt` と `exclude_manifest.txt` に従う clean import から作成します。

公開対象から除外するもの:

- `.env`、OAuth credential、token、`config/auth.json`
- `out/`、`pdf_build/`、cache、dependency directory
- 内部 planning note、ローカル設定、debug 用 artifact
- review 済み sample 以外の生成出力

境界と検査手順は [docs/PUBLIC_REPOSITORY_BOUNDARY.md](docs/PUBLIC_REPOSITORY_BOUNDARY.md) と [docs/PUBLICATION_RUNBOOK.md](docs/PUBLICATION_RUNBOOK.md) を参照してください。

## セキュリティ

本番相当構成では `AUTH_BYPASS_ENABLED=false` と `ENABLE_RAW_CONFIG_EDITOR=false` を維持し、`ADMIN_SECRET`、`SESSION_SECRET`、origin、OAuth callback URL、Google credentials directory を明示設定してください。API docs は `EXPOSE_API_DOCS=true` を明示しない限り公開しない方針です。

脆弱性報告と credential の扱いは [SECURITY.md](SECURITY.md) を参照してください。

## ライセンス

アプリケーションコードは [LICENSE](LICENSE) に従います。本文、画像、代表 HTML/PDF 出力等の扱いは [CONTENT_LICENSE.md](CONTENT_LICENSE.md)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)、[docs/ASSET_RIGHTS_MANIFEST.md](docs/ASSET_RIGHTS_MANIFEST.md) に記載しています。

## 開発者向け資料

最初に読む文書:

- [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)
- [docs/EDITOR_USAGE.md](docs/EDITOR_USAGE.md)
- [docs/PUBLISHING_WORKFLOW.md](docs/PUBLISHING_WORKFLOW.md)
- [docs/PUBLIC_REPOSITORY_BOUNDARY.md](docs/PUBLIC_REPOSITORY_BOUNDARY.md)
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

公開判定と運用記録:

- [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)
- [docs/PUBLICATION_RUNBOOK.md](docs/PUBLICATION_RUNBOOK.md)
- [docs/RELEASE_RUNBOOK.md](docs/RELEASE_RUNBOOK.md)
- [docs/PUBLIC_RELEASE_CHECKLIST.md](docs/PUBLIC_RELEASE_CHECKLIST.md)
- [docs/AUDIT_REPORT.md](docs/AUDIT_REPORT.md)
- [docs/IMPROVEMENT_PLAN.md](docs/IMPROVEMENT_PLAN.md)

## Release Checks

```bash
bash scripts/release_check.sh
PYTHONPATH=. pytest -q
npm run build:reader-ui
npm --prefix ui-next run lint
npm --prefix ui-next run test:run
npm --prefix ui-next run build
npm --prefix ui-next run build:public-demo
python3 scripts/sync_output_runtime_assets.py --sync-sample-outputs
bash scripts/create_public_import.sh /private/tmp/ajmun-bg-public-clean
```

公開 push や tag は clean import、secret scan、content rights review が完了した後にのみ実施します。
