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
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  Plus, Zap, BookOpen, List, BarChart2, MapPin, Edit2, Trash2, Play,
  ChevronDown, ChevronUp, Eye, X, Link2, Globe, Image, Table2,
  HelpCircle, Heading1, Heading2, Heading3, AlignLeft, Settings2, FileText,
  GripVertical, Type, Maximize2, AlignCenter, AlignLeft as AlignLeftIcon, AlignRight,
  Monitor, Smartphone, Tablet, ChevronRight, Layers, LayoutTemplate
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
  // 字体样式
  fontSize?: "sm" | "base" | "lg" | "xl" | "2xl";
  fontWeight?: "normal" | "medium" | "semibold" | "bold";
  textAlign?: "left" | "center" | "right";
  // 超链接设置
  linkColumns?: number;
  linkHeight?: number;
  linkStyle?: "card" | "list" | "button";
  // 内嵌网站设置
  embedUrl?: string;
  embedWidth?: string;
  embedHeight?: number;
  embedPosition?: "top" | "bottom" | "inline";
  // 表格设置
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

const FONT_SIZES = [
  { value: "sm", label: "小 (12px)" },
  { value: "base", label: "正常 (14px)" },
  { value: "lg", label: "大 (16px)" },
  { value: "xl", label: "特大 (18px)" },
  { value: "2xl", label: "超大 (22px)" },
];

const FONT_WEIGHTS = [
  { value: "normal", label: "常规" },
  { value: "medium", label: "中等" },
  { value: "semibold", label: "半粗" },
  { value: "bold", label: "粗体" },
];

function genId() {
  return Math.random().toString(36).slice(2, 10);
}
function getBlockTypeInfo(type: BlockType) {
  return BLOCK_TYPES.find(b => b.type === type) ?? BLOCK_TYPES[0];
}

// ─── 直观页面预览组件 ─────────────────────────────────────────────────────────
function PagePreview({ blocks, siteNameSuffix, embedUrl, embedWidth, embedHeight, embedPosition }: {
  blocks: TemplateBlock[];
  siteNameSuffix?: string;
  embedUrl?: string;
  embedWidth?: string;
  embedHeight?: string;
  embedPosition?: string;
}) {
  const [previewKeyword] = useState("示例关键词");

  if (blocks.length === 0 && !embedUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
        <LayoutTemplate className="h-12 w-12 mb-3 opacity-20" />
        <p className="font-medium">添加板块后预览页面效果</p>
        <p className="text-xs mt-1 opacity-70">右侧将显示真实页面布局</p>
      </div>
    );
  }

  const siteName = siteNameSuffix ? `${previewKeyword} ${siteNameSuffix}` : previewKeyword;
  const embedH = parseInt(embedHeight || "300") || 300;
  const embedW = embedWidth || "100%";

  // 构建预览内容（包含模板级别的内嵌网站）
  const renderEmbedBlock = (url: string, w: string, h: number, label?: string) => (
    <div className="rounded-lg overflow-hidden border border-cyan-200 bg-cyan-50/30">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-100/50 border-b border-cyan-200">
        <Globe className="h-3 w-3 text-cyan-600" />
        <span className="text-xs text-cyan-700 font-medium">{label || "内嵌网站"}</span>
        <span className="text-xs text-cyan-500 ml-auto">{w} × {h}px</span>
      </div>
      {url ? (
        <div className="relative bg-white" style={{ height: Math.min(h, 200) }}>
          <iframe
            src={url}
            className="w-full h-full border-0 pointer-events-none"
            style={{ transform: "scale(0.7)", transformOrigin: "top left", width: "143%", height: "143%" }}
            sandbox="allow-same-origin"
            title="预览"
          />
          <div className="absolute inset-0 bg-transparent" />
        </div>
      ) : (
        <div className="flex items-center justify-center bg-gray-50" style={{ height: Math.min(h, 120) }}>
          <p className="text-xs text-muted-foreground">填写 URL 后显示预览</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto">
      {/* 模拟浏览器框 */}
      <div className="bg-gray-100 rounded-t-lg px-3 py-2 flex items-center gap-2 border border-b-0">
        <div className="flex gap-1">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 bg-white rounded text-xs px-2 py-0.5 text-muted-foreground truncate border">
          sites.google.com/view/{siteName.toLowerCase().replace(/\s+/g, "-")}
        </div>
      </div>
      {/* 页面内容 */}
      <div className="border border-t-0 rounded-b-lg bg-white overflow-hidden">
        {/* 站点标题栏 */}
        <div className="bg-slate-800 text-white px-4 py-2.5 text-sm font-medium">{siteName}</div>

        {/* 文章内容区 */}
        <div className="p-4 space-y-3 text-sm">
          {/* 模板级别内嵌网站 - 顶部 */}
          {embedUrl && (embedPosition === "top" || !embedPosition) && renderEmbedBlock(embedUrl, embedW, embedH, "模板内嵌网站（顶部）")}

          {blocks.map((block) => {
            const info = getBlockTypeInfo(block.type);
            const fsMap: Record<string, string> = { sm: "11px", base: "13px", lg: "15px", xl: "17px", "2xl": "20px" };
            const fwMap: Record<string, string> = { normal: "400", medium: "500", semibold: "600", bold: "700" };
            const fs = fsMap[block.fontSize || "base"] || "13px";
            const fw = fwMap[block.fontWeight || (["h1","h2","h3"].includes(block.type) ? "bold" : "normal")] || "400";
            const ta = block.textAlign || "left";

            if (block.type === "h1") return (
              <div key={block.id} className="border-b pb-2">
                <h1 style={{ fontSize: fsMap[block.fontSize || "2xl"] || "20px", fontWeight: fw, textAlign: ta as any }} className="text-gray-900 leading-tight">
                  {block.title || `${previewKeyword} - 完整指南`}
                </h1>
              </div>
            );
            if (block.type === "h2") return (
              <div key={block.id} className="pt-1">
                <h2 style={{ fontSize: fsMap[block.fontSize || "xl"] || "17px", fontWeight: fw, textAlign: ta as any }} className="text-gray-800 border-l-3 border-orange-400 pl-2 border-l-[3px]">
                  {block.title || "## 主要章节标题"}
                </h2>
              </div>
            );
            if (block.type === "h3") return (
              <div key={block.id} className="pl-3">
                <h3 style={{ fontSize: fsMap[block.fontSize || "lg"] || "15px", fontWeight: fw, textAlign: ta as any }} className="text-gray-700">
                  {block.title || "### 子章节标题"}
                </h3>
              </div>
            );
            if (block.type === "paragraph") return (
              <div key={block.id} className="pl-0">
                <div className="space-y-1">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-2 rounded" style={{ background: `rgba(0,0,0,${0.08 - i * 0.02})`, width: i === 2 ? "65%" : "100%" }} />
                  ))}
                </div>
                {block.contentHint && <p style={{ fontSize: "10px", textAlign: ta as any }} className="text-muted-foreground mt-1 italic">{block.contentHint}</p>}
              </div>
            );
            if (block.type === "faq") return (
              <div key={block.id} className="bg-green-50 rounded-lg p-2 border border-green-100">
                <p style={{ fontSize: "10px" }} className="text-green-700 font-medium mb-1.5">❓ FAQ 问答区</p>
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="mb-1.5">
                    <div className="h-2 rounded bg-green-200/60 w-4/5 mb-1" />
                    <div className="h-1.5 rounded bg-green-100 w-full" />
                  </div>
                ))}
              </div>
            );
            if (block.type === "links") {
              const cols = block.linkColumns || 2;
              return (
                <div key={block.id} className="bg-purple-50 rounded-lg p-2 border border-purple-100">
                  <p style={{ fontSize: "10px" }} className="text-purple-700 font-medium mb-1.5">🔗 超链接列表（{cols}列）</p>
                  <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                    {[...Array(cols * 2)].map((_, i) => (
                      <div key={i} className={`rounded border border-purple-200 bg-white flex items-center justify-center ${block.linkStyle === "button" ? "py-1" : "py-1.5 px-2"}`}>
                        <div className="h-1.5 rounded bg-purple-200 w-3/4" />
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            if (block.type === "embed") {
              const bEmbedH = block.embedHeight || 200;
              const bEmbedW = block.embedWidth || "100%";
              return (
                <div key={block.id}>
                  {renderEmbedBlock(block.embedUrl || "", bEmbedW, bEmbedH, `内嵌网站（${block.embedPosition === "top" ? "顶部" : block.embedPosition === "inline" ? "正文中" : "底部"}）`)}
                </div>
              );
            }
            if (block.type === "image") return (
              <div key={block.id} className="bg-pink-50 rounded-lg border border-pink-100 flex items-center justify-center py-4">
                <div className="text-center">
                  <Image className="h-6 w-6 text-pink-300 mx-auto mb-1" />
                  <p style={{ fontSize: "10px" }} className="text-pink-400">图片区域</p>
                </div>
              </div>
            );
            if (block.type === "table") return (
              <div key={block.id} className="bg-indigo-50 rounded-lg p-2 border border-indigo-100">
                <p style={{ fontSize: "10px" }} className="text-indigo-700 font-medium mb-1.5">📊 表格（{block.tableRows || 3}行）</p>
                <div className="border border-indigo-200 rounded overflow-hidden">
                  {[...Array(Math.min(block.tableRows || 3, 4))].map((_, i) => (
                    <div key={i} className={`flex gap-2 px-2 py-1 ${i === 0 ? "bg-indigo-100" : "bg-white border-t border-indigo-100"}`}>
                      {[...Array(3)].map((_, j) => (
                        <div key={j} className="flex-1 h-1.5 rounded bg-indigo-200/60" />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            );
            return null;
          })}

          {/* 模板级别内嵌网站 - 底部 */}
          {embedUrl && embedPosition === "bottom" && renderEmbedBlock(embedUrl, embedW, embedH, "模板内嵌网站（底部）")}
        </div>
      </div>
    </div>
  );
}

// ─── 板块编辑器组件 ───────────────────────────────────────────────────────────
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
  const [activeTab, setActiveTab] = useState<"content" | "style">("content");
  const info = getBlockTypeInfo(block.type);
  const Icon = info.icon;

  return (
    <div className="border rounded-lg bg-white overflow-hidden shadow-sm">
      {/* 头部 */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 hover:bg-muted/30 transition-colors">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
        <span className={`text-xs px-1.5 py-0.5 rounded border ${info.color} shrink-0 flex items-center gap-1`}>
          <Icon className="h-3 w-3" />
          {info.label}
        </span>
        <span className="text-sm font-medium text-foreground flex-1 truncate">
          {block.title || `（${info.label}）`}
        </span>
        {/* 快速字号显示 */}
        {block.fontSize && block.fontSize !== "base" && (
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
            {FONT_SIZES.find(f => f.value === block.fontSize)?.label.split(" ")[0]}
          </span>
        )}
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={onMoveUp} disabled={isFirst} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 transition-colors">
            <ChevronUp className="h-3 w-3" />
          </button>
          <button onClick={onMoveDown} disabled={isLast} className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted disabled:opacity-30 transition-colors">
            <ChevronDown className="h-3 w-3" />
          </button>
          <button onClick={() => setExpanded(e => !e)} className={`h-5 w-5 flex items-center justify-center rounded transition-colors ${expanded ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
            <Edit2 className="h-3 w-3" />
          </button>
          <button onClick={onDelete} className="h-5 w-5 flex items-center justify-center rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 展开编辑区 */}
      {expanded && (
        <div className="border-t">
          {/* Tab 切换 */}
          <div className="flex border-b bg-muted/10">
            <button
              onClick={() => setActiveTab("content")}
              className={`flex-1 text-xs py-1.5 font-medium transition-colors ${activeTab === "content" ? "border-b-2 border-primary text-primary bg-white" : "text-muted-foreground hover:text-foreground"}`}
            >
              内容设置
            </button>
            <button
              onClick={() => setActiveTab("style")}
              className={`flex-1 text-xs py-1.5 font-medium transition-colors ${activeTab === "style" ? "border-b-2 border-primary text-primary bg-white" : "text-muted-foreground hover:text-foreground"}`}
            >
              样式设置
            </button>
          </div>

          <div className="p-3 space-y-3">
            {activeTab === "content" && (
              <>
                {/* 板块标题 */}
                <div className="space-y-1">
                  <Label className="text-xs">板块标题 / 提示文字</Label>
                  <Input className="h-7 text-sm" placeholder={`如：${info.desc}`} value={block.title} onChange={e => onChange({ ...block, title: e.target.value })} />
                </div>

                {/* AI 内容提示 */}
                {["paragraph", "h2", "h3", "faq"].includes(block.type) && (
                  <div className="space-y-1">
                    <Label className="text-xs">AI 内容提示</Label>
                    <Textarea className="text-sm min-h-[56px]" placeholder="告诉AI这个板块应该写什么内容" value={block.contentHint} onChange={e => onChange({ ...block, contentHint: e.target.value })} />
                  </div>
                )}

                {/* 最少字数 */}
                {["paragraph", "h2", "h3"].includes(block.type) && (
                  <div className="space-y-1">
                    <Label className="text-xs">最少字数：{block.minWords ?? 150} 字</Label>
                    <Slider
                      min={50} max={1000} step={50}
                      value={[block.minWords ?? 150]}
                      onValueChange={([v]) => onChange({ ...block, minWords: v })}
                      className="w-full"
                    />
                  </div>
                )}

                {/* 超链接板块设置 */}
                {block.type === "links" && (
                  <div className="space-y-3 p-3 bg-purple-50/50 rounded-lg border border-purple-100">
                    <p className="text-xs font-medium text-purple-700">超链接板块设置</p>
                    <div className="grid grid-cols-3 gap-2">
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

                {/* 内嵌网站板块设置 */}
                {block.type === "embed" && (
                  <div className="space-y-3 p-3 bg-cyan-50/50 rounded-lg border border-cyan-100">
                    <p className="text-xs font-medium text-cyan-700">内嵌网站板块设置</p>
                    <div className="space-y-1">
                      <Label className="text-xs">嵌入 URL</Label>
                      <Input className="h-7 text-xs" placeholder="https://example.com（留空则由发布时指定）" value={block.embedUrl ?? ""} onChange={e => onChange({ ...block, embedUrl: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">宽度</Label>
                        <Input className="h-7 text-xs" placeholder="100%" value={block.embedWidth ?? "100%"} onChange={e => onChange({ ...block, embedWidth: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">高度 (px)</Label>
                        <Input type="number" className="h-7 text-xs" min={100} max={2000} value={block.embedHeight ?? 300} onChange={e => onChange({ ...block, embedHeight: Number(e.target.value) })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">嵌入位置</Label>
                        <Select value={block.embedPosition ?? "inline"} onValueChange={v => onChange({ ...block, embedPosition: v as any })}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="top">文章顶部</SelectItem>
                            <SelectItem value="inline">正文中</SelectItem>
                            <SelectItem value="bottom">文章底部</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {/* 表格设置 */}
                {block.type === "table" && (
                  <div className="space-y-3 p-3 bg-indigo-50/50 rounded-lg border border-indigo-100">
                    <p className="text-xs font-medium text-indigo-700">表格设置</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">行数</Label>
                        <Input type="number" className="h-7 text-xs" min={2} max={20} value={block.tableRows ?? 4} onChange={e => onChange({ ...block, tableRows: Number(e.target.value) })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">列名（逗号分隔）</Label>
                        <Input className="h-7 text-xs" placeholder="名称,价格,评分" value={block.tableColumns ?? ""} onChange={e => onChange({ ...block, tableColumns: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">内容提示</Label>
                      <Input className="h-7 text-xs" placeholder="如：对比5款产品的价格和功能" value={block.contentHint} onChange={e => onChange({ ...block, contentHint: e.target.value })} />
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === "style" && (
              <div className="space-y-3">
                {/* 字体大小 */}
                <div className="space-y-1.5">
                  <Label className="text-xs">字体大小</Label>
                  <div className="grid grid-cols-5 gap-1">
                    {FONT_SIZES.map(fs => (
                      <button
                        key={fs.value}
                        onClick={() => onChange({ ...block, fontSize: fs.value as any })}
                        className={`text-xs py-1 rounded border transition-colors ${(block.fontSize ?? (["h1"].includes(block.type) ? "2xl" : ["h2"].includes(block.type) ? "xl" : ["h3"].includes(block.type) ? "lg" : "base")) === fs.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                      >
                        {fs.label.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 字体粗细 */}
                <div className="space-y-1.5">
                  <Label className="text-xs">字体粗细</Label>
                  <div className="grid grid-cols-4 gap-1">
                    {FONT_WEIGHTS.map(fw => (
                      <button
                        key={fw.value}
                        onClick={() => onChange({ ...block, fontWeight: fw.value as any })}
                        className={`text-xs py-1 rounded border transition-colors ${(block.fontWeight ?? (["h1","h2","h3"].includes(block.type) ? "bold" : "normal")) === fw.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                        style={{ fontWeight: fw.value }}
                      >
                        {fw.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 文字对齐 */}
                <div className="space-y-1.5">
                  <Label className="text-xs">文字对齐</Label>
                  <div className="flex gap-1">
                    {[
                      { value: "left", icon: AlignLeftIcon, label: "左对齐" },
                      { value: "center", icon: AlignCenter, label: "居中" },
                      { value: "right", icon: AlignRight, label: "右对齐" },
                    ].map(({ value, icon: Icon, label }) => (
                      <button
                        key={value}
                        onClick={() => onChange({ ...block, textAlign: value as any })}
                        title={label}
                        className={`flex-1 py-1.5 flex items-center justify-center rounded border transition-colors ${(block.textAlign ?? "left") === value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* 预览效果 */}
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2">样式预览</p>
                  <div
                    style={{
                      fontSize: { sm: "12px", base: "14px", lg: "16px", xl: "18px", "2xl": "22px" }[block.fontSize || "base"] || "14px",
                      fontWeight: { normal: "400", medium: "500", semibold: "600", bold: "700" }[block.fontWeight || "normal"] || "400",
                      textAlign: (block.textAlign || "left") as any,
                    }}
                    className="text-foreground"
                  >
                    {block.title || `${getBlockTypeInfo(block.type).label} 示例文字`}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export default function SeoTemplates() {
  const { data: templates = [], refetch } = trpc.seoTemplates.list.useQuery();
  const createMut = trpc.seoTemplates.create.useMutation({ onSuccess: () => { toast.success("模板已创建"); refetch(); setShowEditor(false); } });
  const updateMut = trpc.seoTemplates.update.useMutation({ onSuccess: () => { toast.success("模板已更新"); refetch(); setShowEditor(false); } });
  const deleteMut = trpc.seoTemplates.delete.useMutation({ onSuccess: () => { toast.success("模板已删除"); refetch(); } });
  const generateMut = trpc.seoTemplates.generate.useMutation({
    onSuccess: () => { toast.success("文章已生成，保存到素材库"); setShowGenerate(false); },
    onError: (e) => toast.error(e.message),
  });

  const [showEditor, setShowEditor] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [blocks, setBlocks] = useState<TemplateBlock[]>([]);
  const [editorForm, setEditorForm] = useState({
    name: "", type: "informational", description: "", promptTemplate: "",
    minWords: 800, maxWords: 1200,
    siteNameSuffix: "", embedUrl: "", embedWidth: "100%", embedHeight: "300", embedPosition: "bottom",
  });
  const [generateForm, setGenerateForm] = useState({ keyword: "", language: "zh-CN" });
  const [previewMode, setPreviewMode] = useState<"desktop" | "tablet" | "mobile">("desktop");

  const checkedTypes = new Set(blocks.map(b => b.type));

  function openCreate() {
    setEditingTemplate(null);
    setBlocks([]);
    setEditorForm({ name: "", type: "informational", description: "", promptTemplate: "", minWords: 800, maxWords: 1200, siteNameSuffix: "", embedUrl: "", embedWidth: "100%", embedHeight: "300", embedPosition: "bottom" });
    setShowEditor(true);
  }
  function openEdit(tpl: any) {
    setEditingTemplate(tpl);
    setBlocks((tpl.structure?.blocks ?? []) as TemplateBlock[]);
    setEditorForm({
      name: tpl.name, type: tpl.type, description: tpl.description ?? "",
      promptTemplate: tpl.promptTemplate ?? "", minWords: tpl.minWords ?? 800, maxWords: tpl.maxWords ?? 1200,
      siteNameSuffix: tpl.siteNameSuffix ?? "", embedUrl: tpl.embedUrl ?? "",
      embedWidth: tpl.embedWidth ?? "100%", embedHeight: tpl.embedHeight ?? "300",
      embedPosition: tpl.embedPosition ?? "bottom",
    });
    setShowEditor(true);
  }

  function toggleBlockType(type: BlockType) {
    setBlocks(bs => {
      if (bs.some(b => b.type === type)) return bs.filter(b => b.type !== type);
      const defaultBlock: TemplateBlock = {
        id: genId(), type, title: "", contentHint: "",
        minWords: ["h2", "h3", "paragraph"].includes(type) ? 150 : undefined,
        linkColumns: type === "links" ? 2 : undefined,
        linkHeight: type === "links" ? 60 : undefined,
        linkStyle: type === "links" ? "card" : undefined,
        embedHeight: type === "embed" ? 300 : undefined,
        embedWidth: type === "embed" ? "100%" : undefined,
        embedPosition: type === "embed" ? "inline" : undefined,
        tableRows: type === "table" ? 4 : undefined,
      };
      return [...bs, defaultBlock];
    });
  }
  function updateBlock(id: string, updated: TemplateBlock) {
    setBlocks(bs => bs.map(b => b.id === id ? updated : b));
  }
  function deleteBlock(id: string) {
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
    const payload = {
      name: editorForm.name, description: editorForm.description || undefined,
      promptTemplate: finalPrompt, minWords: editorForm.minWords, maxWords: editorForm.maxWords, structure,
      siteNameSuffix: editorForm.siteNameSuffix || undefined,
      embedUrl: editorForm.embedUrl || undefined,
      embedWidth: editorForm.embedWidth || undefined,
      embedHeight: editorForm.embedHeight || undefined,
      embedPosition: (editorForm.embedPosition as any) || undefined,
    };
    if (editingTemplate) {
      updateMut.mutate({ id: editingTemplate.id, ...payload });
    } else {
      createMut.mutate({ type: editorForm.type, ...payload } as any);
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
                    {savedBlocks.slice(0, 5).map((b: TemplateBlock) => {
                      const bInfo = getBlockTypeInfo(b.type);
                      const BIcon = bInfo.icon;
                      return (
                        <span key={b.id} className={`text-xs px-1.5 py-0.5 rounded border flex items-center gap-1 ${bInfo.color}`}>
                          <BIcon className="h-2.5 w-2.5" />{bInfo.label}
                        </span>
                      );
                    })}
                    {savedBlocks.length > 5 && <span className="text-xs text-muted-foreground">+{savedBlocks.length - 5}</span>}
                  </div>
                )}
                {/* 发布设置标签 */}
                {(tpl.siteNameSuffix || tpl.embedUrl) && (
                  <div className="flex flex-wrap gap-1">
                    {tpl.siteNameSuffix && <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200">后缀: {tpl.siteNameSuffix}</span>}
                    {tpl.embedUrl && <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-600 border border-cyan-200">内嵌网站</span>}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => openEdit(tpl)}>
                    <Edit2 className="h-3 w-3 mr-1" />编辑
                  </Button>
                  <Button size="sm" className="flex-1 h-7 text-xs bg-primary" onClick={() => { setSelectedTemplate(tpl); setShowGenerate(true); }}>
                    <Play className="h-3 w-3 mr-1" />生成文章
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50 hover:border-red-200" onClick={() => { if (confirm(`确认删除模板「${tpl.name}」？`)) deleteMut.mutate({ id: tpl.id }); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {(templates as any[]).length === 0 && (
          <div className="col-span-3 flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Layers className="h-12 w-12 mb-3 opacity-20" />
            <p className="font-medium">暂无模板</p>
            <p className="text-sm mt-1">点击「新建模板」创建第一个 SEO 文章模板</p>
            <Button className="mt-4" onClick={openCreate}><Plus className="w-4 h-4 mr-2" />新建模板</Button>
          </div>
        )}
      </div>

      {/* ─── 全屏编辑弹窗 ─── */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-[95vw] w-[1400px] h-[92vh] flex flex-col p-0 gap-0">
          {/* 顶部标题栏 */}
          <div className="flex items-center justify-between px-6 py-3 border-b shrink-0 bg-background">
            <div className="flex items-center gap-3">
              <LayoutTemplate className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">{editingTemplate ? `编辑模板：${editingTemplate.name}` : "新建 SEO 模板"}</h2>
            </div>
            {/* 预览模式切换 */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              {[
                { mode: "desktop", icon: Monitor, label: "桌面" },
                { mode: "tablet", icon: Tablet, label: "平板" },
                { mode: "mobile", icon: Smartphone, label: "手机" },
              ].map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => setPreviewMode(mode as any)}
                  title={label}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${previewMode === mode ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>
          </div>

          {/* 主体：左侧配置 + 右侧预览 */}
          <div className="flex flex-1 overflow-hidden">
            {/* 左侧配置区 */}
            <div className="w-[480px] shrink-0 border-r flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* 基本信息 */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Settings2 className="h-4 w-4 text-primary" /> 基本信息
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">模板名称 *</Label>
                      <Input className="h-8" placeholder="如：信息型文章" value={editorForm.name} onChange={e => setEditorForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">模板类型</Label>
                      <Select value={editorForm.type} onValueChange={v => setEditorForm(f => ({ ...f, type: v }))}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {TEMPLATE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">最少字数：{editorForm.minWords}</Label>
                      <Slider min={200} max={5000} step={100} value={[editorForm.minWords]} onValueChange={([v]) => setEditorForm(f => ({ ...f, minWords: v }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">最多字数：{editorForm.maxWords}</Label>
                      <Slider min={500} max={10000} step={100} value={[editorForm.maxWords]} onValueChange={([v]) => setEditorForm(f => ({ ...f, maxWords: v }))} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">模板描述（可选）</Label>
                    <Input className="h-8 text-sm" placeholder="适合解释性内容，如「什么是X」" value={editorForm.description} onChange={e => setEditorForm(f => ({ ...f, description: e.target.value }))} />
                  </div>
                </div>

                {/* 选择板块类型 */}
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-primary" /> 选择板块类型
                  </h3>
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

                {/* 板块列表（可编辑） */}
                {blocks.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <GripVertical className="h-4 w-4 text-primary" /> 板块顺序与设置
                      <span className="text-xs text-muted-foreground font-normal ml-1">（点击 ✏️ 展开编辑）</span>
                    </h3>
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

                {/* AI 提示词 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">AI 提示词（高级）</h3>
                    <button className="text-xs text-primary hover:underline" onClick={() => setEditorForm(f => ({ ...f, promptTemplate: buildAutoPrompt() }))}>
                      根据板块自动生成
                    </button>
                  </div>
                  <Textarea rows={4} className="text-xs font-mono" placeholder="留空则根据板块自动生成提示词。支持占位符：{keyword} {language} {minWords}" value={editorForm.promptTemplate} onChange={e => setEditorForm(f => ({ ...f, promptTemplate: e.target.value }))} />
                  <p className="text-xs text-muted-foreground">留空时系统将根据上方板块配置自动生成提示词</p>
                </div>

                {/* 发布设置 */}
                <div className="space-y-3 border-t pt-4">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Globe className="h-4 w-4 text-primary" /> 发布设置
                  </h3>
                  <div className="space-y-1.5">
                    <Label className="text-xs">站点名称后缀</Label>
                    <Input
                      className="h-8 text-sm"
                      placeholder="如：免费下载 教程（发布时站点名 = 关键词 + 后缀）"
                      value={editorForm.siteNameSuffix}
                      onChange={e => setEditorForm(f => ({ ...f, siteNameSuffix: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">留空则仅用关键词作为站点名称</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">模板内嵌网站 URL</Label>
                    <Input
                      className="h-8 text-sm"
                      placeholder="https://example.com（留空则不嵌入）"
                      value={editorForm.embedUrl}
                      onChange={e => setEditorForm(f => ({ ...f, embedUrl: e.target.value }))}
                    />
                  </div>
                  {editorForm.embedUrl && (
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">宽度</Label>
                        <Input className="h-8 text-sm" placeholder="100%" value={editorForm.embedWidth} onChange={e => setEditorForm(f => ({ ...f, embedWidth: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">高度 (px)</Label>
                        <Input type="number" className="h-8 text-sm" min={100} max={2000} value={editorForm.embedHeight} onChange={e => setEditorForm(f => ({ ...f, embedHeight: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">嵌入位置</Label>
                        <Select value={editorForm.embedPosition} onValueChange={v => setEditorForm(f => ({ ...f, embedPosition: v }))}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="top">文章顶部</SelectItem>
                            <SelectItem value="bottom">文章底部</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 右侧预览区 */}
            <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
              <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
                <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <Eye className="h-4 w-4 text-primary" /> 页面预览
                </span>
                <span className="text-xs text-muted-foreground">实时预览 Google Sites 页面效果</span>
              </div>
              <div className="flex-1 overflow-hidden p-4">
                <div className={`h-full mx-auto transition-all duration-300 ${previewMode === "mobile" ? "max-w-[375px]" : previewMode === "tablet" ? "max-w-[768px]" : "max-w-full"}`}>
                  <PagePreview
                    blocks={blocks}
                    siteNameSuffix={editorForm.siteNameSuffix}
                    embedUrl={editorForm.embedUrl}
                    embedWidth={editorForm.embedWidth}
                    embedHeight={editorForm.embedHeight}
                    embedPosition={editorForm.embedPosition}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 底部操作栏 */}
          <div className="flex items-center justify-between px-6 py-3 border-t shrink-0 bg-background">
            <div className="text-xs text-muted-foreground">
              {blocks.length > 0 ? (
                <span>{blocks.length} 个板块 · 预计 {blocks.reduce((s, b) => s + (b.minWords ?? 0), 0)} 字以上</span>
              ) : (
                <span>请在左侧添加板块</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowEditor(false)}>取消</Button>
              <Button disabled={!editorForm.name || createMut.isPending || updateMut.isPending} onClick={handleSave}>
                {(createMut.isPending || updateMut.isPending) ? "保存中..." : (editingTemplate ? "保存修改" : "创建模板")}
              </Button>
            </div>
          </div>
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
              <p className="font-semibold text-foreground mb-1">板块样式设置</p>
              <p>展开板块编辑器后，切换到「样式设置」标签，可以调整字体大小、粗细和对齐方式，右侧预览区会实时更新效果。</p>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">内嵌网站怎么配置？</p>
              <p>在「发布设置」区域填写内嵌网站 URL，可设置宽度、高度和嵌入位置（顶部/底部）。也可以在板块中添加「内嵌网站」板块，支持正文中嵌入。</p>
            </div>
          </div>
          <DialogFooter><Button onClick={() => setShowHelp(false)}>知道了</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
