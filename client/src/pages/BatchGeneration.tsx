import HelpButton from "@/components/HelpButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
interface ImportItem {
  keyword: string;
  title?: string;
}

interface AnchorLink {
  anchorText: string;
  url: string;
  position: "intro" | "body" | "end";
}

interface BatchConfig {
  name: string;
  language: "zh-CN" | "en" | "zh-TW";
  minWords: number;
  style: "informational" | "commercial" | "navigational";
  concurrency: number;
  insertKeywords: string[];
  anchorLinks: AnchorLink[];
  insertParagraph: string;
  autoApproveThreshold: number;
  autoQueue: boolean;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "待处理", variant: "secondary" },
    running: { label: "运行中", variant: "default" },
    paused: { label: "已暂停", variant: "outline" },
    completed: { label: "已完成", variant: "default" },
    failed: { label: "失败", variant: "destructive" },
  };
  const s = map[status] ?? { label: status, variant: "secondary" };
  return <Badge variant={s.variant} className={status === "completed" ? "bg-green-500 hover:bg-green-600 text-white" : status === "running" ? "bg-blue-500 hover:bg-blue-600 text-white" : ""}>{s.label}</Badge>;
}

// ─── Batch Row ────────────────────────────────────────────────────────────────
function BatchRow({ batch, onRefresh }: { batch: any; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const utils = trpc.useUtils();
  const startMut = trpc.batchGeneration.start.useMutation({ onSuccess: () => { toast.success("已启动"); onRefresh(); } });
  const pauseMut = trpc.batchGeneration.pause.useMutation({ onSuccess: () => { toast.success("已暂停"); onRefresh(); } });
  const resumeMut = trpc.batchGeneration.resume.useMutation({ onSuccess: () => { toast.success("已继续"); onRefresh(); } });
  const cancelMut = trpc.batchGeneration.cancel.useMutation({ onSuccess: () => { toast.success("已取消"); onRefresh(); } });
  const deleteMut = trpc.batchGeneration.delete.useMutation({ onSuccess: () => { toast.success("已删除"); onRefresh(); } });

  const { data: progress } = trpc.batchGeneration.progress.useQuery(
    { id: batch.id },
    { refetchInterval: batch.status === "running" ? 2000 : false }
  );

  const pct = progress?.percent ?? (batch.totalCount > 0 ? Math.round((batch.completedCount / batch.totalCount) * 100) : 0);
  const completed = progress?.completedCount ?? batch.completedCount;
  const failed = progress?.failedCount ?? batch.failedCount;
  const total = batch.totalCount;

  return (
    <div className="border rounded-lg overflow-hidden">
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm truncate">{batch.name}</span>
            <StatusBadge status={progress?.status ?? batch.status} />
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{completed}/{total} 完成</span>
            {failed > 0 && <span className="text-destructive">{failed} 失败</span>}
            <span>{new Date(batch.createdAt).toLocaleString()}</span>
          </div>
          <div className="mt-2">
            <Progress value={pct} className="h-1.5" />
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          {(progress?.status ?? batch.status) === "pending" && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => startMut.mutate({ id: batch.id })} disabled={startMut.isPending}>
              <Play className="h-3 w-3" /> 启动
            </Button>
          )}
          {(progress?.status ?? batch.status) === "running" && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => pauseMut.mutate({ id: batch.id })} disabled={pauseMut.isPending}>
              <Pause className="h-3 w-3" /> 暂停
            </Button>
          )}
          {(progress?.status ?? batch.status) === "paused" && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => resumeMut.mutate({ id: batch.id })} disabled={resumeMut.isPending}>
              <RotateCcw className="h-3 w-3" /> 继续
            </Button>
          )}
          {["running", "paused"].includes(progress?.status ?? batch.status) && (
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => cancelMut.mutate({ id: batch.id })} disabled={cancelMut.isPending}>
              <X className="h-3 w-3" /> 取消
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => { if (confirm("确认删除此批次及所有条目？")) deleteMut.mutate({ id: batch.id }); }} disabled={deleteMut.isPending}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t bg-muted/20 p-4">
          <div className="grid grid-cols-4 gap-3 text-sm">
            <div className="bg-background rounded p-3 text-center">
              <div className="text-2xl font-bold text-foreground">{total}</div>
              <div className="text-xs text-muted-foreground mt-0.5">总计</div>
            </div>
            <div className="bg-background rounded p-3 text-center">
              <div className="text-2xl font-bold text-green-500">{completed}</div>
              <div className="text-xs text-muted-foreground mt-0.5">已完成</div>
            </div>
            <div className="bg-background rounded p-3 text-center">
              <div className="text-2xl font-bold text-destructive">{failed}</div>
              <div className="text-xs text-muted-foreground mt-0.5">失败</div>
            </div>
            <div className="bg-background rounded p-3 text-center">
              <div className="text-2xl font-bold text-blue-500">{pct}%</div>
              <div className="text-xs text-muted-foreground mt-0.5">进度</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="bg-background rounded px-2 py-1">语言: {batch.language}</span>
            <span className="bg-background rounded px-2 py-1">最少字数: {batch.minWords}</span>
            <span className="bg-background rounded px-2 py-1">并发数: {batch.concurrency}</span>
            {batch.autoApproveThreshold > 0 && <span className="bg-background rounded px-2 py-1">自动通过阈值: {batch.autoApproveThreshold}分</span>}
            {batch.autoQueue && <span className="bg-background rounded px-2 py-1 text-blue-500">自动加入发布队列</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BatchGeneration() {
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState<"import" | "config" | "confirm">("import");
  const [importText, setImportText] = useState("");
  const [parsedItems, setParsedItems] = useState<ImportItem[]>([]);
  const [parseError, setParseError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [config, setConfig] = useState<BatchConfig>({
    name: `批次_${new Date().toLocaleDateString("zh-CN").replace(/\//g, "")}`,
    language: "zh-CN",
    minWords: 800,
    style: "informational",
    concurrency: 3,
    insertKeywords: [],
    anchorLinks: [],
    insertParagraph: "",
    autoApproveThreshold: 70,
    autoQueue: false,
  });

  const [newKeyword, setNewKeyword] = useState("");
  const [newAnchor, setNewAnchor] = useState<AnchorLink>({ anchorText: "", url: "", position: "body" });

  const { data: batches, refetch } = trpc.batchGeneration.list.useQuery();
  const createMut = trpc.batchGeneration.create.useMutation({
    onSuccess: (data) => {
      toast.success(`批次创建成功，共 ${data.totalCount} 条任务`);
      setShowCreate(false);
      setStep("import");
      setImportText("");
      setParsedItems([]);
      refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const setConfigField = <K extends keyof BatchConfig>(key: K, value: BatchConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  // ─── Parse import text ─────────────────────────────────────────────────────
  const parseImport = useCallback(() => {
    setParseError("");
    const lines = importText.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      setParseError("请输入至少一行数据");
      return;
    }
    const items: ImportItem[] = [];
    for (const line of lines) {
      // Support: "keyword,title" or "keyword\ttitle" or just "keyword"
      const parts = line.includes("\t") ? line.split("\t") : line.split(",");
      const keyword = parts[0]?.trim();
      const title = parts[1]?.trim();
      if (!keyword) continue;
      items.push({ keyword, title: title || undefined });
    }
    if (items.length === 0) {
      setParseError("未能解析出有效数据，请检查格式");
      return;
    }
    setParsedItems(items);
    setStep("config");
    toast.success(`成功解析 ${items.length} 条数据`);
  }, [importText]);

  // ─── Handle CSV file upload ────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      // Remove BOM if present
      setImportText(text.replace(/^\uFEFF/, ""));
      toast.info("文件已加载，点击「解析」继续");
    };
    reader.readAsText(file, "utf-8");
  };

  // ─── Submit ────────────────────────────────────────────────────────────────
  const handleCreate = () => {
    createMut.mutate({
      ...config,
      items: parsedItems,
    });
  };

  const totalBatches = batches?.length ?? 0;
  const runningBatches = batches?.filter(b => b.status === "running").length ?? 0;
  const totalItems = batches?.reduce((s, b) => s + b.totalCount, 0) ?? 0;
  const completedItems = batches?.reduce((s, b) => s + b.completedCount, 0) ?? 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">批量生成</h1>
          <p className="text-sm text-muted-foreground mt-0.5">导入关键词和标题，批量 AI 生成文章，支持万级任务</p>
        </div>
        <div className="flex items-center gap-2">
          <HelpButton
            title="批量生成"
            steps={[
              { step: 1, title: "准备数据", desc: "准备 CSV 文件或文本，格式：每行一条，内容为「关键词」或「关键词,标题」" },
              { step: 2, title: "新建批次", desc: "点击「新建批次」，选择导入方式（文本粘贴或 CSV 上传），解析预览数据" },
              { step: 3, title: "配置生成参数", desc: "设置语言、最少字数、并发数、插入关键词和锚文本链接" },
              { step: 4, title: "启动生成", desc: "确认批次后点击「启动」，后台自动运行，可随时暂停/继续" },
              { step: 5, title: "查看结果", desc: "生成完成的文章自动保存到「素材库」，可直接加入发布队列" },
            ]}
            tips={[
              "上万条任务建议并发数设为 3-5，防止 API 限流",
              "CSV 格式：第一列关键词，第二列可选标题，无需表头",
              "设置质量分阈值后，达标的文章自动进入发布队列",
            ]}
          />
          <Button onClick={() => { setShowCreate(true); setStep("import"); }} className="gap-2">
            <Plus className="h-4 w-4" /> 新建批次
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "总批次", value: totalBatches, icon: <Zap className="h-4 w-4" />, color: "text-purple-500" },
          { label: "运行中", value: runningBatches, icon: <Loader2 className="h-4 w-4 animate-spin" />, color: "text-blue-500" },
          { label: "总任务数", value: totalItems.toLocaleString(), icon: <Tag className="h-4 w-4" />, color: "text-orange-500" },
          { label: "已完成", value: completedItems.toLocaleString(), icon: <CheckCircle2 className="h-4 w-4" />, color: "text-green-500" },
        ].map(stat => (
          <Card key={stat.label} className="border-0 shadow-sm bg-card">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`${stat.color} bg-muted rounded-lg p-2`}>{stat.icon}</div>
              <div>
                <div className="text-xl font-bold text-foreground">{stat.value}</div>
                <div className="text-xs text-muted-foreground">{stat.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Panel */}
      {showCreate && (
        <Card className="border-2 border-primary/20 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {step === "import" && "第一步：导入数据"}
                {step === "config" && `第二步：配置生成参数（已解析 ${parsedItems.length} 条）`}
                {step === "confirm" && `第三步：确认并创建批次`}
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowCreate(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {/* Step indicator */}
            <div className="flex items-center gap-2 mt-2">
              {["import", "config", "confirm"].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step === s ? "bg-primary text-primary-foreground" : ["import", "config", "confirm"].indexOf(step) > i ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"}`}>
                    {["import", "config", "confirm"].indexOf(step) > i ? "✓" : i + 1}
                  </div>
                  {i < 2 && <div className="h-px w-8 bg-muted" />}
                </div>
              ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Step 1: Import */}
            {step === "import" && (
              <div className="space-y-4">
                <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium text-foreground">支持的格式（每行一条）：</p>
                  <p>• 仅关键词：<code className="bg-background px-1 rounded">减肥方法</code></p>
                  <p>• 关键词,标题：<code className="bg-background px-1 rounded">减肥方法,2024年最有效的10种减肥方法</code></p>
                  <p>• 关键词[Tab]标题（CSV 格式）</p>
                  <p className="text-orange-500">支持直接粘贴 Excel 复制的内容（Tab 分隔）</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5" /> 上传 CSV 文件
                  </Button>
                  <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileUpload} />
                </div>
                <div className="space-y-1.5">
                  <Label>粘贴数据（支持上万行）</Label>
                  <Textarea
                    value={importText}
                    onChange={e => setImportText(e.target.value)}
                    placeholder={"减肥方法\n减肥方法,2024年最有效的10种减肥方法\n瘦腿运动,在家就能做的5个瘦腿动作\n..."}
                    className="font-mono text-xs h-48 resize-y"
                  />
                  <p className="text-xs text-muted-foreground">
                    已输入 {importText.split("\n").filter(l => l.trim()).length} 行
                  </p>
                </div>
                {parseError && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded p-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {parseError}
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
                  <Button onClick={parseImport} disabled={!importText.trim()} className="gap-2">
                    <CheckCircle2 className="h-4 w-4" /> 解析数据
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Config */}
            {step === "config" && (
              <div className="space-y-5">
                {/* Basic config */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">基础配置</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>批次名称</Label>
                      <Input value={config.name} onChange={e => setConfigField("name", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>文章语言</Label>
                      <Select value={config.language} onValueChange={v => setConfigField("language", v as any)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="zh-CN">简体中文</SelectItem>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="zh-TW">繁體中文</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>文章类型</Label>
                      <Select value={config.style} onValueChange={v => setConfigField("style", v as any)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="informational">信息型（科普/介绍）</SelectItem>
                          <SelectItem value="commercial">商业型（推广/评测）</SelectItem>
                          <SelectItem value="navigational">导航型（指南/教程）</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>最少字数</Label>
                      <Input type="number" min={300} max={5000} value={config.minWords} onChange={e => setConfigField("minWords", parseInt(e.target.value) || 800)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>并发数（1-10）</Label>
                      <Input type="number" min={1} max={10} value={config.concurrency} onChange={e => setConfigField("concurrency", parseInt(e.target.value) || 3)} />
                      <p className="text-xs text-muted-foreground">建议 3-5，过高可能触发 API 限速</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>自动通过质量分阈值（0=不自动通过）</Label>
                      <Input type="number" min={0} max={100} value={config.autoApproveThreshold} onChange={e => setConfigField("autoApproveThreshold", parseInt(e.target.value) || 0)} />
                      <p className="text-xs text-muted-foreground">达到此分数的文章自动跳过审核</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-muted/30 rounded p-3">
                    <div>
                      <p className="text-sm font-medium">生成后自动加入发布队列</p>
                      <p className="text-xs text-muted-foreground">文章生成并通过质量分后，自动创建发布任务</p>
                    </div>
                    <Switch checked={config.autoQueue} onCheckedChange={v => setConfigField("autoQueue", v)} />
                  </div>
                </div>

                {/* Insert keywords */}
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-orange-500" />
                    <h3 className="text-sm font-semibold text-foreground">指定插入关键词</h3>
                    <span className="text-xs text-muted-foreground">（AI 生成时强制将这些词融入文章）</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={newKeyword}
                      onChange={e => setNewKeyword(e.target.value)}
                      placeholder="输入关键词，如：品牌名、产品名"
                      onKeyDown={e => {
                        if (e.key === "Enter" && newKeyword.trim()) {
                          setConfigField("insertKeywords", [...config.insertKeywords, newKeyword.trim()]);
                          setNewKeyword("");
                        }
                      }}
                    />
                    <Button variant="outline" size="sm" className="shrink-0" onClick={() => {
                      if (newKeyword.trim()) {
                        setConfigField("insertKeywords", [...config.insertKeywords, newKeyword.trim()]);
                        setNewKeyword("");
                      }
                    }}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {config.insertKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {config.insertKeywords.map((kw, i) => (
                        <Badge key={i} variant="secondary" className="gap-1 pr-1">
                          {kw}
                          <button onClick={() => setConfigField("insertKeywords", config.insertKeywords.filter((_, j) => j !== i))} className="ml-1 hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Anchor links */}
                <div className="space-y-3 border-t pt-4">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-blue-500" />
                    <h3 className="text-sm font-semibold text-foreground">指定锚文本超链接</h3>
                    <span className="text-xs text-muted-foreground">（AI 生成时自动插入到文章中）</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      value={newAnchor.anchorText}
                      onChange={e => setNewAnchor(a => ({ ...a, anchorText: e.target.value }))}
                      placeholder="锚文本（如：了解更多）"
                    />
                    <Input
                      value={newAnchor.url}
                      onChange={e => setNewAnchor(a => ({ ...a, url: e.target.value }))}
                      placeholder="目标 URL（https://...）"
                    />
                    <div className="flex gap-2">
                      <Select value={newAnchor.position} onValueChange={v => setNewAnchor(a => ({ ...a, position: v as any }))}>
                        <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="intro">引言处</SelectItem>
                          <SelectItem value="body">正文中</SelectItem>
                          <SelectItem value="end">末尾处</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" className="shrink-0" onClick={() => {
                        if (newAnchor.anchorText.trim() && newAnchor.url.trim()) {
                          setConfigField("anchorLinks", [...config.anchorLinks, { ...newAnchor }]);
                          setNewAnchor({ anchorText: "", url: "", position: "body" });
                        }
                      }}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {config.anchorLinks.length > 0 && (
                    <div className="space-y-1.5">
                      {config.anchorLinks.map((link, i) => (
                        <div key={i} className="flex items-center gap-2 bg-muted/30 rounded px-3 py-1.5 text-sm">
                          <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded px-1.5 py-0.5">
                            {link.position === "intro" ? "引言" : link.position === "body" ? "正文" : "末尾"}
                          </span>
                          <span className="font-medium">{link.anchorText}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-blue-500 truncate flex-1">{link.url}</span>
                          <button onClick={() => setConfigField("anchorLinks", config.anchorLinks.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Insert paragraph */}
                <div className="space-y-3 border-t pt-4">
                  <h3 className="text-sm font-semibold text-foreground">指定插入段落（可选）</h3>
                  <Textarea
                    value={config.insertParagraph}
                    onChange={e => setConfigField("insertParagraph", e.target.value)}
                    placeholder="输入需要强制插入到每篇文章正文中的固定内容，如：品牌介绍、免责声明、联系方式等"
                    className="h-24 resize-none text-sm"
                  />
                </div>

                <div className="flex justify-between gap-2 pt-2">
                  <Button variant="outline" onClick={() => setStep("import")}>← 返回</Button>
                  <Button onClick={() => setStep("confirm")} className="gap-2">
                    下一步：确认 →
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Confirm */}
            {step === "confirm" && (
              <div className="space-y-4">
                <div className="bg-muted/30 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold">批次摘要</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">批次名称</span><span className="font-medium">{config.name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">任务总数</span><span className="font-bold text-primary">{parsedItems.length.toLocaleString()} 条</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">文章语言</span><span>{config.language}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">最少字数</span><span>{config.minWords} 字</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">并发数</span><span>{config.concurrency}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">预计耗时</span><span className="text-orange-500">约 {Math.ceil(parsedItems.length / config.concurrency * 4 / 60)} 分钟</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">自动通过阈值</span><span>{config.autoApproveThreshold > 0 ? `${config.autoApproveThreshold} 分` : "不自动通过"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">自动加入发布队列</span><span>{config.autoQueue ? "是" : "否"}</span></div>
                  </div>
                  {config.insertKeywords.length > 0 && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">指定关键词：</span>
                      <span>{config.insertKeywords.join("、")}</span>
                    </div>
                  )}
                  {config.anchorLinks.length > 0 && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">锚文本链接：</span>
                      <span>{config.anchorLinks.length} 条</span>
                    </div>
                  )}
                </div>
                <div className="bg-muted/30 rounded-lg p-3 max-h-40 overflow-y-auto">
                  <p className="text-xs text-muted-foreground mb-2">前 20 条预览：</p>
                  {parsedItems.slice(0, 20).map((item, i) => (
                    <div key={i} className="text-xs py-0.5 flex gap-2">
                      <span className="text-muted-foreground w-6 shrink-0">{i + 1}.</span>
                      <span className="font-medium">{item.keyword}</span>
                      {item.title && <span className="text-muted-foreground truncate">→ {item.title}</span>}
                    </div>
                  ))}
                  {parsedItems.length > 20 && <p className="text-xs text-muted-foreground mt-1">...还有 {parsedItems.length - 20} 条</p>}
                </div>
                <div className="flex justify-between gap-2">
                  <Button variant="outline" onClick={() => setStep("config")}>← 返回</Button>
                  <Button onClick={handleCreate} disabled={createMut.isPending} className="gap-2 min-w-32">
                    {createMut.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> 创建中...</> : <><CheckCircle2 className="h-4 w-4" /> 创建批次</>}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Batch list */}
      <div className="space-y-3">
        {!batches ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> 加载中...
          </div>
        ) : batches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground border-2 border-dashed rounded-lg">
            <Zap className="h-8 w-8 mb-3 opacity-40" />
            <p className="text-sm font-medium">还没有批次</p>
            <p className="text-xs mt-1">点击「新建批次」导入关键词开始批量生成</p>
          </div>
        ) : (
          batches.map(batch => (
            <BatchRow key={batch.id} batch={batch} onRefresh={refetch} />
          ))
        )}
      </div>
    </div>
  );
}
