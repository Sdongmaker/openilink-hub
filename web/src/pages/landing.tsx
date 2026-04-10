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

export function LandingPage() {
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
}
