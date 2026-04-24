import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

/**
 * Google OAuth 处理模块
 * 管理 Google Sites API 的 OAuth 授权流程
 */

interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface TokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope: string;
}

export class GoogleOAuthHandler {
  private config: GoogleOAuthConfig;
  private oauth2Client: OAuth2Client;

  constructor(config: GoogleOAuthConfig) {
    this.config = config;
    this.oauth2Client = new OAuth2Client(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );
  }

  /**
   * 生成 OAuth 授权 URL
   */
  getAuthorizationUrl(state?: string): string {
    const scopes = [
      "https://www.googleapis.com/auth/sites",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
    ];

    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent",
      state: state,
    });
  }

  /**
   * 从授权码交换 token
   */
  async exchangeCodeForToken(code: string): Promise<TokenInfo> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw new Error("未获取到访问令牌");
      }

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? undefined,
        expiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : undefined,
        scope: tokens.scope || "",
      };
    } catch (error) {
      throw new Error(`交换令牌失败: ${error}`);
    }
  }

  /**
   * 刷新访问令牌
   */
  async refreshAccessToken(
    refreshToken: string
  ): Promise<TokenInfo> {
    try {
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw new Error("刷新后未获取到访问令牌");
      }

      return {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token ?? undefined,
        expiresAt: credentials.expiry_date
          ? new Date(credentials.expiry_date)
          : undefined,
        scope: credentials.scope || "",
      };
    } catch (error) {
      throw new Error(`刷新令牌失败: ${error}`);
    }
  }

  /**
   * 验证访问令牌是否有效
   */
  async verifyAccessToken(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch(
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 获取用户信息
   */
  async getUserInfo(accessToken: string): Promise<{
    email: string;
    name: string;
    picture?: string;
  }> {
    try {
      const oauth2 = google.oauth2({ version: "v2", auth: this.oauth2Client });
      this.oauth2Client.setCredentials({ access_token: accessToken });

      const response = await oauth2.userinfo.get();

      return {
        email: response.data.email || "",
        name: response.data.name || "",
        picture: response.data.picture ?? undefined,
      };
    } catch (error) {
      throw new Error(`获取用户信息失败: ${error}`);
    }
  }

  /**
   * 撤销访问令牌
   */
  async revokeAccessToken(accessToken: string): Promise<void> {
    try {
      await this.oauth2Client.revokeCredentials();
    } catch (error) {
      console.warn(`撤销令牌失败: ${error}`);
      // 不抛出错误，因为撤销失败通常不是关键问题
    }
  }
}

/**
 * 创建全局 OAuth 处理器实例
 */
export function createGoogleOAuthHandler(): GoogleOAuthHandler {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || 
    `${process.env.OAUTH_SERVER_URL || "http://localhost:3000"}/api/oauth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error(
      "缺少 Google OAuth 凭证。请设置 GOOGLE_CLIENT_ID 和 GOOGLE_CLIENT_SECRET 环境变量。"
    );
  }

  return new GoogleOAuthHandler({
    clientId,
    clientSecret,
    redirectUri,
  });
}

export default GoogleOAuthHandler;
