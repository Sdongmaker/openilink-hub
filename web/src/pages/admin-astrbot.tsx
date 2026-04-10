import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Circle,
  Loader2,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { api, type AstrBotBot, type AstrBotQR } from "@/lib/api";
import { useAstrBotBots, useAstrBotCreateBot, useAstrBotHealth } from "@/hooks/use-astrbot";

const runtimeStatusMap: Record<string, { label: string; tone: string }> = {
  running: { label: "运行中", tone: "text-emerald-600" },
  pending: { label: "等待完成", tone: "text-amber-600" },
  error: { label: "异常", tone: "text-red-600" },
  stopped: { label: "已停止", tone: "text-muted-foreground" },
  unknown: { label: "未知", tone: "text-muted-foreground" },
};

const qrStatusMap: Record<string, string> = {
  wait: "等待扫码",
  confirmed: "已确认",
  expired: "已过期",
  initializing: "初始化中",
};

const guideItems = [
  "点击创建后，后台会向 AstrBot 发起一次新的机器人记录请求。",
  "如果二维码已生成，可直接在记录里继续打开并完成扫码。",
  "当前列表展示的是 AstrBot 现有记录，不额外保存本地历史。",
];

function recordSummary(bot: AstrBotBot) {
  if (bot.configured) return "已完成接入，可作为当前有效记录继续保留。";
  if (bot.qr_status === "expired") return "二维码已过期，可重新打开记录继续扫码。";
  if (bot.qr_status === "confirmed") return "已确认，等待 AstrBot 完成后续状态同步。";
  return "该记录仍待扫码确认，可继续打开二维码完成接入。";
}

export function AdminAstrBotPage() {
  const {
    data: health,
    isLoading: healthLoading,
    isError: healthError,
    refetch: refetchHealth,
  } = useAstrBotHealth();
  const {
    data: bots = [],
    isLoading: botsLoading,
    isFetching: botsFetching,
    refetch: refetchBots,
  } = useAstrBotBots();
  const createBot = useAstrBotCreateBot();
  const { toast } = useToast();

  const [qrDialog, setQrDialog] = useState<{ open: boolean; platformId: string }>({
    open: false,
    platformId: "",
  });
  const [qrData, setQrData] = useState<AstrBotQR | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const healthStatus = typeof health?.status === "string" ? health.status : "";
  const isHealthy = !healthError && Boolean(healthStatus);
  const configuredCount = bots.filter((bot) => bot.configured).length;
  const pendingCount = bots.filter((bot) => !bot.configured).length;

  useEffect(() => {
    if (!qrDialog.open || !qrDialog.platformId) return;

    const poll = async () => {
      try {
        setQrLoading(true);
        const data = await api.astrBotGetQR(qrDialog.platformId);
        setQrData(data);
        setQrLoading(false);

        if (data.status === "confirmed") {
          if (qrPollRef.current) clearInterval(qrPollRef.current);
          toast({ title: "扫码成功", description: "当前记录已完成确认" });
          void refetchBots();
          void refetchHealth();
        }
      } catch {
        setQrLoading(false);
      }
    };

    poll();
    qrPollRef.current = setInterval(poll, 2000);

    return () => {
      if (qrPollRef.current) clearInterval(qrPollRef.current);
    };
  }, [qrDialog.open, qrDialog.platformId, refetchBots, refetchHealth, toast]);

  const openQR = (platformId: string) => {
    setQrDialog({ open: true, platformId });
    setQrData(null);
  };

  const handleCreate = async () => {
    try {
      const result = await createBot.mutateAsync();
      toast({ title: "创建成功", description: `记录 ${result.platform_id} 已生成` });
      openQR(result.platform_id);
    } catch (error: any) {
      toast({
        title: "创建失败",
        description: error.message || "AstrBot 返回了异常响应",
        variant: "destructive",
      });
    }
  };

  const handleRefresh = () => {
    void refetchHealth();
    void refetchBots();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="overflow-hidden rounded-[32px] border bg-gradient-to-br from-emerald-50 via-background to-background">
        <div className="grid gap-8 px-6 py-8 sm:px-8 lg:grid-cols-[1.2fr_0.8fr] lg:px-10 lg:py-10">
          <div className="space-y-6">
            <Badge variant="outline" className="gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              管理员控制台
            </Badge>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  AstrBot 机器人接入后台
                </h2>
                <Badge
                  variant={healthLoading ? "secondary" : isHealthy ? "default" : "secondary"}
                  className="gap-1.5"
                >
                  {healthLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isHealthy ? (
                    <Wifi className="h-3.5 w-3.5" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5" />
                  )}
                  {healthLoading ? "检查中" : isHealthy ? "服务在线" : "状态待确认"}
                </Badge>
              </div>

              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                后台现在只负责一件事：创建 AstrBot 机器人记录，并引导管理员完成微信扫码接入。
                当前页面展示的是 AstrBot 现有记录，不再承担旧 Bot 运维、群组统计或系统消息能力。
              </p>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="rounded-full border bg-background px-4 py-2">
                当前记录 {bots.length}
              </span>
              <span className="rounded-full border bg-background px-4 py-2">
                已接入 {configuredCount}
              </span>
              <span className="rounded-full border bg-background px-4 py-2">
                待扫码 {pendingCount}
              </span>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleCreate} disabled={createBot.isPending} className="h-11 rounded-full px-5">
                {createBot.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                开始添加机器人
              </Button>
              <Button variant="outline" onClick={handleRefresh} className="h-11 rounded-full px-5">
                {botsFetching || healthLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                刷新状态
              </Button>
            </div>

            {healthError && (
              <p className="text-xs leading-6 text-muted-foreground">
                健康检查暂时没有返回有效结果，但不会阻止你直接尝试创建记录。当前面板以可执行创建流程为优先。
              </p>
            )}
          </div>

          <Card className="rounded-[28px] border bg-background/80 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">使用说明</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
              {guideItems.map((item, index) => (
                <div key={item} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold text-foreground">
                    {index + 1}
                  </div>
                  <p>{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <Card className="rounded-[28px] border shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg">当前新增记录</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              直接读取 AstrBot 当前已有机器人记录，用作管理员侧的接入视图。
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {botsLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : bots.length === 0 ? (
            <div className="rounded-3xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
              还没有任何记录。点击上方“开始添加机器人”即可生成第一条 AstrBot 接入记录。
            </div>
          ) : (
            bots.map((bot) => {
              const runtime = runtimeStatusMap[bot.runtime_status] ?? runtimeStatusMap.unknown;

              return (
                <div
                  key={bot.platform_id}
                  className="flex flex-col gap-4 rounded-3xl border bg-background px-5 py-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm text-foreground">{bot.platform_id}</span>
                      <Badge variant="outline" className={runtime.tone}>
                        {runtime.label}
                      </Badge>
                      {bot.qr_status && (
                        <Badge variant="secondary">
                          {qrStatusMap[bot.qr_status] ?? bot.qr_status}
                        </Badge>
                      )}
                      <Badge variant={bot.configured ? "default" : "secondary"}>
                        {bot.configured ? "已接入" : "待扫码"}
                      </Badge>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">{recordSummary(bot)}</p>
                  </div>

                  {!bot.configured ? (
                    <Button
                      variant="outline"
                      onClick={() => openQR(bot.platform_id)}
                      className="h-10 rounded-full px-4"
                    >
                      继续扫码
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <Circle className="h-3 w-3 fill-current" />
                      当前记录可用
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Dialog
        open={qrDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setQrDialog({ open: false, platformId: "" });
            setQrData(null);
            if (qrPollRef.current) clearInterval(qrPollRef.current);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>扫码完成接入</DialogTitle>
            <DialogDescription>
              使用微信扫描二维码，完成 AstrBot 机器人当前记录的接入确认。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qrLoading && !qrData ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : qrData?.status === "confirmed" ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <Circle className="h-16 w-16 text-emerald-500 fill-emerald-500" />
                <p className="font-medium text-emerald-600">扫码确认完成</p>
                <p className="text-sm text-muted-foreground">该记录将在列表中显示为已接入或待同步状态。</p>
              </div>
            ) : qrData?.qr_url ? (
              <>
                <img src={qrData.qr_url} alt="登录二维码" className="h-64 w-64 rounded-xl border" />
                <p className="text-sm text-muted-foreground">
                  {qrData.status === "wait"
                    ? "请使用微信扫描上方二维码"
                    : qrData.status === "expired"
                      ? "二维码已过期，正在尝试刷新"
                      : qrData.status === "initializing"
                        ? "正在初始化二维码"
                        : "请继续完成扫码"}
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <QrCode className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">正在等待 AstrBot 返回二维码</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}