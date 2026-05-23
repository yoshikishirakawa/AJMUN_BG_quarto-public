"""
表紙・裏表紙管理サービス
設定ファイルとLaTeXテンプレートの同期を管理
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any
from dataclasses import dataclass, asdict


@dataclass
class CoverConfig:
    """表紙設定データクラス"""
    enabled: bool
    fileId: Optional[str]
    fileName: Optional[str]
    mimeType: Optional[str]
    path: Optional[str]
    position: str = "before_toc"
    pageNumber: Optional[int] = None
    updatedAt: Optional[str] = None
    updatedBy: Optional[str] = None


@dataclass
class CoverSettings:
    """表紙設定全体データクラス"""
    version: str
    covers: Dict[str, CoverConfig]
    history: list
    metadata: Dict[str, Any]


class CoverService:
    """
    表紙・裏表紙管理サービス
    """

    def __init__(self):
        self.project_root = Path(__file__).parent.parent.parent
        self.settings_path = self.project_root / "config" / "cover_settings.json"
        self.template_output_path = self.project_root / "meta" / "latex" / "cover-config.tex"
        self.assets_dir = self.project_root / "assets"

    def load_settings(self) -> Dict[str, Any]:
        """
        設定ファイルを読み込み
        """
        if not self.settings_path.exists():
            return self._get_default_settings()

        with open(self.settings_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def save_settings(self, settings: Dict[str, Any]):
        """
        設定ファイルを保存
        """
        self.settings_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.settings_path, 'w', encoding='utf-8') as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)

    def _get_default_settings(self) -> Dict[str, Any]:
        """
        デフォルト設定を返す
        """
        return {
            "version": "1.0.0",
            "covers": {
                "front": {
                    "enabled": True,
                    "fileId": "front_default",
                    "fileName": "front_cover.jpg",
                    "mimeType": "image/jpeg",
                    "path": "assets/front_cover.jpg",
                    "position": "before_toc",
                    "pageNumber": 0,
                    "updatedAt": datetime.now().isoformat(),
                    "updatedBy": "system"
                },
                "back": {
                    "enabled": False,
                    "fileId": None,
                    "fileName": None,
                    "mimeType": None,
                    "path": None,
                    "position": "after_content",
                    "pageNumber": None,
                    "updatedAt": None,
                    "updatedBy": None
                }
            },
            "history": [],
            "metadata": {
                "storage": {"type": "local", "basePath": "assets/covers"},
                "validation": {
                    "allowedMimeTypes": ["image/jpeg", "image/png"],
                    "maxFileSize": 10485760
                }
            }
        }

    def generate_latex_config(self) -> str:
        """
        LaTeX設定ファイルを生成
        """
        settings = self.load_settings()
        covers = settings.get("covers", {})

        lines = [
            "% 自動生成された表紙設定ファイル",
            f"% 生成日時: {datetime.now().isoformat()}",
            f"% バージョン: {settings.get('version', '1.0.0')}",
            "",
            "% ==============================",
            "% ヘルパーマクロ定義",
            "% ==============================",
            "% 比較用マクロ",
            "\\def\\trueval{true}",
            "\\def\\emptyval{}",
            "",
            "% ==============================",
            "% 表紙（フロントカバー）設定",
            "% ==============================",
        ]

        front = covers.get("front", {})
        if front.get("enabled") and front.get("path"):
            # パスが存在するか確認
            cover_path = self.project_root / front["path"]
            if cover_path.exists():
                lines.extend([
                    "\\def\\coverfrontenabled{true}",
                    f"\\def\\coverfrontpath{{{front['path']}}}",
                    f"\\def\\coverfrontposition{{{front.get('position', 'before_toc')}}}",
                ])
            else:
                # フォールバック: デフォルトパスを使用
                lines.extend([
                    "\\def\\coverfrontenabled{true}",
                    "\\def\\coverfrontpath{assets/front_cover.jpg}",
                    "\\def\\coverfrontposition{before_toc}",
                ])
        else:
            lines.extend([
                "\\def\\coverfrontenabled{false}",
                "\\def\\coverfrontpath{}",
                "\\def\\coverfrontposition{}",
            ])

        lines.extend([
            "",
            "% ==============================",
            "% 裏表紙（バックカバー）設定",
            "% ==============================",
        ])

        back = covers.get("back", {})
        if back.get("enabled") and back.get("path"):
            cover_path = self.project_root / back["path"]
            if cover_path.exists():
                lines.extend([
                    "\\def\\coverbackenabled{true}",
                    f"\\def\\coverbackpath{{{back['path']}}}",
                    f"\\def\\coverbackposition{{{back.get('position', 'after_content')}}}",
                ])
            else:
                lines.extend([
                    "\\def\\coverbackenabled{false}",
                    "\\def\\coverbackpath{}",
                    "\\def\\coverbackposition{}",
                ])
        else:
            lines.extend([
                "\\def\\coverbackenabled{false}",
                "\\def\\coverbackpath{}",
                "\\def\\coverbackposition{}",
            ])

        lines.append("")
        return "\n".join(lines)

    def write_latex_config(self) -> Path:
        """
        LaTeX設定ファイルを書き出し
        """
        config = self.generate_latex_config()
        self.template_output_path.parent.mkdir(parents=True, exist_ok=True)
        self.template_output_path.write_text(config, encoding='utf-8')
        return self.template_output_path

    def update_cover(self, cover_type: str, enabled: bool, file_path: Optional[str] = None, user_id: str = "system"):
        """
        表紙設定を更新
        """
        settings = self.load_settings()
        covers = settings.get("covers", {})
        cover = covers.get(cover_type, {})

        # 現在の状態を保存
        previous_file_id = cover.get("fileId")

        # 更新
        cover["enabled"] = enabled
        if file_path:
            cover["path"] = file_path
            cover["fileName"] = Path(file_path).name
            cover["fileId"] = f"{cover_type}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        cover["updatedAt"] = datetime.now().isoformat()
        cover["updatedBy"] = user_id

        covers[cover_type] = cover
        settings["covers"] = covers

        # 履歴に追加
        history_entry = {
            "timestamp": datetime.now().isoformat(),
            "action": "update" if previous_file_id else "upload",
            "coverType": cover_type,
            "userId": user_id,
            "fileId": cover.get("fileId"),
            "previousFileId": previous_file_id
        }
        settings["history"].insert(0, history_entry)

        # 保存
        self.save_settings(settings)

        # LaTeX設定を再生成
        self.write_latex_config()

        return cover

    def get_cover_status(self, cover_type: str) -> Dict[str, Any]:
        """
        表紙の状態を取得
        """
        settings = self.load_settings()
        cover = settings.get("covers", {}).get(cover_type, {})

        if not cover:
            return {"enabled": False, "exists": False}

        path = cover.get("path")
        exists = False
        if path:
            full_path = self.project_root / path
            exists = full_path.exists()

        return {
            "enabled": cover.get("enabled", False),
            "exists": exists,
            "path": path,
            "fileName": cover.get("fileName"),
            "updatedAt": cover.get("updatedAt")
        }


# シングルトンインスタンス
cover_service = CoverService()


if __name__ == "__main__":
    # テスト実行
    service = CoverService()
    print("Generated LaTeX config:")
    print(service.generate_latex_config())
