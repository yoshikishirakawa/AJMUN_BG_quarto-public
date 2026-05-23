import React, { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/store/useAuthStore";

export const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const { adminLogin, isLoading, error, session } = useAuthStore();
    const [secret, setSecret] = useState("");

    if (session?.authenticated) {
        return <Navigate to="/" replace />;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await adminLogin(secret);
            navigate("/");
        } catch {
            // handled in store
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>Admin Login</CardTitle>
                    <CardDescription>Sign in with the admin secret from your environment configuration.</CardDescription>
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
                            <Label htmlFor="admin-secret">Admin secret</Label>
                            <Input
                                id="admin-secret"
                                type="password"
                                value={secret}
                                onChange={(e) => setSecret(e.target.value)}
                                placeholder="Enter ADMIN_SECRET"
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading || !secret}>
                            {isLoading ? "Signing in..." : "Sign in as admin"}
                        </Button>
                    </form>
                    <div className="text-sm text-muted-foreground">
                        Invited editor? <Link className="underline" to="/invite">Use invite token login</Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
