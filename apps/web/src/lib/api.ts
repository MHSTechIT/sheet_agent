'use client';
import { useSession } from 'next-auth/react';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function useApi() {
  const { data } = useSession();
  const token = (data as any)?.apiToken as string | undefined;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!r.ok) {
      let msg = `HTTP ${r.status}`;
      try {
        const j = await r.json();
        msg = j?.message ?? msg;
      } catch {}
      throw new Error(Array.isArray(msg) ? msg.join(', ') : String(msg));
    }
    if (r.status === 204) return undefined as T;
    return (await r.json()) as T;
  }

  return {
    token,
    get: <T,>(path: string) => request<T>(path),
    post: <T,>(path: string, body?: unknown) =>
      request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    patch: <T,>(path: string, body?: unknown) =>
      request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
    del: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
  };
}

export const API_BASE = BASE;
