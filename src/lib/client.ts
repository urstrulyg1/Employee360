"use client";

export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(init?.headers as Record<string, string>) },
    ...init,
  });
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
    location.href = "/login";
    throw new Error("Not authenticated");
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => fetchJson<T>(url),
  post: <T>(url: string, body: unknown) => fetchJson<T>(url, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(url: string, body: unknown) => fetchJson<T>(url, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(url: string, body: unknown) => fetchJson<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(url: string, body?: unknown) => fetchJson<T>(url, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
};
