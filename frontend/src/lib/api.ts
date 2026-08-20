/**

 * API client T1.11a — fetch wrapper dengan:

 * - token access/refresh di localStorage (keputusan: SPA sederhana; T5 nanti bisa cookie httpOnly)

 * - silent refresh (1×) saat 401, lalu retry permintaan asli

 * - normalisasi error backend {code, message, details.fields} → ApiError
n *

 * Backend selalu merespons {success, data} atau {success:false, error:{code,message,details}}.

 */

import type {
  AdminKrsPending,
  UserListResponse,
  CreateUserInput,
  UserCreateLookup,
  UpdateRoleInput,
  PaginationParams,
  WaitingRoomStatus,
  MasterListResponse,
  MasterStudent,
  MasterLecturer,
  CreateMasterStudentInput,
  CreateMasterLecturerInput,
  UpdateMasterStudentInput,
  UpdateMasterLecturerInput,
  ImportResult,
  UpdateContactInput,
  ClassSchedule,
  ClaimableClass,
  ClaimableClassResponse,
  Faculty,
  Prodi,
  CreateFacultyInput,
  UpdateFacultyInput,
  CreateProdiInput,
  UpdateProdiInput,
  Announcement,
  AnnouncementsResponse,
  CreateAnnouncementInput,
  CourseSelectionForReview,
  CourseSelectionsForReviewResponse,
  StudentProfile,
  SemesterIps,
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

/**
 * T5.1 — Error jaringan (fetch gagal / timeout).
 * Pesan jelas untuk user, bukan "Failed to fetch" dari browser.
 */
export class NetworkError extends Error {
  constructor(message = 'Tidak dapat terhubung ke server. Periksa koneksi Anda, lalu coba lagi.') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** Batas waktu tiap request (ms) — cegah "loading terus" saat server lambat/hang (AC-08). */
const DEFAULT_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new NetworkError('Koneksi ke server terlalu lambat. Coba lagi.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
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
  return apiRequest<WaitingRoomStatus>(`/waiting-room/status?token=${encodeURIComponent(token)}`, {
    auth: false,
  });
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
        const res = await fetchWithTimeout(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: rt }),
        });
        if (!res.ok) {
          // refresh ditolak server → sesi benar-benar tidak valid → bersihkan
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
        // Error jaringan/timeout → JANGAN buang sesi (transien; refresh lain kali bisa sukses)
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
    return fetchWithTimeout(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  /**
   * T5.1 — retry 1× untuk kegagalan jaringan transien (fetch throw = koneksi/timeout,
   * bukan HTTP error). Mencegah gagal login/request hanya karena koneksi kedip (AC-08).
   */
  const doFetchWithRetry = async (): Promise<Response> => {
    try {
      return await doFetch();
    } catch (err) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        return await doFetch();
      } catch {
        throw err instanceof NetworkError ? err : new NetworkError();
      }
    }
  };

  let res = await doFetchWithRetry();

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

/** GET /users/lookup — preview auto-fill form Buat User (NIM/NIK → data master). */
export async function lookupUserForCreate(
  role: 'mahasiswa' | 'dosen',
  identifier: string,
): Promise<UserCreateLookup> {
  const q = `role=${encodeURIComponent(role)}&identifier=${encodeURIComponent(identifier)}`;
  return apiRequest<UserCreateLookup>(`/users/lookup?${q}`);
}

/** POST /users — buat user baru (perm user.manage, admin_sistem). */
export async function createUser(input: CreateUserInput): Promise<{
  id: number;
  email: string;
  fullName: string;
  isWali: boolean;
  createdAt: string;
  message?: string;
  nim?: string | null;
  nik?: string | null;
  prodiName?: string;
}> {
  const raw = await apiRequest<
    CreatedUser & { message?: string; nim?: string | null; nik?: string | null; prodiName?: string }
  >('/users', { method: 'POST', body: input });
  return {
    id: Number(raw.id),
    email: raw.email,
    fullName: raw.full_name,
    isWali: raw.is_wali,
    createdAt: raw.created_at,
    message: raw.message,
    nim: raw.nim,
    nik: raw.nik,
    prodiName: raw.prodiName,
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

/** DELETE /users/:id — nonaktifkan user (perm user.manage, admin_sistem; keluhan lama). */
export async function deleteUser(id: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/users/${id}`, { method: 'DELETE' });
}

/* ==== T2.6 — Finance API ==== */

import type {
  PaymentsResponse,
  Payment,
  MyPayment,
  KrsAccessResult,
  UpdatePaymentInput,
  SemesterOption,
  StudentPaymentGroup,
} from './types';

/** GET /finance/payments — list tagihan (admin keuangan/sistem). */
export async function getFinancePayments(params?: {
  semester_id?: number;
  status?: string;
  student_id?: number;
  prodi_id?: number;
  page?: number;
  limit?: number;
}): Promise<PaymentsResponse> {
  const search = new URLSearchParams();
  if (params?.semester_id) search.set('semester_id', String(params.semester_id));
  if (params?.status) search.set('status', params.status);
  if (params?.student_id) search.set('student_id', String(params.student_id));
  if (params?.prodi_id) search.set('prodi_id', String(params.prodi_id));
  if (params?.page) search.set('page', String(params.page));
  if (params?.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  const response = await apiRequest<{
    items: Record<string, unknown>[];
    pagination: PaymentsResponse['pagination'];
  }>(`/finance/payments${qs ? `?${qs}` : ''}`);
  return {
    items: response.items.map(normalizePayment),
    pagination: response.pagination,
  };
}

/** GET /finance/payments/:id — detail tagihan. */
export async function getFinancePayment(id: number): Promise<Payment> {
  const response = await apiRequest<Record<string, unknown>>(`/finance/payments/${id}`);
  return normalizePayment(response);
}

/** GET /finance/semesters — daftar semester utk dropdown filter tagihan (admin keuangan). */
export async function getFinanceSemesters(): Promise<SemesterOption[]> {
  return apiRequest<SemesterOption[]>('/finance/semesters');
}

/** POST /finance/payments/:id/update — update status bayar (admin keuangan). */
export async function updateFinancePayment(
  id: number,
  input: UpdatePaymentInput,
): Promise<{ id: number; total_amount: number; paid_amount: number; status: string }> {
  // Kirim dalam snake_case karena backend expects paid_amount, proof_url
  const body: Record<string, unknown> = {
    paid_amount: input.paidAmount,
  };
  if (input.proofUrl !== undefined) {
    body.proof_url = input.proofUrl;
  }
  return apiRequest(`/finance/payments/${id}/update`, {
    method: 'POST',
    body,
  });
}

/** POST /finance/generate — trigger generate tagihan untuk semester (admin keuangan). */
export async function generateFinancePayments(semester_id: number): Promise<{ message: string }> {
  return apiRequest('/finance/generate', {
    method: 'POST',
    body: { semester_id },
  });
}

/** GET /classes?curriculum_id=N — daftar kelas aktif dalam satu kurikulum. */
export async function getAcademicClasses(curriculumId: number): Promise<{
  items: Array<{
    id: number;
    class_code: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    room: string;
    capacity: number;
    current_enrolled: number;
    is_active: boolean;
  }>;
}> {
  return apiRequest<{
    items: Array<{
      id: number;
      class_code: string;
      day_of_week: number;
      start_time: string;
      end_time: string;
      room: string;
      capacity: number;
      current_enrolled: number;
      is_active: boolean;
    }>;
  }>(`/classes?curriculum_id=${curriculumId}`);
}

/** GET /curricula — daftar kurikulum (filter prodi, semester). */
export async function getAcademicCurricula(params?: {
  prodiId?: number;
  semesterId?: number;
}): Promise<{
  items: Array<{
    id: number;
    course_code: string;
    course_name: string;
    credits: number;
    semester_number: number;
    prodi_name: string;
    semester_id: number;
  }>;
}> {
  const search = new URLSearchParams();
  if (params?.prodiId) search.set('prodi_id', String(params.prodiId));
  if (params?.semesterId) search.set('semester_id', String(params.semesterId));
  const qs = search.toString();
  return apiRequest<{
    items: Array<{
      id: number;
      course_code: string;
      course_name: string;
      credits: number;
      semester_number: number;
      prodi_name: string;
      semester_id: number;
    }>;
  }>(`/curricula${qs ? `?${qs}` : ''}`);
}

/** GET /finance/payments/grouped — payments grouped by NIM (admin). */
export async function getFinancePaymentsGrouped(params?: {
  search?: string;
  prodi_id?: number;
  page?: number;
  limit?: number;
}): Promise<{
  items: StudentPaymentGroup[];
  pagination: PaymentsResponse['pagination'];
}> {
  const search = new URLSearchParams();
  if (params?.search) search.set('search', params.search);
  if (params?.prodi_id) search.set('prodi_id', String(params.prodi_id));
  if (params?.page) search.set('page', String(params.page));
  if (params?.limit) search.set('limit', String(params.limit));
  const qs = search.toString();
  const res = await apiRequest<{
    items: Record<string, unknown>[];
    pagination: PaymentsResponse['pagination'];
  }>(`/finance/payments/grouped${qs ? `?${qs}` : ''}`);
  return {
    items: res.items.map((r) => ({
      studentId: Number(r.studentId),
      nim: String(r.nim),
      fullName: String(r.fullName),
      prodiId: Number(r.prodiId),
      prodiName: String(r.prodiName),
      totalSemesters: Number(r.totalSemesters),
      totalPaid: Number(r.totalPaid),
      totalTagihan: Number(r.totalTagihan),
      allLunas: Boolean(r.allLunas),
    })),
    pagination: res.pagination,
  };
}

/** GET /finance/payments/student/:studentId — all payments for a student. */
export async function getStudentPayments(studentId: number): Promise<Payment[]> {
  const res = await apiRequest<Record<string, unknown>[]>(`/finance/payments/student/${studentId}`);
  return res.map(normalizePayment);
}

/** GET /finance/my-payment — mahasiswa lihat tagihan sendiri. */
function normalizePayment(r: Record<string, unknown>): MyPayment {
  return {
    id: Number(r.id),
    studentId: Number(r.student_id),
    nim: r.nim ? String(r.nim) : '',
    fullName: r.full_name ? String(r.full_name) : '',
    prodiId: r.prodi_id ? Number(r.prodi_id) : 0,
    prodiName: r.prodi_name ? String(r.prodi_name) : '',
    semesterId: Number(r.semester_id),
    semesterCode: String(r.semester_code ?? ''),
    semesterName: String(r.semester_name ?? ''),
    totalAmount: Number(r.total_amount),
    paidAmount: Number(r.paid_amount),
    status: String(r.status) as MyPayment['status'],
    dueDate: String(r.due_date),
    isWaived: Boolean(r.is_waived),
    waivedReason: r.waived_reason ? String(r.waived_reason) : null,
    proofUrl: r.proof_url ? String(r.proof_url) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    items: Array.isArray(r.items)
      ? (r.items as Record<string, unknown>[]).map((it) => ({
          id: it.id ? Number(it.id) : undefined,
          type: String(it.type),
          description: String(it.description),
          amount: Number(it.amount),
          isMandatory: Boolean(it.is_mandatory),
        }))
      : [],
  };
}

export async function getMyPayments(semester_id?: number): Promise<MyPayment[]> {
  const qs = semester_id ? `?semester_id=${semester_id}` : '';
  const rows = await apiRequest<Record<string, unknown>[]>(`/finance/my-payment${qs}`);
  return rows.map(normalizePayment);
}

/** GET /finance/krs-access — cek apakah mahasiswa bisa akses KRS (sudah lunas). */
export async function getKrsAccess(semester_id: number): Promise<KrsAccessResult> {
  const raw = await apiRequest<{
    can_access: boolean;
    payment: {
      status: string;
      total_amount: number;
      paid_amount: number;
      due_date: string;
    } | null;
  }>(`/finance/krs-access?semester_id=${semester_id}`);
  return {
    canAccess: Boolean(raw.can_access),
    payment: raw.payment
      ? {
          status: String(raw.payment.status) as KrsAccessResult['payment'] extends infer P
            ? P extends { status: infer S }
              ? S
              : never
            : never,
          totalAmount: Number(raw.payment.total_amount),
          paidAmount: Number(raw.payment.paid_amount),
          dueDate: String(raw.payment.due_date),
        }
      : null,
  };
}

/* ==== T2.4 — Transkrip PDF ==== */

/** GET /transcript/my/download — unduh PDF transkrip (blob + trigger download). */
export async function downloadTranscriptPdf(academicYearId?: number): Promise<void> {
  const token = getAccessToken();
  if (!token) return;
  const qs = academicYearId ? `?academicYearId=${academicYearId}` : '';
  let res = await fetch(`${API_BASE}/transcript/my/download${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (!refreshed) return;
    res = await fetch(`${API_BASE}/transcript/my/download${qs}`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
  }
  if (!res.ok) {
    // Keluhan lama: "download PDF belum berhasil" — FE dulu menelan error diam-diam (return).
    throw await downloadError(res, 'Gagal mengunduh transkrip');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transkrip-${new Date().toISOString().slice(0, 10)}${academicYearId ? `-${academicYearId}` : ''}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Baca pesan error dari respons download (body JSON {success:false, error:{message}}). */
async function downloadError(res: Response, fallback: string): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { message?: string; code?: string } };
    if (body?.error?.message) {
      return new ApiError(res.status, body.error.code ?? 'DOWNLOAD_FAILED', body.error.message);
    }
  } catch {
    /* body bukan JSON — pakai fallback */
  }
  return new ApiError(res.status, 'DOWNLOAD_FAILED', fallback);
}

/* ==== T1.5 + keluhan lama — KRS PDF ==== */

/** GET /krs/my/download — unduh PDF KRS (blob + trigger download; status approved). */
export async function downloadKrsPdf(): Promise<void> {
  const token = getAccessToken();
  if (!token) return;
  let res = await fetch(`${API_BASE}/krs/my/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (!refreshed) return;
    res = await fetch(`${API_BASE}/krs/my/download`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
  }
  if (!res.ok) {
    throw await downloadError(res, 'Gagal mengunduh PDF KRS');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `krs-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ==== T2.5 — Notifikasi ==== */

import type { NotificationsResponse } from '../lib/types';

/** GET /notifications/my — daftar notifikasi user sendiri. Optional pagination (?page=1&limit=5). */
export async function getMyNotifications(page = 1, limit = 5): Promise<NotificationsResponse> {
  const qs = `?page=${page}&limit=${limit}`;
  const data = await apiRequest<NotificationsResponse>(`/notifications/my${qs}`);
  return data;
}

/** PUT /notifications/:id/read — tandai notifikasi sebagai dibaca. */
export async function markNotificationRead(id: number): Promise<void> {
  await apiRequest<{ id: number; isRead: boolean }>(`/notifications/${id}/read`, {
    method: 'PUT',
  });
}

/** PUT /notifications/read-all — tandai SEMUA notifikasi sendiri sebagai dibaca. */
export async function markAllNotificationsRead(): Promise<number> {
  const data = await apiRequest<{ marked: number }>('/notifications/read-all', {
    method: 'PUT',
  });
  return data.marked;
}

/* ==== Announcements (Informasi Penting) ==== */

export async function getAnnouncements(page = 1, limit = 20): Promise<AnnouncementsResponse> {
  const qs = `?page=${page}&limit=${limit}`;
  const data = await apiRequest<AnnouncementsResponse>(`/announcements${qs}`);
  return data;
}

export async function getAnnouncement(id: number): Promise<Announcement> {
  const data = await apiRequest<Announcement>(`/announcements/${id}`);
  return data;
}

export async function createAnnouncement(input: CreateAnnouncementInput): Promise<Announcement> {
  const data = await apiRequest<Announcement>('/announcements', {
    method: 'POST',
    body: input,
  });
  return data;
}

export async function updateAnnouncement(
  id: number,
  input: Partial<CreateAnnouncementInput>,
): Promise<Announcement> {
  const data = await apiRequest<Announcement>(`/announcements/${id}`, {
    method: 'PUT',
    body: input,
  });
  return data;
}

export async function deleteAnnouncement(id: number): Promise<{ message: string }> {
  const data = await apiRequest<{ message: string }>(`/announcements/${id}`, {
    method: 'DELETE',
  });
  return data;
}

/* ==== T3.8 — Dosen API (diselaraskan dengan kontrak backend nyata) ==== */

import type {
  MyClassesResponse,
  LecturersResponse,
  ScheduleAvailability,
  AttendanceSession,
  CreateAttendanceInput,
  AttendanceRecordsResponse,
  UpdateAttendanceRecordInput,
  Mentee,
  GuidanceSession,
  CreateGuidanceInput,
  SubstituteRequestResponse,
  CreateSubstituteInput,
  SubstituteRequest,
  GradesClassResponse,
  GradeInput,
} from './types';

import type {
  LecturerCourseAvailable,
  LecturerCourseAvailableResponse,
  CourseSelectionInput,
  CourseSelectionResult,
  MyCourseSelection,
  MyCourseSelectionsResponse,
  KrsPeriod,
} from './types';

/** GET /dosen/courses/available?semesterId= — daftar MK tersedia untuk dosen. */
function normalizeCourseAvailable(r: Record<string, unknown>): LecturerCourseAvailable {
  return {
    curriculum_id: Number(r.curriculum_id),
    course_code: String(r.course_code),
    course_name: String(r.course_name),
    credits: Number(r.credits),
    semester_number: Number(r.semester_number),
    is_mandatory: Boolean(r.is_mandatory),
    available_classes: Number(r.available_classes),
    selection_status: String(r.selection_status) as LecturerCourseAvailable['selection_status'],
    priority: r.priority !== null ? Number(r.priority) : null,
    notes: r.notes ? String(r.notes) : null,
  };
}

export async function getAvailableCourses(
  semesterId: number,
  search?: string,
): Promise<LecturerCourseAvailableResponse> {
  const qs = search ? `&search=${encodeURIComponent(search)}` : '';
  const res = await apiRequest<{ items: Array<Record<string, unknown>> }>(
    `/dosen/courses/available?semesterId=${semesterId}${qs}`,
  );
  return { items: res.items.map(normalizeCourseAvailable) };
}

/** POST /dosen/courses/select — ajukan/diperbarui pilihan MK. */
export async function submitCourseSelection(
  input: CourseSelectionInput,
): Promise<CourseSelectionResult> {
  return apiRequest<CourseSelectionResult>('/dosen/courses/select', {
    method: 'POST',
    body: input,
  });
}

/** GET /dosen/courses/my?semesterId= — pilihan MK dosen sendiri. */
function normalizeMyCourseSelection(r: Record<string, unknown>): MyCourseSelection {
  return {
    id: Number(r.id),
    curriculumId: Number(r.curriculum_id),
    courseCode: String(r.course_code),
    courseName: String(r.course_name),
    credits: Number(r.credits),
    semesterNumber: Number(r.semester_number),
    isMandatory: Boolean(r.is_mandatory),
    semesterCode: String(r.semester_code),
    semesterName: String(r.semester_name),
    prodiName: String(r.prodi_name),
    status: String(r.status),
    priority: Number(r.priority),
    notes: r.notes ? String(r.notes) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export async function getMyCourseSelections(
  semesterId?: number,
): Promise<MyCourseSelectionsResponse> {
  const qs = semesterId ? `?semesterId=${semesterId}` : '';
  const res = await apiRequest<{ items: Array<Record<string, unknown>> }>(`/dosen/courses/my${qs}`);
  return { items: res.items.map(normalizeMyCourseSelection) };
}

/** GET /krs/period — periode KRS aktif (dipakai Pilih MK untuk default semester). */
export async function getKrsPeriod(): Promise<KrsPeriod> {
  return apiRequest<KrsPeriod>('/krs/period');
}

/** GET /dosen/semesters — daftar semester aktif untuk dropdown Pilih MK (T3.9). */
export async function getDosenSemesters(): Promise<SemesterOption[]> {
  const res = await apiRequest<{ items: Record<string, unknown>[] }>('/dosen/semesters');
  return res.items.map((r) => ({
    id: Number(r.id),
    code: String(r.code),
    name: String(r.name),
    isActive: Boolean(r.is_active),
  }));
}

/** GET /dosen/my-classes — kelas yang diampu dosen + jadwal pertemuan (T3.8). */
export async function getMyClasses(): Promise<MyClassesResponse> {
  return apiRequest<MyClassesResponse>('/dosen/my-classes');
}

/** GET /dosen/lecturers — daftar dosen aktif untuk substitute teaching (T3.8). */
export async function getLecturers(): Promise<LecturersResponse> {
  return apiRequest<LecturersResponse>('/dosen/lecturers');
}

/** GET /dosen/available-classes — kelas belum diklaim (lecturer_id NULL) di prodi dosen (T3.9). */
export async function getDosenAvailableClasses(): Promise<ClaimableClassResponse> {
  const res = await apiRequest<{ items: Record<string, unknown>[] }>('/dosen/available-classes');
  return { items: res.items.map(normalizeClaimableClass) };
}

/* ==== #?? Admin Akademik: Persetujuan MK Dosen ==== */

function normalizeCourseSelectionForReview(r: Record<string, unknown>): CourseSelectionForReview {
  return {
    id: Number(r.id),
    lecturerId: Number(r.lecturer_id),
    lecturerName: String(r.lecturer_name),
    nidn: String(r.nidn),
    nik: String(r.nik ?? ''),
    curriculumId: Number(r.curriculum_id),
    courseCode: String(r.course_code),
    courseName: String(r.course_name),
    credits: Number(r.credits),
    semesterNumber: Number(r.semester_number),
    isMandatory: Boolean(r.is_mandatory),
    semesterCode: String(r.semester_code),
    semesterName: String(r.semester_name),
    prodiName: String(r.prodi_name),
    status: String(r.status) as 'belum_diajukan' | 'diajukan' | 'diterima' | 'ditolak',
    priority: Number(r.priority),
    notes: r.notes == null ? null : String(r.notes),
    reviewedBy: r.reviewed_by == null ? null : String(r.reviewed_by),
    reviewedAt: r.reviewed_at == null ? null : String(r.reviewed_at),
    reviewedByName: r.reviewed_by_name == null ? null : String(r.reviewed_by_name),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export async function getCourseSelectionsForReview(params?: {
  semesterId?: number;
  prodiId?: number;
  status?: 'belum_diajukan' | 'diajukan' | 'diterima' | 'ditolak';
  page?: number;
  limit?: number;
}): Promise<CourseSelectionsForReviewResponse> {
  const qs = new URLSearchParams();
  if (params?.semesterId) qs.set('semesterId', String(params.semesterId));
  if (params?.prodiId) qs.set('prodiId', String(params.prodiId));
  if (params?.status) qs.set('status', params.status);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await apiRequest<{
    items: Record<string, unknown>[];
    pagination: { page: number; limit: number; total: number };
  }>(`/dosen/courses/all${suffix}`);
  return {
    items: res.items.map(normalizeCourseSelectionForReview),
    pagination: res.pagination,
  };
}

export interface ReviewCourseSelectionInput {
  status: 'diterima' | 'ditolak';
  reviewNotes?: string;
}

export async function reviewCourseSelection(
  id: number,
  input: ReviewCourseSelectionInput,
): Promise<CourseSelectionForReview> {
  return apiRequest<CourseSelectionForReview>(`/dosen/courses/${id}/review`, {
    method: 'PUT',
    body: input,
  });
}

/** POST /dosen/claim-class — dosen klaim kelas (set lecturer_id) (T3.9, F-21). */
export async function claimClass(classId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>('/dosen/claim-class', {
    method: 'POST',
    body: { classId },
  });
}

/** DELETE /dosen/claim-class/:classId — dosen batalkan klaim (T3.9, F-21). */
export async function unclaimClass(classId: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/dosen/claim-class/${classId}`, {
    method: 'DELETE',
  });
}

/** GET /schedule/availability?date=YYYY-MM-DD — jadwal mengajar + slot kosong dosen (T3.8). */
export async function getScheduleAvailability(date: string): Promise<ScheduleAvailability> {
  return apiRequest<ScheduleAvailability>(
    `/schedule/availability?date=${encodeURIComponent(date)}`,
  );
}

/** GET /schedule/class/:classId — jadwal pertemuan untuk satu kelas (admin akademik/sistem). */
export async function getScheduleClass(
  classId: number,
): Promise<{ class: unknown; schedules: ClassSchedule[] }> {
  const res = await apiRequest<{ class: unknown; schedules: Record<string, unknown>[] }>(
    `/schedule/class/${classId}`,
  );
  return { class: res.class, schedules: res.schedules.map(normalizeClassSchedule) };
}

/** Normalisasi baris jadwal kelas (snake_case → camelCase) agar cocok tipe ClassSchedule. */
function normalizeClassSchedule(r: Record<string, unknown>): ClassSchedule {
  return {
    id: Number(r.id),
    meetingNumber: Number(r.meeting_number),
    scheduledDate: String(r.scheduled_date ?? ''),
    topic: r.topic == null ? null : String(r.topic),
    isCompleted: Boolean(r.is_completed),
  };
}

function normalizeClaimableClass(r: Record<string, unknown>): ClaimableClass {
  return {
    id: Number(r.id),
    classCode: String(r.class_code ?? ''),
    dayOfWeek: r.day_of_week == null ? null : Number(r.day_of_week),
    startTime: r.start_time == null ? null : String(r.start_time),
    endTime: r.end_time == null ? null : String(r.end_time),
    room: r.room == null ? null : String(r.room),
    capacity: Number(r.capacity ?? 0),
    currentEnrolled: Number(r.current_enrolled ?? 0),
    curriculumId: Number(r.curriculum_id),
    semesterId: Number(r.semester_id),
    semesterNumber: Number(r.semester_number),
    courseCode: String(r.course_code ?? ''),
    courseName: String(r.course_name ?? ''),
    credits: Number(r.credits ?? 0),
    semesterCode: String(r.semester_code ?? ''),
    semesterName: String(r.semester_name ?? ''),
    schedules: ((r.schedules as Record<string, unknown>[]) ?? []).map(normalizeClassSchedule),
  };
}

/** POST /schedule — buat jadwal (admin akademik/sistem). */
export async function createSchedule(input: {
  classId: number;
  meetingNumber: number;
  scheduledDate: string;
  topic?: string;
}): Promise<ClassSchedule> {
  const res = await apiRequest<Record<string, unknown>>('/schedule', {
    method: 'POST',
    body: input,
  });
  return normalizeClassSchedule(res);
}

/** PUT /schedule/:id — update jadwal (admin akademik/sistem). */
export async function updateSchedule(
  id: number,
  input: {
    meetingNumber?: number;
    scheduledDate?: string;
    topic?: string;
    isCompleted?: boolean;
  },
): Promise<ClassSchedule> {
  const res = await apiRequest<Record<string, unknown>>(`/schedule/${id}`, {
    method: 'PUT',
    body: input,
  });
  return normalizeClassSchedule(res);
}

/** DELETE /schedule/:id — hapus jadwal (admin akademik/sistem). */
export async function deleteSchedule(id: number): Promise<{ id: number; deleted: boolean }> {
  return apiRequest<{ id: number; deleted: boolean }>(`/schedule/${id}`, { method: 'DELETE' });
}

/* --- Absensi (semua path /attendance/sessions, snake_case → camelCase) --- */

interface AttendanceSessionRow {
  id: number;
  schedule_id: number;
  session_date: string;
  topic: string | null;
  is_open: boolean;
  class_code: string;
  course_code: string;
  course_name: string;
  meeting_number: number;
  total_records: number;
  hadir_count: number;
}

function normalizeAttendanceSession(r: AttendanceSessionRow): AttendanceSession {
  return {
    id: Number(r.id),
    scheduleId: Number(r.schedule_id),
    sessionDate: r.session_date,
    topic: r.topic,
    isOpen: r.is_open,
    classCode: r.class_code,
    courseCode: r.course_code,
    courseName: r.course_name,
    meetingNumber: Number(r.meeting_number),
    totalRecords: Number(r.total_records),
    hadirCount: Number(r.hadir_count),
  };
}

/** GET /attendance/sessions — sesi absensi dosen (ownership otomatis; ?schedule_id= opsional). */
export async function getAttendanceSessions(scheduleId?: number): Promise<AttendanceSession[]> {
  const qs = scheduleId ? `?schedule_id=${scheduleId}&limit=100` : '?limit=100';
  const rows = await apiRequest<AttendanceSessionRow[]>(`/attendance/sessions${qs}`);
  return rows.map(normalizeAttendanceSession);
}

/** POST /attendance/sessions — buat sesi absensi dari jadwal pertemuan. */
export async function createAttendanceSession(
  input: CreateAttendanceInput,
): Promise<{ id: number; scheduleId: number; topic: string | null }> {
  return apiRequest('/attendance/sessions', { method: 'POST', body: input });
}

/** PUT /attendance/sessions/:id/open|close — buka/tutup sesi absensi (dosen, owner). */
export async function setAttendanceSessionOpen(
  sessionId: number,
  open: boolean,
): Promise<{ id: number }> {
  return apiRequest(`/attendance/sessions/${sessionId}/${open ? 'open' : 'close'}`, {
    method: 'PUT',
  });
}

/** GET /attendance/sessions/:id/records — daftar mahasiswa + status absensi sesi. */
export async function getAttendanceRecords(sessionId: number): Promise<AttendanceRecordsResponse> {
  const raw = await apiRequest<{
    session: {
      id: number;
      session_date: string;
      topic: string | null;
      is_open: boolean;
      qr_code: string | null;
    };
    records: Array<{
      student_id: number;
      nim: string;
      full_name: string;
      email: string;
      record_id: number | null;
      status: string;
      marked_at: string | null;
      marked_by: number | null;
    }>;
  }>(`/attendance/sessions/${sessionId}/records`);

  return {
    session: {
      id: Number(raw.session.id),
      sessionDate: raw.session.session_date,
      topic: raw.session.topic,
      isOpen: raw.session.is_open,
      qrCode: raw.session.qr_code,
    },
    records: raw.records.map((r) => ({
      studentId: Number(r.student_id),
      nim: r.nim,
      fullName: r.full_name,
      email: r.email,
      recordId: r.record_id !== null ? Number(r.record_id) : null,
      status: (r.status ?? 'belum_absen') as AttendanceRecordsResponse['records'][number]['status'],
      markedAt: r.marked_at,
      markedBy: r.marked_by !== null ? Number(r.marked_by) : null,
    })),
  };
}

/** PUT /attendance/records/:id — ubah status absensi mahasiswa. */
export async function updateAttendanceRecord(
  recordId: number,
  input: UpdateAttendanceRecordInput,
): Promise<{ id: number }> {
  return apiRequest(`/attendance/records/${recordId}`, { method: 'PUT', body: input });
}

/** POST /attendance/check-in — mahasiswa self check-in (via sessionId atau qrCode). */
export async function checkInAttendance(input: {
  sessionId?: number;
  qrCode?: string;
}): Promise<{ id: number; message: string }> {
  return apiRequest('/attendance/check-in', { method: 'POST', body: input });
}

/* --- Skripsi (thesis proposals) --- */

import type {
  SkripsiProposal,
  SkripsiProposalStatus,
  SkripsiStatus,
  SkripsiSupervisor,
} from './types';

/** GET /skripsi/supervisors — list dosen pembimbing per prodi mahasiswa. */
export async function getSkripsiSupervisors() {
  return apiRequest<SkripsiSupervisor[]>('/skripsi/supervisors');
}

/** POST /skripsi/proposals — mahasiswa submit proposal skripsi. */
export async function submitSkripsiProposal(input: {
  title: string;
  proposalFile?: string;
  supervisorIds: number[];
}) {
  return apiRequest('/skripsi/proposals', { method: 'POST', body: input });
}

/** GET /skripsi/proposals — list proposals (mahasiswa=own, dosen=supervised, admin=all). */
export async function getSkripsiProposals() {
  return apiRequest<SkripsiProposal[]>('/skripsi/proposals?limit=100');
}

/** PUT /skripsi/proposals/:id — dosen/admin update status. */
export async function updateSkripsiProposal(
  proposalId: number,
  input: { status: SkripsiStatus; statusNotes?: string },
) {
  return apiRequest(`/skripsi/proposals/${proposalId}`, { method: 'PUT', body: input });
}

/** GET /skripsi/proposals/:id/statuses — status history. */
export async function getSkripsiProposalStatuses(proposalId: number) {
  return apiRequest<SkripsiProposalStatus[]>(`/skripsi/proposals/${proposalId}/statuses`);
}

/* --- Bimbingan (GET /guidance/mentees, GET/POST /guidance/sessions) --- */

interface GuidanceSessionRow {
  id: number;
  student_id: number;
  nim: string;
  student_name: string;
  student_email: string;
  prodi_code: string;
  lecturer_id: number;
  lecturer_name: string;
  session_date: string;
  notes: string | null;
  progress: 'berjalan' | 'selesai' | 'bermasalah';
  is_visible_to_student: boolean;
  created_at: string;
  updated_at: string;
}

function normalizeGuidanceSession(r: GuidanceSessionRow): GuidanceSession {
  return {
    id: Number(r.id),
    studentId: Number(r.student_id),
    nim: r.nim,
    studentName: r.student_name,
    studentEmail: r.student_email,
    prodiCode: r.prodi_code,
    lecturerId: Number(r.lecturer_id),
    lecturerName: r.lecturer_name,
    sessionDate: r.session_date,
    notes: r.notes,
    progress: r.progress,
    isVisibleToStudent: r.is_visible_to_student,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** GET /guidance/mentees — mahasiswa binaan dosen wali (ownership otomatis). Search via ?search= (NIM/nama/email). */
export async function getMentees(search?: string): Promise<Mentee[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  const rows = await apiRequest<
    Array<{
      student_id: number;
      nim: string;
      student_name: string;
      email: string;
      status: string;
      prodi_code: string;
    }>
  >(`/guidance/mentees${qs}`);
  return rows.map((r) => ({
    studentId: Number(r.student_id),
    nim: r.nim,
    studentName: r.student_name,
    email: r.email,
    status: r.status,
    prodiCode: r.prodi_code,
  }));
}

/** GET /guidance/sessions?student_id= — catatan bimbingan dosen (semua binaan). */
export async function getGuidanceSessions(studentId?: number): Promise<GuidanceSession[]> {
  const qs = studentId ? `?student_id=${studentId}` : '';
  const rows = await apiRequest<GuidanceSessionRow[]>(`/guidance/sessions${qs}`);
  return rows.map(normalizeGuidanceSession);
}

/** POST /guidance/sessions — buat catatan bimbingan baru. */
export async function createGuidance(input: CreateGuidanceInput): Promise<GuidanceSession> {
  const row = await apiRequest<GuidanceSessionRow>('/guidance/sessions', {
    method: 'POST',
    body: input,
  });
  return normalizeGuidanceSession(row);
}

/* --- Substitute teaching (GET/POST /substitute, PUT /substitute/:id/cancel) --- */

interface SubstituteRow {
  id: number;
  original_lecturer_id: number;
  original_lecturer_name: string;
  substitute_lecturer_id: number | null;
  substitute_lecturer_name: string | null;
  class_id: number;
  class_name: string;
  schedule_id: number;
  meeting_number: number;
  scheduled_date: string;
  topic: string | null;
  course_code: string;
  course_name: string;
  reason: string | null;
  status: 'active' | 'cancelled';
  requested_by_name: string;
  approved_by_name: string | null;
  created_at: string;
}

function normalizeSubstitute(r: SubstituteRow): SubstituteRequest {
  return {
    id: Number(r.id),
    originalLecturerId: Number(r.original_lecturer_id),
    originalLecturerName: r.original_lecturer_name,
    substituteLecturerId:
      r.substitute_lecturer_id !== null ? Number(r.substitute_lecturer_id) : null,
    substituteLecturerName: r.substitute_lecturer_name,
    classId: Number(r.class_id),
    classCode: r.class_name,
    scheduleId: Number(r.schedule_id),
    meetingNumber: Number(r.meeting_number),
    scheduledDate: r.scheduled_date,
    topic: r.topic,
    courseCode: r.course_code,
    courseName: r.course_name,
    reason: r.reason,
    status: r.status,
    requestedByName: r.requested_by_name,
    approvedByName: r.approved_by_name,
    createdAt: r.created_at,
  };
}

/** GET /substitute?limit=100 — daftar substitute (ownership otomatis: original ATAU pengganti). */
export async function getSubstituteRequests(): Promise<SubstituteRequestResponse> {
  const res = await apiRequest<{ items: SubstituteRow[] }>('/substitute?limit=100');
  return { items: res.items.map(normalizeSubstitute) };
}

/** POST /substitute — ajukan substitute teaching (langsung aktif). */
export async function createSubstitute(input: CreateSubstituteInput): Promise<SubstituteRequest> {
  const row = await apiRequest<SubstituteRow>('/substitute', { method: 'POST', body: input });
  return normalizeSubstitute(row);
}

/** PUT /substitute/:id/cancel — batalkan substitute (owner/admin). */
export async function cancelSubstitute(id: number, reason?: string): Promise<SubstituteRequest> {
  const row = await apiRequest<SubstituteRow>(`/substitute/${id}/cancel`, {
    method: 'PUT',
    body: reason ? { reason } : {},
  });
  return normalizeSubstitute(row);
}

/* --- Nilai per kelas (GET /grades/class/:classId, POST /grades, PUT /grades/:id) --- */

/** GET /grades/class/:classId — daftar nilai mahasiswa di kelas (ownership otomatis). */
export async function getGradesByClass(classId: number): Promise<GradesClassResponse> {
  return apiRequest<GradesClassResponse>(`/grades/class/${classId}`);
}

/** POST /grades — input nilai baru (krsItemId + skor komponen). */
export async function submitGrades(input: GradeInput): Promise<{ id: number }> {
  return apiRequest<{ id: number }>('/grades', { method: 'POST', body: input });
}

/** PUT /grades/:id — edit nilai. */
export async function updateGrade(id: number, input: GradeInput): Promise<{ id: number }> {
  return apiRequest<{ id: number }>(`/grades/${id}`, { method: 'PUT', body: input });
}

/* ==== #16 Admin Master Data (perm user.manage) ==== */

/** GET /admin-master/students — list master mahasiswa (pagination + filter). */
export async function listMasterStudents(params: {
  page?: number;
  limit?: number;
  search?: string;
  prodi?: string;
}): Promise<MasterListResponse<MasterStudent>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.prodi) qs.set('prodi', params.prodi);
  const q = qs.toString();
  return apiRequest<MasterListResponse<MasterStudent>>(`/admin-master/students${q ? `?${q}` : ''}`);
}

/** GET /admin-master/lecturers — list master dosen (pagination + filter). */
export async function listMasterLecturers(params: {
  page?: number;
  limit?: number;
  search?: string;
  prodi?: string;
}): Promise<MasterListResponse<MasterLecturer>> {
  const qs = new URLSearchParams();
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  if (params.prodi) qs.set('prodi', params.prodi);
  const q = qs.toString();
  return apiRequest<MasterListResponse<MasterLecturer>>(
    `/admin-master/lecturers${q ? `?${q}` : ''}`,
  );
}

/** POST /admin-master/students — buat mahasiswa manual (password default = NIM). */
export async function createMasterStudent(
  input: CreateMasterStudentInput,
): Promise<{ id: number; nim: string; message: string }> {
  return apiRequest<{ id: number; nim: string; message: string }>('/admin-master/students', {
    method: 'POST',
    body: input,
  });
}

/** POST /admin-master/lecturers — buat dosen manual (password default = NIDN). */
export async function createMasterLecturer(
  input: CreateMasterLecturerInput,
): Promise<{ id: number; nidn: string; message: string }> {
  return apiRequest<{ id: number; nidn: string; message: string }>('/admin-master/lecturers', {
    method: 'POST',
    body: input,
  });
}

/** PUT /admin-master/students/:id — update mahasiswa (nama/prodi/angkatan/email). */
export async function updateMasterStudent(
  id: number,
  input: UpdateMasterStudentInput,
): Promise<{ id: number; nim: string; message: string }> {
  return apiRequest<{ id: number; nim: string; message: string }>(`/admin-master/students/${id}`, {
    method: 'PUT',
    body: input,
  });
}

/** PUT /admin-master/lecturers/:id — update dosen (nama/prodi/email). */
export async function updateMasterLecturer(
  id: number,
  input: UpdateMasterLecturerInput,
): Promise<{ id: number; nidn: string; message: string }> {
  return apiRequest<{ id: number; nidn: string; message: string }>(
    `/admin-master/lecturers/${id}`,
    {
      method: 'PUT',
      body: input,
    },
  );
}

/* ==== #16 Admin Master Data — Fakultas & Prodi ==== */

export async function listFaculties(params?: {
  page?: number;
  limit?: number;
}): Promise<MasterListResponse<Faculty>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiRequest<MasterListResponse<Faculty>>(`/admin-master/faculties${suffix}`);
}

export async function createFaculty(input: CreateFacultyInput): Promise<Faculty> {
  return apiRequest<Faculty>('/admin-master/faculties', {
    method: 'POST',
    body: input,
  });
}

export async function updateFaculty(id: number, input: UpdateFacultyInput): Promise<Faculty> {
  return apiRequest<Faculty>(`/admin-master/faculties/${id}`, {
    method: 'PUT',
    body: input,
  });
}

export async function deleteFaculty(id: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/admin-master/faculties/${id}`, {
    method: 'DELETE',
  });
}

export async function listProdis(params?: {
  page?: number;
  limit?: number;
}): Promise<MasterListResponse<Prodi>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  // Use academic module's /prodis endpoint (requires academic.manage which admin_akademik has)
  // Note: academic module returns { items: [...] } without pagination
  const res = await apiRequest<{ items: Prodi[] }>(`/prodis${suffix}`);
  return {
    items: res.items,
    pagination: { page: 1, limit: res.items.length, total: res.items.length },
  };
}

export async function createProdi(input: CreateProdiInput): Promise<Prodi> {
  return apiRequest<Prodi>('/admin-master/prodis', {
    method: 'POST',
    body: input,
  });
}

export async function updateProdi(id: number, input: UpdateProdiInput): Promise<Prodi> {
  return apiRequest<Prodi>(`/admin-master/prodis/${id}`, {
    method: 'PUT',
    body: input,
  });
}

export async function deleteProdi(id: number): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/admin-master/prodis/${id}`, {
    method: 'DELETE',
  });
}

/** POST /import/students | /import/lecturers — upload CSV/XLSX (multipart). */
export async function importMasterCsv(
  kind: 'students' | 'lecturers',
  file: File,
): Promise<ImportResult> {
  const token = getAccessToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetchWithTimeout(`${API_BASE}/import/${kind}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (!refreshed) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Sesi berakhir. Silakan login kembali.');
    }
    const retry = await fetchWithTimeout(`${API_BASE}/import/${kind}`, {
      method: 'POST',
      headers: getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : undefined,
      body: form,
    });
    if (!retry.ok) {
      const payload = (await retry.json()) as { error?: { code?: string; message?: string } };
      throw new ApiError(
        retry.status,
        payload?.error?.code ?? 'IMPORT_FAILED',
        payload?.error?.message ?? `Import gagal (${retry.status})`,
      );
    }
    const retryBody = (await retry.json()) as { data?: ImportResult };
    return retryBody.data as ImportResult;
  }
  if (!res.ok) {
    const payload = (await res.json()) as { error?: { code?: string; message?: string } };
    throw new ApiError(
      res.status,
      payload?.error?.code ?? 'IMPORT_FAILED',
      payload?.error?.message ?? `Import gagal (${res.status})`,
    );
  }
  const body = (await res.json()) as { data?: ImportResult };
  return body.data as ImportResult;
}

/** PUT /users/me/contact — edit profil sendiri (keluhan #26: dropdown avatar → Edit Profil). */
export async function updateMyContact(
  input: UpdateContactInput,
): Promise<{ id: number; email: string; fullName: string; message: string }> {
  return apiRequest<{ id: number; email: string; fullName: string; message: string }>(
    '/users/me/contact',
    { method: 'PUT', body: input },
  );
}

/** GET /students/me — profil mahasiswa lengkap (untuk halaman Profile). */
export async function getMyStudentProfile(): Promise<StudentProfile> {
  return apiRequest<StudentProfile>('/students/me');
}

/** GET /students/me/ips — IP per semester untuk grafik. */
export async function getMySemesterIps(): Promise<SemesterIps[]> {
  return apiRequest<SemesterIps[]>('/students/me/ips');
}
