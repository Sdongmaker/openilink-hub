import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { Loader2, Users, MessageCircle, Shield } from "lucide-react";

import { Button } from "../components/ui/button";
import { HexagonBackground } from "../components/ui/hexagon-background";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

function QrCanvas({ url }: { url: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (url && ref.current) QRCode.toCanvas(ref.current, url, { width: 224, margin: 0 });
  }, [url]);
  return <canvas ref={ref} className="block rounded-lg" />;
}

export function JoinPage() {
  const navigate = useNavigate();
  const [qrUrl, setQrUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "wait" | "scanned" | "error">("idle");
  const [message, setMessage] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  async function startScan() {
    setStatus("loading");
    setMessage("正在初始化...");
    setQrUrl("");
    try {
      const res = await fetch("/api/auth/scan/start", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "初始化失败");
      setQrUrl(data.qr_url);
      setStatus("wait");
      setMessage("请使用微信扫描二维码");
      connectWS(data.session_id);
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "初始化失败");
    }
  }

  function connectWS(sessionID: string, retries = 0) {
    const MAX_RETRIES = 5;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/auth/scan/status/${sessionID}`);
    wsRef.current = ws;
    let settled = false;

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.event === "status") {
        if (d.status === "scanned") {
          setStatus("scanned");
          setMessage("已扫码，请在手机上确认...");
        } else if (d.status === "refreshed") {
          setQrUrl(d.qr_url);
          setStatus("wait");
          setMessage("二维码已刷新，请重新扫描");
        } else if (d.status === "connected") {
          settled = true;
          if (d.session_token) {
            document.cookie = `session=${d.session_token}; path=/; max-age=${7 * 24 * 3600}; samesite=lax`;
          }
          ws.close();
          navigate("/dashboard");
        }
      } else if (d.event === "error") {
        settled = true;
        setMessage(d.message || "加入失败");
        setStatus("error");
        ws.close();
      }
    };
    ws.onerror = () => { ws.close(); };
    ws.onclose = () => {
      if (settled) return;
      if (retries < MAX_RETRIES) {
        const delay = Math.min(1000 * 2 ** retries, 8000);
        setMessage("连接中断，正在重连...");
        timerRef.current = setTimeout(() => connectWS(sessionID, retries + 1), delay);
      } else {
        setStatus("error");
        setMessage("连接中断，请刷新页面重试");
      }
    };
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <HexagonBackground />
      <Card className="relative z-10 w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">加入匿名群聊</CardTitle>
          <CardDescription>
            扫码绑定你的微信 Bot，即刻加入匿名交流群
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Features */}
          <div className="grid grid-cols-3 gap-3 text-center text-xs text-muted-foreground">
            <div className="flex flex-col items-center gap-1.5">
              <Users className="h-5 w-5 text-primary" />
              <span>多人匿名</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <MessageCircle className="h-5 w-5 text-primary" />
              <span>实时消息</span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              <Shield className="h-5 w-5 text-primary" />
              <span>身份保护</span>
            </div>
          </div>

          {/* QR Code Area */}
          <div className="flex flex-col items-center gap-3">
            {status === "idle" && (
              <Button size="lg" onClick={startScan} className="w-full">
                扫码加入
              </Button>
            )}
            {status === "loading" && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{message}</span>
              </div>
            )}
            {(status === "wait" || status === "scanned") && qrUrl && (
              <>
                <div className="rounded-xl border bg-white p-3">
                  <QrCanvas url={qrUrl} />
                </div>
                <p className="text-sm text-muted-foreground">{message}</p>
              </>
            )}
            {status === "error" && (
              <div className="text-center space-y-3">
                <p className="text-sm text-destructive">{message}</p>
                <Button variant="outline" onClick={startScan}>
                  重试
                </Button>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p>1. 点击「扫码加入」获取二维码</p>
            <p>2. 用微信扫描二维码并确认</p>
            <p>3. 绑定成功后自动加入群聊，给 Bot 发消息即可在群内交流</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
