import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Switch } from "../../components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { tgApi, type WatchTarget } from "../../lib/telegram-api";
import { Plus, Trash2 } from "lucide-react";

export function TargetsPage() {
  const [targets, setTargets] = useState<WatchTarget[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const fetchTargets = async () => {
    try {
      const list = await tgApi.listTargets();
      setTargets(list);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    fetchTargets();
  }, []);

  const handleAdd = async () => {
    if (!input.trim()) return;
    setAdding(true);
    setError("");
    try {
      await tgApi.createTarget(input.trim());
      setInput("");
      await fetchTargets();
    } catch (err: any) {
      setError(err.message);
    }
    setAdding(false);
  };

  const handleToggle = async (id: number, enabled: boolean) => {
    try {
      await tgApi.updateTarget(id, enabled);
      setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, enabled } : t)));
    } catch {}
  };

  const handleDelete = async (id: number, title: string) => {
    if (!confirm(`确定删除"${title}"？`)) return;
    try {
      await tgApi.deleteTarget(id);
      setTargets((prev) => prev.filter((t) => t.id !== id));
    } catch {}
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">监听目标</h2>

      {/* Add target */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">添加目标</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <input
              className="flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="@username 或 https://t.me/... 邀请链接"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button onClick={handleAdd} disabled={adding || !input.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              {adding ? "解析中..." : "添加"}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </CardContent>
      </Card>

      {/* Targets table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">加载中...</div>
          ) : targets.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">暂无监听目标</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>用户名</TableHead>
                  <TableHead className="text-right">今日消息</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>启用</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{t.chat_type === "channel" ? "频道" : "群组"}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.username ? `@${t.username}` : "-"}
                    </TableCell>
                    <TableCell className="text-right">{t.today_count ?? 0}</TableCell>
                    <TableCell>
                      {t.last_error ? (
                        <Badge variant="destructive" className="text-xs">{t.last_error}</Badge>
                      ) : (
                        <Badge variant="secondary">正常</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch checked={t.enabled} onCheckedChange={(v: boolean) => handleToggle(t.id, v)} />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(t.id, t.title)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
