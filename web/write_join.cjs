const fs = require('fs');

const code = `import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Leaf, Lock, Shield, Wind, Loader2, CheckCircle2 } from "lucide-react";
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
      color: { dark: "#0f172a", light: "#ffffff" }
    });
  }, [value]);
  return (
    <canvas 
      ref={ref} 
      className="rounded-2xl border border-stone-200/40 shadow-sm transition-transform duration-500 hover:scale-[1.02]" 
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
      setMessage("连接成功，欢迎来到树洞。");
      return;
    }

    setViewState("waiting");
    setMessage(
      nextStatus === "qr_pending" ? "正在开启树洞入口..." : 
      nextStatus === "expired" ? "入口已关闭，正在重新获取..." : 
      "请扫码进入这片无人的树洞"
    );
    schedulePoll(data.platform_id, data.poll_interval_ms);
  }

  async function startOnboarding() {
    cleanupPolling();
    setViewState("loading");
    setPlatformId("");
    setQrUrl("");
    setUpstreamStatus("initializing");
    setMessage("寻找安静的角落...");
    try {
      const data = await api.astrBotOnboardStart();
      applyState(data);
    } catch (error: any) {
      setViewState("error");
      setMessage(error.message || "无法开启树洞，请稍后再试。");
    }
  }

  async function refreshStatus(currentPlatformId: string) {
    try {
      const data = await api.astrBotOnboardStatus(currentPlatformId);
      applyState(data);
    } catch (error: any) {
      setViewState("error");
      setMessage(error.message || "连接意外中断。");
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-stone-800 font-sans selection:bg-emerald-200">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-12 lg:px-8">
        <main className="grid gap-16 lg:grid-cols-[1fr_400px] items-center">
          
          {/* Content Column */}
          <section className="space-y-10 max-w-xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-100/50 text-emerald-700 text-sm font-medium tracking-wide">
              <Leaf className="w-4 h-4" />
              <span>完全匿名 · 阅后即焚</span>
            </div>

            <div className="space-y-6">
              <h1 className="text-5xl lg:text-6xl font-extrabold tracking-tight text-stone-900">
                无痕树洞
              </h1>
              <p className="text-lg leading-relaxed text-stone-600">
                在这个喧嚣的世界里，为你保留的一方净土。<br className="hidden sm:block"/>
                放下所有的防备与标签，倾诉你最真实的秘密。所有的文字与声音，断开连接后即刻化为乌有，不留一丝痕迹。
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-8 pt-6">
              <div className="space-y-4">
                <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-amber-50 text-amber-600/90 shadow-sm border border-amber-100/50">
                  <Wind className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-stone-900">情绪剥离</h3>
                <p className="text-stone-500 leading-relaxed text-sm">
                  没有评价，没有现实身份的羁绊。纯粹的灵魂在这里相遇、交友、共鸣。
                </p>
              </div>
              <div className="space-y-4">
                <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600/90 shadow-sm border border-emerald-100/50">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-stone-900">最高私密</h3>
                <p className="text-stone-500 leading-relaxed text-sm">
                  全程端到端加密通信，不在任何物理服务器落盘。倾诉完毕，一切烟消云散。
                </p>
              </div>
            </div>
          </section>

          {/* Action Column */}
          <aside className="relative flex flex-col items-center">
            <div className="w-full rounded-[2.5rem] bg-white p-8 sm:p-10 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] border border-stone-100 text-center">
              
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-stone-900">获取通行凭证</h2>
                <p className="text-sm text-stone-500 mt-2">扫描下方二维码进入树洞</p>
              </div>

              <div className="flex bg-stone-50/50 rounded-[2rem] border border-stone-100 min-h-[280px] w-full items-center justify-center relative mb-8">
                {viewState === "loading" || viewState === "idle" ? (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
                    <p className="text-sm text-stone-500 animate-pulse">{message}</p>
                  </div>
                ) : viewState === "error" ? (
                   <div className="flex flex-col items-center gap-4 text-center px-4">
                    <div className="rounded-2xl bg-red-50 p-4 text-red-500 border border-red-100/50">
                      <Lock className="h-8 w-8" />
                    </div>
                    <p className="text-sm text-red-600 font-medium">{message}</p>
                    <button 
                      onClick={() => void startOnboarding()}
                      className="mt-2 px-6 py-2.5 bg-stone-900 text-white rounded-full text-sm font-medium hover:bg-stone-800 transition-colors shadow-md hover:shadow-lg"
                    >
                      重新获取
                    </button>
                  </div>
                ) : viewState === "success" ? (
                  <div className="flex flex-col items-center gap-5 text-center px-4">
                    <div className="rounded-full bg-emerald-50 p-5 text-emerald-500 border border-emerald-100/50">
                      <CheckCircle2 className="h-12 w-12" strokeWidth={2} />
                    </div>
                    <div>
                      <p className="text-base font-semibold text-stone-800">{message}</p>
                    </div>
                  </div>
                ) : qrUrl ? (
                  <div className="p-5 bg-white rounded-[1.5rem] shadow-sm border border-stone-100">
                    <QrCanvas value={qrUrl} />
                  </div>
                ) : null}
              </div>

              <div className="w-full flex items-center justify-between text-xs text-stone-500 bg-stone-50 rounded-2xl px-5 py-3.5 border border-stone-100">
                <div className="flex items-center gap-2.5">
                   <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <span className="font-medium">{upstreamStatus}</span>
                </div>
                <div className="truncate max-w-[120px] font-mono text-stone-400">
                  {platformId || "等待分配"}
                </div>
              </div>

            </div>
          </aside>

        </main>
      </div>
    </div>
  );
}
`;

fs.writeFileSync('src/pages/join.tsx', code, 'utf-8');
console.log('Finished writing join.tsx');
