import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    ImageIcon,
    Upload,
    Trash2,
    Search,
    Grid,
    List,
    Check,
    FileImage
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ImageFile {
    filename: string;
    url: string;
    path: string;
    size: number;
    createdAt: string;
    usedInChapters: string[];
}

interface ImageManagementPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onInsert: (markdown: string) => void;
    chapterId?: string;
}

export const ImageManagementPanel: React.FC<ImageManagementPanelProps> = ({
    isOpen,
    onClose,
    onInsert,
    chapterId
}) => {
    const { toast } = useToast();
    const [images, setImages] = useState<ImageFile[]>([]);
    const [filteredImages, setFilteredImages] = useState<ImageFile[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedImage, setSelectedImage] = useState<ImageFile | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [isLoading, setIsLoading] = useState(false);

    // Image settings
    const [imageWidth, setImageWidth] = useState<'auto' | 'full' | number>('auto');
    const [alignment, setAlignment] = useState<'left' | 'center' | 'right'>('center');
    const [caption, setCaption] = useState('');

    // Load images from assets directory
    useEffect(() => {
        if (isOpen) {
            loadImages();
        }
    }, [isOpen]);

    const loadImages = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/v1/project/images', { credentials: 'include' });
            if (!response.ok) {
                throw new Error('Failed to load images');
            }
            const data = await response.json();
            setImages(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('Failed to load images:', e);
            setImages([]);
        } finally {
            setIsLoading(false);
        }
    };

    // Filter images based on search
    useEffect(() => {
        if (searchQuery.trim() === '') {
            setFilteredImages(images);
        } else {
            const query = searchQuery.toLowerCase();
            setFilteredImages(
                images.filter(img =>
                    img.filename.toLowerCase().includes(query) ||
                    img.path.toLowerCase().includes(query)
                )
            );
        }
    }, [images, searchQuery]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        if (!chapterId) {
            toast({
                title: 'エラー',
                description: '章を選択してから画像をアップロードしてください',
                variant: 'destructive',
            });
            return;
        }

        const file = files[0];
        if (!file.type.startsWith('image/')) {
            toast({
                title: 'エラー',
                description: '画像ファイルのみアップロードできます',
                variant: 'destructive',
            });
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        setIsLoading(true);
        try {
            const response = await fetch(`/api/v1/project/chapters/${chapterId}/images`, {
                method: 'POST',
                body: formData,
                credentials: 'include',
            });

            if (response.ok) {
                await response.json(); // Consume the response
                toast({
                    title: 'アップロード完了',
                    description: `${file.name}をアップロードしました`,
                });
                loadImages();
            } else {
                throw new Error('Upload failed');
            }
        } catch (e) {
            console.error('Upload error:', e);
            toast({
                title: 'エラー',
                description: '画像のアップロードに失敗しました',
                variant: 'destructive',
            });
        } finally {
            setIsLoading(false);
            e.target.value = '';
        }
    };

    const handleDeleteImage = async (image: ImageFile) => {
        if (!confirm(`本当に ${image.filename} を削除しますか？`)) return;

        try {
            const response = await fetch(`/api/v1/project/images/${encodeURIComponent(image.filename)}`, {
                method: 'DELETE',
                credentials: 'include',
            });

            if (response.ok) {
                toast({
                    title: '削除完了',
                    description: `${image.filename}を削除しました`,
                });
                loadImages();
                if (selectedImage?.path === image.path) {
                    setSelectedImage(null);
                }
            } else {
                throw new Error('Delete failed');
            }
        } catch (e) {
            console.error('Delete error:', e);
            toast({
                title: 'エラー',
                description: '画像の削除に失敗しました',
                variant: 'destructive',
            });
        }
    };

    const handleInsert = () => {
        if (!selectedImage) return;

        let markdown = '';
        const widthParam = imageWidth === 'full'
            ? '100%'
            : imageWidth === 'auto'
                ? ''
            : `${imageWidth}%`;

        const altText = caption || selectedImage.filename;
        if (widthParam) {
            markdown = `![${altText}](${selectedImage.path}){width=${widthParam}}`;
        } else {
            markdown = `![${altText}](${selectedImage.path})`;
        }
        if (caption) {
            markdown += `\n\nFig: ${caption}`;
        }

        // Add alignment if not center
        if (alignment !== 'center' && imageWidth !== 'full') {
            markdown = `{.${alignment}}\n${markdown}`;
        }

        onInsert(markdown);
        handleClose();
    };

    const handleClose = () => {
        setSearchQuery('');
        setSelectedImage(null);
        setImageWidth('auto');
        setAlignment('center');
        setCaption('');
        onClose();
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>画像管理</DialogTitle>
                    <DialogDescription>
                        プロジェクトの画像を管理・挿入できます
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 flex gap-4 min-h-0">
                    {/* Image List Panel */}
                    <div className="w-2/3 flex flex-col border rounded-lg">
                        {/* Search and Upload Bar */}
                        <div className="p-3 border-b flex items-center gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="画像を検索..."
                                    className="pl-8 h-9"
                                />
                            </div>
                            <Label
                                htmlFor="image-upload"
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md cursor-pointer hover:bg-primary/90 transition-colors",
                                    "h-9 text-sm font-medium",
                                    !chapterId && "pointer-events-none opacity-50"
                                )}
                            >
                                <Upload className="h-4 w-4" />
                                アップロード
                            </Label>
                            <input
                                id="image-upload"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileUpload}
                            />
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9"
                                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                            >
                                {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
                            </Button>
                        </div>

                        {/* Image Grid/List */}
                        <ScrollArea className="flex-1">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-40">
                                    <div className="text-sm text-muted-foreground">読み込み中...</div>
                                </div>
                            ) : filteredImages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-40 text-center">
                                    <ImageIcon className="h-12 w-12 text-muted-foreground/50 mb-2" />
                                    <p className="text-sm text-muted-foreground">
                                        {searchQuery ? '一致する画像がありません' : '画像がありません'}
                                    </p>
                                </div>
                            ) : viewMode === 'grid' ? (
                                <div className="grid grid-cols-3 gap-2 p-2">
                                    {filteredImages.map((image) => (
                                        <div
                                            key={image.path}
                                            onClick={() => setSelectedImage(image)}
                                            className={cn(
                                                "relative aspect-square rounded-md overflow-hidden cursor-pointer border-2 transition-colors group",
                                                selectedImage?.path === image.path
                                                    ? "border-primary"
                                                    : "border-transparent hover:border-muted-foreground"
                                            )}
                                        >
                                            <img
                                                src={image.url}
                                                alt={image.filename}
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div className="absolute bottom-0 left-0 right-0 p-2">
                                                    <p className="text-white text-xs truncate">{image.filename}</p>
                                                </div>
                                            </div>
                                            {selectedImage?.path === image.path && (
                                                <div className="absolute top-1 right-1 bg-primary rounded-full p-1">
                                                    <Check className="h-3 w-3 text-primary-foreground" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="divide-y">
                                    {filteredImages.map((image) => (
                                        <div
                                            key={image.path}
                                            onClick={() => setSelectedImage(image)}
                                            className={cn(
                                                "flex items-center gap-3 p-2 cursor-pointer hover:bg-muted transition-colors",
                                                selectedImage?.path === image.path && "bg-secondary"
                                            )}
                                        >
                                            <img
                                                src={image.url}
                                                alt={image.filename}
                                                className="w-12 h-12 object-cover rounded border"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{image.filename}</p>
                                                <p className="text-xs text-muted-foreground truncate">{image.path}</p>
                                            </div>
                                            <span className="text-xs text-muted-foreground">{formatFileSize(image.size)}</span>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteImage(image);
                                                }}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>

                    {/* Image Settings Panel */}
                    <div className="w-1/3 flex flex-col gap-4">
                        {/* Selected Image Preview */}
                        <div className="border rounded-lg p-3">
                            <Label className="text-sm text-muted-foreground">選択中の画像</Label>
                            {selectedImage ? (
                                <div className="mt-2 space-y-2">
                                    <div className="aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center">
                                        <img
                                            src={selectedImage.url}
                                            alt={selectedImage.filename}
                                            className="max-w-full max-h-full object-contain"
                                        />
                                    </div>
                                    <p className="text-sm font-medium truncate">{selectedImage.filename}</p>
                                    <p className="text-xs text-muted-foreground truncate">{selectedImage.path}</p>
                                </div>
                            ) : (
                                <div className="mt-2 aspect-video bg-muted rounded-lg flex items-center justify-center">
                                    <FileImage className="h-12 w-12 text-muted-foreground/50" />
                                </div>
                            )}
                        </div>

                        {/* Image Settings */}
                        <div className="flex-1 space-y-4">
                            <div className="space-y-2">
                                <Label>幅</Label>
                                <Select
                                    value={String(imageWidth)}
                                    onValueChange={(v) => setImageWidth(v === 'auto' || v === 'full' ? v : parseInt(v))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="auto">自動</SelectItem>
                                        <SelectItem value="full"> fullWidth</SelectItem>
                                        <SelectItem value="50">50%</SelectItem>
                                        <SelectItem value="75">75%</SelectItem>
                                        <SelectItem value="100">100%</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>配置</Label>
                                <div className="grid grid-cols-3 gap-1">
                                    {(['left', 'center', 'right'] as const).map((align) => (
                                        <Button
                                            key={align}
                                            variant={alignment === align ? 'default' : 'outline'}
                                            size="sm"
                                            onClick={() => setAlignment(align)}
                                            className="text-xs"
                                        >
                                            {align === 'left' ? '左' : align === 'center' ? '中央' : '右'}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="caption">キャプション</Label>
                                <Input
                                    id="caption"
                                    value={caption}
                                    onChange={(e) => setCaption(e.target.value)}
                                    placeholder="図の説明..."
                                    className="text-sm"
                                />
                            </div>

                            {/* Markdown Preview */}
                            <div className="space-y-2">
                                <Label>Markdown プレビュー</Label>
                                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                    {(() => {
                                        if (!selectedImage) {
                                            return <code className="text-muted-foreground">画像を選択してください</code>;
                                        }
                                        if (imageWidth === 'auto') {
                                            return <code>![{caption || selectedImage.filename}]({selectedImage.path})</code>;
                                        }
                                        const widthStr = imageWidth === 'full' ? '100%' : `${imageWidth}%`;
                                        return <code>{`![${caption || selectedImage.filename}](${selectedImage.path}){width=${widthStr}}`}</code>;
                                    })()}
                                </pre>
                            </div>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        キャンセル
                    </Button>
                    <Button
                        onClick={handleInsert}
                        disabled={!selectedImage}
                    >
                        <Check className="h-4 w-4 mr-2" />
                        挿入
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
