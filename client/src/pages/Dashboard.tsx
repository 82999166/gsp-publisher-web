import { trpc } from "@/lib/trpc";
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Globe,
  Layers,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { useLocation } from "wouter";
import { OAuthStatusCard } from "@/components/OAuthStatusCard";
import { useAuth } from "@/_core/hooks/useAuth";

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-border p-5 shadow-sm hover:shadow-md transition-all duration-200 ${onClick ? "cursor-pointer hover:-translate-y-0.5" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-bold text-foreground mt-2 tabular-nums">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
        </div>
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function ActivityItem({ label, time, status }: { label: string; time: string; status: string }) {
  const statusMap: Record<string, string> = {
    success: "badge-success",
    failed: "badge-failed",
    running: "badge-running",
    pending: "badge-pending",
    indexed: "badge-indexed",
    not_indexed: "badge-not_indexed",
  };
  const labelMap: Record<string, string> = {
    success: "成功",
    failed: "失败",
    running: "运行中",
    pending: "等待",
    indexed: "已收录",
    not_indexed: "未收录",
  };
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-2 w-2 rounded-full bg-primary/60 shrink-0" />
        <span className="text-sm text-foreground truncate">{label}</span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={statusMap[status] ?? "badge-unknown"}>{labelMap[status] ?? status}</span>
        <span className="text-xs text-muted-foreground">{time}</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { data: stats, isLoading } = trpc.dashboard.stats.useQuery();
  const { user } = useAuth();

  const statCards = [
    {
      icon: Users,
      label: "账号总数",
      value: stats?.accountCount ?? 0,
      sub: "已配置 Google 账号",
      color: "bg-blue-50 text-blue-600",
      path: "/accounts",
    },
    {
      icon: Zap,
      label: "今日发布",
      value: stats?.todayPublished ?? 0,
      sub: "今日成功发布页面",
      color: "bg-emerald-50 text-emerald-600",
      path: "/publish-tasks",
    },
    {
      icon: BookOpen,
      label: "素材总数",
      value: stats?.materialCount ?? 0,
      sub: "已生成内容素材",
      color: "bg-purple-50 text-purple-600",
      path: "/materials",
    },
    {
      icon: Globe,
      label: "累计发布",
      value: stats?.totalPublished ?? 0,
      sub: "历史发布成功总数",
      color: "bg-indigo-50 text-indigo-600",
      path: "/publish-tasks",
    },
    {
      icon: Clock,
      label: "待执行任务",
      value: stats?.pendingTasks ?? 0,
      sub: "等待执行的发布任务",
      color: "bg-orange-50 text-orange-600",
      path: "/publish-tasks",
    },
    {
      icon: Layers,
      label: "批量任务",
      value: stats?.totalPublished ?? 0,
      sub: "累计发布成功总数",
      color: "bg-amber-50 text-amber-600",
      path: "/published-pages",
    },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">仪表盘总览</h1>
          <p className="text-sm text-muted-foreground mt-1">谷歌协作发布系统运行状态</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
          <span className="h-2 w-2 rounded-full bg-emerald-500 pulse-dot" />
          <span className="text-xs font-medium text-emerald-700">系统运行中</span>
        </div>
      </div>

      {/* Stats Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-border p-5 h-28 animate-pulse">
              <div className="h-3 w-20 bg-muted rounded mb-3" />
              <div className="h-8 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {statCards.map((card) => (
            <StatCard
              key={card.label}
              icon={card.icon}
              label={card.label}
              value={card.value}
              sub={card.sub}
              color={card.color}
              onClick={() => setLocation(card.path)}
            />
          ))}
        </div>
      )}

      {/* OAuth Status Alert */}
      {stats?.oauthStatus && stats.oauthStatus.length > 0 && (
        <OAuthStatusCard items={stats.oauthStatus} />
      )}

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            快速入口
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "添加账号", path: "/accounts", icon: Users, color: "bg-blue-50 hover:bg-blue-100 text-blue-700" },
              { label: "生成内容", path: "/ai-content", icon: BarChart3, color: "bg-purple-50 hover:bg-purple-100 text-purple-700" },
              { label: "新建任务", path: "/publish-tasks", icon: Zap, color: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700" },
              { label: "批量生成", path: "/batch-generation", icon: Layers, color: "bg-amber-50 hover:bg-amber-100 text-amber-700" },
            ].map((item) => (
              <button
                key={item.label}
                onClick={() => setLocation(item.path)}
                className={`flex items-center gap-2.5 p-3 rounded-lg transition-colors text-sm font-medium ${item.color}`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* System Status */}
        <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            系统状态
          </h2>
          <div className="space-y-3">
            {[
              { label: "数据库连接", status: "正常", ok: true },
              { label: "AI 内容生成", status: "就绪", ok: true },
              { label: "发布引擎", status: "待配置", ok: false },
              { label: "Google Sites 发布", status: "就绪", ok: true },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                <span className="text-sm text-foreground">{item.label}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  item.ok
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-amber-50 text-amber-700 border border-amber-200"
                }`}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
