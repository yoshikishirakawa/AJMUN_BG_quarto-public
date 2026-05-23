import React, { useCallback, useEffect, useState } from "react";

import { gdocApi, googleAuth, type GoogleAuthStatus } from "@/lib/api";
import { useProjectStore } from "@/store/useProjectStore";
import { useTranslation } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Link as LinkIcon, Search, Download, Upload } from "lucide-react";

interface DocInfo {
    id: string;
    name: string;
    modifiedTime?: string;
    thumbnailLink?: string;
    owners?: { displayName?: string; photoLink?: string }[];
}

interface DocsImportModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export const DocsImportModal: React.FC<DocsImportModalProps> = ({ open, onOpenChange }) => {
    const { t } = useTranslation();
    const { fetchProject } = useProjectStore();
    const [mode, setMode] = useState<"file" | "search" | "url">("file");
    const [query, setQuery] = useState("");
    const [urlInput, setUrlInput] = useState("");
    const [markdownTitle, setMarkdownTitle] = useState("");
    const [markdownFile, setMarkdownFile] = useState<File | null>(null);
    const [docs, setDocs] = useState<DocInfo[]>([]);
    const [googleStatus, setGoogleStatus] = useState<GoogleAuthStatus | null>(null);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const googleAvailable = !!googleStatus?.enabled && !!googleStatus?.configured && !!googleStatus?.authenticated;

    const loadGoogleStatus = useCallback(async () => {
        try {
            const res = await googleAuth.getStatus();
            setGoogleStatus(res.data);
        } catch {
            setGoogleStatus(null);
        }
    }, []);

    const loadDocs = useCallback(async (q: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await gdocApi.list(q);
            setDocs(res.data.files || []);
        } catch (e: any) {
            console.error(e);
            setError(e?.response?.data?.detail || t("import_failed"));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        if (open) {
            loadGoogleStatus();
            if (mode === "search" && googleAvailable) {
                loadDocs("");
            }
        }
        if (!open) {
            setMode("file");
            setQuery("");
            setUrlInput("");
            setMarkdownTitle("");
            setMarkdownFile(null);
            setDocs([]);
            setError(null);
            setImporting(null);
        }
    }, [open, mode, googleAvailable, loadGoogleStatus, loadDocs]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        await loadDocs(query);
    };

    const handleImport = async (doc: DocInfo) => {
        setImporting(doc.id);
        setError(null);
        try {
            await gdocApi.import(doc.id, doc.name);
            await fetchProject();
            onOpenChange(false);
        } catch (e: any) {
            console.error(e);
            setError(e?.response?.data?.detail || t("import_failed"));
            setImporting(null);
        }
    };

    const handleUrlImport = async (e: React.FormEvent) => {
        e.preventDefault();
        const match = urlInput.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
        if (!match) {
            setError(t("url_invalid"));
            return;
        }
        const docId = match[1];
        setImporting(docId);
        setError(null);
        try {
            await gdocApi.import(docId);
            await fetchProject();
            onOpenChange(false);
        } catch (e: any) {
            console.error(e);
            setError(e?.response?.data?.detail || t("import_failed"));
            setImporting(null);
        }
    };

    const handleMarkdownImport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!markdownFile) {
            setError("Markdown file is required.");
            return;
        }
        setImporting(markdownFile.name);
        setError(null);
        try {
            await gdocApi.importMarkdown(markdownFile, markdownTitle || undefined);
            await fetchProject();
            onOpenChange(false);
        } catch (e: any) {
            console.error(e);
            setError(e?.response?.data?.detail || t("import_failed"));
            setImporting(null);
        }
    };

    const formatDate = (isoString?: string) => {
        if (!isoString) return "";
        try {
            return new Date(isoString).toLocaleDateString();
        } catch {
            return isoString || "";
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{t("import_docs")}</DialogTitle>
                    <DialogDescription>{t("import_docs_desc")}</DialogDescription>
                </DialogHeader>

                {error && (
                    <Alert variant="destructive">
                        <AlertTitle>{t("error")}</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <Tabs value={mode} onValueChange={(v) => setMode(v as "file" | "search" | "url")}>
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="file" className="flex items-center gap-2">
                            <Upload className="h-4 w-4" />
                            Markdown
                        </TabsTrigger>
                        <TabsTrigger value="search" className="flex items-center gap-2" disabled={!googleAvailable}>
                            <Search className="h-4 w-4" />
                            {t("search_docs")}
                        </TabsTrigger>
                        <TabsTrigger value="url" className="flex items-center gap-2" disabled={!googleAvailable}>
                            <LinkIcon className="h-4 w-4" />
                            {t("import_by_url")}
                        </TabsTrigger>
                    </TabsList>

                    {!googleAvailable && (
                        <Alert className="mt-4">
                            <AlertTitle>{t("google_integration")}</AlertTitle>
                            <AlertDescription>{t("google_link_required")}</AlertDescription>
                        </Alert>
                    )}

                    <TabsContent value="file" className="mt-4 space-y-4">
                        <form onSubmit={handleMarkdownImport} className="space-y-3">
                            <Input
                                value={markdownTitle}
                                onChange={(e) => setMarkdownTitle(e.target.value)}
                                placeholder="Optional chapter title"
                            />
                            <Input
                                type="file"
                                accept=".md,.markdown,.qmd,text/markdown"
                                onChange={(e) => setMarkdownFile(e.target.files?.[0] || null)}
                            />
                            <div className="flex justify-end">
                                <Button type="submit" disabled={!!importing || !markdownFile}>
                                    {importing ? t("loading") : "Import Markdown"}
                                </Button>
                            </div>
                        </form>
                    </TabsContent>

                    <TabsContent value="search" className="mt-4 space-y-4">
                        <form onSubmit={handleSearch} className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder={t("docs_search_placeholder")}
                                    className="pl-9"
                                />
                            </div>
                            <Button type="submit" disabled={loading || !googleAvailable}>
                                {t("search_docs")}
                            </Button>
                        </form>

                        <ScrollArea className="h-[360px] border rounded-md">
                            <div className="p-3 space-y-2">
                                {loading && (
                                    <div className="text-sm text-muted-foreground">{t("loading")}</div>
                                )}
                                {!loading && docs.length === 0 && (
                                    <div className="text-sm text-muted-foreground">{t("no_docs_found")}</div>
                                )}
                                {docs.map((doc) => (
                                    <div
                                        key={doc.id}
                                        className="flex items-center gap-3 p-2 rounded-md border hover:bg-muted/40"
                                    >
                                        <div className="h-9 w-9 rounded bg-muted flex items-center justify-center">
                                            <FileText className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{doc.name}</div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                {formatDate(doc.modifiedTime)}
                                                {doc.owners?.[0]?.displayName ? ` • ${doc.owners[0].displayName}` : ""}
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            disabled={!!importing}
                                            onClick={() => handleImport(doc)}
                                        >
                                            {importing === doc.id ? t("loading") : (
                                                <>
                                                    <Download className="h-4 w-4 mr-1" />
                                                    {t("import")}
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </TabsContent>

                    <TabsContent value="url" className="mt-4 space-y-4">
                        <form onSubmit={handleUrlImport} className="space-y-3">
                            <Input
                                value={urlInput}
                                onChange={(e) => setUrlInput(e.target.value)}
                                placeholder={t("docs_url_placeholder")}
                            />
                            <div className="flex justify-end">
                                <Button type="submit" disabled={!!importing || !googleAvailable}>
                                    {importing ? t("loading") : t("import")}
                                </Button>
                            </div>
                        </form>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
};
