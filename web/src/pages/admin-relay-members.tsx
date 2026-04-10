import { useState } from "react";
import { Loader2, Trash2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { useRelayMembers, useRelayStats, useRemoveRelayMember } from "@/hooks/use-relay";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminRelayMembersPage() {
  const { data: members, isLoading } = useRelayMembers();
  const { data: stats } = useRelayStats();
  const removeMember = useRemoveRelayMember();
  const { confirm, ConfirmDialog } = useConfirm();
  const { toast } = useToast();

  const handleRemove = async (botID: string, botName: string) => {
    const confirmed = await confirm({
      title: "移除群组成员",
      description: `确定要将 ${botName} 从虚拟群组中移除吗？移除后该账号将不再中转消息。`,
      confirmText: "移除",
      variant: "destructive",
    });
    if (!confirmed) return;

    try {
      await removeMember.mutateAsync(botID);
      toast({ title: "已移除", description: `${botName} 已从虚拟群组中移除` });
    } catch {
      toast({ title: "移除失败", variant: "destructive" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {ConfirmDialog}
      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              总成员
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0 px-4 pb-3">
            <div className="text-2xl font-bold">{stats?.total_members ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              在线成员
            </CardTitle>
          </CardHeader>
          <CardContent className="py-0 px-4 pb-3">
            <div className="text-2xl font-bold text-green-600">
              {stats?.online_members ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Members table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base">群组成员</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !members || members.length === 0 ? (
            <div className="flex justify-center py-8 text-sm text-muted-foreground">
              暂无成员
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Emoji</TableHead>
                  <TableHead>账号名称</TableHead>
                  <TableHead>所有者</TableHead>
                  <TableHead className="w-20">状态</TableHead>
                  <TableHead>加入时间</TableHead>
                  <TableHead className="w-20 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.bot_id}>
                    <TableCell className="text-xl">{m.emoji}</TableCell>
                    <TableCell className="font-medium">
                      {m.bot_name || m.bot_id}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.owner_name || "—"}
                    </TableCell>
                    <TableCell>
                      {m.online ? (
                        <Badge
                          variant="secondary"
                          className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        >
                          <Circle className="h-2 w-2 fill-current mr-1" />
                          在线
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <Circle className="h-2 w-2 fill-current mr-1" />
                          离线
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(m.joined_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleRemove(m.bot_id, m.bot_name || m.bot_id)}
                        disabled={removeMember.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
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
