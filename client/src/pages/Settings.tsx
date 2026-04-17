import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Bot,
  Globe,
  Key,
  Loader2,
  Save,
  Settings as SettingsIcon,
  Shield,
  Wifi,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type SettingSection = "general" | "ai" | "proxy" | "publish" | "gsc";

const sections: { id: SettingSection; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "基础设置", icon: <SettingsIcon className="h-4 w-4" /> },
  { id: "ai", label: "AI 配置", icon: <Bot className="h-4 w-4" /> },
  { id: "proxy", label: "代理设置", icon: <Wifi className="h-4 w-4" /> },
  { id: "publish", label: "发布配置", icon: <Globe className="h-4 w-4" /> },
  { id: "gsc", label: "Google Search Console", icon: <Key className="h-4 w-4" /> },
];

export default function Settings() {
  const [activeSection, setActiveSection] = useState<SettingSection>("general");
  const { data: settings, isLoading } = trpc.settings.get.useQuery();
  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: () => toast.success("设置已保存"),
    onError: (e) => toast.error(e.message),
  });

  const [form, setForm] = useState({
    // general
    siteName: "",
    siteDescription: "",
    defaultLanguage: "zh-CN",
    timezone: "Asia/Shanghai",
    // ai
    aiProvider: "groq",
    groqApiKey: "",
    aiModel: "llama-3.3-70b-versatile",
    aiTemperature: 0.7,
    aiMaxTokens: 4096,
    // proxy
    proxyEnabled: false,
    proxyType: "http",
    proxyHost: "",
    proxyPort: "",
    proxyUsername: "",
    proxyPassword: "",
    // publish
    publishInterval: 30,
    publishRetryCount: 3,
    publishConcurrency: 1,
    publishUserAgent: "",
    headlessBrowser: true,
    autoApproveThreshold: 0,
    // gsc
    gscEnabled: false,
    gscAutoSubmit: true,
    gscClientEmail: "",
    gscPrivateKey: "",
    gscSiteUrl: "",
    gscServiceAccountJson: "",
  });

  useEffect(() => {
    if (settings) {
      setForm(prev => ({ ...prev, ...settings }));
    }
  }, [settings]);

  function handleSave() {
    updateMutation.mutate(form as any);
  }

  function setField(key: string, value: any) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">系统设置</h1>
        <p className="text-sm text-muted-foreground mt-1">配置 AI、代理、发布引擎等核心参数</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-44 shrink-0">
          <nav className="space-y-0.5">
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left ${
                  activeSection === s.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl border border-border shadow-sm p-6">
          {activeSection === "general" && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-foreground border-b pb-3">基础设置</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>站点名称</Label>
                  <Input value={form.siteName} onChange={e => setField("siteName", e.target.value)} placeholder="如来佛谷歌协作发布系统" />
                </div>
                <div className="space-y-1.5">
                  <Label>默认语言</Label>
                  <Select value={form.defaultLanguage} onValueChange={v => setField("defaultLanguage", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zh-CN">简体中文</SelectItem>
                      <SelectItem value="en">英文</SelectItem>
                      <SelectItem value="zh-TW">繁体中文</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>站点描述</Label>
                <Textarea
                  value={form.siteDescription}
                  onChange={e => setField("siteDescription", e.target.value)}
                  placeholder="Google Sites 自动化发布与 SEO 管理工具"
                  className="resize-none h-20"
                />
              </div>
              <div className="space-y-1.5">
                <Label>时区</Label>
                <Select value={form.timezone} onValueChange={v => setField("timezone", v)}>
                  <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Shanghai">Asia/Shanghai (UTC+8)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">America/New_York (UTC-5)</SelectItem>
                    <SelectItem value="Europe/London">Europe/London (UTC+0)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {activeSection === "ai" && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-foreground border-b pb-3">AI 配置</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>AI 提供商</Label>
                  <Select value={form.aiProvider} onValueChange={v => setField("aiProvider", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="groq">Groq (推荐，免费)</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>模型</Label>
                  <Select value={form.aiModel} onValueChange={v => setField("aiModel", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile (推荐)</SelectItem>
                      <SelectItem value="llama-3.1-8b-instant">Llama 3.1 8B Instant (快速)</SelectItem>
                      <SelectItem value="meta-llama/llama-4-scout-17b-16e-instruct">Llama 4 Scout 17B (预览)</SelectItem>
                      <SelectItem value="qwen/qwen3-32b">Qwen3 32B (预览)</SelectItem>
                      <SelectItem value="gpt-4o">GPT-4o (OpenAI)</SelectItem>
                      <SelectItem value="gpt-4o-mini">GPT-4o Mini (OpenAI)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={form.groqApiKey}
                  onChange={e => setField("groqApiKey", e.target.value)}
                  placeholder={form.aiProvider === "groq" ? "gsk_..." : form.aiProvider === "openai" ? "sk-..." : "your-api-key"}
                />
                <p className="text-xs text-muted-foreground">
                  {form.aiProvider === "groq" && <>Groq 免费 API Key 可在 <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.groq.com</a> 获取</>}
                  {form.aiProvider === "openai" && <>OpenAI API Key 可在 <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">platform.openai.com</a> 获取</>}
                  {form.aiProvider === "anthropic" && <>Anthropic API Key 可在 <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">console.anthropic.com</a> 获取</>}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>API Base URL <span className="text-muted-foreground text-xs font-normal">（可选，留空使用默认地址）</span></Label>
                <Input
                  value={(form as any).aiBaseUrl ?? ""}
                  onChange={e => setField("aiBaseUrl", e.target.value)}
                  placeholder={
                    form.aiProvider === "groq" ? "https://api.groq.com/openai/v1" :
                    form.aiProvider === "openai" ? "https://api.openai.com/v1" :
                    "https://your-api-endpoint/v1"
                  }
                />
                <p className="text-xs text-muted-foreground">如使用中转 API 或自定义端点，在此填写。留空则使用所选提供商的默认地址。</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Temperature ({form.aiTemperature})</Label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={form.aiTemperature}
                    onChange={e => setField("aiTemperature", parseFloat(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>严谨 (0)</span>
                    <span>创意 (1)</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>最大 Token 数</Label>
                  <Input
                    type="number"
                    min={512}
                    max={8192}
                    step={256}
                    value={form.aiMaxTokens}
                    onChange={e => setField("aiMaxTokens", parseInt(e.target.value) || 4096)}
                  />
                </div>
              </div>
            </div>
          )}

          {activeSection === "proxy" && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-foreground border-b pb-3">代理设置</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">启用代理</p>
                  <p className="text-xs text-muted-foreground mt-0.5">访问 Google 服务需要代理</p>
                </div>
                <Switch
                  checked={form.proxyEnabled}
                  onCheckedChange={v => setField("proxyEnabled", v)}
                />
              </div>
              {form.proxyEnabled && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label>代理类型</Label>
                      <Select value={form.proxyType} onValueChange={v => setField("proxyType", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="http">HTTP</SelectItem>
                          <SelectItem value="https">HTTPS</SelectItem>
                          <SelectItem value="socks5">SOCKS5</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label>代理地址</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="127.0.0.1"
                          value={form.proxyHost}
                          onChange={e => setField("proxyHost", e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          placeholder="7890"
                          value={form.proxyPort}
                          onChange={e => setField("proxyPort", e.target.value)}
                          className="w-24"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>用户名（可选）</Label>
                      <Input value={form.proxyUsername} onChange={e => setField("proxyUsername", e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>密码（可选）</Label>
                      <Input type="password" value={form.proxyPassword} onChange={e => setField("proxyPassword", e.target.value)} />
                    </div>
                  </div>
                </>
              )}
              {!form.proxyEnabled && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                  <Shield className="h-4 w-4 inline mr-2" />
                  未启用代理时，系统无法访问 Google 服务，发布功能将不可用。
                </div>
              )}
            </div>
          )}

          {activeSection === "publish" && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-foreground border-b pb-3">发布配置</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>发布间隔（秒）</Label>
                  <Input
                    type="number"
                    min={10}
                    max={3600}
                    value={form.publishInterval}
                    onChange={e => setField("publishInterval", parseInt(e.target.value) || 30)}
                  />
                  <p className="text-xs text-muted-foreground">两次发布之间的等待时间</p>
                </div>
                <div className="space-y-1.5">
                  <Label>失败重试次数</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={form.publishRetryCount}
                    onChange={e => setField("publishRetryCount", parseInt(e.target.value) || 3)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>并发数</Label>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={form.publishConcurrency}
                    onChange={e => setField("publishConcurrency", parseInt(e.target.value) || 1)}
                  />
                  <p className="text-xs text-muted-foreground">建议保持 1，避免封号</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">无头浏览器模式</p>
                  <p className="text-xs text-muted-foreground mt-0.5">生产环境建议开启，节省资源</p>
                </div>
                <Switch
                  checked={form.headlessBrowser}
                  onCheckedChange={v => setField("headlessBrowser", v)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>自定义 User-Agent（可选）</Label>
                <Input
                  value={form.publishUserAgent}
                  onChange={e => setField("publishUserAgent", e.target.value)}
                  placeholder="留空使用默认 Chrome User-Agent"
                />
              </div>
              <div className="space-y-1.5">
                <Label>自动通过质量分阈值（0=不自动通过）</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.autoApproveThreshold ?? 0}
                  onChange={e => setField("autoApproveThreshold", parseInt(e.target.value) || 0)}
                  placeholder="例如 70，则质量分≥70 的文章自动通过审核"
                />
                <p className="text-xs text-muted-foreground">设置后，生成的文章质量分达到阈值就自动进入已审核状态，无需人工审核</p>
              </div>
            </div>
          )}

          {activeSection === "gsc" && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-foreground border-b pb-3">Google Search Console</h2>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">启用 GSC 集成</p>
                  <p className="text-xs text-muted-foreground mt-0.5">获取真实搜索排名和展示数据</p>
                </div>
                <Switch
                  checked={form.gscEnabled}
                  onCheckedChange={v => setField("gscEnabled", v)}
                />
              </div>
              {form.gscEnabled && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">发布后自动提交 URL</p>
                      <p className="text-xs text-muted-foreground mt-0.5">每篇文章发布成功后自动调用 Indexing API，加速收录（24小时内）</p>
                    </div>
                    <Switch
                      checked={(form as any).gscAutoSubmit ?? true}
                      onCheckedChange={v => setField("gscAutoSubmit", v)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Service Account JSON（推荐）</Label>
                    <Textarea
                      value={(form as any).gscServiceAccountJson ?? ""}
                      onChange={e => {
                        setField("gscServiceAccountJson", e.target.value);
                        try {
                          const parsed = JSON.parse(e.target.value);
                          if (parsed.client_email) setField("gscClientEmail", parsed.client_email);
                          if (parsed.private_key) setField("gscPrivateKey", parsed.private_key);
                        } catch {}
                      }}
                      placeholder='将 Google Cloud 下载的 Service Account JSON 文件内容全部粘贴到这里，自动解析 Email 和 Key'
                      className="font-mono text-xs h-28 resize-none"
                    />
                    <p className="text-xs text-muted-foreground">
                      在 <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Google Cloud Console</a> 创建 Service Account 并开通 Indexing API 权限，下载 JSON 密鑰文件
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>站点 URL</Label>
                    <Input
                      value={form.gscSiteUrl}
                      onChange={e => setField("gscSiteUrl", e.target.value)}
                      placeholder="https://sites.google.com/view/your-site"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Service Account Email（自动解析）</Label>
                    <Input
                      value={form.gscClientEmail}
                      onChange={e => setField("gscClientEmail", e.target.value)}
                      placeholder="your-service@project.iam.gserviceaccount.com"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <div className="mt-6 pt-4 border-t flex justify-end">
            <Button onClick={handleSave} disabled={updateMutation.isPending} className="gap-2">
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存设置
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
