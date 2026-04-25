import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Plus, Zap, BookOpen, List, BarChart2, MapPin, Edit2, Trash2, Play,
  ChevronDown, ChevronUp, Eye, X, Link2, Globe, Image, Table2,
  HelpCircle, Heading1, Heading2, Heading3, AlignLeft, Settings2, FileText
} from "lucide-react";

// ─── 板块类型定义 ─────────────────────────────────────────────────────────────
const BLOCK_TYPES = [
  { type: "h1", label: "H1 标题", icon: Heading1, color: "bg-red-50 text-red-700 border-red-200", desc: "文章主标题，每篇文章只有一个" },
  { type: "h2", label: "H2 小节", icon: Heading2, color: "bg-orange-50 text-orange-700 border-orange-200", desc: "主要章节标题，建议3-6个" },
  { type: "h3", label: "H3 子节", icon: Heading3, color: "bg-yellow-50 text-yellow-700 border-yellow-200", desc: "H2下的子章节，细化内容" },
  { type: "paragraph", label: "段落正文", icon: AlignLeft, color: "bg-blue-50 text-blue-700 border-blue-200", desc: "普通段落内容，支持关键词插入" },
  { type: "faq", label: "FAQ 问答", icon: HelpCircle, color: "bg-green-50 text-green-700 border-green-200", desc: "常见问题解答，提升SEO长尾词覆盖" },
  { type: "links", label: "超链接列表", icon: Link2, color: "bg-purple-50 text-purple-700 border-purple-200", desc: "相关推荐链接，可设置布局和样式" },
  { type: "embed", label: "内嵌网站", icon: Globe, color: "bg-cyan-50 text-cyan-700 border-cyan-200", desc: "嵌入外部网页（iframe），可设置高度" },
  { type: "image", label: "图片占位", icon: Image, color: "bg-pink-50 text-pink-700 border-pink-200", desc: "图片展示区域，AI生成时自动填充" },
  { type: "table", label: "表格", icon: Table2, color: "bg-indigo-50 text-indigo-700 border-indigo-200", desc: "对比表格，适合评测和列表型文章" },
] as const;

type BlockType = typeof BLOCK_TYPES[number]["type"];

interface TemplateBlock {
  id: string;
  type: BlockType;
  title: string;
  contentHint: string;
  minWords?: number;
  linkColumns?: number;
  linkHeight?: number;
  linkStyle?: "card" | "list" | "button";
  embedUrl?: string;
  embedHeight?: number;
  tableColumns?: string;
  tableRows?: number;
}

const TEMPLATE_TYPES = [
  { value: "informational", label: "信息型", icon: BookOpen, color: "bg-blue-100 text-blue-700", desc: "什么是X / X的定义与原理" },
  { value: "howto", label: "操作指南型", icon: Zap, color: "bg-green-100 text-green-700", desc: "如何做X / X的完整教程" },
  { value: "comparison", label: "对比评测型", icon: BarChart2, color: "bg-purple-100 text-purple-700", desc: "X vs Y / 最佳X选择" },
  { value: "listicle", label: "列表型", icon: List, color: "bg-orange-100 text-orange-700", desc: "10个最佳X / X的5大优势" },
  { value: "local", label: "本地化型", icon: MapPin, color: "bg-rose-100 text-rose-700", desc: "X城市的Y / 本地X指南" },
];

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

function getBlockTypeInfo(type: BlockType) {
  return BLOCK_TYPES.find(b => b.type === type) ?? BLOCK_TYPES[0];
}

// ─── 板块预览组件 ─────────────────────────────────────────────────────────────
function BlockPreview({ blocks }: { blocks: TemplateBlock[] }) {
  if (blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm">
        <Eye className="h-8 w-8 mb-2 opacity-30" />
        <p>添加板块后在此预览文章结构</p>
      </div>
    );
  }
  return (
    <div className="space-y-1.5 text-sm">
      {blocks.map((block, i) => {
        const info = getBlockTypeInfo(block.type);
        const indent = ["h3", "paragraph", "faq", "links", "embed", "image", "table"].includes(block.type) ? (block.type === "h3" ? "ml-6" : "ml-4") : "";
        const prefix = block.type === "h1" ? "# " : block.type === "h2" ? "## " : block.type === "h3" ? "### " : "";
        return (
          <div key={block.id} className={`flex items-center gap-2 ${indent}`}>
            <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded border ${info.color} shrink-0`}>{info.label}</span>
            <span className={`truncate ${block.type === "h1" ? "font-bold text-base" : block.type === "h2" ? "font-semibold text-sm" : block.type === "h3" ? "font-medium text-sm" : "text-muted-foreground text-xs"}`}>
              {prefix}{block.title || `（${info.label}）`}
            </span>
            {block.type === "links" && block.linkColumns && (
              <span className="text-xs text-purple-500 shrink-0">{block.linkColumns}列</span>
            )}
            {block.type === "embed" && block.embedHeight && (
              <span className="text-xs text-cyan-500 shrink-0">{block.embedHeight}px</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 单个板块编辑器 ───────────────────────────────────────────────────────────
function BlockEditor({ block, onChange, onDelete, onMoveUp, onMoveDown, isFirst, isLast }: {
  block: TemplateBlock;
  onChange: (b: TemplateBlock) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const info = getBlockTypeInfo(block.type);
  const Icon = info.icon;

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
        <span className={`text-xs px-1.5 py-0.5 rounded border ${info.color} shrink-0`}>
          <Icon className="h-3 w-3 inline mr-1" />
          {info.label}
        </span>
        <span className="text-sm font-medium text-foreground flex-1 truncate">
          {block.title || `（${info.label}）`}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={onMoveUp} disabled={isFirst} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30">
            <ChevronUp className="h-3 w-3" />
          </button>
          <button onClick={onMoveDown} disabled={isLast} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30">
            <ChevronDown className="h-3 w-3" />
          </button>
          <button onClick={() => setExpanded(e => !e)} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted">
            <Edit2 className="h-3 w-3" />
          </button>
          <button onClick={onDelete} className="h-5 w-5 flex items-center justify-center rounded hover:bg-red-50 text-muted-foreground hover:text-red-500">
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-3 space-y-3 border-t bg-white">
          <div className="space-y-1">
            <Label className="text-xs">板块标题 / 提示文字</Label>
            <Input className="h-7 text-sm" placeholder={`如：${info.desc}`} value={block.title} onChange={e => onChange({ ...block, title: e.target.value })} />
          </div>

          {["paragraph", "h2", "h3", "faq"].includes(block.type) && (
            <div className="space-y-1">
              <Label className="text-xs">AI 内容提示</Label>
              <Textarea className="text-sm min-h-[60px]" placeholder="告诉AI这个板块应该写什么内容" value={block.contentHint} onChange={e => onChange({ ...block, contentHint: e.target.value })} />
            </div>
          )}

          {["paragraph", "h2", "h3"].includes(block.type) && (
            <div className="space-y-1">
              <Label className="text-xs">最少字数</Label>
              <Input type="number" className="h-7 text-sm w-32" min={50} max={2000} value={block.minWords ?? 150} onChange={e => onChange({ ...block, minWords: Number(e.target.value) })} />
            </div>
          )}

          {block.type === "links" && (
            <div className="space-y-3 p-3 bg-purple-50/50 rounded-lg border border-purple-100">
              <p className="text-xs font-medium text-purple-700">超链接板块设置</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">列数</Label>
                  <Select value={String(block.linkColumns ?? 2)} onValueChange={v => onChange({ ...block, linkColumns: Number(v) })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map(n => <SelectItem key={n} value={String(n)}>{n} 列</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">高度 (px)</Label>
                  <Input type="number" className="h-7 text-xs" min={40} max={400} value={block.linkHeight ?? 60} onChange={e => onChange({ ...block, linkHeight: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">链接样式</Label>
                  <Select value={block.linkStyle ?? "card"} onValueChange={v => onChange({ ...block, linkStyle: v as any })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="card">卡片式</SelectItem>
                      <SelectItem value="list">列表式</SelectItem>
                      <SelectItem value="button">按钮式</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">内容提示</Label>
                <Input className="h-7 text-xs" placeholder="如：插入3个相关文章内链" value={block.contentHint} onChange={e => onChange({ ...block, contentHint: e.target.value })} />
              </div>
            </div>
          )}

          {block.type === "embed" && (
            <div className="space-y-3 p-3 bg-cyan-50/50 rounded-lg border border-cyan-100">
              <p className="text-xs font-medium text-cyan-700">内嵌网站设置</p>
              <div className="space-y-1">
                <Label className="text-xs">嵌入 URL（可留空）</Label>
                <Input className="h-7 text-xs" placeholder="https://example.com" value={block.embedUrl ?? ""} onChange={e => onChange({ ...block, embedUrl: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">高度 (px)</Label>
                <Input type="number" className="h-7 text-xs w-32" min={100} max={1200} value={block.embedHeight ?? 400} onChange={e => onChange({ ...block, embedHeight: Number(e.target.value) })} />
              </div>
            </div>
          )}

          {block.type === "table" && (
            <div className="space-y-3 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
              <p className="text-xs font-medium text-indigo-700">表格设置</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">列名（逗号分隔）</Label>
                  <Input className="h-7 text-xs" placeholder="名称,价格,评分" value={block.tableColumns ?? ""} onChange={e => onChange({ ...block, tableColumns: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">行数</Label>
                  <Input type="number" className="h-7 text-xs" min={2} max={20} value={block.tableRows ?? 5} onChange={e => onChange({ ...block, tableRows: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">内容提示</Label>
                <Input className="h-7 text-xs" placeholder="如：对比5种方案的价格和功能" value={block.contentHint} onChange={e => onChange({ ...block, contentHint: e.target.value })} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function SeoTemplates() {
  const [showEditor, setShowEditor] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [generateForm, setGenerateForm] = useState({ keyword: "", language: "zh-CN" });
  const [showHelp, setShowHelp] = useState(false);

  const [editorForm, setEditorForm] = useState({
    name: "", type: "informational" as any, description: "", promptTemplate: "", minWords: 800, maxWords: 1500,
    siteNameSuffix: "", embedUrl: "", embedWidth: "100%", embedHeight: "600px", embedPosition: "bottom" as "bottom" | "top",
  });
  const [blocks, setBlocks] = useState<TemplateBlock[]>([]);
  const [checkedTypes, setCheckedTypes] = useState<Set<BlockType>>(new Set());

  const { data: templates = [], refetch } = trpc.seoTemplates.list.useQuery();
  const createMut = trpc.seoTemplates.create.useMutation({ onSuccess: () => { refetch(); setShowEditor(false); toast.success("模板创建成功"); } });
  const updateMut = trpc.seoTemplates.update.useMutation({ onSuccess: () => { refetch(); setShowEditor(false); toast.success("模板已更新"); } });
  const deleteMut = trpc.seoTemplates.delete.useMutation({ onSuccess: () => { refetch(); toast.success("模板已删除"); } });
  const generateMut = trpc.seoTemplates.generateWithTemplate.useMutation({
    onSuccess: (data) => { setShowGenerate(false); toast.success(`文章生成成功！已生成 ${data.wordCount} 字，已保存到素材库`); },
    onError: (e) => toast.error(`生成失败：${e.message}`),
  });

  function openCreate() {
    setEditingTemplate(null);
    setEditorForm({ name: "", type: "informational", description: "", promptTemplate: "", minWords: 800, maxWords: 1500, siteNameSuffix: "", embedUrl: "", embedWidth: "100%", embedHeight: "600px", embedPosition: "bottom" as "bottom" | "top" });
    setBlocks([]);
    setCheckedTypes(new Set());
    setShowEditor(true);
  }

  function openEdit(tpl: any) {
    setEditingTemplate(tpl);
    setEditorForm({ name: tpl.name, type: tpl.type, description: tpl.description ?? "", promptTemplate: tpl.promptTemplate ?? "", minWords: tpl.minWords ?? 800, maxWords: tpl.maxWords ?? 1500, siteNameSuffix: (tpl as any).siteNameSuffix ?? "", embedUrl: (tpl as any).embedUrl ?? "", embedWidth: (tpl as any).embedWidth ?? "100%", embedHeight: (tpl as any).embedHeight ?? "600px", embedPosition: ((tpl as any).embedPosition ?? "bottom") as "bottom" | "top" });
    const savedBlocks: TemplateBlock[] = tpl.structure?.blocks ?? [];
    setBlocks(savedBlocks);
    setCheckedTypes(new Set(savedBlocks.map((b: TemplateBlock) => b.type)));
    setShowEditor(true);
  }

  function toggleBlockType(type: BlockType) {
    setCheckedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
        setBlocks(bs => bs.filter(b => b.type !== type));
      } else {
        next.add(type);
        const info = getBlockTypeInfo(type);
        const newBlock: TemplateBlock = {
          id: genId(), type, title: info.label, contentHint: info.desc,
          ...(type === "links" ? { linkColumns: 2, linkHeight: 60, linkStyle: "card" } : {}),
          ...(type === "embed" ? { embedHeight: 400 } : {}),
          ...(type === "table" ? { tableRows: 5 } : {}),
          ...((type === "paragraph" || type === "h2" || type === "h3") ? { minWords: 150 } : {}),
        };
        setBlocks(bs => [...bs, newBlock]);
      }
      return next;
    });
  }

  function updateBlock(id: string, updated: TemplateBlock) {
    setBlocks(bs => bs.map(b => b.id === id ? updated : b));
  }

  function deleteBlock(id: string) {
    const block = blocks.find(b => b.id === id);
    if (block) setCheckedTypes(prev => { const next = new Set(prev); next.delete(block.type); return next; });
    setBlocks(bs => bs.filter(b => b.id !== id));
  }

  function moveBlock(id: string, dir: "up" | "down") {
    setBlocks(bs => {
      const idx = bs.findIndex(b => b.id === id);
      if (idx < 0) return bs;
      const next = [...bs];
      const swap = dir === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return bs;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  function buildAutoPrompt() {
    if (blocks.length === 0) return editorForm.promptTemplate;
    const lines = [
      `你是SEO内容专家。请为关键词「{keyword}」创作一篇${editorForm.minWords}字以上的文章，语言{language}。`,
      `文章结构如下（严格按照顺序）：`,
    ];
    blocks.forEach((b, i) => {
      const info = getBlockTypeInfo(b.type);
      let line = `${i + 1}. [${info.label}] ${b.title}`;
      if (b.contentHint) line += `：${b.contentHint}`;
      if (b.minWords) line += `（不少于${b.minWords}字）`;
      if (b.type === "links") line += `（${b.linkColumns}列${b.linkStyle === "card" ? "卡片" : b.linkStyle === "list" ? "列表" : "按钮"}样式，高度${b.linkHeight}px）`;
      if (b.type === "embed") line += `（嵌入高度${b.embedHeight}px${b.embedUrl ? `，URL：${b.embedUrl}` : ""}）`;
      if (b.type === "table") line += `（${b.tableRows}行，列：${b.tableColumns ?? "自动"}）`;
      lines.push(line);
    });
    lines.push(`\n要求：关键词密度1-2%，自然融入；Markdown格式输出。`);
    return lines.join("\n");
  }

  function handleSave() {
    const finalPrompt = editorForm.promptTemplate.trim() || buildAutoPrompt();
    const structure = { blocks };
    if (editingTemplate) {
      updateMut.mutate({ id: editingTemplate.id, name: editorForm.name, description: editorForm.description || undefined, promptTemplate: finalPrompt, minWords: editorForm.minWords, maxWords: editorForm.maxWords, structure, siteNameSuffix: (editorForm as any).siteNameSuffix || undefined, embedUrl: (editorForm as any).embedUrl || undefined, embedWidth: (editorForm as any).embedWidth || undefined, embedHeight: (editorForm as any).embedHeight || undefined, embedPosition: (editorForm as any).embedPosition || undefined });
    } else {
      createMut.mutate({ name: editorForm.name, type: editorForm.type, description: editorForm.description || undefined, promptTemplate: finalPrompt, minWords: editorForm.minWords, maxWords: editorForm.maxWords, structure, siteNameSuffix: (editorForm as any).siteNameSuffix || undefined, embedUrl: (editorForm as any).embedUrl || undefined, embedWidth: (editorForm as any).embedWidth || undefined, embedHeight: (editorForm as any).embedHeight || undefined, embedPosition: (editorForm as any).embedPosition || undefined });
    }
  }

  const getTypeInfo = (type: string) => TEMPLATE_TYPES.find(t => t.value === type) ?? TEMPLATE_TYPES[0];

  return (
    <div className="p-6 space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SEO 文章模板</h1>
          <p className="text-sm text-muted-foreground mt-1">自定义文章板块结构，AI生成时自动套用模板生成高质量SEO文章</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHelp(true)} className="h-7 w-7 flex items-center justify-center rounded-full border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="帮助">
            <HelpCircle className="h-4 w-4" />
          </button>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-2" />新建模板</Button>
        </div>
      </div>

      {/* 模板列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(templates as any[]).map((tpl: any) => {
          const typeInfo = getTypeInfo(tpl.type);
          const Icon = typeInfo.icon;
          const savedBlocks: TemplateBlock[] = tpl.structure?.blocks ?? [];
          return (
            <Card key={tpl.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${typeInfo.color}`}><Icon className="w-4 h-4" /></div>
                    <div>
                      <CardTitle className="text-base">{tpl.name}</CardTitle>
                      <Badge variant="outline" className="text-xs mt-1">{typeInfo.label}</Badge>
                    </div>
                  </div>
                  {tpl.isPreset && <Badge className="text-xs bg-amber-100 text-amber-700 border-amber-200">预设</Badge>}
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {tpl.description && <p className="text-xs text-muted-foreground">{tpl.description}</p>}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span><FileText className="h-3 w-3 inline mr-1" />{tpl.minWords}–{tpl.maxWords} 字</span>
                  {tpl.usageCount > 0 && <span>已使用 {tpl.usageCount} 次</span>}
                </div>
                {savedBlocks.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {savedBlocks.slice(0, 6).map((b: TemplateBlock) => {
                      const bInfo = getBlockTypeInfo(b.type);
                      return <span key={b.id} className={`text-[10px] px-1.5 py-0.5 rounded border ${bInfo.color}`}>{bInfo.label}</span>;
                    })}
                    {savedBlocks.length > 6 && <span className="text-[10px] px-1.5 py-0.5 rounded border bg-muted text-muted-foreground">+{savedBlocks.length - 6}</span>}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" className="h-7 text-xs flex-1" onClick={() => { setSelectedTemplate(tpl); setShowGenerate(true); }}>
                    <Play className="h-3 w-3 mr-1" />用此模板生成
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(tpl)}>
                    <Edit2 className="h-3 w-3 mr-1" />编辑
                  </Button>
                  {!tpl.isPreset && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500" onClick={() => deleteMut.mutate({ id: tpl.id })}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ─── 模板编辑器弹窗 ─── */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              {editingTemplate ? `编辑模板：${editingTemplate.name}` : "新建 SEO 文章模板"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden">
            {/* 左侧：基本设置 + 板块选择 + 板块列表 */}
            <div className="w-[55%] border-r overflow-y-auto p-5 space-y-5">
              {/* 基本信息 */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">基本信息</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">模板名称 *</Label>
                    <Input className="h-8" placeholder="如：信息型SEO文章" value={editorForm.name} onChange={e => setEditorForm(f => ({ ...f, name: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">模板类型</Label>
                    <Select value={editorForm.type} onValueChange={v => setEditorForm(f => ({ ...f, type: v as any }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TEMPLATE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">最少字数</Label>
                    <Input type="number" className="h-8" value={editorForm.minWords} onChange={e => setEditorForm(f => ({ ...f, minWords: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">最多字数</Label>
                    <Input type="number" className="h-8" value={editorForm.maxWords} onChange={e => setEditorForm(f => ({ ...f, maxWords: Number(e.target.value) }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">模板描述（可选）</Label>
                  <Input className="h-8" placeholder="简述该模板适用场景" value={editorForm.description} onChange={e => setEditorForm(f => ({ ...f, description: e.target.value }))} />
                </div>
              </div>

              {/* 板块类型勾选 */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">选择板块类型</h3>
                <div className="grid grid-cols-3 gap-2">
                  {BLOCK_TYPES.map(bt => {
                    const Icon = bt.icon;
                    const checked = checkedTypes.has(bt.type);
                    return (
                      <label key={bt.type} className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${checked ? `${bt.color} border-current` : "bg-muted/30 border-border hover:bg-muted/60"}`}>
                        <Checkbox checked={checked} onCheckedChange={() => toggleBlockType(bt.type)} className="mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <Icon className="h-3 w-3 shrink-0" />
                            <span className="text-xs font-medium truncate">{bt.label}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight line-clamp-2">{bt.desc}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* 板块列表 */}
              {blocks.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">板块顺序与设置</h3>
                  <div className="space-y-2">
                    {blocks.map((block, idx) => (
                      <BlockEditor
                        key={block.id}
                        block={block}
                        onChange={updated => updateBlock(block.id, updated)}
                        onDelete={() => deleteBlock(block.id)}
                        onMoveUp={() => moveBlock(block.id, "up")}
                        onMoveDown={() => moveBlock(block.id, "down")}
                        isFirst={idx === 0}
                        isLast={idx === blocks.length - 1}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 自定义 Prompt */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">AI 提示词（高级）</h3>
                  <button className="text-xs text-primary hover:underline" onClick={() => setEditorForm(f => ({ ...f, promptTemplate: buildAutoPrompt() }))}>
                    根据板块自动生成
                  </button>
                </div>
                <Textarea rows={5} className="text-xs font-mono" placeholder="留空则根据板块自动生成提示词。支持占位符：{keyword} {language} {minWords}" value={editorForm.promptTemplate} onChange={e => setEditorForm(f => ({ ...f, promptTemplate: e.target.value }))} />
                <p className="text-xs text-muted-foreground">留空时系统将根据上方板块配置自动生成提示词</p>
              </div>

              {/* 发布设置 */}
              <div className="space-y-3 border-t pt-4">
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <span>🌐</span> 发布设置
                </h3>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">站点名称后缀</label>
                  <input
                    className="w-full h-8 px-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="如：免费下载 教程（发布时站点名 = 关键词 + 后缀）"
                    value={(editorForm as any).siteNameSuffix ?? ""}
                    onChange={e => setEditorForm(f => ({ ...f, siteNameSuffix: e.target.value } as any))}
                  />
                  <p className="text-xs text-muted-foreground">留空则仅用关键词作为站点名称</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">内嵌网站 URL</label>
                  <input
                    className="w-full h-8 px-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    placeholder="https://example.com（留空则不嵌入）"
                    value={(editorForm as any).embedUrl ?? ""}
                    onChange={e => setEditorForm(f => ({ ...f, embedUrl: e.target.value } as any))}
                  />
                </div>
                {(editorForm as any).embedUrl && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">宽度</label>
                      <input
                        className="w-full h-8 px-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="100%"
                        value={(editorForm as any).embedWidth ?? "100%"}
                        onChange={e => setEditorForm(f => ({ ...f, embedWidth: e.target.value } as any))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">高度</label>
                      <input
                        className="w-full h-8 px-3 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        placeholder="600px"
                        value={(editorForm as any).embedHeight ?? "600px"}
                        onChange={e => setEditorForm(f => ({ ...f, embedHeight: e.target.value } as any))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">嵌入位置</label>
                      <select
                        className="w-full h-8 px-2 text-xs rounded-md border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                        value={(editorForm as any).embedPosition ?? "bottom"}
                        onChange={e => setEditorForm(f => ({ ...f, embedPosition: e.target.value } as any))}
                      >
                        <option value="bottom">文章底部</option>
                        <option value="top">文章顶部</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 右侧：结构预览 */}
            <div className="w-[45%] overflow-y-auto p-5 bg-muted/20">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">文章结构预览</h3>
                <span className="text-xs text-muted-foreground ml-auto">{blocks.length} 个板块</span>
              </div>
              <div className="bg-white rounded-lg border p-4 min-h-[200px]">
                <BlockPreview blocks={blocks} />
              </div>
              {blocks.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-700 space-y-1">
                  <p className="font-medium">板块统计</p>
                  <p>标题层级：{blocks.filter(b => b.type === "h1").length} H1 / {blocks.filter(b => b.type === "h2").length} H2 / {blocks.filter(b => b.type === "h3").length} H3</p>
                  <p>内容板块：{blocks.filter(b => b.type === "paragraph").length} 段落 / {blocks.filter(b => b.type === "faq").length} FAQ</p>
                  {blocks.some(b => b.type === "links") && <p>超链接板块：{blocks.filter(b => b.type === "links").length} 个</p>}
                  {blocks.some(b => b.type === "embed") && <p>内嵌网站：{blocks.filter(b => b.type === "embed").length} 个</p>}
                  {blocks.some(b => b.type === "table") && <p>表格：{blocks.filter(b => b.type === "table").length} 个</p>}
                  <p className="mt-2 text-blue-600 font-medium">预计最少字数：{blocks.reduce((s, b) => s + (b.minWords ?? 0), 0)} 字</p>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t shrink-0 bg-background">
            <Button variant="outline" onClick={() => setShowEditor(false)}>取消</Button>
            <Button disabled={!editorForm.name || createMut.isPending || updateMut.isPending} onClick={handleSave}>
              {(createMut.isPending || updateMut.isPending) ? "保存中..." : (editingTemplate ? "保存修改" : "创建模板")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 用模板生成文章弹窗 ─── */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>使用「{selectedTemplate?.name}」生成文章</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>目标关键词 *</Label>
              <Input placeholder="输入核心关键词，如：Python 教程" value={generateForm.keyword} onChange={e => setGenerateForm(f => ({ ...f, keyword: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>文章语言</Label>
              <Select value={generateForm.language} onValueChange={v => setGenerateForm(f => ({ ...f, language: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh-CN">中文（简体）</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="zh-TW">中文（繁体）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {selectedTemplate && (
              <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">模板规格</p>
                <p>字数：{selectedTemplate.minWords}–{selectedTemplate.maxWords} 字</p>
                <p>类型：{getTypeInfo(selectedTemplate.type).label}</p>
                {(selectedTemplate.structure?.blocks ?? []).length > 0 && (
                  <p>板块：{(selectedTemplate.structure.blocks as TemplateBlock[]).map(b => getBlockTypeInfo(b.type).label).join(" → ")}</p>
                )}
                <p className="text-xs">生成后自动保存到素材库（待审核状态）</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>取消</Button>
            <Button disabled={!generateForm.keyword || generateMut.isPending} onClick={() => selectedTemplate && generateMut.mutate({ templateId: selectedTemplate.id, keyword: generateForm.keyword, language: generateForm.language as any })}>
              {generateMut.isPending ? "AI 生成中..." : "开始生成"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 帮助弹窗 ─── */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />SEO 模板使用教程
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-muted-foreground py-2">
            <div>
              <p className="font-semibold text-foreground mb-1">什么是 SEO 模板？</p>
              <p>SEO 模板定义了文章的板块结构，AI 生成文章时会严格按照模板的板块顺序和要求来创作，确保文章结构规范、SEO 友好。</p>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">如何创建模板？</p>
              <p>1. 点击「新建模板」，填写名称和类型；2. 在「选择板块类型」中勾选需要的板块；3. 点击板块右侧编辑图标设置内容提示和字数；4. 右侧实时预览文章结构；5. 点击「创建模板」保存。</p>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">超链接板块怎么用？</p>
              <p>勾选「超链接列表」后，可设置列数（1-4列）、高度和样式（卡片/列表/按钮）。AI 生成时会在该位置插入相关推荐链接，适合做内链建设。</p>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">如何用模板生成文章？</p>
              <p>在模板卡片上点击「用此模板生成」，输入关键词后 AI 会按照模板结构生成文章，并自动保存到素材库。</p>
            </div>
          </div>
          <DialogFooter><Button onClick={() => setShowHelp(false)}>知道了</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
