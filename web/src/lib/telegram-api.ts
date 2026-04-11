// Telegram admin API helpers

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  if (res.status === 204) return undefined as T;

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }

  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as T;
}

// Types
export interface TGAccount {
  id: number;
  phone: string;
  status: string;
  last_test_at?: number;
  last_test_ok: boolean;
  created_at: number;
  updated_at: number;
}

export interface WatchTarget {
  id: number;
  account_id: number;
  chat_id: number;
  chat_type: string;
  title: string;
  username?: string;
  enabled: boolean;
  last_error?: string;
  created_at: number;
  today_count?: number;
}

export interface TGMessage {
  id: number;
  target_id: number;
  tg_message_id: number;
  sender_id: number;
  sender_name: string;
  content_type: string;
  text_content?: string;
  media_key?: string;
  is_ad: boolean;
  ad_confidence: number;
  created_at: number;
  stored_at: number;
  target_title: string;
}

export interface TGStats {
  crawler_running: boolean;
  account_status: string;
  target_count: Record<string, number>;
  today_total: number;
  today_ads: number;
  ad_rate: number;
}

export interface TestResult {
  overall: boolean;
  checks: { name: string; ok: boolean; error?: string }[];
}

export interface StorageSettings {
  endpoint: string;
  bucket: string;
  public_url: string;
  ssl: boolean;
  access_key_masked: string;
  telegram_file_count: number;
  telegram_used_bytes: number;
}

export interface MessageListResponse {
  data: TGMessage[];
  total: number;
  page: number;
  per_page: number;
}

export interface CrawlerStatus {
  running: boolean;
  account_status: string;
  target_count: number;
}

// Auth
export interface AuthUser {
  id: number;
  username: string;
  display_name: string;
  role: string;
}

export const tgApi = {
  // Auth
  login: (username: string, password: string) =>
    request<{ ok: boolean; user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<AuthUser>("/api/me"),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),

  // Account
  getAccount: () => request<TGAccount>("/api/admin/telegram/account"),
  createAccount: (phone: string) =>
    request<TGAccount>("/api/admin/telegram/account", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  deleteAccount: () => request<void>("/api/admin/telegram/account", { method: "DELETE" }),

  // Auth flow
  sendCode: (phone: string) =>
    request<{ status: string }>("/api/admin/telegram/auth/send-code", {
      method: "POST",
      body: JSON.stringify({ phone }),
    }),
  verify: (code: string, password_2fa?: string) =>
    request<{ status: string }>("/api/admin/telegram/auth/verify", {
      method: "POST",
      body: JSON.stringify({ code, password_2fa }),
    }),

  // Test
  testConnection: () => request<TestResult>("/api/admin/telegram/account/test", { method: "POST" }),

  // Targets
  listTargets: () => request<WatchTarget[]>("/api/admin/telegram/targets"),
  createTarget: (input: string) =>
    request<WatchTarget>("/api/admin/telegram/targets", {
      method: "POST",
      body: JSON.stringify({ input }),
    }),
  updateTarget: (id: number, enabled: boolean) =>
    request<void>(`/api/admin/telegram/targets/${id}`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    }),
  deleteTarget: (id: number) =>
    request<void>(`/api/admin/telegram/targets/${id}`, { method: "DELETE" }),

  // Messages
  listMessages: (params: {
    page?: number;
    per_page?: number;
    target_id?: number;
    is_ad?: boolean;
    content_type?: string;
  }) => {
    const sp = new URLSearchParams();
    if (params.page) sp.set("page", String(params.page));
    if (params.per_page) sp.set("per_page", String(params.per_page));
    if (params.target_id) sp.set("target_id", String(params.target_id));
    if (params.is_ad !== undefined) sp.set("is_ad", String(params.is_ad));
    if (params.content_type) sp.set("content_type", params.content_type);
    return request<MessageListResponse>(`/api/admin/telegram/messages?${sp}`);
  },
  getMessage: (id: number) => request<TGMessage>(`/api/admin/telegram/messages/${id}`),

  // Crawler
  getStatus: () => request<CrawlerStatus>("/api/admin/telegram/status"),
  startCrawler: () =>
    request<{ status: string }>("/api/admin/telegram/crawler/start", { method: "POST" }),
  stopCrawler: () =>
    request<{ status: string }>("/api/admin/telegram/crawler/stop", { method: "POST" }),

  // Stats
  getStats: () => request<TGStats>("/api/admin/telegram/stats"),

  // Storage
  getStorage: () => request<StorageSettings>("/api/admin/telegram/storage"),
  testStorage: () => request<{ ok: boolean; error?: string }>("/api/admin/telegram/storage/test", { method: "POST" }),
};
