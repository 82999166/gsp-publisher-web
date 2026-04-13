import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  BarChart3,
  BookOpen,
  Globe,
  Image,
  Layout,
  Link2,
  LogOut,
  PanelLeft,
  Search,
  Settings,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { useLocation } from "wouter";

const menuGroups = [
  {
    label: "概览",
    items: [
      { icon: BarChart3, label: "仪表盘总览", path: "/" },
    ],
  },
  {
    label: "账号与内容",
    items: [
      { icon: Users, label: "账号管理", path: "/accounts" },
      { icon: Sparkles, label: "AI内容生成", path: "/ai-content" },
      { icon: Image, label: "素材库管理", path: "/materials" },
    ],
  },
  {
    label: "发布与链接",
    items: [
      { icon: Zap, label: "发布任务", path: "/publish-tasks" },
      { icon: Link2, label: "超链接管理", path: "/hyperlinks" },
    ],
  },
  {
    label: "监控与配置",
    items: [
      { icon: Search, label: "收录监控", path: "/indexing" },
      { icon: Settings, label: "系统设置", path: "/settings" },
    ],
  },
];

export default function AppSidebar() {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      {/* Header */}
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border/50">
        <div className="flex items-center gap-3 px-2 w-full">
          <button
            onClick={toggleSidebar}
            className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none shrink-0"
            aria-label="Toggle navigation"
          >
            <PanelLeft className="h-4 w-4 text-sidebar-foreground/60" />
          </button>
          {!isCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-sidebar-primary/20 flex items-center justify-center shrink-0">
                <Globe className="h-4 w-4 text-sidebar-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-sidebar-foreground truncate leading-none">
                  GSP Publisher
                </p>
                <p className="text-[10px] text-sidebar-foreground/50 mt-0.5 truncate">
                  Google Sites 发布系统
                </p>
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* Navigation */}
      <SidebarContent className="gap-0 py-2">
        {menuGroups.map((group) => (
          <div key={group.label} className="mb-1">
            {!isCollapsed && (
              <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/35 select-none">
                {group.label}
              </p>
            )}
            <SidebarMenu className="px-2">
              {group.items.map((item) => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-9 transition-all rounded-lg ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-primary font-semibold"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                      }`}
                    >
                      <item.icon
                        className={`h-4 w-4 shrink-0 ${isActive ? "text-sidebar-primary" : ""}`}
                      />
                      <span className="text-sm">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </div>
        ))}
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="p-3 border-t border-sidebar-border/50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent/60 transition-colors w-full text-left focus:outline-none">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="text-xs font-semibold bg-sidebar-primary/20 text-sidebar-primary">
                  {user?.name?.charAt(0).toUpperCase() || "G"}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-sidebar-foreground truncate leading-none">
                    {user?.name || "管理员"}
                  </p>
                  <p className="text-[10px] text-sidebar-foreground/50 truncate mt-0.5">
                    个人版
                  </p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-48">
            <DropdownMenuItem
              onClick={logout}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>退出登录</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
