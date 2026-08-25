import * as SecureStore from 'expo-secure-store';

/**
 * API client with bearer auth and refresh-token rotation.
 * The backend is authoritative for everything; this client only transports.
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const ACCESS_KEY = 'gig.access_token';
const REFRESH_KEY = 'gig.refresh_token';

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function getTokens(): Promise<{ access: string | null; refresh: string | null }> {
  const [access, refresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  return { access, refresh };
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, access),
    SecureStore.setItemAsync(REFRESH_KEY, refresh),
  ]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { refresh } = await getTokens();
      if (!refresh) return false;
      const res = await fetch(`${BASE_URL}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) {
        await clearTokens();
        return false;
      }
      const body = (await res.json()) as { access_token: string; refresh_token: string };
      await setTokens(body.access_token, body.refresh_token);
      return true;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const doFetch = async (): Promise<Response> => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (auth) {
      const { access } = await getTokens();
      if (access) headers.authorization = `Bearer ${access}`;
    }
    return fetch(`${BASE_URL}/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let res = await doFetch();
  if (res.status === 401 && auth && (await tryRefresh())) {
    res = await doFetch();
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const err = json as ApiErrorBody | undefined;
    throw new ApiError(
      res.status,
      err?.error?.code ?? 'INTERNAL',
      err?.error?.message ?? 'Something went wrong',
      err?.error?.details,
    );
  }
  return json as T;
}
