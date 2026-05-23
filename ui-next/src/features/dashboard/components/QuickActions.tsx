
import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, ExternalLink, FileOutput, Image as ImageIcon } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { useTranslation } from "@/lib/i18n";
import { ImageGalleryModal } from "./ImageGalleryModal";
import { useProjectStore } from "@/store/useProjectStore";
import { buildApi, BuildOutputFile } from "@/lib/api";
import { getPreferredHtmlOutput, getPreferredPdfOutput, hasHtmlOutputs, hasPdfOutputs } from "@/features/build/output-files";

export const QuickActions: React.FC = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { project } = useProjectStore();
    const [isImageGalleryOpen, setIsImageGalleryOpen] = useState(false);
    const [outputs, setOutputs] = useState<BuildOutputFile[]>([]);

    useEffect(() => {
        const fetchOutputs = async () => {
            try {
                const response = await buildApi.getOutputs();
                setOutputs(response.data.outputs || []);
            } catch (error) {
                console.error("Failed to fetch outputs for dashboard quick actions", error);
            }
        };

        fetchOutputs();
        window.addEventListener("focus", fetchOutputs);
        return () => window.removeEventListener("focus", fetchOutputs);
    }, []);

    const preferredPdf = useMemo(() => getPreferredPdfOutput(outputs), [outputs]);
    const preferredHtml = useMemo(() => getPreferredHtmlOutput(outputs), [outputs]);
    const canOpenPdf = hasPdfOutputs(outputs) && preferredPdf !== null;
    const canOpenHtml = hasHtmlOutputs(outputs) && preferredHtml !== null;

    const handleOpenPDF = () => {
        if (!preferredPdf) return;
        window.open(`/outputs/${preferredPdf.path}`, '_blank', 'noopener,noreferrer');
    };

    const handleOpenHTML = () => {
        if (!preferredHtml) return;
        window.open(`/outputs/${preferredHtml.path}`, '_blank', 'noopener,noreferrer');
    };

    const chapters = project?.chapters || [];

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>{t("quick_actions")}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                    <Button
                        className="w-full justify-start"
                        variant="default"
                        onClick={() => navigate('/build')}
                    >
                        <Play className="mr-2 h-4 w-4" />
                        {t("go_to_build")}
                    </Button>
                    <Button
                        className="w-full justify-start"
                        variant="outline"
                        onClick={() => setIsImageGalleryOpen(true)}
                    >
                        <ImageIcon className="mr-2 h-4 w-4" />
                        画像ギャラリー
                    </Button>
                    <div className="flex flex-col gap-2 mt-2">
                        <Button variant="secondary" className="w-full justify-start text-xs" size="sm" onClick={handleOpenPDF} disabled={!canOpenPdf}>
                            <FileOutput className="mr-2 h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{t("open_pdf")}</span>
                        </Button>
                        <Button variant="secondary" className="w-full justify-start text-xs" size="sm" onClick={handleOpenHTML} disabled={!canOpenHtml}>
                            <ExternalLink className="mr-2 h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{t("open_html")}</span>
                        </Button>
                        {!canOpenHtml && canOpenPdf && (
                            <p className="text-[11px] text-muted-foreground px-1">
                                HTML output is currently unavailable. This is normal after a PDF-only build.
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            <ImageGalleryModal
                isOpen={isImageGalleryOpen}
                onClose={() => setIsImageGalleryOpen(false)}
                projectChapters={chapters}
            />
        </>
    );
};
