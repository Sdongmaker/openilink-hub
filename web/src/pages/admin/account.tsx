import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Alert } from "../../components/ui/alert";
import { Separator } from "../../components/ui/separator";
import { tgApi, type TGAccount, type TestResult } from "../../lib/telegram-api";
import { Phone, ShieldCheck, Trash2, FlaskConical } from "lucide-react";

type Step = "empty" | "view" | "auth_code" | "auth_2fa" | "testing";

export function AccountPage() {
  const [account, setAccount] = useState<TGAccount | null>(null);
  const [step, setStep] = useState<Step>("empty");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password2fa, setPassword2fa] = useState("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fetchAccount = async () => {
    try {
      const acc = await tgApi.getAccount();
      setAccount(acc);
      setStep("view");
    } catch {
      setAccount(null);
      setStep("empty");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccount();
  }, []);

  const handleCreateAndSendCode = async () => {
    setBusy(true);
    setError("");
    try {
      // Create account if not exists
      if (!account) {
        await tgApi.createAccount(phone);
      }
      await tgApi.sendCode(phone);
      setStep("auth_code");
    } catch (err: any) {
      setError(err.message);
    }
    setBusy(false);
  };

  const handleVerify = async () => {
    setBusy(true);
    setError("");
    try {
      await tgApi.verify(code, password2fa || undefined);
      await fetchAccount();
    } catch (err: any) {
      if (err.message?.includes("2FA") || err.message?.includes("PASSWORD")) {
        setStep("auth_2fa");
        setError("需要两步验证密码");
      } else {
        setError(err.message);
      }
    }
    setBusy(false);
  };

  const handleTest = async () => {
    setStep("testing");
    setTestResult(null);
    try {
      const result = await tgApi.testConnection();
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ overall: false, checks: [{ name: "connection", ok: false, error: err.message }] });
    }
    setStep("view");
  };

  const handleDelete = async () => {
    if (!confirm("确定要删除账号？这将停止爬虫并清除会话数据。")) return;
    setBusy(true);
    try {
      await tgApi.deleteAccount();
      setAccount(null);
      setStep("empty");
      setPhone("");
      setCode("");
    } catch (err: any) {
      setError(err.message);
    }
    setBusy(false);
  };

  if (loading) {
    return <div className="animate-pulse h-48 bg-muted rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Telegram 账号</h2>

      {step === "empty" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              添加 Telegram 账号
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              输入 Telegram 手机号，系统将发送验证码完成登录。
            </p>
            <div className="flex gap-2">
              <input
                className="flex h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="+86..."
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <Button onClick={handleCreateAndSendCode} disabled={busy || !phone}>
                {busy ? "发送中..." : "发送验证码"}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {step === "auth_code" && (
        <Card>
          <CardHeader>
            <CardTitle>输入验证码</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">验证码已发送到 Telegram 应用</p>
            <div className="flex gap-2">
              <input
                className="flex h-9 w-40 rounded-md border border-input bg-transparent px-3 py-1 text-sm text-center tracking-widest shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="12345"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                maxLength={6}
                autoFocus
              />
              <Button onClick={handleVerify} disabled={busy || !code}>
                {busy ? "验证中..." : "验证"}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {step === "auth_2fa" && (
        <Card>
          <CardHeader>
            <CardTitle>两步验证</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">请输入您的两步验证密码</p>
            <div className="flex gap-2">
              <input
                type="password"
                className="flex h-9 w-60 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="两步验证密码"
                value={password2fa}
                onChange={(e) => setPassword2fa(e.target.value)}
                autoFocus
              />
              <Button onClick={handleVerify} disabled={busy || !password2fa}>
                {busy ? "验证中..." : "提交"}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      )}

      {step === "view" && account && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>账号信息</span>
                <Badge variant={account.status === "active" ? "default" : "secondary"}>
                  {account.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">手机号</p>
                  <p className="font-medium">{account.phone}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">上次测试</p>
                  <p className="font-medium">
                    {account.last_test_at
                      ? new Date(account.last_test_at * 1000).toLocaleString()
                      : "从未"}
                    {account.last_test_at && (
                      <Badge variant={account.last_test_ok ? "default" : "destructive"} className="ml-2">
                        {account.last_test_ok ? "通过" : "失败"}
                      </Badge>
                    )}
                  </p>
                </div>
              </div>
              <Separator />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleTest}>
                  <FlaskConical className="h-4 w-4 mr-1" />
                  测试连接
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={busy}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  删除账号
                </Button>
              </div>
            </CardContent>
          </Card>

          {testResult && (
            <Alert variant={testResult.overall ? "default" : "destructive"}>
              <ShieldCheck className="h-4 w-4" />
              <div className="ml-2">
                <p className="font-medium">{testResult.overall ? "连接正常" : "连接异常"}</p>
                <ul className="mt-1 text-sm space-y-0.5">
                  {testResult.checks.map((c) => (
                    <li key={c.name}>
                      {c.ok ? "✅" : "❌"} {c.name}
                      {c.error && <span className="text-muted-foreground ml-1">({c.error})</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </Alert>
          )}
        </>
      )}

      {step === "testing" && (
        <Card>
          <CardContent className="py-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="mt-3 text-sm text-muted-foreground">正在测试连接...</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
