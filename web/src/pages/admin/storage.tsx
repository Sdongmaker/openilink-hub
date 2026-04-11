import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { tgApi, type StorageSettings } from "../../lib/telegram-api";
import { FlaskConical, HardDrive } from "lucide-react";

export function StoragePage() {
  const [settings, setSettings] = useState<StorageSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testOk, setTestOk] = useState<boolean | null>(null);
  const [testError, setTestError] = useState("");

  useEffect(() => {
    tgApi
      .getStorage()
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestOk(null);
    setTestError("");
    try {
      const res = await tgApi.testStorage();
      setTestOk(res.ok);
      if (!res.ok) setTestError(res.error || "未知错误");
    } catch (err: any) {
      setTestOk(false);
      setTestError(err.message);
    }
    setTesting(false);
  };

  if (loading) {
    return <div className="animate-pulse h-48 bg-muted rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">存储设置</h2>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            MinIO / S3 配置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!settings?.endpoint ? (
            <p className="text-sm text-muted-foreground">
              存储未配置。请设置环境变量 STORAGE_ENDPOINT、STORAGE_ACCESS_KEY、STORAGE_SECRET_KEY。
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Endpoint</p>
                <p className="font-medium">{settings.endpoint}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Bucket</p>
                <p className="font-medium">{settings.bucket}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Public URL</p>
                <p className="font-medium">{settings.public_url || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">SSL</p>
                <p className="font-medium">{settings.ssl ? "是" : "否"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Access Key</p>
                <p className="font-medium font-mono text-xs">{settings.access_key_masked || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Telegram 文件数</p>
                <p className="font-medium">{settings.telegram_file_count}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {settings?.endpoint && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">连接测试</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
                <FlaskConical className="h-4 w-4 mr-1" />
                {testing ? "测试中..." : "测试存储连接"}
              </Button>
              {testOk !== null && (
                <Badge variant={testOk ? "default" : "destructive"}>
                  {testOk ? "连接正常" : `失败: ${testError}`}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
