import React, { useMemo, useState } from "react";
import {
    DndContext,
    DragEndEvent,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    closestCenter,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    rectSortingStrategy,
    useSortable,
    sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Trash2, GripVertical, ImageIcon, Plus } from "lucide-react";
import { FullpageImageConfig } from "@/types";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";

interface ImageGroupPanelProps {
    chapterId: string;
    images: FullpageImageConfig[];
    onChange: (images: FullpageImageConfig[]) => void;
    onUpload: (file: File) => Promise<void>;
}

interface SortableImageItemProps {
    item: FullpageImageConfig;
    id: string;
    onDelete: () => void;
}

const SortableImageItem: React.FC<SortableImageItemProps> = ({ item, id, onDelete }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
    };

    const imageUrl = item.path?.startsWith("/") ? item.path : `/${item.path}`;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-3 rounded-md border bg-card p-2",
                isDragging && "shadow-md"
            )}
        >
            <div className="cursor-grab text-muted-foreground/60 hover:text-foreground" {...attributes} {...listeners}>
                <GripVertical className="h-4 w-4" />
            </div>
            <div className="h-12 w-12 rounded bg-muted overflow-hidden flex items-center justify-center">
                {item.path ? (
                    <img src={imageUrl} alt="preview" className="h-full w-full object-cover" />
                ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{item.path?.split("/").pop()}</div>
                {item.caption && (
                    <div className="text-xs text-muted-foreground truncate">{item.caption}</div>
                )}
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
                <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
        </div>
    );
};

export const ImageGroupPanel: React.FC<ImageGroupPanelProps> = ({
    chapterId,
    images,
    onChange,
    onUpload,
}) => {
    const { t } = useTranslation();
    void chapterId;
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = images.findIndex((img) => img.path === active.id);
        const newIndex = images.findIndex((img) => img.path === over.id);
        if (oldIndex === -1 || newIndex === -1) return;
        const reordered = arrayMove(images, oldIndex, newIndex);
        onChange(reordered);
    };

    const sortedIds = useMemo(() => images.map((img) => img.path || ""), [images]);

    return (
        <div className="h-full flex flex-col bg-background">
            <div className="h-14 border-b flex items-center px-4 justify-between bg-card">
                <div className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-blue-600" />
                    <span className="font-medium">{t("image_group")}</span>
                </div>
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={async (e) => {
                            const files = e.target.files;
                            if (!files || files.length === 0) return;
                            setIsUploading(true);
                            try {
                                for (const file of Array.from(files)) {
                                    if (!file.type.startsWith("image/")) continue;
                                    await onUpload(file);
                                }
                            } finally {
                                setIsUploading(false);
                                e.target.value = "";
                            }
                        }}
                    />
                    <Button size="sm" variant="outline" disabled={isUploading}>
                        <Plus className="h-4 w-4 mr-1" />
                        {t("add_image")}
                    </Button>
                </label>
            </div>

            <ScrollArea className="flex-1 p-4">
                <div
                    className={cn(
                        "rounded-lg border border-dashed p-4 mb-4 text-sm text-muted-foreground flex items-center justify-between",
                        isDragging && "bg-muted/40 border-primary/60"
                    )}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                    }}
                    onDragLeave={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                    }}
                    onDrop={async (e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        const files = e.dataTransfer?.files;
                        if (!files || files.length === 0) return;
                        setIsUploading(true);
                        try {
                            for (const file of Array.from(files)) {
                                if (!file.type.startsWith("image/")) continue;
                                await onUpload(file);
                            }
                        } finally {
                            setIsUploading(false);
                        }
                    }}
                >
                    <div className="flex items-center gap-2">
                        <Upload className="h-4 w-4" />
                        <span>{t("drop_images_hint")}</span>
                    </div>
                    <span className="text-xs">{t("drag_to_reorder")}</span>
                </div>

                {images.length === 0 ? (
                    <div className="h-[50vh] flex flex-col items-center justify-center text-center">
                        <ImageIcon className="h-14 w-14 text-muted-foreground/30 mb-3" />
                        <p className="text-muted-foreground">{t("no_images")}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t("add_image_hint")}</p>
                    </div>
                ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={sortedIds} strategy={rectSortingStrategy}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {images.map((item) => (
                                    <SortableImageItem
                                        key={item.path}
                                        id={item.path}
                                        item={item}
                                        onDelete={() => {
                                            const next = images.filter((img) => img.path !== item.path);
                                            onChange(next);
                                        }}
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
