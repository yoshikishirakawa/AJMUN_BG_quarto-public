"""
表紙画像バリデーションサービス
アップロードされた画像の検証を行う
"""

import hashlib
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, List, Dict, Any
from datetime import datetime


@dataclass
class FileMetadata:
    """ファイルメタデータ"""
    mime_type: str
    size: int
    width: Optional[int] = None
    height: Optional[int] = None
    dpi: Optional[int] = None
    checksum: Optional[str] = None


@dataclass
class ValidationResult:
    """検証結果"""
    valid: bool
    errors: List[str]
    warnings: List[str]
    metadata: Optional[FileMetadata] = None


class CoverValidator:
    """
    アップロードされた表紙画像の検証
    """

    ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png']
    ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png']
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    RECOMMENDED_DIMENSIONS = {
        'width': 2480,   # A4 @ 300dpi
        'height': 3508,
        'dpi': 300
    }
    ASPECT_RATIO_TOLERANCE = 0.05  # 5%

    def __init__(self, strict: bool = False):
        self.strict = strict

    def validate(self, file_path: Path) -> ValidationResult:
        """
        包括的なファイル検証
        """
        errors = []
        warnings = []
        metadata = None

        # 1. ファイル存在確認
        if not file_path.exists():
            errors.append("ファイルが見つかりません")
            return ValidationResult(False, errors, warnings)

        # 2. ファイルサイズ確認
        file_size = file_path.stat().st_size
        if file_size > self.MAX_FILE_SIZE:
            errors.append(f"ファイルサイズが大きすぎます（最大{self.MAX_FILE_SIZE/1024/1024:.0f}MB）")

        if file_size == 0:
            errors.append("ファイルが空です")

        # 3. 拡張子確認
        if file_path.suffix.lower() not in self.ALLOWED_EXTENSIONS:
            errors.append(f"対応していないファイル形式です: {file_path.suffix}")

        # 4. MIMEタイプ確認
        mime_type = self._get_mime_type(file_path)
        if mime_type not in self.ALLOWED_MIME_TYPES:
            errors.append(f"対応していないファイル形式です: {mime_type}")

        # 5. 画像プロパティ確認（画像ファイルの場合）
        width, height, dpi = None, None, None
        if mime_type in self.ALLOWED_MIME_TYPES and not errors:
            try:
                width, height, dpi = self._get_image_info(file_path)
                
                if width and height:
                    # アスペクト比確認
                    expected_ratio = self.RECOMMENDED_DIMENSIONS['width'] / self.RECOMMENDED_DIMENSIONS['height']
                    actual_ratio = width / height
                    if abs(expected_ratio - actual_ratio) > self.ASPECT_RATIO_TOLERANCE:
                        warnings.append(f"推奨アスペクト比（A4: {expected_ratio:.3f}）と異なります: {actual_ratio:.3f}")

                    # サイズ確認
                    if width < self.RECOMMENDED_DIMENSIONS['width'] * 0.8:
                        warnings.append(f"推奨幅（{self.RECOMMENDED_DIMENSIONS['width']}px）より小さい画像です: {width}px")
                    if height < self.RECOMMENDED_DIMENSIONS['height'] * 0.8:
                        warnings.append(f"推奨高さ（{self.RECOMMENDED_DIMENSIONS['height']}px）より小さい画像です: {height}px")

                # 解像度確認
                if dpi and dpi < 300:
                    warnings.append(f"推奨DPI（300）より低いです: {dpi}dpi")

            except Exception as e:
                if self.strict:
                    errors.append(f"画像解析エラー: {e}")
                else:
                    warnings.append(f"画像解析警告: {e}")

        # 6. チェックサム計算
        checksum = self._calculate_checksum(file_path)

        if not errors:
            metadata = FileMetadata(
                mime_type=mime_type or 'unknown',
                size=file_size,
                width=width,
                height=height,
                dpi=dpi,
                checksum=checksum
            )

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            metadata=metadata
        )

    def _get_mime_type(self, file_path: Path) -> Optional[str]:
        """MIMEタイプを取得"""
        ext = file_path.suffix.lower()
        mime_map = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png'
        }
        return mime_map.get(ext)

    def _get_image_info(self, file_path: Path) -> tuple:
        """画像情報を取得 (width, height, dpi)"""
        try:
            from PIL import Image
            with Image.open(file_path) as img:
                width, height = img.size
                dpi = img.info.get('dpi', (None, None))[0]
                return width, height, dpi
        except ImportError:
            # PILがない場合は簡易的な検証のみ
            return None, None, None

    def _calculate_checksum(self, file_path: Path) -> str:
        """SHA-256チェックサム計算"""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256.update(chunk)
        return sha256.hexdigest()[:16]  # 先頭16文字のみ使用


class CoverUploadManager:
    """
    表紙ファイルアップロード管理
    """

    def __init__(self, project_root: Path = None):
        if project_root is None:
            project_root = Path(__file__).parent.parent.parent
        self.project_root = project_root
        self.covers_dir = project_root / "assets" / "covers"
        self.temp_dir = project_root / ".temp" / "uploads"
        self.validator = CoverValidator()

        # ディレクトリ作成
        self.covers_dir.mkdir(parents=True, exist_ok=True)
        self.temp_dir.mkdir(parents=True, exist_ok=True)

    def save_upload(self, temp_path: Path, cover_type: str, original_filename: str) -> Dict[str, Any]:
        """
        アップロードファイルを保存
        """
        # 検証
        result = self.validator.validate(temp_path)
        if not result.valid:
            return {
                "success": False,
                "errors": result.errors,
                "warnings": result.warnings
            }

        # ファイル名生成
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_name = f"{cover_type}_cover_{timestamp}_{result.metadata.checksum}{temp_path.suffix.lower()}"

        # カバータイプ別ディレクトリ
        cover_dir = self.covers_dir / cover_type
        cover_dir.mkdir(exist_ok=True)

        dest_path = cover_dir / safe_name

        # ファイル移動
        temp_path.rename(dest_path)

        # シンボリックリンク更新
        self._update_symlink(cover_type, dest_path)

        return {
            "success": True,
            "fileId": f"{cover_type}_{timestamp}",
            "fileName": safe_name,
            "path": str(dest_path.relative_to(self.project_root)),
            "mimeType": result.metadata.mime_type,
            "size": result.metadata.size,
            "dimensions": {
                "width": result.metadata.width,
                "height": result.metadata.height,
                "dpi": result.metadata.dpi
            },
            "warnings": result.warnings
        }

    def _update_symlink(self, cover_type: str, target_path: Path):
        """シンボリックリンクを更新"""
        link_path = self.covers_dir / cover_type / "current"
        if link_path.exists() or link_path.is_symlink():
            link_path.unlink()
        link_path.symlink_to(target_path)

    def cleanup_temp(self):
        """一時ファイルをクリーンアップ"""
        import shutil
        if self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)
            self.temp_dir.mkdir(parents=True, exist_ok=True)


# シングルトンインスタンス
cover_validator = CoverValidator()
cover_upload_manager = CoverUploadManager()
