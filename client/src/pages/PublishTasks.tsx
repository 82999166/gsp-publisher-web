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
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Loader2,
  Plus,
  RefreshCw,
  ScrollText,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

type Task = {
  id: number;
  name: string;
  accountId: number;
  materialId?: number | null;
  status: string;
  publishedUrl?: string | null;
  errorMessage?: string | null;
  engineLog?: string | null;
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

const statusClass: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
  running: "bg-blue-50 text-blue-700 border border-blue-200 animate-pulse",
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  failed: "bg-red-50 text-red-700 border border-red-200",
  scheduled: "bg-purple-50 text-purple-700 border border-purple-200",
};

export default function PublishTasks() {
  const utils = trpc.useUtils();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const batchDeleteMutation = trpc.tasks.batchDelete.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      setSelectedIds(new Set());
      toast.success("批量删除成功");
    },
    onError: (e) => toast.error(e.message),
  });
  function toggleSelect(id: number) {
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  function toggleSelectAll(taskList: Task[]) {
    if (selectedIds.size === taskList.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(taskList.map(t => t.id)));
  }
  function handleBatchDelete(taskList: Task[]) {
    if (selectedIds.size === 0) return;
    if (confirm(`确认删除选中的 ${selectedIds.size} 个任务？`)) {
      batchDeleteMutation.mutate({ ids: Array.from(selectedIds) });
    }
  }
  const { data: tasks = [], isLoading, refetch } = trpc.tasks.list.useQuery(undefined, {
    refetchInterval: 4000, // 每4秒自动刷新
  });
  const { data: accounts = [] } = trpc.accounts.list.useQuery();
  const { data: materials = [] } = trpc.materials.list.useQuery({ status: "approved" });

  // 当前正在轮询的任务 ID
  const [pollingTaskId, setPollingTaskId] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
    onSuccess: () => { utils.tasks.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.tasks.delete.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      toast.success("任务已删除");
    },
    onError: (e) => toast.error(e.message),
  });

  // 查询任务状态（轮询用）
  const taskStatusQuery = trpc.publisher.getTaskStatus.useQuery(
    { taskId: pollingTaskId ?? 0 },
    {
      enabled: pollingTaskId !== null,
      refetchInterval: pollingTaskId !== null ? 2000 : false,
    }
  );

  // executeTask mutation - 异步触发，立即返回
  const executeTaskMutation = trpc.publisher.executeTask.useMutation({
    onMutate: ({ taskId }: { taskId: number }) => {
      setPollingTaskId(taskId);
      setLogLines([`[${new Date().toLocaleTimeString()}] 开始执行发布任务 #${taskId}...`]);
      setLogOpen(true);
    },
    onSuccess: (_data: any, variables: { taskId: number }) => {
      // 任务已加入队列，开始轮询
      toast.info("发布任务已启动，正在后台执行...");
      utils.tasks.list.invalidate();
    },
    onError: (e: any) => {
      setPollingTaskId(null);
      utils.tasks.list.invalidate();
      setLogLines(prev => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ 启动失败：${e.message}`,
      ]);
      toast.error(`启动失败：${e.message}`);
    },
  });

  // 监听轮询结果，更新日志显示
  useEffect(() => {
    if (!pollingTaskId || !taskStatusQuery.data) return;
    const data = taskStatusQuery.data;
    const logText = data.engineLog ?? "";
    const lines = logText.split("\n").filter(Boolean);
    if (lines.length > 0) {
      setLogLines(lines);
    }
    // 任务完成时停止轮询
    if (data.status === "success" || data.status === "failed") {
      setPollingTaskId(null);
      utils.tasks.list.invalidate();
      if (data.status === "success") {
        toast.success("发布成功！");
        setLogLines(prev => {
          const last = prev[prev.length - 1] ?? "";
          if (!last.includes("✅")) {
            return [...prev, `[${new Date().toLocaleTimeString()}] ✅ 发布成功！${data.publishedUrl ? " 链接：" + data.publishedUrl : ""}`];
          }
          return prev;
        });
      } else {
        toast.error(`发布失败：${data.errorMessage ?? "未知错误"}`);
        setLogLines(prev => {
          const last = prev[prev.length - 1] ?? "";
          if (!last.includes("❌")) {
            return [...prev, `[${new Date().toLocaleTimeString()}] ❌ 发布失败：${data.errorMessage ?? "未知错误"}`];
          }
          return prev;
        });
      }
    }
  }, [taskStatusQuery.data, pollingTaskId]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [viewLogTask, setViewLogTask] = useState<Task | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

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
      materialId: form.materialId && form.materialId !== "none" ? parseInt(form.materialId) : undefined,
      scheduledAt: form.scheduledAt || undefined,
    });
  }

  function handleExecute(task: Task) {
    if (!task.materialId) {
      toast.error("该任务未关联素材，无法执行发布");
      return;
    }
    executeTaskMutation.mutate({ taskId: task.id });
  }

  // 自动滚动日志到底部
  useEffect(() => {
    if (logOpen && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logLines, logOpen]);

  const isExecuting = pollingTaskId !== null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">发布任务</h1>
          <p className="text-sm text-muted-foreground mt-1">管理 Google Sites 自动化发布任务</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="刷新"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            onClick={() => setHelpOpen(true)}
            className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-2"
              onClick={() => handleBatchDelete(tasks as Task[])}
              disabled={batchDeleteMutation.isPending}
            >
              <Trash2 className="h-4 w-4" />
              批量删除 ({selectedIds.size})
            </Button>
          )}
          <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            新建任务
          </Button>
        </div>
      </div>

      {/* Stats */}
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

      {/* Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <Zap className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-amber-800">发布引擎配置提示</p>
          <p className="mt-1 text-amber-700">
            自动发布功能需要有效的 Google 账号 Cookie 和代理服务器。请确保账号 Cookie 已更新（账号管理 → 编辑 → 更新 Cookie），并在「系统设置」完成代理配置。
          </p>
        </div>
      </div>

      {/* Table */}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={(tasks as Task[]).length > 0 && selectedIds.size === (tasks as Task[]).length}
                    onCheckedChange={() => toggleSelectAll(tasks as Task[])}
                  />
                </TableHead>
                <TableHead>任务名称</TableHead>
                <TableHead>账号</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>发布链接</TableHead>
                <TableHead>错误信息</TableHead>
                <TableHead>计划时间</TableHead>
                <TableHead>完成时间</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tasks as Task[]).map((task) => {
                const account = (accounts as any[]).find((a: any) => a.id === task.accountId);
                const isThisExecuting = pollingTaskId === task.id;
                return (
                  <TableRow key={task.id} className={isThisExecuting ? "bg-blue-50/50" : selectedIds.has(task.id) ? "bg-muted/50" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(task.id)}
                        onCheckedChange={() => toggleSelect(task.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground text-sm">{task.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">#{task.id}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {account?.name ?? `#${task.accountId}`}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusClass[task.status] ?? "bg-muted text-muted-foreground"}`}>
                        {(isThisExecuting || task.status === "running") && <Loader2 className="h-3 w-3 animate-spin" />}
                        {statusLabel[task.status] ?? task.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      {task.publishedUrl ? (
                        <a
                          href={task.publishedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />
                          查看链接
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {task.errorMessage ? (
                        <div className="flex items-start gap-1 max-w-[200px]">
                          <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                          <span className="text-xs text-red-600 line-clamp-2">{task.errorMessage}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {task.scheduledAt ? new Date(task.scheduledAt).toLocaleString("zh-CN") : "立即"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {task.completedAt ? new Date(task.completedAt).toLocaleString("zh-CN") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {/* 待执行：调用真实发布引擎 */}
                        {task.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-blue-600 hover:bg-blue-50"
                            disabled={isExecuting || executeTaskMutation.isPending}
                            onClick={() => handleExecute(task)}
                          >
                            {isThisExecuting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Zap className="h-3 w-3" />
                            )}
                            执行
                          </Button>
                        )}
                        {/* 失败任务：重试 */}
                        {task.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-amber-600 hover:bg-amber-50"
                            disabled={isExecuting}
                            onClick={() => {
                              updateStatusMutation.mutate({ id: task.id, status: "pending" }, {
                                onSuccess: () => {
                                  executeTaskMutation.mutate({ taskId: task.id });
                                }
                              });
                            }}
                          >
                            <RefreshCw className="h-3 w-3" />
                            重试
                          </Button>
                        )}
                        {/* 执行中：查看实时日志 */}
                        {task.status === "running" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-blue-600 hover:bg-blue-50"
                            onClick={() => {
                              setPollingTaskId(task.id);
                              const lines = (task.engineLog ?? "").split("\n").filter(Boolean);
                              setLogLines(lines.length > 0 ? lines : [`[${new Date().toLocaleTimeString()}] 任务 #${task.id} 正在执行中...`]);
                              setLogOpen(true);
                            }}
                          >
                            <Loader2 className="h-3 w-3 animate-spin" />
                            查看进度
                          </Button>
                        )}
                        {/* 查看日志 */}
                        {(task.engineLog || task.errorMessage) && task.status !== "running" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:bg-muted"
                            onClick={() => {
                              setViewLogTask(task);
                              setLogLines((task.engineLog ?? task.errorMessage ?? "").split("\n").filter(Boolean));
                              setLogOpen(true);
                            }}
                          >
                            <ScrollText className="h-3 w-3" />
                            日志
                          </Button>
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
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create Dialog */}
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
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>关联素材（可选）</Label>
              <Select value={form.materialId} onValueChange={v => setForm(f => ({ ...f, materialId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="选择已通过审核的素材" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不关联素材</SelectItem>
                  {(materials as any[]).map((m: any) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>计划执行时间（可选）</Label>
              <Input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">留空则立即执行</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              创建任务
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Dialog */}
      <Dialog open={logOpen} onOpenChange={(open) => {
        if (!open && isExecuting) {
          // 执行中允许关闭对话框，但继续后台轮询
        }
        setLogOpen(open);
        if (!open) setViewLogTask(null);
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="h-4 w-4" />
              {isExecuting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  发布引擎运行日志（实时更新）
                </span>
              ) : (
                `任务日志${viewLogTask ? ` — ${viewLogTask.name}` : ""}`
              )}
            </DialogTitle>
            {isExecuting && (
              <DialogDescription>发布引擎正在后台运行，每2秒自动刷新日志...</DialogDescription>
            )}
          </DialogHeader>
          <div className="bg-zinc-950 rounded-lg p-4 h-80 overflow-y-auto font-mono text-xs">
            {logLines.length === 0 ? (
              <p className="text-zinc-500">等待日志输出...</p>
            ) : (
              logLines.map((line, i) => (
                <div
                  key={i}
                  className={`leading-5 ${
                    line.includes("✅") || line.includes("成功")
                      ? "text-emerald-400"
                      : line.includes("❌") || line.includes("失败") || line.includes("错误") || line.includes("异常")
                      ? "text-red-400"
                      : line.includes("⚠") || line.includes("警告")
                      ? "text-amber-400"
                      : "text-zinc-300"
                  }`}
                >
                  {line}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setLogOpen(false);
                setViewLogTask(null);
              }}
            >
              {isExecuting ? "后台继续执行，关闭日志" : "关闭"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Help Dialog */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>发布任务说明</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p><strong className="text-foreground">发布流程：</strong>创建任务 → 点击「执行」→ 系统立即返回（后台启动 Puppeteer）→ 实时日志每2秒自动刷新 → 发布成功后保存链接。</p>
            <p><strong className="text-foreground">前提条件：</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>账号 Cookie 有效（在账号管理中验证）</li>
              <li>已配置代理服务器（系统设置 → 代理配置）</li>
              <li>关联素材已通过审核</li>
            </ul>
            <p><strong className="text-foreground">状态说明：</strong>待执行 → 执行中（Puppeteer 后台运行，约30-90秒）→ 已成功/已失败</p>
            <p><strong className="text-foreground">失败原因排查：</strong>点击「日志」按钮查看 Puppeteer 执行详情，常见原因包括 Cookie 过期、代理连接失败、Google 反爬虫拦截。</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
