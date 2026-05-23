#!/usr/bin/env python3
"""
build_structured_references.py

PDF用の構造化参考文献QMDファイルを生成する。
YAMLファイルから章・節構造を読み取り、章タイトル→章レベル参考文献→
節タイトル→節レベル参考文献の順で出力する。
"""

import yaml
import re
from pathlib import Path
from typing import Optional

# 章番号とタイトルのマッピング
CHAPTER_TITLES = {
    "02_ch02": "第2章 集団安全保障体制の系譜",
    "03_ch03": "第3章 争点・論点解説",
    "04_ch04": "第4章 国連による紛争処理",
    "05_ch05": "第5章 国連の制度",
    "06_ch06": "第6章 その他の関連国際法",
}


def format_author(author: str) -> str:
    """著者名をフォーマット"""
    if not author:
        return ""
    return author


def format_reference(ref: dict) -> str:
    """参考文献エントリをフォーマット"""
    ref_type = ref.get("type", "misc")
    author = ref.get("author", "")
    year = ref.get("year", "")
    title = ref.get("title", "")
    
    # 基本形式: 著者 (年). タイトル
    parts = []
    
    if author:
        parts.append(format_author(author))
    
    if year:
        parts.append(f"({year})")
    
    # タイトル（書籍はイタリック、論文は引用符）
    if title:
        if ref_type == "book":
            parts.append(f"*{title}*")
        elif ref_type in ["article", "inproceedings"]:
            parts.append(f"「{title}」")
        else:
            parts.append(title)
    
    # 追加情報
    extra = []
    
    if ref_type == "book":
        publisher = ref.get("publisher", "")
        if publisher:
            extra.append(publisher)
        edition = ref.get("edition", "")
        if edition:
            extra.append(edition)
    
    elif ref_type == "article":
        journal = ref.get("journal", "")
        if journal:
            journal_str = f"*{journal}*"
            volume = ref.get("volume", "")
            number = ref.get("number", "")
            if volume:
                journal_str += f" {volume}"
            if number:
                journal_str += f"({number})"
            extra.append(journal_str)
        pages = ref.get("pages", "")
        if pages:
            extra.append(f"pp. {pages}")
    
    elif ref_type == "techreport":
        institution = ref.get("institution", "")
        if institution:
            extra.append(institution)
        number = ref.get("number", "")
        if number:
            extra.append(f"No. {number}")
    
    elif ref_type == "inproceedings":
        booktitle = ref.get("booktitle", "")
        if booktitle:
            extra.append(f"*{booktitle}*")
        pages = ref.get("pages", "")
        if pages:
            extra.append(f"pp. {pages}")
    
    # URL
    url = ref.get("url", "")
    if url:
        extra.append(f"<{url}>")
    
    # 組み立て
    result = " ".join(parts)
    if extra:
        result += ". " + ", ".join(extra)
    
    return result


def load_bib_file(filepath: Path) -> Optional[dict]:
    """YAMLビブファイルを読み込む"""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()
            # YAMLパース前に不正な文字を修正
            content = content.replace("199３", "1993")
            data = yaml.safe_load(content)
            return data
    except Exception as e:
        print(f"警告: {filepath} の読み込みに失敗: {e}")
        return None


def generate_chapter_qmd(chapter_key: str, data: dict) -> str:
    """章の参考文献QMDを生成"""
    lines = []
    
    # 章タイトル
    chapter_title = CHAPTER_TITLES.get(chapter_key, chapter_key)
    lines.append(f"\n## {chapter_title}\n")
    
    # 章レベル参考文献
    chapter_refs = data.get("chapter", [])
    if chapter_refs:
        for ref in chapter_refs:
            formatted = format_reference(ref)
            lines.append(f"- {formatted}")
        lines.append("")
    
    # 節ごとの参考文献
    sections = data.get("sections", [])
    for section_data in sections:
        section_name = section_data.get("section", "")
        refs = section_data.get("references", [])
        
        if section_name and refs:
            lines.append(f"\n### {section_name}\n")
            for ref in refs:
                formatted = format_reference(ref)
                lines.append(f"- {formatted}")
            lines.append("")
    
    return "\n".join(lines)


def main():
    """メイン処理"""
    import sys
    
    # 引数からbibディレクトリと出力先を取得
    bib_dir = Path("meta/bib")
    output_path = Path("pdf_build/content/95_references.qmd")
    
    if len(sys.argv) > 1:
        output_path = Path(sys.argv[1])
    
    print(f"構造化参考文献を生成中...")
    print(f"  入力: {bib_dir}")
    print(f"  出力: {output_path}")
    
    # QMDヘッダー
    qmd_content = """---
title: "参考文献"
---

"""
    
    # 章順に処理
    chapter_order = ["02_ch02", "03_ch03", "04_ch04", "05_ch05", "06_ch06"]
    
    for chapter_key in chapter_order:
        filepath = bib_dir / f"{chapter_key}.yml"
        if not filepath.exists():
            print(f"  スキップ: {filepath} (存在しない)")
            continue
        
        data = load_bib_file(filepath)
        if not data:
            continue
        
        chapter_qmd = generate_chapter_qmd(chapter_key, data)
        qmd_content += chapter_qmd
        
        # 統計
        chapter_refs = len(data.get("chapter", []))
        section_refs = sum(len(s.get("references", [])) for s in data.get("sections", []))
        print(f"  {chapter_key}: 章レベル {chapter_refs}件, 節レベル {section_refs}件")
    
    # 出力ディレクトリ作成
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    # ファイル書き出し
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(qmd_content)
    
    print(f"構造化参考文献を生成完了: {output_path}")


if __name__ == "__main__":
    main()
