import { useState, useEffect, useCallback } from 'react';
import { BibliographyEntry } from './types';
import { BibliographyForm } from './BibliographyForm';
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, FileText, Loader2, Trash2 } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/components/ui/use-toast";

interface BibFile {
    name: string;
    path: string;
}

export const BibliographyPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [files, setFiles] = useState<BibFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [entries, setEntries] = useState<BibliographyEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Editor State
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editingEntry, setEditingEntry] = useState<BibliographyEntry | undefined>(undefined);

    const fetchContent = useCallback(async (filename: string) => {
        setIsLoading(true);
        try {
            const res = await apiClient.get(`/api/v1/bibliography/${filename}`);
            const data = res.data;

            let combinedEntries: BibliographyEntry[] = [];

            if (data.sections) {
                data.sections.forEach((sec: any) => {
                    if (sec.references) {
                        combinedEntries = [...combinedEntries, ...sec.references];
                    }
                });
            } else if (data.chapter) {
                combinedEntries = data.chapter || [];
            }

            setEntries(combinedEntries);
        } catch (e) {
            console.error("Failed to fetch content", e);
            toast({ variant: "destructive", title: t("error"), description: t("error_load_bib") });
        } finally {
            setIsLoading(false);
        }
    }, [t, toast]);

    const fetchFiles = useCallback(async () => {
        try {
            const res = await apiClient.get('/api/v1/bibliography/files');
            const data = res.data;
            if (Array.isArray(data)) {
                setFiles(data);
                if (data.length > 0) {
                    setSelectedFile(current => {
                        if (current) return current;
                        const ch01 = data.find((f: any) => f.name.includes('ch01'));
                        return ch01 ? ch01.name : data[0].name;
                    });
                }
            } else {
                console.error("Bibliography files API returned non-array:", data);
                setFiles([]);
            }
        } catch (e) {
            console.error("Failed to fetch bib files", e);
            setFiles([]);
        }
    }, []);

    useEffect(() => {
        fetchFiles();
    }, [fetchFiles]);

    useEffect(() => {
        if (selectedFile) {
            fetchContent(selectedFile);
        }
    }, [selectedFile, fetchContent]);

    const handleSaveEntry = async (entry: BibliographyEntry) => {
        if (!selectedFile) return;

        // Optimistic update logic or simple replace
        let newEntries = [...entries];
        const existingIndex = newEntries.findIndex(e => e.id === entry.id);

        if (existingIndex >= 0) {
            // Edit: Replace
            newEntries[existingIndex] = entry;
        } else {
            // Add: Append
            newEntries.push(entry);
        }

        // Construct payload strictly matching the expected YAML format
        // For `02_ch02.yml`, root key is `chapter`.
        const payload = { chapter: newEntries };

        try {
            await apiClient.post(`/api/v1/bibliography/${selectedFile}`, payload);

            setEntries(newEntries);
            setIsEditorOpen(false);
            setEditingEntry(undefined);
            toast({ title: t("saved"), description: t("saved_desc") });
        } catch {
            toast({ variant: "destructive", title: t("error"), description: t("error_save") });
        }
    };

    const handleDeleteEntry = async (id: string) => {
        if (!confirm(t("delete_confirm_title"))) return;

        const newEntries = entries.filter(e => e.id !== id);
        // Save immediately
        const payload = { chapter: newEntries };

        try {
            await apiClient.post(`/api/v1/bibliography/${selectedFile}`, payload);
            setEntries(newEntries);
            toast({ title: t("deleted"), description: t("deleted_desc") });
        } catch {
            toast({ variant: "destructive", title: t("error"), description: t("error_delete") });
        }
    };

    return (
        <div className="h-full flex flex-col p-6 space-y-4">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <FileText className="h-6 w-6" />
                    {t("bibliography_manager")}
                </h1>
                <div className="flex gap-2">
                    <Select value={selectedFile || ''} onValueChange={setSelectedFile}>
                        <SelectTrigger className="w-[250px]">
                            <SelectValue placeholder={t("select_chapter")} />
                        </SelectTrigger>
                        <SelectContent>
                            {files.map(f => (
                                <SelectItem key={f.name} value={f.name}>{f.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="flex-1 border rounded-md bg-card overflow-hidden flex flex-col">
                <div className="p-4 border-b flex justify-between bg-muted/20">
                    <h2 className="font-semibold text-lg flex items-center gap-2">
                        {selectedFile || t("no_file_selected")}
                        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </h2>
                    <Button onClick={() => { setEditingEntry(undefined); setIsEditorOpen(true); }} disabled={!selectedFile}>
                        <Plus className="h-4 w-4 mr-2" />
                        {t("add_reference_button")}
                    </Button>
                </div>

                <div className="flex-1 overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[150px]">{t("citation_key_header")}</TableHead>
                                <TableHead className="w-[100px]">{t("type")}</TableHead>
                                <TableHead>{t("title")}</TableHead>
                                <TableHead>{t("author")}</TableHead>
                                <TableHead className="w-[80px]">{t("year")}</TableHead>
                                <TableHead className="w-[100px]">{t("bibliography_actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {entries.map((entry) => (
                                <TableRow key={entry.id}>
                                    <TableCell className="font-mono text-xs">{entry.id}</TableCell>
                                    <TableCell className="capitalize badge">{entry.type}</TableCell>
                                    <TableCell className="font-medium">{entry.title}</TableCell>
                                    <TableCell>{entry.author}</TableCell>
                                    <TableCell>{entry.year}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <Button variant="ghost" size="sm" onClick={() => { setEditingEntry(entry); setIsEditorOpen(true); }}>
                                                <Edit className="h-3 w-3" />
                                            </Button>
                                            <Button variant="ghost" size="sm" onClick={() => handleDeleteEntry(entry.id || '')}>
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {entries.length === 0 && !isLoading && (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center h-24 text-muted-foreground">
                                        {t("no_references_found")}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <BibliographyForm
                        initialEntry={editingEntry}
                        onSave={handleSaveEntry}
                        onCancel={() => setIsEditorOpen(false)}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
};
