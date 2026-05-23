import React, { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/store/useAuthStore";

export const AccessSettings: React.FC = () => {
    const {
        invites,
        error,
        fetchInvites,
        createInvite,
        revokeInvite,
        revokeAllInvites,
    } = useAuthStore();
    const [label, setLabel] = useState("");
    const [issuedToken, setIssuedToken] = useState<string | null>(null);

    useEffect(() => {
        fetchInvites();
    }, [fetchInvites]);

    const handleCreate = async () => {
        const token = await createInvite(label || undefined);
        if (token) {
            setIssuedToken(token);
            setLabel("");
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Access Control</CardTitle>
                    <CardDescription>Issue and revoke long-lived invite tokens for editors.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {error && (
                        <Alert variant="destructive">
                            <AlertTitle>Access error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {issuedToken && (
                        <Alert>
                            <AlertTitle>New invite token</AlertTitle>
                            <AlertDescription className="break-all font-mono text-xs">
                                {issuedToken}
                            </AlertDescription>
                        </Alert>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="invite-label">Invite label</Label>
                        <div className="flex gap-2">
                            <Input
                                id="invite-label"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                placeholder="Committee editor"
                            />
                            <Button onClick={handleCreate}>Create invite</Button>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button variant="outline" onClick={() => revokeAllInvites()}>
                            Revoke all active invites
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Issued Invites</CardTitle>
                    <CardDescription>Invite tokens are stored as hashes and cannot be re-shown after creation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    {invites.length === 0 && (
                        <div className="text-sm text-muted-foreground">No invites issued yet.</div>
                    )}
                    {invites.map((invite) => (
                        <div key={invite.id} className="rounded-md border p-3 flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <div className="font-medium truncate">{invite.label || invite.id}</div>
                                <div className="text-xs text-muted-foreground">
                                    {invite.active ? "Active" : "Revoked"} • Created {new Date(invite.createdAt).toLocaleString()}
                                    {invite.lastUsedAt ? ` • Last used ${new Date(invite.lastUsedAt).toLocaleString()}` : ""}
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!invite.active}
                                onClick={() => revokeInvite(invite.id)}
                            >
                                Revoke
                            </Button>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
};
