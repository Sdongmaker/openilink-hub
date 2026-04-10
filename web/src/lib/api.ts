export interface AstrBotOnboardState {
  platform_id: string;
  status: string;
  qr_url?: string;
  poll_interval_ms?: number;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
  }

  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }

  return data as T;
}

export const api = {
  astrBotOnboardStart: () =>
    request<AstrBotOnboardState>("/api/public/astrbot/onboard/start", { method: "POST" }),
  astrBotOnboardStatus: (platformId: string) =>
    request<AstrBotOnboardState>(`/api/public/astrbot/onboard/status/${encodeURIComponent(platformId)}`),
};
