import { ArrowRight, Lock, QrCode, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const steps = [
  {
    title: "登录管理员后台",
    description: "普通访客只查看接入说明，机器人新增与记录管理仅对管理员开放。",
    icon: Lock,
  },
  {
    title: "创建一条机器人记录",
    description: "后台会调用 AstrBot 服务创建记录，并立即生成对应的微信扫码入口。",
    icon: Sparkles,
  },
  {
    title: "扫码确认并完成接入",
    description: "管理员使用微信扫码后，后台记录会更新为已接入，后续可继续查看当前状态。",
    icon: QrCode,
  },
];

const notes = [
  "该站点仅用于 AstrBot 机器人接入引导与后台管理。",
  "公开页面不承担机器人创建动作，也不会暴露 AstrBot 密钥或管理接口。",
  "后台展示的是 AstrBot 当前已有记录，不额外维护本地历史。",
];

export function JoinPage() {
  return (
    <div className="min-h-screen bg-[#0b1018] text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-emerald-300/80">
              AstrBot Access Portal
            </p>
            <h1 className="mt-3 text-lg font-semibold tracking-tight text-white sm:text-xl">
              AstrBot 机器人接入门户
            </h1>
          </div>
          <Button
            asChild
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            <Link to="/login">管理员登录</Link>
          </Button>
        </header>

        <main className="flex flex-1 items-center py-12 sm:py-16">
          <div className="grid w-full gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <section className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                公开引导页
              </div>

              <div className="space-y-5">
                <h2 className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-5xl">
                  用一个极简入口，完成
                  <span className="block text-emerald-300">AstrBot 微信机器人接入</span>
                </h2>
                <p className="max-w-2xl text-base leading-8 text-white/62 sm:text-lg">
                  当前站点只承担两件事：对外说明接入流程，以及为管理员提供一个受控后台，
                  用来创建 AstrBot 机器人记录、打开二维码并查看当前接入状态。
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {steps.map((step) => {
                  const Icon = step.icon;
                  return (
                    <Card
                      key={step.title}
                      className="rounded-3xl border-white/10 bg-white/[0.04] p-5 text-white shadow-none"
                    >
                      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/12 text-emerald-300">
                        <Icon className="h-4 w-4" />
                      </div>
                      <h3 className="text-base font-semibold">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-white/60">{step.description}</p>
                    </Card>
                  );
                })}
              </div>
            </section>

            <Card className="overflow-hidden rounded-[28px] border-white/10 bg-white/[0.04] p-6 text-white shadow-none">
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <p className="text-sm font-medium text-emerald-200">使用边界</p>
                <div className="mt-6 space-y-4">
                  {notes.map((note, index) => (
                    <div key={note} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-white/70">
                        {index + 1}
                      </div>
                      <p className="text-sm leading-6 text-white/62">{note}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-emerald-400/20 bg-emerald-400/8 p-5">
                <p className="text-sm font-medium text-emerald-200">下一步</p>
                <p className="mt-2 text-sm leading-6 text-emerald-50/80">
                  管理员登录后，可以直接在后台创建机器人记录，弹出 AstrBot 提供的二维码，并实时查看当前新增结果。
                </p>
                <Button asChild className="mt-5 h-11 rounded-full px-5 text-sm font-medium">
                  <Link to="/login">
                    进入管理员后台
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Card>
          </div>
        </main>

        <footer className="border-t border-white/10 pt-6 text-sm text-white/35">
          该页面仅作为 AstrBot 机器人接入说明页存在。创建、扫码与记录查看均在管理员后台完成。
        </footer>
      </div>
    </div>
  );
}import { ArrowRight, Lock, QrCode, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const steps = [
  {
    title: "登录管理员后台",
    description: "普通访客只查看接入说明，机器人新增与记录管理仅对管理员开放。",
    icon: Lock,
  },
  {
    title: "创建一条机器人记录",
    description: "后台会调用 AstrBot 服务创建记录，并立即生成对应的微信扫码入口。",
    icon: Sparkles,
  },
  {
    title: "扫码确认并完成接入",
    description: "管理员使用微信扫码后，后台记录会更新为已接入，后续可继续查看当前状态。",
    icon: QrCode,
  },
];

const notes = [
  "该站点仅用于 AstrBot 机器人接入引导与后台管理。",
  "公开页面不承担机器人创建动作，也不会暴露 AstrBot 密钥或管理接口。",
  "后台展示的是 AstrBot 当前已有记录，不额外维护本地历史。",
];

export function JoinPage() {
  return (
    <div className="min-h-screen bg-[#0b1018] text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-emerald-300/80">
              AstrBot Access Portal
            </p>
            <h1 className="mt-3 text-lg font-semibold tracking-tight text-white sm:text-xl">
              AstrBot 机器人接入门户
            </h1>
          </div>
          <Button
            asChild
            variant="outline"
            className="border-white/15 bg-white/5 text-white hover:bg-white/10"
          >
            <Link to="/login">管理员登录</Link>
          </Button>
        </header>

        <main className="flex flex-1 items-center py-12 sm:py-16">
          <div className="grid w-full gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
            <section className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                公开引导页
              </div>

              <div className="space-y-5">
                <h2 className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-5xl">
                  用一个极简入口，完成
                  <span className="block text-emerald-300">AstrBot 微信机器人接入</span>
                </h2>
                <p className="max-w-2xl text-base leading-8 text-white/62 sm:text-lg">
                  当前站点只承担两件事：对外说明接入流程，以及为管理员提供一个受控后台，
                  用来创建 AstrBot 机器人记录、打开二维码并查看当前接入状态。
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {steps.map((step) => {
                  const Icon = step.icon;
                  return (
                    <Card
                      key={step.title}
                      className="rounded-3xl border-white/10 bg-white/[0.04] p-5 text-white shadow-none"
                    >
                      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/12 text-emerald-300">
                        <Icon className="h-4 w-4" />
                      </div>
                      <h3 className="text-base font-semibold">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-white/60">{step.description}</p>
                    </Card>
                  );
                })}
              </div>
            </section>

            <Card className="overflow-hidden rounded-[28px] border-white/10 bg-white/[0.04] p-6 text-white shadow-none">
              <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                <p className="text-sm font-medium text-emerald-200">使用边界</p>
                <div className="mt-6 space-y-4">
                  {notes.map((note, index) => (
                    <div key={note} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-white/70">
                        {index + 1}
                      </div>
                      <p className="text-sm leading-6 text-white/62">{note}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-emerald-400/20 bg-emerald-400/8 p-5">
                <p className="text-sm font-medium text-emerald-200">下一步</p>
                <p className="mt-2 text-sm leading-6 text-emerald-50/80">
                  管理员登录后，可以直接在后台创建机器人记录，弹出 AstrBot 提供的二维码，并实时查看当前新增结果。
                </p>
                <Button asChild className="mt-5 h-11 rounded-full px-5 text-sm font-medium">
                  <Link to="/login">
                    进入管理员后台
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </Card>
          </div>
        </main>

        <footer className="border-t border-white/10 pt-6 text-sm text-white/35">
          该页面仅作为 AstrBot 机器人接入说明页存在。创建、扫码与记录查看均在管理员后台完成。
        </footer>
      </div>
    </div>
  );
}import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
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
  Fingerprint
} from "lucide-react";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { cn } from "../lib/utils";

function QrCanvas({ url }: { url: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (url && ref.current) QRCode.toCanvas(ref.current, url, { width: 232, margin: 0 });
  }, [url]);
  return <canvas ref={ref} className="block rounded-[1.2rem] scale-in-center" />;
}

const promiseCards = [
  {
    icon: EyeOff,
    title: "别人看不见你是谁",
    desc: "公开对话里不会展示你的昵称和头像，其他人只会看到系统随机分配的轻量符号。",
  },
  {
    icon: Lock,
    title: "不留痕迹，无需建群",
    desc: "一个游离于关系链之外的安全屋。随时扫码进入，倾诉后随时离开。",
  },
  {
    icon: Sparkles,
    title: "一句话，即刻被听见",
    desc: "对刚刚绑定的数字对象发一句话，它会替你把这份心事无声地递给这里的人。",
  },
];

const whisperSamples = [
  "今天看起来一切都正常，但其实我已经撑得有些累了。哪怕一次也好，我想被好好听见。",
  "有些话永远没法对熟人说，这里是不是真的没人认识我？",
];

export function JoinPage() {
  const [qrUrl, setQrUrl] = useState("");
    const [status, setStatus] = useState<"idle" | "loading" | "wait" | "scanned" | "connected" | "error">("idle");
    const [message, setMessage] = useState("");
    const wsRef = useRef<WebSocket | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startedRef = useRef(false);
    const [isMobile, setIsMobile] = useState(false);
  
    useEffect(() => {
      setIsMobile(typeof window !== "undefined" && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
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
      setMessage("正在为你打开深海入口...");
      setQrUrl("");
      try {
        const res = await fetch("/api/auth/scan/start", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "开启失败");
        setQrUrl(data.qr_url);
        setStatus("wait");
        setMessage(isMobile ? "请长按识别二维码" : "请用微信扫一扫");
        connectWS(data.session_id);
      } catch (err: any) {
        setStatus("error");
        setMessage(err.message || "深海波动，入口开启失败");
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
            setMessage("已识别到信号，请在手机确认");
          } else if (d.status === "refreshed") {
            setQrUrl(d.qr_url);
            setStatus("wait");
            setMessage("入口已刷新，请重新识别");
          } else if (d.status === "connected") {
            settled = true;
            if (d.session_token) {
              document.cookie = `session=${d.session_token}; path=/; max-age=${7 * 24 * 3600}; samesite=lax`;
            }
            ws.close();
            setStatus("connected");
            setMessage("你已成功潜入树洞");
          }
        } else if (d.event === "error") {
          settled = true;
          setMessage(d.message || "连接受阻，请重试");
          setStatus("error");
          ws.close();
        }
      };
      ws.onerror = () => { ws.close(); };
      ws.onclose = () => {
        if (settled) return;
        if (retries < MAX_RETRIES) {
          const delay = Math.min(1000 * 2 ** retries, 8000);
          setMessage("暗流涌动，正在为你重新稳定连接...");
          timerRef.current = setTimeout(() => connectWS(sessionID, retries + 1), delay);
        } else {
          setStatus("error");
          setMessage("连接已彻底断开，请重新开启");
        }
      };
    }
  
    const scanHint = status === "scanned"
      ? "只需在此确认，不再需要任何繁琐步骤。"
      : "超时会自动刷新，这是一扇会呼吸的门。";
  
    return (
      <div className="min-h-screen bg-[#0b1018] text-white">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-emerald-300/80">
                AstrBot Access Portal
              </p>
              <h1 className="mt-3 text-lg font-semibold tracking-tight text-white sm:text-xl">
                AstrBot 机器人接入门户
              </h1>
            </div>
            <Button
              asChild
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
            >
              <Link to="/login">管理员登录</Link>
            </Button>
          </header>
  
          <main className="flex flex-1 items-center py-12 sm:py-16">
            <div className="grid w-full gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
              <section className="space-y-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  公开引导页
                </div>
  
                <div className="space-y-5">
                  <h2 className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-5xl">
                    用一个极简入口，完成
                    <span className="block text-emerald-300">AstrBot 微信机器人接入</span>
                  </h2>
                  <p className="max-w-2xl text-base leading-8 text-white/62 sm:text-lg">
                    当前站点只承担两件事：对外说明接入流程，以及为管理员提供一个受控后台，
                    用来创建 AstrBot 机器人记录、打开二维码并查看当前接入状态。
                  </p>
                </div>
  
                <div className="grid gap-4 sm:grid-cols-3">
                  {steps.map((step) => {
                    const Icon = step.icon;
                    return (
                      <Card
                        key={step.title}
                        className="rounded-3xl border-white/10 bg-white/[0.04] p-5 text-white shadow-none"
                      >
                        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/12 text-emerald-300">
                          <Icon className="h-4 w-4" />
                        </div>
                        <h3 className="text-base font-semibold">{step.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-white/60">{step.description}</p>
                      </Card>
                    );
                  })}
                </div>
              </section>
  
              <Card className="overflow-hidden rounded-[28px] border-white/10 bg-white/[0.04] p-6 text-white shadow-none">
                <div className="rounded-3xl border border-white/10 bg-black/20 p-5">
                  <p className="text-sm font-medium text-emerald-200">使用边界</p>
                  <div className="mt-6 space-y-4">
                    {notes.map((note, index) => (
                      <div key={note} className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-white/70">
                          {index + 1}
                        </div>
                        <p className="text-sm leading-6 text-white/62">{note}</p>
                      </div>
                    ))}
                  </div>
                </div>
  
                <div className="mt-6 rounded-3xl border border-emerald-400/20 bg-emerald-400/8 p-5">
                  <p className="text-sm font-medium text-emerald-200">下一步</p>
                  <p className="mt-2 text-sm leading-6 text-emerald-50/80">
                    管理员登录后，可以直接在后台创建机器人记录，弹出 AstrBot 提供的二维码，并实时查看当前新增结果。
                  </p>
                  <Button asChild className="mt-5 h-11 rounded-full px-5 text-sm font-medium">
                    <Link to="/login">
                      进入管理员后台
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </Card>
            </div>
          </main>
  
          <footer className="border-t border-white/10 pt-6 text-sm text-white/35">
            该页面仅作为 AstrBot 机器人接入说明页存在。创建、扫码与记录查看均在管理员后台完成。
          </footer>
        </div>
      </div>
    );

  useEffect(() => {
    setIsMobile(typeof window !== "undefined" && ('ontouchstart' in window || navigator.maxTouchPoints > 0));
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
    setMessage("正在为你打开深海入口...");
    setQrUrl("");
    try {
      const res = await fetch("/api/auth/scan/start", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "开启失败");
      setQrUrl(data.qr_url);
      setStatus("wait");
      setMessage(isMobile ? "请长按识别二维码" : "请用微信扫一扫");
      connectWS(data.session_id);
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "深海波动，入口开启失败");
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
          setMessage("已识别到信号，请在手机确认");
        } else if (d.status === "refreshed") {
          setQrUrl(d.qr_url);
          setStatus("wait");
          setMessage("入口已刷新，请重新识别");
        } else if (d.status === "connected") {
          settled = true;
          if (d.session_token) {
            document.cookie = `session=${d.session_token}; path=/; max-age=${7 * 24 * 3600}; samesite=lax`;
          }
          ws.close();
          setStatus("connected");
          setMessage("你已成功潜入树洞");
        }
      } else if (d.event === "error") {
        settled = true;
        setMessage(d.message || "连接受阻，请重试");
        setStatus("error");
        ws.close();
      }
    };
    ws.onerror = () => { ws.close(); };
    ws.onclose = () => {
      if (settled) return;
      if (retries < MAX_RETRIES) {
        const delay = Math.min(1000 * 2 ** retries, 8000);
        setMessage("暗流涌动，正在为你重新稳定连接...");
        timerRef.current = setTimeout(() => connectWS(sessionID, retries + 1), delay);
      } else {
        setStatus("error");
        setMessage("连接已彻底断开，请重新开启");
      }
    };
  }

  const scanHint = status === "scanned"
    ? "只需在此确认，不再需要任何繁琐步骤。"
    : "超时会自动刷新，这是一扇会呼吸的门。";

  return (
    <>
      <style>{`
        @keyframes float-soft {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        @keyframes float-heavy {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-14px) rotate(1.5deg); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.6); opacity: 0.6; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes fade-up-hero {
          from { opacity: 0; transform: translateY(24px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.85); background: white; }
          to { opacity: 1; transform: scale(1); }
        }

        .animate-float-soft { animation: float-soft 6s cubic-bezier(0.25, 1, 0.5, 1) infinite; }
        .animate-float-heavy { animation: float-heavy 8s ease-in-out infinite; }
        .animate-pulse-ring { animation: pulse-ring 2.5s cubic-bezier(0.22, 1, 0.36, 1) infinite; }
        
        .fade-up-hero { opacity: 0; animation: fade-up-hero 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .stagger-1 { animation-delay: 150ms; }
        .stagger-2 { animation-delay: 250ms; }
        .stagger-3 { animation-delay: 350ms; }
        .stagger-4 { animation-delay: 450ms; }
        
        .scale-in-center { animation: scale-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        
        /* 绚丽毛玻璃质感增强 */
        .glass-panel {
          background: linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.01) 100%);
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          border: 1px solid rgba(255,255,255,0.08);
          box-shadow: 0 24px 60px -12px rgba(0,0,0,0.5);
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .glass-panel-hover:hover {
          background: linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%);
          border-color: rgba(16, 185, 129, 0.2);
          transform: translateY(-4px);
          box-shadow: 0 32px 70px -12px rgba(16, 185, 129, 0.15);
        }
        
        .gradient-text-emerald {
          background: linear-gradient(135deg, #ffffff 12%, #7dd3fc 44%, #6ee7b7 88%);
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        
        /* 交互平滑度 */
        html { scroll-behavior: smooth; }
      `}</style>
      <div className="relative min-h-screen overflow-x-hidden bg-[#02050f] text-white font-sans selection:bg-emerald-500/30">
        
        {/* 背景光影层: 会呼吸的氛围 */}
        <div className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.18),transparent_40%),radial-gradient(circle_at_80%_15%,rgba(56,189,248,0.12),transparent_35%),radial-gradient(circle_at_50%_90%,rgba(20,184,166,0.15),transparent_45%)] opacity-80 mix-blend-screen" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:80px_80px] opacity-20 [mask-image:radial-gradient(ellipse_100%_100%_at_center,black,transparent_75%)]" />
          
          {/* 动态光晕 */}
          <div className="animate-float-heavy absolute -left-10 top-20 h-64 w-64 rounded-full bg-emerald-400/10 blur-[80px] sm:bg-emerald-300/10" />
          <div className="animate-float-heavy absolute right-[5%] top-10 h-80 w-80 rounded-full bg-cyan-400/10 blur-[100px] sm:bg-cyan-300/10" style={{ animationDelay: '-4s' }} />
        </div>

        {/* 顶部 Header：克制、极简 */}
        <header className="relative z-10 w-full pt-8 px-5 sm:px-8 lg:px-12 fade-up-hero">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <div className="flex items-center gap-3 backdrop-blur-md bg-white/[0.03] border border-white/5 rounded-full px-4 py-2 hover:bg-white/[0.06] transition-colors duration-500 cursor-default">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/20 ring-1 ring-emerald-400/30">
                <MoonStar className="h-3.5 w-3.5 text-emerald-300" />
              </div>
              <span className="text-[13px] font-medium tracking-wide text-white/80">今晚的树洞</span>
            </div>
          </div>
        </header>

        <main className="relative z-10 mx-auto flex flex-col-reverse max-w-7xl gap-y-12 px-5 pb-20 pt-10 sm:px-8 lg:flex-row lg:items-start lg:justify-between lg:gap-x-16 lg:px-12 lg:pb-32 lg:pt-16">
          
          {/* 左侧：文字说明与核心愿景 */}
          <section className="flex-1 space-y-10 lg:pt-4 w-full max-w-3xl">
            
            {/* Title Block */}
            <div className="space-y-6">
              <div className="fade-up-hero stagger-1 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-1.5 backdrop-blur-xl shadow-[0_0_20px_rgba(52,211,153,0.1)] hover:bg-emerald-400/20 transition-all duration-300">
                <Sparkles className="h-3.5 w-3.5 text-emerald-300 animate-pulse" />
                <span className="text-xs font-semibold tracking-[0.2em] text-emerald-300/90 uppercase">Absolute Privacy</span>
              </div>

              <h1 className="fade-up-hero stagger-2 text-4xl font-bold leading-[1.25] tracking-[-0.04em] text-white sm:text-[3.2rem] lg:text-[4rem]">
                把今晚
                <span className="block gradient-text-emerald">
                  无法开口的心事
                </span>
                沉入这片无声的海
              </h1>
              
              <p className="fade-up-hero stagger-3 max-w-[480px] text-[15px] leading-[1.8] text-white/50 sm:text-[17px] sm:leading-[1.8]">
                这里不是群聊，没有围观的目光。<br className="hidden sm:block" />
                卸下白天的面具，给情绪留一个绝对安全的出口。别人只会听见心事本身，而不知道你是谁。
              </p>
            </div>

            {/* 浮动卡片 - 碎片心事 */}
            <div className="fade-up-hero stagger-4 grid gap-5 sm:grid-cols-2 relative lg:pr-8">
              {whisperSamples.map((sample, index) => (
                <div
                  key={sample}
                  className={cn(
                    "glass-panel p-6 rounded-[2rem]",
                    index === 0 ? "animate-float-soft" : "animate-float-soft [animation-delay:-3s] sm:translate-y-10"
                  )}
                >
                  <div className="mb-4 flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 border border-white/10 group-hover:scale-110 transition-transform">
                      <MessageCircle className="h-3.5 w-3.5 text-emerald-300/80" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.26em] text-white/40">Fragment</span>
                  </div>
                  <p className="text-[14px] leading-7 text-white/80 font-normal">“{sample}”</p>
                </div>
              ))}
            </div>

            {/* 三大承诺保障区 */}
            <div className="fade-up-hero stagger-4 space-y-5 lg:pr-8 pt-8 lg:pt-16">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-300/80 pl-1">
                <Shield className="h-4 w-4" /> 我们对你的承诺
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                {promiseCards.map((item) => (
                  <div key={item.title} className="glass-panel glass-panel-hover group p-6 rounded-[1.6rem] flex flex-col justify-start">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/10 border border-emerald-400/20 text-emerald-300 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3">
                      <item.icon className="h-6 w-6" />
                    </div>
                    <h2 className="text-[15px] font-semibold text-white/90 mb-2.5">{item.title}</h2>
                    <p className="text-[13px] leading-relaxed text-white/50">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

          </section>

          {/* 右侧：交互绑定卡片 (Sticky 悬浮) */}
          <aside className="fade-up-hero stagger-3 w-full max-w-[400px] lg:shrink-0 lg:sticky lg:top-12 z-20">
            <Card className="glass-panel relative w-full overflow-hidden rounded-[2.5rem] border-white/10 bg-black/20 p-8 shadow-[0_30px_100px_-20px_rgba(0,0,0,0.8)] before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top,rgba(110,231,183,0.1),transparent_50%)] hover:shadow-[0_45px_120px_-20px_rgba(0,0,0,0.85)] transition-shadow duration-700">
              <div className="relative z-10 flex flex-col h-full">
                
                {/* 头部标题 */}
                <div className="mb-8 flex items-start justify-between">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                       <ScanLine className="h-4 w-4 text-emerald-400" />
                       <h2 className="text-[22px] font-semibold tracking-tight text-white/90">入场凭证</h2>
                    </div>
                    <p className="text-[13px] text-white/40">{isMobile ? "长按识别，静悄悄地加入" : "扫一扫，静悄悄地加入"}</p>
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10 text-emerald-300 hover:rotate-12 transition-transform">
                    <Fingerprint className="h-5 w-5" />
                  </div>
                </div>

                {/* 核心连接状态展示区 */}
                {status === "connected" ? (
                  <div className="flex flex-col items-center justify-center py-6 animate-fade-up">
                    <div className="relative mb-6">
                      <div className="absolute inset-0 rounded-full bg-emerald-400/30 blur-2xl animate-pulse-ring" />
                      <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-400/20 to-emerald-300/5 ring-1 ring-emerald-300/30 shadow-[0_0_40px_rgba(52,211,153,0.3)] hover:scale-105 transition-transform duration-500 cursor-pointer">
                        <CheckCircle2 className="h-10 w-10 text-emerald-300" />
                      </div>
                    </div>
                    <h3 className="text-[22px] font-semibold text-white/90 mb-3">你已成功潜入</h3>
                    <p className="text-center text-[13.5px] leading-relaxed text-white/50 mb-8 max-w-[280px]">
                      微信端入口已初步确认，<br/>现在回到微信给 Bot 发送新消息，它就能把你的心事以匿名的状态静悄悄记录。
                    </p>
                    
                    <Button
                      variant="outline"
                      onClick={startScan}
                      className="w-full h-12 rounded-[1rem] bg-white/5 border-white/10 text-white/70 hover:bg-emerald-400/10 hover:text-emerald-300 hover:border-emerald-400/30 transition-all duration-300"
                    >
                      重新绑定或刷新入口
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col flex-1">
                    
                    {/* 二维码视窗 */}
                    <div className="relative w-full aspect-square max-w-[260px] mx-auto mb-8 rounded-[2rem] bg-gradient-to-b from-white/[0.08] to-white/[0.02] p-[1px] shadow-2xl">
                      <div className="absolute inset-0 rounded-[2rem] bg-black/60 backdrop-blur-sm" />
                      <div className="relative flex h-full w-full items-center justify-center rounded-[2rem] bg-[#0c0f1a]/80 p-4">
                        
                        {(status === "wait" || status === "scanned") && qrUrl ? (
                          <div className="relative overflow-hidden flex items-center justify-center bg-white rounded-[1.2rem] shadow-[0_0_30px_rgba(255,255,255,0.15)] ring-4 ring-white/10 transition-transform duration-500 hover:scale-[1.03]">
                             <QrCanvas url={qrUrl} />
                             {status === "scanned" && (
                               <div className="absolute inset-0 bg-emerald-900/85 backdrop-blur-md flex flex-col items-center justify-center scale-in-center">
                                 <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-2 animate-bounce" style={{animationDuration: '2.5s'}} />
                                 <span className="text-[13px] font-medium tracking-widest text-emerald-100">请在手机确认</span>
                               </div>
                             )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center text-center space-y-4">
                            {status === "error" ? (
                              <div className="scale-in-center px-4">
                                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 mb-3 hover:bg-rose-500/20 transition-colors">
                                  <X className="h-6 w-6 text-rose-400" />
                                </div>
                                <p className="text-[13px] text-white/60 mb-5">{message}</p>
                                <Button
                                  variant="outline"
                                  onClick={startScan}
                                  size="sm"
                                  className="h-10 px-5 rounded-full bg-white/5 border-white/10 hover:bg-white/10 text-white/80 transition-colors"
                                >
                                  重新开启网络
                                </Button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center text-emerald-400/60 transition-opacity">
                                <Loader2 className="h-8 w-8 animate-spin mb-4" />
                                <span className="text-[13px] tracking-wide opacity-80">{message || "生成深海链接..."}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 下方状态词与按钮 */}
                    <div className="mt-auto">
                      {status !== "error" && (
                        <div className="flex flex-col items-center text-center space-y-2 mb-6 animate-fade-up">
                          <div className="flex items-center justify-center gap-2 text-[14px] font-medium text-emerald-100 hover:text-emerald-300 transition-colors">
                             <QrCode className="h-4 w-4 text-emerald-400" />
                             {message || (isMobile ? "长按识别专属二维码" : "用微信扫描专属入口")}
                          </div>
                          <p className="text-[12px] leading-relaxed text-white/40 max-w-[200px]">
                            {scanHint}
                          </p>
                        </div>
                      )}

                      <div className="w-full flex items-center justify-between px-2 pt-5 border-t border-white/5">
                        <span className="text-[11px] text-white/30 uppercase tracking-widest font-semibold flex items-center gap-1.5 opacity-80 hover:opacity-100 transition-opacity">
                          <Shield className="h-3 w-3" /> Secure entry
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={startScan}
                          disabled={status === "loading" || status === "scanned"}
                          className="h-8 text-[12px] rounded-full text-white/40 hover:text-white/80 hover:bg-white/5 px-3 transition-colors"
                        >
                          <RefreshCw className={cn("h-3 w-3 mr-1.5", status === "loading" && "animate-spin")} />
                          刷新入口
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </aside>

        </main>
        
        {/* Footer */}
        <footer className="relative z-10 w-full text-center pb-12 pt-6">
          <p className="text-[11px] text-white/20 select-none uppercase tracking-[0.3em] font-semibold hover:text-white/40 transition-colors cursor-default">
            Night Whisper Room &middot; Leave no trace
          </p>
        </footer>
      </div>
    </>
  );
}
