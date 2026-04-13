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
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Loader2,
  Plus,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Task = {
  id: number;
  name: string;
  accountId: number;
  materialId?: number | null;
  status: string;
  publishedUrl?: string | null;
  errorMessage?: string | null;
  scheduledAt?: Date | null;
  completedAt?: Date | null;
};

const statusLabel: Record<string, string> = {
  pending: "待执行",
  running: "执行中",
  success: "已成功",
  failed: "已失败",
  scheduled: "已计划",
};

export default function PublishTasks() {
  const utils = trpc.useUtils();
  const { data: tasks = [], isLoading } = trpc.tasks.list.useQuery();
  const { data: accounts = [] } = trpc.accounts.list.useQuery();
  const { data: materials = [] } = trpc.materials.list.useQuery({ status: "approved" });

  const createMutation = trpc.tasks.create.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      setDialogOpen(false);
      resetForm();
      toast.success("任务创建成功");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatusMutation = trpc.tasks.updateStatus.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      toast.success("任务状态已更新");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      toast.success("任务已删除");
    },
    onError: (e) => toast.error(e.message),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    accountId: "",
    materialId: "",
    scheduledAt: "",
  });

  function resetForm() {
    setForm({ name: "", accountId: "", materialId: "", scheduledAt: "" });
  }

  function handleCreate() {
    if (!form.name.trim() || !form.accountId) {
      toast.error("任务名称和账号为必填项");
      return;
    }
    createMutation.mutate({
      name: form.name.trim(),
      accountId: parseInt(form.accountId),
      materialId: form.materialId ? parseInt(form.materialId) : undefined,
      scheduledAt: form.scheduledAt || undefined,
    });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">发布任务</h1>
          <p className="text-sm text-muted-foreground mt-1">管理 Google Sites 自动化发布任务</p>
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
            新建任务
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "全部任务", value: tasks.length, color: "text-foreground" },
          { label: "待执行", value: tasks.filter((t: Task) => t.status === "pending").length, color: "text-amber-600" },
          { label: "执行中", value: tasks.filter((t: Task) => t.status === "running").length, color: "text-blue-600" },
          { label: "已成功", value: tasks.filter((t: Task) => t.status === "success").length, color: "text-emerald-600" },
          { label: "已失败", value: tasks.filter((t: Task) => t.status === "failed").length, color: "text-red-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-border p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <Zap className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-amber-800">发布引擎配置提示</p>
          <p className="mt-1 text-amber-700">
            自动发布功能需要配置代理服务器，请前往「系统设置」完成代理配置后再执行发布任务。
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">加载中...</div>
        ) : tasks.length === 0 ? (
          <div className="p-12 text-center">
            <Zap className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">暂无发布任务</p>
            <p className="text-xs text-muted-foreground mt-1">点击「新建任务」创建发布计划</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>任务名称</th>
                <th>账号</th>
                <th>状态</th>
                <th>发布链接</th>
                <th>计划时间</th>
                <th>完成时间</th>
                <th className="text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task: Task) => {
                const account = (accounts as any[]).find((a: any) => a.id === task.accountId);
                return (
                  <tr key={task.id}>
                    <td>
                      <div className="font-medium text-foreground text-sm">{task.name}</div>
                      {task.errorMessage && (
                        <div className="text-xs text-red-600 mt-0.5 truncate max-w-[200px]">{task.errorMessage}</div>
                      )}
                    </td>
                    <td className="text-sm text-muted-foreground">{account?.name ?? `#${task.accountId}`}</td>
                    <td><span className={`badge-${task.status}`}>{statusLabel[task.status] ?? task.status}</span></td>
                    <td>
                      {task.publishedUrl ? (
                        <a
                          href={task.publishedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          查看
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {task.scheduledAt ? new Date(task.scheduledAt).toLocaleString("zh-CN") : "立即"}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {task.completedAt ? new Date(task.completedAt).toLocaleString("zh-CN") : "—"}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {task.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-blue-600 hover:bg-blue-50"
                            onClick={() => updateStatusMutation.mutate({ id: task.id, status: "running" })}
                          >
                            <Loader2 className="h-3 w-3" />
                            执行
                          </Button>
                        )}
                        {task.status === "running" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1 text-emerald-600 hover:bg-emerald-50"
                              onClick={() => {
                                const url = prompt("输入发布成功的 URL：");
                                if (url) updateStatusMutation.mutate({ id: task.id, status: "success", publishedUrl: url });
                              }}
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              完成
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1 text-red-600 hover:bg-red-50"
                              onClick={() => updateStatusMutation.mutate({ id: task.id, status: "failed", errorMessage: "手动标记失败" })}
                            >
                              <XCircle className="h-3 w-3" />
                              失败
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`确认删除任务「${task.name}」？`)) {
                              deleteMutation.mutate({ id: task.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>新建发布任务</DialogTitle>
            <DialogDescription>配置自动化发布任务参数</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>任务名称 <span className="text-destructive">*</span></Label>
              <Input
                placeholder="如：发布-关键词A-2026-04"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>使用账号 <span className="text-destructive">*</span></Label>
              <Select value={form.accountId} onValueChange={v => setForm(f => ({ ...f, accountId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="选择账号" />
                </SelectTrigger>
                <SelectContent>
                  {(accounts as any[]).map((a: any) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>使用素材</Label>
              <Select value={form.materialId} onValueChange={v => setForm(f => ({ ...f, materialId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="选择已通过审核的素材（可选）" />
                </SelectTrigger>
                <SelectContent>
                  {(materials as any[]).map((m: any) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>计划执行时间</Label>
              <Input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">留空则立即执行</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>取消</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "创建中..." : "创建任务"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>发布任务使用说明</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-3">
            <p><strong className="text-foreground">1. 创建任务：</strong>选择账号和素材，创建发布任务。支持立即执行或定时发布。</p>
            <p><strong className="text-foreground">2. 执行流程：</strong>系统通过 Playwright 自动化浏览器登录 Google Sites 并发布内容。</p>
            <p><strong className="text-foreground">3. 任务状态：</strong>待执行→执行中→已成功/已失败。失败任务可查看错误信息。</p>
            <p><strong className="text-foreground">4. 发布成功：</strong>成功后自动创建收录监控记录，可在「收录监控」页面查看。</p>
            <p><strong className="text-foreground">5. 注意事项：</strong>需要先配置代理服务器（在系统设置中），以确保能访问 Google 服务。</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
