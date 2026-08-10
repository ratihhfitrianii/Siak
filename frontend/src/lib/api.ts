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
  AppNotification,
  NotificationsResponse,
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
  return apiRequest<PaymentsResponse>(`/finance/payments${qs ? `?${qs}` : ''}`);
}

/** GET /finance/payments/:id — detail tagihan. */
export async function getFinancePayment(id: number): Promise<Payment> {
  return apiRequest<Payment>(`/finance/payments/${id}`);
}

/** POST /finance/payments/:id/update — update status bayar (admin keuangan). */
export async function updateFinancePayment(
  id: number,
  input: UpdatePaymentInput,
): Promise<{ id: number; total_amount: number; paid_amount: number; status: string }> {
  return apiRequest(`/finance/payments/${id}/update`, {
    method: 'POST',
    body: input,
  });
}

/** POST /finance/generate — trigger generate tagihan untuk semester (admin keuangan). */
export async function generateFinancePayments(semester_id: number): Promise<{ message: string }> {
  return apiRequest('/finance/generate', {
    method: 'POST',
    body: { semester_id },
  });
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
  return apiRequest<KrsAccessResult>(`/finance/krs-access?semester_id=${semester_id}`);
}

/* ==== T2.4 — Transkrip PDF ==== */

/** GET /transcript/my/download — unduh PDF transkrip (blob + trigger download). */
export async function downloadTranscriptPdf(): Promise<void> {
  const token = getAccessToken();
  if (!token) return;
  let res = await fetch(`${API_BASE}/transcript/my/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (!refreshed) return;
    res = await fetch(`${API_BASE}/transcript/my/download`, {
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
  a.download = `transkrip-${new Date().toISOString().slice(0, 10)}.pdf`;
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

/** GET /notifications/my — daftar notifikasi user sendiri. */
export async function getMyNotifications(): Promise<AppNotification[]> {
  const data = await apiRequest<NotificationsResponse>('/notifications/my');
  return data.items;
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
    curriculumId: Number(r.curriculum_id),
    courseCode: String(r.course_code),
    courseName: String(r.course_name),
    credits: Number(r.credits),
    semesterNumber: Number(r.semester_number),
    isMandatory: Boolean(r.is_mandatory),
    availableClasses: Number(r.available_classes),
    selectionStatus: String(r.selection_status) as LecturerCourseAvailable['selectionStatus'],
    priority: r.priority !== null ? Number(r.priority) : null,
    notes: r.notes ? String(r.notes) : null,
  };
}

export async function getAvailableCourses(
  semesterId: number,
): Promise<LecturerCourseAvailableResponse> {
  const rows = await apiRequest<Record<string, unknown>[]>(
    `/dosen/courses/available?semesterId=${semesterId}`,
  );
  return { items: rows.map(normalizeCourseAvailable) };
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
  const rows = await apiRequest<Record<string, unknown>[]>(`/dosen/courses/my${qs}`);
  return { items: rows.map(normalizeMyCourseSelection) };
}

/** GET /krs/period — periode KRS aktif (dipakai Pilih MK untuk default semester). */
export async function getKrsPeriod(): Promise<KrsPeriod> {
  return apiRequest<KrsPeriod>('/krs/period');
}

/** GET /dosen/my-classes — kelas yang diampu dosen + jadwal pertemuan (T3.8). */
export async function getMyClasses(): Promise<MyClassesResponse> {
  return apiRequest<MyClassesResponse>('/dosen/my-classes');
}

/** GET /dosen/lecturers — daftar dosen aktif untuk substitute teaching (T3.8). */
export async function getLecturers(): Promise<LecturersResponse> {
  return apiRequest<LecturersResponse>('/dosen/lecturers');
}

/** GET /schedule/availability?date=YYYY-MM-DD — jadwal mengajar + slot kosong dosen (T3.8). */
export async function getScheduleAvailability(date: string): Promise<ScheduleAvailability> {
  return apiRequest<ScheduleAvailability>(
    `/schedule/availability?date=${encodeURIComponent(date)}`,
  );
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

/* --- Bimbingan (GET /guidance/mentees, GET/POST /guidance/sessions) --- */

interface GuidanceSessionRow {
  id: number;
  student_id: number;
  nim: string;
  student_name: string;
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

/** GET /guidance/mentees — mahasiswa binaan dosen wali (ownership otomatis). */
export async function getMentees(): Promise<Mentee[]> {
  const rows = await apiRequest<
    Array<{
      student_id: number;
      nim: string;
      student_name: string;
      email: string;
      status: string;
      prodi_code: string;
    }>
  >('/guidance/mentees');
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
  const rows = await apiRequest<SubstituteRow[]>('/substitute?limit=100');
  return { items: rows.map(normalizeSubstitute) };
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
