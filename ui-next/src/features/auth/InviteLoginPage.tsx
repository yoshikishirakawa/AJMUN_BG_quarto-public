import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/store/useAuthStore";

export const InviteLoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { inviteLogin, isLoading, error, session } = useAuthStore();
    const [token, setToken] = useState("");

    if (session?.authenticated) {
        return <Navigate to="/" replace />;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await inviteLogin(token);
            navigate("/");
        } catch {
            // handled in store
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Invite Login</CardTitle>
                    <CardDescription>Use the invite token issued by the project host.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTitle>Login failed</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="invite-token">Invite token</Label>
                            <Input
                                id="invite-token"
                                type="password"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                                placeholder="Paste invite token"
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading || !token}>
                            {isLoading ? "Signing in..." : "Sign in with invite"}
                        </Button>
                    </form>
                    <div className="text-sm text-muted-foreground">
                        Admin? <Link className="underline" to="/login">Use admin login</Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
