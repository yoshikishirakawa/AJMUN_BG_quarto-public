import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Newspaper,
    Plus,
    Trash2,
    GripVertical,
    ImageIcon,
} from 'lucide-react';
import { FullpageImageConfig } from '@/types';
import { useProjectStore } from '@/store/useProjectStore';
import { useToast } from '@/hooks/use-toast';
import {
    DndContext,
    closestCenter,
    DragEndEvent,
    useSensor,
    PointerSensor,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { editorImageUrl, isPublicDemoMode } from '@/lib/public-demo';
import { cn } from '@/lib/utils';

interface SortableImageItemProps {
    image: FullpageImageConfig;
    readOnly?: boolean;
    onRemove: () => void;
    onUpdate: (updates: Partial<FullpageImageConfig>) => void;
}

const SortableImageItem: React.FC<SortableImageItemProps> = ({ image, readOnly = false, onRemove, onUpdate }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: image.path, disabled: readOnly });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex gap-3 p-3 bg-muted/30 rounded-lg border"
        >
            <div {...attributes} {...listeners} className={cn("pt-4", readOnly ? "cursor-not-allowed opacity-40" : "cursor-grab")}>
                <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Preview */}
            <div className="w-24 h-32 bg-background rounded overflow-hidden flex-shrink-0">
                <img
                    src={editorImageUrl(image.path)}
                    alt="Preview"
                    className="w-full h-full object-cover"
                />
            </div>

            {/* Settings */}
            <div className="flex-1 grid grid-cols-3 gap-3">
                <div className="space-y-1">
                    <Label className="text-xs">Size</Label>
                    <Select
                        value={image.width || 'a4'}
                        disabled={readOnly}
                        onValueChange={(v) => {
                            if (!readOnly) onUpdate({ width: v });
                        }}
                    >
                        <SelectTrigger className="h-8">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="a4">A4 (210x297mm)</SelectItem>
                            <SelectItem value="a3">A3 (297x420mm)</SelectItem>
                            <SelectItem value="a5">A5 (148x210mm)</SelectItem>
                            <SelectItem value="100%">Full Width</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1">
                    <Label className="text-xs">Fit</Label>
                    <Select
                        value={image.fit || 'stretch'}
                        disabled={readOnly}
                        onValueChange={(v) => {
                            if (!readOnly) onUpdate({ fit: v as 'stretch' | 'contain' });
                        }}
                    >
                        <SelectTrigger className="h-8">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="stretch">Stretch</SelectItem>
                            <SelectItem value="contain">Contain</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1">
                    <Label className="text-xs">Position</Label>
                    <Select
                        value={image.position || 'center'}
                        disabled={readOnly}
                        onValueChange={(v) => {
                            if (!readOnly) onUpdate({ position: v as 'center' | 'top' | 'bottom' });
                        }}
                    >
                        <SelectTrigger className="h-8">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="center">Center</SelectItem>
                            <SelectItem value="top">Top</SelectItem>
                            <SelectItem value="bottom">Bottom</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <Button
                variant="ghost"
                size="icon"
                onClick={onRemove}
                disabled={readOnly}
                className="text-destructive"
                aria-label={readOnly ? '公開デモでは画像を削除できません' : undefined}
            >
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
    );
};

interface FullpageImageEditorProps {
    chapterId: string;
    images: FullpageImageConfig[];
    onChange: (images: FullpageImageConfig[]) => void;
}

export const FullpageImageEditor: React.FC<FullpageImageEditorProps> = ({
    chapterId,
    images,
    onChange,
}) => {
    const { toast } = useToast();
    const { uploadChapterImage } = useProjectStore();
    const readOnly = isPublicDemoMode();
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const sensors = [useSensor(PointerSensor)];

    const handleDragEnd = (event: DragEndEvent) => {
        if (readOnly) return;
        const { active, over } = event;
        if (!over) return;
        if (active.id !== over?.id) {
            const oldIndex = images.findIndex((img) => img.path === active.id);
            const newIndex = images.findIndex((img) => img.path === over.id);
            onChange(arrayMove(images, oldIndex, newIndex));
        }
    };

    const handleAddImage = async (file: File) => {
        if (readOnly) return;
        if (!file.type.startsWith('image/')) {
            toast({
                title: 'Error',
                description: 'Please select an image file',
                variant: 'destructive',
            });
            return;
        }

        setIsUploading(true);
        try {
            const result = await uploadChapterImage(chapterId, file, {
                width: 'a4',
                fit: 'stretch',
                position: 'center',
            });

            if (result) {
                onChange([...images, result]);
                toast({
                    title: 'Image uploaded',
                    description: 'Image has been added successfully',
                });
            }
        } catch (error) {
            toast({
                title: 'Upload Failed',
                description: error instanceof Error ? error.message : 'Unknown error',
                variant: 'destructive',
            });
        } finally {
            setIsUploading(false);
        }
    };

    const handleUpdateImage = (index: number, updates: Partial<FullpageImageConfig>) => {
        if (readOnly) return;
        const updated = [...images];
        updated[index] = { ...updated[index], ...updates };
        onChange(updated);
    };

    const handleRemoveImage = (index: number) => {
        if (readOnly) return;
        onChange(images.filter((_, i) => i !== index));
    };

    return (
        <div className="h-full flex flex-col bg-background">
            {/* Header */}
            <div className="h-14 border-b flex items-center px-4 justify-between bg-card">
                <div className="flex items-center gap-2">
                    <Newspaper className="h-5 w-5 text-purple-600" />
                    <span className="font-medium">Full-Page Images</span>
                </div>
                <Button
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={readOnly || isUploading}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Image
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={readOnly}
                    onChange={(e) => {
                        if (readOnly) return;
                        const file = e.target.files?.[0];
                        if (file) {
                            handleAddImage(file);
                        }
                    }}
                />
            </div>

            {/* Image List */}
            <ScrollArea className="flex-1 p-4">
                {readOnly && (
                    <div className="rounded-lg border bg-muted/30 p-3 mb-4 text-sm text-muted-foreground">
                        公開デモでは画像の追加、削除、並べ替え、設定変更は利用できません。
                    </div>
                )}
                {images.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-12">
                        <ImageIcon className="h-16 w-16 text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground">No images yet</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            {readOnly ? '公開デモでは画像を追加できません。' : 'Add images to create full-page pages'}
                        </p>
                    </div>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={images.map((img) => img.path)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-3">
                                {images.map((image, index) => (
                                    <SortableImageItem
                                        key={image.path}
                                        image={image}
                                        readOnly={readOnly}
                                        onRemove={() => handleRemoveImage(index)}
                                        onUpdate={(updates) =>
                                            handleUpdateImage(index, updates)
                                        }
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                )}
            </ScrollArea>
        </div>
    );
};
