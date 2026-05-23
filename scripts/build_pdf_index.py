#!/usr/bin/env python3
"""
build_pdf_index.py

PDF用の索引QMDファイルを生成する。
.auxファイルからアンカーIDのページ番号を抽出し、
ページ番号表示の索引を生成する。
"""

import re
import json
import sys
from pathlib import Path
from collections import defaultdict

# 文書集索引のカテゴリ（この順番で表示）
DOCUMENT_CATEGORIES = [
    "安保理決議",
    "総会決議", 
    "その他の文書",
    "その他の国際法"
]

def resolution_sort_key(text: str) -> list:
    """スラッシュ区切りの文書番号を数値優先で比較するキーを返す。"""
    parts = []
    for segment in re.split(r'(/)', text):
        if segment == '/':
            parts.append((0, '/'))
            continue
        for part in re.split(r'(\d+)', segment):
            if not part:
                continue
            if part.isdigit():
                parts.append((1, int(part)))
            else:
                parts.append((2, part.lower()))
    return parts


def is_resolution_pattern(text: str) -> bool:
    """A/RES/... や S/RES/... の決議番号形式か判定する。"""
    return bool(re.match(r'^[A-Z]/RES/', text, re.IGNORECASE))


def smart_sort_key(text: str, kks=None):
    """数値入り識別子を自然順で、その他は英字/かな順で並べる。"""
    if is_resolution_pattern(text):
        return (0, resolution_sort_key(text))
    if '/' in text:
        return (1, resolution_sort_key(text))
    if text and text[0].isdigit():
        return (2, resolution_sort_key(text))
    if text and text[0].isascii() and text[0].isalpha():
        return (3, text.lower())

    if kks:
        result = kks.convert(text)
        return (4, ''.join(item['hira'] for item in result))
    return (4, text)


def fix_mojibake(text: str) -> str:
    """文字化けを修正"""
    if not text:
        return text
    replacements = {
        "国連憲��": "国連憲章",
        "憲��": "憲章",
    }
    for broken, fixed in replacements.items():
        text = text.replace(broken, fixed)
    return text


def normalize_charter_term(term: str) -> str:
    """国連憲章カテゴリの用語を"憲章XX条"形式に正規化する"""
    term = fix_mojibake((term or "").strip())
    if not term:
        return term
    # Already has 憲章 prefix
    if term.startswith('憲章'):
        return term
    # Match patterns like "17条2項", "103条", etc.
    m = re.match(r'^(\d+条.*)$', term)
    if m:
        return f'憲章{m.group(1)}'
    return term


def charter_sort_key(term: str):
    """国連憲章カテゴリ用のソートキー - 条文番号で数値ソート"""
    # Extract article number from "憲章XX条..." 
    m = re.match(r'憲章(\d+)条', term)
    if m:
        return (0, int(m.group(1)), term)
    # Non-article entries (e.g. ダンバートンオークス提案) go after articles
    return (1, 0, term)


def extract_term_page_mapping(idx_path: Path) -> dict:
    """
    .idxファイルから索引用語とページ番号のマッピングを抽出
    
    .idxファイルには以下の形式のエントリがある:
    \indexentry{カテゴリ!用語|hyperpage}{PAGE}
    \indexentry{用語|hyperpage}{PAGE}
    """
    mapping = defaultdict(list)
    
    if not idx_path.exists():
        print(f"警告: .idxファイルが見つかりません: {idx_path}")
        return mapping
    
    content = idx_path.read_text(encoding='utf-8', errors='ignore')
    
    # \indexentry{...}{PAGE} パターンにマッチ
    # 例: \indexentry{PKOと即応体制!国連軍構想の失敗|hyperpage}{20}
    pattern = r'\\indexentry\{([^}]+)\|hyperpage\}\{(\d+)\}'
    matches = re.findall(pattern, content)
    
    for entry_str, page_str in matches:
        try:
            page = int(page_str) - 4  # ページ番号補正
            # カテゴリ!サブカテゴリ!用語 の形式から用語を抽出
            parts = entry_str.split('!')
            term = parts[-1]  # 最後の部分が用語
            
            # 読み仮名がある場合は除去（読み@用語 の形式）
            if '@' in term:
                term = term.split('@')[-1]
            
            term = fix_mojibake(term)
            mapping[term].append(page)
            normalized_term = normalize_charter_term(term)
            if normalized_term != term:
                mapping[normalized_term].append(page)
        except ValueError:
            continue
    
    print(f"  .idxから{len(matches)}件の索引ページマッピングを抽出")
    return mapping


def load_index_files(index_dir: Path) -> list:
    """build/index/*.jsonを読み込む"""
    all_entries = []
    
    if not index_dir.exists():
        print(f"警告: 索引ディレクトリが見つかりません: {index_dir}")
        return all_entries
    
    json_files = list(index_dir.glob("*.json"))
    print(f"索引ファイル読み込み中... ({len(json_files)}件)")
    
    for json_file in json_files:
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            entries = data.get('entries', [])
            all_entries.extend(entries)
            print(f"  {json_file.name}: {len(entries)}項目")
        except Exception as e:
            print(f"警告: {json_file}の読み込みに失敗: {e}")
    
    return all_entries


def get_pages_for_term(term: str, page_mapping: dict) -> list:
    """
    索引用語からページ番号リストを取得
    
    page_mappingは用語→ページリストの辞書
    """
    if not term:
        return []
    
    term_fixed = fix_mojibake(term)
    normalized_term = normalize_charter_term(term_fixed)
    
    # 完全一致を試す
    if term_fixed in page_mapping:
        return page_mapping[term_fixed]
    if normalized_term in page_mapping:
        return page_mapping[normalized_term]
    
    # 部分一致を試す（カテゴリ付きの場合も考慮）
    for key, pages in page_mapping.items():
        if (
            key.endswith(term_fixed)
            or term_fixed.endswith(key)
            or key.endswith(normalized_term)
            or normalized_term.endswith(key)
        ):
            return pages
    
    return []


def organize_by_category(entries: list) -> tuple:
    """カテゴリ別に分類"""
    document_categories = defaultdict(list)
    subject_categories = defaultdict(list)
    uncategorized = []
    
    for entry in entries:
        cats = entry.get('categories', [])
        if not cats:
            uncategorized.append(entry)
            continue
        
        # 文書集カテゴリかどうか判定
        is_document = False
        for cat in cats:
            if cat in DOCUMENT_CATEGORIES:
                is_document = True
                document_categories[cat].append(entry)
                break
        
        if not is_document:
            for cat in cats:
                subject_categories[cat].append(entry)
    
    return document_categories, subject_categories, uncategorized


def format_page_ref(pages: list) -> str:
    """ページ参照をフォーマット（ハイパーリンク付き）"""
    if not pages:
        return ""
    
    # 重複削除してソート
    unique_pages = sorted(set(p for p in pages if p > 0))
    
    if not unique_pages:
        return ""
    
    # LaTeXのhyperpageコマンドでハイパーリンクを作成
    # Pandocがraw LaTeXとして処理するように `{=latex}` を使用
    def hyperlink_page(p):
        return f"`\\hyperpage{{{p}}}`{{=latex}}"
    
    linked_pages = [hyperlink_page(p) for p in unique_pages]
    
    if len(unique_pages) == 1:
        return f"p. {linked_pages[0]}"
    else:
        return f"pp. {', '.join(linked_pages)}"


def generate_index_qmd(entries: list, page_mapping: dict) -> str:
    """PDF用索引QMDを生成"""
    
    # 用語ごとにエントリをグループ化
    term_entries = defaultdict(list)
    for entry in entries:
        term = entry.get('term', '')
        if term:
            term_entries[term].append(entry)
    
    # カテゴリ別に分類
    document_categories, subject_categories, uncategorized = organize_by_category(entries)
    
    lines = []
    # YAMLフロントマターにタイトルを含めない
    # index_pdf.luaフィルタが「索引」H1を検出して\chapter*{索引}を生成するため
    # タイトルなしで「# 索引」を追加する
    lines.append("# 索引 {.unnumbered}")
    lines.append("")
    
    # ========== 文書集索引 ==========
    lines.append("## 文書集索引 {.unlisted}")
    lines.append("")

    kks = None

    def term_sort_key(term):
        return smart_sort_key(term, kks)
    
    for cat_name in DOCUMENT_CATEGORIES:
        if cat_name not in document_categories:
            continue
        
        cat_entries = document_categories[cat_name]
        
        # 用語ごとにページをまとめる（.idxファイルから直接取得）
        term_pages = defaultdict(list)
        for entry in cat_entries:
            term = entry.get('term', '')
            pages = get_pages_for_term(term, page_mapping)
            if pages:
                term_pages[term].extend(pages)
        
        if not term_pages:
            continue
        
        # 国連憲章カテゴリの場合、用語を「憲章XX条」形式に正規化し、数値ソート
        if cat_name == '国連憲章':
            normalized = defaultdict(list)
            for term, pages in term_pages.items():
                new_term = normalize_charter_term(term)
                normalized[new_term].extend(pages)
            term_pages = normalized
        
        lines.append(f"### **{cat_name}** " + "{.index-category .unlisted}")
        lines.append("")
        
        # 用語をソート
        if cat_name == '国連憲章':
            sorted_terms = sorted(term_pages.keys(), key=charter_sort_key)
        else:
            sorted_terms = sorted(term_pages.keys(), key=term_sort_key)
        for term in sorted_terms:
            pages = term_pages[term]
            page_ref = format_page_ref(pages)
            if page_ref:
                lines.append(f"- **{term}** ... {page_ref}")
        
        lines.append("")
    
    # ========== 事項索引 ==========
    lines.append("## 事項索引 {.unlisted}")
    lines.append("")
    
    # 事項カテゴリをソート
    kks = None
    try:
        import pykakasi
        kks = pykakasi.kakasi()
        def sort_key(cat_name):
            result = kks.convert(cat_name)
            return ''.join([item['hira'] for item in result])
        sorted_cats = sorted(subject_categories.keys(), key=sort_key)
    except ImportError:
        sorted_cats = sorted(subject_categories.keys())

    for cat_name in sorted_cats:
        cat_entries = subject_categories[cat_name]
        
        # 用語ごとにページをまとめる（.idxファイルから直接取得）
        term_pages = defaultdict(list)
        for entry in cat_entries:
            term = entry.get('term', '')
            pages = get_pages_for_term(term, page_mapping)
            if pages:
                term_pages[term].extend(pages)
        
        if not term_pages:
            continue
        
        # 国連憲章カテゴリの場合、用語を「憲章XX条」形式に正規化し、数値ソート
        if cat_name == '国連憲章':
            normalized = defaultdict(list)
            for term, pages in term_pages.items():
                new_term = normalize_charter_term(term)
                normalized[new_term].extend(pages)
            term_pages = normalized
        
        lines.append(f"### **{cat_name}** " + "{.index-category .unlisted}")
        lines.append("")
        
        # 用語をソート
        if cat_name == '国連憲章':
            sorted_terms = sorted(term_pages.keys(), key=charter_sort_key)
        else:
            sorted_terms = sorted(term_pages.keys(), key=term_sort_key)
        for term in sorted_terms:
            pages = term_pages[term]
            page_ref = format_page_ref(pages)
            if page_ref:
                lines.append(f"- **{term}** ... {page_ref}")
        
        lines.append("")
    
    # カテゴリなし
    if uncategorized:
        term_pages = defaultdict(list)
        for entry in uncategorized:
            term = entry.get('term', '')
            pages = get_pages_for_term(term, page_mapping)
            if pages:
                term_pages[term].extend(pages)
        
        if term_pages:
            lines.append("### **その他** {.index-category .unlisted}")
            lines.append("")
            
            for term in sorted(term_pages.keys(), key=term_sort_key):
                pages = term_pages[term]
                page_ref = format_page_ref(pages)
                if page_ref:
                    lines.append(f"- **{term}** ... {page_ref}")
            
            lines.append("")
    
    return '\n'.join(lines)


def find_idx_path(project_root: Path) -> Path:
    candidates = [
        project_root / "pdf_build" / "index.idx",
    ]
    candidates.extend(sorted((project_root / "pdf_build").glob("*.idx")))
    candidates.extend(sorted(project_root.glob("*.idx")))
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return project_root / "pdf_build" / "index.idx"


def main():
    """メイン処理"""
    # パス設定
    project_root = Path(__file__).parent.parent
    idx_path = find_idx_path(project_root)
    index_dir = project_root / "build" / "index"
    output_path = project_root / "pdf_build" / "content" / "96_index.qmd"
    
    if len(sys.argv) > 1:
        idx_path = Path(sys.argv[1])
    if len(sys.argv) > 2:
        output_path = Path(sys.argv[2])
    
    print("PDF用索引（ページ番号表示）を生成中...")
    print(f"  .idxファイル: {idx_path}")
    print(f"  索引ディレクトリ: {index_dir}")
    print(f"  出力先: {output_path}")
    
    # ページマッピング抽出（.idxファイルから）
    page_mapping = extract_term_page_mapping(idx_path)
    
    if not page_mapping:
        print("警告: ページマッピングが取得できませんでした")
        return 1
    
    # 索引データ読み込み
    entries = load_index_files(index_dir)
    
    if not entries:
        print("警告: 索引エントリが見つかりませんでした")
        return 1
    
    print(f"合計 {len(entries)} 索引エントリを処理")
    
    # QMD生成
    qmd_content = generate_index_qmd(entries, page_mapping)
    
    # 出力
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(qmd_content, encoding='utf-8')
    
    print(f"PDF用索引を生成完了: {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
