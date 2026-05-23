"""
フルページ画像管理サービス
表紙・裏表紙・広告・イラスト等のフルページ画像を管理
"""

import json
import uuid
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import re

try:
    from PIL import Image, ImageChops
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False


class FullPageImageType(str, Enum):
    """フルページ画像タイプ"""
    COVER_FRONT = "cover_front"
    COVER_BACK = "cover_back"
    ADVERTISEMENT = "advertisement"
    ILLUSTRATION = "illustration"
    APPENDIX = "appendix"


class DisplayMode(str, Enum):
    """表示モード"""
    FIT = "fit"      # フィット（余白あり）
    FILL = "fill"    # フィル（画面全体）
    ACTUAL = "actual" # 実寸
    CUSTOM = "custom" # カスタム


class PlacementType(str, Enum):
    """配置タイプ"""
    ABSOLUTE = "absolute"       # 絶対位置（ページ番号指定）
    AFTER_CHAPTER = "after_chapter"  # 章の後
    BEFORE_TOC = "before_toc"   # 目次前
    AFTER_CONTENT = "after_content"  # 本文後
    AFTER_APPENDICES = "after_appendices"  # 付録後
    BETWEEN_CHAPTERS = "between_chapters"  # 章間（指定された章の後に挿入）


@dataclass
class ImagePosition:
    """画像配置設定"""
    placement: str = PlacementType.BEFORE_TOC
    chapter_id: Optional[str] = None
    page_number: Optional[int] = None
    target_chapter_index: Optional[int] = None  # 章間配置用（何章目の後か）
    offset_pages: int = 0  # 章後/ページ後のオフセットページ数


@dataclass
class ChapterInfo:
    """章情報"""
    id: str
    index: int
    title: str
    page_start: int
    page_end: int


@dataclass
class ImageDisplay:
    """画像表示設定"""
    mode: str = DisplayMode.FIT
    scale: float = 100.0
    offset_x: float = 0.0
    offset_y: float = 0.0
    bleed: float = 3.0


@dataclass
class ImageValidation:
    """画像検証結果"""
    format: str = ""
    width: int = 0
    height: int = 0
    dpi: float = 0.0
    warnings: List[str] = None
    errors: List[str] = None

    def __post_init__(self):
        if self.warnings is None:
            self.warnings = []
        if self.errors is None:
            self.errors = []


@dataclass
class FullPageImage:
    """フルページ画像データ"""
    id: str
    type: str
    title: str
    path: str
    position: Dict[str, Any]
    display: Dict[str, Any]
    validation: Dict[str, Any]
    enabled: bool
    order: int
    created_at: str
    updated_at: str

    @classmethod
    def create(
        cls,
        image_type: str,
        title: str,
        path: str,
        position: Optional[Dict] = None,
        display: Optional[Dict] = None,
        order: int = 0
    ) -> "FullPageImage":
        now = datetime.now().isoformat()
        return cls(
            id=str(uuid.uuid4()),
            type=image_type,
            title=title,
            path=path,
            position=position or {"placement": PlacementType.BEFORE_TOC},
            display=display or {"mode": DisplayMode.FIT, "scale": 100, "offset_x": 0, "offset_y": 0, "bleed": 3},
            validation={"format": "", "width": 0, "height": 0, "dpi": 0, "warnings": [], "errors": []},
            enabled=True,
            order=order,
            created_at=now,
            updated_at=now
        )


class FullPageService:
    """
    フルページ画像管理サービス
    """

    def __init__(self):
        self.project_root = Path(__file__).parent.parent.parent
        self.config_path = self.project_root / "config" / "fullpage_images.json"
        self.storage_dir = self.project_root / "assets" / "fullpage"
        self.latex_config_path = self.project_root / "meta" / "latex" / "fullpage-config.tex"

    def _ensure_storage(self):
        """ストレージディレクトリを確保"""
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def _should_preserve_exact_page_box(self, image: Dict[str, Any]) -> bool:
        """Return True when the source page should be placed on A4 as-is."""
        image_type = str(image.get("type", "") or "")
        exact_types = {
            FullPageImageType.COVER_FRONT.value,
            FullPageImageType.COVER_BACK.value,
            FullPageImageType.ADVERTISEMENT.value,
        }
        return image_type in exact_types

    def _prepare_image_path_for_latex(self, image: Dict[str, Any]) -> str:
        """Return a LaTeX-safe asset path, auto-cropping white borders for fill images."""
        img_path = str(image.get("path", "") or "")
        if not img_path:
            return img_path

        if self._should_preserve_exact_page_box(image):
            return img_path

        if not PIL_AVAILABLE:
            return img_path

        display = image.get("display", {}) or {}
        if str(display.get("mode", "") or "").lower() != DisplayMode.FILL:
            return img_path

        source_path = self.project_root / img_path
        if not source_path.exists() or source_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            return img_path

        try:
            with Image.open(source_path) as img:
                rgb = img.convert("RGB")
                bg = Image.new("RGB", rgb.size, (255, 255, 255))
                diff = ImageChops.difference(rgb, bg)
                bbox = diff.point(lambda p: 255 if p > 10 else 0).getbbox()
                if not bbox:
                    return img_path
                if bbox == (0, 0, rgb.size[0], rgb.size[1]):
                    return img_path

                prepared_dir = self.project_root / "pdf_build" / "fullpage_prepared"
                prepared_dir.mkdir(parents=True, exist_ok=True)
                dest_name = f"{image.get('id', 'fullpage')}_trimmed{source_path.suffix.lower()}"
                dest_path = prepared_dir / dest_name

                cropped = img.crop(bbox)
                save_kwargs = {}
                if dest_path.suffix.lower() in {".jpg", ".jpeg"}:
                    save_kwargs.update({"quality": 95, "subsampling": 0})
                cropped.save(dest_path, **save_kwargs)
                return str(dest_path.relative_to(self.project_root))
        except Exception:
            return img_path

        return img_path

    def load_config(self) -> Dict[str, Any]:
        """設定ファイルを読み込み"""
        if not self.config_path.exists():
            return self._get_default_config()

        with open(self.config_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    def save_config(self, config: Dict[str, Any]):
        """設定ファイルを保存"""
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)

    def _get_default_config(self) -> Dict[str, Any]:
        """デフォルト設定を返す"""
        return {
            "version": "1.0.0",
            "images": [],
            "metadata": {
                "storage": {"type": "local", "basePath": "assets/fullpage"},
                "validation": {
                    "allowedMimeTypes": ["image/jpeg", "image/png", "image/pdf"],
                    "maxFileSize": 20971520,
                    "recommendedDimensions": {
                        "width": 2480,
                        "height": 3508,
                        "dpi": 300,
                        "bleed": 3
                    }
                }
            }
        }

    def get_all_images(self) -> List[FullPageImage]:
        """全画像を取得"""
        config = self.load_config()
        images = config.get("images", [])
        return [FullPageImage(**img) for img in sorted(images, key=lambda x: x.get("order", 0))]

    def get_image(self, image_id: str) -> Optional[FullPageImage]:
        """特定の画像を取得"""
        config = self.load_config()
        for img in config.get("images", []):
            if img.get("id") == image_id:
                return FullPageImage(**img)
        return None

    def get_images_by_type(self, image_type: str) -> List[FullPageImage]:
        """タイプ別に画像を取得"""
        all_images = self.get_all_images()
        return [img for img in all_images if img.type == image_type and img.enabled]

    def validate_image(self, image_path: Path) -> ImageValidation:
        """画像を検証 (300dpi, サイズ等のチェック)"""
        validation = ImageValidation()
        
        if not PIL_AVAILABLE:
            validation.warnings.append("PILが利用できないため、詳細な検証はスキップされます")
            return validation
        
        try:
            with Image.open(image_path) as img:
                # 基本情報
                validation.format = img.format or "unknown"
                width, height = img.size
                validation.width = width
                validation.height = height
                
                # DPI情報を取得
                dpi_info = img.info.get('dpi', (0, 0))
                if dpi_info and dpi_info[0]:
                    validation.dpi = dpi_info[0]
                
                # 推奨サイズ: A4 @ 300dpi = 2480 x 3508
                recommended_width = 2480
                recommended_height = 3508
                recommended_dpi = 300
                
                # DPIチェック
                if validation.dpi > 0 and validation.dpi < recommended_dpi:
                    validation.warnings.append(
                        f"解像度が低いです: {validation.dpi}dpi (推奨: {recommended_dpi}dpi)。"
                        f"印刷品質が低下する可能性があります。"
                    )
                elif validation.dpi > 0 and validation.dpi >= recommended_dpi:
                    validation.warnings.append(
                        f"解像度OK: {validation.dpi}dpi"
                    )
                else:
                    validation.warnings.append(
                        f"DPI情報が不明です。推奨: {recommended_dpi}dpi"
                    )
                
                # サイズチェック
                aspect_ratio = width / height
                a4_ratio = 210 / 297  # A4縦向きアスペクト比
                
                # 幅のチェック（許容範囲 ±10%）
                if width < recommended_width * 0.8:
                    validation.warnings.append(
                        f"幅が小さいです: {width}px (推奨: {recommended_width}px)。"
                        f"印刷時に粗くなる可能性があります。"
                    )
                elif width > recommended_width * 1.2:
                    validation.warnings.append(
                        f"幅が大きいです: {width}px (推奨: {recommended_width}px)。"
                        f"ファイルサイズが大きくなりますが、品質には影響ありません。"
                    )
                
                # 高さのチェック
                if height < recommended_height * 0.8:
                    validation.warnings.append(
                        f"高さが小さいです: {height}px (推奨: {recommended_height}px)"
                    )
                elif height > recommended_height * 1.2:
                    validation.warnings.append(
                        f"高さが大きいです: {height}px (推奨: {recommended_height}px)"
                    )
                
                # アスペクト比チェック
                if abs(aspect_ratio - a4_ratio) > 0.1:
                    validation.warnings.append(
                        f"アスペクト比がA4と異なります: {aspect_ratio:.2f} (A4: {a4_ratio:.2f})。"
                        f"余白が生じるか、画像が切れる可能性があります。"
                    )
                
                # ファイルサイズチェック
                file_size = image_path.stat().st_size
                max_size = 20 * 1024 * 1024  # 20MB
                if file_size > max_size:
                    validation.errors.append(
                        f"ファイルサイズが大きすぎます: {file_size / 1024 / 1024:.1f}MB (最大: 20MB)"
                    )
                
        except Exception as e:
            validation.errors.append(f"画像検証エラー: {str(e)}")
        
        return validation
    
    def _update_image_validation(self, image_id: str, validation: ImageValidation):
        """画像の検証結果を更新"""
        config = self.load_config()
        images = config.get("images", [])
        
        for img in images:
            if img.get("id") == image_id:
                img["validation"] = {
                    "format": validation.format,
                    "width": validation.width,
                    "height": validation.height,
                    "dpi": validation.dpi,
                    "warnings": validation.warnings,
                    "errors": validation.errors
                }
                img["updated_at"] = datetime.now().isoformat()
                break
        
        config["images"] = images
        self.save_config(config)

    def get_chapters_info(self) -> List[ChapterInfo]:
        """プロジェクトの章情報を取得"""
        chapters: List[ChapterInfo] = []

        # Prefer project config order to preserve UI ordering
        project_config_path = self.project_root / ".bgproject.json"
        if project_config_path.exists():
            try:
                project_data = json.loads(project_config_path.read_text(encoding="utf-8"))
                raw_chapters = project_data.get("chapters", [])
                enabled_chapters = [ch for ch in raw_chapters if ch.get("enabled", True)]
                sorted_chapters = sorted(enabled_chapters, key=lambda ch: ch.get("order", 0))
                for idx, ch in enumerate(sorted_chapters, start=1):
                    chapter_id = ch.get("id") or f"ch_{idx:03d}"
                    title = ch.get("title") or chapter_id
                    chapters.append(ChapterInfo(
                        id=chapter_id,
                        index=idx,
                        title=title,
                        page_start=0,
                        page_end=0
                    ))
                if chapters:
                    return chapters
            except Exception:
                # Fall back to filesystem scan below
                chapters = []

        content_dir = self.project_root / "content"

        # markdown/qmdファイルから章を検出
        if content_dir.exists():
            chapter_files = sorted(content_dir.glob("*.md")) + sorted(content_dir.glob("*.qmd"))

            for idx, file_path in enumerate(chapter_files, start=1):
                # ファイル名から章IDを抽出 (例: 01_ch01.md → ch01)
                match = re.match(r'\d+_(\w+)\.(md|qmd)$', file_path.name)
                if match:
                    chapter_id = match.group(1)

                    # タイトルを抽出（最初の見出し）
                    title = chapter_id
                    try:
                        content = file_path.read_text(encoding='utf-8')
                        # 最初の#見出しを探す
                        title_match = re.search(r'^#\s+(.+)$', content, re.MULTILINE)
                        if title_match:
                            title = title_match.group(1).strip()
                    except Exception:
                        pass

                    chapters.append(ChapterInfo(
                        id=chapter_id,
                        index=idx,
                        title=title,
                        page_start=0,  # PDF生成後に確定
                        page_end=0
                    ))

        return chapters
    
    def get_insertion_points(self) -> List[Dict[str, Any]]:
        """画像挿入ポイントの一覧を取得"""
        points = []
        chapters = self.get_chapters_info()
        
        # 目次前
        points.append({
            "type": "before_toc",
            "placement": "before_toc",
            "label": "目次の前",
            "chapter_id": None,
            "page_number": None
        })
        
        # 各章の後
        for chapter in chapters:
            points.append({
                "type": "after_chapter",
                "placement": "after_chapter",
                "label": f"{chapter.title} ({chapter.id}) の後",
                "chapter_id": chapter.id,
                "chapter_index": chapter.index,
                "page_number": None
            })
        
        # 章間のオプション
        for i in range(len(chapters)):
            if i < len(chapters) - 1:
                current = chapters[i]
                next_ch = chapters[i + 1]
                points.append({
                    "type": "between_chapters",
                    "placement": "between_chapters",
                    "label": f"{current.title} と {next_ch.title} の間",
                    "after_chapter_index": current.index,
                    "before_chapter_index": next_ch.index,
                    "page_number": None
                })
        
        # 本文後
        points.append({
            "type": "after_content",
            "placement": "after_content",
            "label": "本文の後",
            "chapter_id": None,
            "page_number": None
        })
        
        # 付録後
        points.append({
            "type": "after_appendices",
            "placement": "after_appendices",
            "label": "付録の後",
            "chapter_id": None,
            "page_number": None
        })
        
        return points
    
    def calculate_image_pages(
        self,
        images: List[FullPageImage],
        chapters: List[ChapterInfo],
        page_count: int
    ) -> List[Tuple[int, FullPageImage]]:
        """各画像の挿入ページを計算 (ページ番号, 画像)"""
        insertions = []
        
        # chapter_idからindexへのマップ
        chapter_map = {ch.id: ch for ch in chapters}
        
        for image in images:
            if not image.enabled:
                continue
            
            position = image.position
            placement = position.get("placement", PlacementType.BEFORE_TOC)
            
            page_number = None
            
            if placement == PlacementType.ABSOLUTE:
                page_number = position.get("page_number", 1)
            
            elif placement == PlacementType.BEFORE_TOC:
                # 目次前 = 最初のページ
                page_number = 1
            
            elif placement == PlacementType.AFTER_CHAPTER:
                chapter_id = position.get("chapter_id")
                offset_pages = position.get("offset_pages", 0)
                
                if chapter_id and chapter_id in chapter_map:
                    ch = chapter_map[chapter_id]
                    # 章の終了ページの次のページ
                    page_number = (ch.index * 10) + offset_pages  # 仮の計算
                else:
                    # デフォルト: 最後
                    page_number = page_count + 1
            
            elif placement == PlacementType.BETWEEN_CHAPTERS:
                target_index = position.get("target_chapter_index")
                offset_pages = position.get("offset_pages", 0)
                
                if target_index and 1 <= target_index <= len(chapters):
                    ch = chapters[target_index - 1]
                    # 指定章の後 + オフセット
                    page_number = (ch.index * 10) + offset_pages
                else:
                    # デフォルト: 最初の章の後
                    if chapters:
                        page_number = (chapters[0].index * 10) + offset_pages
                    else:
                        page_number = 1
            
            elif placement == PlacementType.AFTER_CONTENT:
                # 本文後
                if chapters:
                    last_ch = chapters[-1]
                    page_number = (last_ch.index * 10) + 1
                else:
                    page_number = page_count + 1
            
            elif placement == PlacementType.AFTER_APPENDICES:
                # 付録後 = 最後尾
                page_number = page_count + 1
            
            if page_number:
                insertions.append((page_number, image))
        
        # ページ番号順にソート
        insertions.sort(key=lambda x: x[0])
        return insertions

    def create_image(
        self,
        image_type: str,
        title: str,
        source_path: Path,
        position: Optional[Dict] = None,
        display: Optional[Dict] = None
    ) -> FullPageImage:
        """新規画像を作成"""
        self._ensure_storage()

        # 画像検証
        validation = self.validate_image(source_path)

        # ファイルを保存
        ext = source_path.suffix.lower()
        file_id = str(uuid.uuid4())[:8]
        dest_filename = f"{image_type}_{file_id}{ext}"
        dest_path = self.storage_dir / dest_filename

        shutil.copy2(source_path, dest_path)

        # 相対パスを生成
        rel_path = dest_path.relative_to(self.project_root)

        # 新規画像データ作成
        config = self.load_config()
        images = config.get("images", [])
        max_order = max((img.get("order", 0) for img in images), default=0)

        new_image = FullPageImage.create(
            image_type=image_type,
            title=title,
            path=str(rel_path),
            position=position,
            display=display,
            order=max_order + 1
        )
        
        # 検証結果を追加
        new_image.validation = {
            "format": validation.format,
            "width": validation.width,
            "height": validation.height,
            "dpi": validation.dpi,
            "warnings": validation.warnings,
            "errors": validation.errors
        }

        # 設定に追加
        images.append({
            "id": new_image.id,
            "type": new_image.type,
            "title": new_image.title,
            "path": new_image.path,
            "position": new_image.position,
            "display": new_image.display,
            "validation": new_image.validation,
            "enabled": new_image.enabled,
            "order": new_image.order,
            "created_at": new_image.created_at,
            "updated_at": new_image.updated_at
        })

        config["images"] = images
        self.save_config(config)
        self._generate_latex_config()

        return new_image

    def update_image(self, image_id: str, updates: Dict[str, Any]) -> Optional[FullPageImage]:
        """画像を更新"""
        config = self.load_config()
        images = config.get("images", [])

        for i, img in enumerate(images):
            if img.get("id") == image_id:
                # 更新可能なフィールド
                allowed_fields = ["title", "type", "position", "display", "enabled", "order"]
                for field in allowed_fields:
                    if field in updates:
                        img[field] = updates[field]

                img["updated_at"] = datetime.now().isoformat()
                images[i] = img

                config["images"] = images
                self.save_config(config)
                self._generate_latex_config()

                return FullPageImage(**img)

        return None

    def delete_image(self, image_id: str) -> bool:
        """画像を削除"""
        config = self.load_config()
        images = config.get("images", [])

        for i, img in enumerate(images):
            if img.get("id") == image_id:
                # ファイルを削除
                file_path = self.project_root / img.get("path", "")
                if file_path.exists():
                    file_path.unlink()

                # 設定から削除
                images.pop(i)
                config["images"] = images
                self.save_config(config)
                self._generate_latex_config()

                return True

        return False

    def reorder_images(self, image_ids: List[str]) -> bool:
        """画像順序を変更"""
        config = self.load_config()
        images = config.get("images", [])

        # IDから画像をマップ
        image_map = {img.get("id"): img for img in images}

        # 新しい順序でorderを更新
        for new_order, image_id in enumerate(image_ids):
            if image_id in image_map:
                image_map[image_id]["order"] = new_order
                image_map[image_id]["updated_at"] = datetime.now().isoformat()

        config["images"] = list(image_map.values())
        self.save_config(config)
        self._generate_latex_config()

        return True

    def _generate_latex_config(self):
        """LaTeX設定ファイルを生成"""
        config = self.load_config()
        images = config.get("images", [])

        lines = [
            "% 自動生成されたフルページ画像設定ファイル",
            f"% 生成日時: {datetime.now().isoformat()}",
            f"% バージョン: {config.get('version', '1.0.0')}",
            "",
            "% ==============================",
            "% 章情報（章間配置用）",
            "% ==============================",
        ]
        
        # 章情報を追加
        chapters = self.get_chapters_info()
        chapter_ids = ",".join([f"{ch.id}" for ch in chapters])
        lines.extend([
            f"\\def\\chapterlist{{{chapter_ids}}}",
            f"\\def\\chaptercount{{{len(chapters)}}}",
            "",
        ])
        chapter_index_map = {ch.id: ch.index for ch in chapters}
        
        for i, ch in enumerate(chapters, start=1):
            safe_ch_id = ch.id.replace("-", "_")
            lines.append(f"\\def\\chapterid{i}{{{safe_ch_id}}}")
            lines.append(f"\\def\\chaptertitle{i}{{{ch.title}}}")
        
        if chapters:
            lines.append("")
        
        lines.extend([
            "% ==============================",
            "% ヘルパーマクロ定義",
            "% ==============================",
            "\\def\\trueval{true}",
            "\\def\\emptyval{}",
            "",
            "% ==============================",
            "% フルページ画像定義",
            "% ==============================",
        ])

        enabled_images = [img for img in images if img.get("enabled")]
        
        # 配置タイプでソート
        def sort_key(img):
            placement_order = {
                "before_toc": 0,
                "between_chapters": 1,
                "after_chapter": 2,
                "after_content": 3,
                "after_appendices": 4,
                "absolute": 5
            }
            pos = img.get("position", {})
            return (placement_order.get(pos.get("placement"), 99), img.get("order", 0))
        
        enabled_images.sort(key=sort_key)

        # Dynamic macro names are accessed from LaTeX arguments, so use only
        # alnum tokens to avoid catcode issues with "_" or "-" during expansion.
        def to_latex_symbol_token(value: Any) -> str:
            token = re.sub(r"[^A-Za-z0-9]+", "", str(value or ""))
            return token or "x"

        # Macro names can contain "_" only when defined via \csname ... \endcsname.
        # We still normalize dynamic suffixes to alnum tokens for stability.
        def define_dynamic_macro(name: str, value: Any) -> str:
            return f"\\expandafter\\def\\csname {name}\\endcsname{{{value}}}"

        image_symbol_map: Dict[str, str] = {}

        for idx, img in enumerate(enabled_images, start=1):
            img_id = img.get("id", "")
            img_type = img.get("type", "")
            img_path = self._prepare_image_path_for_latex(img)
            display = img.get("display", {})
            position = img.get("position", {})
            validation = img.get("validation", {})

            # マクロ名用にIDを整形
            safe_id = to_latex_symbol_token(img_id)
            if safe_id in image_symbol_map.values():
                safe_id = f"{safe_id}{idx}"
            image_symbol_map[img_id] = safe_id

            chapter_id_val = position.get("chapter_id") or ""
            target_chidx_val = position.get("target_chapter_index")
            if target_chidx_val is None and chapter_id_val:
                target_chidx_val = chapter_index_map.get(chapter_id_val, 0)
            if target_chidx_val is None:
                target_chidx_val = 0
            offset_pages_val = position.get("offset_pages")
            if offset_pages_val is None:
                offset_pages_val = 0

            lines.extend([
                f"",
                define_dynamic_macro(f"fullpageid{safe_id}", img_id),
                define_dynamic_macro(f"fullpagetype{safe_id}", img_type),
                define_dynamic_macro(f"fullpagepath{safe_id}", img_path),
                define_dynamic_macro(f"fullpagemode{safe_id}", display.get('mode', 'fit')),
                define_dynamic_macro(f"fullpagescale{safe_id}", display.get('scale', 100)),
                define_dynamic_macro(f"fullpageoffsetx{safe_id}", display.get('offset_x', 0)),
                define_dynamic_macro(f"fullpageoffsety{safe_id}", display.get('offset_y', 0)),
                define_dynamic_macro(f"fullpagebleed{safe_id}", display.get('bleed', 3)),
                define_dynamic_macro(f"fullpageplacement{safe_id}", position.get('placement', 'before_toc')),
                define_dynamic_macro(f"fullpagechapterid{safe_id}", chapter_id_val),
                define_dynamic_macro(f"fullpagechidx{safe_id}", target_chidx_val),
                define_dynamic_macro(f"fullpageoffset{safe_id}", offset_pages_val),
            ])
            
            # 検証情報
            if validation.get('dpi'):
                lines.append(define_dynamic_macro(f"fullpagedpi{safe_id}", validation.get('dpi', 0)))
            if validation.get('warnings'):
                warnings = "; ".join(validation.get('warnings', []))
                lines.append(define_dynamic_macro(f"fullpagewarnings{safe_id}", warnings))

        # 画像リストマクロ
        lines.extend([
            "",
            "% ==============================",
            "% 有効画像リスト",
            "% ==============================",
        ])

        if enabled_images:
            ids_str = ",".join([
                image_symbol_map.get(img.get("id", ""), to_latex_symbol_token(img.get("id", "")))
                for img in enabled_images
            ])
            lines.append(f"\\def\\fullpageimageslist{{{ids_str}}}")
            
            # 配置別リストも作成
            by_placement = {}
            for img in enabled_images:
                placement = img.get("position", {}).get("placement", "other")
                placement_key = str(placement or "other")
                if placement_key not in by_placement:
                    by_placement[placement_key] = []
                by_placement[placement_key].append(
                    image_symbol_map.get(img.get("id", ""), to_latex_symbol_token(img.get("id", "")))
                )

            # Use a fixed set of placement macros so LaTeX side can always expand
            # without conditional \ifcsname checks.
            # Keep both canonical names (with underscores) and legacy aliases
            # (without underscores) because older templates used sanitized names.
            placement_macro_names = {
                "before_toc": ["before_toc", "beforetoc"],
                "between_chapters": ["between_chapters", "betweenchapters"],
                "after_chapter": ["after_chapter", "afterchapter"],
                "after_content": ["after_content", "aftercontent"],
                "after_appendices": ["after_appendices", "afterappendices"],
                "absolute": ["absolute"],
                "other": ["other"],
            }
            for placement_key, macro_suffixes in placement_macro_names.items():
                ids_str = ",".join(by_placement.get(placement_key, []))
                for macro_suffix in macro_suffixes:
                    lines.append(define_dynamic_macro(f"fullpage{macro_suffix}list", ids_str))
        else:
            lines.append("\\def\\fullpageimageslist{}")
            lines.append(define_dynamic_macro("fullpagebefore_toclist", ""))
            lines.append(define_dynamic_macro("fullpagebeforetoclist", ""))
            lines.append(define_dynamic_macro("fullpagebetween_chapterslist", ""))
            lines.append(define_dynamic_macro("fullpagebetweenchapterslist", ""))
            lines.append(define_dynamic_macro("fullpageafter_chapterlist", ""))
            lines.append(define_dynamic_macro("fullpageafterchapterlist", ""))
            lines.append(define_dynamic_macro("fullpageafter_contentlist", ""))
            lines.append(define_dynamic_macro("fullpageaftercontentlist", ""))
            lines.append(define_dynamic_macro("fullpageafter_appendiceslist", ""))
            lines.append(define_dynamic_macro("fullpageafterappendiceslist", ""))
            lines.append(define_dynamic_macro("fullpageabsolutelist", ""))
            lines.append(define_dynamic_macro("fullpageotherlist", ""))

        lines.append("")

        # ファイルに書き出し
        self.latex_config_path.parent.mkdir(parents=True, exist_ok=True)
        self.latex_config_path.write_text("\n".join(lines), encoding='utf-8')

    def migrate_from_covers(self):
        """既存のcover設定から移行"""
        cover_config_path = self.project_root / "config" / "cover_settings.json"

        if not cover_config_path.exists():
            return False

        with open(cover_config_path, 'r', encoding='utf-8') as f:
            cover_config = json.load(f)

        config = self.load_config()
        images = config.get("images", [])

        # フロントカバー
        front = cover_config.get("covers", {}).get("front", {})
        if front.get("enabled") and front.get("path"):
            # 既存のcover_frontがなければ追加
            existing = [img for img in images if img.get("type") == "cover_front"]
            if not existing:
                new_image = FullPageImage.create(
                    image_type="cover_front",
                    title="表紙",
                    path=front.get("path"),
                    position={"placement": front.get("position", "before_toc")},
                    order=0
                )
                images.append({
                    "id": new_image.id,
                    "type": new_image.type,
                    "title": new_image.title,
                    "path": new_image.path,
                    "position": new_image.position,
                    "display": new_image.display,
                    "validation": new_image.validation,
                    "enabled": new_image.enabled,
                    "order": new_image.order,
                    "created_at": new_image.created_at,
                    "updated_at": new_image.updated_at
                })

        # バックカバー
        back = cover_config.get("covers", {}).get("back", {})
        if back.get("enabled") and back.get("path"):
            existing = [img for img in images if img.get("type") == "cover_back"]
            if not existing:
                new_image = FullPageImage.create(
                    image_type="cover_back",
                    title="裏表紙",
                    path=back.get("path"),
                    position={"placement": back.get("position", "after_appendices")},
                    order=999
                )
                images.append({
                    "id": new_image.id,
                    "type": new_image.type,
                    "title": new_image.title,
                    "path": new_image.path,
                    "position": new_image.position,
                    "display": new_image.display,
                    "validation": new_image.validation,
                    "enabled": new_image.enabled,
                    "order": new_image.order,
                    "created_at": new_image.created_at,
                    "updated_at": new_image.updated_at
                })

        config["images"] = images
        self.save_config(config)
        self._generate_latex_config()

        return True


# シングルトンインスタンス
fullpage_service = FullPageService()


if __name__ == "__main__":
    # テスト実行
    service = FullPageService()
    print("Config loaded:", service.load_config())

    # 移行テスト
    if service.migrate_from_covers():
        print("Migration completed")
    else:
        print("No migration needed or cover config not found")
