#!/usr/bin/env python3
"""
BibTeXマージスクリプト
章ごとのbibファイルを1つのマージしたファイルにまとめる
"""

import os
import sys
import re
import yaml
from pathlib import Path
from collections import defaultdict

class BibEntry:
    """BibTeXエントリクラス"""
    
    def __init__(self, key, entry_type, content):
        self.key = key
        self.entry_type = entry_type
        self.raw_content = content
        self.fields = self.parse_fields(content)
        self.chapter = None
    
    def parse_fields(self, content):
        """BibTeXフィールドをパース"""
        fields = {}
        # 中括弧内のフィールドを抽出（簡易実装）
        field_pattern = r'(\w+)\s*=\s*{([^}]*)}'
        
        for match in re.finditer(field_pattern, content, re.IGNORECASE):
            field_name = match.group(1).lower()
            field_value = match.group(2).strip()
            fields[field_name] = field_value
        
        return fields
    
    def get_title(self):
        """タイトルを取得"""
        return self.fields.get('title', self.fields.get('maintitle', ''))
    
    def get_author(self):
        """著者を取得"""
        return self.fields.get('author', '')
    
    def get_year(self):
        """年を取得"""
        return self.fields.get('year', '')
    
    def to_bibtex(self):
        """BibTeX形式に変換"""
        return f"@{self.entry_type}{{{self.key},\n" + self.raw_content + "\n}"

def parse_bibtex_file(bib_file, chapter_name=None):
    """BibTeXファイルをパース"""
    if not bib_file.exists():
        print(f"警告: BibTeXファイルが見つかりません: {bib_file}")
        return []
    
    try:
        with open(bib_file, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"エラー: {bib_file.name} 読み込み失敗: {e}")
        return []
    
    entries = []
    entry_pattern = r'@(\w+)\s*{\s*(\w+)\s*,([^@]*?)}'
    
    for match in re.finditer(entry_pattern, content, re.IGNORECASE | re.DOTALL):
        entry_type = match.group(1)
        key = match.group(2)
        entry_content = match.group(3)
        
        entry = BibEntry(key, entry_type, entry_content)
        if chapter_name:
            entry.chapter = chapter_name
        
        entries.append(entry)
    
    return entries

def parse_yaml_file(yaml_file, chapter_name=None):
    """YAMLファイルをパース"""
    if not yaml_file.exists():
        print(f"警告: YAMLファイルが見つかりません: {yaml_file}")
        return []
    
    try:
        with open(yaml_file, 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)
    except Exception as e:
        print(f"エラー: {yaml_file.name} 読み込み失敗: {e}")
        return []
    
    if not data or 'sections' not in data:
        return []
        
    entries = []
    
    for section in data['sections']:
        if 'references' not in section:
            continue
            
        for ref in section['references']:
            if 'id' not in ref or 'type' not in ref:
                continue
                
            key = ref['id']
            entry_type = ref['type']
            
            # コンテンツ生成
            content = ""
            for k, v in ref.items():
                if k in ['id', 'type']:
                    continue
                # エスケープ処理などは簡易的
                content += f"  {k} = {{{v}}},\n"
            
            # 最後のカンマを削除
            if content.endswith(",\n"):
                content = content[:-2]
                
            entry = BibEntry(key, entry_type, content)
            if chapter_name:
                entry.chapter = chapter_name
            
            entries.append(entry)
            
    return entries

def deduplicate_entries(all_entries):
    """重複エントリを削除"""
    key_map = {}
    entries = []
    
    for entry in all_entries:
        if entry.key not in key_map:
            key_map[entry.key] = entry
            entries.append(entry)
        else:
            # 重複時のメタデータマージ
            existing = key_map[entry.key]
            print(f"警告: 重複エントリ {entry.key} ({entry.chapter})")
    
    return entries

def organize_entries_by_chapter(entries):
    """章ごとにエントリを整理"""
    chapter_entries = defaultdict(list)
    no_chapter = []
    
    for entry in entries:
        if entry.chapter:
            chapter_entries[entry.chapter].append(entry)
        else:
            no_chapter.append(entry)
    
    return chapter_entries, no_chapter

def generate_merged_bibtex(entries, sort_by_year=False):
    """マージされたBibTeXを生成"""
    if sort_by_year:
        entries.sort(key=lambda x: int(x.get_year() or '0'), reverse=True)
    else:
        # キーのアルファベット順
        entries.sort(key=lambda x: x.key.lower())
    
    content = "% Generated merged bibliography\n"
    content += "% Combined from individual chapter bibliographies\n\n"
    
    for entry in entries:
        content += entry.to_bibtex() + "\n\n"
    
    return content

def validate_bibtex_syntax(content):
    """基本的なBibTeX構文チェック"""
    errors = []
    
    # 中括弧のペアチェック
    brace_count = 0
    for i, char in enumerate(content):
        if char == '{':
            brace_count += 1
        elif char == '}':
            brace_count -= 1
        if brace_count < 0:
            errors.append(f"行 {i+1}: 閉じ括弧が多すぎます")
    
    if brace_count > 0:
        errors.append(f"開き括弧が {brace_count} 個閉じていません")
    
    return errors

def create_chapter_sections(entries, bib_dir):
    """章ごとのセクションを作成（オプション）"""
    sections = {}
    
    for entry in entries:
        if entry.chapter:
            if entry.chapter not in sections:
                sections[entry.chapter] = []
            sections[entry.chapter].append(entry)
    
    return sections

def write_bibtex_file(content, output_path):
    """BibTeXファイルを書き込み"""
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    except Exception as e:
        print(f"エラー: {output_path} 書き込み失敗: {e}")
        return False

def print_statistics(entries, chapter_entries):
    """統計情報表示"""
    print(f"総エントリ数: {len(entries)}")
    
    print("章ごとのエントリ数:")
    for chapter, chap_entries in sorted(chapter_entries.items()):
        print(f"  {chapter}: {len(chap_entries)}")
    
    # エントリタイプ別
    type_counts = defaultdict(int)
    for entry in entries:
        type_counts[entry.entry_type.lower()] += 1
    
    print("エントリタイプ:")
    for entry_type, count in sorted(type_counts.items()):
        print(f"  {entry_type}: {count}")

def main():
    """メイン処理"""
    # 引数チェック
    if len(sys.argv) < 2:
        print("使用方法: python3 merge_bib.py <bib_dir>")
        sys.exit(1)
    
    bib_dir = Path(sys.argv[1])
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
    
    # 全てのymlファイルを取得
    yaml_files = list(bib_dir.glob('*.yml'))
    if not yaml_files:
        print(f"警告: {bib_dir} にymlファイルが見つかりません")
        # 空のマージファイルを作成
        empty_content = "% Generated merged bibliography\n% No source files found\n"
        print(empty_content)
        return
    
    # 各ファイルのエントリをパース
    all_entries = []
    
    for yaml_file in sorted(yaml_files):
        chapter_name = chapter_mapping.get(yaml_file.name, yaml_file.stem)
        print(f"処理中: {yaml_file.name} ({chapter_name})")
        
        entries = parse_yaml_file(yaml_file, chapter_name)
        
        for entry in entries:
            entry.chapter = chapter_name
        
        all_entries.extend(entries)
        print(f"  エントリ数: {len(entries)}")
    
    # 重複削除
    print("重複チェック中...")
    unique_entries = deduplicate_entries(all_entries)
    print(f"一意なエントリ数: {len(unique_entries)}")
    
    # 章ごとに整理
    chapter_entries, no_chapter = organize_entries_by_chapter(unique_entries)
    
    # 統計情報
    print_statistics(unique_entries, chapter_entries)
    
    # マージしたコンテンツ生成
    print("マージファイル生成中...")
    merged_content = generate_merged_bibtex(unique_entries, sort_by_year=False)
    
    # 構文チェック
    print("構文検証中...")
    syntax_errors = validate_bibtex_syntax(merged_content)
    if syntax_errors:
        print("警告: 構文エラーが見つかりました:")
        for error in syntax_errors:
            print(f"  {error}")
    
    # 出力
    print("マージ BibTeX 内容:")
    print(merged_content)
    
    # ファイル保存（stdout標準出力が主）
    save_option = os.getenv('SAVE_BIB_MERGE')
    if save_option and save_option.lower() == 'true':
        output_file = bib_dir / 'merged.bib'
        if write_bibtex_file(merged_content, output_file):
            print(f"マージファイル保存: {output_file}")
        else:
            print(f"警告: マージファイルの保存に失敗しました")

if __name__ == "__main__":
    main()
