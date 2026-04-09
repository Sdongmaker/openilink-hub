import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
import {
  ArrowRight,
  CheckCircle2,
  EyeOff,
  Loader2,
  Lock,
  MessageCircle,
  MoonStar,
  QrCode,
  RefreshCw,
  ScanLine,
  Shield,
  Sparkles,
  X,
} from "lucide-react";

import { useUser } from "@/hooks/use-auth";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { cn } from "../lib/utils";

function QrCanvas({ url }: { url: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (url && ref.current) QRCode.toCanvas(ref.current, url, { width: 232, margin: 0 });
  }, [url]);
  return <canvas ref={ref} className="block rounded-lg" />;
}

const promiseCards = [
  {
    icon: EyeOff,
    title: "别人看不见你是谁",
    desc: "公开对话里不会展示你的昵称和头像，其他人只会看到系统分配的匿名符号。",
  },
  {
    icon: Lock,
    title: "不用拉群，也不用加好友",
    desc: "扫码就能进入，不暴露你的关系链，也不需要向任何人解释你从哪里来。",
  },
  {
    icon: Sparkles,
    title: "一句话，就能开始被听见",
    desc: "加入后回到微信，对刚绑定的 Bot 发第一句话，它会替你把心事送进树洞。",
  },
];

const steps = [
  {
    label: "01",
    title: "扫右侧二维码",
    desc: "用微信扫一扫，入口会立即为你打开。",
  },
  {
    label: "02",
    title: "在手机上确认绑定",
    desc: "系统会为你准备一个匿名身份，不需要公开昵称和头像。",
  },
  {
    label: "03",
    title: "回到微信，说第一句话",
    desc: "从这一刻开始，其他参与者只会看见你的匿名符号和内容。",
  },
];

const whisperSamples = [
  "今天看起来一切都正常，但其实我已经撑得有点累了。",
  "有些话不适合告诉熟人，可我还是想被认真听见一次。",
];

export function JoinPage() {
  const { data: user } = useUser();
  const [qrUrl, setQrUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "wait" | "scanned" | "connected" | "error">("idle");
  const [message, setMessage] = useState("");
  const [canOpenConsole, setCanOpenConsole] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      startScan();
    }
    return () => {
      cleanupPendingState();
    };
  }, []);

  function cleanupPendingState() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }

  async function startScan() {
    cleanupPendingState();
    setStatus("loading");
    setMessage("正在为你打开入口...");
    setQrUrl("");
    setCanOpenConsole(false);
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
      setMessage("请用微信扫一扫");
      connectWS(data.session_id);
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "没能打开入口，请稍后再试");
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
          setMessage("已识别到你，请在手机上确认");
        } else if (d.status === "refreshed") {
          setQrUrl(d.qr_url);
          setStatus("wait");
          setMessage("二维码已刷新，请重新扫描");
        } else if (d.status === "connected") {
          settled = true;
          if (d.session_token) {
            document.cookie = `session=${d.session_token}; path=/; max-age=${7 * 24 * 3600}; samesite=lax`;
          }
          setCanOpenConsole(d.role === "admin" || d.role === "superadmin");
          ws.close();
          setStatus("connected");
          setMessage("你已经进入今晚的树洞");
        }
      } else if (d.event === "error") {
        settled = true;
        setMessage(d.message || "暂时没能加入，请重试");
        setStatus("error");
        ws.close();
      }
    };
    ws.onerror = () => { ws.close(); };
    ws.onclose = () => {
      if (settled) return;
      if (retries < MAX_RETRIES) {
        const delay = Math.min(1000 * 2 ** retries, 8000);
        setMessage("连接中断，正在帮你重连...");
        timerRef.current = setTimeout(() => connectWS(sessionID, retries + 1), delay);
      } else {
        setStatus("error");
        setMessage("连接中断了，请重新生成二维码");
      }
    };
  }

  const scanHint = status === "scanned"
    ? "确认后就会自动加入，不需要额外申请。"
    : "如果二维码过期，页面会自动帮你刷新。";

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_30%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_26%),radial-gradient(circle_at_bottom,rgba(20,184,166,0.14),transparent_36%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:68px_68px] opacity-20 [mask-image:radial-gradient(circle_at_center,black,transparent_82%)]" />
        <div className="absolute left-[12%] top-20 h-44 w-44 rounded-full bg-emerald-300/12 blur-3xl" />
        <div className="absolute right-[10%] top-16 h-64 w-64 rounded-full bg-cyan-300/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-emerald-400/10 blur-[120px]" />
      </div>

      <header className="relative z-10 px-6 pt-6 sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-white/10 bg-white/5 px-5 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-2.5 text-sm font-medium text-white/[0.78]">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-emerald-400/10">
              <MoonStar className="h-4 w-4 text-emerald-300" />
            </div>
            今晚的树洞
          </div>
          {(isAdmin || canOpenConsole) && (
            <Link to="/dashboard">
              <Button variant="ghost" size="sm" className="gap-1.5 rounded-full px-3 text-white/70 hover:bg-white/[0.08] hover:text-white">
                控制台 <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto grid max-w-7xl gap-10 px-6 pb-16 pt-10 sm:px-8 lg:grid-cols-[minmax(0,1.08fr)_24rem] lg:items-start lg:gap-12 lg:px-12 lg:pb-24 lg:pt-14">
        <section className="space-y-8 lg:pt-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 text-xs font-medium tracking-[0.18em] text-white/[0.72] uppercase backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
            private whisper room
          </div>

          <div className="max-w-3xl space-y-5">
            <h1 className="text-4xl font-semibold leading-[1.04] tracking-[-0.04em] text-white sm:text-5xl lg:text-[4.5rem]">
              把今晚
              <span className="block bg-[linear-gradient(135deg,#ffffff_12%,#7dd3fc_44%,#6ee7b7_88%)] bg-clip-text text-transparent">
                说不出口的话
              </span>
              放进一个没人认识你的地方
            </h1>
            <p className="max-w-2xl text-base leading-8 text-white/[0.68] sm:text-lg">
              这里不是群公告，也不是功能平台。
              这是一个给情绪留出口的私密入口。
              扫码后你会自动进入一个只看得见内容、看不见身份的树洞空间。
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {whisperSamples.map((sample, index) => (
              <div
                key={sample}
                className={cn(
                  "relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.055] p-5 shadow-[0_16px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl",
                  index === 0 ? "sm:rotate-[-2deg]" : "sm:translate-y-8 sm:rotate-[2deg]",
                )}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-white/[0.42]">
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-300/[0.8]" />
                  匿名片段
                </div>
                <p className="text-sm leading-7 text-white/[0.78] sm:text-[15px]">“{sample}”</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {promiseCards.map((item) => (
              <div
                key={item.title}
                className="rounded-[1.6rem] border border-white/10 bg-white/[0.045] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-emerald-400/10 text-emerald-300">
                  <item.icon className="h-5 w-5" />
                </div>
                <h2 className="text-base font-medium text-white">{item.title}</h2>
                <p className="mt-2 text-sm leading-7 text-white/[0.58]">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-sm font-medium text-white/[0.86]">
              <Shield className="h-4 w-4 text-emerald-300" />
              进入之后，会发生什么
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              {steps.map((step) => (
                <div key={step.label} className="rounded-[1.5rem] border border-white/[0.08] bg-black/[0.12] p-4">
                  <div className="mb-3 text-[11px] font-semibold tracking-[0.26em] text-emerald-300/[0.82]">{step.label}</div>
                  <h3 className="text-sm font-medium text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/[0.56]">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="lg:sticky lg:top-8">
          <Card className="relative overflow-hidden rounded-[2rem] border border-white/[0.12] bg-white/[0.07] p-6 text-white shadow-[0_28px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(110,231,183,0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0))]" />
            <div className="relative">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-white/[0.44]">join quietly</p>
                  <h2 className="mt-1 text-2xl font-medium tracking-[-0.03em] text-white">扫一扫，替自己保留身份</h2>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
                  <ScanLine className="h-5 w-5 text-emerald-300" />
                </div>
              </div>

              <p className="mb-6 text-sm leading-7 text-white/60">
                绑定只用于收发消息。公开交流时，其他参与者不会看到你的昵称和头像。
              </p>

              {status === "connected" ? (
                <div className="space-y-5 py-3">
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-full bg-emerald-400/20 blur-xl" />
                      <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-emerald-300/[0.25] bg-emerald-400/10">
                        <CheckCircle2 className="h-10 w-10 text-emerald-300" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl font-medium text-white">你已经在里面了</h3>
                      <p className="text-sm leading-7 text-white/[0.62]">
                        现在回到微信，给刚刚绑定的那个 Bot 发第一句话。
                        其他参与者只会看到系统分配给你的匿名符号，不会看到你的昵称和头像。
                      </p>
                    </div>
                  </div>

                  <div className="rounded-[1.4rem] border border-emerald-300/[0.14] bg-emerald-400/[0.08] p-4 text-sm leading-7 text-white/[0.72]">
                    适合从一句很轻的话开始。比如：我想说点心事，今晚有人在吗？
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      variant="outline"
                      onClick={startScan}
                      className="flex-1 rounded-full border-white/[0.14] bg-white/[0.04] text-white hover:bg-white/[0.08] hover:text-white"
                    >
                      重新生成入口
                    </Button>
                    {canOpenConsole && (
                      <Link to="/dashboard" className="flex-1">
                        <Button className="w-full rounded-full bg-emerald-400 text-slate-950 hover:bg-emerald-300">
                          进入控制台
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-col items-center gap-4 rounded-[1.8rem] border border-white/10 bg-black/[0.16] p-5">
                    {qrUrl && (status === "wait" || status === "scanned") ? (
                      <div className="relative overflow-hidden rounded-[1.6rem] bg-white p-4 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
                        <QrCanvas url={qrUrl} />
                      </div>
                    ) : (
                      <div className="flex h-[264px] w-[264px] items-center justify-center rounded-[1.6rem] border border-dashed border-white/[0.14] bg-white/[0.04]">
                        {status === "error" ? (
                          <div className="space-y-3 px-6 text-center">
                            <X className="mx-auto h-8 w-8 text-rose-300" />
                            <p className="text-sm leading-7 text-white/[0.58]">{message}</p>
                            <Button
                              variant="outline"
                              onClick={startScan}
                              className="rounded-full border-white/[0.14] bg-white/[0.04] text-white hover:bg-white/[0.08] hover:text-white"
                            >
                              重新生成二维码
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-3 text-white/50">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <p className="text-sm">{message || "正在准备二维码"}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {status !== "error" && (
                      <div className="space-y-2 text-center">
                        <div className="flex items-center justify-center gap-2 text-sm font-medium text-white">
                          <QrCode className="h-4 w-4 text-emerald-300" />
                          {message || "请用微信扫一扫"}
                        </div>
                        <p className="max-w-[18rem] text-xs leading-6 text-white/[0.48]">{scanHint}</p>
                      </div>
                    )}
                  </div>

                  <div className="rounded-[1.5rem] border border-white/[0.08] bg-white/[0.04] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">加入前你只需要知道三件事</p>
                        <p className="mt-1 text-xs leading-6 text-white/[0.46]">步骤越少越好，所以这里只保留必要信息。</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={startScan}
                        className="rounded-full px-3 text-white/[0.62] hover:bg-white/[0.08] hover:text-white"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        刷新
                      </Button>
                    </div>
                    <div className="mt-4 space-y-3 text-sm leading-7 text-white/[0.62]">
                      <p>1. 扫码确认后会自动加入，不需要人工审核。</p>
                      <p>2. 公开交流时，其他参与者只看得到匿名符号，不看得到你的身份。</p>
                      <p>3. 加入成功后，直接去微信里对 Bot 发消息就可以开始。</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </aside>
      </main>

      <footer className="relative z-10 px-6 pb-8 text-center text-xs text-white/34 sm:px-8 lg:px-12">
        不是公开发言场，也不是功能演示页。这里只负责让你安全地开口。
      </footer>
    </div>
  );
}
