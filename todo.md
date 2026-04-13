# GSP Publisher Web - TODO

## 数据库 & 后端
- [x] 设计并推送数据库 Schema（accounts, materials, tasks, links, settings, indexing, keywords）
- [x] 后端路由：仪表盘统计
- [x] 后端路由：账号管理（CRUD、Cookie验证、心跳）
- [x] 后端路由：AI内容生成（关键词扩展、批量生成）
- [x] 后端路由：素材库管理（CRUD、审核、批量操作）
- [x] 后端路由：发布任务（创建、调度、状态监控）
- [x] 后端路由：超链接管理（内链外链、锚文本、预设库）
- [x] 后端路由：收录监控（链接列表、状态追踪、单条/批量检测）
- [x] 后端路由：系统设置（get/update 完整表单映射）

## 前端框架
- [x] 全局样式设计（优雅精致风格、配色、字体）
- [x] 自定义侧边栏导航（AppSidebar + AppLayout，8个模块分组）
- [x] 路由注册（App.tsx）

## 页面开发
- [x] 仪表盘总览页面（统计卡片、快速入口、系统状态）
- [x] 账号管理页面（Cookie导入、状态验证、每日配额）
- [x] AI内容生成页面（关键词管理、AI扩展、批量生成）
- [x] 素材库管理页面（审核流程、质量评分、批量操作）
- [x] 发布任务页面（任务创建、状态追踪、定时调度）
- [x] 超链接管理页面（内链外链、预设高权威链接库）
- [x] 收录监控页面（收录状态、批量检测、收录率统计）
- [x] 系统设置页面（AI配置、代理设置、发布配置、GSC集成）

## 测试 & 交付
- [x] 编写 vitest 单元测试
- [x] TypeScript 类型修复（0 errors）
- [x] 联调测试所有功能模块
- [x] 保存检查点并交付

## 待完善（后续迭代）
- [ ] 发布引擎集成（Playwright 自动化操作 Google Sites）
- [ ] Google Search Console API 真实收录检测
- [ ] 代理配置实际生效
- [ ] 移动端响应式适配

## 第一阶段：Google Sites 发布引擎 + SEO模板引擎

### 数据库扩展
- [ ] 新增 seo_templates 表（SEO文章模板）
- [ ] 新增 google_sites 表（Google Sites 站点管理）
- [ ] 扩展 materials 表（添加 seoTemplate、metaDescription 字段）
- [ ] 扩展 accounts 表（添加 siteUrl、siteName 字段）
- [ ] 执行 pnpm db:push 推送 schema 变更

### SEO模板引擎
- [ ] 实现 seoTemplates 后端路由（CRUD + 预设5种模板）
- [ ] AI内容生成集成模板引擎（H1/H2/H3自动分配、关键词密度控制）
- [ ] 文章末尾自动插入内链逻辑
- [ ] Meta Description 自动生成
- [ ] 新增 SEO模板管理页面（/templates）
- [ ] AI内容生成页面集成模板选择器

### Google Sites 发布引擎
- [ ] 安装 Puppeteer 依赖
- [ ] 实现 GoogleSitesPublisher 服务类（Cookie注入、创建页面、填充内容、发布）
- [ ] 账号 Cookie 验证真实化（Puppeteer 验证 Google 登录状态）
- [ ] 实现 sites 后端路由（站点管理 CRUD）
- [ ] 实现 publisher 后端路由（执行发布、取消、重试）
- [ ] 新增 Google Sites 站点管理页面（/sites）
- [ ] 发布任务页面集成真实发布引擎
- [ ] 发布进度实时显示

## 第二阶段：GSC自动提交 + 发布队列智能调度

- [ ] Google Search Console Indexing API 集成
- [ ] 发布成功后自动提交 URL 到 GSC
- [ ] 发布队列智能调度（按账号年龄限速、随机化发布时间）
- [ ] 账号失败自动切换备用账号重试（最多3次）
- [ ] 发布节奏控制（新账号≤5篇/天，老账号≤50篇/天）

## 第三阶段：关键词竞争度分析 + 文章去重检测

- [ ] 关键词竞争度分析（搜索量、竞争难度评分）
- [ ] 文章相似度检测（相似度>30%触发重写）
- [ ] 关键词优先级排序（低竞争高搜索量优先）
- [ ] 去重报告与批量重写功能
