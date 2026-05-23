#!/usr/bin/env python3
"""
フォントサブセット化スクリプト
UDP明朝の不要な文字を削除してファイルサイズを削減
"""

import os
import sys
import json
from pathlib import Path
from collections import Counter

# 必要な文字集合の定義
ESSENTIAL_RANGES = [
    (0x0020, 0x007E),    # ASCII (表示可能文字)
    (0x3000, 0x303F),    # CJK記号・句読点
    (0x3040, 0x309F),    # ひらがな
    (0x30A0, 0x30FF),    # カタカナ
    (0xFF00, 0xFFEF),    # 半角・全角形式
]

# JIS第一水準漢字の範囲（学術文書でよく使用）
JIS_LEVEL1_KANJI = [
    (0x4E00, 0x4E1D),    # 一部の常用漢字
    (0x4E28, 0x4E3C),    # 
    (0x4E39, 0x4E42),    # 
    # 必要に応じて追加...
]

# 学術文書で頻出する文字
ACADEMIC_CHARS = set("""　、。・「」『』（）[]{}【】〈〉
年月日時分秒
第条項法律規定憲法条約宣言規約
人権国家主権平和安全自由平等
社会経済教育文化福祉環境
開発技術科学現代歴史政治
国際世界連合欧米アジア
研究調査報告分析考察
掲載引用参考文献索引
編集著者発行出版
""")

def extract_unicode_ranges(text):
    """テキストから使用されているUnicode範囲を抽出"""
    if not text:
        return []
    
    used_chars = set(text)
    ranges = []
    
    if not used_chars:
        return ranges
    
    # 連続するUnicodeポイントを範囲にまとめる
    sorted_chars = sorted(used_chars)
    start = sorted_chars[0]
    end = start
    
    for char in sorted_chars[1:]:
        if ord(char) == end + 1:
            end = ord(char)
        else:
            ranges.append((start, end))
            start = end = ord(char)
    
    # 最後の範囲を追加
    if start <= end:
        ranges.append((start, end))
    
    return ranges

def analyze_content(content_files):
    """コンテンツファイルを分析して使用文字を特定"""
    all_content = ""
    
    for file_path in content_files:
        if not file_path.exists() or not file_path.suffix.lower() == '.md':
            continue
        
        print(f"分析中: {file_path.name}")
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                all_content += content
        except Exception as e:
            print(f"警告: {file_path.name} 読み込み失敗: {e}")
    
    # 使用文字をカウント
    char_counter = Counter(all_content)
    
    # よく使われる文字（頻度基準でサブセットに含める）
    frequently_used = {char for char, count in char_counter.items() 
                      if count >= 2 and ord(char) <= 0x30FF}
    
    # 学術的必須文字
    academic_chars = set(ACADEMIC_CHARS)
    
    # 基本文字集合
    essential_chars = set()
    for start, end in ESSENTIAL_RANGES + JIS_LEVEL1_KANJI:
        for code_point in range(start, end + 1):
            if code_point <= 0x10FFFF:  # Unicodeの最大値チェック
                essential_chars.add(chr(code_point))
    
    # 結合
    subset_chars = (
        essential_chars | 
        frequently_used | 
        academic_chars
    )
    
    # 統計情報
    total_chars = len(set(all_content))
    subset_count = len(subset_chars)
    reduction_rate = (1 - subset_count / total_chars) * 100 if total_chars > 0 else 0
    
    print(f"使用文字数: {total_chars}")
    print(f"サブセット文字数: {subset_count}")
    print(f"削減率: {reduction_rate:.1f}%")
    
    return subset_chars

def create_font_subset_command(input_path, output_path, subset_chars):
    """フォントサブセット化コマンドを生成"""
    
    # 文字リストをテキストファイルに書き出し
    chars_path = output_path.with_suffix('.txt')
    
    with open(chars_path, 'w', encoding='utf-8') as f:
        # 文字を1行1文字で保存
        for char in sorted(subset_chars):
            f.write(char + '\n')
    
    if not chars_path.exists():
        print(f"エラー: 文字リストファイル作成失敗: {chars_path}")
        return None
    
    # hb-subsetコマンド（HarfBuzzが必要）
    # フォールバック: pyftsubsetコマンド（FontToolsが必要）
    commands = []
    
    # pyftsubset試行
    cmd_pyftsubset = [
        'pyftsubset',
        str(input_path),
        f'--output-file={output_path}',
        f'--text-file={chars_path}',
        '--flavor=woff2',
        '--glyph-names',
        '--symbol-cmap',
        '--layout-features=*'
    ]
    commands.append(('pyftsubset', cmd_pyftsubset))
    
    # hb-subset試行
    cmd_hbsubset = [
        'hb-subset',
        '--input-file=' + str(input_path),
        '--output-file=' + str(output_path),
        '--text-file=' + str(chars_path),
        '--output-format=woff2'
    ]
    commands.append(('hb-subset', cmd_hbsubset))
    
    return commands

def execute_subset_command(commands, output_path):
    """サブセット化コマンドを実行"""
    
    for tool_name, cmd in commands:
        try:
            print(f"{tool_name} でサブセット化を試み中...")
            
            import subprocess
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            if result.returncode == 0:
                # 成功確認
                if output_path.exists():
                    original_size = Path(str(output_path).replace('-subset', '')).stat().st_size
                    subset_size = output_path.stat().st_size
                    reduction = (1 - subset_size / original_size) * 100
                    
                    print(f"✓ {tool_name} でサブセット化成功")
                    print(f"  元サイズ: {original_size // 1024} KB")
                    print(f"  サブセット: {subset_size // 1024} KB")
                    print(f"  削減率: {reduction:.1f}%")
                    
                    return True
                else:
                    print(f"警告: {tool_name} 実行完了が出力ファイルなし")
                    
            else:
                print(f"警告: {tool_name} 失敗: {result.stderr}")
                
        except subprocess.TimeoutExpired:
            print(f"警告: {tool_name} タイムアウト")
        except subprocess.SubprocessError as e:
            print(f"警告: {tool_name} 実行エラー: {e}")
        except Exception as e:
            print(f"警告: {tool_name} 例外: {e}")
    
    return False

def verify_subset_font(original_path, subset_path, subset_chars):
    """サブセットフォントの検証"""
    try:
        # ファイルサイズ比較
        original_size = original_path.stat().st_size
        subset_size = subset_path.stat().st_size
        
        if not subset_path.exists():
            print("✗ サブセットファイルが存在しません")
            return False
        
        if subset_size >= original_size:
            print(f"✗ サブセットフォントが元より大きい: {subset_size} >= {original_size}")
            return False
        
        reduction = (1 - subset_size / original_size) * 100
        print(f"✓ ファイルサイズ削減: {reduction:.1f}%")
        
        # 基本的なフォント情報（簡易検証）
        print(f"✓ サブセット化成功")
        return True
        
    except Exception as e:
        print(f"✗ 検証エラー: {e}")
        return False

def create_fallback_subset(original_path, output_path, subset_chars):
    """簡易的なサブセット化（フォールバック）"""
    try:
        print("簡易サブセット化を試み中...")
        
        # Pythonでの簡易的なクロップ（フォントツールがない場合のフォールバック）
        # 実際にはこの方法は不完全だが、最低限の機能を提供
        
        # とりあえず元ファイルをコピーだけする（実装は要改善）
        import shutil
        shutil.copy2(original_path, output_path)
        
        print("⚠ 簡易サブセット化（フルコピー）: 専用ツールの導入を推奨")
        return True
        
    except Exception as e:
        print(f"✗ 簡易サブセット化失敗: {e}")
        return False

def prepare_default_chars():
    """デフォルト文字集合を準備"""
    chars = set()
    
    # 基本文字集合
    for start, end in ESSENTIAL_RANGES:
        for code_point in range(start, end + 1):
            if code_point <= 0x10FFFF:
                chars.add(chr(code_point))
    
    # 学術文字
    chars.update(ACADEMIC_CHARS)
    
    return chars

def main():
    """メイン処理"""
    # 引数チェック
    if len(sys.argv) < 3:
        print("使用方法: python3 subset_font.py <input_font> <output_font>")
        sys.exit(1)
    
    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    
    # ファイル確認
    if not input_path.exists():
        print(f"エラー: 入力ファイルが見つかりません: {input_path}")
        sys.exit(1)
    
    # サブセット文字の決定
    content_dir = Path("../content")
    if content_dir.exists():
        print("コンテンツを分析して文字集合を決定...")
        content_files = list(content_dir.glob("*.md"))
        if content_files:
            subset_chars = analyze_content(content_files)
        else:
            print("警告: コンテンツが見つからないため、デフォルト文字集合を使用")
            subset_chars = prepare_default_chars()
    else:
        print("デフォルト文字集合を使用...")
        subset_chars = prepare_default_chars()
    
    if not subset_chars:
        print("エラー: サブセット文字がありません")
        sys.exit(1)
    
    # サブセット化
    commands = create_font_subset_command(input_path, output_path, subset_chars)
    
    success = execute_subset_command(commands, output_path)
    
    if not success:
        print("専用ツール失敗、簡易サブセット化を試みます...")
        success = create_fallback_subset(input_path, output_path, subset_chars)
    
    if success:
        # 検証
        if verify_subset_font(input_path, output_path, subset_chars):
            print(f"サブセット化完了: {output_path}")
        else:
            print("警告: 検証失敗")
    else:
        print("エラー: サブセット化失敗")
        sys.exit(1)

if __name__ == "__main__":
    main()
