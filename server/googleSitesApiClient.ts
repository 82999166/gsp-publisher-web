/**
 * Google Sites API 客户端
 * 使用 Google Sites REST API v1 进行页面创建和更新
 * 文档: https://developers.google.com/sites/docs/getting-started
 */

interface GoogleSitesPage {
  title: string;
  body?: string;
  parent?: string;
}

interface GoogleSitesApiResponse {
  name?: string;
  title?: string;
  displayName?: string;
  error?: {
    code: number;
    message: string;
  };
}

export class GoogleSitesApiClient {
  private accessToken: string;
  private siteId: string;

  constructor(accessToken: string, siteId: string) {
    this.accessToken = accessToken;
    this.siteId = siteId;
  }

  /**
   * 创建新页面
   */
  async createPage(pageData: GoogleSitesPage): Promise<GoogleSitesApiResponse> {
    try {
      const response = await fetch(
        `https://sites.googleapis.com/v1/sites/${this.siteId}/pages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: pageData.title,
            body: pageData.body || '',
            parent: pageData.parent,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return {
          error: {
            code: response.status,
            message: error.error?.message || response.statusText,
          },
        };
      }

      return await response.json();
    } catch (error) {
      return {
        error: {
          code: 500,
          message: `请求失败: ${error instanceof Error ? error.message : '未知错误'}`,
        },
      };
    }
  }

  /**
   * 更新页面
   */
  async updatePage(pageId: string, pageData: GoogleSitesPage): Promise<GoogleSitesApiResponse> {
    try {
      const response = await fetch(
        `https://sites.googleapis.com/v1/sites/${this.siteId}/pages/${pageId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            title: pageData.title,
            body: pageData.body,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return {
          error: {
            code: response.status,
            message: error.error?.message || response.statusText,
          },
        };
      }

      return await response.json();
    } catch (error) {
      return {
        error: {
          code: 500,
          message: `请求失败: ${error instanceof Error ? error.message : '未知错误'}`,
        },
      };
    }
  }

  /**
   * 获取页面列表
   */
  async listPages(): Promise<any> {
    try {
      const response = await fetch(
        `https://sites.googleapis.com/v1/sites/${this.siteId}/pages`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return {
          error: {
            code: response.status,
            message: error.error?.message || response.statusText,
          },
        };
      }

      return await response.json();
    } catch (error) {
      return {
        error: {
          code: 500,
          message: `请求失败: ${error instanceof Error ? error.message : '未知错误'}`,
        },
      };
    }
  }

  /**
   * 获取网站信息
   */
  async getSiteInfo(): Promise<any> {
    try {
      const response = await fetch(
        `https://sites.googleapis.com/v1/sites/${this.siteId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return {
          error: {
            code: response.status,
            message: error.error?.message || response.statusText,
          },
        };
      }

      return await response.json();
    } catch (error) {
      return {
        error: {
          code: 500,
          message: `请求失败: ${error instanceof Error ? error.message : '未知错误'}`,
        },
      };
    }
  }
}

/**
 * OAuth 令牌管理
 */
export class GoogleOAuthManager {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
  }

  /**
   * 生成授权 URL
   */
  getAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/sites https://www.googleapis.com/auth/drive',
      access_type: 'offline',
      prompt: 'consent',
    });

    if (state) {
      params.append('state', state);
    }

    return `https://accounts.google.com/o/oauth2/auth?${params.toString()}`;
  }

  /**
   * 交换授权码获取访问令牌
   */
  async exchangeCodeForToken(code: string): Promise<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  }> {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
      });

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          error: error.error_description || '令牌交换失败',
        };
      }

      return await response.json();
    } catch (error) {
      return {
        error: `请求失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }

  /**
   * 刷新访问令牌
   */
  async refreshAccessToken(refreshToken: string): Promise<{
    access_token?: string;
    expires_in?: number;
    error?: string;
  }> {
    try {
      const params = new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      });

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          error: error.error_description || '令牌刷新失败',
        };
      }

      return await response.json();
    } catch (error) {
      return {
        error: `请求失败: ${error instanceof Error ? error.message : '未知错误'}`,
      };
    }
  }
}
