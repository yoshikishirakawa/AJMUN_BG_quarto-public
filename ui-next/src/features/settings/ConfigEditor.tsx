import React, { useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, Save, RefreshCw } from "lucide-react";
import { MarkdownEditor } from "@/features/editor/MarkdownEditor";
import { project } from '@/lib/api';

export const ConfigEditor: React.FC = () => {
    const [config, setConfig] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isUnavailable, setIsUnavailable] = useState(false);

    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        setIsLoading(true);
        setError(null);
        setIsUnavailable(false);
        try {
            const res = await project.getRawConfig();
            setConfig(res.data.content);
        } catch (e: any) {
            const detail = e?.response?.data?.detail;
            if (e?.response?.status === 403 || e?.response?.status === 404) {
                setIsUnavailable(true);
                setError(detail || "Raw configuration editor is unavailable.");
            } else {
                setError(detail || e.message || "Failed to load config");
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setError(null);
        try {
            await project.updateRawConfig(config);
            // Optionally reload to ensure sync?
        } catch (e: any) {
            setError(e?.response?.data?.detail || e.message || "Failed to save config");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Advanced Configuration</AlertTitle>
                <AlertDescription>
                    You are editing the raw Quarto configuration file (_quarto.yml).
                    Invalid YAML syntax or incorrect keys may break the build process.
                    Changes here might be overwritten by the "Style" settings if you use them afterwards.
                </AlertDescription>
            </Alert>

            {error && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <Card className="h-[600px] flex flex-col">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <div className="flex flex-col space-y-1.5">
                        <CardTitle>_quarto.yml</CardTitle>
                        <CardDescription>Raw configuration editor</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={fetchConfig} disabled={isLoading || isSaving}>
                            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                            Reload
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={isLoading || isSaving || isUnavailable}>
                            <Save className="h-4 w-4 mr-1" />
                            {isSaving ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="flex-1 p-0 overflow-hidden">
                    <MarkdownEditor
                        initialValue={config}
                        onChange={setConfig}
                        className="h-full border-t"
                    />
                </CardContent>
            </Card>
        </div>
    );
};
