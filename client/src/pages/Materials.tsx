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
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Eye,
  FileText,
  HelpCircle,
  Loader2,
  Search,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Material = {
  id: number;
  title: string;
  keyword?: string | null;
  language: string;
  content: string;
  wordCount?: number | null;
  qualityScore?: number | null;
  similarityScore?: number | null;
  status: string;
  createdAt?: Date | null;
};

const statusLabel: Record<string, string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
  published: "已发布",
};

const langLabel: Record<string, string> = {
  "zh-CN": "简体中文",
  "en": "英文",
  "zh-TW": "繁体中文",
};

function QualityBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-7 text-right">{score}</span>
    </div>
  );
}

function SimilarityBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  if (pct >= 70) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-red-50 text-red-600 border-red-200">
        <AlertTriangle className="h-2.5 w-2.5" />
        {pct}% 疑似重复
      </span>
    );
  }
  if (pct >= 40) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-yellow-50 text-yellow-600 border-yellow-200">
        {pct}% 相似
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border bg-green-50 text-green-600 border-green-200">
      <ShieldCheck className="h-2.5 w-2.5" />
      {pct}% 原创
    </span>
  );
}

function HelpTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>素材库管理使用说明</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-3">
            <p><strong className="text-foreground">1. 素材来源：</strong>AI内容生成后自动保存到素材库，状态为「待审核」。</p>
            <p><strong className="text-foreground">2. 审核流程：</strong>点击「预览」查看文章内容，确认质量后点击「通过」，或「拒绝」不合格内容。</p>
            <p><strong className="text-foreground">3. 质量评分：</strong>0-100分，80分以上为优质内容，60分以下建议重新生成。</p>
            <p><strong className="text-foreground">4. 去重检测：</strong>点击 <ShieldCheck className="h-3.5 w-3.5 inline" /> 图标对单篇文章进行去重检测，或选中多篇后批量检测。相似度超过 70% 的内容标记为「疑似重复」。</p>
            <p><strong className="text-foreground">5. 发布准备：</strong>只有「已通过」状态的素材才能被发布任务使用。</p>
            <p><strong className="text-foreground">6. 批量操作：</strong>支持批量通过、批量拒绝、批量删除和批量去重检测。</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Materials() {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchKw, setSearchKw] = useState("");
  const [previewMaterial, setPreviewMaterial] = useState<Material | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [checkingId, setCheckingId] = useState<number | null>(null);

  const { data: materials = [], isLoading } = trpc.materials.list.useQuery(
    statusFilter !== "all" ? { status: statusFilter } : undefined
  );

  const updateStatusMutation = trpc.materials.updateStatus.useMutation({
    onSuccess: () => {
      utils.materials.list.invalidate();
      toast.success("状态已更新");
    },
    onError: (e) => toast.error(e.message),
  });

  const batchUpdateMutation = trpc.materials.batchUpdateStatus.useMutation({
    onSuccess: (data) => {
      utils.materials.list.invalidate();
      setSelectedIds([]);
      toast.success(`已批量更新 ${data.count} 条素材`);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.materials.delete.useMutation({
    onSuccess: () => {
      utils.materials.list.invalidate();
      toast.success("素材已删除");
    },
    onError: (e) => toast.error(e.message),
  });

  const batchDeleteMutation = trpc.materials.batchDelete.useMutation({
    onSuccess: () => {
      utils.materials.list.invalidate();
      setSelectedIds([]);
      toast.success("批量删除完成");
    },
    onError: (e) => toast.error(e.message),
  });

  const checkDuplicateMutation = trpc.materials.checkDuplicate.useMutation({
    onSuccess: (data) => {
      utils.materials.list.invalidate();
      const pct = Math.round(data.similarityScore * 100);
      if (data.isDuplicate) {
        toast.warning(`疑似重复内容（相似度 ${pct}%）：${data.reason}`);
      } else {
        toast.success(`内容原创度良好（相似度 ${pct}%）：${data.reason}`);
      }
    },
    onError: (e) => toast.error(`去重检测失败：${e.message}`),
  });

  const batchCheckDuplicateMutation = trpc.materials.batchCheckDuplicate.useMutation({
    onSuccess: (data) => {
      utils.materials.list.invalidate();
      setSelectedIds([]);
      toast.success(`批量去重检测完成：${data.checked}/${data.total} 篇，发现 ${data.duplicates} 篇疑似重复`);
    },
    onError: (e) => toast.error(e.message),
  });

  const filtered = (materials as Material[]).filter((m) =>
    !searchKw || (m.keyword ?? "").includes(searchKw) || m.title.includes(searchKw)
  );

  function toggleSelect(id: number) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((m) => m.id));
    }
  }

  function handleCheckDuplicate(m: Material) {
    setCheckingId(m.id);
    checkDuplicateMutation.mutate(
      { id: m.id, title: m.title, content: m.content },
      { onSettled: () => setCheckingId(null) }
    );
  }

  const duplicateCount = filtered.filter(m => (m.similarityScore ?? 0) >= 0.7).length;
  const checkedCount = filtered.filter(m => m.similarityScore != null).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">素材库管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理 AI 生成的文章内容，支持审核和去重检测</p>
        </div>
        <div className="flex items-center gap-2">
          <HelpTooltip />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "全部素材", value: (materials as Material[]).length, color: "text-foreground" },
          { label: "待审核", value: (materials as Material[]).filter(m => m.status === "pending").length, color: "text-amber-600" },
          { label: "已通过", value: (materials as Material[]).filter(m => m.status === "approved").length, color: "text-emerald-600" },
          { label: "已发布", value: (materials as Material[]).filter(m => m.status === "published").length, color: "text-blue-600" },
          { label: "疑似重复", value: duplicateCount, color: "text-red-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-border p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="搜索关键词或标题..."
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
            <SelectItem value="pending">待审核</SelectItem>
            <SelectItem value="approved">已通过</SelectItem>
            <SelectItem value="rejected">已拒绝</SelectItem>
            <SelectItem value="published">已发布</SelectItem>
          </SelectContent>
        </Select>
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">已选 {selectedIds.length} 条</span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              onClick={() => batchUpdateMutation.mutate({ ids: selectedIds, status: "approved" })}
              disabled={batchUpdateMutation.isPending}
            >
              <CheckCircle2 className="h-3 w-3" />
              批量通过
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 text-blue-700 border-blue-200 hover:bg-blue-50"
              onClick={() => batchCheckDuplicateMutation.mutate({ ids: selectedIds })}
              disabled={batchCheckDuplicateMutation.isPending}
            >
              {batchCheckDuplicateMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ShieldCheck className="h-3 w-3" />
              )}
              批量去重检测
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1 text-red-700 border-red-200 hover:bg-red-50"
              onClick={() => {
                if (confirm(`确认批量删除 ${selectedIds.length} 条素材？`)) {
                  batchDeleteMutation.mutate({ ids: selectedIds });
                }
              }}
              disabled={batchDeleteMutation.isPending}
            >
              <Trash2 className="h-3 w-3" />
              批量删除
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">加载中...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">暂无素材</p>
            <p className="text-xs text-muted-foreground mt-1">前往「AI内容生成」生成文章</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filtered.length && filtered.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                  />
                </TableHead>
                <TableHead>标题</TableHead>
                <TableHead>关键词</TableHead>
                <TableHead>语言</TableHead>
                <TableHead>字数</TableHead>
                <TableHead>质量分</TableHead>
                <TableHead>去重检测</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>创建时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(m.id)}
                      onChange={() => toggleSelect(m.id)}
                      className="rounded"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-foreground text-sm truncate max-w-[200px]">{m.title}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{m.keyword ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{langLabel[m.language] ?? m.language}</TableCell>
                  <TableCell className="text-sm tabular-nums">{m.wordCount ?? "—"}</TableCell>
                  <TableCell className="w-28">
                    {m.qualityScore != null ? <QualityBar score={m.qualityScore} /> : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="w-32">
                    {m.similarityScore != null ? (
                      <SimilarityBadge score={m.similarityScore} />
                    ) : (
                      <span className="text-xs text-muted-foreground">未检测</span>
                    )}
                  </TableCell>
                  <TableCell><span className={`badge-${m.status}`}>{statusLabel[m.status] ?? m.status}</span></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.createdAt ? new Date(m.createdAt).toLocaleDateString("zh-CN") : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setPreviewMaterial(m)}
                        title="预览"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => handleCheckDuplicate(m)}
                        disabled={checkingId === m.id}
                        title="去重检测"
                      >
                        {checkingId === m.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      {m.status === "pending" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={() => updateStatusMutation.mutate({ id: m.id, status: "approved" })}
                            title="通过审核"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => updateStatusMutation.mutate({ id: m.id, status: "rejected" })}
                            title="拒绝"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("确认删除此素材？")) {
                            deleteMutation.mutate({ id: m.id });
                          }
                        }}
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Preview Dialog */}
      {previewMaterial && (
        <Dialog open={!!previewMaterial} onOpenChange={() => setPreviewMaterial(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="pr-8">{previewMaterial.title}</DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-3 text-xs text-muted-foreground border-b pb-3 mb-4 flex-wrap">
              <span>关键词：{previewMaterial.keyword ?? "—"}</span>
              <span>·</span>
              <span>{langLabel[previewMaterial.language] ?? previewMaterial.language}</span>
              <span>·</span>
              <span>{previewMaterial.wordCount} 字</span>
              {previewMaterial.qualityScore != null && (
                <>
                  <span>·</span>
                  <span>质量分：{previewMaterial.qualityScore}</span>
                </>
              )}
              {previewMaterial.similarityScore != null && (
                <>
                  <span>·</span>
                  <SimilarityBadge score={previewMaterial.similarityScore} />
                </>
              )}
            </div>
            <div className="prose prose-sm max-w-none text-foreground">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{previewMaterial.content}</pre>
            </div>
            <div className="flex justify-between items-center mt-4 border-t pt-4">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50"
                onClick={() => handleCheckDuplicate(previewMaterial)}
                disabled={checkingId === previewMaterial.id}
              >
                {checkingId === previewMaterial.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                去重检测
              </Button>
              <div className="flex gap-2">
                {previewMaterial.status === "pending" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-700 border-red-200 hover:bg-red-50"
                      onClick={() => {
                        updateStatusMutation.mutate({ id: previewMaterial.id, status: "rejected" });
                        setPreviewMaterial(null);
                      }}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1.5" />
                      拒绝
                    </Button>
                    <Button
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => {
                        updateStatusMutation.mutate({ id: previewMaterial.id, status: "approved" });
                        setPreviewMaterial(null);
                      }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      通过审核
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
