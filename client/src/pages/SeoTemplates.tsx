import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, FileText, Zap, BookOpen, List, BarChart2, MapPin, Edit2, Trash2, Play } from "lucide-react";

const TEMPLATE_TYPES = [
  { value: "informational", label: "信息型", icon: BookOpen, color: "bg-blue-100 text-blue-700", desc: "什么是X / X的定义与原理" },
  { value: "howto", label: "操作指南型", icon: Zap, color: "bg-green-100 text-green-700", desc: "如何做X / X的完整教程" },
  { value: "comparison", label: "对比评测型", icon: BarChart2, color: "bg-purple-100 text-purple-700", desc: "X vs Y / 最佳X选择" },
  { value: "listicle", label: "列表型", icon: List, color: "bg-orange-100 text-orange-700", desc: "10个最佳X / X的5大优势" },
  { value: "local", label: "本地化型", icon: MapPin, color: "bg-rose-100 text-rose-700", desc: "X城市的Y / 本地X指南" },
];

const LANGUAGES = [
  { value: "zh-CN", label: "中文（简体）" },
  { value: "en", label: "English" },
  { value: "zh-TW", label: "中文（繁体）" },
];

export default function SeoTemplates() {
  const [showCreate, setShowCreate] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [generateForm, setGenerateForm] = useState({ keyword: "", language: "zh-CN" });

  const { data: templates = [], refetch } = trpc.seoTemplates.list.useQuery();
  const createMut = trpc.seoTemplates.create.useMutation({ onSuccess: () => { refetch(); setShowCreate(false); toast.success("模板创建成功"); } });
  const deleteMut = trpc.seoTemplates.delete.useMutation({ onSuccess: () => { refetch(); toast.success("模板已删除"); } });
  const generateMut = trpc.seoTemplates.generateWithTemplate.useMutation({
    onSuccess: (data) => {
      setShowGenerate(false);
      toast.success(`文章生成成功！已生成 ${data.wordCount} 字，已保存到素材库`);
    },
    onError: (e) => toast.error(`生成失败：${e.message}`),
  });

  const [createForm, setCreateForm] = useState({
    name: "", type: "informational" as any, description: "", promptTemplate: "", minWords: 800, maxWords: 1500,
  });

  const getTypeInfo = (type: string) => TEMPLATE_TYPES.find(t => t.value === type) ?? TEMPLATE_TYPES[0];

  return (
    <div className="p-6 space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SEO 文章模板</h1>
          <p className="text-sm text-muted-foreground mt-1">预置5种结构化模板，AI生成文章时自动套用 H1/H2/H3 层级、关键词密度和内链规范</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          新建模板
        </Button>
      </div>

      {/* 模板列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {templates.map((tpl: any) => {
          const typeInfo = getTypeInfo(tpl.type);
          const Icon = typeInfo.icon;
          return (
            <Card key={tpl.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${typeInfo.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{tpl.name}</CardTitle>
                      <Badge variant="outline" className="text-xs mt-1">{typeInfo.label}</Badge>
                    </div>
                  </div>
                  {tpl.isPreset && <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">预置</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {tpl.description && (
                  <p className="text-sm text-muted-foreground">{tpl.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {tpl.minWords}–{tpl.maxWords} 字
                  </span>
                  <span>使用 {tpl.usageCount ?? 0} 次</span>
                </div>
                {/* 模板结构预览 */}
                {tpl.structure?.sections && (
                  <div className="bg-muted/50 rounded-md p-2 space-y-1">
                    {tpl.structure.sections.slice(0, 4).map((s: any, i: number) => (
                      <div key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/40 flex-shrink-0" />
                        <span className="truncate">{s.label}</span>
                      </div>
                    ))}
                    {tpl.structure.sections.length > 4 && (
                      <div className="text-xs text-muted-foreground pl-2.5">+{tpl.structure.sections.length - 4} 个区块...</div>
                    )}
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => { setSelectedTemplate(tpl); setShowGenerate(true); }}
                  >
                    <Play className="w-3 h-3 mr-1" />
                    用此模板生成
                  </Button>
                  {!tpl.isPreset && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteMut.mutate({ id: tpl.id })}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 新建模板弹窗 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>新建 SEO 模板</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>模板名称 *</Label>
                <Input
                  placeholder="如：产品评测模板"
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>模板类型 *</Label>
                <Select value={createForm.type} onValueChange={v => setCreateForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label} — {t.desc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>模板描述</Label>
              <Input
                placeholder="简述该模板适用场景"
                value={createForm.description}
                onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>最少字数</Label>
                <Input type="number" value={createForm.minWords} onChange={e => setCreateForm(f => ({ ...f, minWords: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>最多字数</Label>
                <Input type="number" value={createForm.maxWords} onChange={e => setCreateForm(f => ({ ...f, maxWords: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>AI 提示词模板</Label>
              <Textarea
                rows={6}
                placeholder="输入给 AI 的 system prompt，可使用 {keyword}、{language}、{minWords} 占位符"
                value={createForm.promptTemplate}
                onChange={e => setCreateForm(f => ({ ...f, promptTemplate: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">支持占位符：{"{keyword}"} 关键词、{"{language}"} 语言、{"{minWords}"} 最少字数</p>
            </div>
          </div>
          <DialogFooter className="border-t pt-4 mt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button
              disabled={!createForm.name || createMut.isPending}
              onClick={() => createMut.mutate({
                name: createForm.name,
                type: createForm.type,
                description: createForm.description || undefined,
                promptTemplate: createForm.promptTemplate || undefined,
                minWords: createForm.minWords,
                maxWords: createForm.maxWords,
                structure: { sections: [] },
              })}
            >
              {createMut.isPending ? "创建中..." : "创建模板"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 用模板生成文章弹窗 */}
      <Dialog open={showGenerate} onOpenChange={setShowGenerate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>使用「{selectedTemplate?.name}」生成文章</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>目标关键词 *</Label>
              <Input
                placeholder="输入核心关键词，如：Python 教程"
                value={generateForm.keyword}
                onChange={e => setGenerateForm(f => ({ ...f, keyword: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>文章语言</Label>
              <Select value={generateForm.language} onValueChange={v => setGenerateForm(f => ({ ...f, language: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {selectedTemplate && (
              <div className="bg-muted/50 rounded-md p-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">模板规格</p>
                <p>字数：{selectedTemplate.minWords}–{selectedTemplate.maxWords} 字</p>
                <p>类型：{getTypeInfo(selectedTemplate.type).label}</p>
                <p>生成后自动保存到素材库（待审核状态）</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerate(false)}>取消</Button>
            <Button
              disabled={!generateForm.keyword || generateMut.isPending}
              onClick={() => selectedTemplate && generateMut.mutate({
                templateId: selectedTemplate.id,
                keyword: generateForm.keyword,
                language: generateForm.language as any,
              })}
            >
              {generateMut.isPending ? "AI 生成中..." : "开始生成"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
