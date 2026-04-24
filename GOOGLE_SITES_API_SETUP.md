# Google Sites API 集成部署指南

## 📋 概述

本项目已完成从浏览器自动化到 **Google Sites API** 的过渡。新方案具有以下优势：

- ✅ **更可靠**：不依赖浏览器自动化，不受 Google UI 变化影响
- ✅ **更稳定**：直接调用官方 API，成功率更高
- ✅ **更快速**：无需启动浏览器，发布速度更快
- ✅ **更易维护**：代码逻辑清晰，易于调试和扩展

---

## 🔧 部署步骤

### 第 1 步：数据库迁移

在生产服务器上执行以下 SQL 命令，添加 Google OAuth 相关字段：

```bash
ssh hjroot@72.167.134.119
mysql -u root -p gsp_publisher << 'EOF'
ALTER TABLE accounts 
ADD COLUMN IF NOT EXISTS googleOAuthAccessToken TEXT,
ADD COLUMN IF NOT EXISTS googleOAuthRefreshToken TEXT,
ADD COLUMN IF NOT EXISTS googleOAuthExpiresAt TIMESTAMP,
ADD COLUMN IF NOT EXISTS googleOAuthScope TEXT;

ALTER TABLE publish_tasks
ADD COLUMN IF NOT EXISTS publishMethod ENUM('browser_automation', 'google_sites_api') DEFAULT 'google_sites_api';

-- 验证字段已添加
SHOW COLUMNS FROM accounts;
SHOW COLUMNS FROM publish_tasks;
EOF
```

### 第 2 步：环境变量配置

确保生产服务器的 `.env` 文件包含以下 Google OAuth 凭证：

```bash
# Google OAuth 凭证（从 Google Cloud Console 获取）
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_OAUTH_REDIRECT_URI=https://your-domain.com/api/oauth/google/callback
```

如果还没有 Google OAuth 凭证，请按以下步骤获取：

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建新项目或选择现有项目
3. 启用 **Google Sites API** 和 **Google Drive API**
4. 创建 OAuth 2.0 凭证（Web 应用程序类型）
5. 添加授权重定向 URI：`https://your-domain.com/api/oauth/google/callback`
6. 复制 Client ID 和 Client Secret 到 `.env` 文件

### 第 3 步：部署新代码

```bash
cd /home/ubuntu/gsp-publisher-web

# 拉取最新代码
git pull origin main

# 安装依赖
pnpm install

# 构建
pnpm build

# 重启应用
pm2 restart gsp-publisher
```

### 第 4 步：验证部署

```bash
# 检查应用状态
pm2 status gsp-publisher

# 查看日志
pm2 logs gsp-publisher
```

---

## 🔐 OAuth 授权流程

### 用户端流程

1. **在账号编辑页面**，点击「授权 Google OAuth」按钮
2. **跳转到 Google 登录页面**，选择要授权的 Google 账号
3. **同意权限请求**，授予 Google Sites API 和 Google Drive API 访问权限
4. **自动返回应用**，系统保存 OAuth 令牌

### 后端流程

1. **生成授权 URL**：`accounts.getGoogleOAuthUrl({ accountId })`
   - 返回 Google OAuth 授权链接

2. **处理授权回调**：`accounts.handleGoogleOAuthCallback({ code, state })`
   - 交换授权码获取 access token 和 refresh token
   - 保存到数据库

3. **检查授权状态**：`accounts.checkGoogleOAuthStatus({ id })`
   - 返回是否有有效的 OAuth 令牌
   - 返回令牌过期时间

4. **撤销授权**：`accounts.revokeGoogleOAuth({ id })`
   - 撤销 Google OAuth 授权
   - 清除数据库中的令牌

---

## 📝 API 端点

### 账号管理

| 端点 | 方法 | 说明 |
|------|------|------|
| `accounts.getGoogleOAuthUrl` | Query | 获取 OAuth 授权 URL |
| `accounts.handleGoogleOAuthCallback` | Mutation | 处理 OAuth 回调 |
| `accounts.checkGoogleOAuthStatus` | Query | 检查 OAuth 授权状态 |
| `accounts.revokeGoogleOAuth` | Mutation | 撤销 OAuth 授权 |

### 发布任务

| 端点 | 方法 | 说明 |
|------|------|------|
| `publisher.executeTask` | Mutation | 执行发布任务（自动选择方式） |
| `publisher.getTaskStatus` | Query | 查询任务状态 |
| `publisher.checkAccountAuthStatus` | Query | 检查账号认证状态 |

---

## 🚀 发布方式选择

系统会自动选择最优的发布方式：

```
┌─────────────────────────────────┐
│  检查账号认证方式                 │
└─────────────────────────────────┘
           ↓
    ┌──────────────┐
    │ 有 OAuth 令牌？ │
    └──────────────┘
      ↙          ↘
    是            否
    ↓             ↓
┌─────────┐   ┌──────────────┐
│ 使用 API │   │ 有 Cookie？   │
│ 方式发布  │   └──────────────┘
└─────────┘     ↙          ↘
              是            否
              ↓             ↓
          ┌─────────┐   ┌──────────┐
          │使用浏览器│   │提示需要授权│
          │自动化发布│   │或导入 Cookie
          └─────────┘   └──────────┘
```

---

## 🔄 令牌刷新

当 OAuth 令牌即将过期时，系统会自动刷新：

```typescript
// 在 publishViaAPI.ts 中自动处理
const publisher = new GoogleSitesPublisherAPI({
  accessToken,
  refreshToken,  // 用于自动刷新
  expiresAt,
  // ...
});

// 发布前自动检查并刷新令牌
await publisher.ensureValidToken();
```

---

## 🐛 故障排查

### 问题 1：OAuth 授权失败

**症状**：点击授权按钮后无反应或跳转到错误页面

**解决方案**：
1. 检查 `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET` 是否正确
2. 检查 `GOOGLE_OAUTH_REDIRECT_URI` 是否与 Google Cloud Console 中的配置一致
3. 检查 Google Sites API 和 Google Drive API 是否已启用

### 问题 2：发布失败 - "无法从 Site URL 中提取 Site ID"

**症状**：发布任务失败，日志显示此错误

**解决方案**：
1. 在账号编辑页面，确保「Google Site 编辑器地址」已正确填写
2. 地址应该是完整的 Google Sites 编辑 URL，例如：
   ```
   https://sites.google.com/view/my-site/home
   ```
3. 不要填写发布后的 URL（sites.google.com/site/xxx）

### 问题 3：令牌过期

**症状**：发布失败，日志显示"Token 已过期"

**解决方案**：
1. 系统会自动使用 refresh token 刷新
2. 如果仍然失败，撤销授权后重新授权
3. 使用 `accounts.revokeGoogleOAuth({ id })` 撤销
4. 然后使用 `accounts.getGoogleOAuthUrl({ accountId })` 重新授权

---

## 📊 监控和日志

### 查看发布日志

```typescript
// 获取任务状态和日志
const status = await trpc.publisher.getTaskStatus.query({ taskId });
console.log(status.engineLog);  // 查看详细日志
```

### 日志格式

```
[API] 初始化 Google Sites API 发布器...
[API] 获取素材：文章标题
[API] Site ID: my-site-id
[API] 开始发布页面...
[API] ✅ 页面创建成功
[API] 页面 ID: page-123
[API] 页面 URL: https://sites.google.com/view/my-site/page-title
```

---

## 🔗 相关文件

| 文件 | 说明 |
|------|------|
| `server/googleOAuth.ts` | Google OAuth 处理模块 |
| `server/googleSitesPublisherAPI.ts` | Google Sites API 发布器 |
| `server/publishViaAPI.ts` | API 发布任务执行函数 |
| `server/routers.ts` | tRPC 路由（包含 OAuth 端点） |
| `drizzle/schema.ts` | 数据库模式（包含 OAuth 字段） |

---

## ✅ 检查清单

部署前请确保完成以下步骤：

- [ ] 生产服务器数据库已执行 SQL 迁移
- [ ] `.env` 文件已配置 Google OAuth 凭证
- [ ] Google Cloud Console 已启用 Google Sites API 和 Google Drive API
- [ ] 重定向 URI 已在 Google Cloud Console 中配置
- [ ] 新代码已构建并部署
- [ ] 应用已重启
- [ ] 测试账号已成功授权 Google OAuth
- [ ] 测试发布任务已成功完成

---

## 📞 支持

如有问题，请查看：
1. 应用日志：`pm2 logs gsp-publisher`
2. 数据库日志：`systemLogs` 表
3. 任务日志：`publish_tasks.engineLog` 字段

