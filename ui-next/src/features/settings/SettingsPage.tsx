import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetadataEditor } from "@/features/project/MetadataEditor";
import { StyleSettings } from "./StyleSettings";
import { GeneralSettings } from "./GeneralSettings";
import { ConfigEditor } from "./ConfigEditor";
import { ColorSettings } from "./ColorSettings";
import { ChapterSettings } from "./ChapterSettings";
import { PDFSettings } from "./PDFSettings";
import { AdvancedPDFSettings } from "./AdvancedPDFSettings";
import { GoogleIntegrationSettings } from "./GoogleIntegrationSettings";
import { AccessSettings } from "./AccessSettings";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Code2, Palette, List, FileText, SlidersHorizontal, Key, Shield } from "lucide-react";

import { useEffect, useState } from "react";
import type { FC } from "react";
import { useTranslation } from "@/lib/i18n";
import { useSearchParams } from "react-router-dom";

export const SettingsPage: FC = () => {
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab = searchParams.get("tab") || "general";
    const [activeTab, setActiveTab] = useState(initialTab);

    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        setSearchParams({ tab });
    };

    const renderActiveTab = () => {
        switch (activeTab) {
            case "metadata":
                return <MetadataEditor />;
            case "pdf":
                return <PDFSettings />;
            case "pdf-advanced":
                return <AdvancedPDFSettings />;
            case "google":
                return <GoogleIntegrationSettings />;
            case "access":
                return <AccessSettings />;
            case "colors":
                return <ColorSettings />;
            case "chapters":
                return <ChapterSettings />;
            case "style":
                return <StyleSettings />;
            case "config":
                return <ConfigEditor />;
            case "general":
            default:
                return <GeneralSettings />;
        }
    };

    return (
        <div className="container mx-auto p-6 h-full flex flex-col gap-6 w-full max-w-4xl">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">{t("project_settings")}</h1>
                <p className="text-muted-foreground">{t("manage_metadata")}</p>
            </div>

            <Alert>
                <AlertTitle>{t("advanced_mode_title")}</AlertTitle>
                <AlertDescription>{t("advanced_mode_desc")}</AlertDescription>
            </Alert>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                <TabsList className="grid w-full grid-cols-10">
                    <TabsTrigger value="general">{t("general")}</TabsTrigger>
                    <TabsTrigger value="metadata">{t("metadata")}</TabsTrigger>
                    <TabsTrigger value="pdf" className="flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        <span>PDF</span>
                    </TabsTrigger>
                    <TabsTrigger value="pdf-advanced" className="flex items-center gap-1">
                        <SlidersHorizontal className="h-3 w-3" />
                        <span>詳細</span>
                    </TabsTrigger>
                    <TabsTrigger value="google" className="flex items-center gap-1">
                        <Key className="h-3 w-3" />
                        <span>{t("google_integration")}</span>
                    </TabsTrigger>
                    <TabsTrigger value="access" className="flex items-center gap-1">
                        <Shield className="h-3 w-3" />
                        <span>{t("access_control")}</span>
                    </TabsTrigger>
                    <TabsTrigger value="colors" className="flex items-center gap-1">
                        <Palette className="h-3 w-3" />
                        <span>カラー</span>
                    </TabsTrigger>
                    <TabsTrigger value="chapters" className="flex items-center gap-1">
                        <List className="h-3 w-3" />
                        <span>章構成</span>
                    </TabsTrigger>
                    <TabsTrigger value="style">{t("style_output")}</TabsTrigger>
                    <TabsTrigger value="config" className="flex items-center gap-1">
                        <Code2 className="h-3 w-3" />
                        <span>{t("developer")}</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value={activeTab} className="pt-4">
                    {renderActiveTab()}
                </TabsContent>
            </Tabs>
        </div >
    );
};
