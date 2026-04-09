import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { HexagonBackground } from "../components/ui/hexagon-background";
import { cn } from "../lib/utils";
import {
  Bot, Webhook, Cable, Zap, QrCode, Loader2, X, CheckCircle2, MessageCircle,
  ArrowRight, Sparkles, Globe, Code2, Lock
} from "lucide-react";
import { useUser } from "@/hooks/use-auth";
import QRCode from "qrcode";

function QrCanvas({ url }: { url: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (url && ref.current) QRCode.toCanvas(ref.current, url, { width: 200, margin: 0 });
  }, [url]);
  return <canvas ref={ref} className="block rounded-lg" />;
}

function HomeScanWidget() {
  const [qrUrl, setQrUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "wait" | "scanned" | "connected" | "error">("idle");
  const [message, setMessage] = useState("");
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    startScan();
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
          ws.close();
          setStatus("connected");
          setMessage("");
        }
      } else if (d.event === "error") {
        settled = true;
        setMessage(d.message || "扫码失败");
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
        setMessage("连接中断，请刷新重试");
      }
    };
  }

  if (status === "connected") {
    return (
      <div className="flex flex-col items-center gap-5 py-4">
        <div className="relative">
          <div className="absolute inset-0 animate-ping rounded-full bg-green-500/20" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10 ring-2 ring-green-500/30">
            <CheckCircle2 className="h-10 w-10 text-green-400" />
          </div>
        </div>
        <div className="text-center space-y-3">
          <h3 className="text-xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
            绑定成功
          </h3>
          <p className="text-sm text-muted-foreground max-w-[280px] leading-relaxed">
            微信已连接到平台。管理员会为您配置消息转发和自动回复等服务。
          </p>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-green-500/15 bg-green-500/5 px-5 py-3 text-sm">
          <MessageCircle className="h-4 w-4 text-green-400 shrink-0" />
          <span className="text-muted-foreground">后续进展将通过微信通知您</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative group">
        <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-b from-primary/10 to-transparent blur-2xl transition-all group-hover:from-primary/20" />
        {qrUrl ? (
          <div className="relative overflow-hidden rounded-2xl bg-white p-3.5 shadow-[0_20px_60px_rgba(0,0,0,0.3)] ring-1 ring-white/20">
            <QrCanvas url={qrUrl} />
          </div>
        ) : (
          <div className="relative flex h-[200px] w-[200px] items-center justify-center rounded-2xl border-2 border-dashed border-white/10 bg-white/5">
            {status === "error" ? (
              <div className="text-center space-y-3 px-4">
                <X className="h-8 w-8 text-destructive mx-auto" />
                <p className="text-xs text-muted-foreground">{message}</p>
                <Button size="sm" variant="outline" onClick={startScan}>重新获取</Button>
              </div>
            ) : (
              <Loader2 className="h-10 w-10 animate-spin text-primary/40" />
            )}
          </div>
        )}
      </div>
      <div className="text-center space-y-1.5">
        <div className="flex items-center justify-center gap-2">
          <QrCode className="h-4 w-4 text-primary" />
          <p className="font-semibold text-sm">{message || "正在加载..."}</p>
        </div>
        <p className="text-xs text-muted-foreground/70 max-w-[240px] mx-auto leading-relaxed">
          {status === "scanned"
            ? "请在手机上确认"
            : "打开微信扫一扫，10 秒完成绑定"}
        </p>
      </div>
    </div>
  );
}

const features = [
  {
    icon: Bot,
    title: "多账号并行",
    desc: "同时接入多个微信号，每个账号独立配置消息处理规则，互不干扰",
    gradient: "from-blue-500/20 to-cyan-500/20",
  },
  {
    icon: Cable,
    title: "实时消息桥接",
    desc: "消息通过 WebSocket 实时流转，延迟低于 100ms，支持双向通信",
    gradient: "from-violet-500/20 to-purple-500/20",
  },
  {
    icon: Webhook,
    title: "Webhook 自动推送",
    desc: "收到消息即刻推送到你的服务，自定义过滤规则和脚本中间件",
    gradient: "from-orange-500/20 to-amber-500/20",
  },
  {
    icon: Zap,
    title: "AI 智能回复",
    desc: "接入 OpenAI 兼容 API，按群、按规则独立开关，自动化对话处理",
    gradient: "from-emerald-500/20 to-green-500/20",
  },
  {
    icon: Code2,
    title: "开发者友好",
    desc: "完整的 HTTP API + WebSocket 协议，10 分钟接入你的应用",
    gradient: "from-pink-500/20 to-rose-500/20",
  },
  {
    icon: Lock,
    title: "安全沙箱执行",
    desc: "脚本在隔离沙箱中运行，5 秒超时保护，禁止危险操作",
    gradient: "from-teal-500/20 to-cyan-500/20",
  },
];

const steps = [
  { num: "01", title: "扫码绑定", desc: "微信扫一扫，自动连接到平台", icon: QrCode },
  { num: "02", title: "配置规则", desc: "设置消息转发、AI 回复、Webhook 推送", icon: Sparkles },
  { num: "03", title: "接入使用", desc: "通过 API 实时收发消息，构建自动化工作流", icon: Globe },
];

export function HomePage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const { data: user } = useUser();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  useEffect(() => {
    const updateScrollState = () => {
      setIsScrolled(window.scrollY > 32);
    };

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });

    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-x-hidden bg-background">
      <HexagonBackground className="opacity-80" hexagonSize={84} hexagonMargin={5} />

      {/* Ambient glow effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/8 blur-[120px]" />
        <div className="absolute right-1/4 top-32 h-[500px] w-[500px] translate-x-1/2 rounded-full bg-violet-500/6 blur-[100px]" />
        <div className="absolute bottom-0 left-1/2 h-[400px] w-[800px] -translate-x-1/2 rounded-full bg-cyan-500/5 blur-[100px]" />
      </div>
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.02),transparent_20%,transparent_80%,rgba(0,0,0,0.2))]" />

      {/* Header — minimal, only admin sees console link */}
      <header className="sticky top-0 z-20 px-6 py-4 sm:px-8 lg:px-12">
        <div
          className={cn(
            "mx-auto flex max-w-7xl items-center justify-between rounded-full px-5 transition-all duration-300",
            isScrolled
              ? "border border-white/8 bg-[linear-gradient(to_bottom,rgba(10,10,10,0.82),rgba(18,18,18,0.62))] py-2.5 shadow-[0_14px_44px_rgba(0,0,0,0.34)] backdrop-blur-xl"
              : "border border-white/5 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] py-3 shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur-md",
          )}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Cable className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground/90">消息中继平台</span>
          </div>
          {isAdmin && (
            <Link to="/dashboard">
              <Button size="sm" variant="ghost" className="gap-1.5 px-3 text-xs text-muted-foreground hover:text-foreground">
                控制台 <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          )}
        </div>
      </header>

      <main className="relative z-10 flex-1 pb-16 sm:pb-20">

        {/* ── Hero: Split layout ── */}
        <section className="mx-auto max-w-6xl px-6 pt-12 sm:px-8 sm:pt-16 lg:pt-20">
          <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-16">

            {/* Left: Copy */}
            <div className="flex-1 text-center lg:text-left">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
                <Sparkles className="h-3 w-3" />
                微信消息自动化
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-[3.4rem] lg:leading-[1.12]">
                <span className="bg-gradient-to-br from-foreground via-foreground/90 to-foreground/70 bg-clip-text text-transparent">
                  让微信消息
                </span>
                <br />
                <span className="bg-gradient-to-r from-primary via-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                  为你而动
                </span>
              </h1>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg lg:mx-0 mx-auto">
                扫码即接入。消息实时转发到你的服务，AI 自动回复，Webhook 推送 —— 10 秒绑定，开箱即用。
              </p>

              {/* Trust indicators */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground/60 lg:justify-start">
                <span className="flex items-center gap-1.5"><Lock className="h-3 w-3" /> 端到端安全</span>
                <span className="flex items-center gap-1.5"><Zap className="h-3 w-3" /> 延迟 &lt;100ms</span>
                <span className="flex items-center gap-1.5"><Code2 className="h-3 w-3" /> 完整 API</span>
              </div>
            </div>

            {/* Right: QR Card */}
            <div className="w-full max-w-sm lg:w-auto lg:shrink-0">
              <Card className="relative overflow-hidden border-white/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.3)] backdrop-blur-xl">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5" />
                <div className="relative">
                  <HomeScanWidget />
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="mx-auto max-w-6xl px-6 pt-24 sm:px-8 sm:pt-28">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              你需要的一切，
              <span className="bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">都已内置</span>
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              从消息接收到智能回复，一站式解决微信自动化需求
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {features.map((f) => (
              <Card
                key={f.title}
                className="group relative overflow-hidden rounded-2xl border border-white/6 bg-card/60 p-6 backdrop-blur-sm transition-all duration-300 hover:border-white/12 hover:bg-card/80 hover:shadow-[0_8px_40px_rgba(0,0,0,0.2)]"
              >
                <div className={cn("absolute inset-0 bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100", f.gradient)} />
                <div className="relative space-y-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10 transition-colors group-hover:bg-white/10">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-[15px] font-semibold tracking-tight">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="mx-auto max-w-4xl px-6 pt-24 sm:px-8 sm:pt-28">
          <div className="mb-14 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">三步开始</h2>
          </div>
          <div className="relative">
            {/* Connecting line */}
            <div className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-gradient-to-b from-primary/30 via-primary/10 to-transparent lg:block" />
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:gap-6">
              {steps.map((s) => (
                <div key={s.num} className="group flex flex-col items-center text-center">
                  <div className="relative mb-5">
                    <div className="absolute inset-0 scale-0 rounded-2xl bg-primary/10 blur-xl transition-transform duration-300 group-hover:scale-150" />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] shadow-lg transition-all duration-300 group-hover:border-primary/30 group-hover:shadow-primary/10">
                      <s.icon className="h-7 w-7 text-primary/80 transition-colors group-hover:text-primary" />
                    </div>
                    <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-lg shadow-primary/30">
                      {s.num}
                    </span>
                  </div>
                  <h3 className="mb-2 text-base font-semibold tracking-tight">{s.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground max-w-[220px]">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/5 px-6 py-5 text-center text-xs text-muted-foreground/40 sm:px-8">
        开源微信消息中继平台
      </footer>
    </div>
  );
}
