#!/usr/bin/env python3
"""索引生成スクリプト v3 - 文書集索引/事項索引 分離対応"""
import os, sys, json, re, html
from pathlib import Path
from collections import defaultdict

# 文書集索引のカテゴリ（この順番で表示）
DOCUMENT_CATEGORIES = [
    "安保理決議",
    "総会決議", 
    "その他の文書",
    "その他の国際法"
]

def fix_mojibake(text):
    """文字化けを修正（国連憲�� -> 国連憲章）"""
    if not text or not isinstance(text, str):
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

def load_index_files(index_dir):
    """build/index/*.json を読み込んで統合"""
    index_terms = defaultdict(list)
    index_path = Path(index_dir)
    
    if not index_path.exists():
        print(f"警告: 索引ディレクトリが見つかりません: {index_dir}")
        return index_terms
    
    json_files = list(index_path.glob("*.json"))
    if not json_files:
        print(f"警告: {index_dir} にJSONファイルが見つかりません")
        return index_terms
    
    print(f"索引ファイル読み込み中... ({len(json_files)}件)")
    
    def source_from_json_name(json_file):
        stem = json_file.stem
        match = re.match(r'^(\d{2})-ch(\d{2})$', stem)
        if match:
            return f"content/{match.group(1)}_ch{match.group(2)}.md"
        known = {
            "00-front": "content/00_front.md",
            "90-afterword": "content/90_afterword.md",
            "95-references": "content/95_references.qmd",
            "96-index": "content/96_index.qmd",
        }
        return known.get(stem)

    for json_file in json_files:
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            source = source_from_json_name(json_file) or data.get('source', '')
            entries = data.get('entries', [])
            
            print(f"  処理中: {json_file.name} ({len(entries)}項目)")
            
            for entry in entries:
                term = entry.get('term', '')
                if not term:
                    continue
                
                normalized_key = term.lower().strip()
                
                # カテゴリの文字化けを修正
                categories = entry.get('categories', [])
                if categories:
                    categories = [fix_mojibake(cat) for cat in categories]
                
                index_terms[normalized_key].append({
                    'term': term,
                    'reading': entry.get('reading'),
                    'categories': categories,
                    'anchor': entry.get('anchor', ''),
                    'section_label': entry.get('section_label', ''),
                    'section_numbers': entry.get('section_numbers', []),
                    'heading': entry.get('heading', ''),
                    'source': source,
                })
        
        except Exception as e:
            print(f"警告: {json_file.name} の読み込みに失敗: {e}")
            continue
    
    return index_terms

def resolution_sort_key(text, descending_last=False):
    """
    決議番号用ソートキー
    descending_last=True: 最後の数字を降順でソート（S/RES/411 → S/RES/42）
    descending_last=False: 全ての数字を昇順でソート（A/48/21 → A/48/123）
    
    スラッシュで区切られた数字は数値として比較
    """
    parts = []
    number_segments = []
    
    # スラッシュまたは数字と非数字で分割
    for segment in re.split(r'(/)', text):
        if segment == '/':
            parts.append((0, '/'))  # スラッシュは順序保持
        else:
            # さらに数字と非数字で分割
            for part in re.split(r'(\d+)', segment):
                if not part:
                    continue
                if part.isdigit():
                    num = int(part)
                    number_segments.append(len(parts))  # 数字の位置を記録
                    parts.append((1, num))
                else:
                    parts.append((2, part.lower()))
    
    # 降順モードの場合、最後の数字を反転（大きい値が先に来るように）
    if descending_last and number_segments:
        last_idx = number_segments[-1]
        original_num = parts[last_idx][1]
        # 大きな数から引くことで降順にする
        parts[last_idx] = (1, 1000000 - original_num)
    
    return parts


def is_resolution_pattern(text):
    """
    決議パターン（S/RES/xxx, A/RES/xxx）かどうかを判定
    これらは最後の番号を降順でソート
    """
    return bool(re.match(r'^[A-Z]/RES/', text, re.IGNORECASE))

def get_reading(text, kks=None):
    """日本語の読み仮名を取得"""
    if kks is None:
        return text.lower()
    result = kks.convert(text)
    return "".join([item['hira'] for item in result])

def smart_sort_key(text, kks=None):
    """
    スマートソートキー: 数字 → アルファベット → 50音順
    スラッシュ区切りの数字は数値比較（全て昇順）
    """
    # 決議番号パターン (S/RES/xxx, A/RES/xxx など) - 昇順
    if is_resolution_pattern(text):
        return (0, resolution_sort_key(text, descending_last=False))
    
    # その他の文書ID (スラッシュ含む) - 昇順
    if '/' in text:
        return (1, resolution_sort_key(text, descending_last=False))
    
    # 先頭が数字
    if text and text[0].isdigit():
        return (2, resolution_sort_key(text, descending_last=False))
    
    # 先頭がアルファベット
    if text and text[0].isascii() and text[0].isalpha():
        return (3, text.lower())
    
    # 日本語（50音順）
    reading = get_reading(text, kks)
    return (4, reading)

def organize_by_category(index_terms):
    """
    カテゴリ別に分類
    Returns:
        document_categories: {category: [normalized_keys]} (文書集索引用)
        subject_categories: {category: [normalized_keys]} (事項索引用)
        uncategorized: [normalized_keys] (カテゴリなし)
    """
    document_categories = defaultdict(list)
    subject_categories = defaultdict(list)
    uncategorized = []
    
    for normalized_key, entries in index_terms.items():
        if not entries:
            continue
        
        # すべてのエントリからカテゴリを収集
        all_categories = set()
        for entry in entries:
            cats = entry.get('categories', [])
            if cats and isinstance(cats, list):
                all_categories.update(cats)
        
        if all_categories:
            for category in all_categories:
                if category in DOCUMENT_CATEGORIES:
                    document_categories[category].append(normalized_key)
                else:
                    subject_categories[category].append(normalized_key)
        else:
            uncategorized.append(normalized_key)
    
    print(f"文書集カテゴリ: {len(document_categories)}, 事項カテゴリ: {len(subject_categories)}, カテゴリなし: {len(uncategorized)}")
    return document_categories, subject_categories, uncategorized

def format_locations(entries):
    """出現箇所をフォーマット"""
    locations = []
    seen = set()
    
    for entry in entries:
        anchor = entry.get('anchor', '')
        source = entry.get('source', '')
        section_label = entry.get('section_label', '') or entry.get('heading', '') or 'Unknown'
        
        location_key = f"{source}:{anchor}"
        if location_key in seen:
            continue
        seen.add(location_key)
        
        if source and anchor:
            source_path = Path(source)
            html_file = source_path.stem + ".html"
            root_href = f"content/{html_file}#{anchor}"
            local_href = f"{html_file}#{anchor}"
            label = html.escape(section_label)
            link = (
                '<span class="aj-index__loc">'
                f'<a href="{html.escape(local_href)}" '
                f'data-aj-index-root-href="{html.escape(root_href)}" '
                f'data-aj-index-local-href="{html.escape(local_href)}">'
                f'{label}</a></span>'
            )
            locations.append(link)
        else:
            locations.append(f'<span class="aj-index__loc">{html.escape(section_label)}</span>')
    
    return "".join(locations) if locations else '<span class="aj-index__loc">Unknown</span>'

def render_index_item(display_term, entries):
    """HTML用索引項目を、PDF用ページ番号ではなく本文アンカーリンクとして出力する"""
    locations = format_locations(entries)
    return (
        '- <span class="aj-index__entry">'
        f'<span class="aj-index__term">{html.escape(display_term)}</span>'
        '<span class="aj-index__dots">…</span>'
        f'<span class="aj-index__locations">{locations}</span>'
        '</span>\n'
    )

def generate_index_qmd(index_terms):
    """索引用QMDファイルを生成"""
    if not index_terms:
        return "---\ntitle: \"索引\"\n---\n\n索引項目が見つかりませんでした。\n"
    
    qmd_content = "---\ntitle: \"索引\"\n---\n\n# 索引 {.unnumbered}\n\n"
    qmd_content += (
        "::: {.aj-index-toolbar}\n"
        '<label class="aj-index-search-label" for="aj-index-search">索引内検索</label>\n'
        '<input id="aj-index-search" class="aj-index-search" type="search" '
        'placeholder="用語や章節で絞り込み" autocomplete="off">\n'
        '<button type="button" class="aj-index-toggle-all" data-aj-index-action="expand">すべて開く</button>\n'
        '<button type="button" class="aj-index-toggle-all" data-aj-index-action="collapse">すべて閉じる</button>\n'
        ":::\n\n"
        "::: {.aj-index}\n\n"
    )
    
    # pykakasiを初期化
    kks = None
    try:
        import pykakasi
        kks = pykakasi.kakasi()
        print("pykakasiを使用して50音順ソートを行います")
    except ImportError:
        print("警告: pykakasiが見つからないため、通常の文字コード順でソートします")
    
    # カテゴリ別に分類
    document_categories, subject_categories, uncategorized = organize_by_category(index_terms)
    
    # ========== 文書集索引 ==========
    has_documents = any(document_categories.get(cat) for cat in DOCUMENT_CATEGORIES)
    if has_documents:
        qmd_content += "## 文書集索引 {.unlisted .unnumbered}\n\n"
        
        for category in DOCUMENT_CATEGORIES:
            if category not in document_categories or not document_categories[category]:
                continue
            
            # Use larger heading with color styling (works in both HTML and PDF via CSS/LaTeX)
            qmd_content += f"### **{category}** {{.index-category .unlisted .unnumbered}}\n\n"
            
            # 国連憲章カテゴリは用語を正規化して数値ソート
            if category == '国連憲章':
                # Normalize terms and merge
                normalized_entries = {}
                for normalized_key in document_categories[category]:
                    entries = index_terms[normalized_key]
                    if not entries:
                        continue
                    display_term = normalize_charter_term(entries[0]['term'])
                    if display_term not in normalized_entries:
                        normalized_entries[display_term] = []
                    normalized_entries[display_term].extend(entries)
                
                for display_term in sorted(normalized_entries.keys(), key=charter_sort_key):
                    entries = normalized_entries[display_term]
                    qmd_content += render_index_item(display_term, entries)
            else:
                # スマートソート（決議番号の数値比較対応）
                terms_in_category = sorted(
                    document_categories[category],
                    key=lambda k: smart_sort_key(index_terms[k][0]['term'], kks)
                )
                
                for normalized_key in terms_in_category:
                    entries = index_terms[normalized_key]
                    if not entries:
                        continue
                    
                    display_term = entries[0]['term']
                    qmd_content += render_index_item(display_term, entries)
            
            qmd_content += "\n"
    
    # ========== 事項索引 ==========
    has_subjects = subject_categories or uncategorized
    if has_subjects:
        qmd_content += "## 事項索引 {.unlisted .unnumbered}\n\n"
        
        # 事項カテゴリを50音順でソート
        if subject_categories:
            def get_category_reading(cat):
                if kks:
                    result = kks.convert(cat)
                    return "".join([item['hira'] for item in result])
                return cat
            
            sorted_subject_categories = sorted(subject_categories.keys(), key=get_category_reading)
            
            for category in sorted_subject_categories:
                qmd_content += f"### **{category}** {{.index-category .unlisted .unnumbered}}\n\n"
                
                # 国連憲章カテゴリの用語は正規化
                if category == '国連憲章':
                    normalized_entries = {}
                    for normalized_key in subject_categories[category]:
                        entries = index_terms[normalized_key]
                        if not entries:
                            continue
                        display_term = normalize_charter_term(entries[0]['term'])
                        if display_term not in normalized_entries:
                            normalized_entries[display_term] = []
                        normalized_entries[display_term].extend(entries)
                    
                    for display_term in sorted(normalized_entries.keys(), key=charter_sort_key):
                        entries = normalized_entries[display_term]
                        qmd_content += render_index_item(display_term, entries)
                else:
                    # スマートソート
                    terms_in_category = sorted(
                        subject_categories[category],
                        key=lambda k: smart_sort_key(index_terms[k][0]['term'], kks)
                    )
                    
                    for normalized_key in terms_in_category:
                        entries = index_terms[normalized_key]
                        if not entries:
                            continue
                        
                        display_term = entries[0]['term']
                        qmd_content += render_index_item(display_term, entries)
                
                qmd_content += "\n"
        
        # カテゴリなしの用語
        if uncategorized:
            qmd_content += "### **その他** {.index-category .unlisted .unnumbered}\n\n"
            
            # スマートソート
            sorted_uncategorized = sorted(
                uncategorized,
                key=lambda k: smart_sort_key(index_terms[k][0]['term'], kks)
            )
            
            for normalized_key in sorted_uncategorized:
                entries = index_terms[normalized_key]
                if not entries:
                    continue
                
                display_term = entries[0]['term']
                qmd_content += render_index_item(display_term, entries)
            
            qmd_content += "\n"
    
    qmd_content += ":::\n\n[ページ上部へ](#索引){.aj-index-backtop}\n"
    return qmd_content

def main():
    """メイン処理"""
    if len(sys.argv) < 2:
        print("使用方法: python3 build_book_index_v2.py <output_qmd_path>")
        sys.exit(1)
    
    output_qmd = Path(sys.argv[1])
    
    # 索引JSONファイルを読み込み
    index_dir = Path("build/index")
    index_terms = load_index_files(index_dir)
    
    if not index_terms:
        print("警告: 索引項目が見つかりませんでした")
        qmd_content = "---\ntitle: \"索引\"\n---\n\n索引項目が見つかりませんでした。\n"
    else:
        print(f"索引項目数: {len(index_terms)}")
        qmd_content = generate_index_qmd(index_terms)
    
    # QMDファイルを保存
    try:
        output_qmd.parent.mkdir(parents=True, exist_ok=True)
        with open(output_qmd, 'w', encoding='utf-8') as f:
            f.write(qmd_content)
        print(f"索引QMDファイルを生成: {output_qmd}")
    except Exception as e:
        print(f"エラー: QMDファイルの生成に失敗: {e}")
        sys.exit(1)
    
    print("索引生成完了")

if __name__ == "__main__":
    main()
