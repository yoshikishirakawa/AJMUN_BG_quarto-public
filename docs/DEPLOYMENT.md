# Deployment

## GitHub Pages Samples

GitHub Pages workflow は、追跡済みで review 済みの `sample-outputs/` のみを artifact として公開します。公開 path は次の通りです。

- `/`: sample landing page
- `/html/`: 背景解説書 HTML サンプル
- `/pdf/`: 背景解説書 PDF サンプル
- `/editor/`: static read-only editor demo

Pages workflow 内では source から artifact を再生成しません。公開前に private tree で build、同期、検査を行い、確認済み output のみを commit します。

## Static Editor Demo

```bash
npm --prefix ui-next run build:public-demo
```

demo build は hash routing を使用し、Pages の `/editor/` 配下で画面切替や再読み込みを可能にします。fixture data は静的 JSON/Markdown で、保存、build、authentication、Google Docs 連携、upload を行いません。

## Firebase

既存の Firebase 設定は生成した `out/` を配信する別経路です。本変更では Firebase hosting target を変更せず、公開サンプルの配信は GitHub Pages の `sample-outputs/` に限定して説明します。

配信時は security header、HTML の cache policy、公開対象 directory が意図した範囲であることを確認してください。
