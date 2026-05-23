#!/usr/bin/env python3
"""
参考文献ページ生成スクリプト
meta/bib/*.yml から構造化された参考文献リスト（Markdown）を生成する
"""

import os
import sys
import yaml
from pathlib import Path

def parse_yaml_file(yaml_file):
    """YAMLファイルをパース"""
    try:
        with open(yaml_file, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
        return data
    except Exception as e:
        print(f"エラー: {yaml_file.name} 読み込み失敗: {e}")
        return None

def format_reference(ref):
    """参考文献エントリをフォーマット"""
    # 簡易的なフォーマット実装
    # 必要に応じてスタイル調整
    
    title = ref.get('title', '')
    author = ref.get('author', '')
    year = ref.get('year', '')
    publisher = ref.get('publisher', '')
    journal = ref.get('journal', '')
    url = ref.get('url', '')
    note = ref.get('note', '')
    
    text = f"**{title}**"
    if author:
        text += f", {author}"
    if year:
        text += f" ({year})"
    if publisher:
        text += f", {publisher}"
    if journal:
        text += f", {journal}"
    if url:
        text += f" <{url}>"
    if url:
        text += f" <{url}>"
        
    return text

def main():
    base_dir = Path('.')
    bib_dir = base_dir / 'meta/bib'
    output_file = base_dir / 'content/95_references_structured.qmd'
    
    if not bib_dir.exists():
        print(f"エラー: ディレクトリが見つかりません: {bib_dir}")
        sys.exit(1)
        
    # 章名マッピング
    chapter_mapping = {
        '00_front.yml': 'フロント挨拶',
        '01_ch01.yml': '第1章',
        '02_ch02.yml': '第2章',
        '03_ch03.yml': '第3章',
        '04_ch04.yml': '第4章',
        '05_ch05.yml': '第5章',
        '06_ch06.yml': '第6章',
        '07_ch07.yml': '第7章',
        '20_col01.yml': 'コラム1',
        '21_col02.yml': 'コラム2',
        '22_col03.yml': 'コラム3',
        '90_afterword.yml': '編集後記'
    }
    
    content = "---\n"
    content += "title: 参考文献\n"
    content += "---\n\n"
    content += "# 参考文献\n\n"
    
    yaml_files = sorted(list(bib_dir.glob('*.yml')))
    
    for yaml_file in yaml_files:
        data = parse_yaml_file(yaml_file)
        if not data:
            continue
            
        chapter_name = chapter_mapping.get(yaml_file.name, yaml_file.stem)
        
        # 章に参考文献が含まれているか確認
        has_refs = False
        if 'chapter' in data and data['chapter']:
            has_refs = True
        if 'sections' in data:
            for section in data['sections']:
                if 'references' in section and section['references']:
                    has_refs = True
                    break
        
        if not has_refs:
            continue
            
        content += f"## {chapter_name}\n\n"
        
        # 章共通の参考文献
        if 'chapter' in data and data['chapter']:
            for ref in data['chapter']:
                content += f"- {format_reference(ref)}\n"
            content += "\n"
            
        # 節ごとの参考文献
        if 'sections' in data:
            for section in data['sections']:
                section_title = section.get('section', '')
                refs = section.get('references', [])
                
                if not refs:
                    continue
                    
                if section_title:
                    content += f"### {section_title}\n\n"
                    
                for ref in refs:
                    content += f"- {format_reference(ref)}\n"
                content += "\n"
                
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print(f"生成完了: {output_file}")

if __name__ == "__main__":
    main()
