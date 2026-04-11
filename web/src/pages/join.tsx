import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Lock, Loader2, CheckCircle2, Moon } from "lucide-react";
import { api, type AstrBotOnboardState } from "../lib/api";

type ViewState = "idle" | "loading" | "waiting" | "success" | "error";
const successStatuses = new Set(["confirmed", "connected", "configured"]);

function QrCanvas({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!value || !ref.current) return;
    QRCode.toCanvas(ref.current, value, {
      width: 220,
      margin: 2,
      color: { dark: "#064e3b", light: "#ffffff00" }, // emerald-900 and transparent
    });
  }, [value]);
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label="扫码登录二维码"
      className="relative z-10 rounded-2xl drop-shadow-sm transition-transform duration-500 hover:scale-[1.02]"
    />
  );
}

export function JoinPage() {
  const [viewState, setViewState] = useState<ViewState>("idle");
  const [platformId, setPlatformId] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [message, setMessage] = useState("");
  const [upstreamStatus, setUpstreamStatus] = useState("initializing");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

  // 3D Card Hover — direct DOM manipulation, no React re-renders
  const cardRef = useRef<HTMLDivElement>(null);

  // Background tunnel + card tilt — unified RAF, no transition fighting
  const bgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let rafId = 0;
    let scheduled = false;
    let mx = 0, my = 0;

    const tick = () => {
      scheduled = false;
      if (bgRef.current) {
        bgRef.current.style.transform = `rotateX(${my * 10}deg) rotateY(${mx * -10}deg) translateZ(300px)`;
      }
      if (cardRef.current) {
        cardRef.current.style.transform = `rotateX(${my * -6}deg) rotateY(${mx * 6}deg)`;
      }
    };

    const handleMouse = (e: MouseEvent) => {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
      if (!scheduled) { scheduled = true; rafId = requestAnimationFrame(tick); }
    };

    const handleLeave = () => {
      mx = 0; my = 0;
      if (!scheduled) { scheduled = true; rafId = requestAnimationFrame(tick); }
    };

    window.addEventListener("mousemove", handleMouse, { passive: true });
    document.addEventListener("mouseleave", handleLeave);
    return () => {
      window.removeEventListener("mousemove", handleMouse);
      document.removeEventListener("mouseleave", handleLeave);
      cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
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
    if (data.qr_url) setQrUrl(data.qr_url);

    if (successStatuses.has(nextStatus)) {
      cleanupPolling();
      setViewState("success");
      setMessage("登录成功，欢迎坠入树洞。");
      return;
    }

    setViewState("waiting");
    setMessage(
      nextStatus === "qr_pending"
        ? "正在开启引力漩涡..."
        : nextStatus === "expired"
          ? "通道已折叠，正在重构空间..."
          : "请扫码沉入这片静谧之境",
    );
    schedulePoll(data.platform_id, data.poll_interval_ms);
  }

  async function startOnboarding() {
    cleanupPolling();
    setViewState("loading");
    setPlatformId("");
    setQrUrl("");
    setUpstreamStatus("initializing");
    setMessage("坠入深空...");
    try {
      const data = await api.astrBotOnboardStart();
      applyState(data);
    } catch (error: any) {
      setViewState("error");
      setMessage(error.message || "空间连接失败，请重试。");
    }
  }

  async function refreshStatus(currentPlatformId: string) {
    try {
      const data = await api.astrBotOnboardStatus(currentPlatformId);
      applyState(data);
    } catch (error: any) {
      setViewState("error");
      setMessage(error.message || "引力波中断。");
    }
  }

  return (
    <div
      className="relative min-h-[100dvh] w-full bg-[#050505] text-emerald-50 overflow-hidden selection:bg-emerald-500/30"
      style={{ perspective: "1000px" }}
    >
      {/* Mobile-only lightweight background (prevents GPU crash from massive 3D layers) */}
      <div className="fixed inset-0 z-0 pointer-events-none lg:hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,185,129,0.15)_0%,_transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#059669_1px,transparent_1px),linear-gradient(to_bottom,#059669_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-[0.08]" />
      </div>

      {/* Outer Static Camera Body — desktop only (4 panels need >512MB GPU memory) */}
      <div 
        className="fixed inset-0 z-0 pointer-events-none overflow-hidden bg-[#010202] hidden lg:block"
        style={{ perspective: "1000px", contain: "layout style paint" }}
      >
        {/* Inner 3D World (Rotated by mouse) */}
        <div
          ref={bgRef}
          className="absolute left-1/2 top-1/2 w-0 h-0"
          style={{ transformStyle: "preserve-3d", willChange: "transform" }}
        >
          {/* Deep Tunnel Void Background */}
          <div 
            className="absolute left-1/2 top-1/2 w-[200vw] h-[200vh] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-950/40 via-[#050505] to-[#010202]"
            style={{ transform: "translateZ(-2000px)" }}
          />

          {/* Animated Cyber-Grid Floor */}
          <div 
            className="absolute left-1/2 top-1/2 w-[200vw] h-[400vh] origin-center opacity-70 overflow-hidden"
            style={{ transform: "translate(-50%, -50%) rotateX(-90deg) translateZ(40vh)" }}
          >
            <div className="absolute -inset-[8rem] bg-[linear-gradient(to_right,#059669_2px,transparent_2px),linear-gradient(to_bottom,#059669_2px,transparent_2px)] bg-[size:8rem_8rem] [mask-image:linear-gradient(to_top,black_40%,transparent_100%)] will-change-transform animate-[grid-z_0.4s_linear_infinite]" />
          </div>

          {/* Animated Cyber-Grid Ceiling */}
          <div 
            className="absolute left-1/2 top-1/2 w-[200vw] h-[400vh] origin-center opacity-30 overflow-hidden"
            style={{ transform: "translate(-50%, -50%) rotateX(90deg) translateZ(60vh)" }}
          >
            <div className="absolute -inset-[8rem] bg-[linear-gradient(to_right,#14b8a6_2px,transparent_2px),linear-gradient(to_bottom,#14b8a6_2px,transparent_2px)] bg-[size:8rem_8rem] [mask-image:linear-gradient(to_bottom,black_40%,transparent_100%)] will-change-transform animate-[grid-z_0.4s_linear_infinite_reverse]" />
          </div>

          {/* Animated Cyber-Grid Left Wall */}
          <div 
            className="absolute left-1/2 top-1/2 w-[400vh] h-[200vh] origin-center opacity-50 overflow-hidden"
            style={{ transform: "translate(-50%, -50%) rotateY(-90deg) translateZ(60vw)" }}
          >
            <div className="absolute -inset-[8rem] bg-[linear-gradient(to_right,#059669_2px,transparent_2px),linear-gradient(to_bottom,#059669_2px,transparent_2px)] bg-[size:8rem_8rem] [mask-image:linear-gradient(to_right,black_40%,transparent_100%)] will-change-transform animate-[grid-h_0.4s_linear_infinite]" />
          </div>

          {/* Animated Cyber-Grid Right Wall */}
          <div 
            className="absolute left-1/2 top-1/2 w-[400vh] h-[200vh] origin-center opacity-50 overflow-hidden"
            style={{ transform: "translate(-50%, -50%) rotateY(90deg) translateZ(60vw)" }}
          >
            <div className="absolute -inset-[8rem] bg-[linear-gradient(to_right,#059669_2px,transparent_2px),linear-gradient(to_bottom,#059669_2px,transparent_2px)] bg-[size:8rem_8rem] [mask-image:linear-gradient(to_left,black_40%,transparent_100%)] will-change-transform animate-[grid-h_0.4s_linear_infinite_reverse]" />
          </div>
        </div>
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-12 lg:px-8">
        {/* Main Grid: Responsive stacked on mobile, side-by-side on PC */}
        <main className="grid gap-12 lg:gap-24 lg:grid-cols-[1fr_420px] items-center">
          {/* Content Column */}
          <section className="space-y-10 max-w-xl z-20">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-xs font-semibold tracking-widest uppercase backdrop-blur-md shadow-[0_0_20px_rgba(16,185,129,0.15)] animate-[fade-in_1s_ease-out]">
              <Moon className="w-4 h-4" />
              <span>静谧之境 · 自由表达</span>
            </div>

            <div className="space-y-8 animate-[fade-in_1.2s_ease-out]">
              <h1 className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-[0.9]" style={{ fontFamily: "'Noto Serif SC Variable', serif" }}>
                <span className="text-transparent bg-clip-text bg-gradient-to-b from-white via-emerald-200 to-emerald-900 drop-shadow-[0_0_30px_rgba(16,185,129,0.5)]">星空</span><span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-300">树洞</span><span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-emerald-400">.</span>
              </h1>
              <p className="text-xl leading-relaxed text-emerald-100/70 font-light mix-blend-screen max-w-md border-l-4 border-emerald-500 pl-4">
                在这片引力深渊，感受极具张力的连接。
                <br className="hidden sm:block" />
                放下白日的疲惫，诉说内心的声音。在这里，你可以自由穿梭。
              </p>
            </div>

            <div className="space-y-6 pt-4 animate-[fade-in_1.4s_ease-out]">
              <div className="flex items-start gap-4 group">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-emerald-400 backdrop-blur-sm border border-white/10 shadow-[inset_0_0_15px_rgba(255,255,255,0.05)] group-hover:bg-white/10 transition-colors duration-500 font-bold">
                  1
                </div>
                <div className="pt-1.5 flex-1">
                  <h3 className="text-lg font-bold text-white tracking-wide">
                    准备终端
                  </h3>
                  <p className="text-emerald-100/60 leading-relaxed text-sm mt-1 font-light">
                    请在手机上打开微信应用。
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 group">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-emerald-400 backdrop-blur-sm border border-white/10 shadow-[inset_0_0_15px_rgba(255,255,255,0.05)] group-hover:bg-white/10 transition-colors duration-500 font-bold">
                  2
                </div>
                <div className="pt-1.5 flex-1">
                  <h3 className="text-lg font-bold text-white tracking-wide">
                    捕获引力波
                  </h3>
                  <p className="text-emerald-100/60 leading-relaxed text-sm mt-1 font-light">
                    使用软件的「扫一扫」功能，扫描右侧的动态连接凭证。
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 group">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-emerald-400 backdrop-blur-sm border border-white/10 shadow-[inset_0_0_15px_rgba(255,255,255,0.05)] group-hover:bg-white/10 transition-colors duration-500 font-bold">
                  3
                </div>
                <div className="pt-1.5 flex-1">
                  <h3 className="text-lg font-bold text-white tracking-wide">
                    确认跃迁
                  </h3>
                  <p className="text-emerald-100/60 leading-relaxed text-sm mt-1 font-light">
                    在手机端确认授权登录，信道建立后即可坠入树洞。
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 group">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/5 text-emerald-400 backdrop-blur-sm border border-white/10 shadow-[inset_0_0_15px_rgba(255,255,255,0.05)] group-hover:bg-white/10 transition-colors duration-500 font-bold">
                  4
                </div>
                <div className="pt-1.5 flex-1">
                  <h3 className="text-lg font-bold text-white tracking-wide">
                    激活信道
                  </h3>
                  <p className="text-emerald-100/60 leading-relaxed text-sm mt-1 font-light">
                    向机器人主动发送一条消息以激活通信链路，之后即可正常收发。
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Action Column: 3D Tilt Card */}
          <aside className="relative flex flex-col items-center z-30" style={{ perspective: "1500px" }}>
            <div
              ref={cardRef}
              className="w-full relative rounded-[3.5rem] bg-[#020604]/60 backdrop-blur-md border-2 border-emerald-500/20 p-10 sm:p-12 shadow-[0_30px_100px_-20px_rgba(16,185,129,0.4)] flex flex-col items-center"
              style={{ willChange: "transform", transition: "transform 0.15s ease-out" }}
            >
              {/* Aggressive Edge Glow */}
              <div
                className="absolute inset-0 rounded-[3.5rem] pointer-events-none opacity-100 bg-gradient-to-br from-emerald-400/30 via-transparent to-cyan-500/20 mix-blend-overlay"
                style={{ transform: "translateZ(1px)" }}
              ></div>

              <div
                className="mb-10 w-full text-center"
                style={{ transform: "translateZ(40px)" }}
              >
                <div className="mx-auto w-16 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent mb-6 rounded-full"></div>
                <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-emerald-200 tracking-tight drop-shadow-lg uppercase">
                  建立连接
                </h2>
                <p className="text-emerald-300/80 mt-3 font-medium tracking-widest text-xs">
                  AWAITING DEVICE SYNC
                </p>
              </div>

              {/* QR Container with extreme 3D depth */}
              <div
                role="status"
                aria-live="polite"
                className="flex rounded-[3rem] border border-emerald-500/30 bg-[#020604] min-h-[300px] w-full items-center justify-center relative mb-10 shadow-[inset_0_0_80px_rgba(16,185,129,0.3)] overflow-hidden"
                style={{ transform: "translateZ(80px)" }}
              >
                {/* 悬浮强光扫描 */}
                {qrUrl && viewState !== "success" && (
                  <div className="absolute inset-0 pointer-events-none z-20">
                    <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-emerald-300 to-transparent shadow-[0_0_30px_5px_rgba(16,185,129,0.8)] opacity-90 animate-[scan_2s_ease-in-out_infinite]"></div>
                  </div>
                )}

                {viewState === "loading" || viewState === "idle" ? (
                  <div className="flex flex-col items-center justify-center p-12">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-full blur-2xl bg-emerald-500/40 animate-pulse"></div>
                      <Loader2 className="relative h-16 w-16 animate-spin text-emerald-400 drop-shadow-[0_0_20px_rgba(16,185,129,0.8)]" />
                    </div>
                    <p className="mt-8 text-emerald-300 tracking-[0.2em] font-mono text-xl animate-pulse font-bold">
                      {message}
                    </p>
                  </div>
                ) : viewState === "error" ? (
                  <div className="flex flex-col items-center gap-5 text-center px-6">
                    <div className="rounded-3xl bg-red-500/10 p-5 text-red-400 border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.15)]">
                      <Lock className="h-8 w-8" />
                    </div>
                    <p className="text-sm text-red-200 font-light leading-relaxed">
                      {message}
                    </p>
                    <button
                      onClick={() => void startOnboarding()}
                      aria-label="重新建立连接"
                      className="mt-3 px-8 py-4 bg-white/10 text-white rounded-full text-sm font-medium hover:bg-white/20 transition-all shadow-[0_0_20px_rgba(255,255,255,0.05)] hover:shadow-[0_0_30px_rgba(255,255,255,0.1)] border border-white/10 active:scale-95"
                    >
                      重新凝结
                    </button>
                  </div>
                ) : viewState === "success" ? (
                  <div className="flex flex-col items-center gap-6 text-center px-4">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-full blur-xl bg-emerald-500/30 animate-[ping_2s_ease-out_infinite]"></div>
                      <div className="relative rounded-full bg-emerald-500 p-6 text-black border border-emerald-300 shadow-[0_0_40px_rgba(16,185,129,0.4)] transition-transform duration-500 hover:scale-110">
                        <CheckCircle2 className="h-10 w-10" strokeWidth={2.5} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-lg font-bold text-white tracking-widest drop-shadow-md">
                        维度已融合
                      </p>
                      <p className="text-sm text-emerald-200/80 font-light">
                        {message}
                      </p>
                    </div>
                  </div>
                ) : qrUrl ? (
                  <div className="p-3 bg-emerald-50 rounded-[2.5rem] shadow-[0_0_80px_rgba(16,185,129,0.5)] border-4 border-emerald-400 transition-all duration-500 hover:shadow-[0_0_120px_rgba(16,185,129,0.8)] hover:scale-105">
                    <QrCanvas value={qrUrl} />
                  </div>
                ) : null}
              </div>

              {/* Status Bar - Bolder Treatment */}
              <div
                className="w-full flex items-center justify-between text-sm text-emerald-200 font-bold bg-[#020604] rounded-full px-8 py-5 border-2 border-emerald-500/30 shadow-[0_15px_30px_-5px_rgba(16,185,129,0.3)]"
                style={{ transform: "translateZ(60px)" }}
              >
                <div className="flex items-center gap-4">
                  <span className="relative flex h-3 w-3">
                    <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-100${viewState !== "success" ? " animate-ping" : ""}`}></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-300 shadow-[0_0_15px_rgba(16,185,129,1)]"></span>
                  </span>
                  <span className="font-mono tracking-widest uppercase">
                    {upstreamStatus}
                  </span>
                </div>
                <div className="truncate max-w-[120px] font-mono text-emerald-500/50">
                  {platformId || "----------"}
                </div>
              </div>
            </div>
          </aside>
        </main>
      </div>

    </div>
  );
}
