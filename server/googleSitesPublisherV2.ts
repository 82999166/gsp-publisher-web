/**
 * Google Sites API v2 发布器
 * 使用 Google Sites REST API 替代浏览器自动化
 */

import { GoogleSitesApiClient, GoogleOAuthManager } from './googleSitesApiClient';

interface PublishOptions {
  title: string;
  content: string;
  siteId: string;
  accessToken: string;
  parentPageId?: string;
}

interface PublishResult {
  success: boolean;
  url?: string;
  pageId?: string;
  error?: string;
  message?: string;
}

/**
 * 将 HTML 内容转换为 Google Sites 支持的格式
 */
function convertHtmlToGoogleSitesFormat(html: string): string {
  // Google Sites API 支持基本的 HTML
  // 移除不支持的标签和属性
  let content = html;
  
  // 移除脚本和样式
  content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // 移除不安全的属性
  content = content.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  return content;
}

/**
 * 生成页面 slug
 */
function generatePageSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 100);
}

/**
 * 使用 Google Sites API 发布内容
 */
export async function publishToGoogleSitesV2(
  options: PublishOptions
): Promise<PublishResult> {
  try {
    const client = new GoogleSitesApiClient(options.accessToken, options.siteId);
    
    // 转换内容格式
    const convertedContent = convertHtmlToGoogleSitesFormat(options.content);
    
    // 生成页面 slug
    const pageSlug = generatePageSlug(options.title);
    
    // 创建页面
    const createResult = await client.createPage({
      title: options.title,
      body: convertedContent,
      parent: options.parentPageId,
    });
    
    if (createResult.error) {
      return {
        success: false,
        error: `创建页面失败: ${createResult.error.message}`,
      };
    }
    
    // 提取页面 ID 和 URL
    const pageId = createResult.name?.split('/').pop();
    const pageUrl = `https://sites.google.com/view/${pageSlug}/`;
    
    return {
      success: true,
      pageId,
      url: pageUrl,
      message: `页面创建成功: ${options.title}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `发布失败: ${error instanceof Error ? error.message : '未知错误'}`,
    };
  }
}

/**
 * 获取 OAuth 授权 URL
 */
export function getGoogleOAuthUrl(clientId: string, clientSecret: string): string {
  const redirectUri = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/api/oauth/google/callback';
  const manager = new GoogleOAuthManager(clientId, clientSecret, redirectUri);
  return manager.getAuthorizationUrl();
}

/**
 * 交换授权码获取访问令牌
 */
export async function exchangeGoogleAuthCode(
  code: string,
  clientId: string,
  clientSecret: string
): Promise<{
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
}> {
  const redirectUri = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/api/oauth/google/callback';
  const manager = new GoogleOAuthManager(clientId, clientSecret, redirectUri);
  return manager.exchangeCodeForToken(code);
}
