#!/usr/bin/env python3
"""索引生成スクリプト - build/index/*.json から索引を統合"""
import os, sys, json, re
from pathlib import Path
from collections import defaultdict

def format_section_label(section_numbers, chapter=None):
    """セクション番号を "Ch.2 Sec4.5.6" 形式にフォーマット"""
    if not section_numbers or len(section_numbers) == 0:
        return None
    
    # section_numbers = [chapter, section, subsection, subsubsection]
    parts = []
    
    if len(section_numbers) >= 1:
        parts.append(f"Ch.{section_numbers[0]}")
    
    if len(section_numbers) >= 2:
        sec_parts = [str(section_numbers[1])]
        if len(section_numbers) >= 3:
            sec_parts.append(str(section_numbers[2]))
        if len(section_numbers) >= 4:
            sec_parts.append(str(section_numbers[3]))
        parts.append(f"Sec{'.'.join(sec_parts)}")
    
    return " ".join(parts) if parts else None

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
    
    for json_file in json_files:
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            source = data.get('source', '')
            title = data.get('title', '')
            entries = data.get('entries', [])
            
            print(f"  処理中: {json_file.name} ({len(entries)}項目)")
            
            for entry in entries:
                term = entry.get('term', '')
                if not term:
                    continue
                
                # 正規化されたキーを生成
                normalized_key = term.lower().strip()
                
                # カテゴリを取得
                categories = entry.get('categories', [])
                
                # 索引項目を登録
                index_terms[normalized_key].append({
                    'term': term,
                    'reading': entry.get('reading'),
                    'categories': categories,
                    'anchor': entry.get('anchor', ''),
                    'section_label': entry.get('section_label', ''),
                    'section_numbers': entry.get('section_numbers', []),
                    'heading': entry.get('heading', ''),
                    'source': source,
                    'doc_title': title,
                })
        
        except Exception as e:
            print(f"警告: {json_file.name} の読み込みに失敗: {e}")
            import traceback
            traceback.print_exc()
            continue
    
    return index_terms

def organize_by_category_and_kana(index_terms):
    """カテゴリと50音順にグループ分け"""
    # カテゴリ別に分類（カテゴリごとに用語をまとめる）
    categorized = defaultdict(list)  # {category: [normalized_keys]}
    uncategorized = defaultdict(list)  # {kana_group: [normalized_keys]}
    
    kana_groups = {
        "あ": r"^[あいうえおアイウエオ]",
        "か": r"^[かきくけこがぎぐげごカキクケコガギグゲゴ]",
        "さ": r"^[さしすせそざじずぜぞサシスセソザジズゼゾ]",
        "た": r"^[たちつてとだぢづでどタチツテトダヂヅデド]",
        "な": r"^[なにぬねのナニヌネノ]",
        "は": r"^[はひふへほばびぶべぼぱぴぷぺぽハヒフヘホバビブベボパピプペポ]",
        "ま": r"^[まみむめもマミムメモ]",
        "や": r"^[やゆよヤユヨ]",
        "ら": r"^[らりるれろラリルレロ]",
        "わ": r"^[わをんワヲン]"
    }
    
    for normalized_key, entries in index_terms.items():
        if not entries:
            continue
        
        term = entries[0]['term']
        first_char = term[0] if term else ""
        
        # 50音グループを判定
        kana_group = "その他"
        for key, pattern in kana_groups.items():
            if re.match(pattern, first_char):
                kana_group = key
                break
        
        # カテゴリを収集（すべてのエントリから）
        all_categories = set()
        for entry in entries:
            cats = entry.get('categories', [])
            if cats and isinstance(cats, list):
                all_categories.update(cats)
        
        # デバッグ出力
        if all_categories:
            print(f"  カテゴリあり: {term} -> {all_categories}")
        
        if all_categories:
            # カテゴリがある場合 - カテゴリごとに登録
            for category in all_categories:
                categorized[category].append((normalized_key, kana_group))
        else:
            # カテゴリがない場合 - 50音グループに登録
            uncategorized[kana_group].append(normalized_key)
    
    print(f"カテゴリ数: {len(categorized)}, カテゴリなし: {len(uncategorized)}")
    return categorized, uncategorized

def generate_index_qmd(index_terms):
    """索引用QMDファイルを生成"""
    if not index_terms:
        return "---\ntitle: \"索引\"\n---\n\n# 索引\n\n索引項目が見つかりませんでした。\n"
    
    qmd_content = "---\ntitle: \"索引\"\n---\n\n# 索引\n\n"
    
    # デバッグ: 最初の数項目のカテゴリを確認
    print("\n=== デバッグ: 索引項目のカテゴリ確認 ===")
    for key, entries in list(index_terms.items())[:5]:
        if entries:
            print(f"  {entries[0]['term']}: {entries[0].get('categories', [])}")
    print("=" * 40 + "\n")
    
    # カテゴリと50音順にグループ分け
    categorized, uncategorized = organize_by_category_and_kana(index_terms)
    
    # カテゴリ別セクション
    if categorized:
        for category in sorted(categorized.keys()):
            # カテゴリ名を節タイトルと同じ書式で表示（目次には表示しない）
            qmd_content += f"## {category} {{.unlisted}}\n\n"
            
            # このカテゴリの用語をソート
            terms_in_category = sorted(categorized[category], key=lambda x: x[0])
            
            for normalized_key, kana_group in terms_in_category:
                entries = index_terms[normalized_key]
                if not entries:
                    continue
                
                display_term = entries[0]['term']
                locations = format_locations(entries)
                
                qmd_content += f"- **{display_term}** ... {locations}\n"
            
            qmd_content += "\n"
    
    # カテゴリなしの用語（50音順セクション）
    if uncategorized:
        qmd_content += "## カテゴリなし {.unlisted}\n\n"
        
        kana_order = ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら", "わ", "その他"]
        
        for kana_group in kana_order:
            terms = uncategorized.get(kana_group, [])
            if not terms:
                continue
            
            # 50音グループは小見出しとして表示
            qmd_content += f"### {kana_group}行\n\n"
            
            for normalized_key in sorted(terms):
                entries = index_terms[normalized_key]
                if not entries:
                    continue
                
                display_term = entries[0]['term']
                locations = format_locations(entries)
                
                qmd_content += f"- **{display_term}** ... {locations}\n"
            
            qmd_content += "\n"
    
    return qmd_content

def format_locations(entries):
    """出現箇所をフォーマット"""
    locations = []
    seen = set()
    
    for entry in entries:
        section_numbers = entry.get('section_numbers', [])
        anchor = entry.get('anchor', '')
        source = entry.get('source', '')
        
        # セクションラベルを生成
        section_label = format_section_label(section_numbers)
        if not section_label:
            section_label = entry.get('section_label', '') or entry.get('heading', '') or 'Unknown'
        
        # 重複チェック用のキー
        location_key = f"{source}:{anchor}"
        if location_key in seen:
            continue
        seen.add(location_key)
        
        # ソースファイル名からHTMLファイル名を生成
        if source:
            # "content/05_ch05.md" -> "05_ch05.html"
            source_path = Path(source)
            html_file = source_path.stem + ".html"
            
            # アンカーリンクを生成
            if anchor:
                link = f"[{section_label}]({html_file}#{anchor})"
                locations.append(link)
            else:
                locations.append(section_label)
        else:
            locations.append(section_label)
    
    return ", ".join(locations) if locations else "Unknown"

def main():
    """メイン処理"""
    if len(sys.argv) < 2:
        print("使用方法: python3 build_book_index.py <output_qmd_path>")
        print("  例: python3 build_book_index.py content/96_index.qmd")
        sys.exit(1)
    
    output_qmd = Path(sys.argv[1])
    
    # 索引JSONファイルを読み込み
    index_dir = Path("build/index")
    index_terms = load_index_files(index_dir)
    
    if not index_terms:
        print("警告: 索引項目が見つかりませんでした")
        qmd_content = "---\ntitle: \"索引\"\n---\n\n# 索引\n\n索引項目が見つかりませんでした。\n"
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
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    # デバッグ情報保存
    output_dir = Path("out")
    output_dir.mkdir(exist_ok=True)
    debug_file = output_dir / "index_debug.json"
    
    debug_data = {
        "total_terms": len(index_terms),
        "terms_by_count": {
            entries[0]['term'] if entries else key: len(entries)
            for key, entries in index_terms.items()
        }
    }
    
    try:
        with open(debug_file, 'w', encoding='utf-8') as f:
            json.dump(debug_data, f, ensure_ascii=False, indent=2)
        print(f"デバッグ情報を保存: {debug_file}")
    except Exception as e:
        print(f"警告: デバッグ情報の保存に失敗: {e}")
    
    print("索引生成完了")

if __name__ == "__main__":
    main()
