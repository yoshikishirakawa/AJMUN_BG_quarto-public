import { Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/app-sidebar";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
// import { Toaster } from "@/components/ui/toaster"; // Will add toast later

export function AppLayout() {
  return (
    <div className="h-dvh w-full bg-background overflow-hidden">
      <ResizablePanelGroup direction="horizontal" autoSaveId="ajmun-layout-persistence">
        <ResizablePanel
          defaultSize={20}
          minSize={10}
          maxSize={60}
          className="min-w-[50px]"
          id="sidebar-panel"
        >
          <AppSidebar />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={80} id="main-panel">
          <div className="h-full w-full overflow-hidden flex flex-col">
            {/* Header could go here */}
            <main className="flex-1 overflow-auto p-6">
              <Outlet />
            </main>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
      {/* <Toaster /> */}
    </div>
  );
}
