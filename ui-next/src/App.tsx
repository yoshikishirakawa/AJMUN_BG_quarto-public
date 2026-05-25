import React from 'react';
import { BrowserRouter, HashRouter, Outlet, Route, Routes, useParams } from "react-router-dom";

import { ThemeProvider } from "@/components/theme-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { useProjectStore } from "@/store/useProjectStore";
import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@/components/error-boundary";
import { AuthGate, AdminGate } from "@/components/auth/AuthGate";
import { useAuthStore } from "@/store/useAuthStore";
import { isPublicDemoMode } from "@/lib/public-demo";
import { PublicDemoBanner } from "@/components/public-demo-banner";
import { PublicDemoDashboardPage, PublicDemoBibliographyPage, PublicDemoBuildPage, PublicDemoSettingsPage } from "@/features/demo/PublicDemoPages";

const DashboardPage = React.lazy(() => import("@/features/dashboard/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const EditorPage = React.lazy(() => import("@/features/editor/EditorPage").then((module) => ({ default: module.EditorPage })));
const BibliographyPage = React.lazy(() => import("@/features/bibliography/BibliographyPage").then((module) => ({ default: module.BibliographyPage })));
const BuildPage = React.lazy(() => import("@/features/build/BuildPage").then((module) => ({ default: module.BuildPage })));
const SettingsPage = React.lazy(() => import("@/features/settings/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const LoginPage = React.lazy(() => import("@/features/auth/LoginPage").then((module) => ({ default: module.LoginPage })));
const InviteLoginPage = React.lazy(() => import("@/features/auth/InviteLoginPage").then((module) => ({ default: module.InviteLoginPage })));
const AuthCallback = React.lazy(() => import("@/features/auth/AuthCallback").then((module) => ({ default: module.AuthCallback })));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center h-screen bg-background text-foreground">
      Loading...
    </div>
  );
}

function LazyRoute({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense fallback={<RouteFallback />}>
      {children}
    </React.Suspense>
  );
}

function EditorPageWrapper() {
  const { chapterId } = useParams();
  return <EditorPage key={chapterId || "default"} />;
}

function ProtectedLayout() {
  const { fetchProject, isLoading, error, isLoaded } = useProjectStore();
  const { session } = useAuthStore();

  React.useEffect(() => {
    if (session?.authenticated && !isLoaded) {
      fetchProject();
    }
  }, [fetchProject, isLoaded, session?.authenticated]);

  if (!isLoaded && isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        Loading project...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-destructive">
        Error loading project: {error}
      </div>
    );
  }

  return (
    <>
      <AppSidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        {isPublicDemoMode() ? <PublicDemoBanner /> : null}
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </>
  );
}

function AppRouter() {
  const { fetchSession, isLoading } = useAuthStore();
  const isPublicDemo = isPublicDemoMode();

  React.useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground">
        Loading session...
      </div>
    );
  }

  const Router = isPublicDemo ? HashRouter : BrowserRouter;
  const DashboardRoute = isPublicDemo ? PublicDemoDashboardPage : DashboardPage;
  const BibliographyRoute = isPublicDemo ? PublicDemoBibliographyPage : BibliographyPage;
  const BuildRoute = isPublicDemo ? PublicDemoBuildPage : BuildPage;
  const SettingsRoute = isPublicDemo ? PublicDemoSettingsPage : SettingsPage;

  return (
    <Router>
      <Routes>
        {!isPublicDemo ? <Route path="/login" element={<LazyRoute><LoginPage /></LazyRoute>} /> : null}
        {!isPublicDemo ? <Route path="/invite" element={<LazyRoute><InviteLoginPage /></LazyRoute>} /> : null}
        {!isPublicDemo ? <Route path="/auth/callback" element={<LazyRoute><AuthCallback /></LazyRoute>} /> : null}

        <Route element={<AuthGate />}>
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={
              <ErrorBoundary>
                <LazyRoute><DashboardRoute /></LazyRoute>
              </ErrorBoundary>
            } />
            <Route path="/editor/:chapterId?" element={
              <ErrorBoundary>
                <LazyRoute><EditorPageWrapper /></LazyRoute>
              </ErrorBoundary>
            } />
            <Route path="/bibliography" element={
              <ErrorBoundary>
                <LazyRoute><BibliographyRoute /></LazyRoute>
              </ErrorBoundary>
            } />
            <Route path="/build" element={
              <ErrorBoundary>
                <LazyRoute><BuildRoute /></LazyRoute>
              </ErrorBoundary>
            } />
            <Route element={<AdminGate />}>
              <Route path="/settings" element={
                <ErrorBoundary>
                  <LazyRoute><SettingsRoute /></LazyRoute>
                </ErrorBoundary>
              } />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="ajmun-ui-theme">
      <div className="flex h-screen bg-background">
        <AppRouter />
        <Toaster />
      </div>
    </ThemeProvider>
  );
}

export default App;
