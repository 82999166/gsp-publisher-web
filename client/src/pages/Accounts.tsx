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
  HelpCircle,
  KeyRound,
  Plus,
  RefreshCw,
  Trash2,
  User,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
};

type EditForm = Account & { newCookieRaw: string; showCookieField: boolean; };

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
  return <span className={`badge-${status}`}>{statusLabel[status] ?? status}</span>;
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
            <p><strong className="text-foreground">3. 验证 Cookie：</strong>点击「验证」按钮检测 Cookie 是否有效，系统会自动更新账号状态。</p>
            <p><strong className="text-foreground">4. 每日限制：</strong>建议新站每日发布不超过 5 篇，成熟站可适当提高。</p>
            <p><strong className="text-foreground">5. 站点年龄：</strong>影响发布策略，新站需要更保守的发布节奏。</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
    setEditAccount({ ...account, newCookieRaw: "", showCookieField: false });
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
    // 如果填写了新 Cookie，先验证格式
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
    updateMutation.mutate({
      id: editAccount.id,
      name: editAccount.name,
      email: editAccount.email ?? undefined,
      cookieRaw: editAccount.newCookieRaw.trim() || undefined,
      dailyLimit: editAccount.dailyLimit,
      siteAge: editAccount.siteAge as any,
      notes: editAccount.notes ?? undefined,
    });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">账号管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理 Google Sites 账号与 Cookie 认证信息</p>
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
          { label: "待验证", value: accounts.filter(a => a.status === "pending").length, color: "text-amber-600" },
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
                <TableHead>邮箱</TableHead>
                <TableHead>状态</TableHead>
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
                    {account.notes && (
                      <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[180px]">{account.notes}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{account.email ?? "—"}</TableCell>
                  <TableCell><AccountStatusBadge status={account.status} /></TableCell>
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
          <DialogContent className="max-w-lg flex flex-col" style={{ maxHeight: "90vh" }}>
            <DialogHeader className="shrink-0">
              <DialogTitle>编辑账号</DialogTitle>
              <DialogDescription>修改账号信息，如需更新 Cookie 请展开 Cookie 修改区域</DialogDescription>
            </DialogHeader>
            <div className="overflow-y-auto flex-1 pr-1 space-y-4">
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
