import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { imageService, UploadImageResponse } from '@/services/imageService';

interface InsertImageModalProps {
    isOpen: boolean;
    onClose: () => void;
    onInsert: (markdown: string) => void;
    chapterId: string;
}

type ImageFit = 'stretch' | 'contain';
type ImagePosition = 'center' | 'top' | 'bottom';

export const InsertImageModal: React.FC<InsertImageModalProps> = ({
    isOpen,
    onClose,
    onInsert,
    chapterId,
}) => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [altText, setAltText] = useState('');
    const [width, setWidth] = useState('80%');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // フルページ画像オプション
    const [isFullpage, setIsFullpage] = useState(false);
    const [fullpageWidth, setFullpageWidth] = useState<'a4' | 'a3' | 'a5' | '100%' | 'custom'>('a4');
    const [fullpageFit, setFullpageFit] = useState<ImageFit>('stretch');
    const [fullpagePosition, setFullpagePosition] = useState<ImagePosition>('center');

    // クリーンアップ
    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    // ファイル選択ハンドラ
    const handleFileSelect = useCallback((file: File) => {
        // 画像ファイルのみ許可
        if (!file.type.startsWith('image/')) {
            setUploadError('画像ファイルのみアップロードできます');
            return;
        }

        // サイズ制限（10MB）
        if (file.size > 10 * 1024 * 1024) {
            setUploadError('画像サイズは10MB以下にしてください');
            return;
        }

        setSelectedFile(file);
        setUploadError(null);

        // プレビュー作成
        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);

        // ファイル名からAltテキストを推測
        const fileName = file.name.replace(/\.[^/.]+$/, '');
        setAltText(fileName);
    }, []);

    // ドラッグ&ドロップイベント
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    }, [handleFileSelect]);

    // ファイル入力変更
    const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            handleFileSelect(files[0]);
        }
    }, [handleFileSelect]);

    // クリア
    const handleClear = useCallback(() => {
        setSelectedFile(null);
        setPreviewUrl(null);
        setAltText('');
        setWidth('80%');
        setUploadError(null);
        setIsFullpage(false);
        setFullpageWidth('a4');
        setFullpageFit('stretch');
        setFullpagePosition('center');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, []);

    // 挿入
    const handleInsert = useCallback(async () => {
        if (!selectedFile || !chapterId) return;

        setIsUploading(true);
        setUploadError(null);

        try {
            const response: UploadImageResponse = await imageService.uploadImage(selectedFile, chapterId);

            // Markdown形式の画像タグを作成
            let markdown: string;

            if (isFullpage) {
                // フルページ画像
                const attrs: string[] = [`.fullpage-image`];
                if (fullpageWidth !== 'a4') {
                    attrs.push(`width="${fullpageWidth}"`);
                }
                if (fullpageFit !== 'stretch') {
                    attrs.push(`fit="${fullpageFit}"`);
                }
                if (fullpagePosition !== 'center') {
                    attrs.push(`position="${fullpagePosition}"`);
                }
                markdown = `![](${response.path}){${attrs.join(' ')}}`;
            } else {
                // 通常の画像
                markdown = `![${altText}](${response.path})`;
                if (width && width !== '100%') {
                    markdown += `{width="${width}"}`;
                }
            }

            onInsert(markdown);
            handleClear();
            onClose();
        } catch (error) {
            setUploadError(error instanceof Error ? error.message : '画像のアップロードに失敗しました');
        } finally {
            setIsUploading(false);
        }
    }, [selectedFile, chapterId, altText, width, isFullpage, fullpageWidth, fullpageFit, fullpagePosition, onInsert, handleClear, onClose]);

    // キャンセル
    const handleCancel = useCallback(() => {
        handleClear();
        onClose();
    }, [handleClear, onClose]);

    // キーボードハンドラ
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            handleCancel();
        }
    }, [handleCancel]);

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                className="max-w-lg"
                onKeyDown={handleKeyDown}
                aria-label="画像を挿入"
            >
                <DialogHeader>
                    <DialogTitle>画像を挿入</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* ドラッグ&ドロップエリア */}
                    {!selectedFile ? (
                        <div
                            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${isDragOver
                                    ? 'border-primary bg-primary/5'
                                    : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                                }`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileInputChange}
                                className="hidden"
                                aria-label="画像ファイルを選択"
                            />
                            <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                            <p className="text-sm font-medium mb-2">
                                画像をドラッグ&ドロップ
                            </p>
                            <p className="text-xs text-muted-foreground mb-4">
                                または
                            </p>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                ファイルを選択
                            </Button>
                        </div>
                    ) : (
                        /* プレビュー */
                        <div className="space-y-2">
                            <div className="relative">
                                <img
                                    src={previewUrl || ''}
                                    alt="プレビュー"
                                    className="w-full h-auto rounded-lg border"
                                />
                                <Button
                                    type="button"
                                    variant="destructive"
                                    size="icon"
                                    className="absolute top-2 right-2"
                                    onClick={handleClear}
                                    aria-label="クリア"
                                >
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                            </p>
                        </div>
                    )}

                    {/* エラー表示 */}
                    {uploadError && (
                        <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md">
                            {uploadError}
                        </div>
                    )}

                    {/* 設定 */}
                    {selectedFile && (
                        <div className="space-y-3">
                            {/* フルページ画像チェックボックス */}
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="fullpage"
                                    checked={isFullpage}
                                    onChange={(e) => setIsFullpage(e.target.checked)}
                                />
                                <Label htmlFor="fullpage" className="cursor-pointer">
                                    フルページ画像として挿入（広告・表紙など）
                                </Label>
                            </div>

                            {isFullpage ? (
                                // フルページ画像オプション
                                <div className="space-y-3 pl-6 border-l-2 border-primary/20">
                                    {/* サイズ選択 */}
                                    <div className="space-y-1">
                                        <Label htmlFor="fullpage-width">サイズ</Label>
                                        <select
                                            id="fullpage-width"
                                            value={fullpageWidth}
                                            onChange={(e) => setFullpageWidth(e.target.value as any)}
                                            className="w-full px-3 py-2 border border-input rounded-md bg-background"
                                        >
                                            <option value="a4">A4 (210×297mm)</option>
                                            <option value="a3">A3 (297×420mm)</option>
                                            <option value="a5">A5 (148×210mm)</option>
                                            <option value="100%">100% (ビューポート幅)</option>
                                        </select>
                                    </div>

                                    {/* アスペクト比 */}
                                    <div className="space-y-1">
                                        <Label htmlFor="fullpage-fit">アスペクト比</Label>
                                        <select
                                            id="fullpage-fit"
                                            value={fullpageFit}
                                            onChange={(e) => setFullpageFit(e.target.value as ImageFit)}
                                            className="w-full px-3 py-2 border border-input rounded-md bg-background"
                                        >
                                            <option value="stretch">強制引き伸ばし（A4サイズに合わせる）</option>
                                            <option value="contain">アスペクト比維持</option>
                                        </select>
                                    </div>

                                    {/* 配置位置（contain時のみ有効） */}
                                    <div className="space-y-1">
                                        <Label htmlFor="fullpage-position">配置位置</Label>
                                        <select
                                            id="fullpage-position"
                                            value={fullpagePosition}
                                            onChange={(e) => setFullpagePosition(e.target.value as ImagePosition)}
                                            className="w-full px-3 py-2 border border-input rounded-md bg-background"
                                        >
                                            <option value="center">中央</option>
                                            <option value="top">上揃え</option>
                                            <option value="bottom">下揃え</option>
                                        </select>
                                    </div>
                                </div>
                            ) : (
                                // 通常の画像オプション
                                <>
                                    <div className="space-y-1">
                                        <Label htmlFor="alt-text">Altテキスト（代替テキスト）</Label>
                                        <Input
                                            id="alt-text"
                                            value={altText}
                                            onChange={(e) => setAltText(e.target.value)}
                                            placeholder="画像の説明"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <Label htmlFor="image-width">幅</Label>
                                        <Input
                                            id="image-width"
                                            value={width}
                                            onChange={(e) => setWidth(e.target.value)}
                                            placeholder="例: 80%, 500px"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleCancel} disabled={isUploading}>
                        キャンセル
                    </Button>
                    <Button
                        onClick={handleInsert}
                        disabled={!selectedFile || isUploading || (!isFullpage && !altText)}
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                アップロード中...
                            </>
                        ) : (
                            <>
                                <ImageIcon className="w-4 h-4 mr-2" />
                                挿入
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
