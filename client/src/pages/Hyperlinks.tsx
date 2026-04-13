import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import {
  ExternalLink,
  Globe,
  HelpCircle,
  Link2,
  Plus,
  Shield,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Hyperlink = {
  id: number;
  type: string;
  url: string;
  anchorText?: string | null;
  anchorType?: string | null;
  domain?: string | null;
  displayName?: string | null;
  category?: string | null;
  authorityScore?: number | null;
  language?: string | null;
  description?: string | null;
  isPreset: boolean;
  isActive: boolean;
};

const anchorTypeLabel: Record<string, string> = {
  exact: "精确匹配",
  partial: "部分匹配",
  lsi: "LSI关键词",
  brand: "品牌词",
  natural: "自然语言",
  naked: "裸链接",
};

export default function Hyperlinks() {
  const utils = trpc.useUtils();
  const [typeFilter, setTypeFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [form, setForm] = useState({
    type: "external" as "internal" | "external",
    url: "",
    anchorText: "",
    anchorType: "natural" as any,
    domain: "",
    displayName: "",
    category: "",
    authorityScore: 50,
    language: "zh",
    description: "",
  });

  const { data: hyperlinks = [], isLoading } = trpc.hyperlinks.list.useQuery(
    typeFilter !== "all" ? { type: typeFilter } : undefined
  );

  const createMutation = trpc.hyperlinks.create.useMutation({
    onSuccess: () => {
      utils.hyperlinks.list.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success("超链接已添加");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.hyperlinks.update.useMutation({
    onSuccess: () => {
      utils.hyperlinks.list.invalidate();
      toast.success("已更新");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.hyperlinks.delete.useMutation({
    onSuccess: () => {
      utils.hyperlinks.list.invalidate();
      toast.success("超链接已删除");
    },
    onError: (e) => toast.error(e.message),
  });

  function resetForm() {
    setForm({
      type: "external",
      url: "",
      anchorText: "",
      anchorType: "natural",
      domain: "",
      displayName: "",
      category: "",
      authorityScore: 50,
      language: "zh",
      description: "",
    });
  }

  function handleCreate() {
    if (!form.url.trim()) { toast.error("URL 为必填项"); return; }
    createMutation.mutate({
      type: form.type,
      url: form.url.trim(),
      anchorText: form.anchorText || undefined,
      anchorType: form.anchorType,
      domain: form.domain || undefined,
      displayName: form.displayName || undefined,
      category: form.category || undefined,
      authorityScore: form.authorityScore,
      language: form.language || undefined,
      description: form.description || undefined,
    });
  }

  const internalLinks = (hyperlinks as Hyperlink[]).filter(h => h.type === "internal");
  const externalLinks = (hyperlinks as Hyperlink[]).filter(h => h.type === "external");

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">超链接管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理内部链接和外部权威链接，优化 SEO 链接结构</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHelpOpen(true)}
            className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            添加链接
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "全部链接", value: (hyperlinks as Hyperlink[]).length, color: "text-foreground" },
          { label: "内部链接", value: internalLinks.length, color: "text-blue-600" },
          { label: "外部链接", value: externalLinks.length, color: "text-purple-600" },
          { label: "已启用", value: (hyperlinks as Hyperlink[]).filter(h => h.isActive).length, color: "text-emerald-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-border p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-32 h-9 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="internal">内部链接</SelectItem>
            <SelectItem value="external">外部链接</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">加载中...</div>
        ) : (hyperlinks as Hyperlink[]).length === 0 ? (
          <div className="p-12 text-center">
            <Link2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">暂无超链接</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>类型</th>
                <th>链接/域名</th>
                <th>锚文本</th>
                <th>锚文本类型</th>
                <th>权威分</th>
                <th>分类</th>
                <th>启用</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {(hyperlinks as Hyperlink[]).map((link) => (
                <tr key={link.id}>
                  <td>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                      link.type === "internal"
                        ? "bg-blue-50 text-blue-700 border border-blue-200"
                        : "bg-purple-50 text-purple-700 border border-purple-200"
                    }`}>
                      {link.type === "internal" ? <Globe className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                      {link.type === "internal" ? "内部" : "外部"}
                    </span>
                    {link.isPreset && (
                      <span className="ml-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">预设</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline truncate max-w-[200px]"
                      >
                        {link.displayName ?? link.domain ?? link.url}
                      </a>
                      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                    </div>
                    {link.description && (
                      <div className="text-xs text-muted-foreground mt-0.5">{link.description}</div>
                    )}
                  </td>
                  <td className="text-sm text-muted-foreground">{link.anchorText ?? "—"}</td>
                  <td className="text-xs text-muted-foreground">{link.anchorType ? anchorTypeLabel[link.anchorType] ?? link.anchorType : "—"}</td>
                  <td>
                    {link.authorityScore != null ? (
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${link.authorityScore >= 80 ? "bg-emerald-500" : link.authorityScore >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                            style={{ width: `${link.authorityScore}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums">{link.authorityScore}</span>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="text-xs text-muted-foreground">{link.category ?? "—"}</td>
                  <td>
                    <Switch
                      checked={link.isActive}
                      onCheckedChange={v => updateMutation.mutate({ id: link.id, isActive: v })}
                    />
                  </td>
                  <td>
                    <div className="flex items-center justify-end">
                      {!link.isPreset && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("确认删除此链接？")) {
                              deleteMutation.mutate({ id: link.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>添加超链接</DialogTitle>
            <DialogDescription>添加内部链接或外部权威链接</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>链接类型</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">内部链接</SelectItem>
                    <SelectItem value="external">外部链接</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>分类</Label>
                <Input
                  placeholder="如：tech / academic"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>URL <span className="text-destructive">*</span></Label>
              <Input
                placeholder="https://example.com/page"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>显示名称</Label>
                <Input
                  placeholder="链接显示名称"
                  value={form.displayName}
                  onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>域名</Label>
                <Input
                  placeholder="example.com"
                  value={form.domain}
                  onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>锚文本</Label>
                <Input
                  placeholder="链接锚文本"
                  value={form.anchorText}
                  onChange={e => setForm(f => ({ ...f, anchorText: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>锚文本类型</Label>
                <Select value={form.anchorType} onValueChange={v => setForm(f => ({ ...f, anchorType: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(anchorTypeLabel).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>权威分 (0-100)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.authorityScore}
                  onChange={e => setForm(f => ({ ...f, authorityScore: parseInt(e.target.value) || 50 }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>语言</Label>
                <Select value={form.language} onValueChange={v => setForm(f => ({ ...f, language: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="en">英文</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>描述</Label>
              <Input
                placeholder="链接描述（可选）"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>取消</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "添加中..." : "添加链接"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>超链接管理使用说明</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-3">
            <p><strong className="text-foreground">1. 内部链接：</strong>指向同一 Google Sites 站点内其他页面的链接，有助于提升站内 SEO 权重传递。</p>
            <p><strong className="text-foreground">2. 外部链接：</strong>指向高权威外部网站的链接（如维基百科、学术机构），提升内容可信度。</p>
            <p><strong className="text-foreground">3. 预设链接：</strong>系统内置的高权威外部链接，不可删除，可启用/禁用。</p>
            <p><strong className="text-foreground">4. 锚文本类型：</strong>精确匹配关键词效果最强但风险最高，建议混合使用自然语言和品牌词。</p>
            <p><strong className="text-foreground">5. 权威分：</strong>0-100，越高表示该链接的 SEO 价值越高，优先使用高权威链接。</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
