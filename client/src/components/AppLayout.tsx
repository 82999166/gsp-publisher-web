import { useAuth } from "@/_core/hooks/useAuth";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { CSSProperties, useEffect, useState } from "react";
import { useLocation } from "wouter";
import AppSidebar from "./AppSidebar";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const SIDEBAR_WIDTH_KEY = "gsp-sidebar-width";
const DEFAULT_WIDTH = 240;

const pageLabels: Record<string, string> = {
  "/": "仪表盘总览",
  "/accounts": "账号管理",
  "/ai-content": "AI内容生成",
  "/materials": "素材库管理",
  "/publish-tasks": "发布任务",
  "/hyperlinks": "超链接管理",
  "/indexing": "收录监控",
  "/settings": "系统设置",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth();
  const [location] = useLocation();
  const isMobile = useIsMobile();
  const [sidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });

  // Redirect to /login if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      window.location.replace("/login");
    }
  }, [loading, user]);

  if (loading || !user) {
    return <DashboardLayoutSkeleton />;
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <AppSidebar />
      <SidebarInset className="bg-background">
        {isMobile && (
          <div className="flex border-b h-14 items-center gap-3 bg-background/95 px-4 backdrop-blur sticky top-0 z-40">
            <SidebarTrigger className="h-8 w-8 rounded-lg" />
            <span className="text-sm font-semibold text-foreground">
              {pageLabels[location] ?? "GSP Publisher"}
            </span>
          </div>
        )}
        <main className="flex-1 min-h-screen">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
