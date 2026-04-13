import { useAuth } from "@/_core/hooks/useAuth";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { Globe } from "lucide-react";
import { CSSProperties, useState } from "react";
import { useLocation } from "wouter";
import AppSidebar from "./AppSidebar";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

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

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950">
        <div className="flex flex-col items-center gap-8 p-10 max-w-sm w-full">
          {/* Logo */}
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shadow-lg shadow-indigo-500/10">
              <Globe className="h-8 w-8 text-indigo-400" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold text-white tracking-tight">GSP Publisher</h1>
              <p className="text-sm text-slate-400 mt-1">Google Sites 自动发布系统</p>
            </div>
          </div>

          <div className="w-full space-y-3">
            <p className="text-sm text-slate-400 text-center">
              请登录以访问管理后台
            </p>
            <Button
              onClick={() => { window.location.href = getLoginUrl(); }}
              size="lg"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/25 transition-all"
            >
              登录
            </Button>
          </div>
        </div>
      </div>
    );
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
