import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Upload, Play, Pause, Square, Trash2, RefreshCw, FileText,
  CheckCircle2, XCircle, Clock, Loader2, Plus, Download,
  ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react";

// ─── 类型定义 ─────────────────────────────────────────────────────────────────
interface ImportRow {
  rowIndex: number;
  keyword: string;
  title?: string;
  extraKeywords?: string[];
  hasError?: boolean;
  errorMsg?: string;
}

interface BatchItem {
  id: number;
  keyword: string;
  title: string | null;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  generatedTitle?: string | null;
  generatedWordCount?: number | null;
  errorMessage?: string | null;
}

// ─── 解析导入文本 ─────────────────────────────────────────────────────────────
function parseImportText(text: string): ImportRow[] {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  return lines.map((line, idx) => {
    // 支持 Tab 分隔 或 逗号分隔
    const parts = line.includes("\t") ? line.split("\t") : line.split(",");
    const keyword = parts[0]?.trim() ?? "";
    const title = parts[1]?.trim() || undefined;
    const extraKeywords = parts.slice(2).map(k => k.trim()).filter(Boolean);
    return {
      rowIndex: idx,
      keyword,
      title,
      extraKeywords,
      hasError: !keyword,
      errorMsg: !keyword ? "关键词不能为空" : undefined,
    };
  });
}

// ─── 状态徽章 ─────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
    pending: { label: "待处理", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
    running: { label: "生成中", variant: "default", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    paused: { label: "已暂停", variant: "outline", icon: <Pause className="h-3 w-3" /> },
    completed: { label: "已完成", variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
    cancelled: { label: "已取消", variant: "destructive", icon: <Square className="h-3 w-3" /> },
    success: { label: "成功", variant: "default", icon: <CheckCircle2 className="h-3 w-3" /> },
    failed: { label: "失败", variant: "destructive", icon: <XCircle className="h-3 w-3" /> },
  };
  const cfg = map[status] ?? { label: status, variant: "secondary" as const, icon: null };
  return (
    <Badge variant={cfg.variant} className="gap-1 text-xs">
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

// ─── 批次进度卡片 ─────────────────────────────────────────────────────────────
function BatchProgressCard({ batchId, onDelete }: { batchId: number; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();

  const { data: progress, isLoading } = trpc.batchGeneration.progress.useQuery(
    { id: batchId },
    { refetchInterval: (data) => {
        if (!data) return 3000;
        const s = (data as any)?.status;
        return (s === "running" || s === "paused") ? 2000 : false;
      }
    }
  );

  const { data: items } = trpc.batchGeneration.items.useQuery(
    { batchId },
    { enabled: expanded, refetchInterval: expanded ? 3000 : false }
  );

  const startMut = trpc.batchGeneration.start.useMutation({
    onSuccess: () => { toast.success("批次已启动"); utils.batchGeneration.progress.invalidate({ id: batchId }); },
    onError: (e) => toast.error(e.message),
  });
  const pauseMut = trpc.batchGeneration.pause.useMutation({
    onSuccess: () => { toast.success("批次已暂停"); utils.batchGeneration.progress.invalidate({ id: batchId }); },
  });
  const resumeMut = trpc.batchGeneration.resume.useMutation({
    onSuccess: () => { toast.success("批次已继续"); utils.batchGeneration.progress.invalidate({ id: batchId }); },
  });
  const cancelMut = trpc.batchGeneration.cancel.useMutation({
    onSuccess: () => { toast.success("批次已取消"); utils.batchGeneration.progress.invalidate({ id: batchId }); },
  });
  const deleteMut = trpc.batchGeneration.delete.useMutation({
    onSuccess: () => { toast.success("批次已删除"); onDelete(); },
  });

  if (isLoading || !progress) return <Card className="p-4"><Loader2 className="h-4 w-4 animate-spin" /></Card>;

  const p = progress as any;
  const total = p.totalCount ?? 0;
  const successPct = total > 0 ? Math.round((p.success / total) * 100) : 0;
  const status = p.status as string;

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-base truncate">{p.name}</CardTitle>
              <StatusBadge status={status} />
            </div>
            <CardDescription className="mt-1 text-xs">
              共 {total.toLocaleString()} 条 · 成功 {(p.success ?? 0).toLocaleString()} · 失败 {(p.failed ?? 0).toLocaleString()} · 待处理 {(p.pending ?? 0).toLocaleString()}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {status === "pending" && (
              <Button size="sm" variant="default" onClick={() => startMut.mutate({ id: batchId })} disabled={startMut.isPending}>
                <Play className="h-3 w-3 mr-1" />启动
              </Button>
            )}
            {status === "running" && (
              <Button size="sm" variant="outline" onClick={() => pauseMut.mutate({ id: batchId })} disabled={pauseMut.isPending}>
                <Pause className="h-3 w-3 mr-1" />暂停
              </Button>
            )}
            {status === "paused" && (
              <Button size="sm" variant="default" onClick={() => resumeMut.mutate({ id: batchId })} disabled={resumeMut.isPending}>
                <Play className="h-3 w-3 mr-1" />继续
              </Button>
            )}
            {(status === "running" || status === "paused") && (
              <Button size="sm" variant="destructive" onClick={() => cancelMut.mutate({ id: batchId })} disabled={cancelMut.isPending}>
                <Square className="h-3 w-3 mr-1" />取消
              </Button>
            )}
            {(status === "completed" || status === "cancelled" || status === "pending") && (
              <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate({ id: batchId })} disabled={deleteMut.isPending}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setExpanded(v => !v)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div className="mt-2">
          <Progress value={successPct} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{successPct}% 完成</span>
            <span>并发: {p.concurrency} · {p.language} · {p.minWords}字+</span>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-12 text-xs font-medium bg-muted px-3 py-2 text-muted-foreground">
              <div className="col-span-1">#</div>
              <div className="col-span-4">关键词</div>
              <div className="col-span-4">生成标题</div>
              <div className="col-span-2">字数</div>
              <div className="col-span-1">状态</div>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-border">
              {(items as BatchItem[] | undefined)?.slice(0, 200).map((item) => (
                <div key={item.id} className="grid grid-cols-12 text-xs px-3 py-2 hover:bg-muted/50">
                  <div className="col-span-1 text-muted-foreground">{item.id}</div>
                  <div className="col-span-4 truncate font-medium">{item.keyword}</div>
                  <div className="col-span-4 truncate text-muted-foreground">
                    {item.generatedTitle || item.title || <span className="text-muted-foreground/50">—</span>}
                  </div>
                  <div className="col-span-2 text-muted-foreground">
                    {item.generatedWordCount ? `${item.generatedWordCount}字` : "—"}
                  </div>
                  <div className="col-span-1">
                    <StatusBadge status={item.status} />
                  </div>
                </div>
              ))}
              {!items?.length && (
                <div className="text-center text-muted-foreground text-xs py-6">暂无条目数据</div>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function BatchGeneration() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [importText, setImportText] = useState("");
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [batchName, setBatchName] = useState(`批次-${new Date().toLocaleDateString("zh-CN").replace(/\//g, "")}`);
  const [language, setLanguage] = useState<"zh-CN" | "en" | "zh-TW">("zh-CN");
  const [style, setStyle] = useState<"informational" | "commercial" | "navigational">("informational");
  const [minWords, setMinWords] = useState(800);
  const [concurrency, setConcurrency] = useState(3);
  const [autoPublish, setAutoPublish] = useState(false);
  const [batchIds, setBatchIds] = useState<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  const { data: batches, refetch: refetchBatches } = trpc.batchGeneration.list.useQuery();

  const createMut = trpc.batchGeneration.create.useMutation({
    onSuccess: (data) => {
      toast.success(`批次创建成功，共 ${data.totalCount.toLocaleString()} 条`);
      setBatchIds(prev => [data.batchId, ...prev]);
      setShowCreateDialog(false);
      setImportText("");
      setParsedRows([]);
      setShowPreview(false);
      refetchBatches();
    },
    onError: (e) => toast.error(`创建失败: ${e.message}`),
  });

  const handleParseText = useCallback(() => {
    if (!importText.trim()) { toast.error("请先输入或粘贴数据"); return; }
    const rows = parseImportText(importText);
    setParsedRows(rows);
    setShowPreview(true);
    const errorCount = rows.filter(r => r.hasError).length;
    if (errorCount > 0) {
      toast.warning(`解析完成：${rows.length} 条，其中 ${errorCount} 条有错误（将被跳过）`);
    } else {
      toast.success(`解析完成：共 ${rows.length} 条，全部有效`);
    }
  }, [importText]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setImportText(text);
      toast.info("文件已读取，点击「解析预览」查看数据");
    };
    reader.readAsText(file, "utf-8");
  }, []);

  const handleCreate = useCallback(() => {
    const validRows = parsedRows.filter(r => !r.hasError);
    if (validRows.length === 0) { toast.error("没有有效的条目"); return; }
    createMut.mutate({
      name: batchName,
      language,
      style,
      minWords,
      concurrency,
      autoPublish,
      items: validRows.map(r => ({
        keyword: r.keyword,
        title: r.title,
        extraKeywords: r.extraKeywords,
      })),
    });
  }, [parsedRows, batchName, language, style, minWords, concurrency, autoPublish, createMut]);

  const allBatchIds = [
    ...batchIds,
    ...((batches as any[]) ?? []).map((b: any) => b.id).filter((id: number) => !batchIds.includes(id)),
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">批量内容生成</h1>
          <p className="text-muted-foreground text-sm mt-1">
            导入标题+关键词列表，后台批量生成 SEO 文章，支持万级任务
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          新建批次
        </Button>
      </div>

      {/* 格式说明 */}
      <Card className="bg-muted/40 border-dashed">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">导入格式说明</p>
              <p>每行一条，支持 CSV（逗号分隔）或 TSV（Tab 分隔）：</p>
              <code className="block bg-background rounded px-2 py-1 text-xs font-mono">
                关键词,文章标题（可选）,附加关键词1（可选）,附加关键词2（可选）
              </code>
              <p>示例：<code className="text-xs font-mono">减肥方法,科学减肥的10个方法,健康减肥,快速减肥</code></p>
              <p>仅有关键词时：<code className="text-xs font-mono">减肥方法</code>（标题由 AI 自动生成）</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 批次列表 */}
      <div className="space-y-3">
        {allBatchIds.length === 0 ? (
          <Card className="py-16">
            <CardContent className="flex flex-col items-center justify-center text-center">
              <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground">暂无批次，点击「新建批次」开始</p>
            </CardContent>
          </Card>
        ) : (
          allBatchIds.map(id => (
            <BatchProgressCard
              key={id}
              batchId={id}
              onDelete={() => {
                setBatchIds(prev => prev.filter(i => i !== id));
                refetchBatches();
              }}
            />
          ))
        )}
      </div>

      {/* 新建批次弹窗 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>新建批量生成批次</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* 批次配置 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>批次名称</Label>
                <Input value={batchName} onChange={e => setBatchName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>语言</Label>
                <Select value={language} onValueChange={v => setLanguage(v as any)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh-CN">简体中文</SelectItem>
                    <SelectItem value="en">英文</SelectItem>
                    <SelectItem value="zh-TW">繁体中文</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>文章类型</Label>
                <Select value={style} onValueChange={v => setStyle(v as any)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="informational">信息型（科普解答）</SelectItem>
                    <SelectItem value="commercial">商业型（推广评测）</SelectItem>
                    <SelectItem value="navigational">导航型（品牌介绍）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>最少字数</Label>
                <Select value={String(minWords)} onValueChange={v => setMinWords(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="500">500字</SelectItem>
                    <SelectItem value="800">800字（推荐）</SelectItem>
                    <SelectItem value="1200">1200字</SelectItem>
                    <SelectItem value="1500">1500字</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>并发数（同时生成路数）</Label>
                <Select value={String(concurrency)} onValueChange={v => setConcurrency(Number(v))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1路（最慢，最省费用）</SelectItem>
                    <SelectItem value="3">3路（推荐）</SelectItem>
                    <SelectItem value="5">5路</SelectItem>
                    <SelectItem value="10">10路（最快）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 导入区域 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>导入数据</Label>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-3 w-3 mr-1" />
                    上传 CSV/TXT
                  </Button>
                  <input ref={fileInputRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFileUpload} />
                </div>
              </div>
              <Textarea
                value={importText}
                onChange={e => { setImportText(e.target.value); setShowPreview(false); }}
                placeholder={"粘贴数据，每行一条：\n减肥方法,科学减肥的10个方法,健康减肥\n英语学习,零基础学英语\n副业赚钱"}
                className="font-mono text-xs h-40 resize-none"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-muted-foreground">
                  {importText.split("\n").filter(l => l.trim()).length.toLocaleString()} 行
                </span>
                <Button size="sm" variant="secondary" onClick={handleParseText}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  解析预览
                </Button>
              </div>
            </div>

            {/* 预览表格 */}
            {showPreview && parsedRows.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>
                    预览（共 {parsedRows.length.toLocaleString()} 条，
                    有效 <span className="text-green-600">{parsedRows.filter(r => !r.hasError).length.toLocaleString()}</span>，
                    错误 <span className="text-red-500">{parsedRows.filter(r => r.hasError).length}</span>）
                  </Label>
                </div>
                <div className="border rounded-md overflow-hidden">
                  <div className="grid grid-cols-12 text-xs font-medium bg-muted px-3 py-2 text-muted-foreground">
                    <div className="col-span-1">#</div>
                    <div className="col-span-4">关键词</div>
                    <div className="col-span-5">标题（空=AI生成）</div>
                    <div className="col-span-2">状态</div>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-border">
                    {parsedRows.slice(0, 500).map((row) => (
                      <div key={row.rowIndex} className={`grid grid-cols-12 text-xs px-3 py-1.5 ${row.hasError ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                        <div className="col-span-1 text-muted-foreground">{row.rowIndex + 1}</div>
                        <div className="col-span-4 truncate">{row.keyword || <span className="text-red-500">空</span>}</div>
                        <div className="col-span-5 truncate text-muted-foreground">{row.title || "—"}</div>
                        <div className="col-span-2">
                          {row.hasError
                            ? <span className="text-red-500 text-xs">{row.errorMsg}</span>
                            : <span className="text-green-600 text-xs">✓</span>
                          }
                        </div>
                      </div>
                    ))}
                    {parsedRows.length > 500 && (
                      <div className="text-center text-xs text-muted-foreground py-2">
                        仅显示前 500 条预览，实际将导入全部 {parsedRows.length.toLocaleString()} 条
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-4 mt-2">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
            <Button
              onClick={handleCreate}
              disabled={createMut.isPending || parsedRows.filter(r => !r.hasError).length === 0}
            >
              {createMut.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />创建中...</>
              ) : (
                <>创建批次（{parsedRows.filter(r => !r.hasError).length.toLocaleString()} 条）</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
