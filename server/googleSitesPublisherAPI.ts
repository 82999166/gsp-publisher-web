import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

/**
 * Google Sites API 发布器
 * 使用 Google Sites API v1 直接发布内容，替代浏览器自动化
 */

interface GoogleSitesPublisherOptions {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  siteId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface PublishResult {
  success: boolean;
  pageId?: string;
  pageUrl?: string;
  error?: string;
}

export class GoogleSitesPublisherAPI {
  private oauth2Client: OAuth2Client;
  private accessToken: string;
  private refreshToken?: string;
  private expiresAt?: Date;
  private siteId: string;

  constructor(options: GoogleSitesPublisherOptions) {
    this.oauth2Client = new OAuth2Client(
      options.clientId,
      options.clientSecret,
      options.redirectUri
    );

    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
    this.expiresAt = options.expiresAt;
    this.siteId = options.siteId;

    // 设置凭证
    this.oauth2Client.setCredentials({
      access_token: this.accessToken,
      refresh_token: this.refreshToken,
      expiry_date: this.expiresAt?.getTime(),
    });
  }

  /**
   * 检查并刷新 token 如果需要
   */
  async ensureValidToken(): Promise<void> {
    if (this.expiresAt && new Date() > this.expiresAt) {
      if (!this.refreshToken) {
        throw new Error("Token 已过期，但没有刷新令牌");
      }

      try {
        const { credentials } = await this.oauth2Client.refreshAccessToken();
        this.accessToken = credentials.access_token!;
        if (credentials.refresh_token) {
          this.refreshToken = credentials.refresh_token;
        }
        this.expiresAt = credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : undefined;

        this.oauth2Client.setCredentials(credentials);
      } catch (error) {
        throw new Error(`刷新 token 失败: ${error}`);
      }
    }
  }

  /**
   * 创建新页面
   */
  async createPage(options: {
    title: string;
    content: string;
    parentPageId?: string;
  }): Promise<PublishResult> {
    try {
      await this.ensureValidToken();

      // 使用 Google Drive API 创建 Google Sites 页面
      // Google Sites API 仍在开发中，我们使用 Drive API 作为备选
      const drive = google.drive({ version: "v3", auth: this.oauth2Client });

      // 创建页面内容
      const pageContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>${options.title}</title>
          <meta charset="utf-8">
        </head>
        <body>
          ${options.content}
        </body>
        </html>
      `;

      // 上传为 Google Sites 页面
      const response = await drive.files.create({
        requestBody: {
          name: options.title,
          mimeType: "application/vnd.google-apps.site",
          parents: [this.siteId],
        },
        media: {
          mimeType: "text/html",
          body: pageContent,
        },
      });

      if (!response.data.id) {
        throw new Error("创建页面失败：没有返回页面 ID");
      }

      // 获取页面 URL
      const pageUrl = `https://sites.google.com/d/${this.siteId}/p/${response.data.id}/edit`;

      return {
        success: true,
        pageId: response.data.id,
        pageUrl,
      };
    } catch (error) {
      return {
        success: false,
        error: `创建页面失败: ${error}`,
      };
    }
  }

  /**
   * 更新现有页面
   */
  async updatePage(options: {
    pageId: string;
    title?: string;
    content?: string;
  }): Promise<PublishResult> {
    try {
      await this.ensureValidToken();

      const drive = google.drive({ version: "v3", auth: this.oauth2Client });

      const updateData: any = {};
      if (options.title) {
        updateData.name = options.title;
      }

      const response = await drive.files.update({
        fileId: options.pageId,
        requestBody: updateData,
        media: options.content
          ? {
              mimeType: "text/html",
              body: options.content,
            }
          : undefined,
      });

      return {
        success: true,
        pageId: response.data.id,
      };
    } catch (error) {
      return {
        success: false,
        error: `更新页面失败: ${error}`,
      };
    }
  }

  /**
   * 获取 OAuth 授权 URL
   */
  static getAuthorizationUrl(
    clientId: string,
    redirectUri: string,
    scopes: string[] = [
      "https://www.googleapis.com/auth/sites",
      "https://www.googleapis.com/auth/drive",
    ]
  ): string {
    const oauth2Client = new OAuth2Client(clientId, "", redirectUri);
    return oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent",
    });
  }

  /**
   * 从授权码交换 token
   */
  static async exchangeCodeForToken(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }> {
    const oauth2Client = new OAuth2Client(
      clientId,
      clientSecret,
      redirectUri
    );

    try {
      const { tokens } = await oauth2Client.getToken(code);

      return {
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : undefined,
      };
    } catch (error) {
      throw new Error(`交换 token 失败: ${error}`);
    }
  }
}

export default GoogleSitesPublisherAPI;
