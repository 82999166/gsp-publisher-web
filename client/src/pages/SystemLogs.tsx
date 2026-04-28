import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  RefreshCw,
  ScrollText,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Log = {
  id: number;
  level: string;
  category: string;
  title: string;
  message?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  duration?: number | null;
  createdAt: Date;
};

const LEVEL_CONFIG: Record<string, { label: string; icon: React.ReactNode; badge: string }> = {
  info: { label: "信息", icon: <Info className="h-3.5 w-3.5" />, badge: "bg-blue-50 text-blue-700 border-blue-200" },
  success: { label: "成功", icon: <CheckCircle2 className="h-3.5 w-3.5" />, badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  warn: { label: "警告", icon: <TriangleAlert className="h-3.5 w-3.5" />, badge: "bg-amber-50 text-amber-700 border-amber-200" },
  error: { label: "错误", icon: <AlertCircle className="h-3.5 w-3.5" />, badge: "bg-red-50 text-red-700 border-red-200" },
};

const CATEGORY_LABELS: Record<string, string> = {
  publish: "发布",
  generate: "AI生成",
  review: "素材审核",
  cookie: "Cookie验证",
  account: "账号管理",
  system: "系统",
  batch: "批量任务",
  indexing: "收录监控",
};

const PAGE_SIZE = 50;

export default function SystemLogs() {
  const utils = trpc.useUtils();
  const [category, setCategory] = useState<string>("all");
  const [level, setLevel] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const queryInput = {
    category: category !== "all" ? category : undefined,
    level: level !== "all" ? level : undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  };

  const { data: logs = [], isLoading, refetch } = trpc.logs.list.useQuery(queryInput);
  const { data: total = 0 } = trpc.logs.count.useQuery({
    category: category !== "all" ? category : undefined,
    level: level !== "all" ? level : undefined,
  });

  const clearMutation = trpc.logs.clear.useMutation({
    onSuccess: () => {
      utils.logs.list.invalidate();
      utils.logs.count.invalidate();
      toast.success("日志已清空");
    },
    onError: (e) => toast.error(e.message),
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  function handleFilter() {
    setPage(0);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">运行日志</h1>
          <p className="text-sm text-muted-foreground mt-1">记录平台所有操作的完整运行日志</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm("确认清空所有日志？此操作不可撤销。")) {
                clearMutation.mutate();
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            清空日志
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "总日志数", value: total, color: "text-foreground" },
          { label: "错误", value: (logs as Log[]).filter(l => l.level === "error").length, color: "text-red-600" },
          { label: "警告", value: (logs as Log[]).filter(l => l.level === "warn").length, color: "text-amber-600" },
          { label: "成功", value: (logs as Log[]).filter(l => l.level === "success").length, color: "text-emerald-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-border p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 bg-white rounded-xl border border-border p-4 shadow-sm">
        <span className="text-sm font-medium text-muted-foreground">筛选：</span>
        <Select value={category} onValueChange={v => { setCategory(v); handleFilter(); }}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="操作类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={level} onValueChange={v => { setLevel(v); handleFilter(); }}>
          <SelectTrigger className="w-28 h-8 text-sm">
            <SelectValue placeholder="日志级别" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部级别</SelectItem>
            <SelectItem value="info">信息</SelectItem>
            <SelectItem value="success">成功</SelectItem>
            <SelectItem value="warn">警告</SelectItem>
            <SelectItem value="error">错误</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">共 {total} 条记录</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">加载中...</div>
        ) : (logs as Log[]).length === 0 ? (
          <div className="p-12 text-center">
            <ScrollText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">暂无日志记录</p>
            <p className="text-xs text-muted-foreground mt-1">执行操作后日志将自动记录在此</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">时间</TableHead>
                <TableHead className="w-[70px]">级别</TableHead>
                <TableHead className="w-[80px]">类型</TableHead>
                <TableHead>操作标题</TableHead>
                <TableHead>详细信息</TableHead>
                <TableHead className="w-[100px]">关联对象</TableHead>
                <TableHead className="w-[80px]">耗时</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logs as Log[]).map((log) => {
                const levelCfg = LEVEL_CONFIG[log.level] ?? LEVEL_CONFIG.info;
                const isExpanded = expandedId === log.id;
                return (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  >
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {new Date(log.createdAt).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${levelCfg.badge}`}>
                        {levelCfg.icon}
                        {levelCfg.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-normal">
                        {CATEGORY_LABELS[log.category] ?? log.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm">{log.title}</TableCell>
                    <TableCell>
                      {log.message ? (
                        <div className={`text-xs text-muted-foreground ${isExpanded ? "" : "line-clamp-1 max-w-[300px]"}`}>
                          {log.message}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.entityType && log.entityId
                        ? `${log.entityType}#${log.entityId}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.duration != null ? `${log.duration}ms` : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            第 {page + 1} / {totalPages} 页，共 {total} 条
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
