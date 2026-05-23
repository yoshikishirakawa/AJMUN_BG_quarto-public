import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Replace, Loader2, Search, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ImageInfo {
    filename: string;
    path: string;
    size: number;
    createdAt: string;
    url: string;
    usedInChapters: string[];
}

interface ImageGalleryModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectChapters: Array<{ id: string; title: string }>;
}

export const ImageGalleryModal: React.FC<ImageGalleryModalProps> = ({
    isOpen,
    onClose,
    projectChapters,
}) => {
    const { toast } = useToast();
    const [images, setImages] = useState<ImageInfo[]>([]);
    const [filteredImages, setFilteredImages] = useState<ImageInfo[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [deletingImages, setDeletingImages] = useState<Set<string>>(new Set());
    const [replacingImages, setReplacingImages] = useState<Set<string>>(new Set());
    const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const fetchImages = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/v1/project/images');
            if (!response.ok) throw new Error('Failed to fetch images');
            const data = await response.json();
            setImages(data);
            setFilteredImages(data);
        } catch {
            toast({
                title: "エラー",
                description: "画像の一覧を取得できませんでした",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (isOpen) {
            fetchImages();
        }
    }, [isOpen, fetchImages]);

    useEffect(() => {
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            setFilteredImages(images.filter(img =>
                img.filename.toLowerCase().includes(query) ||
                img.usedInChapters.some(id => {
                    const ch = projectChapters.find(c => c.id === id);
                    return ch?.title.toLowerCase().includes(query);
                })
            ));
        } else {
            setFilteredImages(images);
        }
    }, [searchQuery, images, projectChapters]);

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const getChapterTitles = (chapterIds: string[]): string => {
        return chapterIds.map(id => {
            const ch = projectChapters.find(c => c.id === id);
            return ch?.title || id;
        }).join(', ');
    };

    const handleDelete = async (filename: string) => {
        if (confirmDelete !== filename) {
            setConfirmDelete(filename);
            return;
        }

        setDeletingImages(prev => new Set(prev).add(filename));
        try {
            const response = await fetch(`/api/v1/project/images/${filename}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Failed to delete image');

            setImages(prev => prev.filter(img => img.filename !== filename));
            setFilteredImages(prev => prev.filter(img => img.filename !== filename));
            toast({
                title: "削除完了",
                description: `${filename}を削除しました`,
            });
        } catch {
            toast({
                title: "エラー",
                description: "画像の削除に失敗しました",
                variant: "destructive",
            });
        } finally {
            setDeletingImages(prev => {
                const next = new Set(prev);
                next.delete(filename);
                return next;
            });
            setConfirmDelete(null);
        }
    };

    const handleReplaceClick = (image: ImageInfo) => {
        setSelectedImage(image);
        fileInputRef.current?.click();
    };

    const handleReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedImage) return;

        if (!file.type.startsWith('image/')) {
            toast({
                title: "エラー",
                description: "画像ファイルを選択してください",
                variant: "destructive",
            });
            return;
        }

        setReplacingImages(prev => new Set(prev).add(selectedImage.filename));

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`/api/v1/project/images/${selectedImage.filename}`, {
                method: 'PUT',
                body: formData,
            });

            if (!response.ok) throw new Error('Failed to replace image');

            // Refresh the image list
            await fetchImages();

            toast({
                title: "置換完了",
                description: `${selectedImage.filename}を置換しました`,
            });
        } catch {
            toast({
                title: "エラー",
                description: "画像の置換に失敗しました",
                variant: "destructive",
            });
        } finally {
            setReplacingImages(prev => {
                const next = new Set(prev);
                next.delete(selectedImage.filename);
                return next;
            });
            setSelectedImage(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleCopyPath = (path: string) => {
        navigator.clipboard.writeText(`![alt](${path})`);
        toast({
            title: "コピー完了",
            description: "Markdownパスをコピーしました",
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>画像ギャラリー</DialogTitle>
                    <DialogDescription>
                        アップロード済みの画像を管理できます
                    </DialogDescription>
                </DialogHeader>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleReplace}
                />

                {/* Search bar */}
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="画像名や使用中の章を検索..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>
                    <Button variant="outline" onClick={fetchImages} disabled={isLoading}>
                        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                </div>

                {/* Image count */}
                <div className="text-sm text-muted-foreground">
                    {filteredImages.length} 枚の画像
                </div>

                {/* Image grid */}
                <div className="flex-1 overflow-y-auto">
                    {isLoading && images.length === 0 ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="text-center">
                                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">読み込み中...</p>
                            </div>
                        </div>
                    ) : filteredImages.length === 0 ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="text-center text-muted-foreground">
                                <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                <p>{searchQuery ? '一致する画像がありません' : 'アップロードされた画像はありません'}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {filteredImages.map((image) => (
                                <div
                                    key={image.filename}
                                    className="group relative border rounded-lg overflow-hidden bg-card"
                                >
                                    {/* Thumbnail */}
                                    <div className="aspect-square relative bg-muted">
                                        <img
                                            src={image.url}
                                            alt={image.filename}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                        {/* Overlay with actions */}
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                            <Button
                                                size="icon"
                                                variant="destructive"
                                                onClick={() => handleDelete(image.filename)}
                                                disabled={deletingImages.has(image.filename)}
                                                title={confirmDelete === image.filename ? "本当に削除？" : "削除"}
                                            >
                                                {deletingImages.has(image.filename) ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : confirmDelete === image.filename ? (
                                                    <AlertCircle className="h-4 w-4" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="secondary"
                                                onClick={() => handleReplaceClick(image)}
                                                disabled={replacingImages.has(image.filename)}
                                                title="置換"
                                            >
                                                {replacingImages.has(image.filename) ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Replace className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Info */}
                                    <div className="p-2 text-xs">
                                        <p className="font-medium truncate" title={image.filename}>
                                            {image.filename}
                                        </p>
                                        <div className="flex items-center justify-between text-muted-foreground mt-1">
                                            <span>{formatFileSize(image.size)}</span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-5 px-1"
                                                onClick={() => handleCopyPath(image.path)}
                                            >
                                                パスをコピー
                                            </Button>
                                        </div>

                                        {/* Usage */}
                                        {image.usedInChapters.length > 0 && (
                                            <div className="mt-1 text-xs text-muted-foreground">
                                                <span className="font-medium">使用中:</span>
                                                <span className="ml-1 truncate block" title={getChapterTitles(image.usedInChapters)}>
                                                    {getChapterTitles(image.usedInChapters)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        閉じる
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
