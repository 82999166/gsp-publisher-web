import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Clock, LogIn } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

interface OAuthAuthorizationButtonProps {
  accountId: number;
  accountName: string;
  hasToken?: boolean;
  isExpired?: boolean;
  expiringWithin7Days?: boolean;
  expiresAt?: Date;
  onSuccess?: () => void;
}

export function OAuthAuthorizationButton({
  accountId,
  accountName,
  hasToken,
  isExpired,
  expiringWithin7Days,
  expiresAt,
  onSuccess,
}: OAuthAuthorizationButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const getOAuthUrlMutation = trpc.accounts.getGoogleOAuthUrl.useMutation();
  const revokeOAuthMutation = trpc.accounts.revokeGoogleOAuth.useMutation();

  const handleAuthorize = async () => {
    try {
      setIsLoading(true);
      const result = await getOAuthUrlMutation.mutateAsync({ accountId });
      
      if (result.authUrl) {
        // 在新窗口打开授权页面
        const width = 500;
        const height = 600;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        const authWindow = window.open(
          result.authUrl,
          `oauth-${accountId}`,
          `width=${width},height=${height},left=${left},top=${top}`
        );

        // 轮询检查授权状态
        const checkInterval = setInterval(async () => {
          if (authWindow?.closed) {
            clearInterval(checkInterval);
            // 授权完成后刷新页面或重新查询状态
            toast.success("✅ Google OAuth 授权成功！");
            onSuccess?.();
          }
        }, 500);

        // 30 秒后停止轮询
        setTimeout(() => clearInterval(checkInterval), 30000);
      }
    } catch (error) {
      toast.error("❌ 获取授权链接失败，请重试");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async () => {
    if (!window.confirm("确定要撤销 Google OAuth 授权吗？")) {
      return;
    }

    try {
      setIsLoading(true);
      await revokeOAuthMutation.mutateAsync({ id: accountId });
      toast.success("✅ 已撤销 Google OAuth 授权");
      onSuccess?.();
    } catch (error) {
      toast.error("❌ 撤销授权失败，请重试");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isExpired) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span className="text-sm text-red-700 font-medium">已过期</span>
        </div>
        <Button
          size="sm"
          onClick={handleAuthorize}
          disabled={isLoading}
          className="bg-red-600 hover:bg-red-700"
        >
          <LogIn className="w-4 h-4 mr-1" />
          重新授权
        </Button>
      </div>
    );
  }

  if (expiringWithin7Days) {
    const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-yellow-50 border border-yellow-200">
          <Clock className="w-4 h-4 text-yellow-600" />
          <span className="text-sm text-yellow-700 font-medium">{daysLeft} 天后过期</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleAuthorize}
          disabled={isLoading}
          className="border-yellow-300 hover:bg-yellow-50"
        >
          <LogIn className="w-4 h-4 mr-1" />
          更新授权
        </Button>
      </div>
    );
  }

  if (hasToken) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 border border-green-200">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <span className="text-sm text-green-700 font-medium">已授权</span>
        </div>
        {expiresAt && (
          <span className="text-xs text-gray-500">
            {new Date(expiresAt).toLocaleDateString('zh-CN')} 过期
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleRevoke}
          disabled={isLoading}
          className="text-gray-500 hover:text-red-600 hover:bg-red-50"
        >
          撤销
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      onClick={handleAuthorize}
      disabled={isLoading}
      className="bg-blue-600 hover:bg-blue-700"
    >
      <LogIn className="w-4 h-4 mr-1" />
      授权 Google OAuth
    </Button>
  );
}

export default OAuthAuthorizationButton;
