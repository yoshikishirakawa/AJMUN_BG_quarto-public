import React, { useEffect, useRef } from 'react';

import { cn } from "@/lib/utils";

interface LogViewerProps {
    logs: string[];
    className?: string;
    autoScroll?: boolean;
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs, className, autoScroll = true }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (autoScroll && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, autoScroll]);

    return (
        <div className={cn("bg-zinc-950 text-zinc-300 font-mono text-xs rounded-md border border-border h-full overflow-hidden flex flex-col shadow-inner divide-y divide-zinc-800/30", className)}>
            <div ref={scrollRef} className="flex-1 overflow-y-scroll scrollbar-console p-4 space-y-0.5">
                {logs.length === 0 && (
                    <span className="text-muted-foreground italic select-none block">Waiting for logs...</span>
                )}
                {logs.map((log, i) => {
                    const lower = log.toLowerCase();
                    let colorClass = "text-zinc-300";
                    if (lower.includes("error") || lower.includes("failed")) {
                        colorClass = "text-red-400 font-bold bg-red-950/20";
                    } else if (lower.includes("warn") || lower.includes("warning")) {
                        colorClass = "text-yellow-400 bg-yellow-950/10";
                    } else if (lower.includes("info") || lower.includes("executing") || lower.includes("rendering")) {
                        colorClass = "text-blue-400";
                    } else if (lower.includes("completed") || lower.includes("success")) {
                        colorClass = "text-green-400 font-bold";
                    }

                    return (
                        <div key={i} className={cn("whitespace-pre-wrap break-all py-0.5 px-2 hover:bg-zinc-900/50 transition-colors rounded-sm", colorClass)}>
                            {log}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
