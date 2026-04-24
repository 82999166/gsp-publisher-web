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
import { Textarea } from "@/components/ui/textarea";
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
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit2,
  Fingerprint,
  Globe,
  HelpCircle,
  KeyRound,
  Plus,
  RefreshCw,
  Shield,
  Trash2,
  User,
  XCircle,
  LogIn,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { OAuthAuthorizationButton } from "@/components/OAuthAuthorizationButton";

type Account = {
  id: number;
  name: string;
  email?: string | null;
  status: string;
  dailyLimit: number;
  siteAge: string;
  notes?: string | null;
  cookieRaw: string;
  lastVerifiedAt?: Date | null;
  createdAt?: Date | null;
  proxyConfig?: any;
  browserFingerprint?: any;
  defaultSiteUrl?: string | null;
  defaultSiteName?: string | null;
};

type ProxyForm = {
  host: string;
  port: string;
  username: string;
  password: string;
  protocol: "http" | "https" | "socks5";
};

type EditForm = Account & {
  newCookieRaw: string;
  showCookieField: boolean;
  showProxyField: boolean;
  showFingerprintField: boolean;
  proxyForm: ProxyForm;
  proxyEnabled: boolean;
};

const statusLabel: Record<string, string> = {
  online: "正常",
  expired: "已过期",
  pending: "待验证",
  error: "异常",
};

const siteAgeLabel: Record<string, string> = {
  new_site: "新站",
  growing: "成长期",
  mature: "成熟站",
};

function AccountStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: "bg-emerald-100 text-emerald-700 border-emerald-200",
    expired: "bg-red-100 text-red-700 border-red-200",
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    error: "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${colors[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {status === "online" ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {statusLabel[status] ?? status}
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
            <DialogTitle>账号管理使用说明</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-3">
            <p><strong className="text-foreground">1. 添加账号：</strong>点击「添加账号」按钮，填写账号名称和 Cookie 信息。</p>
            <p><strong className="text-foreground">2. Cookie 格式：</strong>支持 JSON 数组格式（推荐使用 Cookie-Editor 等插件导出）或原始 Cookie 字符串。</p>
            <p><strong className="text-foreground">3. 代理 IP：</strong>为每个账号配置独立代理，防止 Google 关联多账号。支持 HTTP/HTTPS/SOCKS5 协议。</p>
            <p><strong className="text-foreground">4. 浏览器指纹：</strong>每个账号自动生成独立浏览器指纹（UA、分辨率、时区等），防止 Google 识别多账号关联。</p>
            <p><strong className="text-foreground">5. 每日限制：</strong>建议新站每日发布不超过 5 篇，成熟站可适当提高。</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FingerprintBadge({ fingerprint }: { fingerprint: any }) {
  if (!fingerprint) {
    return <span className="text-xs text-muted-foreground">未生成</span>;
  }
  return (
    <div className="flex items-center gap-1">
      <Shield className="h-3 w-3 text-blue-500" />
      <span className="text-xs text-blue-600 font-mono">{fingerprint.id?.slice(0, 8) ?? "已配置"}</span>
    </div>
  );
}

function ProxyBadge({ proxy }: { proxy: any }) {
  if (!proxy) {
    return <span className="text-xs text-muted-foreground">未配置</span>;
  }
  return (
    <div className="flex items-center gap-1">
      <Globe className="h-3 w-3 text-purple-500" />
      <span className="text-xs text-purple-600">{proxy.protocol ?? "http"}://{proxy.host}:{proxy.port}</span>
    </div>
  );
}

export default function Accounts() {
  const utils = trpc.useUtils();
  const { data: accounts = [], isLoading } = trpc.accounts.list.useQuery();
  const createMutation = trpc.accounts.create.useMutation({
    onSuccess: () => {
      utils.accounts.list.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success("账号添加成功");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.accounts.update.useMutation({
    onSuccess: () => {
      utils.accounts.list.invalidate();
      setEditDialogOpen(false);
      toast.success("账号更新成功");
    },
    onError: (e) => toast.error(e.message),
  });
  const deleteMutation = trpc.accounts.delete.useMutation({
    onSuccess: () => {
      utils.accounts.list.invalidate();
      toast.success("账号已删除");
    },
    onError: (e) => toast.error(e.message),
  });
  const verifyMutation = trpc.accounts.verify.useMutation({
    onSuccess: (data) => {
      utils.accounts.list.invalidate();
      toast.success(`验证完成：${statusLabel[data.status] ?? data.status}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const verifyProxyMutation = trpc.publisher.verifyProxy.useMutation();
  const [proxyVerifyResult, setProxyVerifyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [proxyVerifying, setProxyVerifying] = useState(false);

  async function handleVerifyProxy() {
    if (!editAccount?.proxyForm.host.trim()) {
      toast.error("请先填写代理主机地址");
      return;
    }
    const port = parseInt(editAccount.proxyForm.port);
    if (!port || port < 1 || port > 65535) {
      toast.error("代理端口格式错误（1-65535）");
      return;
    }
    setProxyVerifying(true);
    setProxyVerifyResult(null);
    try {
      const result = await verifyProxyMutation.mutateAsync({
        host: editAccount.proxyForm.host.trim(),
        port,
        protocol: editAccount.proxyForm.protocol,
        username: editAccount.proxyForm.username.trim() || undefined,
        password: editAccount.proxyForm.password.trim() || undefined,
      });
      setProxyVerifyResult(result);
    } catch (e: any) {
      setProxyVerifyResult({ success: false, message: e.message });
    } finally {
      setProxyVerifying(false);
    }
  }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<EditForm | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    cookieRaw: "",
    dailyLimit: 5,
    siteAge: "new_site",
    notes: "",
  });

  function resetForm() {
    setForm({ name: "", email: "", cookieRaw: "", dailyLimit: 5, siteAge: "new_site", notes: "" });
  }

  function openEdit(account: Account) {
    const proxy = account.proxyConfig as any;
    setEditAccount({
      ...account,
      newCookieRaw: "",
      showCookieField: false,
      showProxyField: false,
      showFingerprintField: false,
      proxyEnabled: !!proxy,
      proxyForm: proxy
        ? { host: proxy.host ?? "", port: String(proxy.port ?? ""), username: proxy.username ?? "", password: proxy.password ?? "", protocol: proxy.protocol ?? "http" }
        : { host: "", port: "", username: "", password: "", protocol: "http" },
    });
    setEditDialogOpen(true);
  }

  function handleCreate() {
    if (!form.name.trim() || !form.cookieRaw.trim()) {
      toast.error("账号名称和 Cookie 为必填项");
      return;
    }
    createMutation.mutate({
      name: form.name.trim(),
      email: form.email || undefined,
      cookieRaw: form.cookieRaw.trim(),
      dailyLimit: form.dailyLimit,
      siteAge: form.siteAge as any,
      notes: form.notes || undefined,
    });
  }

  function handleUpdate() {
    if (!editAccount) return;
    if (editAccount.newCookieRaw.trim()) {
      try {
        const parsed = JSON.parse(editAccount.newCookieRaw.trim());
        if (!Array.isArray(parsed)) {
          toast.error("Cookie 格式错误：必须是 JSON 数组格式");
          return;
        }
      } catch {
        // 允许原始字符串格式
      }
    }

    // 构建代理配置
    let proxyConfig: any = null;
    if (editAccount.proxyEnabled && editAccount.proxyForm.host.trim()) {
      const port = parseInt(editAccount.proxyForm.port);
      if (!port || port < 1 || port > 65535) {
        toast.error("代理端口格式错误（1-65535）");
        return;
      }
      proxyConfig = {
        host: editAccount.proxyForm.host.trim(),
        port,
        username: editAccount.proxyForm.username.trim() || undefined,
        password: editAccount.proxyForm.password.trim() || undefined,
        protocol: editAccount.proxyForm.protocol,
      };
    }

    updateMutation.mutate({
      id: editAccount.id,
      name: editAccount.name,
      email: editAccount.email ?? undefined,
      cookieRaw: editAccount.newCookieRaw.trim() || undefined,
      dailyLimit: editAccount.dailyLimit,
      siteAge: editAccount.siteAge as any,
      notes: editAccount.notes ?? undefined,
      proxyConfig: editAccount.proxyEnabled ? proxyConfig : null,
      defaultSiteUrl: editAccount.defaultSiteUrl ?? undefined,
      defaultSiteName: editAccount.defaultSiteName ?? undefined,
    });
  }

  function handleResetFingerprint() {
    if (!editAccount) return;
    updateMutation.mutate(
      { id: editAccount.id, resetFingerprint: true },
      {
        onSuccess: () => {
          utils.accounts.list.invalidate();
          toast.success("浏览器指纹已重新生成");
        },
      }
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">账号管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理 Google Sites 账号，配置独立代理和浏览器指纹防关联</p>
        </div>
        <div className="flex items-center gap-2">
          <HelpTooltip />
          <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            添加账号
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "全部账号", value: accounts.length, color: "text-foreground" },
          { label: "正常", value: accounts.filter(a => a.status === "online").length, color: "text-emerald-600" },
          { label: "已过期", value: accounts.filter(a => a.status === "expired").length, color: "text-red-600" },
          { label: "已配置代理", value: accounts.filter(a => (a as any).proxyConfig).length, color: "text-purple-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-border p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">加载中...</div>
        ) : accounts.length === 0 ? (
          <div className="p-12 text-center">
            <User className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">暂无账号</p>
            <p className="text-xs text-muted-foreground mt-1">点击「添加账号」开始配置</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>账号名称</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>代理 IP</TableHead>
                <TableHead>浏览器指纹</TableHead>
                <TableHead>每日限制</TableHead>
                <TableHead>站点类型</TableHead>
                <TableHead>最后验证</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <div className="font-medium text-foreground">{account.name}</div>
                    {account.email && (
                      <div className="text-xs text-muted-foreground mt-0.5">{account.email}</div>
                    )}
                    {(account as any).notes && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[160px]">{(account as any).notes}</div>
                    )}
                  </TableCell>
                  <TableCell><AccountStatusBadge status={account.status} /></TableCell>
                  <TableCell><ProxyBadge proxy={(account as any).proxyConfig} /></TableCell>
                  <TableCell><FingerprintBadge fingerprint={(account as any).browserFingerprint} /></TableCell>
                  <TableCell className="text-sm tabular-nums">{account.dailyLimit} 篇/天</TableCell>
                  <TableCell className="text-sm">{siteAgeLabel[account.siteAge] ?? account.siteAge}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {account.lastVerifiedAt
                      ? new Date(account.lastVerifiedAt).toLocaleString("zh-CN")
                      : "未验证"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs gap-1"
                        onClick={() => verifyMutation.mutate({ id: account.id })}
                        disabled={verifyMutation.isPending}
                      >
                        <RefreshCw className="h-3 w-3" />
                        验证
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => openEdit(account as Account)}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm(`确认删除账号「${account.name}」？`)) {
                            deleteMutation.mutate({ id: account.id });
                          }
                        }}
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

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg flex flex-col" style={{ maxHeight: "90vh" }}>
          <DialogHeader className="shrink-0">
            <DialogTitle>添加账号</DialogTitle>
            <DialogDescription>配置 Google Sites 账号的 Cookie 认证信息</DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>账号名称 <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="如：账号A"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>邮箱地址</Label>
                <Input
                  placeholder="Google 邮箱（可选）"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cookie 数据 <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="粘贴 JSON 格式 Cookie（推荐）或原始 Cookie 字符串"
                className="font-mono text-xs h-40 resize-y"
                value={form.cookieRaw}
                onChange={e => setForm(f => ({ ...f, cookieRaw: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">支持 Cookie-Editor 等插件导出的 JSON 格式</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>每日发布上限</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={form.dailyLimit}
                  onChange={e => setForm(f => ({ ...f, dailyLimit: parseInt(e.target.value) || 5 }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>站点类型</Label>
                <Select value={form.siteAge} onValueChange={v => setForm(f => ({ ...f, siteAge: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new_site">新站</SelectItem>
                    <SelectItem value="growing">成长期</SelectItem>
                    <SelectItem value="mature">成熟站</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>备注</Label>
              <Input
                placeholder="可选备注信息"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-4 border-t mt-2">
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>取消</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "添加中..." : "添加账号"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      {editAccount && (
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="max-w-xl flex flex-col" style={{ maxHeight: "92vh" }}>
            <DialogHeader className="shrink-0">
              <DialogTitle>编辑账号 — {editAccount.name}</DialogTitle>
              <DialogDescription>修改账号信息、代理 IP 和浏览器指纹配置</DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 pr-1 space-y-4">
              {/* 基本信息 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>账号名称</Label>
                  <Input
                    value={editAccount.name}
                    onChange={e => setEditAccount(a => a ? { ...a, name: e.target.value } : a)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>邮箱地址</Label>
                  <Input
                    value={editAccount.email ?? ""}
                    onChange={e => setEditAccount(a => a ? { ...a, email: e.target.value } : a)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>每日发布上限</Label>
                  <Input
                    type="number"
                    min={1}
                    max={500}
                    value={editAccount.dailyLimit}
                    onChange={e => setEditAccount(a => a ? { ...a, dailyLimit: parseInt(e.target.value) || 5 } : a)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>站点类型</Label>
                  <Select
                    value={editAccount.siteAge}
                    onValueChange={v => setEditAccount(a => a ? { ...a, siteAge: v } : a)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new_site">新站</SelectItem>
                      <SelectItem value="growing">成长期</SelectItem>
                      <SelectItem value="mature">成熟站</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>备注</Label>
                <Input
                  value={editAccount.notes ?? ""}
                  onChange={e => setEditAccount(a => a ? { ...a, notes: e.target.value } : a)}
                />
              </div>

              {/* Google Site URL 配置 */}
              <div className="border border-green-200 rounded-lg overflow-hidden">
                <div className="px-4 py-3 bg-green-50 border-b border-green-200">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-800">Google Site 编辑器地址（必填）</span>
                    {editAccount.defaultSiteUrl && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200">已配置</span>
                    )}
                  </div>
                  <p className="text-xs text-green-700 mt-1">发布文章需要指定一个已有的 Google Site。请先在 Google Sites 中手动创建一个站点，然后将编辑器 URL 粘贴到下方。</p>
                </div>
                <div className="p-4 space-y-3">
                  <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-3 space-y-1">
                    <p className="font-medium text-amber-800">如何获取 Google Site 编辑器地址：</p>
                    <p>1. 用此账号登录 Google，访问 <strong>sites.google.com</strong></p>
                    <p>2. 点击「空白」创建新站点，或打开已有站点</p>
                    <p>3. 进入编辑器后，复制浏览器地址栏的 URL</p>
                    <p>4. 格式类似：<code className="bg-amber-100 px-1 rounded">https://sites.google.com/u/0/d/1qQM.../p/...</code></p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">编辑器 URL</Label>
                    <Input
                      placeholder="https://sites.google.com/u/0/d/xxxxx/p/xxxxx/preview"
                      value={editAccount.defaultSiteUrl ?? ""}
                      onChange={e => setEditAccount(a => a ? { ...a, defaultSiteUrl: e.target.value } : a)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">站点名称（可选）</Label>
                    <Input
                      placeholder="如：my-seo-site-2024"
                      value={editAccount.defaultSiteName ?? ""}
                      onChange={e => setEditAccount(a => a ? { ...a, defaultSiteName: e.target.value } : a)}
                    />
                  </div>
                </div>
              </div>

              {/* Cookie 修改区域 */}
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-medium"
                  onClick={() => setEditAccount(a => a ? { ...a, showCookieField: !a.showCookieField } : a)}
                >
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-amber-600" />
                    <span>更新 Cookie</span>
                    {editAccount.newCookieRaw.trim() && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">已填写</span>
                    )}
                  </div>
                  {editAccount.showCookieField
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {editAccount.showCookieField && (
                  <div className="p-4 space-y-3 border-t border-border">
                    <div className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-3 space-y-1">
                      <p className="font-medium text-amber-800">如何获取最新 Cookie：</p>
                      <p>1. 在 Chrome 中登录 Google 账号</p>
                      <p>2. 安装 <strong>Cookie-Editor</strong> 插件</p>
                      <p>3. 在 google.com 上打开插件 → Export → Export as JSON</p>
                      <p>4. 将复制的 JSON 粘贴到下方文本框</p>
                    </div>
                    <Textarea
                      placeholder='粘贴新的 Cookie JSON，例如：[{"name":"SID","value":"...","domain":".google.com"}]'
                      className="font-mono text-xs h-36 resize-y"
                      value={editAccount.newCookieRaw}
                      onChange={e => setEditAccount(a => a ? { ...a, newCookieRaw: e.target.value } : a)}
                    />
                    <p className="text-xs text-muted-foreground">留空则不修改现有 Cookie</p>
                  </div>
                )}
              </div>

              {/* 代理 IP 配置区域 */}
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-medium"
                  onClick={() => setEditAccount(a => a ? { ...a, showProxyField: !a.showProxyField } : a)}
                >
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-purple-600" />
                    <span>代理 IP 配置</span>
                    {editAccount.proxyEnabled && editAccount.proxyForm.host && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                        {editAccount.proxyForm.protocol}://{editAccount.proxyForm.host}:{editAccount.proxyForm.port}
                      </span>
                    )}
                    {!editAccount.proxyEnabled && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">未启用</span>
                    )}
                  </div>
                  {editAccount.showProxyField
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {editAccount.showProxyField && (
                  <div className="p-4 space-y-3 border-t border-border">
                    <div className="text-xs text-muted-foreground bg-purple-50 border border-purple-200 rounded p-3">
                      <p className="font-medium text-purple-800 mb-1">为什么需要代理 IP？</p>
                      <p>Google 会检测来自数据中心 IP 的请求并拒绝 Cookie 登录。配置住宅代理（Residential Proxy）可让发布请求从真实家庭 IP 发出，有效避免封号。</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="proxyEnabled"
                        checked={editAccount.proxyEnabled}
                        onChange={e => setEditAccount(a => a ? { ...a, proxyEnabled: e.target.checked } : a)}
                        className="h-4 w-4 rounded border-border"
                      />
                      <Label htmlFor="proxyEnabled" className="cursor-pointer">启用代理</Label>
                    </div>
                    {editAccount.proxyEnabled && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-2 space-y-1.5">
                            <Label className="text-xs">代理主机</Label>
                            <Input
                              placeholder="如：proxy.example.com 或 1.2.3.4"
                              value={editAccount.proxyForm.host}
                              onChange={e => setEditAccount(a => a ? { ...a, proxyForm: { ...a.proxyForm, host: e.target.value } } : a)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">端口</Label>
                            <Input
                              placeholder="如：1080"
                              value={editAccount.proxyForm.port}
                              onChange={e => setEditAccount(a => a ? { ...a, proxyForm: { ...a.proxyForm, port: e.target.value } } : a)}
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">协议</Label>
                          <Select
                            value={editAccount.proxyForm.protocol}
                            onValueChange={v => setEditAccount(a => a ? { ...a, proxyForm: { ...a.proxyForm, protocol: v as any } } : a)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="http">HTTP</SelectItem>
                              <SelectItem value="https">HTTPS</SelectItem>
                              <SelectItem value="socks5">SOCKS5</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">用户名（可选）</Label>
                            <Input
                              placeholder="代理用户名"
                              value={editAccount.proxyForm.username}
                              onChange={e => setEditAccount(a => a ? { ...a, proxyForm: { ...a.proxyForm, username: e.target.value } } : a)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">密码（可选）</Label>
                            <Input
                              type="password"
                              placeholder="代理密码"
                              value={editAccount.proxyForm.password}
                              onChange={e => setEditAccount(a => a ? { ...a, proxyForm: { ...a.proxyForm, password: e.target.value } } : a)}
                            />
                          </div>
                        </div>
                        {/* 验证代理按鈕 */}
                        <div className="pt-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleVerifyProxy}
                            disabled={proxyVerifying}
                            className="gap-2 w-full"
                          >
                            {proxyVerifying ? (
                              <><RefreshCw className="h-3.5 w-3.5 animate-spin" />验证中，请稍候...</>
                            ) : (
                              <><Globe className="h-3.5 w-3.5" />验证代理连通性</>
                            )}
                          </Button>
                          {proxyVerifyResult && (
                            <div className={`mt-2 text-xs rounded p-2.5 border ${
                              proxyVerifyResult.success
                                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                : "bg-red-50 border-red-200 text-red-800"
                            }`}>
                              {proxyVerifyResult.message}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 浏览器指纹区域 */}
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-medium"
                  onClick={() => setEditAccount(a => a ? { ...a, showFingerprintField: !a.showFingerprintField } : a)}
                >
                  <div className="flex items-center gap-2">
                    <Fingerprint className="h-4 w-4 text-blue-600" />
                    <span>浏览器指纹</span>
                    {editAccount.browserFingerprint ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">
                        已配置 · {(editAccount.browserFingerprint as any).id?.slice(0, 8) ?? "独立指纹"}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">未生成</span>
                    )}
                  </div>
                  {editAccount.showFingerprintField
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {editAccount.showFingerprintField && (
                  <div className="p-4 space-y-3 border-t border-border">
                    <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-3">
                      <p className="font-medium text-blue-800 mb-1">浏览器指纹防关联</p>
                      <p>每个账号使用独立的浏览器指纹（User-Agent、屏幕分辨率、时区、语言、硬件配置等），防止 Google 通过设备特征识别多账号关联。</p>
                    </div>
                    {editAccount.browserFingerprint && (
                      <div className="text-xs font-mono bg-muted/50 rounded p-3 space-y-1 text-muted-foreground">
                        <p><span className="text-foreground">UA：</span>{(editAccount.browserFingerprint as any).userAgent?.slice(0, 60)}...</p>
                        <p><span className="text-foreground">分辨率：</span>{(editAccount.browserFingerprint as any).screenWidth}×{(editAccount.browserFingerprint as any).screenHeight}</p>
                        <p><span className="text-foreground">时区：</span>{(editAccount.browserFingerprint as any).timezone}</p>
                        <p><span className="text-foreground">语言：</span>{(editAccount.browserFingerprint as any).language}</p>
                        <p><span className="text-foreground">平台：</span>{(editAccount.browserFingerprint as any).platform}</p>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 w-full"
                      onClick={handleResetFingerprint}
                      disabled={updateMutation.isPending}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {editAccount.browserFingerprint ? "重新生成指纹" : "生成独立指纹"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter className="shrink-0 pt-4 border-t mt-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>取消</Button>
              <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "保存中..." : "保存修改"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
