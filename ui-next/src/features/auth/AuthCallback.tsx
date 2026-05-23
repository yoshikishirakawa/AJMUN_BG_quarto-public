import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { googleAuth } from "@/lib/api";
import { parseOAuthCallbackSearch } from "./authCallbackUtils";

export const AuthCallback: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [message, setMessage] = useState("Authenticating...");

    useEffect(() => {
        const { code, state, error } = parseOAuthCallbackSearch(location.search);

        if (error) {
            setMessage(`Authentication failed: ${error}`);
            return;
        }

        if (!code) {
            setMessage("Missing authorization code.");
            return;
        }

        if (!state) {
            setMessage("Missing OAuth state.");
            return;
        }

        const run = async () => {
            try {
                const redirectUri = `${window.location.origin}/auth/callback`;
                await googleAuth.exchangeToken(code, redirectUri, state);
                setMessage("Authentication complete. Redirecting...");
                setTimeout(() => navigate("/settings?tab=google"), 600);
            } catch (e) {
                console.error(e);
                setMessage("Authentication failed.");
            }
        };

        run();
    }, [location.search, navigate]);

    return (
        <div className="flex items-center justify-center h-screen bg-background text-foreground">
            <div className="text-sm text-muted-foreground">{message}</div>
        </div>
    );
};
