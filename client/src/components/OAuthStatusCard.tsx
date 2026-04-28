import { AlertCircle, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";

interface OAuthStatusItem {
  accountId: number;
  accountName: string;
  hasToken: boolean;
  isExpired: boolean;
  expiringWithin7Days: boolean;
  expiresAt?: Date;
  status: 'expired' | 'expiring_soon' | 'valid' | 'not_authorized';
}

interface OAuthStatusCardProps {
  items: OAuthStatusItem[];
}

export function OAuthStatusCard({ items }: OAuthStatusCardProps) {
  const [, setLocation] = useLocation();

  if (items.length === 0) {
    return null;
  }

  const expiredCount = items.filter(i => i.status === 'expired').length;
  const expiringSoonCount = items.filter(i => i.status === 'expiring_soon').length;
  const notAuthorizedCount = items.filter(i => i.status === 'not_authorized').length;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'expired':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'expiring_soon':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'not_authorized':
        return <Clock className="w-4 h-4 text-gray-500" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'expired':
        return <Badge variant="destructive">已过期</Badge>;
      case 'expiring_soon':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-800 border-yellow-200">即将过期</Badge>;
      case 'not_authorized':
        return <Badge variant="outline">未授权</Badge>;
      default:
        return <Badge variant="outline" className="bg-green-50 text-green-800 border-green-200">有效</Badge>;
    }
  };

  const getStatusMessage = (item: OAuthStatusItem) => {
    if (item.status === 'expired') {
      return '令牌已过期，请重新授权';
    }
    if (item.status === 'expiring_soon') {
      const daysLeft = item.expiresAt ? Math.ceil((item.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
      return `令牌将在 ${daysLeft} 天后过期`;
    }
    if (item.status === 'not_authorized') {
      return '账号未授权 Google OAuth';
    }
    return '令牌有效';
  };

  return (
    <Card className="border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              Google OAuth 令牌状态
            </CardTitle>
            <CardDescription>
              {expiredCount > 0 && `${expiredCount} 个已过期`}
              {expiredCount > 0 && expiringSoonCount > 0 && '，'}
              {expiringSoonCount > 0 && `${expiringSoonCount} 个即将过期`}
              {(expiredCount > 0 || expiringSoonCount > 0) && notAuthorizedCount > 0 && '，'}
              {notAuthorizedCount > 0 && `${notAuthorizedCount} 个未授权`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.accountId}
              className="flex items-center justify-between p-3 rounded-lg bg-white border border-orange-100 hover:border-orange-300 transition-colors"
            >
              <div className="flex items-center gap-3 flex-1">
                {getStatusIcon(item.status)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{item.accountName}</div>
                  <div className="text-xs text-gray-500">
                    {getStatusMessage(item)}
                    {item.expiresAt && (
                      <span className="ml-2">
                        ({new Date(item.expiresAt).toLocaleDateString('zh-CN')})
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3">
                {getStatusBadge(item.status)}
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8"
                  onClick={() => setLocation(`/accounts/${item.accountId}`)}
                >
                  处理
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-orange-100 rounded-lg border border-orange-200">
          <p className="text-xs text-orange-900">
            💡 <strong>提示：</strong>Google OAuth 令牌用于更稳定的发布方式。建议及时授权或更新令牌，以确保发布任务的成功率。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default OAuthStatusCard;
