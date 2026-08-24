# Google Sites 内嵌持久化取证

## 2026-08-24 最新生产发布

发布任务已打开真实的“Embed from the web / By URL”对话框，并将 `https://www.example.com` 写入 aria-label 为 `Paste the URL (link) of the site you'd like to embed.` 的输入框。日志显示随后点击了 `Insert` 且对话框关闭。

实际发布页 `https://sites.google.com/view/5a5hfqdh/` 的页面内容与可视截图均只有文章正文，不包含 `example.com`、iframe、嵌入错误信息或可见的内嵌块占位。

结论：当前发布器将“内嵌对话框关闭”误判为“内嵌成功”。后续实现必须要求编辑器 DOM 或 Google Sites 保存请求包含目标 URL，并在发布后检查目标 URL 的实际呈现；对话框关闭本身不得作为成功条件。
