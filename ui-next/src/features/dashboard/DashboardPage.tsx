
import React from 'react';
import { useProjectStore } from "@/store/useProjectStore";
import { OverviewCard } from "./components/OverviewCard";
import { QuickActions } from "./components/QuickActions";
import { StatusCard } from "./components/StatusCard";
import { SystemHealth } from "./components/SystemHealth";
import { ProjectMetrics } from "./components/ProjectMetrics";
import { ActivityLog } from "./components/ActivityLog";
import { ErrorBoundary } from "@/components/error-boundary";
import { useTranslation } from "@/lib/i18n";

export const DashboardPage: React.FC = () => {
    const { t } = useTranslation();
    const { project } = useProjectStore();

    if (!project) return <div>{t("loading")}</div>;

    return (
        <div className="p-8 h-full overflow-y-auto">
            <h1 className="text-3xl font-bold mb-8">{t("dashboard")}</h1>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Top Row: Overview & Actions */}
                <ErrorBoundary>
                    <OverviewCard project={project} />
                </ErrorBoundary>
                <ErrorBoundary>
                    <QuickActions />
                </ErrorBoundary>
                <ErrorBoundary>
                    <StatusCard
                        // @ts-ignore - types need update in frontend ProjectData definition
                        lastBuildStatus={project.lastBuildStatus}
                        // @ts-ignore
                        lastBuildTime={project.lastBuildTime}
                        // @ts-ignore
                        lastSyncTime={project.lastSyncTime}
                    />
                </ErrorBoundary>

                {/* Second Row: Detailed Stats & Health */}
                {/* ProjectMetrics already has internal ErrorBoundary, but double wrapping is safe */}
                <ProjectMetrics />

                <div className="col-span-1 lg:col-span-2 grid gap-6">
                    <ErrorBoundary>
                        <SystemHealth />
                    </ErrorBoundary>
                    <ErrorBoundary>
                        <ActivityLog />
                    </ErrorBoundary>
                </div>
            </div>
        </div>
    );
};
