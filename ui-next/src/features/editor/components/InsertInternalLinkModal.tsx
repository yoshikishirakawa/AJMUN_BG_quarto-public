import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, FileText, ChevronRight } from 'lucide-react';

interface Heading {
    id: string;
    text: string;
    level: number;
    children?: Heading[];
}

interface InsertInternalLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
    onInsert: (linkText: string, linkUrl: string) => void;
    headings: Heading[];
    selectedText?: string;
}

export const InsertInternalLinkModal: React.FC<InsertInternalLinkModalProps> = ({
    isOpen,
    onClose,
    onInsert,
    headings,
    selectedText = ''
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedHeading, setSelectedHeading] = useState<Heading | null>(null);
    const [previewText, setPreviewText] = useState(selectedText);
    const [previewUrl, setPreviewUrl] = useState('');

    // 検索フィルタリング
    const filteredHeadings = useMemo(() => {
        if (!searchQuery.trim()) return headings;

        const filterHeadings = (items: Heading[]): Heading[] => {
            return items.reduce<Heading[]>((acc, heading) => {
                const matches = heading.text.toLowerCase().includes(searchQuery.toLowerCase());
                const filteredChildren = heading.children ? filterHeadings(heading.children) : [];

                if (matches || filteredChildren.length > 0) {
                    acc.push({
                        ...heading,
                        children: filteredChildren.length > 0 ? filteredChildren : heading.children
                    });
                }
                return acc;
            }, []);
        };

        return filterHeadings(headings);
    }, [headings, searchQuery]);

    // 見出し選択時のプレビュー更新
    useEffect(() => {
        if (selectedHeading) {
            setPreviewText(selectedText || selectedHeading.text);
            setPreviewUrl(`http://${selectedHeading.id}.toc`);
        }
    }, [selectedHeading, selectedText]);

    // 見出しクリックハンドラ
    const handleHeadingClick = useCallback((heading: Heading) => {
        setSelectedHeading(heading);
    }, []);

    // 挿入ハンドラ
    const handleInsert = useCallback(() => {
        if (selectedHeading) {
            const linkText = previewText || selectedHeading.text;
            const linkUrl = `http://${selectedHeading.id}.toc`;
            onInsert(linkText, linkUrl);
            onClose();
            // リセット
            setSearchQuery('');
            setSelectedHeading(null);
            setPreviewText('');
            setPreviewUrl('');
        }
    }, [selectedHeading, previewText, onInsert, onClose]);

    // キャンセルハンドラ
    const handleCancel = useCallback(() => {
        onClose();
        setSearchQuery('');
        setSelectedHeading(null);
        setPreviewText('');
        setPreviewUrl('');
    }, [onClose]);

    // キーボードハンドラ
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            handleCancel();
        }
    }, [handleCancel]);

    // 見出しアイコンのレベル別スタイル
    const getHeadingIcon = (level: number) => {
        return <FileText className={`w-4 h-4 ${level === 1 ? 'text-blue-600' : level === 2 ? 'text-green-600' : 'text-gray-600'}`} />;
    };

    // 見出しインデント
    const getHeadingIndent = (level: number) => {
        return `${(level - 1) * 16}px`;
    };

    // 見出しツリーレンダリング
    const renderHeadingTree = (items: Heading[], level: number = 1): React.ReactNode => {
        return items.map((heading) => (
            <div key={heading.id}>
                <div
                    className={`flex items-center gap-2 py-2 px-3 cursor-pointer rounded hover:bg-accent transition-colors ${selectedHeading?.id === heading.id ? 'bg-accent' : ''
                        }`}
                    style={{ paddingLeft: getHeadingIndent(level) }}
                    onClick={() => handleHeadingClick(heading)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            handleHeadingClick(heading);
                        }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`見出し: ${heading.text}`}
                >
                    {getHeadingIcon(heading.level)}
                    <span className="flex-1 truncate">{heading.text}</span>
                    {heading.children && heading.children.length > 0 && (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                </div>
                {heading.children && heading.children.length > 0 && (
                    <div className="border-l border-border ml-4">
                        {renderHeadingTree(heading.children, level + 1)}
                    </div>
                )}
            </div>
        ));
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent
                className="max-w-2xl max-h-[80vh]"
                onKeyDown={handleKeyDown}
                aria-label="内部リンクを挿入"
            >
                <DialogHeader>
                    <DialogTitle>内部リンクを挿入</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* 検索ボックス */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="見出しを検索..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                            aria-label="見出し検索"
                        />
                    </div>

                    {/* 見出しリスト */}
                    <div className="border rounded-md">
                        <ScrollArea className="h-64">
                            {filteredHeadings.length > 0 ? (
                                renderHeadingTree(filteredHeadings)
                            ) : (
                                <div className="flex items-center justify-center h-64 text-muted-foreground">
                                    見出しが見つかりません
                                </div>
                            )}
                        </ScrollArea>
                    </div>

                    {/* プレビュー */}
                    {selectedHeading && (
                        <div className="space-y-2">
                            <div className="text-sm font-medium">プレビュー</div>
                            <div className="p-3 bg-muted rounded-md">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-green-600" />
                                    <a
                                        href={previewUrl}
                                        className="text-green-600 hover:text-green-700 underline underline-dotted"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {previewText}
                                    </a>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    URL: {previewUrl}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleCancel}>
                        キャンセル
                    </Button>
                    <Button
                        onClick={handleInsert}
                        disabled={!selectedHeading}
                    >
                        挿入
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
