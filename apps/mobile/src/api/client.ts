import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * API client with bearer auth and refresh-token rotation.
 * The backend is authoritative for everything; this client only transports.
 */
/**
 * Backend origin, inlined at build time.
 *
 * An unset GitHub Actions variable expands to an empty string rather than
 * being absent, so `??` alone would leave BASE_URL as '' and send every
 * request to a relative path on the web origin — which returns the SPA's
 * 404.html and fails as an opaque parse error. Treat blank as unconfigured.
 */
// Read the bare expression: Expo substitutes `process.env.EXPO_PUBLIC_*` at
// build time by matching it literally, and anything fancier (optional
// chaining, destructuring) is left alone and evaluates to undefined.
const RAW_API_URL = process.env.EXPO_PUBLIC_API_URL;
const CONFIGURED_API_URL =
  typeof RAW_API_URL === 'string' && RAW_API_URL.trim() !== ''
    ? RAW_API_URL.trim().replace(/\/+$/, '')
    : undefined;

/** Only development falls back to a local server; a deployed build has none. */
const BASE_URL = CONFIGURED_API_URL ?? (__DEV__ ? 'http://localhost:3000' : undefined);

/** False when the build has no backend — the UI says so instead of guessing. */
export const apiConfigured = BASE_URL !== undefined;

/** Resolved backend origin, or undefined when this build has no backend. */
export const apiBaseUrl = BASE_URL;

export const API_NOT_CONFIGURED = 'API_NOT_CONFIGURED';

function requireBaseUrl(): string {
  if (BASE_URL === undefined) {
    throw new ApiError(
      0,
      API_NOT_CONFIGURED,
      'This site is not connected to a server yet, so accounts and jobs are unavailable.',
    );
  }
  return BASE_URL;
}

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
      const res = await fetch(`${requireBaseUrl()}/v1/auth/refresh`, {
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

/** Multipart image upload (expo-image-picker asset URI → /v1/files). */
export async function uploadImage(
  assetUri: string,
  kind: 'JOB_PHOTO' | 'PROFILE_PHOTO',
): Promise<{ id: string }> {
  const { access } = await getTokens();
  const form = new FormData();
  if (assetUri.startsWith('data:') || assetUri.startsWith('blob:')) {
    // Web picker returns data/blob URIs.
    const blob = await (await fetch(assetUri)).blob();
    form.append('file', blob, 'photo.jpg');
  } else {
    // Native picker returns file URIs; React Native FormData takes descriptors.
    form.append('file', { uri: assetUri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
  }
  const res = await fetch(`${requireBaseUrl()}/v1/files?kind=${kind}`, {
    method: 'POST',
    headers: access ? { authorization: `Bearer ${access}` } : {},
    body: form,
  });
  const json = (await res.json()) as { id?: string } & ApiErrorBody;
  if (!res.ok || !json.id) {
    throw new ApiError(res.status, json.error?.code ?? 'INTERNAL', json.error?.message ?? 'Upload failed');
  }
  return { id: json.id };
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
    return fetch(`${requireBaseUrl()}/v1${path}`, {
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
