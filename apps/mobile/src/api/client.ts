import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * API client with bearer auth and refresh-token rotation.
 * The backend is authoritative for everything; this client only transports.
 */
const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const ACCESS_KEY = 'gig.access_token';
const REFRESH_KEY = 'gig.refresh_token';

/**
 * SecureStore is native-only; on web (dev/demo builds) fall back to
 * localStorage. Production web is not a target platform for the MVP.
 */
const storage = {
  get: (key: string): Promise<string | null> =>
    Platform.OS === 'web'
      ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null)
      : SecureStore.getItemAsync(key),
  set: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  },
  delete: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  },
};

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
  const [access, refresh] = await Promise.all([storage.get(ACCESS_KEY), storage.get(REFRESH_KEY)]);
  return { access, refresh };
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  await Promise.all([storage.set(ACCESS_KEY, access), storage.set(REFRESH_KEY, refresh)]);
}

export async function clearTokens(): Promise<void> {
  await Promise.all([storage.delete(ACCESS_KEY), storage.delete(REFRESH_KEY)]);
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
    let message = err?.error?.message ?? 'Something went wrong';
    // Surface per-field validation errors so users know what to fix.
    const fields = err?.error?.details?.fields as Record<string, string[]> | undefined;
    if (fields) {
      const firstField = Object.entries(fields)[0];
      if (firstField) message = `${firstField[0].replaceAll('_', ' ')}: ${firstField[1][0]}`;
    }
    throw new ApiError(res.status, err?.error?.code ?? 'INTERNAL', message, err?.error?.details);
  }
  return json as T;
}
