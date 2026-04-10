import { useState } from "react";
import { KeyRound, Shield, User, Lock, ArrowRight, Loader2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/ui/button";
import { HexagonBackground } from "../components/ui/hexagon-background";
import {
  Card,
  CardContent,
  CardFooter
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { api } from "../lib/api";
import { Separator } from "../components/ui/separator";

export function LoginPage() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Password login
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.login(username, password);
      const me = await api.me();
      const isAdmin = me.role === "admin" || me.role === "superadmin";
      if (!isAdmin) {
        setError("仅管理员可登录控制台");
        setLoading(false);
        return;
      }
      navigate("/dashboard/admin/astrbot");
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  }

  // Passkey login
  function base64urlToBuffer(b64: string): ArrayBuffer {
    const base64 = b64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
    const bin = atob(base64 + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function bufferToBase64url(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  async function handlePasskeyLogin() {
    setError(""); setLoading(true);
    try {
      const options = await fetch("/api/auth/passkey/login/begin", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }).then((r) => r.json());

      options.publicKey.challenge = base64urlToBuffer(options.publicKey.challenge);
      if (options.publicKey.allowCredentials) {
        options.publicKey.allowCredentials = options.publicKey.allowCredentials.map(
          (credential: any) => ({ ...credential, id: base64urlToBuffer(credential.id) }),
        );
      }
      const credential = (await navigator.credentials.get(options)) as PublicKeyCredential;
      if (!credential) throw new Error("cancelled");
      const response = credential.response as AuthenticatorAssertionResponse;
      const body = JSON.stringify({
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          authenticatorData: bufferToBase64url(response.authenticatorData),
          clientDataJSON: bufferToBase64url(response.clientDataJSON),
          signature: bufferToBase64url(response.signature),
          userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : "",
        },
      });

      const res = await fetch("/api/auth/passkey/login/finish", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "登录失败");
      }
      const me = await api.me();
      const isAdmin = me.role === "admin" || me.role === "superadmin";
      if (!isAdmin) {
        setError("仅管理员可登录控制台");
        setLoading(false);
        return;
      }
      navigate("/dashboard/admin/astrbot");
    } catch (err: any) {
      if (err.name !== "NotAllowedError") setError(err.message || "Passkey 登录失败");
    }
    setLoading(false);
  }

  const supportsPasskey = typeof window !== "undefined" && "PublicKeyCredential" in window;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <HexagonBackground className="opacity-20" hexagonSize={60} hexagonMargin={4} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,hsl(var(--background))_100%)]" />

      <div className="relative z-10 w-full max-w-[420px] animate-in fade-in zoom-in-95 duration-500">
        <div className="mb-8 text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 mb-4">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">AstrBot 接入后台</h1>
          <p className="text-sm text-muted-foreground font-medium">
            仅管理员可创建机器人并查看当前接入记录
          </p>
        </div>

        <Card className="border-border/50 shadow-2xl backdrop-blur-md bg-card/80">
          <CardContent className="pt-8 pb-6 space-y-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="用户名"
                  className="pl-10 h-9 bg-muted/20"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="登录密码"
                  className="pl-10 h-9 bg-muted/20"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20">
                  <X className="h-3.5 w-3.5 shrink-0" />
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-9 font-bold text-sm" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                登录
                {!loading && <ArrowRight className="ml-2 h-3.5 w-3.5" />}
              </Button>
            </form>

            {supportsPasskey && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><Separator /></div>
                  <div className="relative flex justify-center text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                    <span className="bg-card px-3">或</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-9 gap-2 font-medium text-sm"
                  onClick={handlePasskeyLogin}
                  disabled={loading}
                >
                  <KeyRound className="h-4 w-4 text-primary" />
                  使用通行密钥登录
                </Button>
              </>
            )}
          </CardContent>
          <CardFooter className="border-t bg-muted/30 pt-4 pb-4 rounded-b-xl justify-center">
            <p className="text-[10px] text-center text-muted-foreground/60 leading-relaxed px-6">
              该后台仅用于 AstrBot 机器人接入与当前记录管理。
            </p>
          </CardFooter>
        </Card>

        <footer className="mt-8 text-center text-[11px] text-muted-foreground/50 font-medium">
          &copy; 2026 AstrBot Access Portal
        </footer>
      </div>
    </div>
  );
}
