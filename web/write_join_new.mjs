import fs from 'fs';

const code = `import { useEffect, useRef, useState, useCallback } from "react";
import QRCode from "qrcode";
import { Leaf, Lock, Shield, Wind, Loader2, CheckCircle2, Moon } from "lucide-react";
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
      color: { dark: "#064e3b", light: "#ffffff00" },
    });
  }, [value]);
  return (
    <canvas 
      ref={ref} 
      className="relative z-10 rounded-2xl drop-shadow-sm transition-transform duration-500 hover:scale-[1.02]" 
    />
  );
}

export function JoinPage() {
  const [view  cte  se  ie  const [view  cte  se State>("idle");
  const [platformId, setPlatformId] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [message, setMessage] = useState("");
  const [upstreamStatus, setUpstreamStatus] = useState("initializing");
  
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedRef = useRef(false);

  // 3D Card Hover Effect State
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotateX, setRotateX] = useState(0);
  const [rotateY, setRotateY] = useState(0);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const card = cardRef.current;
    const rect = card.getBoundingClientRect();
    
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;

    const multiplier = 20; 
    const rx = -(y / (rect.height / 2)) * multiplier;
    const ry = (x / (rect.width / 2)) * multiplier;

    setRotateX(rx);
    setRotateY(ry);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setRotateX(0);
    setRotateY(0);
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
      setMessage("身份已隐匿，欢迎坠入树洞。");
      return;
    }

    setViewState("waiting");
    setMessage(
      nextStatus === "qr_pending" ? "正在开启引力漩涡..." : 
      nextStatus === "expired" ? "通道已折叠，正在重构空间..." : 
      "请扫码沉入这片无人之境"
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
    <div className="relative min-h-screen w-full bg-[#0a0f0d] text-emerald-50 overflow-hidden selection:bg-emerald-500/30" style={{ perspective: "1000px" }}>
      
      {/* 3D Background Elements */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-900/40 via-[#0a0f0d] to-[#0a0f0d]"></div>
        <div className="absolute top-[10%] left-[20%] w-[300px] h-[300px] rounded-full bg-gradient-to-br from-emerald-400/20 to-transparent blur-3xl animate-[float_10s_ease-in-out_infinite] mix-blend-screen"></div>
        <div className="absolute bottom-[20%] right-[10%] w-[400px] h-[400px] rounded-full bg-gradient-to-tl from-cyan-500/10 to-emerald-800/20 blur-3xl animate-[float_14s_ease-in-out_infinite_reverse] mix-blend-screen"></div>
        <div className="absolute top-[40%] left-[60%] w-[200px] h-[200px] rounded-full bg-emerald-500/10 blur-2xl animate-[float_8s_ease-in-out_infinite_2s]"></div>
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-12 lg:px-8">
        <main className="grid gap-12 lg:gap-24 lg:grid-cols-[1fr_420px] items-center">
          
          <section className="space-y-10 max-w-xl z-20">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-xs font-semibold tracking-widest uppercase backdrop-blur-md shadow-[0_0_20px_rgba(16,185,129,0.15)] animate-[fade-in_1s_ease-out]">
              <Moon className="w-4 h-4" />
              <span>无人之境 · 阅后即焚</span>
            </div>

            <div className="space-y-6 animate-[fade-in_1.2s_ease-out]">
              <h1 className="text-5xl lg:text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-emerald-200 drop-shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                无痕<br/>树洞.
              </h1>
              <p className="text-lg leading-relaxed text-emerald-100/70 font-light mix-blend-screen max-w-md">
                在这片引力深渊，物理空间的锚点将彻底折叠。<br className="hidden sm:block"/>
                卸下白日的伪装，诉说不可言说的秘密。一旦连接断开，所有的回声与印记都将被引力粉碎，归于虚无。
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-8 pt-4 animate-[fade-in_1.4s_ease-out]">
              <div className="group relative">
                <div className="absolute -inset-2 rounded-2xl bg-gradient-to-r from-emerald-500/0 via-emerald-500/5 to-emerald-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 blur-lg"></div>
                <div className="relative space-y-4">
                  <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 text-emerald-400 backdrop-blur-sm border border-white/10 shadow-[inset_0_0_15px_rgba(255,255,255,0.05)] group-hover:bg-white/10 transition-colors duration-500">
                    <Wind className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-wide">灵魂失重</h3>
                  <p className="text-emerald-100/50 leading-relaxed text-sm font-light">
                    没有审视的目光，只有同频的共振。纯粹的思想在这里自由漂浮。
                  </p>
                </div>
              </div>
              <div className="group relative">
                <div className="absolute -inset-2 rounded-2xl bg-gradient-to-r from-emerald-500/0 via-emerald-500/5 to-emerald-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 blur-lg"></div>
                <div className="relative space-y-4">
                  <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 text-emerald-400 backdrop-blur-sm border border-white/10 shadow-[inset_0_0_15px_rgba(255,255,255,0.05)] group-hover:bg-white/10 transition-colors duration-500">
                    <Shield className="w-6 h-6" />
                  </div>
                  <h3 className="text-xl font-bold text-white tracking-wide">信息坍缩</h3>
                  <p className="text-emerald-100/50 leading-relaxed text-sm font-light">
                    没有任何数据落网，每一次低语都在你离开的瞬间被绝对抹除。
                  </p>
                </div>
              </div>
            </div>
          </section>

          <aside className="relative flex flex-col items-center z-30" style={{ perspective: "1200px" }}>
            <div 
              ref={cardRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              className="w-full relative rounded-[3rem] bg-white/[0.03] backdrop-blur-2xl border border-white/10 p-8 sm:p-10 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)] flex flex-col items-center transition-transform duration-100 ease-out"
              style={{
                transform: \`rotateX(\${rotateX}deg) rotateY(\${rotateY}deg)\`,
                transformStyle: "preserve-3d"
              }}
            >
              <div 
                className="absolute inset-0 rounded-[3rem] pointer-events-none opacity-50 bg-gradient-to-br from-white/10 to-transparent"
                style={{ transform: 'translateZ(1px)' }}
              ></div>

              <div className="mb-8 w-full" style={{ transform: 'translateZ(30px)' }}>
                <h2 className="text-2xl font-bold text-white tracking-wide drop-shadow-md">凝聚集点</h2>
                <p className="text-sm text-emerald-200/60 mt-2 font-light">扫描引力凭证，坠入深层空间</p>
              </div>

              <div 
                className="flex rounded-[2.5rem] border border-white/10 bg-[#040806]/80 min-h-[280px] w-full items-center justify-center relative mb-8 shadow-[inset_0_0_40px_rgba(0,0,0,0.8)]"
                style={{ transform: 'translateZ(50px)' }}
              >
                {qrUrl && viewState !== "success" && (
                  <div className="absolute inset-0 overflow-hidden rounded-[2.5rem] pointer-events-none z-20">
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_20px_rgba(16,185,129,1)] opacity-75 animate-[scan_3s_ease-in-out_infinite]"></div>
                  </div>
                )}

                {viewState === "loading" || viewState === "idle" ? (
                  <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-full blur-md bg-emerald-500/20 animate-pulse"></div>
                      <Loader2 className="relative h-10 w-10 animate-spin text-emerald-400" />
                    </div>
                    <p className="text-sm text-emerald-200/70 tracking-widest font-mono animate-pulse">{message}</p>
                  </div>
                ) : viewState === "error" ? (
                   <div className="flex flex-col items-center gap-5 text-center px-6">
                    <div className="rounded-3xl bg-red-500/10 p-5 text-red-400 border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.15)]">
                      <Lock className="h-8 w-8" />
                    </div>
                    <p className="text-sm text-red-200 font-light leading-relaxed">{message}</p>
                    <button 
                      onClick={() => void startOnboarding()}
                      className="mt-3 px-8 py-3 bg-white/10 text-white rounded-full text-sm font-medium hover:bg-white/20 transition-all shadow-[0_0_20px_rgba(255,255,255,0.05)] hover:shadow-[0_0_30px_rgba(255,255,255,0.1)] border border-white/10 active:scale-95"
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
                       <p className="text-lg font-bold text-white tracking-widest drop-shadow-md">维度已融合</p>
                       <p className="text-sm text-emerald-200/80 font-light">{message}</p>
                    </div>
                  </div>
                ) : qrUrl ? (
                  <div className="p-4 bg-white/80 rounded-[2rem] shadow-[0_0_40px_rgba(16,185,129,0.2)] backdrop-blur-sm transition-all duration-500 hover:shadow-[0_0_60px_rgba(16,185,129,0.4)]">
                    <QrCanvas value={qrUrl} />
                  </div>
                ) : null}
              </div>

              {/* Status Bar */}
              <div 
                className="w-full flex items-center justify-between text-xs text-emerald-200/80 bg-white/5 rounded-2xl px-6 py-4 border border-white/10 backdrop-blur-md shadow-[0_10px_20px_-5px_rgba(0,0,0,0.5)]"
                style={{ transform: 'translateZ(20px)' }}
              >
                <div className="flex items-center gap-3">
                   <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,1)]"></span>
                  </span>
                  <span className="font-mono tracking-wider">{upstreamStatus}</span>
                </div>
                <div className="truncate max-w-[140px] font-mono text-emerald-100/30">
                  {platformId || "AWAIT_MAPPING"}
                </div>
              </div>

            </div>
          </aside>

        </main>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-40px) scale(1.05); }
        }
        @keyframes scan {
          0% { top: 0%; opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(20px); filter: blur(10px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
      `}</style>
    </div>
  );
}
`;
fs.writeFileSync('src/pages/join.tsx', code, 'utf-8');
console.log('Finished writing 3D join.tsx directly via node');
