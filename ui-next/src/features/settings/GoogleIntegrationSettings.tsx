import React, { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { googleAuth, type GoogleAuthStatus } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

export const GoogleIntegrationSettings: React.FC = () => {
    const { t } = useTranslation();
    const [status, setStatus] = useState<GoogleAuthStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refreshStatus = useCallback(async () => {
        setLoading(true);
        try {
            const res = await googleAuth.getStatus();
            setStatus(res.data);
        } catch (e) {
            console.error(e);
            setError(t("error"));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        refreshStatus();
    }, [refreshStatus]);

    const handleLogin = async () => {
        if (!status?.configured) {
            setError(t("credential_missing"));
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const redirectUri = `${window.location.origin}/auth/callback`;
            const res = await googleAuth.login(redirectUri);
            if (res.data?.auth_url) {
                window.location.href = res.data.auth_url;
            } else {
                setError(t("error"));
            }
        } catch (e) {
            console.error(e);
            setError(t("error"));
        } finally {
            setBusy(false);
        }
    };

    const handleLogout = async () => {
        setBusy(true);
        setError(null);
        try {
            await googleAuth.logout();
            await refreshStatus();
        } catch (e) {
            console.error(e);
            setError(t("error"));
        } finally {
            setBusy(false);
        }
    };

    const handleUpload = async (file: File | null) => {
        if (!file) return;
        setBusy(true);
        setError(null);
        try {
            await googleAuth.uploadCredentials(file);
            await refreshStatus();
        } catch (e: any) {
            console.error(e);
            setError(e?.response?.data?.detail || t("error"));
        } finally {
            setBusy(false);
        }
    };

    const statusLabel = status?.authenticated
        ? t("connected")
        : status?.configured
            ? t("configured_not_logged_in")
            : t("credential_missing");

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("google_integration")}</CardTitle>
                <CardDescription>{t("google_integration_desc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {error && (
                    <Alert variant="destructive">
                        <AlertTitle>{t("error")}</AlertTitle>
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {!status?.enabled && (
                    <Alert>
                        <AlertTitle>{t("google_integration")}</AlertTitle>
                        <AlertDescription>{t("google_optional_disabled")}</AlertDescription>
                    </Alert>
                )}

                <div className="flex items-center justify-between rounded-md border p-4">
                    <div className="space-y-1">
                        <div className="text-sm text-muted-foreground">{t("google_account")}</div>
                        <div className="text-sm font-medium">{statusLabel}</div>
                        {status?.authenticated && (
                            <div className="text-xs text-muted-foreground">
                                {status.name} {status.email ? `(${status.email})` : ""}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {status?.authenticated ? (
                            <Button variant="outline" onClick={handleLogout} disabled={busy || loading}>
                                {t("logout_google")}
                            </Button>
                        ) : (
                            <Button onClick={handleLogin} disabled={busy || loading || !status?.configured || !status?.enabled}>
                                {t("login_google")}
                            </Button>
                        )}
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="text-sm font-medium">{t("upload_credentials")}</div>
                    <Input
                        type="file"
                        accept=".json"
                        onChange={(e) => handleUpload(e.target.files?.[0] || null)}
                        disabled={busy || loading || !status?.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                        {t("upload_credentials_help")}
                    </p>
                </div>

                <div className="text-xs text-muted-foreground">
                    {loading ? t("loading") : null}
                </div>
            </CardContent>
        </Card>
    );
};
