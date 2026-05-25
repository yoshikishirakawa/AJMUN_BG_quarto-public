# Publishing Workflow

## Source To Output

- Markdown source と画像は `content/`、`assets/`、設定ファイルから読み込まれます。
- HTML 版は Quarto build path で `out/` に生成します。
- PDF 版は `scripts/build_pdf.py` を含む LaTeX build path で生成します。
- Reader runtime の変更後は `npm run build:reader-ui` を実行します。

## Representative Samples

`out/` は作業出力であり、公開 tree ではありません。公開する代表成果物のみ、確認後に次のコマンドで同期します。

```bash
python3 scripts/sync_output_runtime_assets.py --sync-sample-outputs
npm --prefix ui-next run build:public-demo
```

`sample-outputs/` に保持するもの:

- 説明付き landing page
- レビュー済み HTML 出力
- レビュー済み PDF 出力
- 静的 read-only editor demo と公開 fixture

`out/`、TeX intermediate file、cache、未確認 draft output は commit しません。
