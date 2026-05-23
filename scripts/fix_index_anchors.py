#!/usr/bin/env python3
"""索引アンカーIDを修正するスクリプト"""
import os, sys, json, re
from pathlib import Path

def stable_source_from_stem(stem):
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


def stable_anchor_for(stem, anchor):
    suffix = re.search(r'-(\d{3}-\d{2})$', anchor or '')
    if suffix:
        return f"idx-{stem}-{suffix.group(1)}"
    return anchor


def fix_anchors_in_html(html_path, json_path):
    """HTMLファイル内のアンカーIDをJSONファイルのIDに置き換える"""
    if not os.path.exists(html_path) or not os.path.exists(json_path):
        return False, {}
    
    # JSONファイルを読み込む
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # HTMLファイルを読み込む
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    
    # アンカーIDのマッピングを作成
    # JSONのアンカーID（正しいID）と、HTMLの一時的なID（quarto-input...）をマッピング
    entries = data.get('entries', [])
    stem = Path(json_path).stem
    stable_source = stable_source_from_stem(stem)
    for entry in entries:
        entry['anchor'] = stable_anchor_for(stem, entry.get('anchor', ''))
        if stable_source:
            entry['source'] = stable_source
    if stable_source:
        data['source'] = stable_source
    
    # HTMLから一時的なアンカーIDを抽出
    temp_anchors = re.findall(r'id="(idx-[^"]+)"', html)
    
    # 置換マッピングを記録
    anchor_mapping = {}  # {temp_id: correct_id}
    
    # 順番に置き換え
    for i, entry in enumerate(entries):
        correct_id = entry['anchor']
        if i < len(temp_anchors):
            temp_id = temp_anchors[i]
            html = html.replace(f'id="{temp_id}"', f'id="{correct_id}"')
            anchor_mapping[temp_id] = correct_id
            print(f"  置換: {temp_id} -> {correct_id}")
    
    # HTMLファイルを書き込む
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    
    return True, anchor_mapping

def main():
    """メイン処理"""
    # build/index/*.json を読み込んで対応するHTMLファイルを修正
    index_dir = Path("build/index")
    out_dir = Path("out/content")
    
    if not index_dir.exists():
        print("警告: build/index ディレクトリが見つかりません")
        return
    
    json_files = list(index_dir.glob("*.json"))
    print(f"索引アンカーID修正中... ({len(json_files)}件)")
    
    # すべてのアンカーIDマッピングを記録
    all_mappings = {}  # {json_file_stem: {temp_id: correct_id}}
    
    for json_file in json_files:
        # JSONファイル名からHTMLファイル名を推測
        # 例: 05-ch05.json -> 05_ch05.html
        stem = json_file.stem
        html_name = stem.replace("-", "_") + ".html"
        html_path = out_dir / html_name
        
        if html_path.exists():
            print(f"処理中: {html_name}")
            success, mapping = fix_anchors_in_html(html_path, json_file)
            if success:
                all_mappings[stem] = mapping
        else:
            print(f"スキップ: {html_name} (HTMLファイルが見つかりません)")
    
    # マッピング情報を保存（索引ページ再生成時に使用）
    mapping_file = Path("build/anchor_mapping.json")
    with open(mapping_file, 'w', encoding='utf-8') as f:
        json.dump(all_mappings, f, ensure_ascii=False, indent=2)
    print(f"アンカーIDマッピングを保存: {mapping_file}")
    
    print("索引アンカーID修正完了")

if __name__ == "__main__":
    main()
