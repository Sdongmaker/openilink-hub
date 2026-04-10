import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  Bot,
  CheckCircle2,
  Loader2,
  QrCode,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { api, type AstrBotOnboardState } from "../lib/api";

type ViewState = "idle" | "loading" | "waiting" | "success" | "error";

const successStatuses = new Set(["confirmed", "connected", "configured"]);

function statusMessage(status: string, isMobile: boolean) {
  switch (status) {
    case "initializing":
      return "正在初始化 AstrBot 二维码...";
    case "qr_pending":
      return "记录已创建，正在等待二维码就绪...";
    case "expired":
      return "二维码已过期，正在尝试刷新...";
    case "wait":
      return isMobile ? "请长按识别二维码" : "请使用微信扫码完成接入";
    default:
      return isMobile ? "请长按识别二维码" : "请使用微信扫码完成接入";
  }
}

function QrCanvas({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!value || !ref.current) return;
    QRCode.toCanvas(ref.current, value, { width: 260, margin: 1 });
  }, [value]);

  return <canvas ref={ref} className="block rounded-3xl" />;
}

function QrDisplay({ value }: { value: string }) {
  const [mode, setMode] = useState<"image" | "canvas">("image");

  useEffect(() => {
    if (value.startsWith("data:image/") || value.startsWith("http://") || value.startsWith("https://")) {
      setMode("image");
      return;
    }
    setMode("canvas");
  }, [value]);

  if (mode === "image") {
    return (
      <img
        src={value}
        alt="AstrBot onboarding QR"
        className="h-[260px] w-[260px] rounded-3xl border border-black/5 bg-white object-contain p-3"
        onError={() => setMode("canvas")}
      />
    );
  }

  return <QrCanvas value={value} />;
}

export function JoinPage() {
  const [viewState, setViewState] = useState<ViewState>("idle");
  const [platformId, setPlatformId] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [message, setMessage] = useState("");
  const [upstreamStatus, setUpstreamStatus] = useState("initializing");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0));
    if (!startedRef.current) {
      startedRef.current = true;
      void startOnboarding();
    }
    return () => cleanupPolling();
  }, []);

  function cleanupPolling() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function schedulePoll(nextPlatformId: string, intervalMs?: number) {
    cleanupPolling();
    timerRef.current = setTimeout(() => {
      void refreshStatus(nextPlatformId);
    }, intervalMs ?? 2000);
  }

  function applyState(data: AstrBotOnboardState) {
    const nextStatus = data.status || "initializing";
    setPlatformId(data.platform_id);
    setUpstreamStatus(nextStatus);
    if (data.qr_url) {
      setQrUrl(data.qr_url);
    }

    if (successStatuses.has(nextStatus)) {
      cleanupPolling();
      setViewState("success");
      setMessage("AstrBot 机器人接入完成，现在可以返回 AstrBot 使用。");
      return;
    }

    setViewState("waiting");
    setMessage(statusMessage(nextStatus, isMobile));
    schedulePoll(data.platform_id, data.poll_interval_ms);
  }

  async function startOnboarding() {
    cleanupPolling();
    setViewState("loading");
    setPlatformId("");
    setQrUrl("");
    setUpstreamStatus("initializing");
    setMessage("正在创建新的 AstrBot 记录...");

    try {
      const data = await api.astrBotOnboardStart();
      applyState(data);
    } catch (error: any) {
      setViewState("error");
      setMessage(error.message || "AstrBot 引导开启失败");
    }
  }

  async function refreshStatus(currentPlatformId: string) {
    try {
      const data = await api.astrBotOnboardStatus(currentPlatformId);
      applyState(data);
    } catch (error: any) {
      setViewState("error");
      setMessage(error.message || "二维码状态获取失败");
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#1f2937_0%,#0f172a_35%,#020617_100%)] px-6 py-8 text-white sm:px-8 lg:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col justify-between gap-8">
        <header className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-emerald-300/80">AstrBot Public Onboarding</p>
            <h1 className="mt-1 text-lg font-semibold tracking-tight text-white sm:text-xl">AstrBot 机器人接入</h1>
          </div>
        </header>

        <main className="grid flex-1 gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <section className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100">
              <ShieldCheck className="h-4 w-4" />
              仅保留公开扫码引导
            </div>

            <div className="space-y-4">
              <h2 className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.04em] text-white sm:text-5xl">
                打开页面后直接扫码，
                <span className="block text-emerald-300">完成 AstrBot 新机器人接入</span>
              </h2>
              <p className="max-w-2xl text-base leading-8 text-white/65 sm:text-lg">
                这是当前项目唯一保留的功能。页面会自动创建一条新的 AstrBot 记录，拉取二维码，并持续刷新状态直到扫码完成。
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="rounded-3xl border-white/10 bg-white/[0.04] p-5 text-white shadow-none">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/12 text-emerald-300">
                  <ScanLine className="h-4 w-4" />
                </div>
                <h3 className="text-base font-semibold">自动创建记录</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">进入页面后直接向 AstrBot 发起 create 请求，不再经过后台页面。</p>
              </Card>

              <Card className="rounded-3xl border-white/10 bg-white/[0.04] p-5 text-white shadow-none">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/12 text-emerald-300">
                  <QrCode className="h-4 w-4" />
                </div>
                <h3 className="text-base font-semibold">自动获取二维码</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">二维码状态会持续轮询刷新，直到扫码确认成功。</p>
              </Card>

              <Card className="rounded-3xl border-white/10 bg-white/[0.04] p-5 text-white shadow-none">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/12 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <h3 className="text-base font-semibold">完成后即可返回</h3>
                <p className="mt-2 text-sm leading-6 text-white/60">扫码完成后页面只显示成功态，不再暴露任何后台或记录管理能力。</p>
              </Card>
            </div>
          </section>

          <Card className="rounded-[32px] border-white/10 bg-white/[0.05] p-6 text-white shadow-[0_24px_80px_-20px_rgba(0,0,0,0.65)] sm:p-8">
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-300/80">扫码入口</p>
                  <h3 className="mt-2 text-2xl font-semibold tracking-tight">AstrBot onboarding</h3>
                </div>
                <Button variant="outline" onClick={() => void startOnboarding()} className="rounded-full border-white/10 bg-white/5 text-white hover:bg-white/10">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  重新开始
                </Button>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/25 p-5">
                <div className="mx-auto flex min-h-[300px] items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-white/5 p-4">
                  {viewState === "loading" || viewState === "idle" ? (
                    <div className="flex flex-col items-center gap-4 text-center text-white/70">
                      <Loader2 className="h-8 w-8 animate-spin text-emerald-300" />
                      <p className="text-sm">{message}</p>
                    </div>
                  ) : viewState === "error" ? (
                    <div className="flex max-w-[260px] flex-col items-center gap-4 text-center text-white/70">
                      <TriangleAlert className="h-10 w-10 text-rose-300" />
                      <p className="text-sm leading-6">{message}</p>
                      <Button onClick={() => void startOnboarding()} className="rounded-full">重试</Button>
                    </div>
                  ) : viewState === "success" ? (
                    <div className="flex max-w-[280px] flex-col items-center gap-4 text-center">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                        <CheckCircle2 className="h-10 w-10" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-xl font-semibold text-white">接入完成</p>
                        <p className="text-sm leading-6 text-white/65">{message}</p>
                      </div>
                    </div>
                  ) : qrUrl ? (
                    <QrDisplay value={qrUrl} />
                  ) : (
                    <div className="flex flex-col items-center gap-3 text-center text-white/70">
                      <Loader2 className="h-8 w-8 animate-spin text-emerald-300" />
                      <p className="text-sm">{message}</p>
                    </div>
                  )}
                </div>

                <div className="mt-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-white/90">
                    <QrCode className="h-4 w-4 text-emerald-300" />
                    {message || "等待二维码状态"}
                  </div>
                  <div className="grid gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/60 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-white/35">当前状态</p>
                      <p className="mt-2 font-mono text-white/80">{upstreamStatus}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-white/35">Platform ID</p>
                      <p className="mt-2 break-all font-mono text-white/80">{platformId || "等待创建"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </main>

        <footer className="pt-2 text-center text-xs uppercase tracking-[0.28em] text-white/28">
          Only public onboarding remains
        </footer>
      </div>
    </div>
  );
}
