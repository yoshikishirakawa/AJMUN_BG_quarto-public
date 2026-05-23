# 長文HTML配布UI ビルドシステム

# 変数設定
PANDOC := pandoc
QUARTO := quarto
PYTHON3 := python3
CSS_FILES := src/css/base.css src/css/layout.css src/css/print.css src/css/font-udpmincho.css
JS_FILES := src/js/ui.js src/js/footnote-inline.js src/js/annotate.js
FILTERS := filters/law.lua filters/index.lua
CONTENT_DIR := content
SCRIPTS_DIR := scripts
META_DIR := meta
FONTS_DIR := fonts
OUT_DIR := out

# 配布用リポジトリ設定（必要に応じて上書き）
PUBLISH_REPO_URL ?= https://github.com/yoshikishirakawa/ajmun37th-aa4p-bg.git
PUBLISH_REPO_DIR ?= ../ajmun37th-aa4p-bg

# ビルドターゲット
.PHONY: all html_quarto html_single pdf copy_pdf clean setup help footnotes pdf_custom extract_page_map index_qmd

# デフォルトターゲット
# 実行順序:
# 1. Setup: ディレクトリ作成
# 2. Pre-process: 脚注正規化 (footnotes), 参考文献生成 (references), 索引QMD生成 (index_qmd)
# 3. PDF: PDF生成 (PC版・印刷版) ← ページマップ用に先に実行
# 4. HTML: Quarto HTMLページ生成 (html_quarto) ← これがout/を再生成してPDFディレクトリを消す
# 5. Copy PDF: PDFを再コピー (copy_pdf) ← html_quarto後に再コピー
# 6. Map: ページマッピング抽出 (extract_page_map)
# 7. PWA: Service Worker生成 (pwa)
# 8. Single HTML: 単一ファイルHTML生成 (html_single)
all: setup footnotes references index_qmd pdf html_quarto copy_pdf extract_page_map pwa html_single

# 索引QMD生成（共通処理）
index_qmd: setup
	@echo "索引データ生成中..."
	@mkdir -p build/index
	@for file in $(CONTENT_DIR)/*.md; do \
		echo "  処理中: $$file"; \
		INDEX_GENERATE_JSON_ONLY=1 $(QUARTO) pandoc "$$file" --lua-filter=filters/index.lua -o /dev/null 2>/dev/null || true; \
	done
	@echo "索引データ生成完了"
	@echo "索引ページ生成中（共通）..."
	$(PYTHON3) $(SCRIPTS_DIR)/build_book_index_v2.py $(CONTENT_DIR)/96_index.qmd

# PDF→HTMLページマッピング抽出（PDFの.auxファイルから）
extract_page_map:
	@echo "PDFページマッピング抽出中..."
	@mkdir -p $(OUT_DIR)/assets
	@if [ -f "pdf_build/平和への課題：補遺.aux" ]; then \
		$(PYTHON3) $(SCRIPTS_DIR)/extract_page_mapping.py "pdf_build/平和への課題：補遺.aux" $(OUT_DIR)/assets/pdf-page-map.json; \
	else \
		echo "警告: .auxファイルが見つかりません（PDFビルドが必要）"; \
	fi

# PWA用 Service Worker 生成
pwa: html_quarto
	@echo "空のsrc属性を修正中..."
	$(PYTHON3) $(SCRIPTS_DIR)/fix_empty_src.py
	@echo "Service Worker生成中..."
	npx workbox-cli generateSW workbox-config.js
	@echo "PWA化完了"

# セットアップ
setup:
	@echo "プロジェクトセットアップ中..."
	mkdir -p $(OUT_DIR) $(OUT_DIR)/chapters $(OUT_DIR)/pdf $(OUT_DIR)/search
	@echo "ディレクトリ作成完了"

# Quartoレンダリング（各章ページ）
# index_qmd は既に実行されている前提だが、単独実行時のために依存に残すか、logicを共有する
	@echo "QuartoによるHTMLページ生成中..."
	$(QUARTO) render --to html --output-dir $(OUT_DIR)
	@echo "Analyticsスクリプトをバンドル中..."
	npx esbuild src/js/analytics.js --bundle --outfile=$(OUT_DIR)/assets/analytics.bundle.js --minify
	@echo "索引アンカーID修正中..."
	$(PYTHON3) $(SCRIPTS_DIR)/fix_index_anchors.py
	@echo "索引ページ再生成中（修正されたアンカーIDを使用）..."
	$(PYTHON3) $(SCRIPTS_DIR)/build_book_index_v2.py $(CONTENT_DIR)/96_index.qmd
	$(QUARTO) render $(CONTENT_DIR)/96_index.qmd --to html --output-dir $(OUT_DIR)
	@echo "個別ページ生成完了"

# 単一HTML生成（全章）
html_single: setup footnotes index_qmd
	@echo "単一HTMLファイル生成中..."
ifdef USE_PANDOC
	$(PANDOC) \
		index.qmd $(CONTENT_DIR)/*.md \
		-o $(OUT_DIR)/all.html \
		--self-contained \
		--embed-resources \
		--toc \
		--toc-depth=3 \
		--metadata title="平和への課題：補遺" \
		--metadata lang=ja \
		--css $(CSS_FILES) \
		--include-in-header $(CSS_FILES) \
		--include-before-body $(JS_FILES) \
		--lua-filter=$(FILTERS)
else
	@echo "Pandoc直接呼び出しをスキップ（USE_PANDOC未定義）"
endif
	@echo "単一HTML生成完了"

# 索引生成（旧ターゲット互換）
index: index_qmd
	$(QUARTO) render $(CONTENT_DIR)/96_index.qmd --output-dir $(OUT_DIR)
	@echo "索引生成完了"

# 参考文献生成
references: setup
	@echo "参考文献生成中..."
	@mkdir -p $(CONTENT_DIR)/bib
	$(PYTHON3) $(SCRIPTS_DIR)/merge_bib.py $(META_DIR)/bib/ > $(CONTENT_DIR)/merged.bib
	@printf -- "---\ntitle: 参考文献\nnocite: |\n  @*\nbibliography: ../content/merged.bib\n---\n" > $(CONTENT_DIR)/95_references.qmd
	@echo "参考文献生成完了"

# PDF生成（html_quartoより先に実行してページマッピングを生成）
# 依存関係に index_qmd を追加（PDF生成前に索引ファイルが必要）
pdf: setup index_qmd structured_refs
	@echo "PDF生成中..."
	@mkdir -p $(OUT_DIR)/pdf $(OUT_DIR)/pdf_pc
	$(PYTHON3) $(SCRIPTS_DIR)/build_pdf.py
	@echo "PDF生成完了"

# PDF用構造化参考文献生成
structured_refs:
	@echo "構造化参考文献生成中..."
	$(PYTHON3) $(SCRIPTS_DIR)/build_structured_references.py pdf_build/content/95_references.qmd
	@echo "構造化参考文献生成完了"

# PDFコピー（html_quartoがout/を再生成してPDFディレクトリを消すので再コピー）
copy_pdf:
	@echo "PDFファイルを再コピー中..."
	@mkdir -p $(OUT_DIR)/pdf $(OUT_DIR)/pdf_pc
	@if [ -f "pdf_build/out/平和への課題：補遺.pdf" ]; then \
		cp pdf_build/out/*.pdf $(OUT_DIR)/pdf/; \
		cp pdf_build/out/*.pdf $(OUT_DIR)/pdf_pc/; \
		echo "  コピー完了: $(OUT_DIR)/pdf/ および $(OUT_DIR)/pdf_pc/"; \
	else \
		echo "警告: PDFファイルが見つかりません（PDFビルドが必要）"; \
	fi

# 特定エンジンでのPDF生成
pdf-lualatex: setup html_quarto
	@echo "LuaLaTeXでPDF生成中..."
	$(PYTHON3) $(SCRIPTS_DIR)/build_pdf.py lualatex

pdf-weasyprint: setup html_quarto
	@echo "WeasyPrintでPDF生成中..."
	$(PYTHON3) $(SCRIPTS_DIR)/build_pdf.py weasyprint

pdf-chrome: setup html_quarto
	@echo "ChromeでPDF生成中..."
	$(PYTHON3) $(SCRIPTS_DIR)/build_pdf.py chrome

# 独立したPDF生成（LuaLaTeX使用）
pdf_custom: setup references
	@echo "PDF生成（カスタムビルド）中..."
	@mkdir -p $(OUT_DIR)/pdf
	cd pdf_build && $(QUARTO) render --to pdf
	@echo "PDF生成完了"

# 互換性のための古い形式
ifdef USE_LUALATEX
pdf: setup html_quarto
	@echo "LuaLaTeXでPDF生成中..."
	QUARTO_LOG_LEVEL=ERROR $(QUARTO) render --to pdf --output-dir $(OUT_DIR)/pdf
	@echo "PDF生成完了"
else ifdef USE_WEASYPRINT
pdf: setup html_quarto
	@echo "WeasyPrintでPDF生成中..."
	$(PYTHON3) -c "import weasyprint; weasyprint.HTML(filename='$(OUT_DIR)/chapters/index.html').write_pdf('$(OUT_DIR)/pdf/index.pdf')"
	@for html in $(OUT_DIR)/chapters/*.html; do \
		name=$$(basename $$html .html); \
		$(PYTHON3) -c "import weasyprint; weasyprint.HTML(filename='$$html').write_pdf('$(OUT_DIR)/pdf/$$name.pdf')" || echo "$$nameのPDF生成に失敗しました"; \
	done
	@echo "PDF生成完了"
endif

# フォント埋込
embed_fonts:
	@echo "フォント埋込処理中..."
	$(PYTHON3) $(SCRIPTS_DIR)/embed_fonts.py $(FONTS_DIR)/UDPMincho.woff2 src/css/font-udpmincho.css
	@echo "フォント埋込完了"

# フォントサブセット化
subset_fonts:
	@echo "フォントサブセット化中..."
	$(PYTHON3) $(SCRIPTS_DIR)/subset_font.py $(FONTS_DIR)/UDPMincho.woff2 $(FONTS_DIR)/UDPMincho-subset.woff2
	@echo "フォントサブセット化完了"

# クリーン
clean:
	@echo "クリーンアップ中..."
	rm -rf $(OUT_DIR)
	rm -f $(CONTENT_DIR)/*.qmd~
	rm -f $(CONTENT_DIR)/*.html~
	@echo "クリーンアップ完了"

# 依存関係チェック
deps:
	@echo "依存関係チェック中..."
	@quarto --version > /dev/null 2>&1 || echo "エラー: Quartoが見つかりません"
	@pandoc --version > /dev/null 2>&1 || echo "エラー: Pandocが見つかりません"
	@$(PYTHON3) --version > /dev/null 2>&1 || echo "エラー: Python3が見つかりません"
	@echo "依存関係チェック完了"

# 開発用サーバー
serve: html_quarto
	@echo "開発サーバー起動中..."
	$(QUARTO) serve --port=4200

# 検証（lint）
lint:
	@echo "マークダウン検証中..."
	$(QUARTO) check
	@echo "マークダウン検証完了"

# プレビュー
preview: html_quarto
	@echo "プレビュー表示中..."
	for html in $(OUT_DIR)/chapters/*.html; do \
		echo "プレビュー: $$html"; \
		if command -v open > /dev/null; then \
			open "$$html" || true; \
		elif command -v xdg-open > /dev/null; then \
			xdg-open "$$html" || true; \
		fi; \
		break; \
	done

# 統計情報
stats:
	@echo "プロジェクト統計情報..."
	@echo "ファイル数:"
	@find $(CONTENT_DIR) -name "*.md" | wc -l | sed 's/^/  マークダウン: /'
	@find $(CSS_FILES) 2>/dev/null | wc -l | sed 's/^/  CSS: /'
	@find $(JS_FILES) 2>/dev/null | wc -l | sed 's/^/  JavaScript: /'
	@echo "文字数:"
	@ls -la $(CONTENT_DIR)/*.md 2>/dev/null || echo "  マークダウンファイルが見つかりません"
	@echo "出力ファイル:"
	@ls -la $(OUT_DIR)/*.html 2>/dev/null || echo "  HTMLファイルが見つかりません"

# ヘルプ表示
help:
	@echo "使用方法: make [ターゲット]"
	@echo ""
	@echo "ターゲット一覧:"
	@echo "  all           - すべての形式を生成"
	@echo "  html_quarto   - Quartoによる個別HTMLページ"
	@echo "  html_single   - 単一HTMLファイル"
	@echo "  pdf           - PDFファイル生成"
	@echo "  setup         - 初期セットアップ"
	@echo "  pdf_custom    - 独立したPDF生成（LuaLaTeX）"
	@echo "  index         - 索引生成"
	@echo "  references    - 参考文献生成"
	@echo "  embed_fonts   - フォント埋込"
	@echo "  subset_fonts  - フォントサブセット化"
	@echo "  clean         - クリーンアップ"
	@echo "  deps          - 依存関係チェック"
	@echo "  serve         - 開発サーバー"
	@echo "  lint          - マークダウン検証"
	@echo "  preview       - プレビュー表示"
	@echo "  stats         - 統計情報"
	@echo "  help          - このヘルプを表示"
	@echo ""
	@echo "環境変数:"
	@echo "  USE_PANDOC=1         - Pandoc直接呼び出しを使用"
	@echo "  USE_LUALATEX=1       - LuaLaTeXでPDF生成"
	@echo "  USE_WEASYPRINT=1     - WeasyPrintでPDF生成"
	@echo "  USE_CHROME=1         - Chrome headlessでPDF生成"
	@echo ""
	@echo "例："
	@echo "  make all USE_LUALATEX=1  # 完全ビルド（LuaLaTeX）"
	@echo "  make html_quarto         # 個別ページのみ"
	@echo "  make serve               # 開発サーバー起動"
	@echo "  make publish             # out/ を別リポジトリにコミット"
# 脚注ID正規化
footnotes:
	@echo "脚注IDを章ごとに正規化中..."
	$(PYTHON3) $(SCRIPTS_DIR)/update_footnotes.py

# Firebase デプロイ
deploy:
	@echo "Firebase Hostingへデプロイ中..."
	firebase deploy --only hosting
	@echo "デプロイ完了"

# out/ 配下を別リポジトリにコミット（index_single.html は除外）
.PHONY: publish
publish: html_quarto html_single
	@echo "配布用リポジトリへの反映中..."
	@if [ ! -d "$(PUBLISH_REPO_DIR)/.git" ]; then \
		echo "エラー: $(PUBLISH_REPO_DIR) は git リポジトリではありません。"; \
		echo "  例: git clone $(PUBLISH_REPO_URL) $(PUBLISH_REPO_DIR)"; \
		exit 1; \
	fi
	@echo "out/ から $(PUBLISH_REPO_DIR) へファイルをコピー（index_single.html を除外、.git は保持）..."
	rsync -av --delete --exclude '.git/' --exclude 'index_single.html' "$(OUT_DIR)/" "$(PUBLISH_REPO_DIR)/"
	@echo "git コミット・プッシュを実行します..."
	cd "$(PUBLISH_REPO_DIR)" && git add . && git commit -m "Update BG build: $$(date '+%Y-%m-%d %H:%M:%S')" || echo "コミットなし（変更がありません）"
	cd "$(PUBLISH_REPO_DIR)" && git push || echo "警告: git push に失敗しました。リモート設定と認証を確認してください。"
