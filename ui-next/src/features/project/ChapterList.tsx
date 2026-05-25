import React, { useMemo, useState } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, FileText, MoreVertical, Plus, Trash2, Edit2, ImageIcon, Newspaper, DownloadCloud, ListOrdered, BookOpen } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/useProjectStore';
import { useTranslation } from "@/lib/i18n";
import { Chapter, ChapterType } from '@/types';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DocsImportModal } from "./components/DocsImportModal";
import { isPublicDemoMode } from "@/lib/public-demo";

type ChapterListItem =
    | (Chapter & { virtualType?: 'index' })
    | { id: string; title: string; virtualType: 'toc'; type?: ChapterType };

interface SortableChapterItemProps {
    item: ChapterListItem;
    onRename: (id: string, currentTitle: string) => void;
    onDelete: (id: string) => void;
    readOnly?: boolean;
}

// Helper to get icon based on chapter type
const getChapterIcon = (type?: ChapterType, virtualType?: 'toc' | 'index') => {
    if (virtualType === 'toc') {
        return ListOrdered;
    }
    if (virtualType === 'index') {
        return BookOpen;
    }
    switch (type) {
        case 'fullpage_image':
            return Newspaper;
        case 'image_group':
            return ImageIcon;
        default:
            return FileText;
    }
};

// Helper to get color class based on chapter type
const getChapterColor = (type?: ChapterType, virtualType?: 'toc' | 'index') => {
    if (virtualType === 'toc' || virtualType === 'index') {
        return 'text-amber-600 dark:text-amber-400';
    }
    switch (type) {
        case 'fullpage_image':
            return 'text-purple-600 dark:text-purple-400';
        case 'image_group':
            return 'text-blue-600 dark:text-blue-400';
        default:
            return 'text-muted-foreground';
    }
};

const SortableChapterItem: React.FC<SortableChapterItemProps> = ({ item, onRename, onDelete, readOnly = false }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const isVirtualToc = 'virtualType' in item && item.virtualType === 'toc';
    const isVirtualIndex = 'virtualType' in item && item.virtualType === 'index';
    const isSystem = isVirtualToc || isVirtualIndex;
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id });

    const isActive = location.pathname === `/editor/${item.id}`;
    const Icon = getChapterIcon(item.type, isVirtualToc ? 'toc' : isVirtualIndex ? 'index' : undefined);
    const iconColor = getChapterColor(item.type, isVirtualToc ? 'toc' : isVirtualIndex ? 'index' : undefined);
    const displayTitle = isVirtualToc
        ? t("toc_label")
        : isVirtualIndex
            ? t("index_label")
            : item.title || item.id;

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.8 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-1.5 rounded-md p-1.5 hover:bg-muted/50 group select-none relative min-w-0",
                isDragging && "bg-muted shadow-md"
            )}
        >
            <div {...(readOnly ? {} : attributes)} {...(readOnly ? {} : listeners)} className={cn("text-muted-foreground/50 p-1 flex-shrink-0", readOnly ? "opacity-30" : "cursor-grab hover:text-foreground")}>
                <GripVertical className="h-4 w-4" />
            </div>

            <button
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isVirtualToc) {
                        return;
                    }
                    console.log('[ChapterList] Navigating from:', location.pathname, 'to chapter:', item.id);
                    navigate(`/editor/${item.id}`);
                }}
                className={cn(
                    "flex-1 flex items-center gap-1.5 overflow-hidden text-sm py-1 font-medium text-left min-w-0",
                    isActive ? "text-primary" : "text-muted-foreground"
                )}
                title={displayTitle}
            >
                <Icon className={cn("h-4 w-4 flex-shrink-0", iconColor)} />
                <span className="truncate">{displayTitle}</span>
            </button>

            {!isSystem && !readOnly && (
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Chapter options">
                                <MoreVertical className="h-3 w-3" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onRename(item.id, item.title)}>
                                <Edit2 className="mr-2 h-3 w-3" />
                                {t("rename")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDelete(item.id)} className="text-destructive focus:text-destructive">
                                <Trash2 className="mr-2 h-3 w-3" />
                                {t("delete")}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            )}
        </div>
    );
};

export const ChapterList: React.FC = () => {
    const { project, reorderChapters, addChapter, renameChapter, deleteChapter, addFullpageImageChapter, addImageGroupChapter } = useProjectStore();
    const { t } = useTranslation();
    const virtualTocId = "__toc__";
    const readOnly = isPublicDemoMode();

    const isIndexChapter = (chapter: Chapter) => {
        const path = (chapter.localPath || "").toLowerCase();
        if (!path.startsWith("content/")) return false;
        const filename = path.split("/").pop() || "";
        const stem = filename.replace(/\.[^.]+$/, "");
        return stem === "96_index" || stem.endsWith("_index") || stem === "index";
    };

    const orderedItems = useMemo<ChapterListItem[]>(() => {
        if (!project) return [];

        const chapters = project.chapters || [];
        const sorted = [...chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        if (sorted.length === 0) return [];
        const chapterMap = new Map(sorted.map(ch => [ch.id, ch]));
        const validIds = new Set(sorted.map(ch => ch.id));

        let leadingFullpageCount = 0;
        for (const ch of sorted) {
            if (ch.type === 'fullpage_image') {
                leadingFullpageCount += 1;
            } else {
                break;
            }
        }
        const defaultIds = sorted.map(ch => ch.id);
        const defaultWithToc = [
            ...defaultIds.slice(0, leadingFullpageCount),
            virtualTocId,
            ...defaultIds.slice(leadingFullpageCount),
        ];

        let orderIds: string[] = [];
        if (project.chapterOrder && project.chapterOrder.length > 0) {
            orderIds = project.chapterOrder.filter(id => id === virtualTocId || validIds.has(id));
            const seen = new Set(orderIds.filter(id => id !== virtualTocId));
            for (const ch of sorted) {
                if (!seen.has(ch.id)) {
                    orderIds.push(ch.id);
                }
            }
            if (!orderIds.includes(virtualTocId)) {
                orderIds = [
                    ...orderIds.slice(0, leadingFullpageCount),
                    virtualTocId,
                    ...orderIds.slice(leadingFullpageCount),
                ];
            }
        } else {
            orderIds = defaultWithToc;
        }

        const items: ChapterListItem[] = [];
        for (const id of orderIds) {
            if (id === virtualTocId) {
                items.push({ id: virtualTocId, title: t("toc_label"), virtualType: 'toc' });
                continue;
            }
            const chapter = chapterMap.get(id);
            if (!chapter) continue;
            if (isIndexChapter(chapter)) {
                items.push({ ...chapter, virtualType: 'index' });
            } else {
                items.push(chapter);
            }
        }

        return items;
    }, [project, t]);

    // Dialog States
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newChapterTitle, setNewChapterTitle] = useState("");
    const [newChapterType, setNewChapterType] = useState<ChapterType>('document');

    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [renameId, setRenameId] = useState<string | null>(null);
    const [renameTitle, setRenameTitle] = useState("");

    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isDocsImportOpen, setIsDocsImportOpen] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const itemIds = orderedItems.map(item => item.id);
        const oldIndex = itemIds.indexOf(active.id as string);
        const newIndex = itemIds.indexOf(over.id as string);
        if (oldIndex === -1 || newIndex === -1) return;

        const newOrdering = arrayMove(itemIds, oldIndex, newIndex);
        reorderChapters(newOrdering);
    };

    const handleCreate = async () => {
        if (!newChapterTitle.trim()) return;

        if (newChapterType === 'fullpage_image') {
            await addFullpageImageChapter(newChapterTitle);
        } else if (newChapterType === 'image_group') {
            await addImageGroupChapter(newChapterTitle);
        } else {
            await addChapter(newChapterTitle);
        }

        setNewChapterTitle("");
        setNewChapterType('document');
        setIsCreateOpen(false);
    };

    const openRename = (id: string, currentTitle: string) => {
        setRenameId(id);
        setRenameTitle(currentTitle);
        setIsRenameOpen(true);
    };

    const handleRename = () => {
        if (renameId && renameTitle.trim()) {
            renameChapter(renameId, renameTitle);
            setIsRenameOpen(false);
        }
    };

    const openDelete = (id: string) => {
        setDeleteId(id);
        setIsDeleteOpen(true);
    };

    const handleDelete = () => {
        if (deleteId) {
            deleteChapter(deleteId);
            setIsDeleteOpen(false);
        }
    };

    // Type options for create dialog
    const typeOptions = [
        { type: 'document' as ChapterType, label: 'Document', icon: FileText, description: 'Regular markdown chapter' },
        { type: 'image_group' as ChapterType, label: 'Image Group', icon: ImageIcon, description: 'Image gallery' },
        { type: 'fullpage_image' as ChapterType, label: 'Full-Page', icon: Newspaper, description: 'Full-page image(s)' },
    ];

    return (
        <>
            <div className="flex flex-col gap-1">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={readOnly ? undefined : handleDragEnd}
                >
                    <SortableContext
                        items={orderedItems.map(item => item.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="flex flex-col gap-1">
                            {orderedItems.length === 0 && (
                                <div className="p-4 text-xs text-muted-foreground text-center">{t("no_chapters")}</div>
                            )}
                            {orderedItems.map((item) => (
                                <SortableChapterItem
                                    key={item.id}
                                    item={item}
                                    onRename={openRename}
                                    onDelete={openDelete}
                                    readOnly={readOnly}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>

                {!readOnly ? <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full border-dashed"
                    onClick={() => setIsCreateOpen(true)}
                >
                    <Plus className="mr-2 h-3 w-3" />
                    {t("new_chapter")}
                </Button> : null}
                {!readOnly ? <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => setIsDocsImportOpen(true)}
                >
                    <DownloadCloud className="mr-2 h-3 w-3" />
                    {t("import_docs")}
                </Button> : (
                    <div className="mt-2 px-2 text-[11px] text-muted-foreground">章の追加、並び替え、取り込みは公開デモでは無効です。</div>
                )}
            </div>

            {/* Create Dialog with Type Selection */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("create_chapter_title")}</DialogTitle>
                        <DialogDescription>{t("create_chapter_desc")}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto">
                        {/* Chapter Type Selection */}
                        <div className="grid gap-2">
                            <Label>Chapter Type</Label>
                            <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
                                {typeOptions.map(({ type, label, icon: Icon, description }) => (
                                    <button
                                        key={type}
                                        type="button"
                                        onClick={() => setNewChapterType(type)}
                                        className={cn(
                                            "flex flex-col items-center gap-1.5 p-2 rounded-lg border-2 transition-colors min-w-0",
                                            newChapterType === type
                                                ? "border-primary bg-primary/5"
                                                : "border-muted hover:border-muted-foreground/50"
                                        )}
                                        title={description}
                                    >
                                        <Icon className={cn(
                                            "h-5 w-4 flex-shrink-0",
                                            newChapterType === type ? "text-primary" : "text-muted-foreground"
                                        )} />
                                        <span className="text-xs font-medium truncate w-full text-center">{label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="new-title">{t("chapter_title_label")}</Label>
                            <Input
                                id="new-title"
                                value={newChapterTitle}
                                onChange={(e) => setNewChapterTitle(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                placeholder={
                                    newChapterType === 'fullpage_image'
                                        ? "e.g., Front Cover"
                                        : newChapterType === 'image_group'
                                            ? "e.g., Photo Gallery"
                                            : "Chapter 1"
                                }
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setIsCreateOpen(false);
                            setNewChapterType('document');
                        }}>{t("cancel")}</Button>
                        <Button onClick={handleCreate}>{t("create")}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Rename Dialog */}
            <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("rename_chapter")}</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="rename-title">{t("chapter_title_label")}</Label>
                            <Input
                                id="rename-title"
                                value={renameTitle}
                                onChange={(e) => setRenameTitle(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsRenameOpen(false)}>{t("cancel")}</Button>
                        <Button onClick={handleRename}>{t("save")}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Alert - using standard Dialog for simplicity, ideally AlertDialog */}
            <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("delete_chapter_title")}</DialogTitle>
                        <DialogDescription>
                            {t("delete_chapter_confirm")}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>{t("cancel")}</Button>
                        <Button variant="destructive" onClick={handleDelete}>{t("delete")}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {!readOnly ? <DocsImportModal
                open={isDocsImportOpen}
                onOpenChange={setIsDocsImportOpen}
            /> : null}
        </>
    );
};
