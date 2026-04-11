import { useEffect, useState } from "react";
import { Card, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { tgApi, type TGMessage, type WatchTarget } from "../../lib/telegram-api";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function MessagesPage() {
  const [messages, setMessages] = useState<TGMessage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [targets, setTargets] = useState<WatchTarget[]>([]);
  const [filterTarget, setFilterTarget] = useState<string>("all");
  const [filterAd, setFilterAd] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const fetchMessages = async () => {
    setLoading(true);
    try {
      const params: any = { page, per_page: perPage };
      if (filterTarget !== "all") params.target_id = Number(filterTarget);
      if (filterAd !== "all") params.is_ad = filterAd === "true";
      const res = await tgApi.listMessages(params);
      setMessages(res.data);
      setTotal(res.total);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    tgApi.listTargets().then(setTargets).catch(() => {});
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [page, filterTarget, filterAd]);

  const totalPages = Math.ceil(total / perPage);

  const formatTime = (ts: number) => new Date(ts * 1000).toLocaleString();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">消息列表</h2>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">目标:</span>
          <Select value={filterTarget} onValueChange={(v: string) => { setFilterTarget(v); setPage(1); }}>
            <SelectTrigger className="w-40 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              {targets.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>{t.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">类型:</span>
          <Select value={filterAd} onValueChange={(v: string) => { setFilterAd(v); setPage(1); }}>
            <SelectTrigger className="w-28 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="false">内容</SelectItem>
              <SelectItem value="true">广告</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-sm text-muted-foreground self-center ml-auto">
          共 {total} 条
        </span>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">加载中...</div>
          ) : messages.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">暂无消息</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>时间</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead>发送者</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead className="max-w-xs">内容</TableHead>
                  <TableHead>广告</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTime(m.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">{m.target_title}</TableCell>
                    <TableCell className="text-sm">{m.sender_name || m.sender_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{m.content_type}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {m.media_key && (
                        <a
                          href={`/api/v1/media/${m.media_key}`}
                          target="_blank"
                          rel="noopener"
                          className="text-xs text-blue-500 underline mr-2"
                        >
                          [媒体]
                        </a>
                      )}
                      <span className="text-sm truncate block max-w-xs">
                        {m.text_content || (m.media_key ? "" : "-")}
                      </span>
                    </TableCell>
                    <TableCell>
                      {m.is_ad ? (
                        <Badge variant="destructive">广告 {(m.ad_confidence * 100).toFixed(0)}%</Badge>
                      ) : (
                        <Badge variant="secondary">内容</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
