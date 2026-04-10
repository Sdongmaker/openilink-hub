export interface AstrBotBot {
  platform_id: string;
  runtime_status: "running" | "pending" | "error" | "stopped" | "unknown";
  qr_status: "wait" | "confirmed" | "expired" | null;
  configured: boolean;
}

export interface AstrBotQR {
  platform_id: string;
  status: "initializing" | "wait" | "confirmed" | "expired";
  qr_url?: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (res.status === 401) {
    const path = window.location.pathname;
    const isPublic = path === "/";
    if (!isPublic) {
      window.location.href = "/login";
    }
    throw new Error("unauthorized");
  }
  let data: any;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    throw new Error("invalid response");
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  oauthProviders: () =>
    request<{ providers: any[] }>("/api/auth/oauth/providers").then((data) => ({
      providers: (data.providers || []).map((p: any) =>
        typeof p === "string" ? { name: p, display_name: p, type: "oauth" } : p,
      ) as Array<{ name: string; display_name: string; type: string; key?: string }>,
    })),
  me: () =>
    request<{
      id: string;
      username: string;
      display_name: string;
      role: string;
      email?: string;
      has_password: boolean;
      has_passkey: boolean;
      has_oauth: boolean;
    }>("/api/me"),
  info: () => request<{ ai: boolean; registration_enabled: boolean; version: string }>("/api/info"),

  // Passkeys
  listPasskeys: () => request<any[]>("/api/me/passkeys"),
  passkeyBindBegin: () => request<any>("/api/me/passkeys/register/begin", { method: "POST" }),
  passkeyBindFinishRaw: (body: string, name?: string) =>
    fetch(`/api/me/passkeys/register/finish${name ? `?name=${encodeURIComponent(name)}` : ""}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body,
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).error);
    }),
  deletePasskey: (id: string) => request(`/api/me/passkeys/${id}`, { method: "DELETE" }),
  renamePasskey: (id: string, name: string) =>
    request(`/api/me/passkeys/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  updateUsername: (username: string) =>
    request("/api/me/username", { method: "PUT", body: JSON.stringify({ username }) }),
  changePassword: (data: { old_password: string; new_password: string }) =>
    request("/api/me/password", { method: "PUT", body: JSON.stringify(data) }),

  // OAuth accounts
  oauthAccounts: () => request<any[]>("/api/me/linked-accounts"),
  unlinkOAuth: (provider: string) =>
    request(`/api/me/linked-accounts/${provider}`, { method: "DELETE" }),

  // --- AstrBot external service (proxied via Hub backend) ---
  astrBotHealth: () => request<{ status: string }>("/api/admin/astrbot/health"),
  astrBotCreateBot: () =>
    request<{ platform_id: string }>("/api/admin/astrbot/bot/create", { method: "POST" }),
  astrBotGetQR: (platformId: string) =>
    request<AstrBotQR>(`/api/admin/astrbot/bot/${encodeURIComponent(platformId)}/qr`),
  astrBotListBots: () =>
    request<{ bots: AstrBotBot[] }>("/api/admin/astrbot/bot/list"),
};
