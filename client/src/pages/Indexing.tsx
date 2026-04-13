import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type IndexRecord = {
  id: number;
  publishedUrl: string;
  keyword?: string | null;
  title?: string | null;
  indexStatus: string;
  lastCheckedAt?: Date | null;
  indexedAt?: Date | null;
  searchPosition?: number | null;
  searchVolume?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  createdAt?: Date | null;
};

const statusLabel: Record<string, string> = {
  pending: "待检测",
  indexed: "已收录",
  not_indexed: "未收录",
  checking: "检测中",
};

export default function Indexing() {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchKw, setSearchKw] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newKeyword, setNewKeyword] = useState("");

  const { data: records = [], isLoading } = trpc.indexing.list.useQuery(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );

  const addMutation = trpc.indexing.add.useMutation({
    onSuccess: () => {
      utils.indexing.list.invalidate();
      setAddDialogOpen(false);
      setNewUrl("");
      setNewKeyword("");
      toast.success("URL 已添加到监控列表");
    },
    onError: (e) => toast.error(e.message),
  });

  const checkMutation = trpc.indexing.check.useMutation({
    onSuccess: (data) => {
      utils.indexing.list.invalidate();
      toast.success(`检测完成：${statusLabel[data.indexStatus] ?? data.indexStatus}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const batchCheckMutation = trpc.indexing.batchCheck.useMutation({
    onSuccess: (data) => {
      utils.indexing.list.invalidate();
      toast.success(`批量检测完成，共 ${data.count} 条`);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.indexing.delete.useMutation({
    onSuccess: () => {
      utils.indexing.list.invalidate();
      toast.success("已删除");
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (records as IndexRecord[]).filter(r =>
    !searchKw || (r.publishedUrl.includes(searchKw) || (r.keyword ?? "").includes(searchKw))
  );

  const stats = {
    total: (records as IndexRecord[]).length,
    indexed: (records as IndexRecord[]).filter(r => r.indexStatus === "indexed").length,
    notIndexed: (records as IndexRecord[]).filter(r => r.indexStatus === "not_indexed").length,
    pending: (records as IndexRecord[]).filter(r => r.indexStatus === "pending").length,
  };

  const indexRate = stats.total > 0 ? Math.round((stats.indexed / stats.total) * 100) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">收录监控</h1>
          <p className="text-sm text-muted-foreground mt-1">监控 Google 收录状态，追踪 SEO 表现</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHelpOpen(true)}
            className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => batchCheckMutation.mutate({})}
            disabled={batchCheckMutation.isPending}
          >
            {batchCheckMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            批量检测
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            添加URL
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
          <p className="text-xs text-muted-foreground">收录率</p>
          <p className="text-2xl font-bold mt-1 tabular-nums text-primary">{indexRate}%</p>
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${indexRate}%` }} />
          </div>
        </div>
        {[
          { label: "监控总数", value: stats.total, color: "text-foreground" },
          { label: "已收录", value: stats.indexed, color: "text-emerald-600" },
          { label: "未收录", value: stats.notIndexed, color: "text-red-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-border p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="搜索 URL 或关键词..."
            value={searchKw}
            onChange={e => setSearchKw(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-28 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="pending">待检测</SelectItem>
            <SelectItem value="indexed">已收录</SelectItem>
            <SelectItem value="not_indexed">未收录</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Search className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">暂无监控记录</p>
            <p className="text-xs text-muted-foreground mt-1">添加发布后的 URL 开始监控收录状态</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>URL</th>
                <th>关键词</th>
                <th>收录状态</th>
                <th>搜索排名</th>
                <th>展示次数</th>
                <th>点击次数</th>
                <th>最后检测</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record: IndexRecord) => (
                <tr key={record.id}>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <a
                        href={record.publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline truncate max-w-[200px]"
                      >
                        {record.title ?? record.publishedUrl}
                      </a>
                      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{record.publishedUrl}</div>
                  </td>
                  <td className="text-sm text-muted-foreground">{record.keyword ?? "—"}</td>
                  <td>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                      record.indexStatus === "indexed"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : record.indexStatus === "not_indexed"
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : "bg-muted text-muted-foreground border border-border"
                    }`}>
                      {record.indexStatus === "indexed" ? <CheckCircle2 className="h-3 w-3" /> : record.indexStatus === "not_indexed" ? <XCircle className="h-3 w-3" /> : <Loader2 className="h-3 w-3" />}
                      {statusLabel[record.indexStatus] ?? record.indexStatus}
                    </span>
                  </td>
                  <td className="text-sm tabular-nums">
                    {record.searchPosition != null ? `#${record.searchPosition}` : "—"}
                  </td>
                  <td className="text-sm tabular-nums">{record.impressions ?? "—"}</td>
                  <td className="text-sm tabular-nums">{record.clicks ?? "—"}</td>
                  <td className="text-xs text-muted-foreground">
                    {record.lastCheckedAt
                      ? new Date(record.lastCheckedAt).toLocaleString("zh-CN")
                      : "未检测"}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => checkMutation.mutate({ id: record.id })}
                        disabled={checkMutation.isPending}
                      >
                        <RefreshCw className="h-3 w-3" />
                        检测
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("确认删除此监控记录？")) {
                            deleteMutation.mutate({ id: record.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>添加监控 URL</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">URL <span className="text-destructive">*</span></label>
              <Input
                placeholder="https://sites.google.com/..."
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">关键词</label>
              <Input
                placeholder="目标关键词（可选）"
                value={newKeyword}
                onChange={e => setNewKeyword(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>取消</Button>
            <Button
              onClick={() => {
                if (!newUrl.trim()) { toast.error("请输入 URL"); return; }
                addMutation.mutate({ url: newUrl.trim(), keyword: newKeyword || undefined });
              }}
              disabled={addMutation.isPending}
            >
              {addMutation.isPending ? "添加中..." : "添加"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>收录监控使用说明</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-3">
            <p><strong className="text-foreground">1. 自动添加：</strong>发布任务成功后，URL 自动加入监控列表，状态为「待检测」。</p>
            <p><strong className="text-foreground">2. 手动检测：</strong>点击「检测」按钮，系统通过 Google 搜索 site: 指令检测收录状态。</p>
            <p><strong className="text-foreground">3. 批量检测：</strong>点击「批量检测」一次性检测所有待检测的 URL。</p>
            <p><strong className="text-foreground">4. 搜索排名：</strong>记录关键词在 Google 搜索结果中的排名位置（需配置 Google Search Console API）。</p>
            <p><strong className="text-foreground">5. 收录率：</strong>已收录 URL 占总监控 URL 的比例，目标收录率 80% 以上为良好。</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
