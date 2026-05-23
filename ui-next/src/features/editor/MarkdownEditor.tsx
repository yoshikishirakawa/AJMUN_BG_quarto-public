import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView, drawSelection } from '@codemirror/view';
import { keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, undo, redo } from '@codemirror/commands';
import { useTheme } from '@/components/theme-context';
import { useUIStore } from '@/store/useUIStore';
import { Button } from '@/components/ui/button';
import { Table, FileText, Undo, Redo, Image as ImageIcon, Palette, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableEditor } from './components/TableEditor';
import { InsertInternalLinkModal } from './components/InsertInternalLinkModal';
import { ImageManagementPanel } from './components/ImageManagementPanel';
import { QuickStylePanel } from './components/QuickStylePanel';
import { SearchReplaceFloating } from './components/SearchReplacePanel';
import { useHeadings } from './hooks/useHeadings';
import { lightweightEditorSyntaxHighlighting } from './plugins/editorSyntaxLite';

interface MarkdownEditorProps {
    initialValue: string;
    onChange: (value: string) => void;
    className?: string;
    scrollerRef?: React.MutableRefObject<HTMLElement | null>;
    viewRef?: React.MutableRefObject<EditorView | null>;
    fileId?: string; // Used to force remount/reset when file changes
    chapterId?: string; // Required for image upload
}

const LARGE_DOC_THRESHOLD = 120000;
const VERY_LARGE_DOC_THRESHOLD = 200000;

const MarkdownEditorComponent: React.FC<MarkdownEditorProps> = ({
    initialValue,
    onChange,
    className,
    scrollerRef,
    viewRef,
    fileId,
    chapterId,
}) => {
    const { theme } = useTheme();
    const { editorFontSize } = useUIStore();
    const [isTableModalOpen, setIsTableModalOpen] = useState(false);
    const [isInternalLinkModalOpen, setIsInternalLinkModalOpen] = useState(false);
    const [isImageModalOpen, setIsImageModalOpen] = useState(false);
    const [showStylePanel, setShowStylePanel] = useState(false);
    const [showSearchPanel, setShowSearchPanel] = useState(false);
    const [isLargeDoc, setIsLargeDoc] = useState(false);
    const [isVeryLargeDoc, setIsVeryLargeDoc] = useState(false);
    const [forceSyntaxHighlight, setForceSyntaxHighlight] = useState(false);
    const [perfLatencyMs, setPerfLatencyMs] = useState<number | null>(null);
    const lastInputAtRef = useRef<number | null>(null);
    const lastPerfUpdateRef = useRef(0);
    const showPerfHud = isLargeDoc || import.meta.env.DEV;
    const showPerfStatus = showPerfHud && perfLatencyMs !== null;
    const showHeaderStatus = isLargeDoc || showPerfStatus;

    const updateDocSizeState = useCallback((nextLength: number) => {
        const nextIsLarge = nextLength >= LARGE_DOC_THRESHOLD;
        setIsLargeDoc(prev => (prev === nextIsLarge ? prev : nextIsLarge));
        const nextIsVeryLarge = nextLength >= VERY_LARGE_DOC_THRESHOLD;
        setIsVeryLargeDoc(prev => (prev === nextIsVeryLarge ? prev : nextIsVeryLarge));
    }, []);

    useEffect(() => {
        updateDocSizeState(initialValue.length);
    }, [initialValue, updateDocSizeState]);

    // Undo/Redo handlers
    const handleUndo = useCallback(() => {
        if (viewRef?.current) {
            undo(viewRef.current);
        }
    }, [viewRef]);

    const handleRedo = useCallback(() => {
        if (viewRef?.current) {
            redo(viewRef.current);
        }
    }, [viewRef]);

    // Custom theme extension - Memoized
    const editorTheme = useMemo(() => EditorView.theme({
        "&": {
            height: "100%",
            fontSize: `${editorFontSize}px`,
        },
        ".cm-content": {
            fontFamily: "var(--font-mono, monospace)",
            padding: "20px",
            paddingTop: "60px", // Space for toolbar
        },
        ".cm-line": {
            lineHeight: "1.6",
            maxWidth: "800px",
        },
        // Syntax Highlighting Styles
        ".cm-syntax-footnote": {
            color: "var(--primary)",
            fontWeight: "bold",
        },
        ".cm-syntax-index": {
            backgroundColor: "rgba(0, 0, 0, 0.05)",
            borderBottom: "1px dashed var(--muted-foreground)",
            color: "var(--secondary-foreground)",
        },
        ".cm-syntax-lawquote": {
            color: "var(--primary)",
            fontWeight: "bold",
        },
        // Force selection styling to avoid browser artifacts
        "&.cm-focused .cm-selectionBackground, ::selection": {
            backgroundColor: "var(--secondary)",
            opacity: "0.5",
        },
        ".cm-selectionBackground, ::selection": {
            backgroundColor: "var(--secondary)",
            opacity: "0.5",
        },
        "&.cm-focused": {
            outline: "none",
        },
    }), [editorFontSize]);

    // Context menu handler
    const handleContextMenu = useCallback((event: MouseEvent, view: EditorView) => {
        event.preventDefault();

        // Get selection or cursor position
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (!pos) return;

        // Create custom context menu
        const menu = document.createElement('div');
        menu.className = 'editor-context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${event.clientX}px;
            top: ${event.clientY}px;
            background: var(--background);
            border: 1px solid var(--border);
            border-radius: 8px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            padding: 4px 0;
            min-width: 180px;
            z-index: 1000;
        `;

        const menuItems = [
            { label: '元に戻す (Cmd/Ctrl+Z)', action: () => undo(view) },
            { label: 'やり直し (Cmd/Ctrl+Shift+Z)', action: () => redo(view) },
            { divider: true },
            {
                label: '太字 (Cmd/Ctrl+B)', action: () => {
                    const selection = view.state.selection.main;
                    if (selection.from !== selection.to) {
                        view.dispatch({
                            changes: {
                                from: selection.from,
                                to: selection.to,
                                insert: `**${view.state.sliceDoc(selection.from, selection.to)}**`
                            }
                        });
                    }
                }
            },
            {
                label: '斜体 (Cmd/Ctrl+I)', action: () => {
                    const selection = view.state.selection.main;
                    if (selection.from !== selection.to) {
                        view.dispatch({
                            changes: {
                                from: selection.from,
                                to: selection.to,
                                insert: `*${view.state.sliceDoc(selection.from, selection.to)}*`
                            }
                        });
                    }
                }
            },
            {
                label: 'コードブロック', action: () => {
                    const selection = view.state.selection.main;
                    view.dispatch({
                        changes: {
                            from: selection.from,
                            to: selection.to,
                            insert: '```\n\n```'
                        },
                        selection: { anchor: selection.from + 4 }
                    });
                }
            },
            { divider: true },
            { label: '内部リンクを挿入', action: () => setIsInternalLinkModalOpen(true) },
            { label: 'テーブルを挿入', action: () => setIsTableModalOpen(true) },
        ];

        menuItems.forEach(item => {
            if ('divider' in item && item.divider) {
                const divider = document.createElement('div');
                divider.style.cssText = `
                    height: 1px;
                    background: var(--border);
                    margin: 4px 0;
                `;
                menu.appendChild(divider);
            } else {
                const menuItem = document.createElement('div');
                menuItem.className = 'context-menu-item';
                menuItem.style.cssText = `
                    padding: 8px 16px;
                    cursor: pointer;
                    font-size: 14px;
                    color: var(--foreground);
                `;
                menuItem.textContent = item.label ?? '';
                menuItem.addEventListener('click', () => {
                    item.action?.();
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                    document.removeEventListener('keydown', closeMenuOnEscape);
                });
                menuItem.addEventListener('mouseenter', () => {
                    menuItem.style.background = 'var(--secondary)';
                });
                menuItem.addEventListener('mouseleave', () => {
                    menuItem.style.background = 'transparent';
                });
                menu.appendChild(menuItem);
            }
        });

        document.body.appendChild(menu);

        const closeMenu = () => {
            menu.remove();
            document.removeEventListener('click', closeMenu);
            document.removeEventListener('keydown', closeMenuOnEscape);
        };

        const closeMenuOnEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                closeMenu();
            }
        };

        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
            document.addEventListener('keydown', closeMenuOnEscape);
        }, 0);
    }, []);

    // ドラッグ&ドロップイベントハンドラ
    const handleDrop = useCallback((event: DragEvent) => {
        event.preventDefault();

        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return;

        const file = files[0];

        // 画像ファイルのみ処理
        if (!file.type.startsWith('image/')) {
            return;
        }

        // チャプターIDがない場合はモーダルを開く
        if (!chapterId) {
            setIsImageModalOpen(true);
            return;
        }

        // 自動アップロード（ドラッグ&ドロップはモーダルを開いて確認させる）
        setIsImageModalOpen(true);
    }, [chapterId]);

    const handleChange = useCallback((value: string) => {
        lastInputAtRef.current = performance.now();
        updateDocSizeState(value.length);
        onChange(value);
    }, [onChange, updateDocSizeState]);

    // Memoize extensions array with line wrapping enabled
    const extensions = useMemo(() => {
        const next = [
            markdown({ base: markdownLanguage, codeLanguages: isLargeDoc && !forceSyntaxHighlight ? [] : languages }),
            EditorView.lineWrapping, // Re-enabled for better UX
            editorTheme,
            drawSelection(),
            history(), // Enable undo/redo history
            keymap.of([
                ...defaultKeymap,
                ...historyKeymap, // Add undo/redo keyboard shortcuts (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z)
            ]),
            EditorView.domEventHandlers({
                contextmenu: handleContextMenu,
                drop: handleDrop,
            }),
        ];

        if (!isVeryLargeDoc || forceSyntaxHighlight) {
            next.push(lightweightEditorSyntaxHighlighting());
        }

        if (showPerfHud) {
            next.push(EditorView.updateListener.of((update) => {
                if (!update.docChanged) {
                    return;
                }
                const startedAt = lastInputAtRef.current;
                if (startedAt === null) {
                    return;
                }
                requestAnimationFrame(() => {
                    const elapsed = performance.now() - startedAt;
                    const now = performance.now();
                    if (import.meta.env.DEV && elapsed > 30) {
                        console.debug(`[editor] input->frame ${Math.round(elapsed)}ms`);
                    }
                    if (now - lastPerfUpdateRef.current > 500 || elapsed > 50) {
                        lastPerfUpdateRef.current = now;
                        setPerfLatencyMs(Math.round(elapsed));
                    }
                });
            }));
        }

        return next;
    }, [editorTheme, forceSyntaxHighlight, handleContextMenu, handleDrop, isLargeDoc, isVeryLargeDoc, showPerfHud]);

    // 見出しフックの使用
    const headings = useHeadings(viewRef?.current?.state || null);

    // 選択テキストの取得
    const selectedText = useMemo(() => {
        if (!viewRef?.current) return '';
        const selection = viewRef.current.state.selection.main;
        return viewRef.current.state.sliceDoc(selection.from, selection.to);
    }, [viewRef]);

    const handleCreateEditor = (view: EditorView) => {
        if (scrollerRef) {
            scrollerRef.current = view.scrollDOM;
        }
        if (viewRef) {
            viewRef.current = view;
        }
    };

    const handleInsertTable = (snippet: string) => {
        if (viewRef?.current) {
            const view = viewRef.current;
            const range = view.state.selection.main;
            view.dispatch({
                changes: {
                    from: range.from,
                    to: range.to,
                    insert: snippet
                },
                selection: { anchor: range.from + snippet.length }
            });
        }
    };

    const handleInsertInternalLink = useCallback((linkText: string, linkUrl: string) => {
        if (!viewRef?.current) return;

        const view = viewRef.current;
        const tr = view.state.update({
            changes: {
                from: view.state.selection.main.from,
                to: view.state.selection.main.to,
                insert: `[${linkText}](${linkUrl})`
            },
            selection: {
                anchor: view.state.selection.main.from,
                head: view.state.selection.main.from
            }
        });

        view.dispatch(tr);
        view.focus();
    }, [viewRef]);

    // 画像挿入ハンドラ
    const handleInsertImage = useCallback((markdown: string) => {
        if (!viewRef?.current) return;

        const view = viewRef.current;
        const tr = view.state.update({
            changes: {
                from: view.state.selection.main.from,
                to: view.state.selection.main.to,
                insert: markdown
            },
            selection: {
                anchor: view.state.selection.main.from + markdown.length,
                head: view.state.selection.main.from + markdown.length
            }
        });

        view.dispatch(tr);
        view.focus();
    }, [viewRef]);

    const { editorScrollSignal } = useUIStore();

    useEffect(() => {
        if (editorScrollSignal && viewRef?.current) {
            const view = viewRef.current;
            try {
                const lineInfo = view.state.doc.line(editorScrollSignal.line);
                view.dispatch({
                    effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
                    selection: { anchor: lineInfo.from }
                });
            } catch {
                console.warn("Invalid line number for scroll", editorScrollSignal.line);
            }
        }
    }, [editorScrollSignal, viewRef]);

    // キーボードショートカット
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd/Ctrl + K で内部リンク挿入モーダルを開く
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsInternalLinkModalOpen(true);
            }
            // Cmd/Ctrl + I で画像挿入モーダルを開く
            if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
                e.preventDefault();
                setIsImageModalOpen(true);
            }
            // Cmd/Ctrl + F で検索パネルを開く
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                setShowSearchPanel(!showSearchPanel);
            }
            // Cmd/Ctrl + H で置換モードで検索パネルを開く
            if ((e.metaKey || e.ctrlKey) && e.key === 'h') {
                e.preventDefault();
                setShowSearchPanel(true);
            }
            // Escape でパネルを閉じる
            if (e.key === 'Escape') {
                if (showSearchPanel) {
                    setShowSearchPanel(false);
                } else if (showStylePanel) {
                    setShowStylePanel(false);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showSearchPanel, showStylePanel]);

    return (
        <div className={`h-full w-full relative ${className}`}>
            {/* Quick Style Panel - shown when toggle is active */}
            {showStylePanel && viewRef && (
                <div className="absolute top-2 left-2 z-10">
                    <QuickStylePanel viewRef={viewRef as React.RefObject<EditorView | null>} />
                </div>
            )}

            {/* Search/Replace Panel - shown when toggle is active */}
            {showSearchPanel && viewRef && (
                <SearchReplaceFloating
                    viewRef={viewRef as React.RefObject<EditorView | null>}
                    onClose={() => setShowSearchPanel(false)}
                />
            )}

            <div className="absolute top-2 right-4 z-10 flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-lg border shadow-sm p-1">
                {isLargeDoc && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full border border-primary/40 bg-primary/10 text-primary">
                        {isVeryLargeDoc ? 'Very Large Doc' : 'Large Doc'}
                    </span>
                )}
                {isLargeDoc && (
                    <Button
                        variant={forceSyntaxHighlight ? "secondary" : "outline"}
                        size="sm"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => setForceSyntaxHighlight(prev => !prev)}
                        type="button"
                        aria-pressed={forceSyntaxHighlight}
                        title="構文ハイライトの切替"
                    >
                        HL {forceSyntaxHighlight ? 'On' : 'Off'}
                    </Button>
                )}
                {showPerfStatus && (
                    <span className="text-[11px] font-mono text-muted-foreground px-1">
                        Input {perfLatencyMs}ms
                    </span>
                )}
                {showHeaderStatus && <div className="w-px h-4 bg-border mx-0.5" />}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleUndo}
                    title="元に戻す (Cmd/Ctrl + Z)"
                    aria-label="元に戻す"
                >
                    <Undo className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleRedo}
                    title="やり直し (Cmd/Ctrl + Shift + Z)"
                    aria-label="やり直し"
                >
                    <Redo className="h-3.5 w-3.5" />
                </Button>
                <div className="w-px h-4 bg-border mx-0.5" />
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-7 w-7", showSearchPanel && "bg-secondary")}
                    onClick={() => setShowSearchPanel(!showSearchPanel)}
                    title="検索・置換 (Cmd/Ctrl + F)"
                    aria-label="検索・置換"
                >
                    <Search className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setIsInternalLinkModalOpen(true)}
                    title="内部リンクを挿入 (Cmd/Ctrl + K)"
                    aria-label="内部リンクを挿入"
                >
                    <FileText className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setIsTableModalOpen(true)}
                    title="テーブルを挿入"
                    aria-label="テーブルを挿入"
                >
                    <Table className="h-3.5 w-3.5" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setIsImageModalOpen(true)}
                    title="画像を挿入 (Cmd/Ctrl + I)"
                    aria-label="画像を挿入"
                    disabled={!chapterId}
                >
                    <ImageIcon className="h-3.5 w-3.5" />
                </Button>
                <div className="w-px h-4 bg-border mx-0.5" />
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-7 w-7", showStylePanel && "bg-secondary")}
                    onClick={() => setShowStylePanel(!showStylePanel)}
                    title="クイックスタイルパネル"
                    aria-label="クイックスタイルパネル"
                >
                    <Palette className="h-3.5 w-3.5" />
                </Button>
            </div>

            <CodeMirror
                key={fileId} // Reset editor instance when file changes
                value={initialValue}
                height="100%"
                theme={theme === 'dark' ? 'dark' : 'light'}
                extensions={extensions}
                onChange={handleChange}
                onCreateEditor={handleCreateEditor}
                className="h-full text-base"
                basicSetup={false} // DISABLE: Use minimal setup for better performance
            />

            <TableEditor
                isOpen={isTableModalOpen}
                onClose={() => setIsTableModalOpen(false)}
                onInsert={handleInsertTable}
                viewRef={viewRef as React.RefObject<EditorView | null>}
            />
            <InsertInternalLinkModal
                isOpen={isInternalLinkModalOpen}
                onClose={() => setIsInternalLinkModalOpen(false)}
                onInsert={handleInsertInternalLink}
                headings={headings}
                selectedText={selectedText}
            />
            <ImageManagementPanel
                isOpen={isImageModalOpen}
                onClose={() => setIsImageModalOpen(false)}
                onInsert={handleInsertImage}
                chapterId={chapterId}
            />
        </div>
    );
};

// Optimize performance: ONLY re-render if fileId changes.
// We ignore 'initialValue' changes because in Uncontrolled mode, 
// the editor manages its own state. We only want to reset if the file changes.
export const MarkdownEditor = React.memo(MarkdownEditorComponent, (prevProps, nextProps) => {
    return prevProps.fileId === nextProps.fileId;
});
