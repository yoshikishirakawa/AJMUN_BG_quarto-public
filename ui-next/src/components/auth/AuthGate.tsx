import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuthStore } from "@/store/useAuthStore";

export const AuthGate: React.FC = () => {
    const location = useLocation();
    const { session, isLoading } = useAuthStore();

    if (isLoading || session === null) {
        return (
            <div className="flex items-center justify-center h-screen bg-background text-foreground">
                Loading session...
            </div>
        );
    }

    if (!session.authenticated) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    return <Outlet />;
};


export const AdminGate: React.FC = () => {
    const { session, isLoading } = useAuthStore();

    if (isLoading || session === null) {
        return (
            <div className="flex items-center justify-center h-screen bg-background text-foreground">
                Loading session...
            </div>
        );
    }

    if (!session.authenticated) {
        return <Navigate to="/login" replace />;
    }

    if (session.role !== "admin") {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
};
