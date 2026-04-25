import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  BarChart2,
  BookOpen,
  FileText,
  HelpCircle,
  Loader2,
  Plus,
  Sparkles,
  Tags,
  Trash2,
  TrendingUp,
  Wand2,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Keyword = {
  id: number;
  keyword: string;
  language: string;
  status: string;
  searchVolume?: number | null;
  difficulty?: number | null;
  priority?: string | null;
  createdAt?: Date | null;
};

const langLabel: Record<string, string> = {
  "zh-CN": "简体中文",
  "en": "英文",
  "zh-TW": "繁体中文",
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  high: { label: "高优先", color: "bg-green-100 text-green-700 border-green-200" },
  medium: { label: "中优先", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  low: { label: "低优先", color: "bg-gray-100 text-gray-500 border-gray-200" },
};

function DifficultyBar({ value }: { value: number }) {
  const color = value < 30 ? "bg-green-500" : value < 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground">{Math.round(value)}</span>
    </div>
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
            <DialogTitle>AI内容生成使用说明</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-3">
            <p><strong className="text-foreground">1. 添加关键词：</strong>在左侧输入目标关键词，支持批量添加（每行一个）。</p>
            <p><strong className="text-foreground">2. 竞争度分析：</strong>点击关键词旁的「分析」按钮，AI 自动评估搜索量、竞争难度和优先级，帮助优先生成高价值文章。</p>
            <p><strong className="text-foreground">3. 关键词扩展：</strong>选择关键词后点击「AI扩展」，系统自动生成相关长尾关键词。</p>
            <p><strong className="text-foreground">4. 生成文章：</strong>选择关键词、语言和文章类型，点击「生成文章」。AI 将生成 SEO 优化的高质量内容。</p>
            <p><strong className="text-foreground">5. 内容审核：</strong>生成的文章保存到素材库，需在素材库中审核后方可发布。</p>
            <p><strong className="text-foreground">6. 优先级说明：</strong>高搜索量+低竞争=高优先级，优先生成这类文章可获得最佳 SEO 效果。</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AIContent() {
  const utils = trpc.useUtils();
  const { data: keywords = [], isLoading: kwLoading } = trpc.content.keywords.list.useQuery();

  const createKwMutation = trpc.content.keywords.create.useMutation({
    onSuccess: () => {
      utils.content.keywords.list.invalidate();
      setNewKeyword("");
      toast.success("关键词已添加");
    },
    onError: (e) => toast.error(e.message),
  });

  const batchCreateMutation = trpc.content.keywords.batchCreate.useMutation({
    onSuccess: (data) => {
      utils.content.keywords.list.invalidate();
      setBatchText("");
      setBatchDialogOpen(false);
      toast.success(`成功添加 ${data.count} 个关键词`);
    },
    onError: (e) => toast.error(e.message),
  });

  const expandMutation = trpc.content.keywords.expand.useMutation({
    onSuccess: (data) => {
      setExpandedKws(data.keywords);
      toast.success(`扩展了 ${data.keywords.length} 个关键词`);
    },
    onError: (e) => toast.error(e.message),
  });

  const batchDeleteKwMutation = trpc.content.keywords.batchDelete.useMutation({
    onSuccess: () => {
      utils.content.keywords.list.invalidate();
      setSelectedIds([]);
      toast.success("批量删除成功");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.content.keywords.delete.useMutation({
    onSuccess: () => {
      utils.content.keywords.list.invalidate();
      toast.success("关键词已删除");
    },
    onError: (e) => toast.error(e.message),
  });

  const analyzeMutation = trpc.content.keywords.analyze.useMutation({
    onSuccess: (data) => {
      utils.content.keywords.list.invalidate();
      toast.success(`分析完成：搜索量 ~${data.searchVolume?.toLocaleString()}/月，难度 ${Math.round(data.difficulty ?? 0)}，${priorityConfig[data.priority ?? "medium"]?.label ?? data.priority}`);
    },
    onError: (e) => toast.error(`分析失败：${e.message}`),
  });

  const batchAnalyzeMutation = trpc.content.keywords.batchAnalyze.useMutation({
    onSuccess: (data) => {
      utils.content.keywords.list.invalidate();
      toast.success(`批量分析完成：${data.analyzed}/${data.total} 个关键词`);
      setSelectedIds([]);
    },
    onError: (e) => toast.error(e.message),
  });

  const generateMutation = trpc.content.generate.useMutation({
    onSuccess: (data) => {
      utils.materials.list.invalidate();
      toast.success(`文章生成成功：${data.title}（${data.wordCount} 字，质量分 ${data.qualityScore}）`);
    },
    onError: (e) => toast.error(e.message),
  });

  const generateWithTemplateMutation = trpc.seoTemplates.generateWithTemplate.useMutation({
    onSuccess: (data) => {
      utils.materials.list.invalidate();
      toast.success(`文章生成成功（${data.wordCount} 字）`);
    },
    onError: (e) => toast.error(e.message),
  });
  const { data: seoTemplates = [] } = trpc.seoTemplates.list.useQuery();
  const [newKeyword, setNewKeyword] = useState("");
  const [kwLang, setKwLang] = useState("zh-CN");
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchText, setBatchText] = useState("");
  const [selectedKw, setSelectedKw] = useState("");
  const [genLang, setGenLang] = useState("zh-CN");
  const [genStyle, setGenStyle] = useState("informational");
  const [genMinWords, setGenMinWords] = useState(800);
  const [expandedKws, setExpandedKws] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [longTailDialogOpen, setLongTailDialogOpen] = useState(false);
  const [longTailCoreKw, setLongTailCoreKw] = useState("");
  const [longTailCount, setLongTailCount] = useState(20);

  function handleAddKeyword() {
    if (!newKeyword.trim()) return;
    createKwMutation.mutate({ keyword: newKeyword.trim(), language: kwLang as any });
  }

  function handleBatchAdd() {
    const kws = batchText.split("\n").map(k => k.trim()).filter(Boolean);
    if (kws.length === 0) { toast.error("请输入关键词"); return; }
    batchCreateMutation.mutate({ keywords: kws, language: kwLang as any });
  }

  function handleExpand(kw: string) {
    expandMutation.mutate({ keyword: kw, language: genLang as any, count: 10 });
  }

  function handleGenerate() {
    if (!selectedKw) { toast.error("请选择关键词"); return; }
    if (selectedTemplateId) {
      generateWithTemplateMutation.mutate({
        templateId: selectedTemplateId,
        keyword: selectedKw,
        language: genLang as any,
      });
    } else {
      generateMutation.mutate({
        keyword: selectedKw,
        language: genLang as any,
        minWords: genMinWords,
        style: genStyle as any,
      });
    }
  }
  function handleLongTailGenerate() {
    if (!longTailCoreKw.trim()) { toast.error("请输入核心关键词"); return; }
    expandMutation.mutate(
      { keyword: longTailCoreKw.trim(), language: genLang as any, count: longTailCount },
      {
        onSuccess: (data) => {
          batchCreateMutation.mutate(
            { keywords: data.keywords, language: genLang as any },
            {
              onSuccess: (res) => {
                setLongTailDialogOpen(false);
                setLongTailCoreKw("");
                toast.success(`已生成并保存 ${res.count} 个长尾关键词`);
              }
            }
          );
        }
      }
    );
  }

  function handleAnalyze(kw: Keyword) {
    setAnalyzingId(kw.id);
    analyzeMutation.mutate(
      { id: kw.id, keyword: kw.keyword, language: kw.language as any },
      { onSettled: () => setAnalyzingId(null) }
    );
  }

  function handleBatchAnalyze() {
    if (selectedIds.length === 0) { toast.error("请先选择关键词"); return; }
    batchAnalyzeMutation.mutate({ ids: selectedIds });
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  function toggleSelectAll() {
    if (selectedIds.length === (keywords as Keyword[]).length) {
      setSelectedIds([]);
    } else {
      setSelectedIds((keywords as Keyword[]).map(k => k.id));
    }
  }

  const analyzedCount = (keywords as Keyword[]).filter(k => k.difficulty != null).length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI内容生成</h1>
          <p className="text-sm text-muted-foreground mt-1">基于 AI 自动生成 SEO 优化文章，支持关键词竞争度分析</p>
        </div>
        <div className="flex items-center gap-2">
          <HelpTooltip />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Keywords */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Tags className="h-4 w-4 text-primary" />
                关键词库
                {(keywords as Keyword[]).length > 0 && (
                  <span className="text-xs text-muted-foreground font-normal">
                    ({(keywords as Keyword[]).length} 个，{analyzedCount} 已分析)
                  </span>
                )}
              </h2>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 border-purple-300 text-purple-600 hover:bg-purple-50"
                  onClick={() => setLongTailDialogOpen(true)}
                >
                  <Sparkles className="h-3 w-3" />
                  生成长尾词
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => setBatchDialogOpen(true)}
                >
                  <Plus className="h-3 w-3" />
                  批量添加
                </Button>
              </div>
            </div>

            {/* Add single keyword */}
            <div className="flex gap-2 mb-3">
              <Select value={kwLang} onValueChange={setKwLang}>
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">中文</SelectItem>
                  <SelectItem value="en">英文</SelectItem>
                  <SelectItem value="zh-TW">繁体</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="h-8 text-sm flex-1"
                placeholder="输入关键词"
                value={newKeyword}
                onChange={e => setNewKeyword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddKeyword()}
              />
              <Button
                size="sm"
                className="h-8 px-3"
                onClick={handleAddKeyword}
                disabled={createKwMutation.isPending}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Batch actions */}
            {(keywords as Keyword[]).length > 0 && (
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50">
                <button
                  onClick={toggleSelectAll}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {selectedIds.length === (keywords as Keyword[]).length ? "取消全选" : "全选"}
                </button>
                {selectedIds.length > 0 && (
                  <>
                    <span className="text-xs text-muted-foreground">已选 {selectedIds.length} 个</span>
                    <div className="flex items-center gap-1 ml-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={handleBatchAnalyze}
                        disabled={batchAnalyzeMutation.isPending}
                      >
                        {batchAnalyzeMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <BarChart2 className="h-3 w-3" />
                        )}
                        批量分析
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={() => {
                          if (confirm(`确认删除选中的 ${selectedIds.length} 个关键词？`)) {
                            batchDeleteKwMutation.mutate({ ids: selectedIds });
                          }
                        }}
                        disabled={batchDeleteKwMutation.isPending}
                      >
                        <Trash2 className="h-3 w-3" />
                        批量删除
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Keyword list */}
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {kwLoading ? (
                <div className="text-xs text-muted-foreground text-center py-4">加载中...</div>
              ) : (keywords as Keyword[]).length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-6">
                  <Tags className="h-6 w-6 mx-auto mb-2 opacity-40" />
                  暂无关键词
                </div>
              ) : (
                (keywords as Keyword[]).map((kw) => (
                  <div
                    key={kw.id}
                    className={`rounded-lg border transition-colors ${
                      selectedKw === kw.keyword
                        ? "bg-primary/5 border-primary/30"
                        : "bg-transparent border-transparent hover:bg-muted/40 hover:border-border/50"
                    }`}
                  >
                    <div
                      className="flex items-center gap-2 px-2.5 py-2 cursor-pointer"
                      onClick={() => setSelectedKw(kw.keyword)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(kw.id)}
                        onChange={e => { e.stopPropagation(); toggleSelect(kw.id); }}
                        onClick={e => e.stopPropagation()}
                        className="h-3.5 w-3.5 rounded border-gray-300 accent-primary shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm truncate text-foreground">{kw.keyword}</span>
                          {kw.priority && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${priorityConfig[kw.priority]?.color ?? ""}`}>
                              {priorityConfig[kw.priority]?.label ?? kw.priority}
                            </span>
                          )}
                        </div>
                        {kw.difficulty != null && (
                          <div className="flex items-center gap-3 mt-0.5">
                            <DifficultyBar value={kw.difficulty} />
                            {kw.searchVolume != null && (
                              <span className="text-[10px] text-muted-foreground">
                                ~{kw.searchVolume >= 1000 ? `${(kw.searchVolume / 1000).toFixed(1)}k` : kw.searchVolume}/月
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); handleAnalyze(kw); }}
                          className="h-5 w-5 flex items-center justify-center rounded hover:bg-blue-50 text-muted-foreground hover:text-blue-600 transition-colors"
                          title="竞争度分析"
                          disabled={analyzingId === kw.id}
                        >
                          {analyzingId === kw.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <BarChart2 className="h-3 w-3" />
                          )}
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); handleExpand(kw.keyword); }}
                          className="h-5 w-5 flex items-center justify-center rounded hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                          title="AI扩展关键词"
                        >
                          <Wand2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); deleteMutation.mutate({ id: kw.id }); }}
                          className="h-5 w-5 flex items-center justify-center rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                          title="删除"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Expanded keywords */}
          {expandedKws.length > 0 && (
            <div className="bg-white rounded-xl border border-border shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-purple-500" />
                  AI扩展关键词
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    batchCreateMutation.mutate({ keywords: expandedKws, language: kwLang as any });
                    setExpandedKws([]);
                  }}
                >
                  全部添加
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {expandedKws.map((kw, i) => (
                  <span
                    key={i}
                    onClick={() => setSelectedKw(kw)}
                    className="px-2.5 py-1 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-200 cursor-pointer hover:bg-purple-100 transition-colors"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Keyword stats */}
          {(keywords as Keyword[]).length > 0 && analyzedCount > 0 && (
            <div className="bg-white rounded-xl border border-border shadow-sm p-4">
              <h3 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                竞争度统计
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {(["high", "medium", "low"] as const).map(p => {
                  const count = (keywords as Keyword[]).filter(k => k.priority === p).length;
                  return (
                    <div key={p} className="text-center">
                      <div className={`text-lg font-bold ${p === "high" ? "text-green-600" : p === "medium" ? "text-yellow-600" : "text-gray-500"}`}>
                        {count}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{priorityConfig[p].label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Generation Config */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              文章生成配置
            </h2>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>目标关键词</Label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder="选择左侧关键词或直接输入"
                    value={selectedKw}
                    onChange={e => setSelectedKw(e.target.value)}
                  />
                </div>
                {selectedKw && (() => {
                  const kw = (keywords as Keyword[]).find(k => k.keyword === selectedKw);
                  if (!kw || kw.difficulty == null) return null;
                  return (
                    <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                      <span>竞争难度：</span>
                      <DifficultyBar value={kw.difficulty} />
                      {kw.searchVolume != null && <span>搜索量 ~{kw.searchVolume.toLocaleString()}/月</span>}
                      {kw.priority && <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${priorityConfig[kw.priority]?.color ?? ""}`}>{priorityConfig[kw.priority]?.label}</span>}
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-1.5">
                <Label>SEO 模板 <span className="text-muted-foreground text-xs font-normal">（可选，选择后按模板结构生成）</span></Label>
                <Select value={selectedTemplateId ? String(selectedTemplateId) : "none"} onValueChange={v => setSelectedTemplateId(v === "none" ? null : Number(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="不使用模板（自由生成）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不使用模板（自由生成）</SelectItem>
                    {(seoTemplates as any[]).map((t: any) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        <span className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          {t.name}
                          {t.usageCount > 0 && <span className="text-[10px] text-muted-foreground ml-1">已用 {t.usageCount} 次</span>}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedTemplateId && (
                  <p className="text-xs text-primary">✓ 将按「{(seoTemplates as any[]).find((t: any) => t.id === selectedTemplateId)?.name}」模板结构生成文章</p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>文章语言</Label>
                  <Select value={genLang} onValueChange={setGenLang}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zh-CN">简体中文</SelectItem>
                      <SelectItem value="en">英文</SelectItem>
                      <SelectItem value="zh-TW">繁体中文</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>文章类型</Label>
                  <Select value={genStyle} onValueChange={setGenStyle}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="informational">信息型</SelectItem>
                      <SelectItem value="commercial">商业型</SelectItem>
                      <SelectItem value="navigational">导航型</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>最少字数</Label>
                  <Input
                    type="number"
                    min={300}
                    max={5000}
                    step={100}
                    value={genMinWords}
                    onChange={e => setGenMinWords(parseInt(e.target.value) || 800)}
                  />
                </div>
              </div>

              <div className="bg-muted/40 rounded-lg p-4 text-xs text-muted-foreground space-y-1.5">
                <p className="font-medium text-foreground text-sm">生成说明</p>
                <p>• 使用内置 AI 模型生成高质量 SEO 文章</p>
                <p>• 关键词密度 0.5%~2%，自然融入，避免堆砌</p>
                <p>• 生成完成后自动保存到素材库，状态为「待审核」</p>
                <p>• 预计生成时间：10~30 秒</p>
              </div>

              <Button
                className="w-full gap-2"
                size="lg"
                onClick={handleGenerate}
                disabled={(generateMutation.isPending || generateWithTemplateMutation.isPending) || !selectedKw}
              >
                {(generateMutation.isPending || generateWithTemplateMutation.isPending) ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    AI 生成中，请稍候...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {selectedTemplateId ? "按模板生成文章" : "生成文章"}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Competition Analysis Panel */}
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-blue-500" />
              关键词竞争度分析
            </h2>
            <div className="text-xs text-muted-foreground space-y-2">
              <p>竞争度分析帮助你识别哪些关键词更容易获得 Google 收录：</p>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                  <div className="text-green-700 font-semibold text-sm mb-1">高优先级</div>
                  <div className="text-green-600 text-xs">高搜索量 + 低竞争</div>
                  <div className="text-green-600 text-xs mt-1">最佳 SEO 机会</div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-100">
                  <div className="text-yellow-700 font-semibold text-sm mb-1">中优先级</div>
                  <div className="text-yellow-600 text-xs">中等搜索量/竞争</div>
                  <div className="text-yellow-600 text-xs mt-1">稳健增长选择</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <div className="text-gray-600 font-semibold text-sm mb-1">低优先级</div>
                  <div className="text-gray-500 text-xs">低搜索量或高竞争</div>
                  <div className="text-gray-500 text-xs mt-1">可暂缓处理</div>
                </div>
              </div>
              <p className="mt-2">点击关键词旁的 <BarChart2 className="h-3 w-3 inline" /> 图标进行单个分析，或选中多个关键词后点击「批量分析」。</p>
            </div>
          </div>

          {/* Recent generations */}
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              最近生成记录
            </h2>
            <p className="text-xs text-muted-foreground">
              生成的文章已自动保存到
              <button
                className="text-primary hover:underline mx-1"
                onClick={() => window.location.hash = "/materials"}
              >
                素材库
              </button>
              中，请前往素材库查看和管理。
            </p>
          </div>
        </div>
      </div>

      {/* Long-tail Keyword Generation Dialog */}
      <Dialog open={longTailDialogOpen} onOpenChange={setLongTailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-500" />
              批量生成长尾关键词
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>核心关键词</Label>
              <Input
                placeholder="如：日本留学签证"
                value={longTailCoreKw}
                onChange={e => setLongTailCoreKw(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLongTailGenerate()}
              />
              <p className="text-xs text-muted-foreground">AI 将围绕此核心词生成相关长尾关键词</p>
            </div>
            <div className="space-y-1.5">
              <Label>生成数量：{longTailCount} 个</Label>
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                value={longTailCount}
                onChange={e => setLongTailCount(Number(e.target.value))}
                className="w-full accent-purple-500"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>5 个</span>
                <span>50 个</span>
              </div>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-xs text-purple-700 space-y-1">
              <p className="font-medium">生成说明</p>
              <p>• AI 分析核心词，生成相关长尾词（含疑问词、地域词、修饰词等）</p>
              <p>• 生成后自动保存到关键词库，可直接用于文章生成</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setLongTailDialogOpen(false)}>取消</Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
              onClick={handleLongTailGenerate}
              disabled={expandMutation.isPending || batchCreateMutation.isPending}
            >
              {(expandMutation.isPending || batchCreateMutation.isPending) ? (
                <><Loader2 className="h-4 w-4 animate-spin" />生成中...</>
              ) : (
                <><Sparkles className="h-4 w-4" />生成并保存</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {/* Batch Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>批量添加关键词</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>语言</Label>
              <Select value={kwLang} onValueChange={setKwLang}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">简体中文</SelectItem>
                  <SelectItem value="en">英文</SelectItem>
                  <SelectItem value="zh-TW">繁体中文</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>关键词列表（每行一个）</Label>
              <Textarea
                className="h-40 resize-none font-mono text-sm"
                placeholder={"关键词1\n关键词2\n关键词3"}
                value={batchText}
                onChange={e => setBatchText(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                共 {batchText.split("\n").filter(k => k.trim()).length} 个关键词
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>取消</Button>
            <Button onClick={handleBatchAdd} disabled={batchCreateMutation.isPending}>
              {batchCreateMutation.isPending ? "添加中..." : "批量添加"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
