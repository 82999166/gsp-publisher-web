import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Plus, Trash2, ExternalLink, RefreshCw, Search } from "lucide-react";

type IndexStatus = "unknown" | "indexed" | "not_indexed" | "pending";

const indexStatusMap: Record<IndexStatus, { label: string; color: string }> = {
  unknown: { label: "未检测", color: "secondary" },
  indexed: { label: "已收录", color: "default" },
  not_indexed: { label: "未收录", color: "destructive" },
  pending: { label: "检测中", color: "outline" },
};

export default function PublishedPages() {
  const [keyword, setKeyword] = useState("");
  const [indexStatus, setIndexStatus] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addForm, setAddForm] = useState({
    title: "",
    keyword: "",
    publishedUrl: "",
    siteUrl: "",
    wordCount: "",
    qualityScore: "",
  });

  const utils = trpc.useUtils();

  const { data: stats } = trpc.publishedPages.stats.useQuery();
  const { data: pages = [], isLoading } = trpc.publishedPages.list.useQuery({
    keyword: keyword || undefined,
    indexStatus: indexStatus === "all" ? undefined : indexStatus,
    limit: 200,
  });

  const deleteMut = trpc.publishedPages.delete.useMutation({
    onSuccess: () => {
      toast.success("已删除");
      utils.publishedPages.list.invalidate();
      utils.publishedPages.stats.invalidate();
    },
  });

  const createMut = trpc.publishedPages.create.useMutation({
    onSuccess: () => {
      toast.success("添加成功");
      setShowAddDialog(false);
      setAddForm({ title: "", keyword: "", publishedUrl: "", siteUrl: "", wordCount: "", qualityScore: "" });
      utils.publishedPages.list.invalidate();
      utils.publishedPages.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const { data: exportData, refetch: doExport } = trpc.publishedPages.exportCsv.useQuery(
    { keyword: keyword || undefined, indexStatus: indexStatus === "all" ? undefined : indexStatus },
    { enabled: false }
  );

  const handleExport = async () => {
    const result = await doExport();
    if (result.data?.csv) {
      const bom = "\uFEFF";
      const blob = new Blob([bom + result.data.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `published_pages_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`已导出 ${result.data.total} 条记录`);
    }
  };

  const handleAdd = () => {
    if (!addForm.title || !addForm.publishedUrl) {
      toast.error("标题和发布URL为必填项");
      return;
    }
    createMut.mutate({
      title: addForm.title,
      keyword: addForm.keyword || undefined,
      publishedUrl: addForm.publishedUrl,
      siteUrl: addForm.siteUrl || undefined,
      wordCount: addForm.wordCount ? parseInt(addForm.wordCount) : undefined,
      qualityScore: addForm.qualityScore ? parseFloat(addForm.qualityScore) : undefined,
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">已发布链接</h1>
          <p className="text-muted-foreground text-sm mt-1">管理所有已发布的 Google Sites 页面，支持导出和收录状态追踪</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            导出 CSV
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            手动添加
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "总发布数", value: stats?.total ?? 0, color: "text-blue-600" },
          { label: "已收录", value: stats?.indexed ?? 0, color: "text-green-600" },
          { label: "未收录", value: stats?.notIndexed ?? 0, color: "text-red-500" },
          { label: "检测中", value: stats?.pending ?? 0, color: "text-yellow-500" },
          { label: "GSC已提交", value: stats?.gscSubmitted ?? 0, color: "text-purple-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 筛选栏 */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="搜索关键词..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <Select value={indexStatus} onValueChange={setIndexStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="收录状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="unknown">未检测</SelectItem>
            <SelectItem value="indexed">已收录</SelectItem>
            <SelectItem value="not_indexed">未收录</SelectItem>
            <SelectItem value="pending">检测中</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">共 {pages.length} 条</span>
      </div>

      {/* 数据表格 */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">ID</TableHead>
                  <TableHead>标题</TableHead>
                  <TableHead className="w-32">关键词</TableHead>
                  <TableHead className="w-24">字数</TableHead>
                  <TableHead className="w-20">质量分</TableHead>
                  <TableHead className="w-24">收录状态</TableHead>
                  <TableHead className="w-20">GSC</TableHead>
                  <TableHead className="w-36">发布时间</TableHead>
                  <TableHead className="w-24">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : pages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                      暂无发布记录
                      <br />
                      <span className="text-xs">发布任务完成后，链接将自动保存到这里</span>
                    </TableCell>
                  </TableRow>
                ) : (
                  pages.map((page: any) => {
                    const statusInfo = indexStatusMap[page.indexStatus as IndexStatus] ?? indexStatusMap.unknown;
                    return (
                      <TableRow key={page.id}>
                        <TableCell className="text-muted-foreground text-xs">{page.id}</TableCell>
                        <TableCell>
                          <div className="max-w-xs">
                            <a
                              href={page.publishedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline flex items-center gap-1 font-medium text-sm"
                            >
                              <span className="truncate">{page.title}</span>
                              <ExternalLink className="w-3 h-3 flex-shrink-0" />
                            </a>
                            <p className="text-xs text-muted-foreground truncate">{page.publishedUrl}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs bg-muted px-2 py-0.5 rounded">{page.keyword || "—"}</span>
                        </TableCell>
                        <TableCell className="text-sm">{page.wordCount ? `${page.wordCount}字` : "—"}</TableCell>
                        <TableCell>
                          {page.qualityScore != null ? (
                            <span className={`text-sm font-medium ${page.qualityScore >= 80 ? "text-green-600" : page.qualityScore >= 60 ? "text-yellow-600" : "text-red-500"}`}>
                              {page.qualityScore}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusInfo.color as any}>{statusInfo.label}</Badge>
                        </TableCell>
                        <TableCell>
                          {page.gscSubmitted ? (
                            <Badge variant="outline" className="text-purple-600 border-purple-300">已提交</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">未提交</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {page.publishedAt ? new Date(page.publishedAt).toLocaleDateString("zh-CN") : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700"
                            onClick={() => {
                              if (confirm("确认删除此记录？")) {
                                deleteMut.mutate({ id: page.id });
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 手动添加弹窗 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>手动添加发布记录</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">标题 <span className="text-red-500">*</span></label>
              <Input
                placeholder="文章标题"
                value={addForm.title}
                onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">发布 URL <span className="text-red-500">*</span></label>
              <Input
                placeholder="https://sites.google.com/..."
                value={addForm.publishedUrl}
                onChange={(e) => setAddForm({ ...addForm, publishedUrl: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">关键词</label>
                <Input
                  placeholder="主关键词"
                  value={addForm.keyword}
                  onChange={(e) => setAddForm({ ...addForm, keyword: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">站点 URL</label>
                <Input
                  placeholder="Google Site 根 URL"
                  value={addForm.siteUrl}
                  onChange={(e) => setAddForm({ ...addForm, siteUrl: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">字数</label>
                <Input
                  type="number"
                  placeholder="文章字数"
                  value={addForm.wordCount}
                  onChange={(e) => setAddForm({ ...addForm, wordCount: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">质量分</label>
                <Input
                  type="number"
                  placeholder="0-100"
                  min="0"
                  max="100"
                  value={addForm.qualityScore}
                  onChange={(e) => setAddForm({ ...addForm, qualityScore: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>取消</Button>
            <Button onClick={handleAdd} disabled={createMut.isPending}>
              {createMut.isPending ? "添加中..." : "添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
