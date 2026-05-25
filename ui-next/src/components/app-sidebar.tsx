import {
  Sidebar,
  LayoutDashboard,
  FileText,
  Settings,
  Moon,
  Sun,
  FileBox,
  Book
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTheme } from "@/components/theme-context";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "@/lib/i18n";
import { useProjectStore } from "@/store/useProjectStore";
import { useUIStore } from "@/store/useUIStore";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChapterList } from "@/features/project/ChapterList";
import { useAuthStore } from "@/store/useAuthStore";
import { isPublicDemoMode } from "@/lib/public-demo";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnhancedOutlineView } from "@/features/editor/EnhancedOutlineView";

export function AppSidebar() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { project } = useProjectStore();
  const { session, logout } = useAuthStore();
  const { sidebarTab, setSidebarTab } = useUIStore();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = session?.role === "admin";
  const isPublicEditingMode = session?.auth_bypass === true;
  const isPublicDemo = isPublicDemoMode();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  const editorPath = project?.chapters && project.chapters.length > 0
    ? `/editor/${project.chapters[0].id}`
    : "/editor";

  const navItems = [
    {
      title: t("dashboard"),
      icon: LayoutDashboard,
      path: "/",
    },
    {
      title: t("editor"),
      icon: FileText,
      path: editorPath,
    },
    {
      title: t("build"),
      icon: FileBox,
      path: "/build",
    },
    {
      title: t("bibliography"),
      icon: Book,
      path: "/bibliography",
    },
    ...(isAdmin ? [{
      title: t("settings"),
      icon: Settings,
      path: "/settings",
    }] : []),
  ];

  return (
    <div className="flex flex-col h-full border-r bg-card">
      <div className="flex items-center h-12 px-4 border-b gap-2 min-w-0">
        <Sidebar className="h-5 w-5 flex-shrink-0" />
        <span className="font-semibold truncate text-balance" title={project?.metadata?.title || t("app_name")}>
          {project?.metadata?.title || t("app_name")}
        </span>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as 'files' | 'outline')} className="h-full flex flex-col">
          <div className="px-4 py-2 border-b">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="files" className="text-xs">{t("files_tab")}</TabsTrigger>
              <TabsTrigger value="outline" className="text-xs">{t("outline")}</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="files" className="flex-1 overflow-hidden m-0 data-[state=inactive]:hidden flex flex-col">
            <ScrollArea className="flex-1 py-4">
              <nav className="grid gap-1 px-2">
                <TooltipProvider>
                  {navItems.map((item, index) => (
                    <Tooltip key={index}>
                      <TooltipTrigger asChild>
                        <NavLink
                          to={item.path}
                          className={({ isActive }) => cn(
                            "flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs sm:text-sm font-medium transition-all hover:text-primary whitespace-nowrap overflow-hidden w-full text-left min-w-0",
                            isActive || (item.path.startsWith("/editor") && location.pathname.startsWith("/editor"))
                              ? "bg-secondary text-primary"
                              : "text-muted-foreground"
                          )}
                        >
                          <item.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                          <span className="truncate flex-1 text-left">{item.title}</span>
                        </NavLink>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{item.title}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TooltipProvider>

                <div className="mt-6 px-3">
                  <h3 className="mb-2 px-1 text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                    {t("chapters")}
                  </h3>
                  <ChapterList />
                </div>
              </nav>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="outline" className="flex-1 overflow-hidden m-0 data-[state=inactive]:hidden">
            <EnhancedOutlineView />
          </TabsContent>
        </Tabs>
      </div>

      <div className="p-4 border-t">
        <div className="space-y-2">
          {isPublicDemo ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
              公開用デモ: 入力は一時的で、保存やビルドは行われません。
            </div>
          ) : isPublicEditingMode ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-100">
              Public editing mode is enabled. Anyone with access to this deployment can edit without signing in.
            </div>
          ) : null}
          <div className="px-2 text-xs text-muted-foreground truncate">
            {isPublicDemo ? "read-only public demo" : isPublicEditingMode ? "public editing mode" : session?.role === "admin" ? "admin" : "invited editor"}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 min-w-0"
            onClick={toggleTheme}
          >
            <span className="relative flex-shrink-0 w-4 h-4">
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 absolute top-0 left-0" />
              <Moon className="h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 absolute top-0 left-0" />
            </span>
            <span className="truncate">{t("toggle_theme")}</span>
          </Button>
          {!isPublicDemo ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 min-w-0"
              onClick={() => logout().then(() => navigate("/login"))}
            >
              <span className="truncate">Log out</span>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
