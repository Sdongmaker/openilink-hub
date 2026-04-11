import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { tgApi, type TGStats, type CrawlerStatus } from "../../lib/telegram-api";
import { Play, Square, RefreshCw } from "lucide-react";

export function DashboardPage() {
  const [stats, setStats] = useState<TGStats | null>(null);
  const [status, setStatus] = useState<CrawlerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const fetchData = async () => {
    try {
      const [s, st] = await Promise.all([tgApi.getStats(), tgApi.getStatus()]);
      setStats(s);
      setStatus(st);
    } catch {
      // API may not be available yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 10000);
    return () => clearInterval(timer);
  }, []);

  const toggleCrawler = async () => {
    setToggling(true);
    try {
      if (status?.running) {
        await tgApi.stopCrawler();
      } else {
        await tgApi.startCrawler();
      }
      await fetchData();
    } catch {}
    setToggling(false);
  };

  if (loading) {
    return <div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded-lg" /><div className="h-32 bg-muted rounded-lg" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">仪表盘</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-1" />
            刷新
          </Button>
          <Button
            size="sm"
            variant={status?.running ? "destructive" : "default"}
            onClick={toggleCrawler}
            disabled={toggling || stats?.account_status !== "active"}
          >
            {status?.running ? <Square className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            {status?.running ? "停止爬虫" : "启动爬虫"}
          </Button>
        </div>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">爬虫状态</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={status?.running ? "default" : "secondary"}>
              {status?.running ? "运行中" : "已停止"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">账号状态</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={stats?.account_status === "active" ? "default" : "secondary"}>
              {stats?.account_status || "未配置"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">今日消息</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats?.today_total ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">今日广告</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-500">{stats?.today_ads ?? 0}</p>
            {stats && stats.today_total > 0 && (
              <p className="text-xs text-muted-foreground">{(stats.ad_rate * 100).toFixed(1)}%</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Target breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">监听目标</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-6">
            <div>
              <p className="text-sm text-muted-foreground">频道</p>
              <p className="text-xl font-bold">{stats?.target_count?.channel ?? 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">群组</p>
              <p className="text-xl font-bold">{stats?.target_count?.group ?? 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
