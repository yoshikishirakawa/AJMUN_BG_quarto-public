import React, { Suspense, useEffect, useState, useMemo, useRef } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useProjectStore } from '@/store/useProjectStore';
import { Button } from "@/components/ui/button";
import { FileText, Save, RefreshCw, Newspaper, ImageIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { FullpageImageConfig } from '@/types';
import { isPublicDemoMode } from '@/lib/public-demo';

const SplitPane = React.lazy(() => import("@/features/editor/SplitPane").then((module) => ({ default: module.SplitPane })));
const FullpageImageEditor = React.lazy(() => import("./components/FullpageImageEditor").then((module) => ({ default: module.FullpageImageEditor })));
const ImageGroupPanel = React.lazy(() => import("./components/ImageGroupPanel").then((module) => ({ default: module.ImageGroupPanel })));

export const EditorPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const { chapterId } = useParams();
    const isPublicDemo = isPublicDemoMode();
    const {
        selectChapter,
        currentChapterContent,
        currentChapterId,
        currentChapterError,
        updateChapterContent,
        updateChapterImages,
        uploadChapterImage,
        project
    } = useProjectStore();

    // Internal local state for immediate typing response
    const [localContent, setLocalContent] = useState<string>("");

    // Local state for fullpage images
    const [localImages, setLocalImages] = useState<FullpageImageConfig[]>([]);

    // Track if content has been loaded for the current chapter
    const [hasLoaded, setHasLoaded] = useState(false);

    const pendingSaveRef = useRef<{ chapterId?: string; content: string; isDirty: boolean }>({
        chapterId: undefined,
        content: "",
        isDirty: false,
    });

    // Track if local content is different from store content (dirty)
    const isDirty = useMemo(() => {
        return localContent !== (currentChapterContent || "");
    }, [localContent, currentChapterContent]);

    useEffect(() => {
        pendingSaveRef.current = {
            chapterId,
            content: localContent,
            isDirty,
        };
    }, [chapterId, localContent, isDirty]);

    // Calculate document statistics (optimized: only recalculate when content length changes significantly)
    const docStats = useMemo(() => {
        const charCount = localContent.length;
        const lineCount = localContent.split('\n').length;
        const wordCount = localContent.split(/\s+/).filter(w => w.length > 0).length;
        const sizeInMB = (charCount / 1000000).toFixed(2);

        let category = 'small';
        if (charCount > 50000) category = 'medium';
        if (charCount > 300000) category = 'large';

        return { charCount, lineCount, wordCount, sizeInMB, category };
    }, [localContent]);

    const chapters = project?.chapters || [];
    const firstChapterId = chapters[0]?.id;
    const currentChapter = chapters.find(c => c.id === chapterId);
    const currentChapterExists = Boolean(currentChapter);

    // 1. Load Chapter when ID changes
    useEffect(() => {
        console.log('[EditorPage] chapterId changed:', chapterId);
        if (chapterId && currentChapterExists) {
            // Clear local content immediately when changing chapters to prevent showing old content
            setLocalContent('');
            setLocalImages([]);
            setHasLoaded(false);
            selectChapter(chapterId);
        }
    }, [chapterId, currentChapterExists, selectChapter]);

    // 2. Sync local state when store content loads
    useEffect(() => {
        // Only update local content if:
        // - currentChapterContent is not null
        // - the loaded content is for the current chapter (currentChapterId matches chapterId)
        if (currentChapterContent !== null && currentChapterId === chapterId) {
            console.log('[EditorPage] Updating local content for chapter:', chapterId);
            setLocalContent(currentChapterContent);
        }
    }, [currentChapterContent, currentChapterId, chapterId]);

    // 2b. Sync images when chapter changes
    useEffect(() => {
        if (currentChapterId === chapterId) {
            const chapter = project?.chapters.find(c => c.id === chapterId);
            if (chapter?.images) {
                setLocalImages(chapter.images);
            }
        }
    }, [currentChapterId, chapterId, project?.chapters]);

    // 3. Debounced Save (optimized based on document size)
    useEffect(() => {
        // Calculate debounce time based on document size
        const docLength = localContent.length;
        let debounceTime = 1000; // Default 1 second

        if (docLength > 100000) {
            debounceTime = 3000; // 3 seconds for large docs
        } else if (docLength > 50000) {
            debounceTime = 2000; // 2 seconds for medium docs
        }

        const timer = setTimeout(() => {
            if (!isPublicDemo && chapterId && isDirty) {
                updateChapterContent(chapterId, localContent);
            }
        }, debounceTime);
        return () => clearTimeout(timer);
    }, [localContent, chapterId, isDirty, updateChapterContent, isPublicDemo]);

    // Flush pending edits when leaving the current chapter or unmounting the editor.
    useEffect(() => {
        return () => {
            const pending = pendingSaveRef.current;
            if (!isPublicDemo && pending.chapterId && pending.chapterId === chapterId && pending.isDirty) {
                updateChapterContent(pending.chapterId, pending.content);
            }
        };
    }, [chapterId, updateChapterContent, isPublicDemo]);

    // Set loaded state when content arrives for the correct chapter
    useEffect(() => {
        if (currentChapterContent !== null && currentChapterId === chapterId && !hasLoaded) {
            console.log('[EditorPage] Content loaded, setting hasLoaded to true');
            setHasLoaded(true);
        }
    }, [currentChapterContent, currentChapterId, chapterId, hasLoaded]);

    const handleSave = () => {
        if (!isPublicDemo && chapterId) {
            updateChapterContent(chapterId, localContent);
            toast({
                title: "保存完了",
                description: "ドキュメントが正常に保存されました",
            });
        }
    };

    if (!chapterId) {
        if (firstChapterId) {
            return <Navigate to={`/editor/${firstChapterId}`} replace />;
        }

        return (
            <div className="h-full flex items-center justify-center p-8">
                <div className="text-center">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">章がありません。</p>
                </div>
            </div>
        );
    }

    if (!currentChapter && firstChapterId) {
        return <Navigate to={`/editor/${firstChapterId}`} replace />;
    }

    if (!currentChapter) {
        return (
            <div className="h-full flex items-center justify-center p-8">
                <div className="text-center">
                    <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">章が見つかりません。</p>
                </div>
            </div>
        );
    }

    if (currentChapterError && currentChapterId === chapterId) {
        return (
            <div className="h-full flex flex-col">
                <div className="h-12 border-b flex items-center px-4 justify-between bg-card">
                    <div className="font-medium text-sm flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {currentChapter?.title || t("untitled_project")}
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="text-center">
                        <p className="text-sm text-destructive">{currentChapterError}</p>
                    </div>
                </div>
            </div>
        );
    }


    // Use a composite ID to force remount when content initially loads.
    // This ensures the Uncontrolled editor gets the loaded content as 'initialValue'.
    // After that, it stays constant so typing doesn't trigger re-renders.
    const editorFileId = `${chapterId}-${hasLoaded ? 'loaded' : 'loading'}`;

    // Show loading state while content is being fetched
    if (!hasLoaded || currentChapterContent === null) {
        return (
            <div className="h-full flex flex-col">
                <div className="h-12 border-b flex items-center px-4 justify-between bg-card">
                    <div className="font-medium text-sm flex items-center gap-2">
                    {currentChapter?.type === 'fullpage_image' ? (
                        <Newspaper className="h-4 w-4 text-purple-600" />
                    ) : currentChapter?.type === 'image_group' ? (
                        <ImageIcon className="h-4 w-4 text-blue-600" />
                    ) : (
                        <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                        {currentChapter?.title || t("untitled_project")}
                        <span className="text-xs text-muted-foreground ml-2">(読み込み中...)</span>
                    </div>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">読み込み中...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            {/* Toolbar */}
            <div className="h-12 border-b flex items-center px-3 sm:px-4 justify-between bg-card gap-2 sm:gap-4">
                <div className="font-medium text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 overflow-hidden">
                    {currentChapter?.type === 'fullpage_image' ? (
                        <Newspaper className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-600 flex-shrink-0" />
                    ) : currentChapter?.type === 'image_group' ? (
                        <ImageIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 flex-shrink-0" />
                    ) : (
                        <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="truncate flex-1 min-w-0" title={currentChapter?.title || t("untitled_project")}>
                        {currentChapter?.title || t("untitled_project")}
                    </span>
                    {isDirty && <span className="text-[10px] sm:text-xs text-muted-foreground flex-shrink-0 hidden xs:inline">({isPublicDemo ? "一時変更" : t("saving")})</span>}
                    {/* Document size indicator - only show for non-fullpage chapters */}
                    {(!currentChapter?.type || currentChapter?.type === 'document') && (
                        <span className={`text-[10px] sm:text-xs px-1 sm:px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap hidden sm:inline-block ${docStats.category === 'small' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' :
                            docStats.category === 'medium' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100' :
                                'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100'
                            }`}>
                            {docStats.charCount.toLocaleString()}文字
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSave}
                        disabled={isPublicDemo || !isDirty}
                        className="h-8 px-2 sm:h-9 sm:px-3"
                    >
                        <Save className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="hidden sm:inline ml-1">{t("save")}</span>
                    </Button>
                </div>
            </div>

            <div className="flex-1 min-h-0">
                {currentChapter?.type === 'fullpage_image' ? (
                    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading full-page editor...</div>}>
                        <FullpageImageEditor
                            chapterId={chapterId || ''}
                            images={localImages}
                            onChange={async (images) => {
                                setLocalImages(images);
                                if (chapterId) {
                                    await updateChapterImages(chapterId, images);
                                }
                            }}
                        />
                    </Suspense>
                ) : currentChapter?.type === 'image_group' ? (
                    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading image group editor...</div>}>
                        <ImageGroupPanel
                            chapterId={chapterId || ''}
                            images={localImages}
                            onChange={async (images) => {
                                setLocalImages(images);
                                if (chapterId) {
                                    await updateChapterImages(chapterId, images);
                                }
                            }}
                            onUpload={async (file) => {
                                if (!chapterId) return;
                                const result = await uploadChapterImage(chapterId, file);
                                if (result) {
                                    setLocalImages((prev) => [...prev, result]);
                                }
                            }}
                        />
                    </Suspense>
                ) : (
                    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading editor workspace...</div>}>
                        <SplitPane
                            content={localContent}
                            onContentChange={setLocalContent}
                            fileId={editorFileId}
                            chapterId={isPublicDemo ? null : chapterId}
                        />
                    </Suspense>
                )}
            </div>

        </div>
    );
};
