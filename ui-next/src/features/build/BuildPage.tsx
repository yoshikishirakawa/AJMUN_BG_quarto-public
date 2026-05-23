import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { LogViewer } from "./LogViewer";
import { PreviewDialog } from "./PreviewDialog";
import { Play, FileDown, Loader2, Trash2, CheckCircle, AlertCircle, Eye, Download, FolderOpen } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { buildApi, BuildOutputFile } from "@/lib/api";
import { useAuthStore } from "@/store/useAuthStore";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { getPreferredHtmlOutput, hasHtmlOutputs, hasPdfOutputs, sortBuildOutputs } from "./output-files";

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

export const BuildPage: React.FC = () => {
    const { t } = useTranslation();
    const { session } = useAuthStore();
    const isAdmin = session?.role === "admin";
    const [isBuilding, setIsBuilding] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [currentBuild, setCurrentBuild] = useState<BuildStatus | null>(null);
    const [outputs, setOutputs] = useState<BuildOutputFile[]>([]);
    const [buildFormat, setBuildFormat] = useState<string>("all");

    // Preview State
    const [previewFile, setPreviewFile] = useState<{ url: string, name: string, type: 'pdf' | 'html' } | null>(null);

    // Fetch outputs on mount
    useEffect(() => {
        fetchOutputs();
    }, []);

    const fetchOutputs = async () => {
        try {
            const response = await buildApi.getOutputs();
            setOutputs(response.data.outputs || []);
        } catch (e) {
            console.error("Failed to fetch outputs", e);
        }
    };

    const startBuild = async () => {
        if (!isAdmin) return;
        setIsBuilding(true);
        setLogs([]);
        setCurrentBuild(null);

        try {
            const res = await fetch('/api/v1/build/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'build', // Endpoint expects BuildRequest, but check if property is named format or type. 
                    // Checked BuildRequest model in python: format: BuildFormat = BuildFormat.ALL
                    format: buildFormat,
                    clean: false
                })
            });

            if (res.ok) {
                const status: BuildStatus = await res.json();
                setCurrentBuild(status);

                // Switch to polling
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

                    // Update logs
                    if (status.logs) {
                        setLogs(status.logs);
                    }

                    if (status.status === 'success' || status.status === 'completed' || status.status === 'failed') {
                        clearInterval(interval);
                        setIsBuilding(false);
                        setCurrentBuild(prev => prev ? { ...prev, status: status.status } : null);
                        fetchOutputs();
                    } else if (status.status === 'running' || status.status === 'building') {
                        // continue
                        setCurrentBuild(prev => prev ? { ...prev, status: 'running' } : {
                            id: 'current', status: 'running', format: 'unknown', progress: 0, current_step: t("building"), output_files: []
                        });
                    }
                }
            } catch (e) { // eslint-disable-line @typescript-eslint/no-unused-vars
                clearInterval(interval);
                setIsBuilding(false);
            }
        }, 1000);
    };

    const cleanOutputs = async () => {
        if (!isAdmin) return;
        try {
            await buildApi.deleteOutputs();
            // Refresh the outputs list
            fetchOutputs();
        } catch (error) {
            console.error('Failed to clean outputs:', error);
        }
    }

    const handlePreview = (file: BuildOutputFile) => {
        setPreviewFile({
            url: `/outputs/${file.path}`,
            name: file.name,
            type: file.type
        });
    };

    const handleDownload = (file: BuildOutputFile) => {
        // Create a download link and trigger it
        const link = document.createElement('a');
        link.href = `/outputs/${file.path}`;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleOpenInFinder = async (file: BuildOutputFile) => {
        if (!isAdmin) return;
        try {
            // Call backend API to open file in Finder
            const res = await fetch('/api/v1/build/open-in-finder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: file.path })
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({ detail: 'Unknown error' }));
                console.error('Failed to open in Finder:', error.detail);
            } else {
                const result = await res.json();
                console.log('Opened in Finder:', result.file);
            }
        } catch (e) {
            console.error('Failed to open in Finder:', e);
        }
    };

    const sortedOutputs = sortBuildOutputs(outputs);
    const availableHtml = hasHtmlOutputs(outputs);
    const availablePdf = hasPdfOutputs(outputs);
    const preferredHtml = getPreferredHtmlOutput(outputs);

    return (
        <div className="container mx-auto p-4 sm:p-6 h-full flex flex-col gap-4 sm:gap-6 min-h-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance truncate">{t("build_output")}</h1>
                    <p className="text-muted-foreground text-sm sm:text-base truncate">{t("build_desc")}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    <Button variant="outline" onClick={cleanOutputs} disabled={isBuilding || !isAdmin} size="sm">
                        <Trash2 className="h-4 w-4" />
                        <span className="hidden sm:inline ml-2">{t("clean_output")}</span>
                    </Button>
                    <Button onClick={startBuild} disabled={isBuilding || !isAdmin} size="sm">
                        {isBuilding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        <span className="hidden sm:inline ml-2">{isBuilding ? t("building") : t("start_build")}</span>
                    </Button>
                </div>
            </div>

            {!isAdmin && (
                <Card>
                    <CardContent className="pt-6 text-sm text-muted-foreground">
                        Build execution is limited to the host administrator. You can review existing outputs, but only the admin can start builds or clean artifacts.
                    </CardContent>
                </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
                {/* Left Column: Config & Status */}
                <div className="flex flex-col gap-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t("configuration")}</CardTitle>
                            <CardDescription>{t("build_settings")}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 p-2 border rounded-md">
                                <span className="text-sm font-medium">{t("output_format")}</span>
                                <Select value={buildFormat} onValueChange={setBuildFormat} disabled={isBuilding}>
                                    <SelectTrigger className="w-full sm:w-[180px]">
                                        <SelectValue placeholder="Select format" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">PDF & HTML (All)</SelectItem>
                                        <SelectItem value="pdf">PDF Only</SelectItem>
                                        <SelectItem value="html">HTML Only</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex justify-between items-center p-2 border rounded-md">
                                <span className="text-sm font-medium">{t("engine")}</span>
                                <Badge variant="outline">Quarto v1.4</Badge>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="flex-1 flex flex-col">
                        <CardHeader>
                            <CardTitle>{t("recent_outputs")}</CardTitle>
                            <CardDescription>{t("generated_files")}</CardDescription>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-hidden">
                            {!availableHtml && availablePdf && (
                                <div className="mb-3 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                                    HTML output is currently unavailable. This is normal after a PDF-only build. Run an HTML or all build to regenerate landing and chapter pages.
                                </div>
                            )}
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                {outputs.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">{t("no_outputs")}</div>}
                                {sortedOutputs
                                    .map((file, i) => {
                                        const isPdf = file.type === 'pdf';
                                        const isHtml = file.type === 'html';
                                        const isPreferredHtml = preferredHtml?.path === file.path;
                                        return (
                                            <div key={i} className="flex items-center justify-between gap-2 p-2 hover:bg-muted/50 rounded-md border text-sm group min-w-0">
                                                <div className="flex items-center gap-2 truncate min-w-0 flex-1">
                                                    <FileDown className={`h-4 w-4 flex-shrink-0 ${isPdf ? 'text-red-500' : isHtml ? 'text-blue-500' : 'text-gray-500'}`} />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate" title={file.name}>{file.name}</div>
                                                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                            {file.label && <span>{file.label}</span>}
                                                            {isPreferredHtml && <span>・default HTML</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    <span className="text-xs text-muted-foreground hidden sm:inline whitespace-nowrap">
                                                        {file.size > 0 ? `${(file.size / 1024).toFixed(1)} KB` : ''}
                                                    </span>
                                                    {(isPdf || isHtml) && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={() => handlePreview(file)}
                                                            title="プレビュー"
                                                        >
                                                            <Eye className="h-3.5 w-3.5" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={() => handleDownload(file)}
                                                        title="ダウンロード"
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        disabled={!isAdmin}
                                                        onClick={() => handleOpenInFinder(file)}
                                                        title="Finderで開く"
                                                    >
                                                        <FolderOpen className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Console */}
                <Card className="col-span-1 lg:col-span-2 flex flex-col h-full overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <div className="flex flex-col space-y-1.5">
                            <CardTitle>{t("build_console")}</CardTitle>
                            <CardDescription>{t("realtime_logs")}</CardDescription>
                        </div>
                        {currentBuild && (
                            <Badge
                                variant={
                                    currentBuild.status === 'completed' || currentBuild.status === 'success' ? 'default' :
                                        currentBuild.status === 'failed' ? 'destructive' : 'secondary'
                                }
                                className="capitalize"
                            >
                                {currentBuild.status === 'completed' || currentBuild.status === 'success' ? <CheckCircle className="mr-1 h-3 w-3" /> :
                                    currentBuild.status === 'failed' ? <AlertCircle className="mr-1 h-3 w-3" /> :
                                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                }
                                {t(`build_status_${currentBuild.status}` as any) || currentBuild.status}
                            </Badge>
                        )}
                    </CardHeader>
                    <Separator />
                    <CardContent className="flex-1 p-0 min-h-0">
                        <LogViewer logs={logs} className="h-full border-0 rounded-none bg-zinc-950" />
                    </CardContent>
                </Card>
            </div>

            <PreviewDialog
                open={!!previewFile}
                onOpenChange={(open) => !open && setPreviewFile(null)}
                url={previewFile?.url || null}
                filename={previewFile?.name || ''}
            />
        </div>
    );
};
