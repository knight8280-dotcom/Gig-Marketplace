'use client';

/**
 * Admin API client. Token-based auth kept in localStorage for the prototype —
 * production hardening (httpOnly cookie session + TOTP 2FA per
 * SECURITY_MODEL.md) is tracked for the pilot gate.
 */
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const ACCESS_KEY = 'gig_admin.access';
const REFRESH_KEY = 'gig_admin.refresh';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function hasSession(): boolean {
  return typeof window !== 'undefined' && Boolean(localStorage.getItem(REFRESH_KEY));
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

async function tryRefresh(): Promise<boolean> {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return false;
  const res = await fetch(`${BASE_URL}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    clearSession();
    return false;
  }
  const body = (await res.json()) as { access_token: string; refresh_token: string };
  localStorage.setItem(ACCESS_KEY, body.access_token);
  localStorage.setItem(REFRESH_KEY, body.refresh_token);
  return true;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const doFetch = () =>
    fetch(`${BASE_URL}/v1${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(localStorage.getItem(ACCESS_KEY)
          ? { authorization: `Bearer ${localStorage.getItem(ACCESS_KEY)}` }
          : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

  let res = await doFetch();
  if (res.status === 401 && (await tryRefresh())) res = await doFetch();

  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => undefined)) as
    | { error?: { code: string; message: string } }
    | undefined;
  if (!res.ok) {
    throw new ApiError(res.status, json?.error?.code ?? 'INTERNAL', json?.error?.message ?? 'Request failed');
  }
  return json as T;
}

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json()) as {
    error?: { message: string };
    user?: { roles: string[] };
    tokens?: { access_token: string; refresh_token: string };
  };
  if (!res.ok || !json.tokens || !json.user) {
    throw new Error(json.error?.message ?? 'Sign-in failed');
  }
  if (!json.user.roles.includes('ADMIN')) {
    throw new Error('This account does not have admin access');
  }
  localStorage.setItem(ACCESS_KEY, json.tokens.access_token);
  localStorage.setItem(REFRESH_KEY, json.tokens.refresh_token);
}

export function money(cents: number | string | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  return `$${(Number(cents) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

export function when(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : '—';
}
