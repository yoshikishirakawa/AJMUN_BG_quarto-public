import { useRef, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { GripVertical } from 'lucide-react';
import { MarkdownEditor } from './MarkdownEditor';
import { Preview } from './Preview';
import { useScrollSyncEngine } from './scrollSync';
import { EditorView } from '@codemirror/view';

import { useDynamicDebounce } from '@/hooks/useDynamicDebounce';

interface SplitPaneProps {
    content: string;
    onContentChange: (val: string) => void;
    showPreview?: boolean;
    fileId?: string;
    chapterId?: string | null;
}

export const SplitPane: React.FC<SplitPaneProps> = ({
    content,
    onContentChange,
    showPreview = true,
    fileId,
    chapterId,
}) => {
    const editorScrollerRef = useRef<HTMLElement>(null);
    const editorViewRef = useRef<EditorView | null>(null);
    const previewScrollerRef = useRef<HTMLDivElement>(null);

    // Debounce content for Preview - EXTREMELY aggressive for large docs
    const debouncedContent = useDynamicDebounce(content, 'preview');

    // Use new Document-Space scroll sync engine
    const { clearCache } = useScrollSyncEngine(
        editorViewRef,
        previewScrollerRef,
        { enabled: true }
    );

    // Clear scroll cache when file changes (chapter navigation)
    useEffect(() => {
        // Clear cache when fileId changes (new chapter)
        clearCache?.();
    }, [fileId, clearCache]);

    return (
        <div className="h-full w-full">
            <PanelGroup direction="horizontal" className="h-full">
                {/* Editor Panel */}
                <Panel defaultSize={50} minSize={20} className="bg-background">
                    <div className="h-full w-full">
                        <MarkdownEditor
                            initialValue={content}
                            onChange={onContentChange}
                            scrollerRef={editorScrollerRef}
                            viewRef={editorViewRef as any}
                            fileId={fileId}
                            chapterId={chapterId ?? undefined}
                        />
                    </div>
                </Panel>

                {showPreview && (
                    <>
                        <PanelResizeHandle className="relative flex w-2 items-center justify-center bg-border hover:bg-primary/20 transition-colors">
                            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                        </PanelResizeHandle>

                        {/* Preview Panel */}
                        <Panel defaultSize={50} minSize={20} className="bg-muted/30">
                            <div className="h-full w-full">
                                <Preview
                                    content={debouncedContent}
                                    scrollerRef={previewScrollerRef}
                                />
                            </div>
                        </Panel>
                    </>
                )}
            </PanelGroup>
        </div>
    );
};
