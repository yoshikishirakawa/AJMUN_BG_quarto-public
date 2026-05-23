import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { History, FileEdit, Upload, PlayCircle } from "lucide-react";
import { apiClient } from "@/lib/api";

interface LogEntry {
    id: number;
    type: string;
    msg: string;
    time: string;
}

import { useTranslation } from "@/lib/i18n";

export const ActivityLog: React.FC = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const { t } = useTranslation();

    useEffect(() => {
        const fetchLogs = () => {
            apiClient.get('/system/activity')
                .then(res => setLogs(res.data))
                .catch(console.error);
        };
        fetchLogs();
        // Poll every 10s or just once? Once is fine for dashboard load.
    }, []);

    const getIcon = (type: string) => {
        switch (type) {
            case 'edit': return <FileEdit className="w-4 h-4" />;
            case 'sync': return <Upload className="w-4 h-4" />;
            case 'build': return <PlayCircle className="w-4 h-4" />;
            default: return <History className="w-4 h-4" />;
        }
    };

    const formatTime = (timeStr: string) => {
        try {
            return new Date(timeStr).toLocaleString();
        } catch {
            return timeStr;
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("recent_activity")}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <ScrollArea className="h-[200px]">
                    <div className="space-y-1 p-4">
                        {(!logs || logs.length === 0) && <div className="text-sm text-muted-foreground text-center">{t("no_recent_activity")}</div>}
                        {Array.isArray(logs) && logs.map(log => (
                            <div key={log.id} className="flex items-start gap-3 text-sm pb-3 border-b last:border-0 last:pb-0 border-muted/50">
                                <div className="mt-0.5 text-muted-foreground">
                                    {getIcon(log.type)}
                                </div>
                                <div className="flex-1">
                                    <div className="font-medium">{log.msg}</div>
                                    <div className="text-xs text-muted-foreground">{formatTime(log.time)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
};
