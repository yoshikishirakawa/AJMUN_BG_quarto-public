
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BookOpen, FileText, Calendar } from "lucide-react";
import { ProjectData } from "@/types";

interface OverviewCardProps {
    project: ProjectData;
}

import { useTranslation } from "@/lib/i18n";

export const OverviewCard: React.FC<OverviewCardProps> = ({ project }) => {
    const { t } = useTranslation();
    return (
        <Card className="col-span-2">
            <CardHeader>
                <CardTitle>{project.metadata.title || t("untitled_project")}</CardTitle>
                <CardDescription>
                    {t("authored_by")} {project.metadata.author || t("unknown")}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col items-center justify-center p-3 bg-muted/20 rounded-lg min-w-0">
                        <BookOpen className="h-6 w-6 mb-1 text-primary flex-shrink-0" />
                        <span className="text-xl font-bold">{project.chapters.length}</span>
                        <span className="text-[10px] text-muted-foreground text-center truncate w-full">{t("chapters")}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center p-3 bg-muted/20 rounded-lg min-w-0">
                        <FileText className="h-6 w-6 mb-1 text-primary flex-shrink-0" />
                        <span className="text-xl font-bold">{project.chapters.filter(c => !!c.googleDocId).length}</span>
                        <span className="text-[10px] text-muted-foreground text-center truncate w-full">{t("linked_chapters")}</span>
                    </div>
                    <div className="flex flex-col items-center justify-center p-3 bg-muted/20 rounded-lg min-w-0">
                        <Calendar className="h-6 w-6 mb-1 text-primary flex-shrink-0" />
                        <span className="text-xs font-semibold text-center truncate w-full">{project.metadata.date || "-"}</span>
                        <span className="text-[10px] text-muted-foreground text-center truncate w-full">{t("target_date")}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
