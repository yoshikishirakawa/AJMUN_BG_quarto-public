# Editor Usage

## 編集対象

ローカル版の editor は project metadata、章構成、Markdown 本文、style 設定、HTML/PDF build を一つの画面から扱います。本文原稿は `content/`、主要設定は `config/` と `_quarto.yml` に対応します。

## 基本操作

- sidebar の章一覧から編集対象を選択します。
- editor で Markdown を編集し、preview で表示を確認します。
- ローカルの通常モードでは変更を保存し、build 画面で HTML/PDF を生成できます。
- Google Docs 連携は設定済み環境でのみ使用し、未設定時はローカル編集を利用します。

## 公開エディタ体験版

`sample-outputs/editor/` は画面構成を確認する静的デモです。dashboard、editor、build、参考文献、settings の表示は確認できますが、操作の境界は次の通りです。

- Markdown 入力と preview 更新はブラウザ内で一時的に動作します。
- 保存、build、章追加・削除・並び替え、import、upload は無効です。
- authentication、Google Docs、API backend へ接続しません。
- 入力した変更は再読み込みで破棄されます。

この demo を編集権限の付与や作業データの保存先として使用しないでください。
