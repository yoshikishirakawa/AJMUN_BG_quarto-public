
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock } from "lucide-react";

interface StatusCardProps {
    lastBuildStatus?: 'success' | 'failure' | null;
    lastBuildTime?: string;
    lastSyncTime?: string;
}

import { useTranslation } from "@/lib/i18n";

export const StatusCard: React.FC<StatusCardProps> = ({ lastBuildStatus, lastBuildTime, lastSyncTime }) => {
    const { t } = useTranslation();
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("recent_status")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium flex-shrink-0">{t("last_build")}</span>
                    <div className="flex items-center min-w-0">
                        {lastBuildStatus === 'success' && (
                            <Badge variant="default" className="bg-green-600 text-[10px] px-2 py-0.5">
                                <CheckCircle2 className="w-3 h-3 mr-1 flex-shrink-0" />
                                <span className="truncate">{t("success")}</span>
                            </Badge>
                        )}
                        {lastBuildStatus === 'failure' && (
                            <Badge variant="destructive" className="text-[10px] px-2 py-0.5">
                                <XCircle className="w-3 h-3 mr-1 flex-shrink-0" />
                                <span className="truncate">{t("failed")}</span>
                            </Badge>
                        )}
                        {!lastBuildStatus && (
                            <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                                <span className="truncate">{t("unknown_status")}</span>
                            </Badge>
                        )}
                    </div>
                </div>
                {lastBuildTime && (
                    <div className="text-[10px] text-muted-foreground text-right">
                        {new Date(lastBuildTime).toLocaleString()}
                    </div>
                )}
                <div className="flex items-center justify-between gap-2 border-t pt-3">
                    <span className="text-xs font-medium flex-shrink-0">{t("last_sync")}</span>
                    <div className="flex items-center min-w-0">
                        <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                            <Clock className="w-3 h-3 mr-1 flex-shrink-0" />
                            <span className="truncate">{t("checked")}</span>
                        </Badge>
                    </div>
                </div>
                {lastSyncTime && (
                    <div className="text-[10px] text-muted-foreground text-right">
                        {new Date(lastSyncTime).toLocaleString()}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
