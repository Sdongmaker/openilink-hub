import { useState, useEffect, useRef } from "react";
import {
  Loader2,
  Plus,
  Trash2,
  Circle,
  QrCode,
  Send,
  RefreshCw,
  Wifi,
  WifiOff,
  Users,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { api, type AstrBotQR } from "@/lib/api";
import {
  useAstrBotHealth,
  useAstrBotBots,
  useAstrBotGroupStatus,
  useAstrBotCreateBot,
  useAstrBotDeleteBot,
  useAstrBotSendGroupMessage,
} from "@/hooks/use-astrbot";

const runtimeStatusMap: Record<string, { label: string; color: string }> = {
  running: { label: "运行中", color: "text-green-500 fill-green-500" },
  pending: { label: "启动中", color: "text-yellow-500 fill-yellow-500" },
  error: { label: "错误", color: "text-red-500 fill-red-500" },
  stopped: { label: "已停止", color: "text-muted-foreground fill-muted-foreground" },
  unknown: { label: "未知", color: "text-muted-foreground fill-muted-foreground" },
};

const qrStatusMap: Record<string, string> = {
  wait: "等待扫码",
  confirmed: "已确认",
  expired: "已过期",
};

export function AdminAstrBotPage() {
  const { data: health, isError: healthError } = useAstrBotHealth();
  const { data: bots, isLoading: botsLoading, refetch: refetchBots } = useAstrBotBots();
  const { data: groupStatus } = useAstrBotGroupStatus();
  const createBot = useAstrBotCreateBot();
  const deleteBot = useAstrBotDeleteBot();
  const sendMessage = useAstrBotSendGroupMessage();
  const { confirm, ConfirmDialog } = useConfirm();
  const { toast } = useToast();

  const [qrDialog, setQrDialog] = useState<{ open: boolean; platformId: string }>({
    open: false,
    platformId: "",
  });
  const [qrData, setQrData] = useState<AstrBotQR | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);

  const isOnline = health && !healthError;

  // QR polling
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
          toast({ title: "扫码成功", description: "Bot 已上线" });
          refetchBots();
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
  }, [qrDialog.open, qrDialog.platformId]);

  const handleCreate = async () => {
    try {
      const result = await createBot.mutateAsync();
      toast({ title: "Bot 已创建", description: `ID: ${result.platform_id}` });
      // Auto-open QR dialog
      setQrDialog({ open: true, platformId: result.platform_id });
    } catch (e: any) {
      toast({ title: "创建失败", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (platformId: string) => {
    const confirmed = await confirm({
      title: "删除 Bot",
      description: `确定要删除 Bot ${platformId} 吗？删除后该 Bot 将停止运行。`,
      confirmText: "删除",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await deleteBot.mutateAsync(platformId);
      toast({ title: "已删除", description: `Bot ${platformId} 已删除` });
    } catch (e: any) {
      toast({ title: "删除失败", description: e.message, variant: "destructive" });
    }
  };

  const handleSend = async () => {
    const text = msgText.trim();
    if (!text) return;
    setSending(true);
    try {
      await sendMessage.mutateAsync(text);
      toast({ title: "发送成功", description: "系统消息已发送到群组" });
      setMsgText("");
    } catch (e: any) {
      toast({ title: "发送失败", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {ConfirmDialog}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">外部 Bot 管理</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            通过 AstrBot 服务创建和管理微信 Bot 实例
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={isOnline ? "default" : "destructive"} className="gap-1.5">
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? "服务在线" : "服务离线"}
          </Badge>
          <Button onClick={handleCreate} disabled={!isOnline || createBot.isPending}>
            {createBot.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            创建 Bot
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              群组成员
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0 px-4 pb-3">
            <div className="text-2xl font-bold">{groupStatus?.member_count ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Wifi className="h-3.5 w-3.5" />
              在线成员
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0 px-4 pb-3">
            <div className="text-2xl font-bold text-green-600">
              {groupStatus?.online_count ?? "—"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Circle
                className={`h-3 w-3 ${isOnline ? "text-green-500 fill-green-500" : "text-red-500 fill-red-500"}`}
              />
              服务状态
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0 px-4 pb-3">
            <div className={`text-2xl font-bold ${isOnline ? "text-green-600" : "text-red-600"}`}>
              {isOnline ? "正常" : "离线"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bot list */}
      <Card>
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Bot 列表</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetchBots()}
            className="h-8 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {botsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !bots || bots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <QrCode className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">暂无 Bot，点击上方「创建 Bot」开始</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-48">Platform ID</TableHead>
                  <TableHead className="w-28">运行状态</TableHead>
                  <TableHead className="w-28">扫码状态</TableHead>
                  <TableHead className="w-20">已配置</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bots.map((bot) => {
                  const rs = runtimeStatusMap[bot.runtime_status] ?? runtimeStatusMap.unknown;
                  return (
                    <TableRow key={bot.platform_id}>
                      <TableCell className="font-mono text-xs">{bot.platform_id}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <Circle className={`h-2 w-2 ${rs.color}`} />
                          {rs.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        {bot.qr_status ? (
                          <Badge variant="outline" className="text-xs">
                            {qrStatusMap[bot.qr_status] ?? bot.qr_status}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {bot.configured ? (
                          <Badge variant="default" className="text-xs">
                            是
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            否
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!bot.configured && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1.5"
                              onClick={() =>
                                setQrDialog({ open: true, platformId: bot.platform_id })
                              }
                            >
                              <QrCode className="h-3.5 w-3.5" />
                              扫码
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(bot.platform_id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Send group message */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4" />
            发送系统消息
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-xs text-muted-foreground mb-3">
            消息将以 🤖 | 前缀发送给所有群组成员
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="输入系统消息..."
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              maxLength={2000}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              onClick={handleSend}
              disabled={!msgText.trim() || sending || !isOnline}
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* QR Code Dialog */}
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
            <DialogTitle>扫码登录</DialogTitle>
            <DialogDescription>
              使用微信扫描二维码完成 Bot 登录
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qrLoading && !qrData ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : qrData?.status === "confirmed" ? (
              <div className="flex flex-col items-center gap-2">
                <Circle className="h-16 w-16 text-green-500 fill-green-500" />
                <p className="text-green-600 font-medium">扫码成功，Bot 已上线</p>
              </div>
            ) : qrData?.qr_url ? (
              <>
                <img
                  src={qrData.qr_url}
                  alt="登录二维码"
                  className="w-64 h-64 rounded-lg border"
                />
                <p className="text-sm text-muted-foreground">
                  {qrData.status === "wait"
                    ? "请使用微信扫描上方二维码"
                    : qrData.status === "expired"
                      ? "二维码已过期，正在刷新..."
                      : qrData.status === "initializing"
                        ? "正在初始化..."
                        : ""}
                </p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">正在生成二维码...</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
