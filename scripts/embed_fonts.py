#!/usr/bin/env python3
"""
フォント埋込スクリプト
WOFF2ファイルをCSSファイルにdata URIとして埋め込む
"""

import os
import sys
import base64
from pathlib import Path

def embed_font_as_data_uri(font_file_path):
    """WOFF2ファイルをdata URIに変換"""
    try:
        with open(font_file_path, 'rb') as f:
            font_data = f.read()
        
        # Base64エンコード
        encoded_data = base64.b64encode(font_data).decode('utf-8')
        
        # data URI生成
        data_uri = f"data:font/woff2;base64,{encoded_data}"
        
        return data_uri
    except Exception as e:
        print(f"エラー: フォントファイルの読み込みに失敗 {font_file_path}: {e}")
        return None

def update_css_file(css_file_path, font_file_path, data_uri):
    """CSSファイルのフォント参照をdata URIに置換"""
    try:
        # CSSファイル読み込み
        with open(css_file_path, 'r', encoding='utf-8') as f:
            css_content = f.read()
        
        # 相対パスの置換
        relative_path = f"url('../fonts/{font_file_path.name}')"
        
        if relative_path not in css_content:
            print(f"警告: {css_file_path} にフォント参照が見つかりません")
            return False
        
        # data URIに置換
        updated_content = css_content.replace(relative_path, f"url('{data_uri}')")
        
        # 更新したCSSを書き込み
        with open(css_file_path, 'w', encoding='utf-8') as f:
            f.write(updated_content)
        
        print(f"CSSファイルを更新: {css_file_path}")
        return True
        
    except Exception as e:
        print(f"エラー: CSSファイルの更新に失敗 {css_file_path}: {e}")
        return False

def backup_css_file(css_file_path):
    """CSSファイルのバックアップを作成"""
    backup_path = css_file_path.with_suffix(css_file_path.suffix + ".bak")
    
    try:
        with open(css_file_path, 'r', encoding='utf-8') as src:
            content = src.read()
        
        with open(backup_path, 'w', encoding='utf-8') as dst:
            dst.write(content)
        
        print(f"バックアップ作成: {backup_path}")
        return backup_path
        
    except Exception as e:
        print(f"警告: バックアップ作成に失敗: {e}")
        return None

def restore_css_backup(css_file_path, backup_path):
    """バックアップからCSSを復元"""
    try:
        with open(backup_path, 'r', encoding='utf-8') as src:
            content = src.read()
        
        with open(css_file_path, 'w', encoding='utf-8') as dst:
            dst.write(content)
        
        print(f"バックアップから復元: {css_file_path}")
        return True
        
    except Exception as e:
        print(f"エラー: バックアップからの復元に失敗: {e}")
        return False

def verify_embedded_font(css_file_path):
    """埋込フォントの検証"""
    try:
        with open(css_file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # data URIチェック
        has_data_uri = "data:font/woff2;base64," in content
        has_url_reference = "url(../fonts/" in content
        
        if has_data_uri and not has_url_reference:
            print("✓ フォント埋込に成功")
            return True
        else:
            print("✗ フォント埋込に失敗")
            return False
            
    except Exception as e:
        print(f"エラー: 検証に失敗: {e}")
        return False

def get_font_info(font_file_path):
    """フォントファイル情報を取得"""
    try:
        stat = font_file_path.stat()
        size_mb = stat.st_size / (1024 * 1024)
        
        info = {
            'name': font_file_path.name,
            'size_bytes': stat.st_size,
            'size_mb': round(size_mb, 2),
            'path': str(font_file_path)
        }
        
        return info
        
    except Exception as e:
        print(f"エラー: フォント情報取得に失敗: {e}")
        return None

def main():
    """メイン処理"""
    # 引数チェック
    if len(sys.argv) < 3:
        print("使用方法: python3 embed_fonts.py <font_file> <css_file>")
        sys.exit(1)
    
    font_file_path = Path(sys.argv[1])
    css_file_path = Path(sys.argv[2])
    
    # ファイル存在確認
    if not font_file_path.exists():
        print(f"エラー: フォントファイルが見つかりません: {font_file_path}")
        sys.exit(1)
    
    if not css_file_path.exists():
        print(f"エラー: CSSファイルが見つかりません: {css_file_path}")
        sys.exit(1)
    
    # フォント情報表示
    font_info = get_font_info(font_file_path)
    if font_info:
        print(f"フォント: {font_info['name']}")
        print(f"サイズ: {font_info['size_mb']} MB")
    
    # バックアップ作成
    print("バックアップ作成中...")
    backup_path = backup_css_file(css_file_path)
    
    # data URIに変換
    print("フォントをdata URIに変換中...")
    data_uri = embed_font_as_data_uri(font_file_path)
    
    if not data_uri:
        print("エラー: data URI変換に失敗")
        
        # バックアップ復元
        if backup_path:
            restore_css_backup(css_file_path, backup_path)
        
        sys.exit(1)
    
    data_uri_size_mb = len(data_uri) / (1024 * 1024)
    print(f"data URIサイズ: {round(data_uri_size_mb, 2)} MB")
    
    # CSSファイル更新
    print("CSSファイルを更新中...")
    if not update_css_file(css_file_path, font_file_path, data_uri):
        # バックアップ復元
        if backup_path:
            restore_css_backup(css_file_path, backup_path)
        
        sys.exit(1)
    
    # 検証
    print("埋込結果を検証中...")
    if verify_embedded_font(css_file_path):
        print("✓ フォント埋込処理が完了しました")
        
        # バックアップ削除（成功した場合）
        if backup_path:
            try:
                backup_path.unlink()
                print(f"バックアップファイルを削除: {backup_path}")
            except Exception as e:
                print(f"警告: バックアップ削除に失敗: {e}")
        
        sys.exit(0)
    else:
        print("✗ 検証に失敗")
        
        # バックアップ復元
        if backup_path:
            print("バックアップから復元中...")
            restore_css_backup(css_file_path, backup_path)
        
        sys.exit(1)

def restore_backup():
    """バックアップからの復元ユーティリティ"""
    print("バックアップからの復元機能")
    print("使用方法: python3 embed_fonts.py restore <css_file>")
    
    if len(sys.argv) == 3 and sys.argv[1] == "restore":
        css_file_path = Path(sys.argv[2])
        backup_path = css_file_path.with_suffix(css_file_path.suffix + ".bak")
        
        if not backup_path.exists():
            print(f"エラー: バックアップファイルが見つかりません: {backup_path}")
            sys.exit(1)
        
        if restore_css_backup(css_file_path, backup_path):
            print("復元完了")
        else:
            print("復元失敗")
    
    return 0

if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "restore":
        restore_backup()
    else:
        main()
