
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiClient } from "@/lib/api";
import { ErrorBoundary } from "@/components/error-boundary";

interface ProjectStats {
    total_words: number;
    chapters: { id: string, title: string, words: number }[];
}

interface SystemStats {
    assets_size_mb: number;
    assets_count: number;
}

import { useTranslation } from "@/lib/i18n";

export const ProjectMetrics: React.FC = () => {
    const [stats, setStats] = useState<ProjectStats | null>(null);
    const [sysStats, setSysStats] = useState<SystemStats | null>(null);
    const [loading, setLoading] = useState(true);
    const { t } = useTranslation();

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [statsRes, sysStatsRes] = await Promise.all([
                    apiClient.get('/api/v1/project/stats'),
                    apiClient.get('/api/v1/system/stats')
                ]);
                setStats(statsRes.data);
                setSysStats(sysStatsRes.data);
            } catch (error) {
                console.error('Failed to fetch project metrics:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    if (loading) {
        return (
            <Card className="col-span-2">
                <CardHeader>
                    <CardTitle>{t("project_metrics")}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-muted-foreground">{t("loading")}</div>
                </CardContent>
            </Card>
        );
    }

    if (!stats || !sysStats) {
        return (
            <Card className="col-span-2">
                <CardHeader>
                    <CardTitle>{t("project_metrics")}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="text-muted-foreground">データを取得できませんでした</div>
                </CardContent>
            </Card>
        );
    }

    // Simple Bar Chart Visualization (using divs)
    const chapters = stats.chapters || [];
    const maxWords = chapters.length > 0 ? Math.max(...chapters.map(c => c.words), 1) : 1;

    return (
        <ErrorBoundary>
            <Card className="col-span-2 flex flex-col">
                <CardHeader className="flex-shrink-0">
                    <CardTitle>{t("project_metrics")}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col min-h-0">
                    <div className="grid grid-cols-2 gap-8 mb-6">
                        <div>
                            <div className="text-sm font-medium text-muted-foreground mb-1">{t("total_words")}</div>
                            <div className="text-3xl font-bold">{(stats.total_words || 0).toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground">{chapters.length} 章</div>
                        </div>
                        <div>
                            <div className="text-sm font-medium text-muted-foreground mb-1">{t("total_assets_size")}</div>
                            <div className="text-3xl font-bold">{sysStats.assets_size_mb || 0} MB</div>
                            <div className="text-xs text-muted-foreground">{sysStats.assets_count || 0} {t("files")}</div>
                        </div>
                    </div>

                    <div className="flex flex-col flex-1 min-h-0">
                        <h4 className="text-sm font-semibold mb-2">{t("word_count_by_chapter")}</h4>
                        <ScrollArea className="flex-1">
                            <div className="space-y-3 pr-4">
                                {chapters.map((ch, index) => (
                                    <div key={ch.id} className="flex items-center gap-3 text-sm">
                                        <div className="w-6 text-xs text-muted-foreground text-right">{index + 1}.</div>
                                        <div className="w-40 truncate" title={ch.title || t("untitled_chapter")}>
                                            {ch.title || t("untitled_chapter")}
                                        </div>
                                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary transition-all"
                                                style={{ width: `${((ch.words || 0) / maxWords) * 100}%` }}
                                            />
                                        </div>
                                        <div className="w-16 text-right text-xs text-muted-foreground">
                                            {(ch.words || 0).toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                </CardContent>
            </Card>
        </ErrorBoundary>
    );
};
