import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    Bold, Italic, Code, Heading1, Heading2, Heading3,
    List, ListOrdered, Quote, Highlighter,
    AlignLeft, AlignCenter, AlignRight, Pilcrow,
    Subscript, Superscript, Strikethrough,
    ChevronDown, Minus
} from 'lucide-react';
import { EditorView } from '@codemirror/view';
import { cn } from '@/lib/utils';

interface QuickStylePanelProps {
    viewRef: React.RefObject<EditorView | null>;
    className?: string;
}

// Style categories for better organization
const HEADING_STYLES = [
    { id: 'h1', label: '見出し1', icon: Heading1, prefix: '# ', suffix: '' },
    { id: 'h2', label: '見出し2', icon: Heading2, prefix: '## ', suffix: '' },
    { id: 'h3', label: '見出し3', icon: Heading3, prefix: '### ', suffix: '' },
];

const TEXT_STYLES = [
    { id: 'bold', label: '太字', icon: Bold, prefix: '**', suffix: '**', shortcut: 'Cmd/Ctrl+B' },
    { id: 'italic', label: '斜体', icon: Italic, prefix: '*', suffix: '*', shortcut: 'Cmd/Ctrl+I' },
    { id: 'strike', label: '取り消し線', icon: Strikethrough, prefix: '~~', suffix: '~~' },
    { id: 'code', label: 'コード', icon: Code, prefix: '`', suffix: '`', shortcut: 'Cmd/Ctrl+E' },
    { id: 'sup', label: '上付き文字', icon: Superscript, prefix: '^', suffix: '^' },
    { id: 'sub', label: '下付き文字', icon: Subscript, prefix: '~', suffix: '~' },
];

const HIGHLIGHT_COLORS = [
    { name: 'yellow', label: '黄色', class: 'hl-yellow', color: '#fef08a' },
    { name: 'red', label: '赤', class: 'hl-red', color: '#fecaca' },
    { name: 'green', label: '緑', class: 'hl-green', color: '#bbf7d0' },
    { name: 'blue', label: '青', class: 'hl-blue', color: '#bfdbfe' },
    { name: 'purple', label: '紫', class: 'hl-purple', color: '#ddd6fe' },
];

const LIST_STYLES = [
    { id: 'ul', label: '箇条書き', icon: List, prefix: '- ', suffix: '' },
    { id: 'ol', label: '番号付きリスト', icon: ListOrdered, prefix: '1. ', suffix: '' },
    { id: 'check', label: 'チェックリスト', icon: Pilcrow, prefix: '- [ ] ', suffix: '' },
];

const BLOCK_STYLES = [
    { id: 'quote', label: '引用ブロック', icon: Quote, prefix: '> ', suffix: '' },
    { id: 'codeblock', label: 'コードブロック', icon: Code, prefix: '```\n', suffix: '\n```' },
    { id: 'hr', label: '水平線', icon: Minus, prefix: '\n---\n', suffix: '' },
];

const ALIGN_STYLES = [
    { id: 'left', label: '左寄せ', icon: AlignLeft, html: '<div style="text-align: left;">', htmlClose: '</div>' },
    { id: 'center', label: '中央揃え', icon: AlignCenter, html: '<div style="text-align: center;">', htmlClose: '</div>' },
    { id: 'right', label: '右寄せ', icon: AlignRight, html: '<div style="text-align: right;">', htmlClose: '</div>' },
];

// StyleButton component for individual style buttons
const StyleButton: React.FC<{
    onClick: () => void;
    icon?: React.ElementType;
    label: string;
    shortcut?: string;
    isActive?: boolean;
    disabled?: boolean;
}> = ({ onClick, icon: Icon, label, shortcut, isActive, disabled }) => {
    return (
        <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            disabled={disabled}
            title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
            className={cn(
                "h-8 px-2 gap-1.5 text-xs font-medium",
                isActive && "bg-secondary text-secondary-foreground"
            )}
        >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            <span>{label}</span>
        </Button>
    );
};

// Icon-only button for toolbar
const ToolbarButton: React.FC<{
    onClick?: () => void;
    icon: React.ElementType;
    label: string;
    isActive?: boolean;
    disabled?: boolean;
}> = ({ onClick, icon: Icon, label, isActive, disabled }) => {
    return (
        <Button
            variant="ghost"
            size="icon"
            className={cn(
                "h-7 w-7",
                isActive && "bg-secondary text-secondary-foreground"
            )}
            onClick={onClick}
            disabled={disabled}
            title={label}
        >
            <Icon className="h-3.5 w-3.5" />
        </Button>
    );
};

// Color picker popover
const ColorPicker: React.FC<{
    onSelectColor: (colorClass: string, colorName: string) => void;
}> = ({ onSelectColor }) => {
    return (
        <div className="p-2">
            <div className="text-xs text-muted-foreground mb-2 px-1">ハイライト色</div>
            <div className="grid grid-cols-5 gap-1">
                {HIGHLIGHT_COLORS.map((color) => (
                    <button
                        key={color.name}
                        className={cn(
                            "h-7 rounded border border-border hover:scale-110 transition-transform",
                            "focus:outline-none focus:ring-2 focus:ring-ring"
                        )}
                        style={{ backgroundColor: color.color }}
                        onClick={() => onSelectColor(color.class, color.label)}
                        title={color.label}
                    />
                ))}
            </div>
        </div>
    );
};

// Main Quick Style Panel Component
export const QuickStylePanel: React.FC<QuickStylePanelProps> = ({ viewRef, className }) => {
    const [openPopover, setOpenPopover] = useState<string | null>(null);
    const [isExpanded, setIsExpanded] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    // Get selection and check for active styles
    const getSelectionInfo = useCallback(() => {
        if (!viewRef?.current) {
            return { hasSelection: false, text: '', line: '', isBold: false, isItalic: false };
        }

        const view = viewRef.current;
        const selection = view.state.selection.main;
        const text = view.state.sliceDoc(selection.from, selection.to);

        // Get current line for heading detection
        const line = view.state.doc.lineAt(selection.from);
        const lineText = line.text;

        // Check if selection is wrapped in markdown syntax
        const before = view.state.sliceDoc(Math.max(0, selection.from - 2), selection.from);
        const after = view.state.sliceDoc(selection.to, Math.min(view.state.doc.length, selection.to + 2));

        const isBold = before.endsWith('**') && after.startsWith('**');
        const isItalic = (before.endsWith('*') && !before.endsWith('**')) && after.startsWith('*');

        return {
            hasSelection: selection.from !== selection.to,
            text,
            line: lineText,
            isBold,
            isItalic,
            isH1: lineText.startsWith('# '),
            isH2: lineText.startsWith('## '),
            isH3: lineText.startsWith('### '),
            isList: lineText.match(/^\s*[-*+]\s/) !== null,
            isOrderedList: lineText.match(/^\s*\d+\.\s/) !== null,
            isQuote: lineText.startsWith('> '),
        };
    }, [viewRef]);

    // Apply style to selection
    const applyStyle = useCallback((style: {
        prefix: string;
        suffix: string;
        line?: boolean;
    }) => {
        if (!viewRef?.current) return;

        const view = viewRef.current;
        const selection = view.state.selection.main;

        if (style.line) {
            // Apply to entire line
            const line = view.state.doc.lineAt(selection.from);
            view.dispatch({
                changes: {
                    from: line.from,
                    to: line.to,
                    insert: style.prefix + line.text + style.suffix
                }
            });
        } else {
            // Apply to selection
            const selectedText = view.state.sliceDoc(selection.from, selection.to);
            const newText = selectedText
                ? style.prefix + selectedText + style.suffix
                : style.prefix + style.suffix;

            view.dispatch({
                changes: {
                    from: selection.from,
                    to: selection.to,
                    insert: newText
                },
                selection: {
                    anchor: selection.from + style.prefix.length,
                    head: selection.from + style.prefix.length + (selectedText?.length || 0)
                }
            });
        }

        view.focus();
    }, [viewRef]);

    // Apply highlight color
    const applyHighlight = useCallback((colorClass: string) => {
        if (!viewRef?.current) return;

        const view = viewRef.current;
        const selection = view.state.selection.main;
        const selectedText = view.state.sliceDoc(selection.from, selection.to);

        if (!selectedText) {
            // Insert marker if no selection
            const marker = `==テキスト=={: .${colorClass} }`;
            view.dispatch({
                changes: {
                    from: selection.from,
                    to: selection.to,
                    insert: marker
                },
                selection: {
                    anchor: selection.from + 2,
                    head: selection.from + 6
                }
            });
        } else {
            const newText = `==${selectedText}=={: .${colorClass} }`;
            view.dispatch({
                changes: {
                    from: selection.from,
                    to: selection.to,
                    insert: newText
                }
            });
        }

        view.focus();
        setOpenPopover(null);
    }, [viewRef]);

    // Insert special character
    const insertSpecial = useCallback((char: string) => {
        if (!viewRef?.current) return;

        const view = viewRef.current;
        const selection = view.state.selection.main;

        view.dispatch({
            changes: {
                from: selection.from,
                to: selection.to,
                insert: char
            },
            selection: {
                anchor: selection.from + char.length,
                head: selection.from + char.length
            }
        });

        view.focus();
    }, [viewRef]);

    const selectionInfo = useMemo(() => getSelectionInfo(), [getSelectionInfo]);

    // Close expanded panel when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsExpanded(false);
            }
        };

        if (isExpanded) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isExpanded]);

    return (
        <div ref={panelRef} className={cn("flex items-center gap-1 bg-background/95 backdrop-blur border rounded-lg p-1", className)}>
            {/* Heading styles */}
            <Popover open={openPopover === 'heading'} onOpenChange={(open) => setOpenPopover(open ? 'heading' : null)}>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-xs">
                        <Heading1 className="h-3.5 w-3.5" />
                        <span>見出し</span>
                        <ChevronDown className="h-3 w-3.5" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                    <div className="space-y-1">
                        {HEADING_STYLES.map((style) => (
                            <Button
                                key={style.id}
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start h-8 text-xs"
                                onClick={() => { applyStyle({ ...style, line: true }); setOpenPopover(null); }}
                            >
                                <style.icon className="h-3.5 w-3.5 mr-2" />
                                {style.label}
                            </Button>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>

            <Separator orientation="vertical" className="h-5 mx-0.5" />

            {/* Basic text styles */}
            <ToolbarButton
                icon={Bold}
                label="太字"
                isActive={selectionInfo.isBold}
                disabled={!selectionInfo.hasSelection}
                onClick={() => applyStyle(TEXT_STYLES.find(s => s.id === 'bold')!)}
            />
            <ToolbarButton
                icon={Italic}
                label="斜体"
                isActive={selectionInfo.isItalic}
                disabled={!selectionInfo.hasSelection}
                onClick={() => applyStyle(TEXT_STYLES.find(s => s.id === 'italic')!)}
            />
            <ToolbarButton
                icon={Strikethrough}
                label="取り消し線"
                disabled={!selectionInfo.hasSelection}
                onClick={() => applyStyle(TEXT_STYLES.find(s => s.id === 'strike')!)}
            />
            <ToolbarButton
                icon={Code}
                label="コード"
                disabled={!selectionInfo.hasSelection}
                onClick={() => applyStyle(TEXT_STYLES.find(s => s.id === 'code')!)}
            />

            <Separator orientation="vertical" className="h-5 mx-0.5" />

            {/* Highlight color */}
            <Popover open={openPopover === 'highlight'} onOpenChange={(open) => setOpenPopover(open ? 'highlight' : null)}>
                <PopoverTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={cn("h-7 w-7 relative", openPopover === 'highlight' && "bg-secondary")}
                    >
                        <Highlighter className="h-3.5 w-3.5" />
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 rounded-full bg-gradient-to-r from-yellow-400 via-red-400 to-blue-400" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <ColorPicker onSelectColor={() => { /* Handle color selection */ }} />
                </PopoverContent>
            </Popover>

            <Separator orientation="vertical" className="h-5 mx-0.5" />

            {/* List styles */}
            <Popover open={openPopover === 'list'} onOpenChange={(open) => setOpenPopover(open ? 'list' : null)}>
                <PopoverTrigger asChild>
                    <ToolbarButton icon={List} label="リスト" isActive={selectionInfo.isList} />
                </PopoverTrigger>
                <PopoverContent className="w-40 p-2" align="start">
                    <div className="space-y-1">
                        {LIST_STYLES.map((style) => (
                            <Button
                                key={style.id}
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start h-8 text-xs"
                                onClick={() => { applyStyle({ ...style, line: true }); setOpenPopover(null); }}
                            >
                                <style.icon className="h-3.5 w-3.5 mr-2" />
                                {style.label}
                            </Button>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>

            {/* Block styles */}
            <Popover open={openPopover === 'block'} onOpenChange={(open) => setOpenPopover(open ? 'block' : null)}>
                <PopoverTrigger asChild>
                    <ToolbarButton icon={Quote} label="ブロックスタイル" isActive={selectionInfo.isQuote} />
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                    <div className="space-y-1">
                        {BLOCK_STYLES.map((style) => (
                            <Button
                                key={style.id}
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start h-8 text-xs"
                                onClick={() => { applyStyle(style); setOpenPopover(null); }}
                            >
                                <style.icon className="h-3.5 w-3.5 mr-2" />
                                {style.label}
                            </Button>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>

            <Separator orientation="vertical" className="h-5 mx-0.5" />

            {/* Alignment */}
            <Popover open={openPopover === 'align'} onOpenChange={(open) => setOpenPopover(open ? 'align' : null)}>
                <PopoverTrigger asChild>
                    <ToolbarButton icon={AlignLeft} label="配置" />
                </PopoverTrigger>
                <PopoverContent className="w-36 p-2" align="start">
                    <div className="space-y-1">
                        {ALIGN_STYLES.map((style) => (
                            <Button
                                key={style.id}
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start h-8 text-xs"
                                onClick={() => { applyStyle({ prefix: `{.${style.id}}\n`, suffix: '' }); setOpenPopover(null); }}
                            >
                                <style.icon className="h-3.5 w-3.5 mr-2" />
                                {style.label}
                            </Button>
                        ))}
                    </div>
                </PopoverContent>
            </Popover>

            {/* Expand button for more options */}
            <Popover open={isExpanded} onOpenChange={setIsExpanded}>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Pilcrow className="h-3.5 w-3.5" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="end">
                    <div className="space-y-3">
                        <div>
                            <div className="text-xs text-muted-foreground mb-2">上付き/下付き</div>
                            <div className="flex gap-1">
                                <StyleButton
                                    icon={Superscript}
                                    label="上付き"
                                    onClick={() => { applyStyle(TEXT_STYLES.find(s => s.id === 'sup')!); setIsExpanded(false); }}
                                    disabled={!selectionInfo.hasSelection}
                                />
                                <StyleButton
                                    icon={Subscript}
                                    label="下付き"
                                    onClick={() => { applyStyle(TEXT_STYLES.find(s => s.id === 'sub')!); setIsExpanded(false); }}
                                    disabled={!selectionInfo.hasSelection}
                                />
                            </div>
                        </div>

                        <Separator />

                        <div>
                            <div className="text-xs text-muted-foreground mb-2">特殊文字の挿入</div>
                            <div className="grid grid-cols-5 gap-1">
                                {['"', '"', '—', '…', '§', '†', '‡', '¶', '©', '®'].map((char) => (
                                    <button
                                        key={char}
                                        className="h-7 text-xs border rounded hover:bg-secondary transition-colors"
                                        onClick={() => insertSpecial(char)}
                                    >
                                        {char}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <Separator />

                        <div>
                            <div className="text-xs text-muted-foreground mb-2">ハイライト色</div>
                            <ColorPicker
                                onSelectColor={(colorClass) => {
                                    applyHighlight(colorClass);
                                    setIsExpanded(false);
                                }}
                            />
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
};

// Export as a toolbar component for use in editor
export const QuickStyleToolbar: React.FC<QuickStylePanelProps> = (props) => {
    return (
        <div className="absolute top-2 left-2 z-10">
            <QuickStylePanel {...props} />
        </div>
    );
};
