import { useEffect, useRef, useCallback, useState } from "react";
import { Loader2, Wifi, WifiOff, Users, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useRelayMessages, useRelayStats } from "@/hooks/use-relay";
import type { RelayMessage } from "@/lib/api";

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}小时前`;
  return new Date(ts).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function contentTypeLabel(type: string): string {
  switch (type) {
    case "image": return "图片";
    case "voice": return "语音";
    case "video": return "视频";
    case "file": return "文件";
    default: return "";
  }
}

function MessageBubble({ msg }: { msg: RelayMessage }) {
  const isMedia = msg.content_type !== "text";

  return (
    <div className="flex items-start gap-3 py-2 px-3 hover:bg-muted/40 rounded-lg transition-colors">
      <div className="text-2xl flex-shrink-0 mt-0.5 select-none" title={msg.source_bot_id}>
        {msg.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isMedia && (
            <Badge variant="secondary" className="text-xs font-normal">
              {contentTypeLabel(msg.content_type)}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(msg.created_at)}
          </span>
        </div>
        <p className="text-sm mt-0.5 break-words whitespace-pre-wrap">{msg.content}</p>
      </div>
    </div>
  );
}

export function RelayChat() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useRelayMessages();
  const { data: stats } = useRelayStats();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [liveMessages, setLiveMessages] = useState<RelayMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Flatten paginated messages (they come newest-first, reverse for display).
  const pagedMessages =
    data?.pages.flatMap((p) => p.messages ?? []).reverse() ?? [];
  const allMessages = [...pagedMessages, ...liveMessages];

  // WebSocket for live messages.
  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/api/admin/relay/ws`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const msg: RelayMessage = JSON.parse(e.data);
        setLiveMessages((prev) => [...prev, msg]);
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      // Reconnect after 3s.
      setTimeout(() => {
        // Only if component is still mounted.
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
      }, 3000);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive (if user is at bottom).
  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [allMessages.length, isAtBottom]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      setIsAtBottom(atBottom);

      // Load older messages when scrolled to top.
      if (el.scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAtBottom(true);
  };

  const wsConnected = wsRef.current?.readyState === WebSocket.OPEN;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-4xl mx-auto">
      {/* Header bar */}
      <Card className="mb-4 flex-shrink-0">
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="text-lg">🌐</span>
              消息广场
            </CardTitle>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span>
                      {stats?.online_members ?? 0}/{stats?.total_members ?? 0}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>在线/总成员数</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  {wsConnected ? (
                    <Wifi className="h-4 w-4 text-green-500" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </TooltipTrigger>
                <TooltipContent>{wsConnected ? "实时连接" : "未连接"}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Message stream */}
      <Card className="flex-1 flex flex-col overflow-hidden relative">
        <CardContent className="flex-1 overflow-hidden p-0">
          <div
            ref={scrollRef}
            className="h-full overflow-y-auto px-4 py-2"
            onScroll={handleScroll}
          >
            {/* Load more indicator */}
            {isFetchingNextPage && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {hasNextPage && !isFetchingNextPage && (
              <div className="flex justify-center py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchNextPage()}
                  className="text-xs text-muted-foreground"
                >
                  加载更多
                </Button>
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : allMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                暂无消息
              </div>
            ) : (
              <div className="space-y-1">
                {allMessages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </CardContent>

        {/* Scroll to bottom button */}
        {!isAtBottom && (
          <Button
            variant="secondary"
            size="icon"
            className="absolute bottom-4 right-4 rounded-full shadow-lg h-8 w-8"
            onClick={scrollToBottom}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        )}
      </Card>
    </div>
  );
}

export { RelayChat as AdminRelayPage };
