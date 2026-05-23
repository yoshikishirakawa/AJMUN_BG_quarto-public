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

interface SortableImageItemProps {
    image: FullpageImageConfig;
    onRemove: () => void;
    onUpdate: (updates: Partial<FullpageImageConfig>) => void;
}

const SortableImageItem: React.FC<SortableImageItemProps> = ({ image, onRemove, onUpdate }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: image.path });

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
            <div {...attributes} {...listeners} className="cursor-grab pt-4">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>

            {/* Preview */}
            <div className="w-24 h-32 bg-background rounded overflow-hidden flex-shrink-0">
                <img
                    src={image.path.startsWith('/') ? image.path : `/${image.path}`}
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
                        onValueChange={(v) => onUpdate({ width: v })}
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
                        onValueChange={(v) => onUpdate({ fit: v as 'stretch' | 'contain' })}
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
                        onValueChange={(v) => onUpdate({ position: v as 'center' | 'top' | 'bottom' })}
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
                className="text-destructive"
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
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const sensors = [useSensor(PointerSensor)];

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over) return;
        if (active.id !== over?.id) {
            const oldIndex = images.findIndex((img) => img.path === active.id);
            const newIndex = images.findIndex((img) => img.path === over.id);
            onChange(arrayMove(images, oldIndex, newIndex));
        }
    };

    const handleAddImage = async (file: File) => {
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
        const updated = [...images];
        updated[index] = { ...updated[index], ...updates };
        onChange(updated);
    };

    const handleRemoveImage = (index: number) => {
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
                    disabled={isUploading}
                >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Image
                </Button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            handleAddImage(file);
                        }
                    }}
                />
            </div>

            {/* Image List */}
            <ScrollArea className="flex-1 p-4">
                {images.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-12">
                        <ImageIcon className="h-16 w-16 text-muted-foreground/30 mb-4" />
                        <p className="text-muted-foreground">No images yet</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Add images to create full-page pages
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
