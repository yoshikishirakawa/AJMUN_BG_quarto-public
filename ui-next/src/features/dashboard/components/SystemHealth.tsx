
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";
import { apiClient } from "@/lib/api";

import { useTranslation } from "@/lib/i18n";

interface SystemStatus {
    quarto_installed: boolean;
    tex_installed: boolean;
    version: string;
    app_authenticated?: boolean;
    app_role?: string | null;
}

export const SystemHealth: React.FC = () => {
    const [status, setStatus] = useState<SystemStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const { t } = useTranslation();

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const [sysRes, authRes] = await Promise.all([
                    apiClient.get('/api/v1/system/status'),
                    apiClient.get('/api/v1/auth/session')
                ]);
                const auth = authRes.data;
                setStatus({
                    ...sysRes.data,
                    app_authenticated: auth.authenticated,
                    app_role: auth.role ?? null,
                });
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchStatus();
    }, []);

    const StatusItem = ({ label, ok, warning, url }: { label: string, ok: boolean, warning?: boolean, url?: string }) => (
        <div className="flex items-center justify-between text-sm py-2 border-b last:border-0">
            <span>{label}</span>
            {ok ? (
                <span className="flex items-center text-green-600"><CheckCircle2 className="w-4 h-4 mr-1" /> {t("ok")}</span>
            ) : warning ? (
                <span className="flex items-center text-yellow-600"><AlertTriangle className="w-4 h-4 mr-1" /> {t("warning")}</span>
            ) : (
                <div className="flex items-center gap-2">
                    <span className="flex items-center text-red-600"><AlertCircle className="w-4 h-4 mr-1" /> {t("missing")}</span>
                    {url && (
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline"
                        >
                            {t("download")}
                        </a>
                    )}
                </div>
            )}
        </div>
    );

    if (loading) return <Card className="opacity-50"><CardHeader><CardTitle>{t("system_health")}</CardTitle></CardHeader></Card>;

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("system_health")}</CardTitle>
            </CardHeader>
            <CardContent>
                <StatusItem label={t("quarto_cli")} ok={!!status?.quarto_installed} url="https://quarto.org/docs/get-started/" />
                <StatusItem label={t("tex_dist")} ok={!!status?.tex_installed} url="https://yihui.org/tinytex/" />

                <div className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                    <span>{t("google_account")}</span>
                    {status?.app_authenticated ? (
                        <span className="flex items-center text-green-600">
                            <CheckCircle2 className="w-4 h-4 mr-1" />
                            {status.app_role ?? t("connected")}
                        </span>
                    ) : (
                        <span className="flex items-center text-red-600"><AlertCircle className="w-4 h-4 mr-1" /> {t("disconnected")}</span>
                    )}
                </div>
                <div className="mt-4 text-xs text-muted-foreground text-center">
                    {t("api_version")}: {status?.version}
                </div>
            </CardContent>
        </Card>
    );
};
