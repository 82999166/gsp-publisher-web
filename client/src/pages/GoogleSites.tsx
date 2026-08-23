import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Globe, Plus, Trash2, ExternalLink, CheckCircle2, AlertCircle,
  BarChart2, FileText, Link2, Settings2
} from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: "运行中", color: "bg-green-100 text-green-700" },
  inactive: { label: "已停用", color: "bg-gray-100 text-gray-600" },
  suspended: { label: "已封禁", color: "bg-red-100 text-red-700" },
};

const LANGUAGES = [
  { value: "zh-CN", label: "中文（简体）" },
  { value: "en", label: "English" },
  { value: "zh-TW", label: "中文（繁体）" },
];

const CATEGORIES = ["科技", "健康", "财经", "教育", "生活", "旅游", "美食", "其他"];

export default function GoogleSites() {
  const [showCreate, setShowCreate] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [selectedSite, setSelectedSite] = useState<any>(null);

  const { data: accounts = [] } = trpc.accounts.list.useQuery();
  const { data: sites = [], refetch } = trpc.sites.list.useQuery();

  const createMut = trpc.sites.create.useMutation({
    onSuccess: () => { refetch(); setShowCreate(false); toast.success("站点添加成功"); },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.sites.update.useMutation({
    onSuccess: () => { refetch(); setShowConfig(false); toast.success("站点配置已更新"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteMut = trpc.sites.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("站点已删除"); },
    onError: (e) => toast.error(e.message),
  });

  const [createForm, setCreateForm] = useState({
    accountId: 0,
    siteName: "",
    siteUrl: "",
    customDomain: "",
    category: "",
    language: "zh-CN",
    notes: "",
  });

  const [configForm, setConfigForm] = useState({
    siteUrl: "",
    customDomain: "",
    gscVerified: false,
    gscSiteUrl: "",
    status: "active" as any,
    socialLinks: [] as Array<{ label: string; url: string; type?: string }>,
    notes: "",
  });
  const [newSocialLink, setNewSocialLink] = useState({ label: "", url: "" });

  const getAccount = (id: number) => (accounts as any[]).find((a: any) => a.id === id);

  const totalPages = (sites as any[]).reduce((sum: number, s: any) => sum + (s.pageCount ?? 0), 0);
  const totalIndexed = (sites as any[]).reduce((sum: number, s: any) => sum + (s.indexedCount ?? 0), 0);
  const activeSites = (sites as any[]).filter((s: any) => s.status === "active").length;

  return (
    <div className="p-6 space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Google Sites 站点管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理所有 Google Sites 站点，配置 GSC 验证和自定义域名</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="w-4 h-4 mr-2" />
          添加站点
        </Button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "站点总数", value: (sites as any[]).length, icon: Globe, color: "text-blue-500" },
          { label: "活跃站点", value: activeSites, icon: CheckCircle2, color: "text-green-500" },
          { label: "已发布页面", value: totalPages, icon: FileText, color: "text-purple-500" },
          { label: "已收录页面", value: totalIndexed, icon: BarChart2, color: "text-orange-500" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon className={`w-8 h-8 ${stat.color}`} />
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 站点列表 */}
      {(sites as any[]).length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Globe className="w-12 h-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">还没有添加任何 Google Sites 站点</p>
            <p className="text-sm text-muted-foreground">添加站点后，发布任务将自动关联到对应站点</p>
            <Button onClick={() => setShowCreate(true)} className="mt-2">
              <Plus className="w-4 h-4 mr-2" />
              添加第一个站点
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(sites as any[]).map((site: any) => {
            const account = getAccount(site.accountId);
            const statusInfo = STATUS_MAP[site.status] ?? STATUS_MAP.active;
            const indexRate = site.pageCount > 0 ? Math.round((site.indexedCount / site.pageCount) * 100) : 0;

            return (
              <Card key={site.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="w-5 h-5 text-blue-500 flex-shrink-0" />
                      <div>
                        <CardTitle className="text-base">{site.siteName}</CardTitle>
                        {account && (
                          <p className="text-xs text-muted-foreground mt-0.5">账号：{account.name}</p>
                        )}
                      </div>
                    </div>
                    <Badge className={`${statusInfo.color} border-0 text-xs`}>{statusInfo.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* 站点 URL */}
                  {site.siteUrl ? (
                    <a
                      href={site.siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-500 hover:underline truncate"
                    >
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      {site.siteUrl}
                    </a>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">未设置站点 URL</p>
                  )}

                  {/* 自定义域名 */}
                  {site.customDomain && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Link2 className="w-3 h-3" />
                      自定义域名：{site.customDomain}
                    </div>
                  )}

                  {Array.isArray(site.socialLinks) && site.socialLinks.length > 0 && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Link2 className="w-3 h-3" />
                      已配置 {site.socialLinks.length} 条文章末尾链接
                    </div>
                  )}

                  {/* GSC 状态 */}
                  <div className="flex items-center gap-1 text-xs">
                    {site.gscVerified ? (
                      <><CheckCircle2 className="w-3 h-3 text-green-500" /><span className="text-green-600">GSC 已验证</span></>
                    ) : (
                      <><AlertCircle className="w-3 h-3 text-amber-500" /><span className="text-amber-600">GSC 未验证</span></>
                    )}
                  </div>

                  {/* 页面统计 */}
                  <div className="grid grid-cols-3 gap-2 text-center bg-muted/50 rounded-md p-2">
                    <div>
                      <p className="text-sm font-semibold">{site.pageCount ?? 0}</p>
                      <p className="text-xs text-muted-foreground">已发布</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{site.indexedCount ?? 0}</p>
                      <p className="text-xs text-muted-foreground">已收录</p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{indexRate}%</p>
                      <p className="text-xs text-muted-foreground">收录率</p>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setSelectedSite(site);
                        setConfigForm({
                          siteUrl: site.siteUrl ?? "",
                          customDomain: site.customDomain ?? "",
                          gscVerified: site.gscVerified ?? false,
                          gscSiteUrl: site.gscSiteUrl ?? "",
                          status: site.status,
                          socialLinks: Array.isArray(site.socialLinks) ? site.socialLinks : [],
                          notes: site.notes ?? "",
                        });
                        setNewSocialLink({ label: "", url: "" });
                        setShowConfig(true);
                      }}
                    >
                      <Settings2 className="w-3 h-3 mr-1" />
                      配置
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteMut.mutate({ id: site.id })}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 添加站点弹窗 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>添加 Google Sites 站点</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="space-y-1.5">
              <Label>关联账号 *</Label>
              <Select
                value={createForm.accountId ? String(createForm.accountId) : ""}
                onValueChange={v => setCreateForm(f => ({ ...f, accountId: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择 Google 账号" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts as any[]).map((a: any) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name} {a.email ? `(${a.email})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>站点名称 *</Label>
              <Input
                placeholder="如：我的SEO站点"
                value={createForm.siteName}
                onChange={e => setCreateForm(f => ({ ...f, siteName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>站点 URL</Label>
              <Input
                placeholder="https://sites.google.com/view/xxx"
                value={createForm.siteUrl}
                onChange={e => setCreateForm(f => ({ ...f, siteUrl: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">当前发布模式会为每个任务创建独立新站点；此字段仅用于保存既有站点的历史记录。</p>
            </div>
            <div className="space-y-1.5">
              <Label>自定义域名</Label>
              <Input
                placeholder="www.example.com（可选）"
                value={createForm.customDomain}
                onChange={e => setCreateForm(f => ({ ...f, customDomain: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>内容语言</Label>
                <Select value={createForm.language} onValueChange={v => setCreateForm(f => ({ ...f, language: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>内容分类</Label>
                <Select value={createForm.category} onValueChange={v => setCreateForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue placeholder="选择分类" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>备注</Label>
              <Textarea
                rows={2}
                placeholder="可选备注"
                value={createForm.notes}
                onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="border-t pt-4 mt-2">
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button
              disabled={!createForm.accountId || !createForm.siteName || createMut.isPending}
              onClick={() => createMut.mutate({
                accountId: createForm.accountId,
                siteName: createForm.siteName,
                siteUrl: createForm.siteUrl || undefined,
                customDomain: createForm.customDomain || undefined,
                category: createForm.category || undefined,
                language: createForm.language as any,
                notes: createForm.notes || undefined,
              })}
            >
              {createMut.isPending ? "添加中..." : "添加站点"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 站点配置弹窗 */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>配置站点：{selectedSite?.siteName}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="space-y-1.5">
              <Label>站点 URL</Label>
              <Input
                placeholder="https://sites.google.com/view/xxx"
                value={configForm.siteUrl}
                onChange={e => setConfigForm(f => ({ ...f, siteUrl: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>自定义域名</Label>
              <Input
                placeholder="www.example.com"
                value={configForm.customDomain}
                onChange={e => setConfigForm(f => ({ ...f, customDomain: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>站点状态</Label>
              <Select value={configForm.status} onValueChange={v => setConfigForm(f => ({ ...f, status: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">运行中</SelectItem>
                  <SelectItem value="inactive">已停用</SelectItem>
                  <SelectItem value="suspended">已封禁</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="border rounded-lg p-3 space-y-3">
              <p className="text-sm font-medium">Google Search Console 配置</p>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="gscVerified"
                  checked={configForm.gscVerified}
                  onChange={e => setConfigForm(f => ({ ...f, gscVerified: e.target.checked }))}
                  className="rounded"
                />
                <Label htmlFor="gscVerified" className="cursor-pointer">已在 GSC 完成验证</Label>
              </div>
              <div className="space-y-1.5">
                <Label>GSC 站点 URL</Label>
                <Input
                  placeholder="https://sites.google.com/view/xxx（GSC中注册的URL）"
                  value={configForm.gscSiteUrl}
                  onChange={e => setConfigForm(f => ({ ...f, gscSiteUrl: e.target.value }))}
                />
              </div>
            </div>
            <div className="border rounded-lg p-3 space-y-3">
              <div>
                <p className="text-sm font-medium">文章末尾链接</p>
                <p className="text-xs text-muted-foreground mt-1">发布时会追加到文章末尾；每个站点配置可独立维护。</p>
              </div>
              <div className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
                <Input
                  placeholder="链接名称，如：联系我们"
                  value={newSocialLink.label}
                  onChange={e => setNewSocialLink(v => ({ ...v, label: e.target.value }))}
                />
                <Input
                  type="url"
                  placeholder="https://example.com"
                  value={newSocialLink.url}
                  onChange={e => setNewSocialLink(v => ({ ...v, url: e.target.value }))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const label = newSocialLink.label.trim();
                    const url = newSocialLink.url.trim();
                    if (!label || !/^https?:\/\//i.test(url)) {
                      toast.error("请填写链接名称和有效的 http(s) 地址");
                      return;
                    }
                    setConfigForm(form => ({ ...form, socialLinks: [...form.socialLinks, { label, url }] }));
                    setNewSocialLink({ label: "", url: "" });
                  }}
                >添加</Button>
              </div>
              {configForm.socialLinks.length > 0 ? (
                <div className="space-y-2">
                  {configForm.socialLinks.map((link, index) => (
                    <div key={`${link.label}-${link.url}-${index}`} className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
                      <span className="font-medium shrink-0">{link.label}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{link.url}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setConfigForm(form => ({ ...form, socialLinks: form.socialLinks.filter((_, itemIndex) => itemIndex !== index) }))}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">尚未配置文章末尾链接。</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>备注</Label>
              <Textarea
                rows={2}
                value={configForm.notes}
                onChange={e => setConfigForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="border-t pt-4 mt-2">
            <Button variant="outline" onClick={() => setShowConfig(false)}>取消</Button>
            <Button
              disabled={updateMut.isPending}
              onClick={() => selectedSite && updateMut.mutate({
                id: selectedSite.id,
                siteUrl: configForm.siteUrl || undefined,
                customDomain: configForm.customDomain || undefined,
                gscVerified: configForm.gscVerified,
                gscSiteUrl: configForm.gscSiteUrl || undefined,
                status: configForm.status,
                socialLinks: configForm.socialLinks,
                notes: configForm.notes || undefined,
              })}
            >
              {updateMut.isPending ? "保存中..." : "保存配置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
