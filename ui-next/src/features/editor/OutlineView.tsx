import React, { useMemo } from 'react';
import { useProjectStore } from '@/store/useProjectStore';
import { useUIStore } from '@/store/useUIStore';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTranslation } from '@/lib/i18n';

interface OutlineItem {
    line: number;
    level: number;
    text: string;
}

export const OutlineView: React.FC = () => {
    const { currentChapterContent } = useProjectStore();
    const { scrollToLine } = useUIStore();
    const { t } = useTranslation();

    const outline = useMemo(() => {
        if (!currentChapterContent) return [];

        const lines = currentChapterContent.split('\n');
        const items: OutlineItem[] = [];

        const headerRegex = /^(#{1,6})\s+(.+)$/;

        lines.forEach((line, index) => {
            const match = line.match(headerRegex);
            if (match) {
                items.push({
                    line: index + 1, // 1-based line number for user/editor
                    level: match[1].length,
                    text: match[2].trim()
                });
            }
        });

        return items;
    }, [currentChapterContent]);

    if (!currentChapterContent) {
        return (
            <div className="p-4 text-sm text-muted-foreground text-center">
                {t("no_content_for_outline")}
            </div>
        );
    }

    if (outline.length === 0) {
        return (
            <div className="p-4 text-sm text-muted-foreground text-center">
                {t("no_headers_found")}
            </div>
        );
    }

    return (
        <ScrollArea className="h-full">
            <div className="flex flex-col gap-1 p-2">
                {outline.map((item, i) => (
                    <button
                        key={i}
                        onClick={() => scrollToLine(item.line)}
                        className={cn(
                            "text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors truncate",
                            "text-muted-foreground hover:text-foreground",
                            item.level === 1 && "font-semibold text-foreground pl-2",
                            item.level === 2 && "pl-4",
                            item.level === 3 && "pl-6",
                            item.level >= 4 && "pl-8 text-xs"
                        )}
                        title={item.text}
                    >
                        {item.text}
                    </button>
                ))}
            </div>
        </ScrollArea>
    );
};
