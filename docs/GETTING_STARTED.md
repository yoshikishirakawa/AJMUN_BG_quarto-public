# Getting Started

## 概要

本リポジトリは AJMUN BG Editor とレビュー済みの背景解説書サンプルを含みます。静的サンプルの閲覧だけであれば `sample-outputs/` を確認してください。編集環境を動かす場合は以下の手順を用います。

## 前提

- Docker Compose による起動、または Node.js と Python による開発起動
- HTML/PDF の再生成には Quarto が必要
- PDF の生成には LuaLaTeX と `latexmk` が必要

## Docker Quick Start

```bash
cp .env.example .env
# ADMIN_SECRET と SESSION_SECRET を設定
docker compose up --build
```

`http://localhost:5173` を開き、設定した secret でログインします。停止は `docker compose down` です。

## Local Development

```bash
npm --prefix ui-next ci
pip install -e 'api[dev]'
cp .env.example .env
./start-dev.sh
```

検証コマンド:

```bash
PYTHONPATH=. pytest -q
npm --prefix ui-next run lint
npm --prefix ui-next run test:run
npm --prefix ui-next run build
```

## 出力と公開デモ

- 通常の active build output は `out/` に生成されます。
- review 済みの配布サンプルだけを `sample-outputs/` に置きます。
- 静的 editor demo は `npm --prefix ui-next run build:public-demo` で `sample-outputs/editor/` に生成されます。

公開 demo は backend を必要とせず、保存、build、認証、Google Docs 連携、upload を実行しません。
