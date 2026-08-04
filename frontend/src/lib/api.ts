/**
 * API client T1.11a — fetch wrapper dengan:
 * - token access/refresh di localStorage (keputusan: SPA sederhana; T5 nanti bisa cookie httpOnly)
 * - silent refresh (1×) saat 401, lalu retry permintaan asli
 * - normalisasi error backend {code, message, details.fields} → ApiError
 *
 * Backend selalu merespons {success, data} atau {success:false, error:{code,message,details}}.
 */
import type {
  AdminKrsPending,
  UserListResponse,
  CreateUserInput,
  UpdateRoleInput,
  PaginationParams,
  WaitingRoomStatus,
} from './types';
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

/* ==== T1.13 — Waiting Room token (429 RATE_LIMITED) ==== */

/** Header respons backend saat gerbang waiting room menahan request (429). */
export const WR_TOKEN_HEADER = 'x-waiting-token';
/** Tempat token antrean disimpan — sessionStorage (hilang saat tab ditutup). */
export const WAITING_TOKEN_KEY = 'siak.waiting_token';

export function getWaitingToken(): string | null {
  return sessionStorage.getItem(WAITING_TOKEN_KEY);
}

export function clearWaitingToken(): void {
  sessionStorage.removeItem(WAITING_TOKEN_KEY);
}

/** Simpan token antrean + arahkan ke halaman tunggu (jika belum di sana). */
export function enterWaitingRoom(token: string): void {
  sessionStorage.setItem(WAITING_TOKEN_KEY, token);
  if (typeof window !== 'undefined' && window.location.pathname !== '/tunggu') {
    window.location.assign('/tunggu');
  }
}

/** GET /waiting-room/status — fallback polling (K-09); endpoint publik, tanpa token JWT. */
export async function getWaitingRoomStatus(token: string): Promise<WaitingRoomStatus> {
  return apiRequest<WaitingRoomStatus>(
    `/waiting-room/status?token=${encodeURIComponent(token)}`,
    { auth: false },
  );
}

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
    // T1.13: 429 dari gerbang waiting room → simpan token antrean + arahkan ke /tunggu.
    // (Tetap lempar ApiError agar pemanggil tahu request gagal; halaman tunggu
    // menangani navigasi masuk-ulang setelah slot bebas.)
    if (res.status === 429) {
      const waitingToken = res.headers.get(WR_TOKEN_HEADER);
      if (waitingToken) {
        enterWaitingRoom(waitingToken);
      }
    }
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

/* ==== T1.11c — Admin API ==== */

/** GET /krs/admin/pending — daftar KRS menunggu persetujuan (perm krs.approve). */
export async function getAdminPendingKrs(): Promise<AdminKrsPending> {
  return apiRequest<AdminKrsPending>('/krs/admin/pending');
}

/** POST /krs/admin/:id/approve — setujui KRS. */
export async function approveKrs(
  id: number,
): Promise<{ id: number; status: 'approved'; approvedBy: number }> {
  return apiRequest<{ id: number; status: 'approved'; approvedBy: number }>(
    `/krs/admin/${id}/approve`,
    {
      method: 'POST',
    },
  );
}

/** POST /krs/admin/:id/reject — tolak KRS + alasan. */
export async function rejectKrs(
  id: number,
  reason: string,
): Promise<{ id: number; status: 'rejected'; rejectionReason: string }> {
  return apiRequest<{ id: number; status: 'rejected'; rejectionReason: string }>(
    `/krs/admin/${id}/reject`,
    { method: 'POST', body: { reason } },
  );
}

/** GET /users — list pengguna (perm user.manage). Backend mengembalikan snake_case; dinormalisasi ke camelCase. */
export async function listUsers(params?: PaginationParams): Promise<UserListResponse> {
  const search = new URLSearchParams();
  if (params?.page) search.set('page', String(params.page));
  if (params?.limit) search.set('limit', String(params.limit));
  if (params?.role) search.set('role', params.role);
  if (params?.search) search.set('search', params.search);
  const qs = search.toString();
  const raw = await apiRequest<{
    items: Array<{
      id: number | string;
      email: string;
      full_name: string;
      is_wali: boolean;
      is_active: boolean;
      last_login_at: string | null;
      created_at: string;
      role_code: string;
      role_name: string;
    }>;
    pagination: { page: number; limit: number; total: number };
  }>(`/users${qs ? `?${qs}` : ''}`);
  return {
    items: raw.items.map((r) => ({
      id: Number(r.id),
      email: r.email,
      fullName: r.full_name,
      isWali: r.is_wali,
      isActive: r.is_active,
      lastLoginAt: r.last_login_at ?? null,
      createdAt: r.created_at,
      roleCode: r.role_code,
      roleName: r.role_name,
    })),
    pagination: raw.pagination,
  };
}

interface CreatedUser {
  id: number | string;
  email: string;
  full_name: string;
  is_wali: boolean;
  created_at: string;
}

/** POST /users — buat user baru (perm user.manage, admin_sistem). */
export async function createUser(
  input: CreateUserInput,
): Promise<{ id: number; email: string; fullName: string; isWali: boolean; createdAt: string }> {
  const raw = await apiRequest<CreatedUser>('/users', { method: 'POST', body: input });
  return {
    id: Number(raw.id),
    email: raw.email,
    fullName: raw.full_name,
    isWali: raw.is_wali,
    createdAt: raw.created_at,
  };
}

interface UpdatedRoleUser {
  id: number | string;
  email: string;
  full_name: string;
  is_wali: boolean;
  role: string;
}

/** PUT /users/:id/role — ubah role + is_wali (perm user.manage, admin_sistem). */
export async function updateUserRole(
  id: number,
  input: UpdateRoleInput,
): Promise<{ id: number; email: string; fullName: string; isWali: boolean; role: string }> {
  const raw = await apiRequest<UpdatedRoleUser>(`/users/${id}/role`, {
    method: 'PUT',
    body: input,
  });
  return {
    id: Number(raw.id),
    email: raw.email,
    fullName: raw.full_name,
    isWali: raw.is_wali,
    role: raw.role,
  };
}
