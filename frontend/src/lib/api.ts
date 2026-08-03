/**
 * API client T1.11a — fetch wrapper dengan:
 * - token access/refresh di localStorage (keputusan: SPA sederhana; T5 nanti bisa cookie httpOnly)
 * - silent refresh (1×) saat 401, lalu retry permintaan asli
 * - normalisasi error backend {code, message, details.fields} → ApiError
 *
 * Backend selalu merespons {success, data} atau {success:false, error:{code,message,details}}.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const API_BASE = '/api/v1';

const ACCESS_KEY = 'siak.access_token';
const REFRESH_KEY = 'siak.refresh_token';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(access: string | null, refresh: string | null): void {
  if (access) {
    localStorage.setItem(ACCESS_KEY, access);
  } else {
    localStorage.removeItem(ACCESS_KEY);
  }
  if (refresh) {
    localStorage.setItem(REFRESH_KEY, refresh);
  } else {
    localStorage.removeItem(REFRESH_KEY);
  }
}

let refreshInFlight: Promise<boolean> | null = null;

/** Refresh access token; kembalikan true bila berhasil. Single-flight (hindari N permintaan 401 → N refresh). */
export async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const rt = getRefreshToken();
      if (!rt) {
        // tidak ada refresh token → sesi tidak bisa dipulihkan → bersihkan (konsisten dgn !res.ok)
        setTokens(null, null);
        return false;
      }
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) {
          setTokens(null, null);
          return false;
        }
        const body = (await res.json()) as {
          data?: { accessToken?: string; refreshToken?: string };
        };
        const access = body.data?.accessToken ?? null;
        const refresh = body.data?.refreshToken ?? null;
        if (!access || !refresh) {
          setTokens(null, null);
          return false;
        }
        setTokens(access, refresh);
        return true;
      } catch {
        setTokens(null, null);
        return false;
      }
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Sertakan Authorization header (default true). */
  auth?: boolean;
}

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const doFetch = (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    if (auth) {
      const token = getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let res = await doFetch();

  // Silent refresh sekali lalu retry (hanya untuk endpoint ber-auth, bukan login/refresh itu sendiri)
  if (
    res.status === 401 &&
    auth &&
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/refresh')
  ) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch();
    }
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // respons tanpa body
  }

  if (!res.ok) {
    const err = payload as {
      error?: { code?: string; message?: string; details?: { fields?: Record<string, string[]> } };
    };
    throw new ApiError(
      res.status,
      err?.error?.code ?? 'INTERNAL_ERROR',
      err?.error?.message ?? `Permintaan gagal (${res.status})`,
      err?.error?.details?.fields,
    );
  }

  const data = (payload as { data?: T } | null)?.data;
  return data as T;
}
