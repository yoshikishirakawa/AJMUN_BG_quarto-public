import React, { useState, useEffect } from 'react';
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
import { GripVertical, FileText, Plus, Trash2, Edit2, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { settingsApi } from '@/lib/api';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useProjectStore } from "@/store/useProjectStore";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, RefreshCw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Chapter {
    file: string;
    title?: string;
    part?: string;
}

interface SortableChapterItemProps {
    chapter: Chapter;
    index: number;
    onRename: (index: number, currentTitle: string) => void;
    onDelete: (index: number) => void;
}

const SortableChapterItem: React.FC<SortableChapterItemProps> = ({ chapter, index, onRename, onDelete }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: chapter.file });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.8 : 1,
    };

    const isAppendix = chapter.file.startsWith("content/9") || chapter.part === "appendices";

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-2 rounded-md p-2 hover:bg-muted/50 group select-none",
                isDragging && "bg-muted shadow-md"
            )}
        >
            <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground/50 hover:text-foreground p-1">
                <GripVertical className="h-4 w-4" />
            </div>

            {isAppendix ? (
                <BookOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}

            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{chapter.title || chapter.file}</div>
                <div className="text-xs text-muted-foreground truncate">{chapter.file}</div>
            </div>

            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onRename(index, chapter.title || "")}
                >
                    <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => onDelete(index)}
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
        </div>
    );
};

export const ChapterSettings: React.FC = () => {
    const { project, fetchProject } = useProjectStore();
    const { toast } = useToast();
    const [chapters, setChapters] = useState<Chapter[]>([]);
    const [appendices, setAppendices] = useState<Chapter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);

    // Dialog states
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isAppendiceOpen, setIsAppendiceOpen] = useState(false);
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const [newChapterFile, setNewChapterFile] = useState("");
    const [newChapterTitle, setNewChapterTitle] = useState("");
    const [renameIndex, setRenameIndex] = useState<number | null>(null);
    const [renameTitle, setRenameTitle] = useState("");
    const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<'chapters' | 'appendices'>('chapters');

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    useEffect(() => {
        if (!project) {
            fetchProject();
        }
    }, [project, fetchProject]);

    useEffect(() => {
        if (project?.chapters) {
            // Separate chapters and appendices based on _quarto.yml structure
            const mainChapters: Chapter[] = [];
            const appx: Chapter[] = [];

            project.chapters.forEach((ch: any) => {
                const file = ch.file || ch.localPath || (typeof ch === 'string' ? ch : ch.id || '');
                const chapter: Chapter = {
                    file: file,
                    title: ch.title || (typeof ch === 'string' ? ch : ch.id || ''),
                    part: ch.part
                };

                // Check appendix flag or explicit part
                if (ch.part === "appendices" || ch.isAppendix === true) {
                    appx.push(chapter);
                } else {
                    mainChapters.push(chapter);
                }
            });

            setChapters(mainChapters);
            setAppendices(appx);
            setIsLoading(false);
        }
    }, [project]);

    const handleDragEnd = (event: DragEndEvent, target: 'chapters' | 'appendices') => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            const items = target === 'chapters' ? [...chapters] : [...appendices];
            const oldIndex = items.findIndex((c) => c.file === active.id);
            const newIndex = items.findIndex((c) => c.file === over?.id);
            if (oldIndex !== -1 && newIndex !== -1) {
                const newOrdering = arrayMove(items, oldIndex, newIndex);
                if (target === 'chapters') {
                    setChapters(newOrdering);
                } else {
                    setAppendices(newOrdering);
                }
                setHasChanges(true);
            }
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Combine chapters and appendices
            const allChapters = [
                ...chapters.map(c => ({ file: c.file, title: c.title, part: undefined })),
                ...appendices.map(c => ({ file: c.file, title: c.title, part: "appendices" }))
            ];

            await settingsApi.updateChapters(allChapters);
            await settingsApi.syncToYml();

            // Refresh project data
            await fetchProject();
            setHasChanges(false);

            toast({
                title: "保存完了",
                description: "章構成を保存し、_quarto.ymlを更新しました",
            });
        } catch (error) {
            console.error("Failed to save chapters:", error);
            toast({
                title: "エラー",
                description: "章構成の保存に失敗しました",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        await fetchProject();
        setHasChanges(false);
        toast({
            title: "リセット完了",
            description: "変更を破棄しました",
        });
    };

    const handleCreateChapter = async () => {
        const filename = newChapterFile.trim() || `content/ch_${Date.now()}.md`;
        const title = newChapterTitle.trim() || "新規チャプター";

        const newChapter: Chapter = {
            file: filename.startsWith("content/") ? filename : `content/${filename}`,
            title
        };

        setChapters([...chapters, newChapter]);
        setNewChapterFile("");
        setNewChapterTitle("");
        setIsCreateOpen(false);
        setHasChanges(true);
    };

    const handleCreateAppendix = async () => {
        const filename = newChapterFile.trim() || `content/app_${Date.now()}.md`;
        const title = newChapterTitle.trim() || "新規付録";

        const newChapter: Chapter = {
            file: filename.startsWith("content/") ? filename : `content/${filename}`,
            title,
            part: "appendices"
        };

        setAppendices([...appendices, newChapter]);
        setNewChapterFile("");
        setNewChapterTitle("");
        setIsAppendiceOpen(false);
        setHasChanges(true);
    };

    const openRename = (index: number, target: 'chapters' | 'appendices') => {
        const items = target === 'chapters' ? chapters : appendices;
        setRenameIndex(index);
        setRenameTitle(items[index]?.title || "");
        setDeleteTarget(target);
        setIsRenameOpen(true);
    };

    const handleRename = () => {
        if (renameIndex === null) return;

        if (deleteTarget === 'chapters') {
            const newChapters = [...chapters];
            newChapters[renameIndex] = { ...newChapters[renameIndex], title: renameTitle };
            setChapters(newChapters);
        } else {
            const newAppendices = [...appendices];
            newAppendices[renameIndex] = { ...newAppendices[renameIndex], title: renameTitle };
            setAppendices(newAppendices);
        }

        setIsRenameOpen(false);
        setHasChanges(true);
    };

    const openDelete = (index: number, target: 'chapters' | 'appendices') => {
        setDeleteIndex(index);
        setDeleteTarget(target);
        setIsDeleteOpen(true);
    };

    const handleDelete = () => {
        if (deleteIndex === null) return;

        if (deleteTarget === 'chapters') {
            setChapters(chapters.filter((_, i) => i !== deleteIndex));
        } else {
            setAppendices(appendices.filter((_, i) => i !== deleteIndex));
        }

        setIsDeleteOpen(false);
        setHasChanges(true);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">読み込み中...</span>
            </div>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>章構成設定</CardTitle>
                        <CardDescription>
                            ドラッグ&ドロップで順序を変更、追加・削除・リネームができます
                        </CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleReset}
                            disabled={!hasChanges}
                        >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            リセット
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSave}
                            disabled={!hasChanges || isSaving}
                        >
                            {isSaving ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4 mr-1" />
                            )}
                            保存
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Main Chapters */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-base font-medium">メインチャプター</Label>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsCreateOpen(true)}
                        >
                            <Plus className="h-3 w-3 mr-1" />
                            追加
                        </Button>
                    </div>

                    <ScrollArea className="h-[300px] pr-4">
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(e) => handleDragEnd(e, 'chapters')}
                        >
                            <SortableContext
                                items={chapters.map(c => c.file)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="flex flex-col gap-1 pr-2">
                                    {chapters.length === 0 && (
                                        <div className="p-4 text-sm text-muted-foreground text-center border border-dashed rounded-md">
                                            チャプターがありません
                                        </div>
                                    )}
                                    {chapters.map((chapter, index) => (
                                        <SortableChapterItem
                                            key={chapter.file}
                                            chapter={chapter}
                                            index={index}
                                            onRename={(i) => openRename(i, 'chapters')}
                                            onDelete={(i) => openDelete(i, 'chapters')}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </ScrollArea>
                </div>

                <Separator />

                {/* Appendices */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label className="text-base font-medium">付録</Label>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsAppendiceOpen(true)}
                        >
                            <Plus className="h-3 w-3 mr-1" />
                            追加
                        </Button>
                    </div>

                    <ScrollArea className="h-[200px] pr-4">
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={(e) => handleDragEnd(e, 'appendices')}
                        >
                            <SortableContext
                                items={appendices.map(c => c.file)}
                                strategy={verticalListSortingStrategy}
                            >
                                <div className="flex flex-col gap-1 pr-2">
                                    {appendices.length === 0 && (
                                        <div className="p-4 text-sm text-muted-foreground text-center border border-dashed rounded-md">
                                            付録がありません
                                        </div>
                                    )}
                                    {appendices.map((chapter, index) => (
                                        <SortableChapterItem
                                            key={chapter.file}
                                            chapter={chapter}
                                            index={index}
                                            onRename={(i) => openRename(i, 'appendices')}
                                            onDelete={(i) => openDelete(i, 'appendices')}
                                        />
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </ScrollArea>
                </div>

                {/* Create Chapter Dialog */}
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>チャプターを追加</DialogTitle>
                            <DialogDescription>新しいチャプターのファイル名とタイトルを入力してください</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid items-center gap-2">
                                <Label htmlFor="chapter-file">ファイル名 (content/)</Label>
                                <Input
                                    id="chapter-file"
                                    value={newChapterFile}
                                    onChange={(e) => setNewChapterFile(e.target.value)}
                                    placeholder="07_ch07.md"
                                />
                            </div>
                            <div className="grid items-center gap-2">
                                <Label htmlFor="chapter-title">タイトル</Label>
                                <Input
                                    id="chapter-title"
                                    value={newChapterTitle}
                                    onChange={(e) => setNewChapterTitle(e.target.value)}
                                    placeholder="第7章"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>キャンセル</Button>
                            <Button onClick={handleCreateChapter}>追加</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Create Appendix Dialog */}
                <Dialog open={isAppendiceOpen} onOpenChange={setIsAppendiceOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>付録を追加</DialogTitle>
                            <DialogDescription>新しい付録のファイル名とタイトルを入力してください</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid items-center gap-2">
                                <Label htmlFor="appendix-file">ファイル名 (content/)</Label>
                                <Input
                                    id="appendix-file"
                                    value={newChapterFile}
                                    onChange={(e) => setNewChapterFile(e.target.value)}
                                    placeholder="91_appendix.md"
                                />
                            </div>
                            <div className="grid items-center gap-2">
                                <Label htmlFor="appendix-title">タイトル</Label>
                                <Input
                                    id="appendix-title"
                                    value={newChapterTitle}
                                    onChange={(e) => setNewChapterTitle(e.target.value)}
                                    placeholder="付録"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsAppendiceOpen(false)}>キャンセル</Button>
                            <Button onClick={handleCreateAppendix}>追加</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Rename Dialog */}
                <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>タイトルを変更</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid items-center gap-2">
                                <Label htmlFor="rename-title">新しいタイトル</Label>
                                <Input
                                    id="rename-title"
                                    value={renameTitle}
                                    onChange={(e) => setRenameTitle(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsRenameOpen(false)}>キャンセル</Button>
                            <Button onClick={handleRename}>変更</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Delete Dialog */}
                <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>削除の確認</DialogTitle>
                            <DialogDescription>
                                この項目を削除しますか？この操作は取り消せません。
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>キャンセル</Button>
                            <Button variant="destructive" onClick={handleDelete}>削除</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </CardContent>
        </Card>
    );
};
