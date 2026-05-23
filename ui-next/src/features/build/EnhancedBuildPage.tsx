import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LogViewer } from "./LogViewer";
import { PreviewDialog } from "./PreviewDialog";
import {
    Play, FileDown, Loader2, Trash2, CheckCircle, AlertCircle,
    Eye, Download, History, RefreshCw, Clock, Settings,
    FileText, Globe
} from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { buildApi } from "@/lib/api";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

interface BuildStatus {
    id: string;
    status: "pending" | "running" | "completed" | "failed" | "success";
    format: string;
    progress: number;
    current_step: string;
    error?: string;
    output_files: string[];
    logs?: string[];
}

interface OutputFile {
    name: string;
    path: string;
    size: number;
    last_modified: number;
}

interface BuildHistoryItem {
    id: string;
    timestamp: number;
    format: string;
    status: string;
    duration: number;
    outputCount: number;
}

interface BuildConfig {
    format: 'all' | 'pdf' | 'html';
    clean: boolean;
    draftMode: boolean;
    toc: boolean;
    syntaxHighlighting: boolean;
}

export const EnhancedBuildPage: React.FC = () => {
    const { t } = useTranslation();
    const { toast } = useToast();

    // Build State
    const [isBuilding, setIsBuilding] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [currentBuild, setCurrentBuild] = useState<BuildStatus | null>(null);
    const [outputs, setOutputs] = useState<OutputFile[]>([]);
    const [buildHistory, setBuildHistory] = useState<BuildHistoryItem[]>([]);

    // Config State
    const [buildConfig, setBuildConfig] = useState<BuildConfig>({
        format: 'all',
        clean: false,
        draftMode: false,
        toc: true,
        syntaxHighlighting: true,
    });

    // Preview State
    const [previewFile, setPreviewFile] = useState<{ url: string, name: string, type: 'pdf' | 'html' } | null>(null);
    const [showConfigDialog, setShowConfigDialog] = useState(false);
    const [showHistoryDialog, setShowHistoryDialog] = useState(false);

    // Fetch outputs and history on mount
    useEffect(() => {
        fetchOutputs();
        fetchBuildHistory();
    }, []);

    const fetchOutputs = async () => {
        try {
            const res = await fetch('/api/v1/build/outputs');
            if (res.ok) {
                const data = await res.json();
                const rawFiles = data.files || [];
                const mappedFiles = rawFiles.map((f: string | OutputFile) => {
                    if (typeof f === 'string') {
                        return { name: f, path: f, size: 0, last_modified: 0 };
                    }
                    return f;
                });
                setOutputs(mappedFiles);
            }
        } catch (e) {
            console.error("Failed to fetch outputs", e);
        }
    };

    const fetchBuildHistory = async () => {
        try {
            const res = await fetch('/api/v1/build/history');
            if (res.ok) {
                const data = await res.json();
                setBuildHistory(data.history || []);
            }
        } catch (e) {
            console.error("Failed to fetch build history", e);
        }
    };

    const startBuild = async () => {
        setIsBuilding(true);
        setLogs([]);
        setCurrentBuild(null);

        try {
            const res = await fetch('/api/v1/build/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'build',
                    format: buildConfig.format,
                    clean: buildConfig.clean,
                    draft: buildConfig.draftMode,
                    toc: buildConfig.toc,
                    syntaxHighlighting: buildConfig.syntaxHighlighting,
                })
            });

            if (res.ok) {
                const status: BuildStatus = await res.json();
                setCurrentBuild(status);
                pollStatus();
            } else {
                setLogs(prev => [...prev, "Error: Failed to start build request."]);
                setIsBuilding(false);
            }
        } catch (e) {
            setLogs(prev => [...prev, `Error: ${e}`]);
            setIsBuilding(false);
        }
    };

    const pollStatus = async () => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch('/api/v1/build/status');
                if (res.ok) {
                    const status = await res.json();

                    if (status.logs) {
                        setLogs(status.logs);
                    }

                    if (status.status === 'success' || status.status === 'completed' || status.status === 'failed') {
                        clearInterval(interval);
                        setIsBuilding(false);
                        setCurrentBuild(prev => prev ? { ...prev, status: status.status } : null);
                        fetchOutputs();
                        fetchBuildHistory();
                    } else if (status.status === 'running' || status.status === 'building') {
                        setCurrentBuild(prev => prev ? { ...prev, status: 'running' } : {
                            id: 'current', status: 'running', format: 'unknown', progress: 0, current_step: t("building"), output_files: []
                        });
                    }
                }
            } catch {
                clearInterval(interval);
                setIsBuilding(false);
            }
        }, 1000);
    };

    const cleanOutputs = async () => {
        try {
            await buildApi.deleteOutputs();
            fetchOutputs();
            toast({
                title: "クリーン完了",
                description: "出力ファイルを削除しました",
            });
        } catch (error) {
            console.error('Failed to clean outputs:', error);
            toast({
                title: "エラー",
                description: "出力ファイルの削除に失敗しました",
                variant: "destructive",
            });
        }
    };

    const downloadAllOutputs = async () => {
        if (outputs.length === 0) return;

        try {
            const res = await fetch('/api/v1/build/download-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: outputs.map(o => o.name) }),
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `build-output-${Date.now()}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                toast({
                    title: "ダウンロード完了",
                    description: "すべての出力ファイルをダウンロードしました",
                });
            }
        } catch (e) {
            console.error('Download failed:', e);
            toast({
                title: "エラー",
                description: "ダウンロードに失敗しました",
                variant: "destructive",
            });
        }
    };

    const handlePreview = (file: OutputFile) => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        let type: 'pdf' | 'html' = 'html';
        if (ext === 'pdf') type = 'pdf';

        setPreviewFile({
            url: `/outputs/${file.path}`,
            name: file.name,
            type
        });
    };

    const handleDownload = (file: OutputFile) => {
        const a = document.createElement('a');
        a.href = `/outputs/${file.path}`;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatDuration = (ms: number): string => {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60000).toFixed(1)}m`;
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'completed':
            case 'success':
                return <CheckCircle className="h-4 w-4 text-green-500" />;
            case 'failed':
                return <AlertCircle className="h-4 w-4 text-destructive" />;
            case 'running':
            case 'building':
                return <Loader2 className="h-4 w-4 animate-spin" />;
            default:
                return <Clock className="h-4 w-4 text-muted-foreground" />;
        }
    };

    return (
        <div className="container mx-auto p-6 h-full flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{t("build_output")}</h1>
                    <p className="text-muted-foreground">{t("build_desc")}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowHistoryDialog(true)}
                    >
                        <History className="mr-2 h-4 w-4" />
                        履歴
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowConfigDialog(true)}
                    >
                        <Settings className="mr-2 h-4 w-4" />
                        設定
                    </Button>
                    <Button
                        variant="outline"
                        onClick={cleanOutputs}
                        disabled={isBuilding}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        クリーン
                    </Button>
                    <Button onClick={startBuild} disabled={isBuilding}>
                        {isBuilding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        {isBuilding ? "ビルド中..." : "ビルド開始"}
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                {/* Left Column: Config & Outputs */}
                <div className="flex flex-col gap-4">
                    {/* Build Config Summary */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">ビルド設定</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">フォーマット</span>
                                <Badge variant="secondary">
                                    {buildConfig.format === 'all' ? 'PDF + HTML' : buildConfig.format.toUpperCase()}
                                </Badge>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">クリーンビルド</span>
                                <Badge variant={buildConfig.clean ? "default" : "outline"}>
                                    {buildConfig.clean ? 'オン' : 'オフ'}
                                </Badge>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">目次</span>
                                <Badge variant={buildConfig.toc ? "default" : "outline"}>
                                    {buildConfig.toc ? 'オン' : 'オフ'}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Output Files */}
                    <Card className="flex-1 flex flex-col">
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-base">出力ファイル</CardTitle>
                                    <CardDescription className="text-xs">{outputs.length}件のファイル</CardDescription>
                                </div>
                                {outputs.length > 0 && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={downloadAllOutputs}
                                        title="すべてダウンロード"
                                    >
                                        <Download className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-auto">
                            {outputs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-32 text-center">
                                    <FileDown className="h-10 w-10 text-muted-foreground/50 mb-2" />
                                    <p className="text-sm text-muted-foreground">出力ファイルがありません</p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {outputs.map((file, i) => {
                                        const isPdf = file.name.toLowerCase().endsWith('.pdf');
                                        return (
                                            <div
                                                key={i}
                                                className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md border text-sm group"
                                            >
                                                <div className="flex items-center gap-2 truncate flex-1">
                                                    {isPdf ? (
                                                        <FileText className="h-4 w-4 text-red-500 shrink-0" />
                                                    ) : (
                                                        <Globe className="h-4 w-4 text-blue-500 shrink-0" />
                                                    )}
                                                    <span className="truncate" title={file.name}>{file.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-muted-foreground">
                                                        {file.size > 0 ? formatFileSize(file.size) : ''}
                                                    </span>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={() => handlePreview(file)}
                                                        title="プレビュー"
                                                    >
                                                        <Eye className="h-3 w-3" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7"
                                                        onClick={() => handleDownload(file)}
                                                        title="ダウンロード"
                                                    >
                                                        <Download className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Console */}
                <Card className="col-span-1 lg:col-span-2 flex flex-col h-full overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                        <div className="flex flex-col space-y-1">
                            <CardTitle className="text-base">ビルドコンソール</CardTitle>
                            <CardDescription className="text-xs">リアルタイムログ</CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={fetchOutputs}
                                disabled={isBuilding}
                            >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                更新
                            </Button>
                            {currentBuild && (
                                <Badge
                                    variant={
                                        currentBuild.status === 'completed' || currentBuild.status === 'success' ? 'default' :
                                            currentBuild.status === 'failed' ? 'destructive' : 'secondary'
                                    }
                                    className="capitalize"
                                >
                                    {getStatusIcon(currentBuild.status)}
                                    <span className="ml-1">
                                        {t(`build_status_${currentBuild.status}` as any) || currentBuild.status}
                                    </span>
                                </Badge>
                            )}
                        </div>
                    </CardHeader>
                    <Separator />
                    <CardContent className="flex-1 p-0 min-h-0">
                        <LogViewer logs={logs} className="h-full border-0 rounded-none bg-zinc-950" />
                    </CardContent>
                </Card>
            </div>

            {/* Config Dialog */}
            <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>ビルド設定</DialogTitle>
                        <DialogDescription>ビルドオプションを設定してください</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>出力フォーマット</Label>
                            <Select
                                value={buildConfig.format}
                                onValueChange={(v: any) => setBuildConfig({ ...buildConfig, format: v })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">PDF + HTML (すべて)</SelectItem>
                                    <SelectItem value="pdf">PDF のみ</SelectItem>
                                    <SelectItem value="html">HTML のみ</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>クリーンビルド</Label>
                                    <p className="text-xs text-muted-foreground">キャッシュをクリアしてビルド</p>
                                </div>
                                <Switch
                                    checked={buildConfig.clean}
                                    onCheckedChange={(v) => setBuildConfig({ ...buildConfig, clean: v })}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>ドラフトモード</Label>
                                    <p className="text-xs text-muted-foreground">未完成のマーカーを表示</p>
                                </div>
                                <Switch
                                    checked={buildConfig.draftMode}
                                    onCheckedChange={(v) => setBuildConfig({ ...buildConfig, draftMode: v })}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>目次を生成</Label>
                                    <p className="text-xs text-muted-foreground">自動目次生成を有効化</p>
                                </div>
                                <Switch
                                    checked={buildConfig.toc}
                                    onCheckedChange={(v) => setBuildConfig({ ...buildConfig, toc: v })}
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label>シンタックスハイライト</Label>
                                    <p className="text-xs text-muted-foreground">コードブロックのハイライト</p>
                                </div>
                                <Switch
                                    checked={buildConfig.syntaxHighlighting}
                                    onCheckedChange={(v) => setBuildConfig({ ...buildConfig, syntaxHighlighting: v })}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowConfigDialog(false)}>
                            キャンセル
                        </Button>
                        <Button onClick={() => setShowConfigDialog(false)}>
                            設定を保存
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Build History Dialog */}
            <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>ビルド履歴</DialogTitle>
                        <DialogDescription>過去のビルド履歴</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-96">
                        {buildHistory.length === 0 ? (
                            <div className="flex items-center justify-center h-32">
                                <p className="text-sm text-muted-foreground">ビルド履歴がありません</p>
                            </div>
                        ) : (
                            <div className="space-y-2 p-2">
                                {buildHistory.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                                        <div className="flex items-center gap-3">
                                            {getStatusIcon(item.status)}
                                            <div>
                                                <p className="text-sm font-medium">
                                                    {item.format.toUpperCase()} ビルド
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {new Date(item.timestamp).toLocaleString('ja-JP')}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className="text-xs text-muted-foreground">所要時間</p>
                                                <p className="text-sm font-medium">{formatDuration(item.duration)}</p>
                                            </div>
                                            <Badge variant="outline">{item.outputCount} ファイル</Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                    <DialogFooter>
                        <Button onClick={() => setShowHistoryDialog(false)}>閉じる</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Preview Dialog */}
            <PreviewDialog
                open={!!previewFile}
                onOpenChange={(open) => !open && setPreviewFile(null)}
                url={previewFile?.url || null}
                filename={previewFile?.name || ''}
            />
        </div>
    );
};
