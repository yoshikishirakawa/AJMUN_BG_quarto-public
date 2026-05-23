import React, { useMemo, useState, useCallback } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronDown, Search, Filter } from 'lucide-react';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';

interface OutlineItem {
    line: number;
    level: number;
    text: string;
    children?: OutlineItem[];
}

interface HeadingFilters {
    showH1: boolean;
    showH2: boolean;
    showH3: boolean;
    showH4Plus: boolean;
}

const DEFAULT_FILTERS: HeadingFilters = {
    showH1: true,
    showH2: true,
    showH3: true,
    showH4Plus: true,
};

export const EnhancedOutlineView: React.FC = () => {
    const { currentChapterContent } = useProjectStore();
    const { scrollToLine } = useUIStore();

    const [searchQuery, setSearchQuery] = useState('');
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [filters, setFilters] = useState<HeadingFilters>(DEFAULT_FILTERS);

    // Parse outline into hierarchical structure
    const outlineTree = useMemo(() => {
        if (!currentChapterContent) return [];

        const lines = currentChapterContent.split('\n');
        const items: OutlineItem[] = [];
        const stack: OutlineItem[] = [];

        const headerRegex = /^(#{1,6})\s+(.+)$/;

        lines.forEach((line, index) => {
            const match = line.match(headerRegex);
            if (match) {
                const level = match[1].length;
                const text = match[2].trim();
                const item: OutlineItem = {
                    line: index + 1,
                    level,
                    text,
                    children: []
                };

                // Pop items from stack until we find the parent
                while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                    stack.pop();
                }

                // Add to parent or root
                if (stack.length > 0) {
                    const parent = stack[stack.length - 1];
                    if (!parent.children) parent.children = [];
                    parent.children.push(item);
                } else {
                    items.push(item);
                }

                stack.push(item);
            }
        });

        return items;
    }, [currentChapterContent]);

    // Generate unique ID for outline items
    const getItemId = useCallback((item: OutlineItem, index: number) => {
        return `${item.line}-${item.level}-${index}`;
    }, []);

    // Filter outline based on search and heading level filters
    const filteredOutline = useMemo(() => {
        const filterItems = (items: OutlineItem[]): OutlineItem[] => {
            return items.reduce((acc: OutlineItem[], item) => {
                const matchesSearch = searchQuery === '' ||
                    item.text.toLowerCase().includes(searchQuery.toLowerCase());

                const matchesLevel = (item.level === 1 && filters.showH1) ||
                    (item.level === 2 && filters.showH2) ||
                    (item.level === 3 && filters.showH3) ||
                    (item.level >= 4 && filters.showH4Plus);

                const visible = matchesSearch && matchesLevel;

                // Process children even if item is hidden (they might match search)
                const filteredChildren = item.children ? filterItems(item.children) : [];

                // Include item if it matches, or if any of its children match
                if (visible || filteredChildren.length > 0) {
                    acc.push({
                        ...item,
                        children: filteredChildren.length > 0 ? filteredChildren : item.children
                    });
                }

                return acc;
            }, []);
        };

        return filterItems(outlineTree);
    }, [outlineTree, searchQuery, filters]);

    // Count visible items
    const visibleCount = useMemo(() => {
        const count = (items: OutlineItem[]): number => {
            return items.reduce((sum, item) => {
                return sum + 1 + (item.children ? count(item.children) : 0);
            }, 0);
        };
        return count(filteredOutline);
    }, [filteredOutline]);

    const toggleExpand = (itemId: string) => {
        setExpandedItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemId)) {
                newSet.delete(itemId);
            } else {
                newSet.add(itemId);
            }
            return newSet;
        });
    };

    const expandAll = () => {
        const collectAllIds = (items: OutlineItem[]): string[] => {
            const ids: string[] = [];
            items.forEach((item, index) => {
                const id = getItemId(item, index);
                if (item.children && item.children.length > 0) {
                    ids.push(id);
                    ids.push(...collectAllIds(item.children));
                }
            });
            return ids;
        };
        setExpandedItems(new Set(collectAllIds(filteredOutline)));
    };

    const collapseAll = () => {
        setExpandedItems(new Set());
    };

    const OutlineItemComponent: React.FC<{
        item: OutlineItem;
        index: number;
        depth?: number
    }> = ({ item, index, depth = 0 }) => {
        const itemId = getItemId(item, index);
        const isExpanded = expandedItems.has(itemId);
        const hasChildren = item.children && item.children.length > 0;

        return (
            <div>
                <button
                    onClick={() => {
                        scrollToLine(item.line);
                    }}
                    className={cn(
                        "flex items-center gap-1 text-left text-sm py-1 rounded hover:bg-muted transition-colors group w-full",
                        item.level === 1 && "font-semibold text-foreground",
                        item.level === 2 && "text-foreground pl-2",
                        item.level === 3 && "text-muted-foreground pl-4",
                        item.level >= 4 && "text-muted-foreground/70 text-xs pl-6"
                    )}
                    style={{ paddingLeft: `${depth * 12}px` }}
                >
                    {hasChildren && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleExpand(itemId);
                            }}
                            className="shrink-0 p-0.5 hover:bg-secondary rounded transition-colors"
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                            ) : (
                                <ChevronRight className="h-3 w-3" />
                            )}
                        </button>
                    )}
                    {!hasChildren && <span className="w-5" />}
                    <span className="truncate flex-1">{item.text}</span>
                    <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0">
                        {item.line}
                    </span>
                </button>
                {hasChildren && isExpanded && (
                    <div className="mt-0.5">
                        {item.children!.map((child, childIndex) => (
                            <OutlineItemComponent
                                key={`${itemId}-${childIndex}`}
                                item={child}
                                index={childIndex}
                                depth={0}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    if (!currentChapterContent) {
        return (
            <div className="flex flex-col h-full">
                <div className="p-3 border-b">
                    <div className="text-xs text-muted-foreground text-center">
                        チャプターを選択してください
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Search and Filter Header */}
            <div className="p-3 border-b space-y-2">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="見出しを検索..."
                        className="h-8 pl-8 text-xs"
                    />
                </div>

                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                        {visibleCount}件の見出し
                    </span>

                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={expandAll}
                        >
                            すべて展開
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={collapseAll}
                        >
                            すべて折りたたみ
                        </Button>

                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                >
                                    <Filter className="h-3.5 w-3.5" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48" align="end">
                                <div className="space-y-3">
                                    <div className="text-xs font-medium">フィルター</div>
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs">H1 見出し</label>
                                            <Switch
                                                checked={filters.showH1}
                                                onCheckedChange={(v) => setFilters(f => ({ ...f, showH1: v }))}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs">H2 見出し</label>
                                            <Switch
                                                checked={filters.showH2}
                                                onCheckedChange={(v) => setFilters(f => ({ ...f, showH2: v }))}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs">H3 見出し</label>
                                            <Switch
                                                checked={filters.showH3}
                                                onCheckedChange={(v) => setFilters(f => ({ ...f, showH3: v }))}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs">H4+ 見出し</label>
                                            <Switch
                                                checked={filters.showH4Plus}
                                                onCheckedChange={(v) => setFilters(f => ({ ...f, showH4Plus: v }))}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </div>

            {/* Outline Content */}
            <ScrollArea className="flex-1">
                {filteredOutline.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                        {searchQuery ? '一致する見出しがありません' : '見出しがありません'}
                    </div>
                ) : (
                    <div className="p-2 space-y-0.5">
                        {filteredOutline.map((item, index) => (
                            <OutlineItemComponent
                                key={index}
                                item={item}
                                index={index}
                            />
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
};
